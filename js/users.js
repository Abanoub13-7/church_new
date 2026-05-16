/* USERS — manage login accounts */
(function(){
  if (!App.init('users', ['church_admin','service_admin'])) return;

  function render(){
    const users = DB.all('users').filter(u => u.role !== 'super_admin');
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">المستخدمين</h1>
          <p class="page-subtitle">حسابات الدخول للنظام — ${users.length} مستخدم</p></div>
        <button class="btn btn-accent" onclick="UsersPage.showForm()"><i class="fa-solid fa-user-plus"></i> مستخدم جديد</button>
      </div>
      <div class="card mb-2" style="background:rgba(59,130,246,.08);border-color:var(--blue)">
        <div style="display:flex;gap:.75rem;align-items:flex-start">
          <i class="fa-solid fa-circle-info" style="color:var(--blue);font-size:1.5rem"></i>
          <div><b>تنبيه معماري:</b> "المستخدم" هو شخص له حساب دخول للنظام (خادم/إداري).
          أما "المخدوم" فهو شخص داخل الكنيسة وقد لا يحتاج حساب — يُدار من صفحة المخدومين.</div>
        </div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>مخدوم مرتبط</th><th>آخر دخول</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${users.map(u => {
          const linkedMember = u.member_id ? DB.byId('members','member_id',u.member_id) : null;
          return `<tr>
            <td><b>${u.full_name}</b></td>
            <td dir="ltr">${u.email}</td>
            <td><span class="badge badge-blue">${roleLabel(u.role)}</span></td>
            <td>${linkedMember?.full_name||'<span class="text-muted">— لا يوجد —</span>'}</td>
            <td>${UI.fmt.relative(u.last_login)}</td>
            <td>${u.is_active ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">معطل</span>'}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="UsersPage.toggle('${u.user_id}')"><i class="fa-solid fa-power-off"></i></button>
              <button class="btn btn-ghost btn-sm" onclick="UsersPage.edit('${u.user_id}')"><i class="fa-solid fa-edit"></i></button>
            </td></tr>`;
        }).join('')}</tbody></table></div>
    `);
  }
  function roleLabel(r){ return ({church_admin:'مدير الكنيسة',service_admin:'أمين الخدمة',servant:'خادم',supervisor:'مشرف',finance:'محاسب',viewer:'عرض'})[r]||r; }

  window.UsersPage = {
    showForm(u){
      u = u || {};
      const members = DB.all('members');
      UI.modal(`
        <div class="modal-header"><h3>${u.user_id?'تعديل':'مستخدم جديد'}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="user-form">
          <div class="form-group"><label class="form-label">الاسم</label><input class="form-control" name="full_name" value="${u.full_name||''}" required></div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">البريد</label><input class="form-control" type="email" name="email" value="${u.email||''}" required></div>
            <div class="form-group"><label class="form-label">كلمة المرور</label><input class="form-control" name="password_hash" value="${u.password_hash||''}" placeholder="${u.user_id?'اتركها فارغة للإبقاء':''}"></div>
          </div>
          <div class="form-group"><label class="form-label">الدور</label>
            <select class="form-select" name="role">
              ${['church_admin','service_admin','servant','supervisor','finance','viewer'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">ربط بمخدوم (اختياري)</label>
            <select class="form-select" name="member_id">
              <option value="">— لا يوجد —</option>
              ${members.map(m=>`<option value="${m.member_id}" ${u.member_id===m.member_id?'selected':''}>${m.full_name}</option>`).join('')}
            </select></div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="UsersPage.save('${u.user_id||''}')"><i class="fa-solid fa-save"></i> حفظ</button>
        </div>`);
    },
    save(id){
      const fd = new FormData(document.getElementById('user-form'));
      const data = Object.fromEntries(fd.entries());
      if (!data.member_id) data.member_id = null;
      if (id){
        if (!data.password_hash) delete data.password_hash;
        DB.update('users','user_id',id,data);
      } else {
        data.is_active = true;
        DB.insert('users', data);
      }
      UI.toast('تم الحفظ','success'); UI.closeModal(); render();
    },
    edit(id){ UsersPage.showForm(DB.byId('users','user_id',id)); },
    toggle(id){
      const u = DB.byId('users','user_id',id);
      DB.update('users','user_id',id,{ is_active: !u.is_active });
      render();
    }
  };
  render();
})();
