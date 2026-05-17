/* ============================================================
   TENANTS.PAGE.js — Tenant Control Center
   ============================================================ */
(function(){
  if (!App.init('tenants', ['super_admin'])) return;
  function render(){
    const churches = DB._raw('churches');
    const subs = Billing.listSubscriptions();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">مركز التحكم بالمستأجرين</h1>
        <p class="page-subtitle">إدارة الكنائس، الموارد، الصحة، وحالة التشغيل</p></div>
        <div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> كنيسة جديدة</button></div>
      </div>
      <div class="card"><div class="card-header"><h3>الكنائس (${churches.length})</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الكنيسة</th><th>الخطة</th><th>الحالة</th><th>الصحة</th><th>الاستخدام</th><th>إجراءات</th></tr></thead>
          <tbody>${churches.map(c=>{
            const h = TenantMgmt.health(c.church_id);
            const u = TenantMgmt.usageVsLimits(c.church_id);
            const sub = subs.find(s=>s.church_id===c.church_id);
            return `<tr>
              <td><b>${c.church_name}</b><br><small class="muted">${c.church_code||''}</small></td>
              <td>${sub?.plan_key||'-'}</td>
              <td><span class="badge ${c.subscription_status==='active'?'green':c.subscription_status==='trial'?'blue':'red'}">${c.subscription_status}</span></td>
              <td><span class="badge ${h.band==='green'?'green':h.band==='blue'?'blue':h.band==='orange'?'orange':'red'}">${h.score}% · ${h.label}</span></td>
              <td><div style="font-size:.8rem">
                <div>المخدومون: ${u.members.used}/${u.members.limit===Infinity?'∞':u.members.limit} (${u.members.pct}%)</div>
                <div>التخزين: ${u.storage_mb.used} MB (${u.storage_mb.pct}%)</div>
              </div></td>
              <td><button class="btn btn-sm btn-primary" data-view="${c.church_id}">إدارة</button></td>
            </tr>`;
          }).join('')}</tbody></table></div></div>
    `);
    document.getElementById('new').onclick = ()=> createModal();
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = ()=> openTenant(b.dataset.view));
  }
  function createModal(){
    UI.modal(`<h3>إنشاء كنيسة (Tenant) جديدة</h3>
      <label>اسم الكنيسة</label><input id="t-name" class="input">
      <label>الكود</label><input id="t-code" class="input">
      <label>الخطة</label>
      <select id="t-plan" class="input">${Billing.listPlans().map(p=>`<option value="${p.plan_key}">${p.label_ar||p.label}</option>`).join('')}</select>
      <label>بريد المدير</label><input id="t-email" class="input">
      <label>اسم المدير</label><input id="t-aname" class="input">
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="save">إنشاء</button></div>`);
    document.getElementById('save').onclick = ()=>{
      TenantMgmt.create({ name:document.getElementById('t-name').value, code:document.getElementById('t-code').value,
        plan:document.getElementById('t-plan').value, admin_email:document.getElementById('t-email').value,
        admin_name:document.getElementById('t-aname').value });
      UI.toast('تم الإنشاء','success'); UI.closeModal(); render();
    };
  }
  function openTenant(cid){
    const c = TenantMgmt.get(cid);
    const u = TenantMgmt.usageVsLimits(cid);
    const h = TenantMgmt.health(cid);
    const op = TenantMgmt.operational(cid);
    const flags = TenantMgmt.flags(cid);
    const features = ['finance','analytics','ai','events','workflows','notifications'];
    UI.modal(`<h3>${c.church_name}</h3>
      <div class="grid grid-3">
        <div class="card"><b>الصحة</b><br><div style="font-size:2rem;font-weight:800">${h.score}%</div><div>${h.label}</div></div>
        <div class="card"><b>النشاط (30 يوم)</b><br><small>دخول: ${op.loginActivity}<br>حضور: ${op.engagement}<br>workflows: ${op.workflowActivity}<br>ماليات: ${op.financeUsage}</small></div>
        <div class="card"><b>الموارد</b><br><small>المستخدمون: ${u.users.used}/${u.users.limit===Infinity?'∞':u.users.limit}<br>المخدومون: ${u.members.used}/${u.members.limit===Infinity?'∞':u.members.limit}<br>التخزين: ${u.storage_mb.used} MB</small></div>
      </div>
      <h4>مفاتيح الميزات</h4>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem">
        ${features.map(f=>{
          const cur = TenantMgmt.isFlagEnabled(cid,f);
          return `<label style="display:flex;align-items:center;gap:.5rem"><input type="checkbox" data-flag="${f}" ${cur?'checked':''}> ${f}</label>`;
        }).join('')}
      </div>
      <h4>إجراءات</h4>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-success" id="act">تفعيل</button>
        <button class="btn btn-orange" id="susp">تعليق</button>
        <button class="btn btn-ghost" id="frz">تجميد</button>
        <button class="btn btn-red" id="arc">أرشفة</button>
      </div>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
    `);
    document.querySelectorAll('[data-flag]').forEach(cb => cb.onchange = e => TenantMgmt.setFlag(cid, cb.dataset.flag, cb.checked));
    document.getElementById('act').onclick  = ()=>{ TenantMgmt.reactivate(cid); UI.toast('تم التفعيل','success'); UI.closeModal(); render(); };
    document.getElementById('susp').onclick = ()=>{ const r=prompt('السبب؟'); TenantMgmt.suspend(cid,r); UI.toast('تم التعليق','warning'); UI.closeModal(); render(); };
    document.getElementById('frz').onclick  = ()=>{ TenantMgmt.freeze(cid,'admin freeze'); UI.toast('تم التجميد'); UI.closeModal(); render(); };
    document.getElementById('arc').onclick  = ()=>{ if(!confirm('تأكيد الأرشفة؟'))return; TenantMgmt.archive(cid,'archived'); UI.toast('تم الأرشفة'); UI.closeModal(); render(); };
  }
  render();
})();
