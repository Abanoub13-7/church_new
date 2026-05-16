/* ============================================================
   SUPER-ADMIN.js — Enterprise Control Center (Phase 1)
   ------------------------------------------------------------
   Tabs: Overview · Churches · Subscriptions · Feature Flags ·
         Activity Monitor · Audit Logs · Notifications
   Capabilities preserved: data isolation (no member PII).
   ============================================================ */
(function(){
  if (!App.init('super-admin', ['super_admin'])) return;

  /* ------- Bootstrap auxiliary tables on first load ------- */
  (function ensureTables(){
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    ['feature_flags','platform_notifications','custom_roles','audit_logs','subscription_plans']
      .forEach(t => { if (!Array.isArray(all[t])) all[t]=[]; });
    if (!all.subscription_plans.length){
      all.subscription_plans = [
        { plan_key:'free',       label:'مجاني',     max_members:50,   max_users:5,   storage_mb:100,  features:['attendance'] },
        { plan_key:'basic',      label:'أساسي',    max_members:200,  max_users:15,  storage_mb:500,  features:['attendance','workflows'] },
        { plan_key:'pro',        label:'احترافي',  max_members:1000, max_users:50,  storage_mb:2000, features:['attendance','workflows','finance','ai'] },
        { plan_key:'enterprise', label:'مؤسسي',    max_members:99999,max_users:500, storage_mb:20000,features:['attendance','workflows','finance','ai','notifications','reports'] }
      ];
    }
    localStorage.setItem('church_db_v1', JSON.stringify(all));
  })();

  const MODULES = ['ai','attendance','finance','workflows','reports','notifications'];

  function $(sel, root){ return (root||document).querySelector(sel); }
  function refresh(){ render(); }

  /* ============================================================
     RENDER
     ============================================================ */
  function render(){
    const churches = DB._raw('churches');
    const allUsers = DB._raw('users').filter(u => u.role !== 'super_admin');
    const flags    = DB._raw('feature_flags');
    const plans    = DB._raw('subscription_plans');
    const notes    = DB._raw('platform_notifications');
    const logs     = Audit.list();

    const stats = {
      total:    churches.length,
      active:   churches.filter(c => c.subscription_status==='active').length,
      trial:    churches.filter(c => c.subscription_status==='trial').length,
      suspended:churches.filter(c => ['suspended','frozen','deactivated'].includes(c.subscription_status)).length,
      users:    allUsers.length
    };

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title">مركز التحكم — Super Admin</h1>
          <p class="page-subtitle">إدارة المنصة، الاشتراكات، الصلاحيات، والمراقبة</p>
        </div>
        <div>
          <button class="btn btn-primary" id="btn-new-church"><i class="fa-solid fa-plus"></i> كنيسة جديدة</button>
          <button class="btn btn-ghost" id="btn-broadcast"><i class="fa-solid fa-bullhorn"></i> إشعار عام</button>
        </div>
      </div>

      <div class="card mb-3" style="background:rgba(239,68,68,.08);border-color:var(--red)">
        <div style="display:flex;gap:.75rem">
          <i class="fa-solid fa-shield-halved" style="color:var(--red);font-size:1.5rem"></i>
          <div><b>عزل البيانات مفعّل:</b> لا يمكن الوصول لبيانات الأعضاء أو الاعترافات أو الافتقاد أو الحضور التفصيلي. الوصول مقتصر على بيانات الاشتراك والاستخدام التجميعية.</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-church"></i></div><div><div class="stat-value">${stats.total}</div><div class="stat-label">إجمالي الكنائس</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${stats.active}</div><div class="stat-label">اشتراك نشط</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${stats.trial}</div><div class="stat-label">تجريبي</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-ban"></i></div><div><div class="stat-value">${stats.suspended}</div><div class="stat-label">معلق/مجمد</div></div></div>
      </div>

      <!-- Tabs -->
      <div class="card">
        <div class="card-header" style="gap:.4rem;flex-wrap:wrap">
          ${tab('overview','نظرة عامة','fa-chart-line')}
          ${tab('churches','الكنائس','fa-church')}
          ${tab('subs','الاشتراكات','fa-credit-card')}
          ${tab('flags','مفاتيح الميزات','fa-toggle-on')}
          ${tab('activity','مراقبة النشاط','fa-eye')}
          ${tab('audit','سجلات التدقيق','fa-clipboard-list')}
          ${tab('notify','الإشعارات العامة','fa-bullhorn')}
        </div>
        <div id="tab-body" style="padding-top:1rem"></div>
      </div>
    `);

    // wire tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab(btn.dataset.tab, { churches, allUsers, flags, plans, notes, logs });
      };
    });
    document.querySelector('[data-tab="overview"]').click();

    // header buttons
    $('#btn-new-church').onclick = () => churchModal();
    $('#btn-broadcast').onclick  = () => broadcastModal();
  }

  function tab(id, label, icon){
    return `<button class="btn btn-ghost btn-sm" data-tab="${id}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
  }

  /* ============================================================
     TAB RENDERERS
     ============================================================ */
  function renderTab(id, ctx){
    const body = $('#tab-body');
    if (id === 'overview')  return body.innerHTML = renderOverview(ctx);
    if (id === 'churches')  return wireChurches(body, ctx);
    if (id === 'subs')      return wireSubscriptions(body, ctx);
    if (id === 'flags')     return wireFlags(body, ctx);
    if (id === 'activity')  return body.innerHTML = renderActivity(ctx);
    if (id === 'audit')     return body.innerHTML = renderAudit(ctx);
    if (id === 'notify')    return wireNotify(body, ctx);
  }

  /* ---------- Overview ---------- */
  function renderOverview({ churches, allUsers, logs }){
    const planCounts = {};
    churches.forEach(c => planCounts[c.subscription_plan] = (planCounts[c.subscription_plan]||0)+1);
    const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
    const memberCountByChurch = {};
    (all.members||[]).forEach(m => memberCountByChurch[m.church_id]=(memberCountByChurch[m.church_id]||0)+1);
    const totalMembers = Object.values(memberCountByChurch).reduce((a,b)=>a+b,0);

    const recent = logs.slice(0,8);
    setTimeout(() => {
      if (typeof Chart === 'undefined') return;
      const c1 = document.getElementById('ov-plans');
      if (c1) new Chart(c1, { type:'doughnut', data:{ labels:Object.keys(planCounts), datasets:[{ data:Object.values(planCounts), backgroundColor:['#c9a24d','#3b82f6','#8b5cf6','#22c55e'] }] }, options:{ plugins:{ legend:{ position:'bottom' } } } });
      const months = {}; churches.forEach(c => { const k = c.created_at?.slice(0,7); if(k) months[k]=(months[k]||0)+1; });
      const c2 = document.getElementById('ov-growth');
      if (c2) new Chart(c2, { type:'bar', data:{ labels:Object.keys(months).sort(), datasets:[{ label:'كنائس جديدة', data:Object.keys(months).sort().map(k=>months[k]), backgroundColor:'#c9a24d' }] }, options:{ plugins:{ legend:{ display:false } } } });
    }, 50);

    return `
      <div class="grid grid-3 mb-3">
        <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><div><div class="stat-value">${allUsers.length}</div><div class="stat-label">إجمالي المستخدمين</div></div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-group"></i></div><div><div class="stat-value">${totalMembers}</div><div class="stat-label">إجمالي المخدومين (تجميعي)</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-clipboard-list"></i></div><div><div class="stat-value">${logs.length}</div><div class="stat-label">سجلات التدقيق</div></div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-header"><div class="card-title">توزيع خطط الاشتراك</div></div><canvas id="ov-plans" height="140"></canvas></div>
        <div class="card"><div class="card-header"><div class="card-title">نمو الكنائس</div></div><canvas id="ov-growth" height="140"></canvas></div>
      </div>
      <div class="card mt-3">
        <div class="card-header"><div class="card-title">آخر الأحداث على المنصة</div></div>
        ${recent.length ? `<ul style="list-style:none;padding:0;margin:0">
          ${recent.map(l => `<li style="padding:.5rem 0;border-bottom:1px solid var(--border)"><b>${l.action}</b> — ${l.user_name} <span class="text-muted" style="font-size:.8rem">${UI.fmt.relative(l.created_at)}</span></li>`).join('')}
        </ul>` : '<div class="text-muted">لا يوجد نشاط بعد.</div>'}
      </div>
    `;
  }

  /* ---------- Churches CRUD ---------- */
  function wireChurches(body, { churches, allUsers }){
    const memberCountByChurch = {};
    const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
    (all.members||[]).forEach(m => memberCountByChurch[m.church_id]=(memberCountByChurch[m.church_id]||0)+1);

    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th></th><th>الكنيسة</th><th>الكود</th><th>الخطة</th><th>الاشتراك</th>
          <th>المستخدمين</th><th>المخدومين</th><th>آخر نشاط</th><th></th>
        </tr></thead>
        <tbody>${churches.map(c => {
          const users = allUsers.filter(u => u.church_id===c.church_id);
          const admin = users.find(u => u.user_id===c.church_admin_id);
          const status = c.subscription_status || 'active';
          const badgeColor = status==='active'?'green':status==='trial'?'orange':'red';
          return `<tr>
            <td><div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-d));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${c.church_name.charAt(0)}</div></td>
            <td><b>${c.church_name}</b><div class="text-muted" style="font-size:.75rem">Admin: ${admin?.full_name||'—'}</div></td>
            <td><code>${c.church_code}</code></td>
            <td><span class="badge badge-${c.subscription_plan==='enterprise'?'purple':c.subscription_plan==='pro'?'blue':'gray'}">${c.subscription_plan||'free'}</span></td>
            <td><span class="badge badge-${badgeColor}">${status}</span></td>
            <td>${users.length}</td>
            <td>${memberCountByChurch[c.church_id]||0}</td>
            <td>${UI.fmt.relative(users.map(u=>u.last_login).filter(Boolean).sort().pop())}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-sm btn-ghost" data-act="edit"      data-id="${c.church_id}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-ghost" data-act="imp"       data-id="${c.church_id}" title="انتحال شخصية مدير الكنيسة"><i class="fa-solid fa-user-secret"></i></button>
              ${status!=='suspended'
                ? `<button class="btn btn-sm btn-ghost" data-act="suspend" data-id="${c.church_id}" title="تعليق"><i class="fa-solid fa-pause"></i></button>`
                : `<button class="btn btn-sm btn-ghost" data-act="resume"  data-id="${c.church_id}" title="استئناف"><i class="fa-solid fa-play"></i></button>`}
              <button class="btn btn-sm btn-ghost" data-act="freeze"   data-id="${c.church_id}" title="تجميد"><i class="fa-solid fa-snowflake"></i></button>
              <button class="btn btn-sm btn-ghost" data-act="delete"   data-id="${c.church_id}" title="حذف" style="color:var(--red)"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;

    body.querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
      const id = btn.dataset.id; const act = btn.dataset.act;
      if (act === 'edit')    return churchModal(id);
      if (act === 'imp')     return Impersonation.start(id);
      if (act === 'suspend') return setStatus(id, 'suspended', 'تعليق');
      if (act === 'resume')  return setStatus(id, 'active',    'استئناف');
      if (act === 'freeze')  return setStatus(id, 'frozen',    'تجميد');
      if (act === 'delete'){
        const c = DB._raw('churches').find(x => x.church_id===id);
        if (!c) return;
        if (!confirm(`حذف نهائي للكنيسة "${c.church_name}" وكل مستخدميها؟ لا يمكن التراجع.`)) return;
        const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
        ['churches','users','members','attendance_records','attendance_sessions','followup_tasks','financial_transactions','feature_flags']
          .forEach(t => { if (Array.isArray(all[t])) all[t] = all[t].filter(r => r.church_id !== id && r.church_id !== undefined || (r.church_id===undefined && t!=='churches' && t!=='feature_flags')); });
        all.churches = (all.churches||[]).filter(c => c.church_id !== id);
        localStorage.setItem('church_db_v1', JSON.stringify(all));
        Audit.log('church.deleted', { church_id:id, name:c.church_name, severity:'critical' });
        UI.toast('تم حذف الكنيسة','success'); refresh();
      }
    });
  }

  function setStatus(id, status, label){
    const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
    const c = (all.churches||[]).find(x => x.church_id===id); if (!c) return;
    const old = c.subscription_status; c.subscription_status = status;
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    Audit.log('church.status_changed', { church_id:id, from:old, to:status, severity:'warning' });
    UI.toast(`تم ${label}: ${c.church_name}`, 'success'); refresh();
  }

  function churchModal(id){
    const editing = !!id;
    const c = editing ? DB._raw('churches').find(x => x.church_id===id) : { subscription_plan:'free', subscription_status:'trial' };
    UI.modal(`
      <div class="modal-header"><h3>${editing?'تعديل كنيسة':'كنيسة جديدة'}</h3><button onclick="UI.closeModal()" class="btn btn-ghost btn-sm"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-row"><label>اسم الكنيسة</label><input id="ch-name" value="${c.church_name||''}"></div>
        <div class="form-row"><label>كود الكنيسة</label><input id="ch-code" value="${c.church_code||''}"></div>
        <div class="form-row"><label>خطة الاشتراك</label>
          <select id="ch-plan">${['free','basic','pro','enterprise'].map(p=>`<option ${c.subscription_plan===p?'selected':''}>${p}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>حالة الاشتراك</label>
          <select id="ch-status">${['trial','active','suspended','frozen','deactivated','cancelled'].map(s=>`<option ${c.subscription_status===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        ${!editing ? `
          <hr style="margin:1rem 0">
          <p><b>حساب مدير الكنيسة الأول</b></p>
          <div class="form-row"><label>الاسم الكامل</label><input id="ad-name"></div>
          <div class="form-row"><label>البريد</label><input id="ad-email" type="email"></div>
          <div class="form-row"><label>كلمة المرور</label><input id="ad-pass" type="password" value="changeme123"></div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-primary" id="ch-save">حفظ</button>
      </div>
    `);
    $('#ch-save').onclick = () => {
      const name = $('#ch-name').value.trim(); if (!name) return UI.toast('الاسم مطلوب','error');
      const code = $('#ch-code').value.trim() || ('CH-'+Math.random().toString(36).slice(2,7).toUpperCase());
      const plan = $('#ch-plan').value, status = $('#ch-status').value;
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      all.churches = all.churches || []; all.users = all.users || [];
      if (editing){
        const row = all.churches.find(x => x.church_id===id);
        Object.assign(row, { church_name:name, church_code:code, subscription_plan:plan, subscription_status:status, updated_at:new Date().toISOString() });
        Audit.log('church.updated', { church_id:id, name });
      } else {
        const chId = 'chu-' + Math.random().toString(36).slice(2,10);
        const admName = $('#ad-name').value.trim() || 'مدير الكنيسة';
        const admEmail = $('#ad-email').value.trim(); if (!admEmail) return UI.toast('بريد الأدمن مطلوب','error');
        const admPass = $('#ad-pass').value || 'changeme123';
        const usrId = 'usr-' + Math.random().toString(36).slice(2,10);
        all.users.push({
          user_id:usrId, church_id:chId, full_name:admName, email:admEmail,
          password_hash:admPass, role:'church_admin', is_active:true, permissions:{},
          created_at:new Date().toISOString()
        });
        all.churches.push({
          church_id:chId, church_name:name, church_code:code,
          subscription_plan:plan, subscription_status:status,
          church_admin_id:usrId, created_at:new Date().toISOString()
        });
        Audit.log('church.created', { church_id:chId, name, plan });
      }
      localStorage.setItem('church_db_v1', JSON.stringify(all));
      UI.closeModal(); UI.toast('تم الحفظ','success'); refresh();
    };
  }

  /* ---------- Subscriptions ---------- */
  function wireSubscriptions(body, { churches, plans }){
    body.innerHTML = `
      <h3 style="margin-top:0">خطط الاشتراك</h3>
      <div class="grid grid-4 mb-3">
        ${plans.map(p => `
          <div class="card" style="margin:0">
            <div style="font-size:1.1rem;font-weight:700">${p.label} <span class="badge badge-gray">${p.plan_key}</span></div>
            <ul style="font-size:.85rem;padding-inline-start:1rem;margin:.5rem 0">
              <li>الحد الأقصى للمخدومين: ${p.max_members}</li>
              <li>المستخدمين: ${p.max_users}</li>
              <li>المساحة: ${p.storage_mb} MB</li>
              <li>الميزات: ${(p.features||[]).join(', ')}</li>
            </ul>
            <div class="text-muted" style="font-size:.8rem">عدد الكنائس على هذه الخطة: <b>${churches.filter(c=>c.subscription_plan===p.plan_key).length}</b></div>
          </div>`).join('')}
      </div>

      <h3>الكنائس وحالة الاشتراك</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>الكنيسة</th><th>الخطة</th><th>الحالة</th><th>الاستهلاك (مخدومين)</th><th>الانتهاء</th></tr></thead>
        <tbody>${churches.map(c => {
          const plan = plans.find(p => p.plan_key===c.subscription_plan) || plans[0];
          const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
          const used = (all.members||[]).filter(m => m.church_id===c.church_id).length;
          const pct = Math.min(100, Math.round(used/plan.max_members*100));
          return `<tr>
            <td><b>${c.church_name}</b></td>
            <td>${plan.label}</td>
            <td><span class="badge badge-${c.subscription_status==='active'?'green':c.subscription_status==='trial'?'orange':'red'}">${c.subscription_status}</span></td>
            <td>
              <div style="font-size:.8rem;margin-bottom:.2rem">${used} / ${plan.max_members} (${pct}%)</div>
              <div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${pct>90?'#dc2626':pct>70?'#f59e0b':'#22c55e'}"></div></div>
            </td>
            <td>${UI.fmt.date(c.subscription_expires_at) || '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
  }

  /* ---------- Feature Flags ---------- */
  function wireFlags(body, { churches }){
    body.innerHTML = `
      <p class="text-muted">فعّل أو عطّل أي وحدة لكل كنيسة بشكل مستقل.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>الكنيسة</th>${MODULES.map(m => `<th style="text-align:center">${m}</th>`).join('')}</tr></thead>
        <tbody>${churches.map(c => {
          const flag = DB._raw('feature_flags').find(f => f.church_id===c.church_id) || { disabled_modules:[] };
          return `<tr>
            <td><b>${c.church_name}</b></td>
            ${MODULES.map(m => `<td style="text-align:center">
              <input type="checkbox" data-ff data-church="${c.church_id}" data-mod="${m}" ${flag.disabled_modules.includes(m)?'':'checked'}>
            </td>`).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    `;
    body.querySelectorAll('[data-ff]').forEach(chk => chk.onchange = () => {
      const cid = chk.dataset.church, mod = chk.dataset.mod, enabled = chk.checked;
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      all.feature_flags = all.feature_flags || [];
      let row = all.feature_flags.find(f => f.church_id===cid);
      if (!row){ row = { flag_id:'ff-'+cid, church_id:cid, disabled_modules:[] }; all.feature_flags.push(row); }
      row.disabled_modules = row.disabled_modules || [];
      if (enabled) row.disabled_modules = row.disabled_modules.filter(m => m!==mod);
      else if (!row.disabled_modules.includes(mod)) row.disabled_modules.push(mod);
      localStorage.setItem('church_db_v1', JSON.stringify(all));
      Audit.log('feature_flag.changed', { church_id:cid, module:mod, enabled });
      UI.toast(`${enabled?'تفعيل':'تعطيل'} ${mod}`, 'success');
    });
  }

  /* ---------- Activity Monitor ---------- */
  function renderActivity({ logs, allUsers, churches }){
    const failed   = logs.filter(l => l.action==='auth.login_failed').slice(0,15);
    const blocked  = logs.filter(l => l.action==='auth.login_blocked_suspended').slice(0,10);
    const impLog   = logs.filter(l => l.action.startsWith('impersonation.')).slice(0,15);
    const permDen  = logs.filter(l => l.action==='permission.denied').slice(0,15);
    const recentLogins = [...allUsers].filter(u => u.last_login).sort((a,b)=>(b.last_login||'').localeCompare(a.last_login||'')).slice(0,15);

    const cell = rows => rows.length
      ? `<ul style="list-style:none;padding:0;margin:0">${rows.map(r => `<li style="padding:.4rem 0;border-bottom:1px solid var(--border);font-size:.85rem"><b>${r.user_name||r.full_name}</b> <span class="text-muted">— ${UI.fmt.relative(r.created_at||r.last_login)}</span><div class="text-muted" style="font-size:.75rem">${r.action ? JSON.stringify(r.meta||{}) : (r.email||'')}</div></li>`).join('')}</ul>`
      : '<div class="text-muted">لا شيء.</div>';

    return `
      <div class="grid grid-2">
        <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> آخر تسجيلات الدخول</div></div>${cell(recentLogins)}</div>
        <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> محاولات دخول فاشلة</div></div>${cell(failed)}</div>
        <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-ban"></i> دخول محظور (تعليق)</div></div>${cell(blocked)}</div>
        <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-user-secret"></i> أحداث الانتحال</div></div>${cell(impLog)}</div>
        <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-shield-halved"></i> صلاحيات مرفوضة</div></div>${cell(permDen)}</div>
      </div>
    `;
  }

  /* ---------- Audit Logs ---------- */
  function renderAudit({ logs }){
    return `
      <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem">
        <input id="aud-filter" placeholder="بحث بالحدث أو اسم المستخدم..." style="flex:1">
        <span class="badge badge-gray">${logs.length} سجل</span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الدور</th><th>الحدث</th><th>الخطورة</th><th>التفاصيل</th></tr></thead>
        <tbody id="aud-body">${logs.slice(0,200).map(rowAudit).join('')}</tbody>
      </table></div>
      <script>
        document.getElementById('aud-filter').oninput = e => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll('#aud-body tr').forEach(tr => {
            tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
          });
        };
      </script>
    `;
  }
  function rowAudit(l){
    const sevColor = { critical:'red', warning:'orange', info:'gray', success:'green' }[l.severity||'info'] || 'gray';
    return `<tr>
      <td style="white-space:nowrap;font-size:.75rem">${UI.fmt.dateTime(l.created_at)}</td>
      <td>${l.user_name||'—'}</td>
      <td><span class="badge badge-gray">${l.role||'—'}</span></td>
      <td><code>${l.action}</code></td>
      <td><span class="badge badge-${sevColor}">${l.severity||'info'}</span></td>
      <td style="font-size:.75rem;max-width:340px;overflow:hidden;text-overflow:ellipsis"><code>${JSON.stringify(l.meta||{})}</code></td>
    </tr>`;
  }

  /* ---------- Global Notifications ---------- */
  function wireNotify(body, { notes, churches }){
    body.innerHTML = `
      <button class="btn btn-primary mb-2" id="btn-new-notify"><i class="fa-solid fa-plus"></i> إشعار جديد</button>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>العنوان</th><th>النوع</th><th>الهدف</th><th>أُرسل</th><th></th></tr></thead>
        <tbody>${(notes||[]).slice().reverse().map(n => `<tr>
          <td><b>${n.title}</b><div class="text-muted" style="font-size:.75rem">${n.body||''}</div></td>
          <td><span class="badge badge-${n.type==='maintenance'?'orange':n.type==='alert'?'red':'blue'}">${n.type||'info'}</span></td>
          <td>${n.target==='all' ? 'كل الكنائس' : (churches.find(c=>c.church_id===n.target)?.church_name || '—')}</td>
          <td style="font-size:.75rem">${UI.fmt.relative(n.created_at)}</td>
          <td><button class="btn btn-sm btn-ghost" data-del="${n.notification_id}" style="color:var(--red)"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    `;
    $('#btn-new-notify').onclick = () => broadcastModal();
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const id = b.dataset.del;
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      all.platform_notifications = (all.platform_notifications||[]).filter(n => n.notification_id !== id);
      localStorage.setItem('church_db_v1', JSON.stringify(all));
      Audit.log('notification.deleted', { notification_id:id });
      refresh();
    });
  }

  function broadcastModal(){
    const churches = DB._raw('churches');
    UI.modal(`
      <div class="modal-header"><h3>إرسال إشعار عام</h3><button onclick="UI.closeModal()" class="btn btn-ghost btn-sm"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="form-row"><label>العنوان</label><input id="n-title"></div>
        <div class="form-row"><label>المحتوى</label><textarea id="n-body" rows="3"></textarea></div>
        <div class="form-row"><label>النوع</label>
          <select id="n-type"><option value="info">معلومة</option><option value="maintenance">صيانة</option><option value="alert">تحذير</option><option value="update">تحديث</option></select>
        </div>
        <div class="form-row"><label>الهدف</label>
          <select id="n-target"><option value="all">كل الكنائس</option>${churches.map(c=>`<option value="${c.church_id}">${c.church_name}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-primary" id="n-send">إرسال</button>
      </div>
    `);
    $('#n-send').onclick = () => {
      const title = $('#n-title').value.trim(); if (!title) return UI.toast('العنوان مطلوب','error');
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      all.platform_notifications = all.platform_notifications || [];
      const row = {
        notification_id:'ntf-'+Math.random().toString(36).slice(2,10),
        title, body:$('#n-body').value.trim(),
        type:$('#n-type').value, target:$('#n-target').value,
        created_at:new Date().toISOString(), created_by: Auth.session().user_id
      };
      all.platform_notifications.push(row);
      localStorage.setItem('church_db_v1', JSON.stringify(all));
      Audit.log('notification.sent', { notification_id:row.notification_id, target:row.target, type:row.type });
      UI.closeModal(); UI.toast('تم الإرسال','success'); refresh();
    };
  }

  /* ============================================================ */
  render();
})();
