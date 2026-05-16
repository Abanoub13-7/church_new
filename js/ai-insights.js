/* AI INSIGHTS — risk dashboard */
(function(){
  if (!App.init('ai-insights')) return;
  AIEngine.recomputeAll();
  const scores = DB.all('member_risk_scores');
  const insights = AIEngine.insights();
  const byLevel = { critical:[], high:[], medium:[], low:[] };
  scores.forEach(s => byLevel[s.risk_level]?.push(s));

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title">تحليلات AI</h1>
        <p class="page-subtitle">محرك تحليل السلوك — مُحدَّث الآن</p></div>
      <button class="btn btn-accent" onclick="AIEngine.recomputeAll();location.reload()"><i class="fa-solid fa-rotate"></i> إعادة الحساب</button>
    </div>
    <div class="grid grid-4 mb-3">
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div><div class="stat-value">${byLevel.critical.length}</div><div class="stat-label">حرج</div></div></div>
      <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${byLevel.high.length}</div><div class="stat-label">عالي</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-circle-exclamation"></i></div><div><div class="stat-value">${byLevel.medium.length}</div><div class="stat-label">متوسط</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="stat-value">${byLevel.low.length}</div><div class="stat-label">منخفض</div></div></div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-lightbulb"></i> رؤى ذكية</div></div>
      ${insights.length ? insights.map(i=>`
        <div style="padding:1rem;border-inline-start:4px solid var(--${i.type==='critical'?'red':'orange'});background:var(--bg2);border-radius:8px;margin-bottom:.5rem">
          <div style="font-weight:700"><i class="fa-solid ${i.icon}"></i> ${i.title}</div>
          <div style="color:var(--text2);font-size:.9rem;margin-top:.25rem">${i.body}</div>
        </div>`).join('') : '<div class="empty"><i class="fa-solid fa-check-circle"></i>كل المخدومين بحالة جيدة</div>'}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">المخدومين حسب درجة الخطر</div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>المخدوم</th><th>الدرجة</th><th>المستوى</th><th>العوامل</th><th>التوصية</th></tr></thead>
        <tbody>${scores.sort((a,b)=>b.score-a.score).map(s => {
          const m = DB.byId('members','member_id',s.member_id);
          return `<tr>
            <td><b>${m?.full_name||'—'}</b></td>
            <td><b>${s.score}/100</b></td>
            <td><span class="badge risk-${s.risk_level}">${s.risk_level}</span></td>
            <td>${Object.keys(s.factors||{}).map(k=>`<span class="badge badge-gray">${k}</span>`).join(' ')}</td>
            <td style="font-size:.85rem">${s.recommendation||'—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="5"><div class="empty">لا بيانات</div></td></tr>'}</tbody>
      </table></div>
    </div>
  `);
})();
