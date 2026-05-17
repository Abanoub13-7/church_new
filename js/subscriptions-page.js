/* ============================================================
   SUBSCRIPTIONS.PAGE.js — Plans + tenant subscriptions
   ============================================================ */
(function(){
  if (!App.init('subscriptions', ['super_admin'])) return;
  Billing.runLifecycle();
  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function statusBadge(s){
    const map = { active:['نشط','green'], trial:['تجريبي','blue'], suspended:['معلق','red'], cancelled:['ملغاة','gray'],
      expired:['منتهية','red'], grace_period:['فترة سماح','orange'], pending_payment:['بانتظار الدفع','orange'] };
    const [t,c]=map[s]||[s,'gray']; return `<span class="badge ${c}">${t}</span>`;
  }
  function render(){
    const plans = Billing.listPlans();
    const subs = Billing.listSubscriptions();
    const churches = DB._raw('churches');
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الاشتراكات والخطط</h1>
        <p class="page-subtitle">إدارة الخطط، الاشتراكات، التجديدات، والترقيات</p></div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h3>خطط الاشتراك</h3></div>
        <div class="grid grid-4">${plans.map(p=>`
          <div class="card" style="border:2px solid var(--border)">
            <h3 style="margin-top:0">${p.label_ar||p.label}</h3>
            <div style="font-size:1.5rem;font-weight:800;color:var(--primary)">${fmt(p.price_monthly)}<small style="font-size:.7rem">/شهري</small></div>
            <div style="color:var(--muted);font-size:.85rem">أو ${fmt(p.price_yearly)} سنوي</div>
            <hr>
            <ul style="font-size:.85rem;list-style:none;padding:0">
              <li><i class="fa-solid fa-users"></i> ${p.limits.users} مستخدم</li>
              <li><i class="fa-solid fa-user-friends"></i> ${p.limits.members} مخدوم</li>
              <li><i class="fa-solid fa-database"></i> ${p.limits.storage_mb} MB تخزين</li>
              <li><i class="fa-solid fa-calendar"></i> ${p.limits.events} فعالية</li>
              <li><i class="fa-solid fa-diagram-project"></i> ${p.limits.workflows} workflow</li>
              <li style="color:${p.limits.finance?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.finance?'check':'xmark'}"></i> ماليات</li>
              <li style="color:${p.limits.analytics?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.analytics?'check':'xmark'}"></i> تحليلات</li>
              <li style="color:${p.limits.ai?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.ai?'check':'xmark'}"></i> AI</li>
            </ul>
          </div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-header"><h3>اشتراكات الكنائس</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الكنيسة</th><th>الخطة</th><th>الدورة</th><th>الحالة</th><th>تنتهي في</th><th>التجريبي ينتهي</th><th>إجراءات</th></tr></thead>
          <tbody>${subs.map(s=>{
            const c = churches.find(x=>x.church_id===s.church_id);
            return `<tr>
              <td>${c?.church_name||s.church_id}</td>
              <td>${s.plan_key}</td>
              <td>${s.billing_cycle==='yearly'?'سنوي':'شهري'}</td>
              <td>${statusBadge(s.status)}</td>
              <td>${UI.fmt.date(s.current_period_end)}</td>
              <td>${s.status==='trial'?UI.fmt.relative(s.trial_ends_at):'-'}</td>
              <td style="display:flex;gap:.3rem">
                <button class="btn btn-sm btn-ghost" data-change="${s.church_id}"><i class="fa-solid fa-arrow-up"></i> تغيير</button>
                <button class="btn btn-sm btn-success" data-renew="${s.church_id}"><i class="fa-solid fa-rotate"></i></button>
                <button class="btn btn-sm btn-ghost" data-history="${s.church_id}"><i class="fa-solid fa-clock-rotate-left"></i></button>
              </td>
            </tr>`;
          }).join('')}</tbody></table></div>
      </div>
    `);
    document.querySelectorAll('[data-change]').forEach(b => b.onclick = ()=> changeModal(b.dataset.change));
    document.querySelectorAll('[data-renew]').forEach(b => b.onclick = ()=>{ Billing.renew(b.dataset.renew); UI.toast('تم التجديد','success'); render(); });
    document.querySelectorAll('[data-history]').forEach(b => b.onclick = ()=> historyModal(b.dataset.history));
  }
  function changeModal(cid){
    const plans = Billing.listPlans();
    const cur = Billing.getByChurch(cid);
    UI.modal(`<h3>تغيير الخطة</h3>
      <label>الخطة</label>
      <select id="m-plan" class="input">${plans.map(p=>`<option value="${p.plan_key}" ${p.plan_key===cur.plan_key?'selected':''}>${p.label_ar||p.label}</option>`).join('')}</select>
      <label>الدورة</label>
      <select id="m-cycle" class="input"><option value="monthly" ${cur.billing_cycle==='monthly'?'selected':''}>شهرية</option><option value="yearly" ${cur.billing_cycle==='yearly'?'selected':''}>سنوية</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="save">حفظ</button></div>`);
    document.getElementById('save').onclick = ()=>{
      Billing.changePlan(cid, document.getElementById('m-plan').value, document.getElementById('m-cycle').value);
      UI.toast('تم تغيير الخطة','success'); UI.closeModal(); render();
    };
  }
  function historyModal(cid){
    const h = Billing.history(cid);
    UI.modal(`<h3>سجل الاشتراك</h3>
      <div style="max-height:400px;overflow:auto">${h.length?h.map(x=>`
        <div class="alert"><b>${x.action}</b> · ${UI.fmt.dateTime(x.at)}<br><small>${JSON.stringify(x.to||x.from||x.reason||'')}</small></div>`).join(''):'<p class="muted">لا يوجد سجل</p>'}</div>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  render();
})();
