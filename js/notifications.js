/* NOTIFICATIONS — with priority + dedupe */
(function(){
  if (!App.init('notifications')) return;
  const s = Auth.session();
  // refresh smart alerts on visit
  try{ NotificationsEngine.runAll(); }catch(_){}

  const all = DB.filter('notifications', n => n.user_id === s.user_id)
    .sort((a,b)=> (({critical:4,high:3,medium:2,low:1})[b.priority]||0) - (({critical:4,high:3,medium:2,low:1})[a.priority]||0)
                  || new Date(b.created_at)-new Date(a.created_at));

  const pColor = p => p==='critical'?'red':p==='high'?'yellow':p==='medium'?'blue':'gray';

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title">الإشعارات</h1><p class="page-subtitle">${all.filter(n=>!n.is_read).length} غير مقروء — مرتبة بالأولوية</p></div>
      <button class="btn btn-ghost" onclick="NotificationsPage.markAll()">
        <i class="fa-solid fa-check-double"></i> تحديد الكل كمقروء
      </button>
    </div>
    <div class="card">
      ${all.length ? all.map(n => `
        <div class="${!n.is_read?'unread':''}" data-id="${n.notification_id}" style="padding:1rem;border-bottom:1px solid var(--border);${!n.is_read?'background:var(--bg2)':''}">
          <div class="flex-between">
            <div style="display:flex;gap:.75rem;align-items:flex-start">
              <i class="fa-solid fa-${n.type==='alert'?'triangle-exclamation':n.type==='task'?'list-check':n.type==='ai_insight'?'brain':n.type==='workflow'?'diagram-project':'bell'}" style="color:var(--accent);font-size:1.2rem"></i>
              <div>
                <div style="font-weight:700">${n.title}
                  ${n.priority?`<span class="badge badge-${pColor(n.priority)}" style="font-size:.65rem">${n.priority}</span>`:''}
                </div>
                <div style="color:var(--text2);font-size:.9rem">${n.body||''}</div>
                <div style="color:var(--text3);font-size:.75rem;margin-top:.25rem">${UI.fmt.relative(n.created_at)}</div>
              </div>
            </div>
            ${n.link?`<a href="${n.link}" class="btn btn-ghost btn-sm" onclick="NotificationsPage.mark('${n.notification_id}')">فتح</a>`:''}
          </div>
        </div>`).join('') : '<div class="empty"><i class="fa-solid fa-bell-slash"></i>لا توجد إشعارات</div>'}
    </div>
  `);

  window.NotificationsPage = {
    mark(id){ DB.update('notifications','notification_id', id, { is_read:true, read_at:new Date().toISOString() }); },
    markAll(){
      all.filter(n=>!n.is_read).forEach(n=> DB.update('notifications','notification_id', n.notification_id, { is_read:true, read_at:new Date().toISOString() }));
      location.reload();
    }
  };
})();
