/* ============================================================
   DASHBOARD.js — Main overview
   ============================================================ */
(function(){
  if (!App.init('dashboard')) return;
  const s = Auth.session();

  const totalMembers = DB.count('members');
  const totalUsers = DB.count('users', u => u.is_active);
  const activeMembers = DB.count('members', m => m.member_status==='active');
  const atRisk = DB.count('members', m => m.member_status==='at_risk');
  const newMembers = DB.count('members', m => m.member_status==='new');
  const upcomingEvents = DB.count('events', e => new Date(e.starts_at) > new Date() && e.status==='open');
  const openTasks = DB.count('followup_tasks', t => t.status==='open' || t.status==='in_progress');
  const todayDonations = DB.filter('financial_transactions', t => t.type==='donation' && new Date(t.transaction_date).toDateString()===new Date().toDateString())
                          .reduce((sum,t)=>sum+(+t.amount||0),0);

  const insights = AIEngine.insights().slice(0,5);
  const recentTasks = DB.all('followup_tasks').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);

  App.render(`
    <div class="page-header">
      <div>
        <h1 class="page-title">مرحباً، ${s.full_name} 👋</h1>
        <p class="page-subtitle">${s.church_name} — نظرة عامة على نشاط الكنيسة</p>
      </div>
      <div class="flex gap-sm">
        <a href="attendance.html" class="btn btn-accent"><i class="fa-solid fa-plus"></i> جلسة حضور جديدة</a>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div>
        <div><div class="stat-value">${totalMembers}</div><div class="stat-label">إجمالي المخدومين</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div>
        <div><div class="stat-value">${activeMembers}</div><div class="stat-label">مخدومين نشطين</div></div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div><div class="stat-value">${atRisk}</div><div class="stat-label">في حالة خطر</div></div></div>
      <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-user-plus"></i></div>
        <div><div class="stat-value">${newMembers}</div><div class="stat-label">مخدومين جدد</div></div></div>
      <div class="stat-card purple"><div class="stat-icon"><i class="fa-solid fa-user-shield"></i></div>
        <div><div class="stat-value">${totalUsers}</div><div class="stat-label">مستخدمين نشطين</div></div></div>
      <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-calendar"></i></div>
        <div><div class="stat-value">${upcomingEvents}</div><div class="stat-label">فعاليات قادمة</div></div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div>
        <div><div class="stat-value">${openTasks}</div><div class="stat-label">مهام مفتوحة</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div>
        <div><div class="stat-value">${UI.fmt.money(todayDonations)}</div><div class="stat-label">تبرعات اليوم</div></div></div>
    </div>

    <div class="grid grid-2 mt-3">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-brain"></i> تحليلات AI</div>
          <a href="ai-insights.html" class="btn btn-ghost btn-sm">عرض الكل</a></div>
        ${insights.length ? insights.map(i => `
          <div style="padding:.75rem;border-inline-start:3px solid var(--${i.type==='critical'?'red':'orange'});background:var(--bg2);border-radius:8px;margin-bottom:.5rem">
            <div style="display:flex;align-items:center;gap:.5rem;font-weight:700"><i class="fa-solid ${i.icon}"></i> ${i.title}</div>
            <div style="font-size:.85rem;color:var(--text2);margin-top:.25rem">${i.body}</div>
          </div>
        `).join('') : '<div class="empty"><i class="fa-solid fa-check-circle"></i>كل شيء على ما يرام</div>'}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-hand-holding-heart"></i> مهام افتقاد حديثة</div>
          <a href="followup.html" class="btn btn-ghost btn-sm">عرض الكل</a></div>
        ${recentTasks.length ? recentTasks.map(t => {
          const m = DB.byId('members','member_id',t.member_id);
          return `<div style="padding:.75rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600">${m?.full_name || '—'}</div>
              <div style="font-size:.8rem;color:var(--text2)">${t.reason}</div>
            </div>
            <span class="badge badge-${t.priority==='high'?'red':t.priority==='medium'?'orange':'gray'}">${t.priority}</span>
          </div>`;
        }).join('') : '<div class="empty"><i class="fa-solid fa-inbox"></i>لا توجد مهام</div>'}
      </div>
    </div>

    <div class="grid grid-2 mt-3">
      <div class="card">
        <div class="card-header"><div class="card-title">معدل الحضور خلال 4 أسابيع</div></div>
        <canvas id="chart-attendance" height="120"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">توزيع المخدومين حسب المرحلة</div></div>
        <canvas id="chart-stages" height="120"></canvas>
      </div>
    </div>
  `);

  // Charts
  setTimeout(()=>{
    const sessions = DB.all('attendance_sessions').sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at)).slice(-4);
    const labels = sessions.map(s => UI.fmt.date(s.starts_at));
    const data = sessions.map(s => DB.count('attendance_records', r => r.session_id===s.session_id));
    new Chart(document.getElementById('chart-attendance'),{
      type:'line',
      data:{ labels, datasets:[{ label:'حضور', data, borderColor:'#c9a24d', backgroundColor:'rgba(201,162,77,.15)', tension:.3, fill:true }] },
      options:{ plugins:{ legend:{ display:false } } }
    });

    const stages = {};
    DB.all('members').forEach(m => { stages[m.age_stage||'غير محدد'] = (stages[m.age_stage||'غير محدد']||0)+1; });
    new Chart(document.getElementById('chart-stages'),{
      type:'doughnut',
      data:{ labels:Object.keys(stages), datasets:[{ data:Object.values(stages), backgroundColor:['#c9a24d','#22c55e','#3b82f6','#f97316','#8b5cf6','#ec4899','#14b8a6'] }] },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });
  },50);
})();
