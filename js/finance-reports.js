/* ============================================================
   FINANCE-REPORTS.js — Executive financial dashboards + charts
   ============================================================ */
(function(){
  if (!App.init('finance-reports')) return;
  const s = Auth.session();
  const allowed = ['church_admin','financial_manager','finance','super_admin'];
  if (!allowed.includes(s.role)){
    App.render('<div class="card"><div class="empty">لا تملك صلاحية الوصول لهذه الصفحة</div></div>');
    return;
  }

  const txs = (DB.all('transactions')||[]);
  const treasuries = DB.all('treasuries')||[];
  const categories = DB.all('financial_categories')||[];
  const approvals = DB.all('approvals')||[];

  function inRange(t, from, to){
    const d = new Date(t.tx_date || t.created_at).getTime();
    return d>=from.getTime() && d<=to.getTime();
  }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23,59,59);

  function sum(arr, type){ return arr.filter(t=>t.type===type).reduce((s,t)=>s+(+t.amount||0),0); }
  function fmt(n){ return UI.fmt.money(n); }

  const incomeMTD  = sum(txs.filter(t=>inRange(t,monthStart,now)),'income');
  const expenseMTD = sum(txs.filter(t=>inRange(t,monthStart,now)),'expense');
  const incomePM   = sum(txs.filter(t=>inRange(t,lastMonthStart,lastMonthEnd)),'income');
  const expensePM  = sum(txs.filter(t=>inRange(t,lastMonthStart,lastMonthEnd)),'expense');
  const treasuryBal= treasuries.reduce((s,t)=>s+(+t.balance||0),0);
  const pendingApprovals = approvals.filter(a => a.status==='pending').length;

  function pctChange(a,b){ if (!b) return a?100:0; return Math.round(((a-b)/b)*100); }

  function trend12(){
    const buckets = [], labels=[];
    for (let i=11;i>=0;i--){
      const start = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth()-i+1, 0,23,59,59);
      const sub = txs.filter(t=>inRange(t,start,end));
      buckets.push({ income:sum(sub,'income'), expense:sum(sub,'expense') });
      labels.push(start.toLocaleDateString('ar-EG',{month:'short'}));
    }
    return { labels, income:buckets.map(b=>b.income), expense:buckets.map(b=>b.expense) };
  }
  const T = trend12();

  function catBreakdown(type){
    const map = {};
    txs.filter(t=>t.type===type).forEach(t=>{
      const c = categories.find(c=>c.category_id===t.category_id);
      const k = c?.name || 'غير مصنّف';
      map[k]=(map[k]||0)+(+t.amount||0);
    });
    return map;
  }
  const incomeBreak = catBreakdown('income');
  const expenseBreak= catBreakdown('expense');

  function treasuryMovement(){
    const labels = T.labels;
    const values = T.income.map((v,i)=> v - T.expense[i]);
    let running = treasuryBal; const cum = [];
    for (let i=values.length-1;i>=0;i--){ cum.unshift(running); running -= values[i]; }
    return { labels, values:cum };
  }
  const TM = treasuryMovement();

  function smartInsights(){
    const out = [];
    if (expenseMTD > incomeMTD && incomeMTD>0) out.push({ sev:'critical', icon:'fa-triangle-exclamation', text:`المصروفات (${fmt(expenseMTD)}) تجاوزت الإيرادات (${fmt(incomeMTD)}) هذا الشهر` });
    if (pctChange(expenseMTD, expensePM) > 30) out.push({ sev:'high', icon:'fa-arrow-trend-up', text:`ارتفاع مصروفات بنسبة ${pctChange(expenseMTD,expensePM)}% مقارنة بالشهر السابق` });
    treasuries.forEach(tr => {
      const txCount = txs.filter(t=>t.treasury_id===tr.treasury_id && (Date.now()-new Date(t.tx_date||t.created_at).getTime())<30*864e5).length;
      if (txCount === 0) out.push({ sev:'medium', icon:'fa-pause', text:`خزينة "${tr.name}" غير نشطة منذ 30 يوم` });
      if ((tr.balance||0) < 0) out.push({ sev:'critical', icon:'fa-circle-exclamation', text:`خزينة "${tr.name}" برصيد سالب` });
    });
    if (pendingApprovals > 5) out.push({ sev:'high', icon:'fa-clock', text:`${pendingApprovals} اعتماد مالي معلّق — يحتاج مراجعة` });
    if (!out.length) out.push({ sev:'low', icon:'fa-circle-check', text:'الوضع المالي مستقر' });
    return out;
  }

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title"><i class="fa-solid fa-chart-line"></i> التقارير المالية التنفيذية</h1>
        <p class="page-subtitle">رؤية شاملة للأداء المالي والاتجاهات والمخاطر</p></div>
      <div style="display:flex;gap:.5rem">
        <a class="btn btn-ghost" href="finance.html"><i class="fa-solid fa-coins"></i> الماليات</a>
        <button class="btn btn-accent" onclick="window.print()"><i class="fa-solid fa-print"></i> طباعة / PDF</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1rem">
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-arrow-down"></i></div>
        <div><div class="stat-value">${fmt(incomeMTD)}</div><div class="stat-label">إيرادات الشهر · ${pctChange(incomeMTD,incomePM)>=0?'+':''}${pctChange(incomeMTD,incomePM)}%</div></div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-arrow-up"></i></div>
        <div><div class="stat-value">${fmt(expenseMTD)}</div><div class="stat-label">مصروفات الشهر · ${pctChange(expenseMTD,expensePM)>=0?'+':''}${pctChange(expenseMTD,expensePM)}%</div></div></div>
      <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-vault"></i></div>
        <div><div class="stat-value">${fmt(treasuryBal)}</div><div class="stat-label">إجمالي أرصدة الخزائن</div></div></div>
      <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-stamp"></i></div>
        <div><div class="stat-value">${pendingApprovals}</div><div class="stat-label">اعتمادات معلّقة</div></div></div>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-area"></i> الاتجاه السنوي (12 شهر)</div></div>
        <canvas id="trendChart" height="110"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-lightbulb"></i> رؤى ذكية</div></div>
        ${smartInsights().map(i=>`<div style="padding:.6rem;border-inline-start:3px solid var(--${i.sev==='critical'?'red':i.sev==='high'?'orange':i.sev==='medium'?'blue':'green'});background:var(--bg2);border-radius:8px;margin-bottom:.5rem;font-size:.85rem">
          <i class="fa-solid ${i.icon}"></i> ${i.text}
        </div>`).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-pie"></i> توزيع الإيرادات حسب الفئة</div></div>
        <canvas id="incomePie" height="180"></canvas></div>
      <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-pie"></i> توزيع المصروفات حسب الفئة</div></div>
        <canvas id="expensePie" height="180"></canvas></div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-vault"></i> حركة الخزائن (تطور الرصيد)</div></div>
      <canvas id="treasuryChart" height="100"></canvas>
    </div>

    <div class="card mb-3">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-table-columns"></i> ملخّص الخزائن</div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>الخزينة</th><th>الرصيد</th><th>الإيرادات الشهر</th><th>المصروفات الشهر</th><th>عدد العمليات</th><th>الحالة</th></tr></thead>
        <tbody>${treasuries.map(tr=>{
          const sub = txs.filter(t=>t.treasury_id===tr.treasury_id && inRange(t,monthStart,now));
          const inc = sum(sub,'income'), exp = sum(sub,'expense');
          const inactive = sub.length===0;
          return `<tr><td><b>${tr.name}</b></td>
            <td>${fmt(tr.balance||0)}</td>
            <td style="color:var(--green)">${fmt(inc)}</td>
            <td style="color:var(--red)">${fmt(exp)}</td>
            <td>${sub.length}</td>
            <td>${inactive?'<span class="badge badge-orange">خامل</span>':(tr.balance<0?'<span class="badge badge-red">سالب</span>':'<span class="badge badge-green">نشط</span>')}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty">لا توجد خزائن</div></td></tr>'}</tbody></table></div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-scale-balanced"></i> مقارنة الفترات</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-calendar-day"></i></div>
          <div><div class="stat-value" style="font-size:1.1rem">${fmt(incomeMTD-expenseMTD)}</div><div class="stat-label">صافي الشهر الحالي</div></div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-calendar-week"></i></div>
          <div><div class="stat-value" style="font-size:1.1rem">${fmt(incomePM-expensePM)}</div><div class="stat-label">صافي الشهر السابق</div></div></div>
        <div class="stat-card ${(incomeMTD-expenseMTD)>=(incomePM-expensePM)?'green':'red'}">
          <div class="stat-icon"><i class="fa-solid fa-${(incomeMTD-expenseMTD)>=(incomePM-expensePM)?'arrow-up':'arrow-down'}"></i></div>
          <div><div class="stat-value" style="font-size:1.1rem">${pctChange(incomeMTD-expenseMTD,incomePM-expensePM)}%</div><div class="stat-label">التغير</div></div></div>
      </div>
    </div>
  `);

  // Charts
  setTimeout(()=>{
    if (!window.Chart) return;
    const tc = document.getElementById('trendChart');
    tc && new Chart(tc, { type:'line', data:{ labels:T.labels, datasets:[
      { label:'إيرادات', data:T.income, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.15)', fill:true, tension:.35 },
      { label:'مصروفات', data:T.expense, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.12)', fill:true, tension:.35 }
    ]}, options:{ responsive:true, plugins:{ legend:{ position:'bottom' }}}});

    const palette = ['#c9a24d','#3b82f6','#22c55e','#ef4444','#8b5cf6','#14b8a6','#f97316','#ec4899'];
    const ip = document.getElementById('incomePie');
    ip && new Chart(ip,{ type:'doughnut', data:{ labels:Object.keys(incomeBreak), datasets:[{ data:Object.values(incomeBreak), backgroundColor:palette }]}, options:{ plugins:{ legend:{ position:'bottom' }}}});
    const ep = document.getElementById('expensePie');
    ep && new Chart(ep,{ type:'doughnut', data:{ labels:Object.keys(expenseBreak), datasets:[{ data:Object.values(expenseBreak), backgroundColor:palette }]}, options:{ plugins:{ legend:{ position:'bottom' }}}});
    const tr = document.getElementById('treasuryChart');
    tr && new Chart(tr,{ type:'bar', data:{ labels:TM.labels, datasets:[{ label:'الرصيد التقديري', data:TM.values, backgroundColor:'rgba(201,162,77,.7)', borderColor:'#c9a24d', borderWidth:1 }]}, options:{ responsive:true, plugins:{ legend:{ position:'bottom' }}}});
  }, 50);
})();
