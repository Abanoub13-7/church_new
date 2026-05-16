/* ============================================================
   EVENTS — Enterprise Event Management UI
   Tabs: Overview • Events • Registrations • Templates • Budget • Analytics • Timeline
   ============================================================ */
(function(){
  if (!App.init('events')) return;

  let activeTab = 'overview';
  let selectedEvent = null;

  /* === guards === */
  function can(action){
    if (!window.Permissions) return true;
    const role = (Auth.session()||{}).role;
    const matrix = {
      create:    ['church_admin','service_admin','servant_leader','supervisor'],
      approve:   ['church_admin','service_admin'],
      cancel:    ['church_admin','service_admin'],
      register:  ['church_admin','service_admin','servant_leader','supervisor','servant'],
      approveReg:['church_admin','service_admin','servant_leader','supervisor'],
      finance:   ['church_admin','finance','financial_manager']
    };
    return (matrix[action]||[]).includes(role);
  }

  /* === SHELL === */
  function render(){
    // Run side-effects on each render
    try { DB.all('events').forEach(e => EventEngine.recomputeStatus(e.event_id)); } catch(_){}
    try { EventWorkflowEngine?.escalateOverdueTasks(); } catch(_){}
    try { EventNotificationEngine?.runReminders(); } catch(_){}

    const ov = EventAnalytics.overview();

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title">منظومة الفعاليات</h1>
          <p class="page-subtitle">${ov.events_active} نشطة • ${ov.events_pending} بانتظار الاعتماد • ${ov.bookings_pending} طلب تسجيل</p>
        </div>
        <div class="flex">
          ${can('create') ? `<button class="btn btn-ghost" onclick="EventsPage.showTemplates()"><i class="fa-solid fa-shapes"></i> من قالب</button>` : ''}
          ${can('create') ? `<button class="btn btn-accent" onclick="EventsPage.showForm()"><i class="fa-solid fa-plus"></i> فعالية جديدة</button>`:''}
        </div>
      </div>

      <div class="tabs" style="display:flex;gap:.5rem;border-bottom:1px solid var(--border);margin-bottom:1.2rem;flex-wrap:wrap">
        ${tabBtn('overview','نظرة عامة','fa-gauge-high')}
        ${tabBtn('events','الفعاليات','fa-calendar-days')}
        ${tabBtn('registrations','التسجيلات','fa-ticket')}
        ${tabBtn('templates','القوالب','fa-shapes')}
        ${can('finance')?tabBtn('budget','الميزانية','fa-coins'):''}
        ${tabBtn('analytics','التحليلات','fa-chart-line')}
        ${tabBtn('timeline','الجدول الزمني','fa-clock-rotate-left')}
      </div>

      <div id="tab-content"></div>
    `);

    renderTab();
  }

  function tabBtn(id, label, icon){
    const active = activeTab===id;
    return `<button onclick="EventsPage.tab('${id}')" class="tab-btn" style="padding:.7rem 1.2rem;border:none;background:${active?'var(--accent)':'transparent'};color:${active?'#fff':'var(--text)'};border-radius:8px 8px 0 0;font-weight:${active?'700':'500'};cursor:pointer;display:flex;align-items:center;gap:.5rem">
      <i class="fa-solid ${icon}"></i> ${label}</button>`;
  }

  function renderTab(){
    const el = document.getElementById('tab-content');
    if (!el) return;
    if (activeTab==='overview') el.innerHTML = viewOverview();
    else if (activeTab==='events') el.innerHTML = viewEvents();
    else if (activeTab==='registrations') el.innerHTML = viewRegistrations();
    else if (activeTab==='templates') el.innerHTML = viewTemplates();
    else if (activeTab==='budget') el.innerHTML = viewBudget();
    else if (activeTab==='analytics') { el.innerHTML = viewAnalytics(); drawCharts(); }
    else if (activeTab==='timeline') el.innerHTML = viewTimeline();
  }

  /* === OVERVIEW === */
  function viewOverview(){
    const ov = EventAnalytics.overview();
    const events = DB.all('events').sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at));
    const upcoming = events.filter(e => new Date(e.starts_at) > Date.now()).slice(0,5);
    const pending  = events.filter(e => e.status==='pending_approval');
    const popular = EventAnalytics.popularityRanking().slice(0,5);

    return `
      <div class="grid grid-4">
        ${statCard('فعاليات نشطة', ov.events_active, 'fa-calendar-check','green')}
        ${statCard('بانتظار الاعتماد', ov.events_pending, 'fa-hourglass-half','orange')}
        ${statCard('إجمالي التسجيلات', ov.bookings_total, 'fa-ticket','blue')}
        ${statCard('متوسط الإشغال', ov.avg_fill+'%','fa-gauge-high','purple')}
      </div>

      <div class="grid grid-2 mt-3">
        <div class="card">
          <h3><i class="fa-solid fa-calendar-day"></i> القادمة</h3>
          ${upcoming.length ? upcoming.map(e => {
            const c = EventEngine.capacityBreakdown(e);
            return `<div class="list-row" onclick="EventsPage.openEvent('${e.event_id}')" style="cursor:pointer">
              <div><strong>${e.title}</strong><div class="text-muted" style="font-size:.85rem">${UI.fmt.dateTime(e.starts_at)} • ${e.location||'—'}</div></div>
              <div><span class="badge badge-${EventEngine.STATUS_COLORS[e.status]||'gray'}">${EventEngine.STATUS_LABELS[e.status]||e.status}</span>
              <span class="text-muted ms-1">${c.confirmed}/${EventEngine.capacity(e)}</span></div>
            </div>`;
          }).join('') : '<div class="empty-sm">لا توجد فعاليات قادمة</div>'}
        </div>
        <div class="card">
          <h3><i class="fa-solid fa-fire"></i> الأكثر إقبالاً</h3>
          ${popular.length ? popular.map((p,i) => `<div class="list-row">
            <div><span class="rank-badge">${i+1}</span> ${p.title}</div>
            <div class="text-muted">${p.registrations} تسجيل • ${p.fill}%</div>
          </div>`).join('') : '<div class="empty-sm">—</div>'}
        </div>
      </div>

      ${pending.length ? `<div class="card mt-3">
        <h3><i class="fa-solid fa-hourglass-half"></i> فعاليات بانتظار اعتمادك</h3>
        ${pending.map(e => `<div class="list-row">
          <div><strong>${e.title}</strong> <span class="text-muted">${EventEngine.TYPES[e.event_type]?.label||e.event_type}</span></div>
          <div>${can('approve') ? `<button class="btn btn-accent btn-sm" onclick="EventsPage.approveEvent('${e.event_id}')"><i class="fa-solid fa-check"></i> اعتماد</button>`:''}</div>
        </div>`).join('')}
      </div>`:''}

      <style>
        .list-row{display:flex;justify-content:space-between;align-items:center;padding:.7rem .2rem;border-bottom:1px solid var(--border)}
        .list-row:last-child{border:none}
        .rank-badge{display:inline-block;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;text-align:center;font-size:.75rem;line-height:22px;margin-left:.4rem}
        .empty-sm{padding:1rem;text-align:center;color:var(--muted)}
        .stat-card{padding:1.1rem;border-radius:12px;background:var(--bg1);border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
        .stat-card .v{font-size:1.8rem;font-weight:700}
        .stat-card .ico{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem}
      </style>
    `;
  }
  function statCard(label, val, icon, color){
    const map = { green:'#10b981', orange:'#f59e0b', blue:'#3b82f6', purple:'#8b5cf6', red:'#ef4444' };
    const c = map[color]||'#64748b';
    return `<div class="stat-card">
      <div><div class="text-muted">${label}</div><div class="v">${val}</div></div>
      <div class="ico" style="background:${c}22;color:${c}"><i class="fa-solid ${icon}"></i></div>
    </div>`;
  }

  /* === EVENTS LIST === */
  function viewEvents(){
    const events = DB.all('events').sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at));
    if (!events.length) return `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i>لا توجد فعاليات</div>`;
    return `<div class="grid grid-3">${events.map(eventCard).join('')}</div>`;
  }

  function eventCard(e){
    const c = EventEngine.capacityBreakdown(e);
    const cap = EventEngine.capacity(e);
    const typ = EventEngine.TYPES[e.event_type] || { label:e.event_type, icon:'fa-calendar' };
    const stCol = EventEngine.STATUS_COLORS[e.status]||'gray';
    return `<div class="card event-card">
      <div class="flex-between mb-2">
        <span class="badge badge-blue"><i class="fa-solid ${typ.icon}"></i> ${typ.label}</span>
        <span class="badge badge-${stCol}">${EventEngine.STATUS_LABELS[e.status]||e.status}</span>
      </div>
      <h3 style="margin:.2rem 0">${e.title}</h3>
      <div class="text-muted mt-1"><i class="fa-solid fa-calendar"></i> ${UI.fmt.dateTime(e.starts_at)}</div>
      <div class="text-muted"><i class="fa-solid fa-location-dot"></i> ${e.location||'—'}</div>

      <div class="mt-2">
        <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.3rem">
          <span>${c.confirmed}/${cap} مؤكد</span>
          <span class="text-muted">${c.waiting} انتظار • ${c.pending} قيد المراجعة</span>
        </div>
        <div class="progress-bar"><div style="width:${c.fill_pct}%"></div></div>
      </div>

      <div class="lifecycle-chips mt-2">${lifecycleChips(e)}</div>

      <div class="mt-2 flex" style="flex-wrap:wrap;gap:.3rem">
        <button class="btn btn-accent btn-sm" onclick="EventsPage.openEvent('${e.event_id}')"><i class="fa-solid fa-eye"></i> فتح</button>
        ${can('register') && ['reg_open','published'].includes(e.lifecycle) ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.book('${e.event_id}')"><i class="fa-solid fa-ticket"></i> حجز</button>`:''}
        ${can('create') ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.editEvent('${e.event_id}')"><i class="fa-solid fa-pen"></i></button>`:''}
        ${can('cancel') && !['cancelled','archived','completed'].includes(e.lifecycle) ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.cancelEvent('${e.event_id}')"><i class="fa-solid fa-ban"></i></button>`:''}
      </div>

      <style>
        .progress-bar{height:8px;background:var(--bg2);border-radius:4px;overflow:hidden}
        .progress-bar>div{height:100%;background:linear-gradient(90deg,#10b981,#3b82f6);transition:width .3s}
        .lifecycle-chips{display:flex;gap:.25rem;flex-wrap:wrap;font-size:.7rem}
        .lc{padding:.2rem .5rem;border-radius:10px;background:var(--bg2)}
        .lc.active{background:var(--accent);color:#fff;font-weight:600}
        .lc.done{background:#10b98122;color:#10b981}
      </style>
    </div>`;
  }

  function lifecycleChips(e){
    const idx = EventEngine.LIFECYCLE.indexOf(e.lifecycle);
    return EventEngine.LIFECYCLE.map((l,i) => {
      const cls = i<idx?'done':i===idx?'active':'';
      return `<span class="lc ${cls}">${EventEngine.LIFECYCLE_LABELS[l]}</span>`;
    }).join('');
  }

  /* === REGISTRATIONS === */
  function viewRegistrations(){
    const bookings = DB.all('event_bookings').sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    const pending = bookings.filter(b => b.booking_status==='pending');
    const waiting = bookings.filter(b => b.booking_status==='waiting');
    const confirmed = bookings.filter(b => ['confirmed','approved'].includes(b.booking_status));
    return `
      <div class="grid grid-3">
        ${statCard('قيد المراجعة', pending.length,'fa-hourglass-half','orange')}
        ${statCard('قائمة الانتظار', waiting.length,'fa-people-line','blue')}
        ${statCard('مؤكدة', confirmed.length,'fa-check','green')}
      </div>

      ${pending.length ? `<div class="card mt-3"><h3><i class="fa-solid fa-hourglass-half"></i> طلبات بانتظار الاعتماد</h3>
        ${pending.map(bookingRow).join('')}</div>`:''}

      <div class="card mt-3"><h3><i class="fa-solid fa-people-line"></i> قائمة الانتظار</h3>
        ${waiting.length ? waiting.sort((a,b)=>(a.waitlist_position||0)-(b.waitlist_position||0)).map(bookingRow).join('') : '<div class="empty-sm">لا أحد في الانتظار</div>'}
      </div>

      <div class="card mt-3"><h3><i class="fa-solid fa-list"></i> أحدث التسجيلات</h3>
        ${bookings.slice(0,30).map(bookingRow).join('')}
      </div>
    `;
  }

  function bookingRow(b){
    const ev = DB.byId('events','event_id',b.event_id) || {};
    const m  = DB.byId('members','member_id',b.member_id) || { full_name:'مخدوم' };
    const sCol = { pending:'orange', waiting:'blue', confirmed:'green', approved:'green', attended:'green', rejected:'red', cancelled:'gray', no_show:'red' }[b.booking_status] || 'gray';
    return `<div class="list-row">
      <div>
        <strong>${m.full_name}</strong> <span class="text-muted">— ${ev.title||'—'}</span>
        <div class="text-muted" style="font-size:.8rem">${b.reservation_code||''} • ${UI.fmt.relative(b.created_at)}</div>
      </div>
      <div class="flex">
        <span class="badge badge-${sCol}">${b.booking_status}${b.waitlist_position?' #'+b.waitlist_position:''}</span>
        <button class="btn btn-ghost btn-sm" onclick="EventsPage.openTicket('${b.booking_id}')"><i class="fa-solid fa-ticket"></i></button>
        ${b.booking_status==='pending' && can('approveReg') ? `
          <button class="btn btn-accent btn-sm" onclick="EventsPage.approveBooking('${b.booking_id}')"><i class="fa-solid fa-check"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="EventsPage.rejectBooking('${b.booking_id}')"><i class="fa-solid fa-xmark"></i></button>
        `:''}
        ${['confirmed','approved'].includes(b.booking_status) ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.checkIn('${b.booking_id}')"><i class="fa-solid fa-door-open"></i></button>`:''}
      </div>
    </div>`;
  }

  /* === TEMPLATES === */
  function viewTemplates(){
    const tpls = DB.all('event_templates');
    return `
      <div class="flex-between mb-2">
        <h3 style="margin:0">قوالب الفعاليات</h3>
        ${can('create') ? `<button class="btn btn-accent" onclick="EventsPage.newTemplate()"><i class="fa-solid fa-plus"></i> قالب جديد</button>`:''}
      </div>
      <div class="grid grid-3">
        ${tpls.length ? tpls.map(t => {
          const typ = EventEngine.TYPES[t.event_type]||{};
          return `<div class="card">
            <div class="flex-between mb-1">
              <span class="badge badge-blue"><i class="fa-solid ${typ.icon||'fa-shapes'}"></i> ${typ.label||t.event_type}</span>
            </div>
            <h3>${t.name}</h3>
            <div class="text-muted">سعة افتراضية: ${t.defaults?.capacity||'—'}</div>
            <div class="text-muted">سعر: ${UI.fmt.money(t.defaults?.price||0)}</div>
            <div class="text-muted">${(t.defaults?.tasks||[]).length} مهام • ${(t.defaults?.budget_lines||[]).length} بنود ميزانية</div>
            <div class="mt-2 flex">
              ${can('create') ? `<button class="btn btn-accent btn-sm" onclick="EventsPage.useTemplate('${t.template_id}')"><i class="fa-solid fa-bolt"></i> استخدم</button>`:''}
            </div>
          </div>`;
        }).join('') : '<div class="empty">لا توجد قوالب</div>'}
      </div>
    `;
  }

  /* === BUDGET === */
  function viewBudget(){
    const events = DB.all('events').filter(e => e.budget_id);
    return `<div class="card">
      <h3><i class="fa-solid fa-coins"></i> ميزانيات الفعاليات</h3>
      ${events.length ? events.map(e => {
        const b = DB.byId('event_budgets','budget_id',e.budget_id);
        const fin = EventAnalytics.financialSummary(e.event_id);
        return `<div class="list-row">
          <div>
            <strong>${e.title}</strong>
            <div class="text-muted" style="font-size:.85rem">تقدير: ${UI.fmt.money(b.estimated_total)} • فعلي: ${UI.fmt.money(fin.expenses)} • استخدام: ${fin.budget_utilization}%</div>
          </div>
          <div class="flex">
            <span class="badge badge-${b.approval_status==='approved'?'green':b.approval_status==='pending'?'orange':'gray'}">${b.approval_status}</span>
            ${b.approval_status==='pending' && can('finance') ? `<button class="btn btn-accent btn-sm" onclick="EventsPage.approveBudget('${b.budget_id}')">اعتماد</button>`:''}
            <button class="btn btn-ghost btn-sm" onclick="EventsPage.openEvent('${e.event_id}')">تفاصيل</button>
          </div>
        </div>`;
      }).join('') : '<div class="empty-sm">لا توجد ميزانيات</div>'}
    </div>`;
  }

  /* === ANALYTICS === */
  function viewAnalytics(){
    const ov = EventAnalytics.overview();
    return `
      <div class="grid grid-4">
        ${statCard('إجمالي الفعاليات', ov.events_total,'fa-calendar','blue')}
        ${statCard('مكتملة', ov.events_completed,'fa-flag-checkered','green')}
        ${statCard('ملغاة', ov.events_cancelled,'fa-ban','red')}
        ${statCard('حضور فعلي', ov.bookings_attended,'fa-door-open','purple')}
      </div>
      <div class="grid grid-2 mt-3">
        <div class="card"><h3>إقبال التسجيل</h3><canvas id="ch-pop" height="220"></canvas></div>
        <div class="card"><h3>توزيع حالة الحجوزات</h3><canvas id="ch-st" height="220"></canvas></div>
      </div>`;
  }
  function drawCharts(){
    if (!window.Chart) return;
    const pop = EventAnalytics.popularityRanking().slice(0,8);
    const c1 = document.getElementById('ch-pop');
    if (c1) new Chart(c1, { type:'bar', data:{ labels:pop.map(p=>p.title), datasets:[{ label:'تسجيلات', data:pop.map(p=>p.registrations), backgroundColor:'#3b82f6' }] }, options:{ plugins:{ legend:{ display:false } } } });
    const c2 = document.getElementById('ch-st');
    if (c2) {
      const bookings = DB.all('event_bookings');
      const labels = ['pending','confirmed','waiting','attended','no_show','cancelled','rejected'];
      const data = labels.map(l => bookings.filter(b=>b.booking_status===l).length);
      new Chart(c2, { type:'doughnut', data:{ labels, datasets:[{ data, backgroundColor:['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#64748b','#dc2626'] }] }});
    }
  }

  /* === TIMELINE === */
  function viewTimeline(){
    const entries = DB.all('event_timeline').sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,80);
    return `<div class="card">
      <h3><i class="fa-solid fa-clock-rotate-left"></i> أحدث الأنشطة</h3>
      ${entries.length ? entries.map(t => {
        const ev = DB.byId('events','event_id',t.event_id);
        return `<div class="list-row">
          <div>
            <strong>${t.action}</strong> <span class="text-muted">— ${ev?.title||'—'}</span>
            ${t.meta && Object.keys(t.meta).length ? `<div class="text-muted" style="font-size:.78rem;font-family:monospace">${JSON.stringify(t.meta)}</div>`:''}
          </div>
          <div class="text-muted">${UI.fmt.relative(t.created_at)}</div>
        </div>`;
      }).join('') : '<div class="empty-sm">لا توجد أنشطة</div>'}
    </div>`;
  }

  /* ========= ACTIONS ========= */
  window.EventsPage = {
    tab(id){ activeTab=id; renderTab(); },

    /* CREATE */
    showForm(prefill){
      const typeOpts = Object.entries(EventEngine.TYPES).map(([k,v])=>`<option value="${k}" ${prefill?.event_type===k?'selected':''}>${v.label}</option>`).join('');
      UI.modal(`
        <div class="modal-header"><h3>فعالية جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="ev-form">
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title" value="${prefill?.title||''}" required></div>
          <div class="form-group"><label class="form-label">الوصف</label><textarea class="form-control" name="description">${prefill?.description||''}</textarea></div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">النوع</label><select class="form-select" name="event_type">${typeOpts}</select></div>
            <div class="form-group"><label class="form-label">السعة</label><input class="form-control" type="number" name="capacity" value="${prefill?.capacity||50}"></div>
          </div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">يبدأ</label><input class="form-control" type="datetime-local" name="starts_at" value="${prefill?.starts_at||''}" required></div>
            <div class="form-group"><label class="form-label">ينتهي</label><input class="form-control" type="datetime-local" name="ends_at" value="${prefill?.ends_at||''}"></div>
          </div>
          <div class="grid grid-3">
            <div class="form-group"><label class="form-label">السعر</label><input class="form-control" type="number" name="price" value="${prefill?.price||0}"></div>
            <div class="form-group"><label class="form-label">قائمة انتظار</label><input class="form-control" type="number" name="waitlist_capacity" value="${prefill?.waitlist_capacity||0}"></div>
            <div class="form-group"><label class="form-label">Overbook %</label><input class="form-control" type="number" name="overbook_pct" value="${prefill?.overbook_pct||0}"></div>
          </div>
          <div class="form-group"><label class="form-label">المكان</label><input class="form-control" name="location" value="${prefill?.location||''}"></div>
          <div class="grid grid-2">
            <div class="form-group"><label><input type="checkbox" name="requires_approval" ${prefill?.requires_approval?'checked':''}/> يتطلب اعتماد التسجيلات</label></div>
            <div class="form-group"><label><input type="checkbox" name="has_waiting_list" ${prefill?.has_waiting_list!==false?'checked':''}/> قائمة انتظار</label></div>
          </div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">حد أدنى للعمر</label><input class="form-control" type="number" name="min_age" value="${prefill?.access_rules?.min_age||''}"></div>
            <div class="form-group"><label class="form-label">حد أقصى للعمر</label><input class="form-control" type="number" name="max_age" value="${prefill?.access_rules?.max_age||''}"></div>
          </div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="EventsPage.save()"><i class="fa-solid fa-save"></i> حفظ كمسودة</button>
        </div>`);
    },
    save(){
      const fd = new FormData(document.getElementById('ev-form'));
      const data = Object.fromEntries(fd.entries());
      data.capacity = +data.capacity; data.price = +data.price;
      data.waitlist_capacity = +data.waitlist_capacity||0;
      data.overbook_pct = +data.overbook_pct||0;
      data.requires_approval = !!data.requires_approval;
      data.has_waiting_list = !!data.has_waiting_list;
      data.starts_at = new Date(data.starts_at).toISOString();
      if (data.ends_at) data.ends_at = new Date(data.ends_at).toISOString();
      const access = {};
      if (data.min_age) access.min_age = +data.min_age;
      if (data.max_age) access.max_age = +data.max_age;
      delete data.min_age; delete data.max_age;
      data.access_rules = access;
      EventEngine.create(data);
      UI.toast('تم إنشاء الفعالية كمسودة','success'); UI.closeModal(); render();
    },

    editEvent(id){
      const e = DB.byId('events','event_id',id);
      this.showForm(e);
    },

    /* LIFECYCLE */
    approveEvent(id){
      try { EventEngine.approve(id); UI.toast('تم الاعتماد','success'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },
    transition(id, to){
      try { EventEngine.transition(id, to); UI.toast(`تم الانتقال إلى ${EventEngine.LIFECYCLE_LABELS[to]||to}`,'success'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },
    cancelEvent(id){
      const reason = prompt('سبب الإلغاء؟','') || '';
      try { EventEngine.cancel(id, reason); UI.toast('تم الإلغاء','warning'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },

    /* EVENT DETAIL DRAWER */
    openEvent(id){
      const ev = DB.byId('events','event_id',id);
      const c = EventEngine.capacityBreakdown(ev);
      const fin = EventAnalytics.financialSummary(id);
      const tasks = DB.filter('event_tasks', t => t.event_id===id);
      const tl = EventTimeline.forEvent(id).slice(0,15);
      const nextSteps = (EventEngine.canTransition(ev.lifecycle,'review')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','review')">إرسال للاعتماد</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'published')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','published')">نشر</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'reg_open')?`<button class="btn btn-accent btn-sm" onclick="EventsPage.transition('${id}','reg_open')">فتح التسجيل</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'reg_closed')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','reg_closed')">إغلاق التسجيل</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'ongoing')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','ongoing')">بدء التنفيذ</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'completed')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','completed')">إنهاء</button>`:'')
        + (EventEngine.canTransition(ev.lifecycle,'archived')?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.transition('${id}','archived')">أرشفة</button>`:'');

      UI.modal(`
        <div class="modal-header" style="flex-direction:column;align-items:flex-start;gap:.4rem">
          <div style="display:flex;justify-content:space-between;width:100%">
            <h3 style="margin:0">${ev.title}</h3>
            <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="lifecycle-chips" style="display:flex;gap:.25rem;flex-wrap:wrap;font-size:.7rem">${lifecycleChips(ev)}</div>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow:auto">
          <div class="grid grid-4 mb-3">
            ${statCard('مؤكد',c.confirmed,'fa-check','green')}
            ${statCard('انتظار',c.waiting,'fa-people-line','blue')}
            ${statCard('قيد المراجعة',c.pending,'fa-hourglass','orange')}
            ${statCard('الإشغال',c.fill_pct+'%','fa-gauge','purple')}
          </div>

          <div class="grid grid-2">
            <div class="card"><h4>تفاصيل</h4>
              <div class="text-muted"><i class="fa-solid fa-calendar"></i> ${UI.fmt.dateTime(ev.starts_at)}${ev.ends_at?' → '+UI.fmt.dateTime(ev.ends_at):''}</div>
              <div class="text-muted"><i class="fa-solid fa-location-dot"></i> ${ev.location||'—'}</div>
              <div class="text-muted"><i class="fa-solid fa-coins"></i> ${UI.fmt.money(ev.price)}</div>
              <div class="text-muted"><i class="fa-solid fa-users"></i> ${ev.capacity} (VIP:${ev.vip_seats||0} • خدام:${ev.servant_seats||0})</div>
              ${ev.access_rules?.min_age?`<div class="text-muted"><i class="fa-solid fa-user-check"></i> ${ev.access_rules.min_age}-${ev.access_rules.max_age||''} سنة</div>`:''}
            </div>
            <div class="card"><h4>المالية</h4>
              <div class="text-muted">إيرادات: ${UI.fmt.money(fin.revenue)} / متوقع ${UI.fmt.money(fin.expected_revenue)}</div>
              <div class="text-muted">مصروفات: ${UI.fmt.money(fin.expenses)}</div>
              <div class="text-muted">صافي: ${UI.fmt.money(fin.net)}</div>
              <div class="text-muted">ميزانية: ${UI.fmt.money(fin.budget_estimated)} (${fin.budget_utilization}% مستهلك)</div>
              <div class="mt-1 flex">
                ${can('finance') && !ev.budget_id ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.createBudget('${id}')">إنشاء ميزانية</button>`:''}
                ${can('finance') && ev.budget_id ? `<button class="btn btn-ghost btn-sm" onclick="EventsPage.addExpense('${id}')"><i class="fa-solid fa-plus"></i> مصروف</button>`:''}
              </div>
            </div>
          </div>

          <div class="card mt-2"><h4>الإجراءات</h4><div class="flex" style="flex-wrap:wrap;gap:.3rem">
            ${can('register')?`<button class="btn btn-accent btn-sm" onclick="EventsPage.book('${id}')"><i class="fa-solid fa-ticket"></i> حجز</button>`:''}
            ${nextSteps}
          </div></div>

          <div class="card mt-2"><h4>المهام (${tasks.length})</h4>
            ${tasks.length ? tasks.map(t => `<div class="list-row">
              <div>${t.title} <span class="text-muted">${t.role}</span></div>
              <div><span class="badge badge-${t.status==='done'?'green':t.status==='escalated'?'red':'orange'}">${t.status}</span>
              ${t.status!=='done'?`<button class="btn btn-ghost btn-sm" onclick="EventsPage.completeTask('${t.task_id}')"><i class="fa-solid fa-check"></i></button>`:''}</div>
            </div>`).join('') : '<div class="empty-sm">لا توجد مهام</div>'}
            ${can('create')?`<button class="btn btn-ghost btn-sm mt-1" onclick="EventsPage.addTask('${id}')"><i class="fa-solid fa-plus"></i> مهمة</button>`:''}
          </div>

          <div class="card mt-2"><h4>الحجوزات</h4>
            ${DB.filter('event_bookings', b=>b.event_id===id).map(bookingRow).join('') || '<div class="empty-sm">لا توجد حجوزات</div>'}
          </div>

          <div class="card mt-2"><h4>السجل الزمني</h4>
            ${tl.length ? tl.map(t=>`<div class="list-row"><div>${t.action} <span class="text-muted" style="font-size:.78rem">${JSON.stringify(t.meta||{})}</span></div><div class="text-muted">${UI.fmt.relative(t.created_at)}</div></div>`).join('') : '<div class="empty-sm">—</div>'}
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
      `);
    },

    /* TASKS */
    addTask(eventId){
      const title = prompt('عنوان المهمة؟'); if (!title) return;
      const role  = prompt('الدور؟ (organizer/servant/volunteer/transport/attendance/finance)','organizer') || 'organizer';
      EventWorkflowEngine.assignTask({ event_id:eventId, title, role });
      UI.toast('تمت إضافة المهمة','success'); this.openEvent(eventId);
    },
    completeTask(id){ EventWorkflowEngine.completeTask(id); UI.toast('تم','success'); render(); },

    /* REGISTRATION */
    book(eid){
      const e = DB.byId('events','event_id',eid);
      const members = DB.all('members');
      UI.modal(`
        <div class="modal-header"><h3>حجز: ${e.title}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">المخدوم</label>
            <select class="form-select" id="book-member"><option value="">—</option>${members.map(m=>`<option value="${m.member_id}">${m.full_name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">فئة المقعد</label>
            <select class="form-select" id="book-seat"><option value="regular">عادي</option><option value="vip">VIP</option><option value="servant">خادم</option><option value="reserved">محجوز</option></select></div>
          <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" id="book-notes"></textarea></div>
          <div id="elig-msg" class="text-muted"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="EventsPage.doBook('${eid}')"><i class="fa-solid fa-ticket"></i> تأكيد</button>
        </div>`);
    },
    doBook(eid){
      const mid = document.getElementById('book-member').value;
      if (!mid) return UI.toast('اختر مخدوم','error');
      try {
        const b = RegistrationEngine.register(eid, mid, {
          seat_class: document.getElementById('book-seat').value,
          notes: document.getElementById('book-notes').value
        });
        UI.toast(b.booking_status==='waiting'?`قائمة انتظار #${b.waitlist_position}`:b.booking_status==='pending'?'بانتظار الاعتماد':'تم الحجز','success');
        UI.closeModal();
        EventsPage.openTicket(b.booking_id);
      } catch(e){ UI.toast(e.message,'error'); }
    },
    approveBooking(id){
      try { RegistrationEngine.approveBooking(id); UI.toast('تم الاعتماد','success'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },
    rejectBooking(id){
      const reason = prompt('سبب الرفض؟','')||'';
      try { RegistrationEngine.rejectBooking(id, reason); UI.toast('تم الرفض','warning'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },
    checkIn(id){
      try { RegistrationEngine.checkIn(id); UI.toast('تم تسجيل الحضور','success'); render(); }
      catch(e){ UI.toast(e.message,'error'); }
    },

    openTicket(id){
      UI.modal(`<div class="modal-header"><h3>التذكرة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">${TicketEngine.render(id)}</div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
      setTimeout(()=> TicketEngine.attachQr(id), 50);
    },

    /* TEMPLATES */
    showTemplates(){ activeTab='templates'; render(); },
    useTemplate(id){
      const starts = prompt('تاريخ البداية (YYYY-MM-DDTHH:mm)','');
      try {
        const ev = EventEngine.createFromTemplate(id, { starts_at: starts ? new Date(starts).toISOString() : undefined });
        UI.toast('تم إنشاء الفعالية من القالب','success');
        activeTab='events'; render();
        setTimeout(()=> EventsPage.openEvent(ev.event_id), 100);
      } catch(e){ UI.toast(e.message,'error'); }
    },
    newTemplate(){
      const name = prompt('اسم القالب؟'); if (!name) return;
      const type = prompt('النوع؟ ('+Object.keys(EventEngine.TYPES).join('/')+')','conference') || 'conference';
      const cap  = +prompt('السعة الافتراضية؟','50') || 50;
      const price= +prompt('السعر الافتراضي؟','0') || 0;
      DB.insert('event_templates', { name, event_type:type, defaults:{ capacity:cap, price, duration_hours:3, tasks:[], budget_lines:[] }, created_by:(Auth.session()||{}).user_id });
      UI.toast('تم إنشاء القالب','success'); render();
    },

    /* BUDGET */
    createBudget(eventId){
      const est = +prompt('إجمالي الميزانية التقديرية؟','0')||0;
      const b = DB.insert('event_budgets', { event_id:eventId, estimated_total:est, approved_total:0, actual_total:0, lines:[], approval_status:'draft' });
      DB.update('events','event_id',eventId,{ budget_id:b.budget_id });
      EventWorkflowEngine.requestBudgetApproval(eventId);
      UI.toast('تم إنشاء الميزانية وإرسالها للاعتماد','success');
      this.openEvent(eventId);
    },
    approveBudget(id){
      EventWorkflowEngine.approveBudget(id);
      UI.toast('تم اعتماد الميزانية','success'); render();
    },
    addExpense(eventId){
      const label = prompt('وصف المصروف؟'); if(!label) return;
      const category = prompt('الفئة؟ (transport/food/equipment/activity/service/other)','other')||'other';
      const amount = +prompt('المبلغ؟','0')||0;
      DB.insert('event_expenses', { event_id:eventId, category, label, amount, status:'pending', created_by:(Auth.session()||{}).user_id });
      EventTimeline.log(eventId,'expense_added',{ label, amount });
      // sync into budget actual_total
      const ev = DB.byId('events','event_id',eventId);
      if (ev?.budget_id) {
        const b = DB.byId('event_budgets','budget_id',ev.budget_id);
        const total = DB.filter('event_expenses', x => x.event_id===eventId).reduce((s,e)=>s+(+e.amount||0),0);
        DB.update('event_budgets','budget_id',b.budget_id,{ actual_total:total });
      }
      UI.toast('تم تسجيل المصروف','success'); this.openEvent(eventId);
    }
  };

  render();
})();
