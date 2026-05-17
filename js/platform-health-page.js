/* ============================================================
   PLATFORM-HEALTH.PAGE.js — System overview for super admin
   ============================================================ */
(function(){
  if (!App.init('platform-health', ['super_admin'])) return;
  function render(){
    const ph = UsageAnalytics.platformHealth();
    const churches = DB._raw('churches');
    const allLogs = JSON.parse(localStorage.getItem('church_db_v1')||'{}').audit_logs||[];
    const today = new Date().toISOString().slice(0,10);
    const todayLogs = allLogs.filter(l=>l.created_at.startsWith(today)).length;
    const breakdown = churches.map(c=>{
      const h = TenantMgmt.health(c.church_id);
      const op = TenantMgmt.operational(c.church_id);
      const u = TenantMgmt.usage(c.church_id);
      return { c, h, op, u };
    });
    const overloaded = breakdown.filter(b=>{
      const v = TenantMgmt.usageVsLimits(b.c.church_id);
      return v.members.pct>=90 || v.storage_mb.pct>=90 || v.users.pct>=90;
    });
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">صحة المنصة</h1>
        <p class="page-subtitle">حالة التشغيل، الوحدات المحملة، والتحذيرات العامة</p>
      </div></div>
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-server"></i></div><div><div class="stat-value">${ph.totalT}</div><div class="stat-label">المستأجرون</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="stat-value">${ph.activeT}</div><div class="stat-label">نشطون</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div><div><div class="stat-value">${todayLogs}</div><div class="stat-label">حدث اليوم</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${overloaded.length}</div><div class="stat-label">وحدات محملة بشدة</div></div></div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h3>تفصيل تشغيلي بالكنائس</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>الصحة</th><th>دخول 30ي</th><th>حضور 30ي</th><th>workflows</th><th>ماليات</th><th>تخزين</th></tr></thead>
          <tbody>${breakdown.map(b=>`<tr>
            <td>${b.c.church_name}</td>
            <td><span class="badge ${b.h.band==='green'?'green':b.h.band==='blue'?'blue':b.h.band==='orange'?'orange':'red'}">${b.h.score}%</span></td>
            <td>${b.op.loginActivity}</td><td>${b.op.engagement}</td><td>${b.op.workflowActivity}</td><td>${b.op.financeUsage}</td>
            <td>${b.u.storage_mb} MB</td>
          </tr>`).join('')}</tbody></table>
      </div>

      ${overloaded.length?`<div class="card">
        <div class="card-header"><h3 style="color:var(--red)">تحذيرات وحدات محملة</h3></div>
        ${overloaded.map(b=>{
          const v = TenantMgmt.usageVsLimits(b.c.church_id);
          return `<div class="alert">⚠️ <b>${b.c.church_name}</b> — المخدومون ${v.members.pct}% · التخزين ${v.storage_mb.pct}% · المستخدمون ${v.users.pct}%</div>`;
        }).join('')}
      </div>`:''}
    `);
  }
  render();
})();
