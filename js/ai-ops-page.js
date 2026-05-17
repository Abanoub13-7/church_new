/* ============================================================
   AI-OPS.PAGE.js — Executive AI insights & recommendations
   ============================================================ */
(function(){
  if (!App.init('ai-ops', ['super_admin'])) return;
  function render(){
    const insights = AIOps.platformInsights();
    const churches = DB._raw('churches');
    const ranked = churches.map(c=>({ c, ...AIOps.churchRisk(c.church_id) })).sort((a,b)=>b.risk-a.risk);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">رؤى الذكاء التشغيلي</h1>
        <p class="page-subtitle">توصيات تنفيذية، نقاط مخاطرة، وتنبيهات ذكية على مستوى المنصة</p>
      </div></div>

      <div class="card mb-3"><div class="card-header"><h3><i class="fa-solid fa-brain"></i> رؤى المنصة</h3></div>
        ${insights.length ? insights.map(i=>`<div class="alert ${i.severity==='danger'?'red':i.severity==='warning'?'orange':'blue'}" style="margin-bottom:.5rem">
          <b>${i.title}</b> — ${i.detail}</div>`).join('') : '<p class="muted">لا توجد تنبيهات الآن. الكل بخير ✓</p>'}
      </div>

      <div class="card mb-3"><div class="card-header"><h3>نقاط مخاطرة الكنائس</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>المخاطرة</th><th>المستوى</th><th>الصحة</th><th>تنبيهات</th><th></th></tr></thead>
          <tbody>${ranked.map(r=>`<tr>
            <td>${r.c.church_name}</td>
            <td><div style="width:80px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:${r.risk}%;background:${r.color};height:8px"></div></div>${r.risk}%</td>
            <td><b style="color:${r.color}">${r.band}</b></td>
            <td>${r.health.score}%</td>
            <td>${r.insights.length}</td>
            <td><button class="btn btn-sm btn-ghost" data-deep="${r.c.church_id}">تفاصيل</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    `);
    document.querySelectorAll('[data-deep]').forEach(b => b.onclick = ()=> deep(b.dataset.deep));
  }
  function deep(cid){
    const r = AIOps.churchRisk(cid);
    const recs = AIOps.recommendations(cid);
    const c = DB._raw('churches').find(x=>x.church_id===cid);
    UI.modal(`<h3>${c.church_name} — رؤى ذكية</h3>
      <div style="display:flex;gap:1rem;margin-bottom:1rem">
        <div class="stat-card" style="flex:1"><b>الصحة</b><div style="font-size:2rem">${r.health.score}%</div><small>${r.health.label}</small></div>
        <div class="stat-card" style="flex:1;background:${r.color};color:#fff"><b>المخاطرة</b><div style="font-size:2rem">${r.risk}%</div><small>${r.band}</small></div>
      </div>
      <h4>تنبيهات</h4>
      ${r.insights.length?r.insights.map(i=>`<div class="alert ${i.severity==='danger'?'red':'orange'}"><b>${i.title}</b><br>${i.detail}</div>`).join(''):'<p class="muted">لا توجد تنبيهات</p>'}
      <h4>توصيات ذكية</h4>
      ${recs.length?recs.map(rc=>`<div class="alert"><b>[${rc.priority}] ${rc.title}</b><br>${rc.detail}</div>`).join(''):'<p class="muted">لا توجد توصيات</p>'}
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  render();
})();
