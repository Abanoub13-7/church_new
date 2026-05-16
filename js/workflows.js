/* WORKFLOWS — view rules + history */
(function(){
  if (!App.init('workflows')) return;

  function render(){
    const actions = DB.all('workflow_actions');
    const history = DB.all('workflow_history').sort((a,b)=> new Date(b.started_at)-new Date(a.started_at));
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">محرك Workflow</h1>
          <p class="page-subtitle">${actions.filter(a=>a.is_active).length} قاعدة نشطة — ${history.filter(h=>h.status==='running').length} قيد التنفيذ</p></div>
        <button class="btn btn-accent" onclick="WorkflowEngine.runAll();UI.toast('تم تشغيل المحرك','success');setTimeout(()=>location.reload(),500)">
          <i class="fa-solid fa-play"></i> تشغيل المحرك الآن
        </button>
      </div>

      <div class="card mb-3">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-cogs"></i> القواعد المعرّفة</div></div>
        ${actions.map(a => `<div style="padding:1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.75rem">
          <div class="flex-between mb-1">
            <div><b>${a.name}</b> <span class="badge badge-${a.is_active?'green':'gray'}">${a.is_active?'نشط':'متوقف'}</span></div>
            <code style="font-size:.75rem;color:var(--text2)">trigger: ${a.trigger_type}</code>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;font-size:.8rem">
            ${a.steps.map((s,i)=>`<span class="badge badge-blue">${i+1}. ${s.action}${s.delay_hours?` (انتظر ${s.delay_hours}س)`:''}${s.to?` → ${s.to}`:''}</span>`).join(' ')}
          </div>
        </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-history"></i> سجل التنفيذ</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>القاعدة</th><th>الهدف</th><th>الخطوة الحالية</th><th>الحالة</th><th>بدأ</th><th>السجل</th></tr></thead>
          <tbody>${history.slice(0,30).map(h => {
            const a = actions.find(x=>x.action_id===h.action_id);
            const target = DB.byId('members','member_id',h.target_id);
            return `<tr>
              <td>${a?.name||'—'}</td>
              <td>${target?.full_name||'—'}</td>
              <td>${h.current_step}/${a?.steps?.length||0}</td>
              <td><span class="badge badge-${h.status==='completed'?'green':h.status==='running'?'blue':'red'}">${h.status}</span></td>
              <td>${UI.fmt.relative(h.started_at)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick='WorkflowsPage.showLog(${JSON.stringify(h.log||[]).replace(/'/g,"&apos;")})'><i class="fa-solid fa-list"></i></button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="6"><div class="empty">لا يوجد سجل بعد — اضغط "تشغيل المحرك"</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }
  window.WorkflowsPage = {
    showLog(log){
      UI.modal(`<div class="modal-header"><h3>سجل الخطوات</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><pre style="background:var(--bg2);padding:1rem;border-radius:8px;font-size:.75rem;overflow:auto">${JSON.stringify(log,null,2)}</pre></div>`);
    }
  };
  render();
})();
