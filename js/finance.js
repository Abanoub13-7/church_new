/* FINANCE */
(function(){
  if (!App.init('finance', ['church_admin','finance'])) return;

  function render(){
    const txns = DB.all('financial_transactions').sort((a,b)=> new Date(b.transaction_date)-new Date(a.transaction_date));
    const income = txns.filter(t=>['donation','tithe','event_payment'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const expense = txns.filter(t=>['expense','salary'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الماليات</h1><p class="page-subtitle">${txns.length} معاملة</p></div>
        <button class="btn btn-accent" onclick="FinancePage.add()"><i class="fa-solid fa-plus"></i> معاملة جديدة</button>
      </div>
      <div class="grid grid-3 mb-3">
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-arrow-up"></i></div><div><div class="stat-value">${UI.fmt.money(income)}</div><div class="stat-label">الدخل</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-arrow-down"></i></div><div><div class="stat-value">${UI.fmt.money(expense)}</div><div class="stat-label">المصروفات</div></div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-wallet"></i></div><div><div class="stat-value">${UI.fmt.money(income-expense)}</div><div class="stat-label">الرصيد</div></div></div>
      </div>
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>التاريخ</th><th>النوع</th><th>الفئة</th><th>المبلغ</th><th>طريقة الدفع</th><th>الوصف</th></tr></thead>
        <tbody>${txns.map(t=>`<tr>
          <td>${UI.fmt.date(t.transaction_date)}</td>
          <td><span class="badge badge-${['expense','salary'].includes(t.type)?'red':'green'}">${t.type}</span></td>
          <td>${t.category||'—'}</td>
          <td><b>${UI.fmt.money(t.amount)}</b></td>
          <td>${t.payment_method||'—'}</td>
          <td>${t.description||'—'}</td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty">لا توجد معاملات</div></td></tr>'}</tbody>
      </table></div></div>
    `);
  }

  window.FinancePage = {
    add(){
      UI.modal(`<div class="modal-header"><h3>معاملة جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="fin-form">
          <div class="form-group"><label class="form-label">النوع</label>
            <select class="form-select" name="type"><option value="donation">تبرع</option><option value="tithe">عشور</option><option value="event_payment">دفع فعالية</option><option value="expense">مصروف</option><option value="salary">راتب</option></select></div>
          <div class="form-group"><label class="form-label">المبلغ</label><input class="form-control" type="number" name="amount" required></div>
          <div class="form-group"><label class="form-label">الفئة</label><input class="form-control" name="category"></div>
          <div class="form-group"><label class="form-label">طريقة الدفع</label>
            <select class="form-select" name="payment_method"><option value="cash">نقدي</option><option value="bank">بنك</option><option value="online">أونلاين</option></select></div>
          <div class="form-group"><label class="form-label">الوصف</label><textarea class="form-control" name="description"></textarea></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="FinancePage.save()">حفظ</button></div>`);
    },
    save(){
      const fd = new FormData(document.getElementById('fin-form'));
      const data = Object.fromEntries(fd.entries());
      data.amount = +data.amount;
      data.transaction_date = new Date().toISOString();
      data.recorded_by = Auth.session().user_id;
      DB.insert('financial_transactions', data);
      UI.toast('تمت الإضافة','success'); UI.closeModal(); render();
    }
  };
  render();
})();
