/* ============================================================
   ANALYTICS-PAGE.js — Executive overview, health, risks, scorecards
   ============================================================ */
(function(){
  if (!App.init('analytics')) return;

  const H = AnalyticsEngine.churchHealth();
  const risks = AnalyticsEngine.risks();
  const insights = AnalyticsEngine.insights();
  const ministries = AnalyticsEngine.ministryScorecard().slice(0,8);
  const servants = AnalyticsEngine.servantScorecard().slice(0,8);
  const trend = AnalyticsEngine.attendanceTrend(90);

  function gaugeSvg(score){
    const r=60, c=Math.PI*r;
    const offset = c - (score/100)*c;
    const color = score>=75?'#22c55e':score>=55?'#eab308':'#ef4444';
    return `<svg viewBox="0 0 160 90">
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="var(--bg2)" stroke-width="14" stroke-linecap="round"/>
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset .8s"/>
    </svg>`;
  }
  const pill = s => s>=75?'good':s>=55?'warn':'bad';

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title"><i class="fa-solid fa-chart-mixed"></i> التحليلات والذكاء التشغيلي</h1>
        <p class="page-subtitle">نظرة تنفيذية على صحة الكنيسة والمخاطر والأداء</p></div>
      <a class="btn btn-ghost" href="ai-insights.html"><i class="fa-solid fa-brain"></i> رؤى AI</a>
    </div>

    <div style="display:grid;grid-template-columns:1fr 2fr;gap:1rem;margin-bottom:1rem">
      <div class="card" style="text-align:center">
        <div class="card-header" style="justify-content:center"><div class="card-title">مؤشر صحة الكنيسة</div></div>
        <div class="gauge">${gaugeSvg(H.score)}<div class="gauge-val">${H.score}</div></div>
        <div style="margin-top:.5rem"><span class="score-pill ${pill(H.score)}">${H.score>=75?'صحي':H.score>=55?'يحتاج انتباه':'حرج'}</span></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">تفصيل المؤشر</div></div>
        ${Object.entries(H.parts).map(([k,v])=>`
          <div style="margin-bottom:.6rem">
            <div class="flex-between" style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.2rem">
              <span>${({attendance:'الحضور',workflow:'كفاءة Workflows',followup:'الافتقاد',servants:'نشاط الخدام',finance:'الاستقرار المالي'})[k]}</span>
              <b>${Math.round(v)}%</b>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(v)}%;background:linear-gradient(90deg,${v>=75?'#22c55e':v>=55?'#eab308':'#ef4444'},${v>=75?'#16a34a':v>=55?'#ca8a04':'#dc2626'})"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> المخاطر المكتشفة</div></div>
        ${risks.length ? risks.map(r=>`
          <div style="padding:.7rem;background:var(--bg2);border-inline-start:3px solid var(--${r.sev==='critical'?'red':r.sev==='high'?'orange':'blue'});border-radius:8px;margin-bottom:.5rem">
            <div style="font-weight:600">${r.msg}</div>
            ${r.delta?`<div style="font-size:.78rem;color:var(--text2)">التغير: ${r.delta}</div>`:''}
            ${r.list?`<div style="font-size:.78rem;color:var(--text2)">أمثلة: ${r.list.join('، ')}</div>`:''}
            <span class="prio ${r.sev}" style="margin-top:.3rem">${r.sev}</span>
          </div>`).join('') : '<div class="empty">لا توجد مخاطر مرصودة</div>'}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-lightbulb"></i> رؤى تشغيلية</div></div>
        ${insights.map(i=>`
          <div style="padding:.6rem;background:var(--bg2);border-inline-start:3px solid var(--${i.sev==='critical'?'red':i.sev==='high'?'orange':'green'});border-radius:8px;margin-bottom:.5rem;font-size:.88rem">
            <i class="fa-solid ${i.icon}"></i> ${i.text}
          </div>`).join('')}
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-line"></i> اتجاه الحضور (90 يوم)</div></div>
      <canvas id="attTrend" height="80"></canvas>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-church"></i> أداء الفصول / الخدمات</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الفصل</th><th>جلسات</th><th>حضور</th><th>التقييم</th></tr></thead>
          <tbody>${ministries.map(m=>`<tr><td>${m.name}</td><td>${m.sessions}</td><td>${m.attendances}</td>
            <td><span class="score-pill ${pill(m.score)}">${m.score}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">لا توجد بيانات</div></td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-user-tie"></i> بطاقات أداء الخدام</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الخادم</th><th>مكتمل</th><th>مفتوح</th><th>التقييم</th></tr></thead>
          <tbody>${servants.map(s=>`<tr><td>${s.name}</td><td>${s.completed}</td><td>${s.open}</td>
            <td><span class="score-pill ${pill(s.score)}">${s.score}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">لا توجد بيانات</div></td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
  `);

  setTimeout(()=>{
    if (!window.Chart) return;
    const c = document.getElementById('attTrend');
    c && new Chart(c, { type:'line', data:{ labels:trend.labels, datasets:[{ label:'حضور', data:trend.values, borderColor:'#c9a24d', backgroundColor:'rgba(201,162,77,.18)', fill:true, tension:.35, pointRadius:0 }]}, options:{ responsive:true, plugins:{ legend:{ display:false }}, scales:{ x:{ display:false }}}});
  }, 50);
})();
