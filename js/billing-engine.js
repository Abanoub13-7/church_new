/* ============================================================
   BILLING-ENGINE.js  —  Phase 1 + 2
   Subscription plans · subscriptions · invoices · payments
   trial · renewals · grace · feature restrictions · history
   ------------------------------------------------------------
   Pure localStorage. Drop-in replaceable by REST later.
   ============================================================ */
(function(){
  const TABLES = [
    'subscription_plans','subscriptions','invoices','invoice_payments',
    'subscription_history','billing_notices'
  ];
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(all){ localStorage.setItem('church_db_v1', JSON.stringify(all)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3); }
  function days(n){ return n*864e5; }
  function now(){ return new Date().toISOString(); }

  /* ----------- Seed defaults ----------- */
  function ensureTables(){
    const all = root();
    TABLES.forEach(t => { if (!Array.isArray(all[t])) all[t]=[]; });

    if (!all.subscription_plans.length){
      all.subscription_plans = [
        plan('free','Free','مجاني',          0,    0,   {users:5,  servants:3,  members:50,   storage_mb:100,  events:5,   workflows:5,   analytics:false, finance:false, ai:false, notifications:true}),
        plan('starter','Starter','أساسي',     150,  1500,{users:15, servants:10, members:300,  storage_mb:500,  events:25,  workflows:25,  analytics:true,  finance:true,  ai:false, notifications:true}),
        plan('growth','Growth','نمو',         400,  4000,{users:50, servants:30, members:1500, storage_mb:2000, events:200, workflows:100, analytics:true,  finance:true,  ai:true,  notifications:true}),
        plan('enterprise','Enterprise','مؤسسي',1200, 12000,{users:9999,servants:9999,members:99999,storage_mb:20000,events:9999,workflows:9999,analytics:true,finance:true,ai:true,notifications:true})
      ];
    }
    save(all);
    // Ensure each church has a subscription record
    const all2 = root();
    const subs = all2.subscriptions;
    (all2.churches||[]).forEach(ch => {
      if (!subs.find(s => s.church_id===ch.church_id)){
        subs.push(makeSub(ch));
      }
    });
    save(all2);
  }

  function plan(key,label,labelAr,monthly,yearly,limits){
    return { plan_id:'pln-'+key, plan_key:key, label, label_ar:labelAr,
      price_monthly:monthly, price_yearly:yearly, currency:'EGP', limits, active:true, created_at:now() };
  }

  function makeSub(ch){
    const planKey = ch.subscription_plan || 'free';
    const status  = ch.subscription_status || 'trial';
    const startedAt = ch.created_at || now();
    const trialEnds = new Date(new Date(startedAt).getTime()+days(14)).toISOString();
    const periodEnds = ch.subscription_expires_at || new Date(Date.now()+days(30)).toISOString();
    return {
      subscription_id: uid('sub'),
      church_id: ch.church_id,
      plan_key: planKey,
      billing_cycle: 'monthly',
      status: status==='active'?'active':(status==='trial'?'trial':status),
      started_at: startedAt,
      trial_ends_at: trialEnds,
      current_period_start: startedAt,
      current_period_end: periodEnds,
      grace_until: null,
      cancel_requested: false,
      auto_renew: true,
      created_at: now()
    };
  }

  /* ----------- Public API ----------- */
  const Billing = {
    /* PLANS */
    listPlans(){ ensureTables(); return root().subscription_plans||[]; },
    getPlan(key){ return Billing.listPlans().find(p=>p.plan_key===key); },
    upsertPlan(p){
      const all = root(); all.subscription_plans = all.subscription_plans||[];
      const i = all.subscription_plans.findIndex(x=>x.plan_key===p.plan_key);
      if (i>=0) all.subscription_plans[i] = { ...all.subscription_plans[i], ...p };
      else all.subscription_plans.push({ ...p, plan_id:uid('pln'), created_at:now() });
      save(all);
      Audit?.log('billing.plan_upserted',{ plan_key:p.plan_key });
    },

    /* SUBSCRIPTIONS */
    listSubscriptions(){ ensureTables(); return root().subscriptions||[]; },
    getByChurch(cid){ return Billing.listSubscriptions().find(s=>s.church_id===cid); },
    changePlan(cid, planKey, cycle){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid);
      if (!s) return null;
      const old = { plan_key:s.plan_key, billing_cycle:s.billing_cycle };
      s.plan_key = planKey; s.billing_cycle = cycle || s.billing_cycle;
      const dur = s.billing_cycle==='yearly'?365:30;
      s.current_period_start = now();
      s.current_period_end   = new Date(Date.now()+days(dur)).toISOString();
      s.status='active'; s.grace_until=null;
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'plan_change',
        from:old, to:{plan_key:planKey, billing_cycle:s.billing_cycle}, at:now() });
      // also update church row
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch){ ch.subscription_plan=planKey; ch.subscription_status='active';
        ch.subscription_expires_at=s.current_period_end; }
      save(all);
      Billing.generateInvoice(cid);
      Audit?.log('billing.plan_change', { church_id:cid, plan_key:planKey, cycle:s.billing_cycle });
      return s;
    },
    setStatus(cid, status, reason){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.status = status;
      if (status==='grace_period') s.grace_until = new Date(Date.now()+days(7)).toISOString();
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'status_change',
        to:status, reason:reason||null, at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch) ch.subscription_status = status==='grace_period'?'active':status;
      save(all);
      Audit?.log('billing.status_change', { church_id:cid, status, reason });
      return s;
    },
    renew(cid){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      const dur = s.billing_cycle==='yearly'?365:30;
      s.current_period_start = now();
      s.current_period_end   = new Date(Date.now()+days(dur)).toISOString();
      s.status='active'; s.grace_until=null;
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'renew', at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch){ ch.subscription_status='active'; ch.subscription_expires_at=s.current_period_end; }
      save(all);
      Billing.generateInvoice(cid);
      Audit?.log('billing.renewed',{church_id:cid});
      return s;
    },
    cancel(cid, reason){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.cancel_requested = true; s.auto_renew=false; s.status='cancelled';
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'cancel', reason, at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch) ch.subscription_status='cancelled';
      save(all);
      Audit?.log('billing.cancelled',{church_id:cid,reason});
      return s;
    },
    startTrial(cid, ndays){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.status='trial';
      s.trial_ends_at = new Date(Date.now()+days(ndays||14)).toISOString();
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'trial_start', at:now() });
      save(all); return s;
    },

    /* INVOICES */
    listInvoices(){ ensureTables(); return root().invoices||[]; },
    invoicesByChurch(cid){ return Billing.listInvoices().filter(i=>i.church_id===cid); },
    generateInvoice(cid){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      const p = (all.subscription_plans||[]).find(x=>x.plan_key===s.plan_key); if (!p) return null;
      const amount = s.billing_cycle==='yearly' ? p.price_yearly : p.price_monthly;
      if (amount<=0) return null;
      const ch = all.churches.find(c=>c.church_id===cid);
      const inv = {
        invoice_id: uid('inv'),
        invoice_number: 'INV-'+Date.now().toString(36).toUpperCase(),
        church_id: cid,
        church_name: ch?.church_name,
        subscription_id: s.subscription_id,
        plan_key: s.plan_key,
        billing_cycle: s.billing_cycle,
        amount, currency:'EGP',
        issued_at: now(),
        due_at: new Date(Date.now()+days(7)).toISOString(),
        status: 'pending', // pending|submitted|under_review|approved|rejected|overdue|paid
        notes: '',
        items: [{ desc:`اشتراك ${p.label_ar||p.label} - ${s.billing_cycle==='yearly'?'سنوي':'شهري'}`, qty:1, unit:amount, total:amount }],
        created_at: now()
      };
      all.invoices.push(inv);
      save(all);
      Audit?.log('billing.invoice_generated',{ church_id:cid, invoice_id:inv.invoice_id, amount });
      return inv;
    },

    /* PAYMENTS */
    submitPayment(invId, payload){
      // payload: { method, reference, proof_url, notes, amount }
      const all = root();
      const inv = all.invoices.find(i=>i.invoice_id===invId); if (!inv) return null;
      const pay = {
        payment_id: uid('pay'),
        invoice_id: invId,
        church_id: inv.church_id,
        amount: payload.amount||inv.amount,
        method: payload.method||'bank_transfer',
        reference: payload.reference||'',
        proof_url: payload.proof_url||'',
        proof_name: payload.proof_name||'',
        notes: payload.notes||'',
        status: 'submitted', // submitted|approved|rejected
        submitted_at: now(),
        submitted_by: Auth?.session()?.user_id,
        reviewed_at:null, reviewed_by:null, review_notes:''
      };
      all.invoice_payments.push(pay);
      inv.status = 'submitted';
      save(all);
      Audit?.log('billing.payment_submitted',{ invoice_id:invId, payment_id:pay.payment_id });
      return pay;
    },
    reviewPayment(payId, decision, notes){
      const all = root();
      const p = all.invoice_payments.find(x=>x.payment_id===payId); if (!p) return null;
      p.status = decision; // approved | rejected
      p.reviewed_at = now();
      p.reviewed_by = Auth?.session()?.user_id;
      p.review_notes = notes||'';
      const inv = all.invoices.find(i=>i.invoice_id===p.invoice_id);
      if (inv){
        inv.status = decision==='approved' ? 'paid' : 'rejected';
        if (decision==='approved'){
          const sub = all.subscriptions.find(s=>s.subscription_id===inv.subscription_id);
          if (sub){
            sub.status='active'; sub.grace_until=null;
            const dur = sub.billing_cycle==='yearly'?365:30;
            sub.current_period_start = now();
            sub.current_period_end = new Date(Date.now()+days(dur)).toISOString();
            const ch = all.churches.find(c=>c.church_id===sub.church_id);
            if (ch){ ch.subscription_status='active'; ch.subscription_expires_at=sub.current_period_end; }
            all.subscription_history.push({ history_id:uid('hst'), church_id:sub.church_id, action:'payment_approved', invoice_id:inv.invoice_id, at:now() });
          }
        }
      }
      save(all);
      Audit?.log('billing.payment_reviewed',{ payment_id:payId, decision });
      return p;
    },
    paymentsByInvoice(invId){ ensureTables(); return root().invoice_payments.filter(p=>p.invoice_id===invId); },
    allPayments(){ ensureTables(); return root().invoice_payments||[]; },

    /* HISTORY */
    history(cid){
      ensureTables();
      return (root().subscription_history||[]).filter(h=> !cid || h.church_id===cid)
        .sort((a,b)=>b.at.localeCompare(a.at));
    },

    /* AUTOMATIC LIFECYCLE — call on every page load */
    runLifecycle(){
      ensureTables();
      const all = root();
      const n = Date.now();
      let changed=false;
      (all.subscriptions||[]).forEach(s => {
        // trial expiry
        if (s.status==='trial' && s.trial_ends_at && n > new Date(s.trial_ends_at).getTime()){
          s.status='pending_payment'; changed=true;
          all.billing_notices.push(notice(s.church_id,'trial_expired','انتهت الفترة التجريبية'));
        }
        // overdue invoice → grace period
        if (s.status==='active' && s.current_period_end && n > new Date(s.current_period_end).getTime()){
          s.status='grace_period';
          s.grace_until = new Date(n+days(7)).toISOString();
          changed=true;
          all.billing_notices.push(notice(s.church_id,'grace_started','بدأت فترة السماح — جدد الاشتراك خلال 7 أيام'));
        }
        // grace expired → suspended
        if (s.status==='grace_period' && s.grace_until && n > new Date(s.grace_until).getTime()){
          s.status='suspended'; changed=true;
          const ch = all.churches.find(c=>c.church_id===s.church_id);
          if (ch) ch.subscription_status='suspended';
          all.billing_notices.push(notice(s.church_id,'suspended','تم تعليق الاشتراك لعدم السداد'));
        }
        // renewal reminder (3 days before end)
        if (s.status==='active' && s.current_period_end){
          const left = new Date(s.current_period_end).getTime() - n;
          if (left>0 && left < days(3)){
            const exists = (all.billing_notices||[]).some(x=>x.church_id===s.church_id && x.type==='renewal_reminder' &&
              (Date.now()-new Date(x.at).getTime() < days(2)));
            if (!exists) all.billing_notices.push(notice(s.church_id,'renewal_reminder','اشتراكك على وشك الانتهاء'));
          }
        }
        // mark overdue invoices
        (all.invoices||[]).filter(i=>i.church_id===s.church_id && ['pending','submitted','under_review'].includes(i.status))
          .forEach(i => {
            if (n > new Date(i.due_at).getTime() && i.status==='pending'){
              i.status='overdue'; changed=true;
            }
          });
      });
      if (changed) save(all);
    },

    notices(cid){ ensureTables(); return (root().billing_notices||[]).filter(n=>!cid||n.church_id===cid).sort((a,b)=>b.at.localeCompare(a.at)); },

    /* FEATURE & LIMIT GUARDS */
    isFeatureAllowed(cid, feature){
      const s = Billing.getByChurch(cid); if (!s) return true;
      if (['suspended','cancelled','expired'].includes(s.status)) return false;
      const p = Billing.getPlan(s.plan_key); if (!p) return true;
      const f = p.limits||{};
      if (feature in f) return !!f[feature];
      return true;
    },
    isReadOnly(cid){
      const s = Billing.getByChurch(cid); if (!s) return false;
      return ['suspended','expired'].includes(s.status);
    },
    limit(cid, key){
      const s = Billing.getByChurch(cid); if (!s) return Infinity;
      const p = Billing.getPlan(s.plan_key); if (!p) return Infinity;
      return p.limits?.[key] ?? Infinity;
    },

    /* METRICS */
    metrics(){
      const subs = Billing.listSubscriptions();
      const plans = Billing.listPlans();
      const invs = Billing.listInvoices();
      let mrr=0, arr=0;
      subs.filter(s=>s.status==='active').forEach(s => {
        const p = plans.find(x=>x.plan_key===s.plan_key); if (!p) return;
        if (s.billing_cycle==='yearly'){ arr += p.price_yearly; mrr += p.price_yearly/12; }
        else { mrr += p.price_monthly; arr += p.price_monthly*12; }
      });
      const overdue = invs.filter(i=>i.status==='overdue').length;
      const pendingReview = Billing.allPayments().filter(p=>p.status==='submitted').length;
      const activeSubs = subs.filter(s=>s.status==='active').length;
      const trialSubs  = subs.filter(s=>s.status==='trial').length;
      const suspendedSubs = subs.filter(s=>['suspended','cancelled','expired'].includes(s.status)).length;
      return { mrr:Math.round(mrr), arr:Math.round(arr), overdue, pendingReview, activeSubs, trialSubs, suspendedSubs };
    }
  };
  function notice(cid,type,msg){ return { notice_id: uid('not'), church_id:cid, type, message:msg, at:now(), read:false }; }

  ensureTables();
  window.Billing = Billing;
})();
