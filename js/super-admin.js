/* SUPER ADMIN — platform-level dashboard
   عرض بيانات تشغيلية فقط — لا يصل لبيانات الأعضاء أو الافتقاد
*/
(function(){
  if (!App.init('super-admin', ['super_admin'])) return;

  const churches = DB._raw('churches');
  const allUsers = DB._raw('users').filter(u => u.role !== 'super_admin');
  const totalChurches = churches.length;
  const activeChurches = churches.filter(c => c.subscription_status==='active').length;
  const trialChurches = churches.filter(c => c.subscription_status==='trial').length;

  // aggregate member count via raw — for display only (count only, no PII)
  const memberCountByChurch = {};
  const allMembers = JSON.parse(localStorage.getItem('church_db_v1')||'{}').members || [];
  allMembers.forEach(m => { memberCountByChurch[m.church_id] = (memberCountByChurch[m.church_id]||0)+1; });

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title">لوحة المنصة (Super Admin)</h1>
        <p class="page-subtitle">إدارة الكنائس المشتركة في المنصة</p></div>
    </div>

    <div class="card mb-3" style="background:rgba(239,68,68,.08);border-color:var(--red)">
      <div style="display:flex;gap:.75rem"><i class="fa-solid fa-shield-halved" style="color:var(--red);font-size:1.5rem"></i>
      <div><b>عزل البيانات مفعّل:</b> لا يمكنك الوصول لبيانات الأعضاء أو الاعترافات أو الافتقاد أو الحضور التفصيلي لأي كنيسة. الوصول مقتصر على معلومات الاشتراك والاستخدام التجميعية فقط.</div></div>
    </div>

    <div class="grid grid-4 mb-3">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-church"></i></div><div><div class="stat-value">${totalChurches}</div><div class="stat-label">إجمالي الكنائس</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${activeChurches}</div><div class="stat-label">اشتراك نشط</div></div></div>
      <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${trialChurches}</div><div class="stat-label">في الفترة التجريبية</div></div></div>
      <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div><div class="stat-value">${allUsers.length}</div><div class="stat-label">إجمالي المستخدمين</div></div></div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">الكنائس المشتركة</div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>الشعار</th><th>اسم الكنيسة</th><th>الكود</th><th>الخطة</th><th>الاشتراك</th><th>المستخدمين</th><th>المخدومين</th><th>آخر نشاط</th></tr></thead>
        <tbody>${churches.map(c => {
          const users = allUsers.filter(u => u.church_id===c.church_id);
          const admin = users.find(u => u.user_id===c.church_admin_id);
          return `<tr>
            <td><div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-d));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${c.church_name.charAt(0)}</div></td>
            <td><b>${c.church_name}</b><div class="text-muted" style="font-size:.75rem">Admin: ${admin?.full_name||'—'}</div></td>
            <td><code>${c.church_code}</code></td>
            <td><span class="badge badge-${c.subscription_plan==='enterprise'?'purple':c.subscription_plan==='pro'?'blue':'gray'}">${c.subscription_plan}</span></td>
            <td><span class="badge badge-${c.subscription_status==='active'?'green':c.subscription_status==='trial'?'orange':'red'}">${c.subscription_status}</span></td>
            <td>${users.length}</td>
            <td>${memberCountByChurch[c.church_id]||0}</td>
            <td>${UI.fmt.relative(users.map(u=>u.last_login).filter(Boolean).sort().pop())}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>

    <div class="grid grid-2 mt-3">
      <div class="card">
        <div class="card-header"><div class="card-title">توزيع خطط الاشتراك</div></div>
        <canvas id="chart-plans" height="120"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">نمو الكنائس</div></div>
        <canvas id="chart-growth" height="120"></canvas>
      </div>
    </div>
  `);

  setTimeout(()=>{
    const planCounts = {};
    churches.forEach(c => planCounts[c.subscription_plan] = (planCounts[c.subscription_plan]||0)+1);
    new Chart(document.getElementById('chart-plans'),{
      type:'doughnut', data:{ labels:Object.keys(planCounts), datasets:[{ data:Object.values(planCounts), backgroundColor:['#c9a24d','#3b82f6','#8b5cf6','#22c55e'] }] },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });
    // growth by month
    const months = {}; churches.forEach(c => { const k = c.created_at?.slice(0,7); if(k) months[k]=(months[k]||0)+1; });
    new Chart(document.getElementById('chart-growth'),{
      type:'bar', data:{ labels:Object.keys(months).sort(), datasets:[{ label:'كنائس جديدة', data:Object.keys(months).sort().map(k=>months[k]), backgroundColor:'#c9a24d' }] },
      options:{ plugins:{ legend:{ display:false } } }
    });
  },50);
})();
