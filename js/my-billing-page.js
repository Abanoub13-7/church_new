/* ============================================================
   MY-BILLING.PAGE.js — Tenant view: my invoices, pay, history
   ============================================================ */
(function(){
  if (!App.init('my-billing', ['church_admin','financial_manager'])) return;
  const s = Auth.session();
  Billing.runLifecycle();
  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function badge(st){ const m={pending:['pending','orange'],submitted:['submitted','blue'],under_review:['review','blue'],approved:['approved','green'],paid:['paid','green'],rejected:['rejected','red'],overdue:['overdue','red']};
    const [t,c]=m[st]||[st,'gray']; return `<span class="badge ${c}">${t}</span>`; }
  function render(){
    const sub = Billing.getByChurch(s.church_id);
    const invs = Billing.invoicesByChurch(s.church_id).sort((a,b)=>b.issued_at.localeCompare(a.issued_at));
    const plans = Billing.listPlans();
    const curPlan = plans.find(p=>p.plan_key===sub?.plan_key);
    const hist = Billing.history(s.church_id);
    const notices = Billing.notices(s.church_id);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">اشتراكي وفواتيري</h1>
        <p class="page-subtitle">إدارة اشتراك الكنيسة ودفع الفواتير</p>
      </div></div>
      ${notices.slice(0,3).map(n=>`<div class="alert orange">⚠️ ${n.message} — ${UI.fmt.relative(n.at)}</div>`).join('')}
      <div class="grid grid-3 mb-3">
        <div class="card"><b>الخطة الحالية</b><h2 style="margin:.3rem 0">${curPlan?.label_ar||sub?.plan_key||'-'}</h2>
          <small class="muted">${sub?.billing_cycle==='yearly'?'سنوي':'شهري'} · ${badge(sub?.status||'-')}</small></div>
        <div class="card"><b>تنتهي في</b><h2 style="margin:.3rem 0">${UI.fmt.date(sub?.current_period_end)}</h2>
          <small class="muted">${UI.fmt.relative(sub?.current_period_end)}</small></div>
        <div class="card"><b>الفواتير المستحقة</b><h2 style="margin:.3rem 0;color:var(--red)">${invs.filter(i=>['pending','overdue'].includes(i.status)).length}</h2>
          <small class="muted">يجب السداد</small></div>
      </div>
      <div class="card mb-3"><div class="card-header"><h3>الفواتير</h3></div>
        <table class="table">
          <thead><tr><th>رقم</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${invs.map(i=>`<tr>
            <td><b>${i.invoice_number}</b></td><td>${fmt(i.amount)}</td>
            <td>${UI.fmt.date(i.due_at)}</td><td>${badge(i.status)}</td>
            <td>${['pending','overdue','rejected'].includes(i.status)?`<button class="btn btn-sm btn-primary" data-pay="${i.invoice_id}">دفع</button>`:''}</td>
          </tr>`).join('')||'<tr><td colspan="5" class="muted">لا توجد فواتير</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card"><div class="card-header"><h3>سجل الاشتراك</h3></div>
        ${hist.slice(0,10).map(h=>`<div class="alert">${h.action} · ${UI.fmt.dateTime(h.at)}</div>`).join('')||'<p class="muted">لا يوجد سجل</p>'}
      </div>
    `);
    document.querySelectorAll('[data-pay]').forEach(b => b.onclick = ()=> payModal(b.dataset.pay));
  }
  function payModal(id){
    const inv = Billing.listInvoices().find(x=>x.invoice_id===id);
    UI.modal(`<h3>دفع فاتورة ${inv.invoice_number}</h3>
      <p>المبلغ: <b>${fmt(inv.amount)}</b></p>
      <label>طريقة الدفع</label>
      <select id="m" class="input"><option value="bank_transfer">تحويل بنكي</option><option value="instapay">إنستاباي</option><option value="cash">نقدي</option><option value="other">أخرى</option></select>
      <label>رقم المرجع / رقم التحويل</label><input id="r" class="input">
      <label>إثبات الدفع (اسم الملف أو رابط)</label><input id="p" class="input" placeholder="receipt.jpg أو https://...">
      <label>ملاحظات</label><textarea id="n" class="input" rows="2"></textarea>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">إرسال للمراجعة</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Billing.submitPayment(id, {
        method:document.getElementById('m').value,
        reference:document.getElementById('r').value,
        proof_name:document.getElementById('p').value,
        notes:document.getElementById('n').value
      });
      UI.toast('تم إرسال الدفعة للمراجعة','success'); UI.closeModal(); render();
    };
  }
  render();
})();
