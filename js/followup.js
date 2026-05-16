/* FOLLOWUP — task list + log actions */
(function(){
  if (!App.init('followup')) return;

  function render(){
    const tasks = DB.all('followup_tasks').sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    const open = tasks.filter(t => ['open','in_progress'].includes(t.status));
    const escalated = tasks.filter(t => t.status==='escalated' || t.escalation_level>0);
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الافتقاد والمتابعة</h1>
          <p class="page-subtitle">${open.length} مهمة مفتوحة — ${escalated.length} مُصعَّدة</p></div>
        <button class="btn btn-accent" onclick="FollowupPage.create()"><i class="fa-solid fa-plus"></i> مهمة يدوية</button>
      </div>
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div><div class="stat-value">${tasks.length}</div><div class="stat-label">إجمالي</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${open.length}</div><div class="stat-label">مفتوحة</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div><div class="stat-value">${escalated.length}</div><div class="stat-label">مُصعَّدة</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${tasks.filter(t=>t.status==='done').length}</div><div class="stat-label">منفذة</div></div></div>
      </div>
      <div class="card">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>المخدوم</th><th>السبب</th><th>مُسند إلى</th><th>الأولوية</th><th>الحالة</th><th>تصعيد</th><th></th></tr></thead>
          <tbody>${tasks.length ? tasks.map(t => {
            const m = DB.byId('members','member_id',t.member_id);
            const u = t.assigned_to ? DB._raw('users').find(x=>x.user_id===t.assigned_to) : null;
            return `<tr>
              <td><b>${m?.full_name||'—'}</b></td>
              <td>${t.reason}</td>
              <td>${u?.full_name||'—'}</td>
              <td><span class="badge badge-${t.priority==='urgent'?'red':t.priority==='high'?'orange':t.priority==='medium'?'blue':'gray'}">${t.priority}</span></td>
              <td><span class="badge badge-${t.status==='done'?'green':t.status==='escalated'?'red':'blue'}">${t.status}</span></td>
              <td>${t.escalation_level>0?`<span class="badge badge-red">L${t.escalation_level}</span>`:'—'}</td>
              <td>
                ${m?`<button class="btn btn-ghost btn-sm" onclick="WhatsApp.sendTemplate(DB.byId('members','member_id','${t.member_id}'),'absence')"><i class="fa-brands fa-whatsapp" style="color:#25d366"></i></button>`:''}
                <button class="btn btn-ghost btn-sm" onclick="FollowupPage.log('${t.task_id}')"><i class="fa-solid fa-edit"></i></button>
                ${t.status!=='done'?`<button class="btn btn-success btn-sm" onclick="FollowupPage.complete('${t.task_id}')"><i class="fa-solid fa-check"></i></button>`:''}
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-check-circle"></i>لا توجد مهام</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }

  window.FollowupPage = {
    create(){
      const members = DB.all('members');
      const users = DB.all('users');
      UI.modal(`
        <div class="modal-header"><h3>مهمة افتقاد جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="t-form">
          <div class="form-group"><label class="form-label">المخدوم</label>
            <select class="form-select" name="member_id" required>${members.map(m=>`<option value="${m.member_id}">${m.full_name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">السبب</label><input class="form-control" name="reason" required></div>
          <div class="form-group"><label class="form-label">مُسند إلى</label>
            <select class="form-select" name="assigned_to">${users.map(u=>`<option value="${u.user_id}">${u.full_name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">الأولوية</label>
            <select class="form-select" name="priority"><option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option><option value="urgent">عاجل</option></select></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="FollowupPage.save()"><i class="fa-solid fa-save"></i> حفظ</button></div>`);
    },
    save(){
      const fd = new FormData(document.getElementById('t-form'));
      const data = Object.fromEntries(fd.entries());
      data.status = 'open'; data.created_by = Auth.session().user_id;
      data.due_at = new Date(Date.now() + 48*36e5).toISOString();
      DB.insert('followup_tasks', data);
      UI.toast('تم إنشاء المهمة','success'); UI.closeModal(); render();
    },
    log(tid){
      UI.modal(`<div class="modal-header"><h3>تسجيل إجراء</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="log-form">
          <div class="form-group"><label class="form-label">الإجراء</label>
            <select class="form-select" name="action"><option value="called">اتصال</option><option value="visited">زيارة</option><option value="whatsapp">واتساب</option><option value="no_response">لا يرد</option></select></div>
          <div class="form-group"><label class="form-label">النتيجة</label><textarea class="form-control" name="result"></textarea></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="FollowupPage.saveLog('${tid}')">حفظ</button></div>`);
    },
    saveLog(tid){
      const fd = new FormData(document.getElementById('log-form'));
      const data = Object.fromEntries(fd.entries());
      DB.insert('followup_logs', { task_id:tid, ...data, performed_by:Auth.session().user_id, performed_at:new Date().toISOString() });
      DB.update('followup_tasks','task_id',tid,{ status:'in_progress' });
      UI.toast('تم تسجيل الإجراء','success'); UI.closeModal(); render();
    },
    complete(tid){
      DB.update('followup_tasks','task_id',tid,{ status:'done' });
      UI.toast('تم إنهاء المهمة','success'); render();
    }
  };
  render();
})();
