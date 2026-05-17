/* ============================================================
   USAGE-ANALYTICS.PAGE.js — Executive BI dashboards
   ============================================================ */
(function(){
  if (!App.init('usage-analytics', ['super_admin'])) return;
  function render(){
    const ph = UsageAnalytics.platformHealth();
    const top = UsageAnalytics.topActiveChurches(10);
    const feat = UsageAnalytics.featureUsage();
    const churn = UsageAnalytics.churnRisk();
    const growth = UsageAnalytics.growthTrend();
    const revenue = UsageAnalytics.revenueTrend();
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">التحليلات والذكاء التشغيلي</h1>
        <p class="page-subtitle">رؤية تنفيذية على نمو المنصة، الاستخدام، ومخاطر الانسحاب</p>
      </div></div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-church"></i></div><div><div class="stat-value">${ph.totalT}</div><div class="stat-label">إجمالي المستأجرين</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><div><div class="stat-value">${ph.activeT}</div><div class="stat-label">نشط</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-moon"></i></div><div><div class="stat-value">${ph.inactiveT}</div><div class="stat-label">غير نشط</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${ph.warnings}</div><div class="stat-label">تحذيرات تشغيلية</div></div></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card"><h3>نمو المستأجرين</h3><canvas id="cv-growth" height="160"></canvas></div>
        <div class="card"><h3>الإيرادات (مدفوعة)</h3><canvas id="cv-rev" height="160"></canvas></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card"><h3>اعتماد الميزات</h3><canvas id="cv-feat" height="160"></canvas></div>
        <div class="card"><h3>أعلى الكنائس نشاطاً</h3>
          <table class="table"><thead><tr><th>الكنيسة</th><th>الصحة</th><th>النشاط</th></tr></thead>
          <tbody>${top.map(t=>`<tr><td>${t.church.church_name}</td><td>${t.score}%</td><td>${t.activity}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>تحليل مخاطر الانسحاب (Churn)</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>المخاطرة</th><th>المستوى</th><th>الأسباب</th></tr></thead>
          <tbody>${churn.map(r=>`<tr>
            <td>${r.church.church_name}</td>
            <td>${r.risk}%</td>
            <td><span class="badge ${r.band==='critical'?'red':r.band==='high'?'orange':r.band==='medium'?'blue':'green'}">${r.band}</span></td>
            <td><small>${r.reasons.join(' · ')||'-'}</small></td>
          </tr>`).join('')}</tbody></table>
      </div>
    `);
    new Chart(document.getElementById('cv-growth'),{ type:'line', data:{ labels:growth.labels, datasets:[{label:'كنائس جديدة',data:growth.values,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.2)',fill:true,tension:0.3}]}});
    new Chart(document.getElementById('cv-rev'),{ type:'bar', data:{ labels:revenue.labels, datasets:[{label:'إيرادات', data:revenue.values, backgroundColor:'#16a34a'}]}});
    new Chart(document.getElementById('cv-feat'),{ type:'doughnut', data:{ labels:Object.keys(feat), datasets:[{ data:Object.values(feat), backgroundColor:['#2563eb','#7c3aed','#16a34a','#f97316','#ef4444','#0ea5e9']}]}});
  }
  render();
})();
