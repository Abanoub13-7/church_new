/* SECURITY admin page */
(function(){
  if (!App.init('security', ['church_admin','super_admin'])) return;
  function render(){
    const events = Security.listEvents().slice(0,100);
    const locks = Security.listLocks();
    const session = Auth.session();
    const sevColor = s => s==='critical'?'red':s==='warning'?'yellow':'blue';
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title"><i class="fa-solid fa-shield-halved"></i> الأمان</h1>
        <p class="page-subtitle">إدارة الجلسات والأحداث الأمنية وحماية الدخول</p></div>
        <button class="btn btn-ghost" onclick="location.reload()"><i class="fa-solid fa-rotate"></i> تحديث</button>
      </div>

      <div class="grid grid-3 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-check"></i></div>
          <div><div class="stat-value">${session?1:0}</div><div class="stat-label">جلسة نشطة (هذا المتصفح)</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-lock"></i></div>
          <div><div class="stat-value">${locks.filter(l=>l.locked_until>Date.now()).length}</div><div class="stat-label">حسابات مقفلة</div></div></div>
        <div class="stat-card yellow"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div><div class="stat-value">${events.filter(e=>e.severity==='warning'||e.severity==='critical').length}</div><div class="stat-label">أحداث تحذيرية</div></div></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> الجلسة الحالية</div></div>
          ${session ? `<div style="padding:1rem"><div><b>${session.full_name}</b> — ${session.role}</div>
            <div style="color:var(--text2);font-size:.85rem">تسجيل: ${UI.fmt.dateTime(session.logged_at)}</div>
            <div style="color:var(--text2);font-size:.85rem">انتهاء: ${UI.fmt.dateTime(new Date(session.expires_at).toISOString())}</div>
            <div style="color:var(--text2);font-size:.85rem">آخر نشاط: ${UI.fmt.relative(session.last_activity)}</div>
            <button class="btn btn-danger btn-sm mt-2" onclick="Auth.logout()"><i class="fa-solid fa-power-off"></i> إنهاء الجلسة</button>
          </div>` : '<div class="empty">لا توجد جلسة</div>'}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-user-lock"></i> حسابات مقفلة</div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>البريد</th><th>محاولات فاشلة</th><th>قفل حتى</th><th></th></tr></thead>
            <tbody>${locks.length? locks.map(l=>`<tr>
              <td>${l.email}</td><td>${l.fails||0}</td>
              <td>${l.locked_until>Date.now()? UI.fmt.dateTime(new Date(l.locked_until).toISOString()):'—'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="Security.unlock('${l.email}');location.reload()"><i class="fa-solid fa-lock-open"></i> فتح</button></td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="empty">لا يوجد حسابات مقفلة</div></td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-list"></i> آخر الأحداث الأمنية</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الوقت</th><th>النوع</th><th>الخطورة</th><th>تفاصيل</th></tr></thead>
          <tbody>${events.length? events.map(e=>`<tr>
            <td>${UI.fmt.dateTime(e.at)}</td>
            <td><code>${e.type}</code></td>
            <td><span class="badge badge-${sevColor(e.severity)}">${e.severity}</span></td>
            <td><code style="font-size:.75rem">${JSON.stringify(e.meta||{})}</code></td>
          </tr>`).join('') : '<tr><td colspan="4"><div class="empty">لا توجد أحداث</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }
  render();
})();
