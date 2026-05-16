/* ============================================================
   NOTIFICATIONS-UI.js — Topbar dropdown with realtime-like polling
   ============================================================ */
(function(){
  function init(){
    const s = window.Auth && Auth.session && Auth.session();
    if (!s) return;
    // upgrade bell in topbar
    document.addEventListener('click', e => {
      const dd = document.getElementById('notif-dd');
      if (dd && !e.target.closest('#notif-dd') && !e.target.closest('[data-notif-bell]')) dd.classList.remove('open');
    });
    setTimeout(upgradeBell, 100);
    setInterval(refresh, 8000);
  }

  function upgradeBell(){
    const bell = document.querySelector('.topbar-actions a[href="notifications.html"]');
    if (!bell) return;
    bell.setAttribute('data-notif-bell','');
    bell.removeAttribute('href');
    bell.onclick = e => { e.preventDefault(); toggle(); };
    if (!document.getElementById('notif-dd')) document.body.insertAdjacentHTML('beforeend', `<div class="notif-dd" id="notif-dd"></div>`);
    refresh();
  }

  function refresh(){
    const s = Auth.session(); if (!s) return;
    try { window.NotificationsEngine && NotificationsEngine.runAll && NotificationsEngine.runAll(); } catch(_){}
    const unread = DB.count('notifications', n => n.user_id===s.user_id && !n.is_read);
    const bell = document.querySelector('[data-notif-bell]');
    if (bell){
      const old = bell.querySelector('.dot, .badge-count'); old && old.remove();
      if (unread > 0){
        bell.insertAdjacentHTML('beforeend', `<span class="badge-count" style="position:absolute;top:-4px;inset-inline-end:-4px;background:var(--red);color:#fff;border-radius:999px;padding:1px 6px;font-size:.65rem;font-weight:700">${unread>99?'99+':unread}</span>`);
        bell.style.position='relative';
      }
    }
    const dd = document.getElementById('notif-dd');
    if (dd && dd.classList.contains('open')) renderDD(dd);
  }

  function toggle(){
    const dd = document.getElementById('notif-dd');
    if (!dd) return;
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) renderDD(dd);
  }

  function renderDD(dd){
    const s = Auth.session();
    const items = DB.filter('notifications', n => n.user_id===s.user_id)
      .sort((a,b)=> (prio(b)-prio(a)) || (new Date(b.created_at)-new Date(a.created_at)))
      .slice(0, 20);
    const unread = items.filter(n => !n.is_read).length;
    dd.innerHTML = `
      <header>
        <div><b><i class="fa-solid fa-bell"></i> الإشعارات</b> <span class="badge badge-blue" style="margin-inline-start:.4rem">${unread} جديد</span></div>
        <div style="display:flex;gap:.3rem">
          <button class="btn btn-ghost btn-sm" onclick="NotifUI.markAll()"><i class="fa-solid fa-check-double"></i></button>
          <a class="btn btn-ghost btn-sm" href="notifications.html"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        </div>
      </header>
      ${items.length ? items.map(n => `
        <div class="ni ${!n.is_read?'unread':''}" onclick="NotifUI.open('${n.notification_id}')">
          <i class="dot" style="background:var(--${color(n.priority)})"></i>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${n.title||'إشعار'}</div>
            <div style="color:var(--text2);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.body||''}</div>
            <div class="nb">${UI.fmt.relative(n.created_at)} · <span class="prio ${n.priority||'low'}">${n.priority||'low'}</span></div>
          </div>
        </div>
      `).join('') : '<div class="ni" style="justify-content:center;color:var(--text2)">لا توجد إشعارات</div>'}
    `;
  }
  function prio(n){ return ({critical:4,high:3,medium:2,low:1})[n.priority]||0; }
  function color(p){ return p==='critical'?'red':p==='high'?'orange':p==='medium'?'blue':'text3'; }

  window.NotifUI = {
    toggle, refresh,
    markAll(){
      const s = Auth.session();
      DB.filter('notifications', n => n.user_id===s.user_id && !n.is_read).forEach(n => { n.is_read = true; DB.update('notifications','notification_id',n.notification_id,n); });
      refresh();
      UI.toast('تم تحديد الكل كمقروء','success');
    },
    open(id){
      const n = DB.byId('notifications','notification_id',id);
      if (!n) return;
      n.is_read = true; DB.update('notifications','notification_id',id,n);
      if (n.link) location.href = n.link; else location.href='notifications.html';
    }
  };

  window.addEventListener('DOMContentLoaded', init);
})();
