/* FINANCE — enterprise (approval, reversal, periods, treasuries) */
(function(){
  if (!App.init('finance', ['church_admin','finance','financial_manager'])) return;

  function render(){
    const txns = DB.all('financial_transactions').sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date));
    const approved = txns.filter(t=> t.status==='approved' || t.locked);
    const income = approved.filter(t=>['donation','tithe','event_payment','other_in'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const expense = approved.filter(t=>['expense','salary','other_out'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const pending = txns.filter(t=> t.status==='pending').length;
    const treasuries = FinanceEngine.listTreasuries();
    const periods = FinanceEngine.listPeriods();
    const insights = FinanceEngine.listInsights();

    const session = Auth.session();
    const canApprove = window.Permissions && Permissions.can('canApproveFinance');

    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الماليات</h1>
        <p class="page-subtitle">${txns.length} معاملة — ${pending} بانتظار الاعتماد</p></div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost" onclick="FinancePage.exportCSV()"><i class="fa-solid fa-file-csv"></i> تصدير الدفتر</button>
          <button class="btn btn-accent" onclick="FinancePage.add()"><i class="fa-solid fa-plus"></i> معاملة جديدة</button>
        </div>
      </div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-arrow-up"></i></div><div><div class="stat-value">${UI.fmt.money(income)}</div><div class="stat-label">الدخل المعتمد</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-arrow-down"></i></div><div><div class="stat-value">${UI.fmt.money(expense)}</div><div class="stat-label">المصروفات المعتمدة</div></div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-wallet"></i></div><div><div class="stat-value">${UI.fmt.money(income-expense)}</div><div class="stat-label">صافي الرصيد</div></div></div>
        <div class="stat-card yellow"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div><div class="stat-value">${pending}</div><div class="stat-label">بانتظار الاعتماد</div></div></div>
      </div>

      ${insights.length ? `<div class="card mb-3">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-brain"></i> تنبيهات ذكية</div></div>
        <div style="padding:1rem">${insights.map(i=>`<div class="badge badge-${i.severity==='critical'?'red':i.severity==='warning'?'yellow':'blue'}" style="margin:.25rem;display:inline-block">${i.msg}</div>`).join('')}</div>
      </div>`:''}

      <div class="grid grid-2 mb-3">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-vault"></i> الخزائن</div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>الاسم</th><th>الكود</th><th>الرصيد</th><th></th></tr></thead>
            <tbody>${treasuries.length? treasuries.map(t=>`<tr>
              <td>${t.name}</td><td><code>${t.code}</code></td>
              <td><b style="color:${t.balance<0?'var(--red)':'inherit'}">${UI.fmt.money(t.balance)}</b></td>
              <td><button class="btn btn-ghost btn-sm" onclick="FinancePage.treasuryHistory('${t.treasury_id}')"><i class="fa-solid fa-clock-rotate-left"></i> السجل</button></td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="empty">لا توجد خزائن — ستُنشأ تلقائياً عند اعتماد أول معاملة</div></td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-calendar"></i> الفترات المالية</div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>الفترة</th><th>الحالة</th><th>إغلاق</th><th></th></tr></thead>
            <tbody>${periods.length? periods.map(p=>`<tr>
              <td><b>${p.period_id}</b></td>
              <td><span class="badge badge-${p.status==='closed'?'red':'green'}">${p.status}</span></td>
              <td>${p.closed_at?UI.fmt.date(p.closed_at):'—'}</td>
              <td>
                <button class="btn btn-ghost btn-sm" onclick="FinancePage.periodReport('${p.period_id}')"><i class="fa-solid fa-chart-pie"></i></button>
                ${canApprove ? (p.status==='open'
                  ? `<button class="btn btn-ghost btn-sm" onclick="FinancePage.closePeriod('${p.period_id}')"><i class="fa-solid fa-lock"></i></button>`
                  : `<button class="btn btn-ghost btn-sm" onclick="FinancePage.reopenPeriod('${p.period_id}')"><i class="fa-solid fa-lock-open"></i></button>`) : ''}
              </td>
            </tr>`).join(''):'<tr><td colspan="4"><div class="empty">—</div></td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-list"></i> دفتر المعاملات</div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>الفترة</th><th>الوصف</th><th>إجراءات</th></tr></thead>
        <tbody>${txns.length? txns.map(t=>`<tr>
          <td>${UI.fmt.date(t.transaction_date)}</td>
          <td><span class="badge badge-${['expense','salary','other_out'].includes(t.type)?'red':'green'}">${t.type}</span></td>
          <td><b>${UI.fmt.money(t.amount)}</b></td>
          <td>
            <span class="badge badge-${t.status==='approved'?'green':t.status==='pending'?'yellow':t.status==='rejected'?'red':t.status==='reversed'?'gray':'blue'}">${t.status||'—'}</span>
            ${t.locked?'<i class="fa-solid fa-lock" title="مقفلة"></i>':''}
          </td>
          <td><code style="font-size:.75rem">${t.period_id||FinanceEngine.periodIdForDate(t.transaction_date)}</code></td>
          <td>${t.description||'—'}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick='FinancePage.view(${JSON.stringify(t.transaction_id)})'><i class="fa-solid fa-eye"></i></button>
            ${canApprove && t.status==='pending' ? `
              <button class="btn btn-success btn-sm" onclick="FinancePage.approve('${t.transaction_id}')"><i class="fa-solid fa-check"></i></button>
              <button class="btn btn-danger btn-sm" onclick="FinancePage.reject('${t.transaction_id}')"><i class="fa-solid fa-xmark"></i></button>` : ''}
            ${canApprove && t.locked && !t.reversed_by && t.status!=='reversed' ? `
              <button class="btn btn-ghost btn-sm" onclick="FinancePage.reverse('${t.transaction_id}')"><i class="fa-solid fa-rotate-left"></i> عكس</button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="7"><div class="empty">لا توجد معاملات</div></td></tr>'}</tbody>
      </table></div></div>
    `);
  }

  function ok(res){ if (!res.ok){ UI.toast(res.error||'فشل العملية','error'); return false; } UI.toast('تم بنجاح','success'); render(); return true; }

  window.FinancePage = {
    add(){
      UI.modal(`<div class="modal-header"><h3>معاملة جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="fin-form">
          <div class="form-group"><label class="form-label">النوع</label>
            <select class="form-select" name="type">
              <option value="donation">تبرع</option><option value="tithe">عشور</option>
              <option value="event_payment">دفع فعالية</option><option value="other_in">دخل آخر</option>
              <option value="expense">مصروف</option><option value="salary">راتب</option>
              <option value="other_out">مصروف آخر</option>
            </select></div>
          <div class="form-group"><label class="form-label">المبلغ</label>
            <input class="form-control" type="number" name="amount" required min="0.01" step="0.01"></div>
          <div class="form-group"><label class="form-label">الفئة</label>
            <input class="form-control" type="text" name="category"></div>
          <div class="form-group"><label class="form-label">طريقة الدفع</label>
            <select class="form-select" name="payment_method">
              <option value="cash">نقدي</option><option value="bank">بنكي</option>
              <option value="online">إلكتروني</option><option value="other">أخرى</option>
            </select></div>
          <div class="form-group"><label class="form-label">التاريخ</label>
            <input class="form-control" type="date" name="transaction_date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="form-group"><label class="form-label">الوصف</label>
            <textarea class="form-control" name="description" rows="2"></textarea></div>
          <button class="btn btn-accent" type="submit" style="width:100%">إضافة (تذهب لقائمة الانتظار)</button>
        </form></div>`);
      document.getElementById('fin-form').addEventListener('submit', e=>{
        e.preventDefault();
        const f = new FormData(e.target);
        const data = Object.fromEntries(f.entries());
        data.transaction_date = new Date(data.transaction_date).toISOString();
        const res = FinanceEngine.createTransaction(data);
        if (res.ok){ UI.closeModal(); UI.toast('تم الإنشاء بانتظار الاعتماد','success'); render(); }
        else UI.toast(res.error,'error');
      });
    },
    approve(id){
      const note = prompt('ملاحظة الاعتماد (اختياري):')||'';
      ok(FinanceEngine.approveTransaction(id, note));
    },
    reject(id){
      const reason = prompt('سبب الرفض:'); if (!reason) return;
      ok(FinanceEngine.rejectTransaction(id, reason));
    },
    reverse(id){
      const reason = prompt('سبب العكس:'); if (!reason) return;
      ok(FinanceEngine.reverseTransaction(id, reason));
    },
    closePeriod(id){
      if (!confirm('إغلاق الفترة سيمنع أي تعديل أو إضافة فيها. هل أنت متأكد؟')) return;
      ok(FinanceEngine.closePeriod(id));
    },
    reopenPeriod(id){
      if (!confirm('إعادة فتح فترة مغلقة عملية حساسة، سيُسجَّل ذلك. متابعة؟')) return;
      ok(FinanceEngine.reopenPeriod(id));
    },
    view(id){
      const t = DB._raw('financial_transactions').find(x=>x.transaction_id===id);
      if (!t) return;
      const chain = (t.approval_chain||[]).map(c=>`<div style="padding:.5rem;border-bottom:1px solid var(--border)"><b>${c.action}</b> — ${c.name||c.by} <span style="color:var(--text3)">${UI.fmt.dateTime(c.at)}</span><div style="color:var(--text2);font-size:.85rem">${c.note||''}</div></div>`).join('') || '<div class="empty">—</div>';
      UI.modal(`<div class="modal-header"><h3>تفاصيل المعاملة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div><b>${t.type}</b> — ${UI.fmt.money(t.amount)} — <span class="badge badge-blue">${t.status}</span></div>
          <div style="color:var(--text2)">${t.description||''}</div>
          <h4 style="margin-top:1rem">سلسلة الاعتماد</h4>${chain}
          ${t.reversal_of?`<div class="badge badge-yellow">عكس للمعاملة: ${t.reversal_of}</div>`:''}
          ${t.reversed_by?`<div class="badge badge-yellow">تم عكسها بواسطة: ${t.reversed_by}</div>`:''}
        </div>`);
    },
    treasuryHistory(treasuryId){
      const rows = FinanceEngine.treasuryHistory(treasuryId);
      let bal = 0;
      const body = rows.map(r=>{ bal += (r.debit||0) - (r.credit||0); return `<tr>
        <td>${UI.fmt.dateTime(r.created_at)}</td><td>${r.debit||''}</td><td>${r.credit||''}</td>
        <td><b>${UI.fmt.money(bal)}</b></td><td>${r.description||''}</td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty">—</div></td></tr>';
      UI.modal(`<div class="modal-header"><h3>سجل الخزينة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><table class="table"><thead><tr><th>الوقت</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>الوصف</th></tr></thead><tbody>${body}</tbody></table></div>`);
    },
    periodReport(id){
      const r = FinanceEngine.periodReport(id);
      const cats = Object.entries(r.byCategory).map(([k,v])=>`<tr><td>${k}</td><td><b>${UI.fmt.money(v)}</b></td></tr>`).join('') || '<tr><td colspan="2"><div class="empty">—</div></td></tr>';
      UI.modal(`<div class="modal-header"><h3>تقرير الفترة ${id}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="grid grid-3 mb-2">
            <div class="stat-card green"><div><div class="stat-value">${UI.fmt.money(r.income)}</div><div class="stat-label">الدخل</div></div></div>
            <div class="stat-card red"><div><div class="stat-value">${UI.fmt.money(r.expense)}</div><div class="stat-label">المصروفات</div></div></div>
            <div class="stat-card"><div><div class="stat-value">${UI.fmt.money(r.net)}</div><div class="stat-label">الصافي</div></div></div>
          </div>
          <table class="table"><thead><tr><th>الفئة</th><th>الإجمالي</th></tr></thead><tbody>${cats}</tbody></table>
          <button class="btn btn-ghost mt-2" onclick="window.print()"><i class="fa-solid fa-print"></i> طباعة</button>
        </div>`);
    },
    exportCSV(){
      const csv = FinanceEngine.exportLedgerCSV();
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`ledger_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  render();
})();
