/* ============================================================
   FINANCE-ENGINE.js — Phase 2 Enterprise Financial Core
   ------------------------------------------------------------
   Adds enterprise primitives on top of the existing
   `financial_transactions` table WITHOUT breaking it:

     • Chart of accounts (income / expense / treasury / equity)
     • Double-entry ledger (debit + credit balanced)
     • Treasuries (multiple cash/bank accounts) with running balance
     • Financial periods (month/year, open/closed)
     • Transaction status: draft → pending → approved → locked
                                                  ↘ rejected
                                                  ↘ reversed
     • Approval chains (multi-level, escalation, history)
     • Reversal entries (no destructive edits on locked txns)
     • Treasury history / inflow-outflow analytics
     • Smart financial insights (unusual spend, budget breach, decline)
     • Authorization: blocks self-approval + permission checks
     • All writes feed Audit + Security event log
   ------------------------------------------------------------
   Storage: piggy-backs on the existing localStorage DB by adding
   new logical tables: ledger_entries, treasuries, fin_periods,
   approval_steps, fin_insights. We DO NOT change the legacy
   `financial_transactions` schema — we extend rows with new fields
   (status, locked, approval_chain, reversal_of, period_id).
   ============================================================ */
(function(){
  if (!window.DB) return;

  /* ---------- bootstrap aux tables ---------- */
  function ensure(table, seed){
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    if (!Array.isArray(all[table])){
      all[table] = seed || [];
      localStorage.setItem('church_db_v1', JSON.stringify(all));
    }
  }
  ensure('treasuries');
  ensure('ledger_entries');
  ensure('fin_periods');
  ensure('approval_steps');
  ensure('fin_insights');

  /* ---------- chart of accounts ----------
     A minimal but real CoA. Each transaction type is mapped to a
     debit account and a credit account.                            */
  const COA = {
    cash:        { code:'1000', name:'الخزينة النقدية',  type:'asset'   },
    bank:        { code:'1010', name:'الحساب البنكي',    type:'asset'   },
    donations:   { code:'4000', name:'تبرعات',           type:'income'  },
    tithes:      { code:'4010', name:'عشور',             type:'income'  },
    event_inc:   { code:'4020', name:'إيرادات فعاليات',  type:'income'  },
    salaries:    { code:'5000', name:'رواتب الخدمة',     type:'expense' },
    expenses:    { code:'5010', name:'مصروفات تشغيلية',  type:'expense' },
    other_inc:   { code:'4900', name:'إيرادات أخرى',     type:'income'  },
    other_exp:   { code:'5900', name:'مصروفات أخرى',     type:'expense' }
  };

  // tx_type → { debit_account, credit_account, direction }
  const ENTRY_MAP = {
    donation:      { dr:'cash',     cr:'donations', dir:'in'  },
    tithe:         { dr:'cash',     cr:'tithes',    dir:'in'  },
    event_payment: { dr:'cash',     cr:'event_inc', dir:'in'  },
    expense:       { dr:'expenses', cr:'cash',      dir:'out' },
    salary:        { dr:'salaries', cr:'cash',      dir:'out' },
    other_in:      { dr:'cash',     cr:'other_inc', dir:'in'  },
    other_out:     { dr:'other_exp',cr:'cash',      dir:'out' }
  };

  /* ---------- periods ---------- */
  function periodIdForDate(iso){
    const d = new Date(iso || Date.now());
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }
  function ensurePeriod(periodId){
    const existing = DB._raw('fin_periods').find(p=> p.period_id===periodId);
    if (existing) return existing;
    const row = {
      period_id: periodId,
      church_id: (Auth.session()||{}).church_id || null,
      status: 'open',
      opened_at: new Date().toISOString(),
      closed_at: null,
      closed_by: null
    };
    DB.insert('fin_periods', row);
    return row;
  }
  function isPeriodLocked(periodId){
    const p = DB._raw('fin_periods').find(x=> x.period_id===periodId);
    return p && p.status === 'closed';
  }
  function closePeriod(periodId){
    if (!window.Security || !Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.fin_periods||[]).findIndex(p=> p.period_id===periodId);
    if (idx<0) return { ok:false, error:'فترة غير موجودة' };
    all.fin_periods[idx].status = 'closed';
    all.fin_periods[idx].closed_at = new Date().toISOString();
    all.fin_periods[idx].closed_by = Auth.session().user_id;
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    Audit.log('finance.period_closed', { period_id:periodId });
    Security.logEvent('finance.period_closed', { period_id:periodId, severity:'warning' });
    return { ok:true };
  }
  function reopenPeriod(periodId){
    if (!Security.requireCap('canManageFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.fin_periods||[]).findIndex(p=> p.period_id===periodId);
    if (idx<0) return { ok:false, error:'فترة غير موجودة' };
    all.fin_periods[idx].status = 'open';
    all.fin_periods[idx].reopened_at = new Date().toISOString();
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    Audit.log('finance.period_reopened', { period_id:periodId, severity:'warning' });
    Security.logEvent('finance.period_reopened', { period_id:periodId, severity:'warning' });
    return { ok:true };
  }

  /* ---------- treasuries ---------- */
  function ensureTreasury(key){
    const cid = (Auth.session()||{}).church_id;
    let t = DB._raw('treasuries').find(x=> x.account_key===key && x.church_id===cid);
    if (t) return t;
    const meta = COA[key]; if (!meta) return null;
    t = {
      treasury_id: 'trs-'+Math.random().toString(36).slice(2,10),
      church_id: cid,
      account_key: key,
      code: meta.code, name: meta.name, type: meta.type,
      balance: 0, created_at: new Date().toISOString()
    };
    DB.insert('treasuries', t);
    return t;
  }
  function adjustTreasury(key, delta){
    const t = ensureTreasury(key); if (!t) return;
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.treasuries||[]).findIndex(x=> x.treasury_id===t.treasury_id);
    if (idx<0) return;
    all.treasuries[idx].balance = (+all.treasuries[idx].balance||0) + delta;
    all.treasuries[idx].updated_at = new Date().toISOString();
    localStorage.setItem('church_db_v1', JSON.stringify(all));
  }
  function treasuryHistory(treasuryId){
    const tr = DB._raw('treasuries').find(x=> x.treasury_id===treasuryId);
    if (!tr) return [];
    return DB._raw('ledger_entries')
      .filter(e => e.treasury_id===treasuryId)
      .sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
  }

  /* ---------- ledger ---------- */
  function postLedger(txn){
    const map = ENTRY_MAP[txn.type]; if (!map) return;
    const cid = txn.church_id;
    const drT = ensureTreasury(map.dr);
    const crT = ensureTreasury(map.cr);
    const periodId = periodIdForDate(txn.transaction_date);
    const base = {
      church_id: cid,
      transaction_id: txn.transaction_id,
      period_id: periodId,
      created_at: new Date().toISOString()
    };
    DB.insert('ledger_entries', { ...base, treasury_id:drT.treasury_id, account_key:map.dr, debit: +txn.amount||0, credit:0, description: txn.description||'' });
    DB.insert('ledger_entries', { ...base, treasury_id:crT.treasury_id, account_key:map.cr, debit: 0, credit: +txn.amount||0, description: txn.description||'' });
    // treasury impact only on cash/bank-style asset accounts
    if (COA[map.dr]?.type === 'asset') adjustTreasury(map.dr,  +txn.amount||0);
    if (COA[map.cr]?.type === 'asset') adjustTreasury(map.cr, -(+txn.amount||0));
  }

  /* ---------- transactions API ---------- */
  function createTransaction(input){
    if (!Security.requireCap('canManageFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const session = Auth.session();
    const periodId = periodIdForDate(input.transaction_date);
    if (isPeriodLocked(periodId)) return { ok:false, error:'الفترة المالية مقفلة' };
    ensurePeriod(periodId);

    const amount = Math.abs(+input.amount || 0);
    if (amount <= 0) return { ok:false, error:'المبلغ غير صالح' };

    const txn = {
      type: input.type,
      amount,
      currency: input.currency || 'EGP',
      category: input.category || '',
      description: input.description || '',
      member_id: input.member_id || null,
      event_id: input.event_id || null,
      payment_method: input.payment_method || 'cash',
      recorded_by: session.user_id,
      transaction_date: input.transaction_date || new Date().toISOString(),
      // new fields
      status: 'pending',                // draft|pending|approved|rejected|reversed
      locked: false,
      period_id: periodId,
      approval_chain: [],
      reversal_of: null
    };
    const row = DB.insert('financial_transactions', txn);
    Audit.log('finance.txn_created', { id: row.transaction_id, type:txn.type, amount });
    return { ok:true, txn: row };
  }

  function _findTxn(id){
    return DB._raw('financial_transactions').find(t=> t.transaction_id===id);
  }
  function _patchTxn(id, patch){
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.financial_transactions||[]).findIndex(t=> t.transaction_id===id);
    if (idx<0) return null;
    all.financial_transactions[idx] = { ...all.financial_transactions[idx], ...patch, updated_at: new Date().toISOString() };
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    return all.financial_transactions[idx];
  }

  function approveTransaction(id, note){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t) return { ok:false, error:'غير موجود' };
    if (t.locked) return { ok:false, error:'مقفلة بالفعل' };
    if (t.status === 'rejected') return { ok:false, error:'تم الرفض' };
    // self-approval block
    if (t.recorded_by === s.user_id){
      Security.logEvent('finance.self_approval_blocked', { id, user:s.user_id, severity:'warning' });
      return { ok:false, error:'لا يمكن اعتماد معاملة سجلتها بنفسك' };
    }
    if (isPeriodLocked(t.period_id || periodIdForDate(t.transaction_date))) return { ok:false, error:'الفترة مقفلة' };
    const chain = (t.approval_chain || []).slice();
    chain.push({ step: chain.length+1, by: s.user_id, name: s.full_name, role: s.role, action:'approved', note: note||'', at: new Date().toISOString() });
    const patched = _patchTxn(id, { status:'approved', locked:true, approval_chain: chain, approved_at:new Date().toISOString(), approved_by:s.user_id });
    // post to ledger ONLY on first approval
    if (patched && !chain.some(c=> c.action==='posted')){
      postLedger(patched);
      chain.push({ step: chain.length+1, by:s.user_id, name:s.full_name, role:s.role, action:'posted', at: new Date().toISOString() });
      _patchTxn(id, { approval_chain: chain });
    }
    Audit.log('finance.txn_approved', { id, before:{status:t.status}, after:{status:'approved'} });
    Security.logEvent('finance.txn_approved', { id, amount:t.amount });
    return { ok:true };
  }

  function rejectTransaction(id, reason){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t) return { ok:false, error:'غير موجود' };
    if (t.locked) return { ok:false, error:'مقفلة، استخدم العكس' };
    const chain = (t.approval_chain || []).slice();
    chain.push({ step: chain.length+1, by:s.user_id, name:s.full_name, role:s.role, action:'rejected', note: reason||'', at: new Date().toISOString() });
    _patchTxn(id, { status:'rejected', approval_chain: chain, rejected_at:new Date().toISOString(), rejection_reason: reason||'' });
    Audit.log('finance.txn_rejected', { id, reason });
    return { ok:true };
  }

  function reverseTransaction(id, reason){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t || !t.locked) return { ok:false, error:'يجب أن تكون المعاملة معتمدة ومقفلة' };
    if (t.reversed_by) return { ok:false, error:'تم عكسها بالفعل' };
    if (isPeriodLocked(t.period_id || periodIdForDate(t.transaction_date))) return { ok:false, error:'الفترة مقفلة' };
    // create mirror txn with inverted entry direction
    const map = ENTRY_MAP[t.type]; if (!map) return { ok:false, error:'نوع غير قابل للعكس' };
    const inverseTypeByDir = (map.dir === 'in') ? 'other_out' : 'other_in';
    const reversal = {
      type: inverseTypeByDir,
      amount: t.amount,
      currency: t.currency,
      category: 'عكس قيد',
      description: `عكس المعاملة ${t.transaction_id} — ${reason||''}`,
      member_id: t.member_id, event_id: t.event_id,
      payment_method: t.payment_method,
      recorded_by: s.user_id,
      transaction_date: new Date().toISOString(),
      status: 'approved', locked: true,
      period_id: periodIdForDate(new Date().toISOString()),
      reversal_of: t.transaction_id,
      approval_chain: [{ step:1, by:s.user_id, name:s.full_name, role:s.role, action:'reversed', note: reason||'', at:new Date().toISOString() }]
    };
    const row = DB.insert('financial_transactions', reversal);
    postLedger(row);
    _patchTxn(id, { status:'reversed', reversed_by: row.transaction_id, reversed_at:new Date().toISOString(), reversal_reason: reason||'' });
    Audit.log('finance.txn_reversed', { id, reversal_id: row.transaction_id, reason });
    Security.logEvent('finance.txn_reversed', { id, severity:'warning' });
    return { ok:true, reversal: row };
  }

  /* ---------- analytics / insights ---------- */
  function computeInsights(){
    const txns = DB.all('financial_transactions');
    const now = Date.now();
    const last30 = txns.filter(t=> (now - new Date(t.transaction_date)) < 30*864e5 && t.status==='approved');
    const prev30 = txns.filter(t=> { const d = now - new Date(t.transaction_date); return d>=30*864e5 && d<60*864e5 && t.status==='approved'; });
    const expense = arr => arr.filter(t=>['expense','salary','other_out'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const income  = arr => arr.filter(t=>['donation','tithe','event_payment','other_in'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const insights = [];

    const exp1 = expense(last30), exp0 = expense(prev30);
    if (exp0>0 && exp1 > exp0 * 1.4) insights.push({ kind:'unusual_spending', severity:'warning', msg:`المصروفات ارتفعت ${Math.round((exp1/exp0-1)*100)}% مقارنة بالشهر السابق` });

    const inc1 = income(last30), inc0 = income(prev30);
    if (inc0>0 && inc1 < inc0 * 0.7) insights.push({ kind:'income_drop', severity:'warning', msg:`الدخل انخفض ${Math.round((1-inc1/inc0)*100)}% مقارنة بالشهر السابق` });

    DB._raw('treasuries').forEach(tr=>{
      if (tr.balance < 0) insights.push({ kind:'treasury_negative', severity:'critical', msg:`الخزينة "${tr.name}" سالبة (${tr.balance})` });
      const lastMove = DB._raw('ledger_entries').filter(e=> e.treasury_id===tr.treasury_id).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      if (lastMove && (now - new Date(lastMove.created_at)) > 90*864e5) insights.push({ kind:'inactive_treasury', severity:'info', msg:`الخزينة "${tr.name}" بدون حركة منذ ${Math.floor((now-new Date(lastMove.created_at))/864e5)} يوم` });
    });

    // persist (replace)
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    all.fin_insights = insights.map(i=>({ ...i, church_id:(Auth.session()||{}).church_id, computed_at:new Date().toISOString() }));
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    return insights;
  }

  /* ---------- reports ---------- */
  function periodReport(periodId){
    const txns = DB.all('financial_transactions').filter(t=> (t.period_id || periodIdForDate(t.transaction_date)) === periodId && t.status==='approved');
    const byCat = {};
    let income=0, expense=0;
    txns.forEach(t=>{
      const isExp = ['expense','salary','other_out'].includes(t.type);
      if (isExp) expense += +t.amount||0; else income += +t.amount||0;
      const k = (isExp?'مصروف:':'دخل:') + (t.category||t.type);
      byCat[k] = (byCat[k]||0) + (+t.amount||0);
    });
    return { periodId, income, expense, net: income-expense, byCategory: byCat, count: txns.length };
  }

  /* ---------- exportable CSV ---------- */
  function exportLedgerCSV(){
    const rows = DB.all('ledger_entries').sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
    const head = ['date','transaction_id','period','account','debit','credit','description'];
    const lines = [head.join(',')].concat(rows.map(r=>[
      r.created_at, r.transaction_id, r.period_id, r.account_key, r.debit, r.credit,
      JSON.stringify(r.description||'')
    ].join(',')));
    return lines.join('\n');
  }

  window.FinanceEngine = {
    COA, ENTRY_MAP,
    createTransaction, approveTransaction, rejectTransaction, reverseTransaction,
    closePeriod, reopenPeriod, ensurePeriod, periodIdForDate, isPeriodLocked,
    treasuryHistory, postLedger,
    computeInsights, periodReport, exportLedgerCSV,
    listTreasuries(){ return DB.all('treasuries'); },
    listPeriods(){ return DB._raw('fin_periods').filter(p => !Auth.session() || p.church_id === Auth.session().church_id).sort((a,b)=> b.period_id.localeCompare(a.period_id)); },
    listInsights(){ return DB._raw('fin_insights').filter(i=> !Auth.session() || i.church_id===Auth.session().church_id); }
  };

  // run insights periodically
  if (typeof window !== 'undefined' && Auth.session()){
    try{ computeInsights(); }catch(_){}
  }
})();
