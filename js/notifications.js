/* NOTIFICATIONS */
(function(){
  if (!App.init('notifications')) return;
  const s = Auth.session();
  const all = DB.filter('notifications', n => n.user_id === s.user_id).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title">الإشعارات</h1><p class="page-subtitle">${all.filter(n=>!n.is_read).length} غير مقروء</p></div>
      <button class="btn btn-ghost" onclick="document.querySelectorAll('.unread').forEach(el=>DB.update('notifications','notification_id',el.dataset.id,{is_read:true}));location.reload()">
        <i class="fa-solid fa-check-double"></i> تحديد الكل كمقروء
      </button>
    </div>
    <div class="card">
      ${all.length ? all.map(n => `
        <div class="${!n.is_read?'unread':''}" data-id="${n.notification_id}" style="padding:1rem;border-bottom:1px solid var(--border);${!n.is_read?'background:var(--bg2)':''}">
          <div class="flex-between">
            <div style="display:flex;gap:.75rem;align-items:flex-start">
              <i class="fa-solid fa-${n.type==='alert'?'triangle-exclamation':n.type==='task'?'list-check':n.type==='ai_insight'?'brain':'bell'}" style="color:var(--accent);font-size:1.2rem"></i>
              <div>
                <div style="font-weight:700">${n.title}</div>
                <div style="color:var(--text2);font-size:.9rem">${n.body||''}</div>
                <div style="color:var(--text3);font-size:.75rem;margin-top:.25rem">${UI.fmt.relative(n.created_at)}</div>
              </div>
            </div>
            ${n.link?`<a href="${n.link}" class="btn btn-ghost btn-sm">فتح</a>`:''}
          </div>
        </div>`).join('') : '<div class="empty"><i class="fa-solid fa-bell-slash"></i>لا توجد إشعارات</div>'}
    </div>
  `);
})();
