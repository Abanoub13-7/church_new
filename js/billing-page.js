/* ============================================================
   BILLING.PAGE.js — Super Admin · Invoices · Payments · MRR
   ============================================================ */
(function(){
  if (!App.init('billing', ['super_admin'])) return;
  Billing.runLifecycle();

  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function badge(status){
    const map = {
      pending:['الانتظار','orange'], submitted:['تم الإرسال','blue'], under_review:['قيد المراجعة','blue'],
      approved:['تم القبول','green'], rejected:['مرفوضة','red'], paid:['مدفوعة','green'], overdue:['متأخرة','red']
    };
    const [t,c] = map[status]||[status,'gray'];
    return `<span class="badge ${c}">${t}</span>`;
  }

  function render(){
    const m = Billing.metrics();
    const invs = Billing.listInvoices().sort((a,b)=>b.issued_at.localeCompare(a.issued_at));
    const payments = Billing.allPayments().sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at));

    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الفوترة والمدفوعات</h1>
        <p class="page-subtitle">إدارة الفواتير، مراجعة المدفوعات، ومتابعة الإيرادات</p></div>
        <div>
          <button class="btn btn-ghost" id="btn-gen-all"><i class="fa-solid fa-file-invoice"></i> توليد فواتير دورية</button>
        </div>
      </div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-arrow-trend-up"></i></div><div><div class="stat-value">${fmt(m.mrr)}</div><div class="stat-label">MRR</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-calendar"></i></div><div><div class="stat-value">${fmt(m.arr)}</div><div class="stat-label">ARR</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div><div class="stat-value">${m.pendingReview}</div><div class="stat-label">مدفوعات قيد المراجعة</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${m.overdue}</div><div class="stat-label">فواتير متأخرة</div></div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>الفواتير</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>رقم الفاتورة</th><th>الكنيسة</th><th>الخطة</th><th>المبلغ</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${invs.map(i=>`
            <tr>
              <td><b>${i.invoice_number}</b></td>
              <td>${i.church_name||'-'}</td>
              <td>${i.plan_key} / ${i.billing_cycle==='yearly'?'سنوي':'شهري'}</td>
              <td>${fmt(i.amount)}</td>
              <td>${UI.fmt.date(i.issued_at)}</td>
              <td>${UI.fmt.date(i.due_at)}</td>
              <td>${badge(i.status)}</td>
              <td><button class="btn btn-sm btn-ghost" data-inv="${i.invoice_id}"><i class="fa-solid fa-eye"></i></button></td>
            </tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد فواتير</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card mt-3">
        <div class="card-header"><h3>المدفوعات المقدمة</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الفاتورة</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${payments.map(p=>{
            const inv = invs.find(x=>x.invoice_id===p.invoice_id);
            return `<tr>
              <td>${inv?.invoice_number||p.invoice_id}</td>
              <td>${fmt(p.amount)}</td>
              <td>${p.method}</td>
              <td>${p.reference||'-'}</td>
              <td>${UI.fmt.dateTime(p.submitted_at)}</td>
              <td>${badge(p.status)}</td>
              <td>${p.status==='submitted'?`<button class="btn btn-sm btn-success" data-rev="${p.payment_id}">مراجعة</button>`:''}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" class="muted">لا توجد مدفوعات</td></tr>'}</tbody>
        </table></div>
      </div>
    `);

    document.getElementById('btn-gen-all').onclick = () => {
      DB._raw('churches').forEach(c => Billing.generateInvoice(c.church_id));
      UI.toast('تم توليد الفواتير','success'); render();
    };
    document.querySelectorAll('[data-inv]').forEach(b => b.onclick = ()=> openInvoice(b.dataset.inv));
    document.querySelectorAll('[data-rev]').forEach(b => b.onclick = ()=> reviewModal(b.dataset.rev));
  }

  function openInvoice(id){
    const inv = Billing.listInvoices().find(x=>x.invoice_id===id);
    const pays = Billing.paymentsByInvoice(id);
    UI.modal(`
      <h3>${inv.invoice_number}</h3>
      <p>${inv.church_name} — ${inv.plan_key} (${inv.billing_cycle})</p>
      <table class="table">
        <thead><tr><th>وصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${(inv.items||[]).map(it=>`<tr><td>${it.desc}</td><td>${it.qty}</td><td>${fmt(it.unit)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
      </table>
      <p><b>الإجمالي:</b> ${fmt(inv.amount)} — <b>الحالة:</b> ${badge(inv.status)}</p>
      <h4>المدفوعات</h4>
      ${pays.length ? pays.map(p=>`<div class="alert">${UI.fmt.dateTime(p.submitted_at)} — ${fmt(p.amount)} — ${badge(p.status)} ${p.proof_name?`<br><small>إثبات: ${p.proof_name}</small>`:''}${p.notes?`<br><small>${p.notes}</small>`:''}</div>`).join('') : '<p class="muted">لا توجد مدفوعات</p>'}
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
    `);
  }

  function reviewModal(pid){
    const p = Billing.allPayments().find(x=>x.payment_id===pid);
    UI.modal(`
      <h3>مراجعة دفعة</h3>
      <p>المبلغ: <b>${fmt(p.amount)}</b> · الطريقة: ${p.method} · المرجع: ${p.reference||'-'}</p>
      ${p.proof_name?`<p>إثبات الدفع: <b>${p.proof_name}</b></p>`:''}
      ${p.notes?`<p>ملاحظات الكنيسة: ${p.notes}</p>`:''}
      <label>ملاحظات المراجعة</label>
      <textarea id="rev-notes" class="input" rows="3"></textarea>
      <div style="text-align:left;margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-red" id="reject">رفض</button>
        <button class="btn btn-success" id="approve">قبول</button>
      </div>
    `);
    document.getElementById('approve').onclick = ()=>{ Billing.reviewPayment(pid,'approved', document.getElementById('rev-notes').value); UI.toast('تم القبول','success'); UI.closeModal(); render(); };
    document.getElementById('reject').onclick  = ()=>{ Billing.reviewPayment(pid,'rejected', document.getElementById('rev-notes').value); UI.toast('تم الرفض','warning'); UI.closeModal(); render(); };
  }

  render();
})();
