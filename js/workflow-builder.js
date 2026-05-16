/* ============================================================
   WORKFLOW-BUILDER.js — Visual SVG drag/drop BPM-style builder
   ============================================================ */
(function(){
  if (!App.init('workflow-builder')) return;

  const STORAGE = 'wf_builder_diagrams_v1';
  const NODE_TYPES = [
    { type:'trigger',      icon:'fa-bolt',         label:'مُحفِّز',     desc:'بداية الـ workflow' },
    { type:'action',       icon:'fa-play',         label:'إجراء',       desc:'تنفيذ مهمة' },
    { type:'condition',    icon:'fa-code-branch',  label:'شرط',         desc:'تفرع منطقي' },
    { type:'approval',     icon:'fa-user-check',   label:'موافقة',      desc:'تتطلب اعتماد' },
    { type:'notification', icon:'fa-bell',         label:'إشعار',       desc:'إرسال إشعار' },
    { type:'escalation',   icon:'fa-arrow-up',     label:'تصعيد',       desc:'رفع للمستوى الأعلى' },
    { type:'followup',     icon:'fa-hand-holding-heart', label:'افتقاد', desc:'متابعة شخصية' },
    { type:'assignment',   icon:'fa-user-plus',    label:'إسناد',       desc:'تعيين مسؤول' }
  ];
  const SAMPLES = {
    attendance: { name:'Workflow الحضور', nodes:[
      {id:'n1',type:'trigger',label:'غياب 3 مرات',x:40,y:60,status:'completed'},
      {id:'n2',type:'notification',label:'تنبيه الخادم',x:280,y:40,status:'completed'},
      {id:'n3',type:'followup',label:'افتقاد المخدوم',x:520,y:80,status:'running'},
      {id:'n4',type:'escalation',label:'تصعيد للقائد',x:760,y:60,status:'pending'},
    ], edges:[['n1','n2'],['n2','n3'],['n3','n4']] },
    finance: { name:'Workflow المصروفات', nodes:[
      {id:'n1',type:'trigger',label:'طلب مصروف',x:40,y:80,status:'completed'},
      {id:'n2',type:'condition',label:'> 5000 ج.م؟',x:280,y:60,status:'completed'},
      {id:'n3',type:'approval',label:'اعتماد المحاسب',x:520,y:40,status:'completed'},
      {id:'n4',type:'approval',label:'اعتماد القائد',x:520,y:140,status:'running'},
      {id:'n5',type:'action',label:'تنفيذ الصرف',x:780,y:80,status:'pending'},
    ], edges:[['n1','n2'],['n2','n3'],['n2','n4'],['n3','n5'],['n4','n5']] },
    followup: { name:'Workflow الافتقاد', nodes:[
      {id:'n1',type:'trigger',label:'مخدوم جديد',x:40,y:80,status:'completed'},
      {id:'n2',type:'assignment',label:'تعيين خادم',x:280,y:80,status:'completed'},
      {id:'n3',type:'followup',label:'زيارة أولى',x:520,y:50,status:'running'},
      {id:'n4',type:'notification',label:'تذكير 7 أيام',x:520,y:160,status:'pending'},
      {id:'n5',type:'action',label:'تقييم',x:780,y:100,status:'pending'},
    ], edges:[['n1','n2'],['n2','n3'],['n2','n4'],['n3','n5'],['n4','n5']] }
  };

  let state = load() || { current:'attendance', diagrams: deepClone(SAMPLES) };
  let selectedId = null, dragNode=null, dragOffset={x:0,y:0}, connectFrom=null;

  function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE)); } catch(_){ return null; } }
  function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function diagram(){ return state.diagrams[state.current]; }
  function actions(){ return DB.all('workflow_actions'); }
  function history(){ return DB.all('workflow_history'); }

  function render(){
    const acts = actions();
    const hist = history();
    const activeWorkflows = hist.filter(h=>h.status==='running').length;
    const overdue = hist.filter(h=>h.status==='running' && (Date.now()-new Date(h.started_at).getTime())>3*864e5).length;
    const blocked = hist.filter(h=>h.status==='failed' || h.status==='escalated').length;
    const completed = hist.filter(h=>h.status==='completed').length;

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fa-solid fa-diagram-project"></i> Workflow Builder</h1>
          <p class="page-subtitle">منصة بناء وتصور Workflows بنمط BPM</p>
        </div>
        <div style="display:flex;gap:.5rem">
          <a class="btn btn-ghost" href="workflows.html"><i class="fa-solid fa-list"></i> القواعد المعرّفة</a>
          <button class="btn btn-accent" onclick="WFBuilder.runSim()"><i class="fa-solid fa-play"></i> محاكاة</button>
        </div>
      </div>

      <div class="grid grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem">
        <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-spinner"></i></div><div><div class="stat-value">${activeWorkflows}</div><div class="stat-label">نشط الآن</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${overdue}</div><div class="stat-label">متأخر</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-ban"></i></div><div><div class="stat-value">${blocked}</div><div class="stat-label">متعثر / مصعّد</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="stat-value">${completed}</div><div class="stat-label">مكتمل</div></div></div>
      </div>

      <div class="bpm-toolbar">
        <label style="font-weight:600">القالب:</label>
        <select class="form-select" style="width:auto" onchange="WFBuilder.switch(this.value)">
          ${Object.entries(state.diagrams).map(([k,d])=>`<option value="${k}" ${k===state.current?'selected':''}>${d.name}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="WFBuilder.reset()"><i class="fa-solid fa-rotate"></i> إعادة تعيين</button>
        <button class="btn btn-ghost btn-sm" onclick="WFBuilder.exportJSON()"><i class="fa-solid fa-file-export"></i> تصدير JSON</button>
        <span style="margin-inline-start:auto;color:var(--text2);font-size:.85rem">اسحب من اللوحة اليسرى — اضغط دائرة العقدة لإنشاء اتصال</span>
      </div>

      <div class="bpm-wrap">
        <aside class="bpm-palette">
          <h4>عناصر الـ Workflow</h4>
          ${NODE_TYPES.map(n => `
            <div class="palette-item" draggable="true" data-type="${n.type}"
                 ondragstart="WFBuilder.dragStart(event,'${n.type}','${n.label}')">
              <i class="fa-solid ${n.icon}" style="background:var(--${colorOf(n.type)})"></i>
              <div><div style="font-weight:600">${n.label}</div><div style="font-size:.7rem;color:var(--text2)">${n.desc}</div></div>
            </div>
          `).join('')}
          <h4 style="margin-top:1.5rem">رحلة المخدوم</h4>
          ${renderJourney()}
        </aside>

        <div class="bpm-canvas" id="bpmCanvas"
             ondragover="event.preventDefault()"
             ondrop="WFBuilder.dropNode(event)"
             onclick="WFBuilder.canvasClick(event)">
          <svg id="bpmSvg"><defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"/>
            </marker>
          </defs></svg>
        </div>

        <aside class="bpm-inspector" id="bpmInspector">
          <h4>المعاينة</h4>
          <div id="inspector-body" style="font-size:.85rem;color:var(--text2)">اختر عقدة لعرض إعداداتها</div>
        </aside>
      </div>

      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-timeline"></i> الجدول الزمني للتنفيذ</div></div>
          ${renderTimeline()}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-table-list"></i> لوحة المهام</div></div>
          ${renderKanban()}
        </div>
      </div>
    `);
    paintNodes();
  }

  function colorOf(t){ return ({trigger:'purple',action:'blue',condition:'orange',approval:'accent',notification:'teal',escalation:'red',followup:'pink',assignment:'green'})[t]||'blue'; }

  function renderJourney(){
    const stages = ['زائر','مسجّل','محال لفصل','حضور','افتقاد','تقييم','خدمة','قيادة'];
    const icons = ['fa-door-open','fa-user-plus','fa-chalkboard-user','fa-clipboard-check','fa-hand-holding-heart','fa-clipboard-list','fa-hands-helping','fa-crown'];
    // approximate progress for the church
    const members = DB.all('members')||[];
    const total = members.length || 1;
    const recs = DB.all('attendance_records')||[];
    const activeIds = new Set(recs.map(r=>r.member_id));
    const servants = DB.filter('users', u => ['servant','servant_leader'].includes(u.role)).map(u=>u.member_id);
    const counts = [
      total,
      Math.round(total*0.92),
      Math.round(total*0.78),
      activeIds.size,
      Math.round(activeIds.size*0.6),
      Math.round(activeIds.size*0.4),
      servants.length,
      Math.max(1, Math.round(servants.length*0.2))
    ];
    return `<div style="display:flex;flex-direction:column;gap:.35rem;font-size:.78rem">
      ${stages.map((s,i)=>{
        const pct = Math.round((counts[i]/total)*100);
        return `<div>
          <div style="display:flex;justify-content:space-between"><span><i class="fa-solid ${icons[i]}"></i> ${s}</span><b>${counts[i]}</b></div>
          <div style="height:6px;background:var(--bg2);border-radius:4px;overflow:hidden;margin-top:2px"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--accent-d))"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderTimeline(){
    const hist = history().sort((a,b)=> new Date(b.started_at)-new Date(a.started_at)).slice(0,8);
    if (!hist.length) return '<div class="empty">لا توجد بيانات بعد</div>';
    return `<ul class="tl" style="list-style:none">
      ${hist.map(h => {
        const a = actions().find(x=>x.action_id===h.action_id);
        return `<li class="tl-item ${h.status}">
          <div style="font-weight:600">${a?.name||'workflow'}</div>
          <div class="tl-time">${UI.fmt.relative(h.started_at)} · <span class="prio ${h.priority||'medium'}">${h.priority||'medium'}</span></div>
          <div style="color:var(--text2);font-size:.78rem">الخطوة ${h.current_step}/${a?.steps?.length||0} · ${h.status}</div>
        </li>`;
      }).join('')}
    </ul>`;
  }

  function renderKanban(){
    const hist = history();
    const cols = [
      ['pending','قيد الانتظار',hist.filter(h=>h.status==='running' && h.current_step<=1)],
      ['running','نشط',hist.filter(h=>h.status==='running' && h.current_step>1)],
      ['escalated','مصعّد',hist.filter(h=>h.status==='escalated' || h.status==='failed')],
      ['done','مكتمل',hist.filter(h=>h.status==='completed').slice(0,8)],
    ];
    return `<div class="kanban">${cols.map(([k,label,items])=>`
      <div class="kanban-col"><h5>${label}<span class="badge badge-gray">${items.length}</span></h5>
        ${items.slice(0,5).map(i=>{
          const a = actions().find(x=>x.action_id===i.action_id);
          const member = DB.byId('members','member_id',i.target_id);
          return `<div class="kanban-card">
            <div style="font-weight:600">${a?.name||'workflow'}</div>
            <div style="color:var(--text2);font-size:.75rem">${member?.full_name||'—'}</div>
            <div class="kc-foot"><span class="prio ${i.priority||'medium'}">${i.priority||'medium'}</span><span>${UI.fmt.relative(i.started_at)}</span></div>
          </div>`;
        }).join('') || '<div style="color:var(--text3);font-size:.78rem;text-align:center;padding:1rem">لا يوجد</div>'}
      </div>`).join('')}</div>`;
  }

  function paintNodes(){
    const canvas = document.getElementById('bpmCanvas'); if (!canvas) return;
    const svg = document.getElementById('bpmSvg');
    // remove existing nodes
    [...canvas.querySelectorAll('.bpm-node')].forEach(n=>n.remove());
    svg.querySelectorAll('line,path.edge').forEach(n=>n.remove());

    const d = diagram();
    d.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'bpm-node' + (selectedId===n.id?' selected':'');
      el.dataset.type = n.type; el.dataset.id = n.id;
      el.style.inset = `${n.y}px auto auto ${n.x}px`;
      const meta = NODE_TYPES.find(x=>x.type===n.type) || {icon:'fa-circle',label:n.type};
      el.innerHTML = `
        <span class="status-dot ${n.status||'pending'}"></span>
        <div class="nh"><i class="fa-solid ${meta.icon}"></i> ${n.label||meta.label}</div>
        <div class="nm">${meta.label}</div>
        <div class="port in" data-port="in"></div>
        <div class="port out" data-port="out"></div>`;
      el.onmousedown = e => startDrag(e, n);
      el.onclick = e => { e.stopPropagation(); selectedId = n.id; renderInspector(); paintNodes(); };
      el.querySelector('.port.out').onclick = e => { e.stopPropagation(); connectFrom = n.id; UI.toast('اختر العقدة المستهدفة','info'); };
      el.querySelector('.port.in').onclick = e => {
        e.stopPropagation();
        if (connectFrom && connectFrom !== n.id){
          d.edges.push([connectFrom, n.id]); connectFrom=null; save(); paintNodes();
        }
      };
      canvas.appendChild(el);
    });

    // draw edges
    requestAnimationFrame(()=>{
      const rect = canvas.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      d.edges.forEach(([a,b]) => {
        const na = canvas.querySelector(`.bpm-node[data-id="${a}"]`);
        const nb = canvas.querySelector(`.bpm-node[data-id="${b}"]`);
        if (!na || !nb) return;
        const ar = na.getBoundingClientRect(), br = nb.getBoundingClientRect();
        const x1 = ar.right - rect.left, y1 = ar.top + ar.height/2 - rect.top;
        const x2 = br.left - rect.left,  y2 = br.top + br.height/2 - rect.top;
        const mx = (x1+x2)/2;
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class','edge');
        path.setAttribute('fill','none');
        path.setAttribute('stroke','var(--accent)');
        path.setAttribute('stroke-width','2');
        path.setAttribute('marker-end','url(#arrow)');
        svg.appendChild(path);
      });
    });
  }

  function startDrag(e, node){
    dragNode = node;
    const canvas = document.getElementById('bpmCanvas');
    const rect = canvas.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y };
    e.target.closest('.bpm-node').classList.add('dragging');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag, { once:true });
  }
  function onDrag(e){
    if (!dragNode) return;
    const canvas = document.getElementById('bpmCanvas');
    const rect = canvas.getBoundingClientRect();
    dragNode.x = Math.max(0, Math.min(rect.width-180, e.clientX - rect.left - dragOffset.x));
    dragNode.y = Math.max(0, Math.min(rect.height-60, e.clientY - rect.top - dragOffset.y));
    paintNodes();
  }
  function endDrag(){
    if (dragNode) save();
    dragNode = null;
    document.removeEventListener('mousemove', onDrag);
    document.querySelectorAll('.bpm-node.dragging').forEach(n=>n.classList.remove('dragging'));
  }

  function renderInspector(){
    const body = document.getElementById('inspector-body');
    if (!body) return;
    const d = diagram();
    const n = d.nodes.find(x=>x.id===selectedId);
    if (!n){ body.innerHTML = 'اختر عقدة لعرض إعداداتها'; return; }
    body.innerHTML = `
      <div class="form-group"><label class="form-label">الاسم</label>
        <input class="form-control" value="${n.label||''}" oninput="WFBuilder.update('label',this.value)"/></div>
      <div class="form-group"><label class="form-label">النوع</label>
        <select class="form-select" onchange="WFBuilder.update('type',this.value)">
          ${NODE_TYPES.map(t=>`<option value="${t.type}" ${t.type===n.type?'selected':''}>${t.label}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">الأولوية</label>
        <select class="form-select" onchange="WFBuilder.update('priority',this.value)">
          ${['low','medium','high','critical'].map(p=>`<option value="${p}" ${p===(n.priority||'medium')?'selected':''}>${p}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">الحالة</label>
        <select class="form-select" onchange="WFBuilder.update('status',this.value)">
          ${['pending','running','completed','failed','escalated'].map(s=>`<option value="${s}" ${s===(n.status||'pending')?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <span class="prio ${n.priority||'medium'}">${n.priority||'medium'}</span>
      <hr style="margin:.8rem 0;border:0;border-top:1px solid var(--border)"/>
      <button class="btn btn-danger btn-sm" onclick="WFBuilder.delNode()"><i class="fa-solid fa-trash"></i> حذف العقدة</button>
    `;
  }

  window.WFBuilder = {
    switch(k){ state.current = k; selectedId=null; save(); render(); },
    reset(){ if (!confirm('استعادة القالب الأصلي؟')) return; state.diagrams = deepClone(SAMPLES); save(); render(); },
    exportJSON(){ const blob = new Blob([JSON.stringify(diagram(),null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=state.current+'.json'; a.click(); },
    dragStart(e,type,label){ e.dataTransfer.setData('text/plain', JSON.stringify({type,label})); },
    dropNode(e){
      e.preventDefault();
      const data = JSON.parse(e.dataTransfer.getData('text/plain')||'{}');
      const rect = document.getElementById('bpmCanvas').getBoundingClientRect();
      const node = { id:'n'+Date.now(), type:data.type||'action', label:data.label||'إجراء جديد', x:e.clientX-rect.left-80, y:e.clientY-rect.top-30, status:'pending', priority:'medium' };
      diagram().nodes.push(node); save(); paintNodes();
    },
    canvasClick(e){
      if (e.target.id !== 'bpmCanvas') return;
      selectedId = null; connectFrom = null; renderInspector(); paintNodes();
    },
    update(k,v){
      const n = diagram().nodes.find(x=>x.id===selectedId); if (!n) return;
      n[k]=v; save(); renderInspector(); paintNodes();
    },
    delNode(){
      const d = diagram();
      d.nodes = d.nodes.filter(n=>n.id!==selectedId);
      d.edges = d.edges.filter(([a,b])=>a!==selectedId&&b!==selectedId);
      selectedId=null; save(); renderInspector(); paintNodes();
    },
    runSim(){
      const d = diagram();
      d.nodes.forEach((n,i)=> n.status = i<d.nodes.length-1?'completed':'running');
      save(); paintNodes();
      UI.toast('تم تشغيل المحاكاة','success');
    }
  };
  render();
})();
