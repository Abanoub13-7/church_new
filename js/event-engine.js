/* ============================================================
   EVENT-ENGINE.js — Enterprise Event Core
   Lifecycle • Status • Types • Templates • Access • Capacity
   ============================================================ */
(function(){

  /* === EVENT TYPES === */
  const TYPES = {
    conference: { label:'مؤتمر',     icon:'fa-microphone-lines', requires_approval:true,  default_capacity:100 },
    retreat:    { label:'خلوة',      icon:'fa-tree',             requires_approval:true,  default_capacity:80  },
    meeting:    { label:'اجتماع',    icon:'fa-people-group',     requires_approval:false, default_capacity:30  },
    class:      { label:'فصل',       icon:'fa-chalkboard-user',  requires_approval:false, default_capacity:25  },
    course:     { label:'دورة',      icon:'fa-graduation-cap',   requires_approval:true,  default_capacity:40  },
    trip:       { label:'رحلة',      icon:'fa-bus',              requires_approval:true,  default_capacity:50  },
    camp:       { label:'مخيم',      icon:'fa-campground',       requires_approval:true,  default_capacity:60  },
    prayer:     { label:'اجتماع صلاة',icon:'fa-hands-praying',   requires_approval:false, default_capacity:40  },
    ministry:   { label:'نشاط خدمة', icon:'fa-hand-holding-heart',requires_approval:false,default_capacity:30  },
    servant:    { label:'اجتماع خدام',icon:'fa-user-tie',        requires_approval:true,  default_capacity:25  }
  };

  /* === LIFECYCLE === */
  const LIFECYCLE = ['draft','review','published','reg_open','reg_closed','ongoing','completed','archived'];
  const LIFECYCLE_LABELS = {
    draft:'مسودة', review:'مراجعة', published:'منشور',
    reg_open:'التسجيل مفتوح', reg_closed:'التسجيل مغلق',
    ongoing:'جاري التنفيذ', completed:'اكتمل', archived:'مؤرشف'
  };
  const STATUS_LABELS = {
    draft:'مسودة', pending_approval:'بانتظار الاعتماد', published:'منشور',
    active:'نشط', full:'مكتمل', waitlist:'قائمة انتظار',
    completed:'اكتمل', cancelled:'ملغي', archived:'مؤرشف'
  };
  const STATUS_COLORS = {
    draft:'gray', pending_approval:'orange', published:'blue',
    active:'green', full:'red', waitlist:'orange',
    completed:'blue', cancelled:'red', archived:'gray'
  };

  /* === LIFECYCLE TRANSITIONS === */
  const ALLOWED = {
    draft:       ['review','published','cancelled'],
    review:      ['published','draft','cancelled'],
    published:   ['reg_open','cancelled','archived'],
    reg_open:    ['reg_closed','ongoing','cancelled'],
    reg_closed:  ['ongoing','reg_open','cancelled'],
    ongoing:     ['completed','cancelled'],
    completed:   ['archived'],
    archived:    [],
    cancelled:   ['archived']
  };

  function canTransition(from, to){ return (ALLOWED[from] || []).includes(to); }

  function transition(eventId, to, actor){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) throw new Error('event not found');
    if (!canTransition(ev.lifecycle, to)) {
      throw new Error(`انتقال غير مسموح: ${ev.lifecycle} → ${to}`);
    }
    const from = ev.lifecycle;
    const patch = { lifecycle: to, updated_at: new Date().toISOString() };
    // map lifecycle → status
    if (to === 'reg_open') patch.status = 'active';
    if (to === 'reg_closed') patch.status = 'published';
    if (to === 'ongoing') patch.status = 'active';
    if (to === 'completed') patch.status = 'completed';
    if (to === 'archived') patch.status = 'archived';
    if (to === 'cancelled') patch.status = 'cancelled';
    if (to === 'review') patch.status = 'pending_approval';
    if (to === 'published') patch.status = 'published';
    DB.update('events','event_id',eventId, patch);

    EventTimeline.log(eventId, `lifecycle:${from}→${to}`, { from, to });
    Audit.log('event.transition', { event_id:eventId, from, to });

    // notify + workflows
    if (window.EventNotificationEngine) {
      EventNotificationEngine.onLifecycleChange(eventId, from, to);
    }
    if (window.EventWorkflowEngine) {
      EventWorkflowEngine.onLifecycleChange(eventId, from, to);
    }
    return DB.byId('events','event_id',eventId);
  }

  /* === STATUS RECOMPUTE (derived from bookings + capacity) === */
  function recomputeStatus(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    if (['draft','cancelled','archived','completed'].includes(ev.lifecycle)) return;
    const bookings = DB.filter('event_bookings', b=> b.event_id===eventId);
    const confirmed = bookings.filter(b => ['confirmed','approved','attended'].includes(b.booking_status)).length;
    const waiting   = bookings.filter(b => b.booking_status==='waiting').length;
    const cap = capacity(ev);
    let status = ev.status;
    if (confirmed >= cap && waiting>0) status = 'waitlist';
    else if (confirmed >= cap) status = 'full';
    else if (ev.lifecycle === 'reg_open') status = 'active';
    if (status !== ev.status) DB.update('events','event_id',eventId,{ status });

    // auto-close when full
    if (ev.auto_close_when_full && confirmed >= cap && ev.lifecycle === 'reg_open' && !ev.has_waiting_list) {
      try { transition(eventId,'reg_closed'); } catch(_){}
    }
  }

  /* === CAPACITY === */
  function capacity(ev){
    const overbook = Math.floor((ev.capacity||0) * (ev.overbook_pct||0)/100);
    return (ev.capacity||0) + overbook;
  }
  function capacityBreakdown(ev){
    const bookings = DB.filter('event_bookings', b=> b.event_id===ev.event_id);
    const confirmed = bookings.filter(b => ['confirmed','approved','attended'].includes(b.booking_status));
    return {
      total: capacity(ev),
      regular: confirmed.filter(b=>b.seat_class==='regular').length,
      vip:     confirmed.filter(b=>b.seat_class==='vip').length,
      servant: confirmed.filter(b=>b.seat_class==='servant').length,
      reserved:confirmed.filter(b=>b.seat_class==='reserved').length,
      confirmed: confirmed.length,
      waiting: bookings.filter(b=>b.booking_status==='waiting').length,
      pending: bookings.filter(b=>b.booking_status==='pending').length,
      attended: bookings.filter(b=>b.booking_status==='attended').length,
      no_show:  bookings.filter(b=>b.booking_status==='no_show').length,
      cancelled:bookings.filter(b=>b.booking_status==='cancelled').length,
      fill_pct: capacity(ev) ? Math.min(100, Math.round(confirmed.length/capacity(ev)*100)) : 0
    };
  }
  function isFull(ev){ return capacityBreakdown(ev).confirmed >= capacity(ev); }

  /* === ROLE-BASED ACCESS === */
  function canMemberRegister(ev, member){
    const r = ev.access_rules || {};
    if (r.min_age && member.age && member.age < r.min_age) return { ok:false, reason:`الحد الأدنى للعمر: ${r.min_age}` };
    if (r.max_age && member.age && member.age > r.max_age) return { ok:false, reason:`الحد الأقصى للعمر: ${r.max_age}` };
    if (r.gender && member.gender && member.gender !== r.gender) return { ok:false, reason:'مقصور على جنس محدد' };
    if (r.ministries?.length && !r.ministries.includes(member.ministry_id)) return { ok:false, reason:'غير مخصص لخدمتك' };
    if (r.classes?.length && !r.classes.includes(member.service_class_id)) return { ok:false, reason:'غير مخصص لفصلك' };
    if (r.min_attendance_rate && (member.attendance_rate||0) < r.min_attendance_rate) return { ok:false, reason:`نسبة حضور أقل من ${r.min_attendance_rate}%` };
    if (r.min_serving_level && (member.serving_level||0) < r.min_serving_level) return { ok:false, reason:'مستوى الخدمة غير كافٍ' };
    return { ok:true };
  }

  /* === TEMPLATES === */
  function createFromTemplate(templateId, overrides){
    const tpl = DB.byId('event_templates','template_id',templateId);
    if (!tpl) throw new Error('template not found');
    const def = tpl.defaults || {};
    const starts = overrides.starts_at || new Date(Date.now()+7*864e5).toISOString();
    const ends = new Date(new Date(starts).getTime() + (def.duration_hours||3)*36e5).toISOString();
    const ev = DB.insert('events', {
      title: overrides.title || tpl.name,
      description: overrides.description || '',
      event_type: tpl.event_type,
      starts_at: starts, ends_at: ends,
      location: overrides.location || '',
      capacity: def.capacity || 50,
      reserved_seats:0, vip_seats:0, servant_seats:0,
      waitlist_capacity: def.waitlist_capacity||0,
      overbook_pct:0,
      price: def.price || 0, currency:'EGP',
      has_waiting_list:true,
      requires_approval: !!def.requires_approval,
      auto_close_when_full:true,
      lifecycle:'draft', status:'draft',
      access_rules: def.access_rules || {},
      template_id: templateId,
      approval_required: (TYPES[tpl.event_type]||{}).requires_approval || false,
      created_by: (Auth.session()||{}).user_id
    });
    // create default tasks
    (def.tasks||[]).forEach(t => DB.insert('event_tasks', { event_id:ev.event_id, title:t.title, role:t.role, status:'open' }));
    // create budget skeleton
    if (def.budget_lines?.length) {
      const lines = def.budget_lines.map(l => ({ ...l, actual:0 }));
      const total = lines.reduce((s,l)=>s+(+l.estimated||0),0);
      const b = DB.insert('event_budgets', { event_id:ev.event_id, estimated_total:total, approved_total:0, actual_total:0, lines, approval_status:'draft' });
      DB.update('events','event_id',ev.event_id,{ budget_id: b.budget_id });
    }
    EventTimeline.log(ev.event_id,'created_from_template',{ template_id: templateId });
    Audit.log('event.create_from_template',{ event_id:ev.event_id, template_id:templateId });
    return ev;
  }

  /* === CREATE / APPROVE === */
  function create(data){
    const typ = TYPES[data.event_type] || {};
    const ev = DB.insert('events', Object.assign({
      lifecycle:'draft', status:'draft',
      reserved_seats:0, vip_seats:0, servant_seats:0,
      waitlist_capacity:0, overbook_pct:0,
      currency:'EGP', has_waiting_list:true,
      auto_close_when_full:true,
      access_rules:{},
      approval_required: typ.requires_approval || false,
      requires_approval: !!data.requires_approval,
      created_by:(Auth.session()||{}).user_id
    }, data));
    EventTimeline.log(ev.event_id,'created',{ title:ev.title });
    Audit.log('event.create',{ event_id:ev.event_id });
    return ev;
  }

  function approve(eventId){
    const s = Auth.session();
    DB.update('events','event_id',eventId,{ approved_by:s.user_id, approved_at:new Date().toISOString() });
    EventTimeline.log(eventId,'approved',{ by:s.user_id });
    Audit.log('event.approve',{ event_id:eventId });
    return transition(eventId,'published');
  }

  function cancel(eventId, reason){
    DB.update('events','event_id',eventId,{ cancelled_reason: reason||'' });
    EventTimeline.log(eventId,'cancelled',{ reason });
    Audit.log('event.cancel',{ event_id:eventId, reason });
    if (window.EventNotificationEngine) EventNotificationEngine.onCancelled(eventId, reason);
    return transition(eventId,'cancelled');
  }

  /* === TIMELINE HELPER === */
  const EventTimeline = {
    log(eventId, action, meta){
      const s = Auth.session() || {};
      DB.insert('event_timeline', {
        event_id:eventId, action, actor_id:s.user_id||null,
        member_id: meta?.member_id || null,
        meta: meta||{}
      });
    },
    forEvent(eventId){
      return DB.filter('event_timeline', t => t.event_id===eventId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    },
    forMember(memberId){
      return DB.filter('event_timeline', t => t.member_id===memberId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    }
  };

  window.EventEngine = {
    TYPES, LIFECYCLE, LIFECYCLE_LABELS, STATUS_LABELS, STATUS_COLORS,
    canTransition, transition, recomputeStatus,
    capacity, capacityBreakdown, isFull, canMemberRegister,
    createFromTemplate, create, approve, cancel
  };
  window.EventTimeline = EventTimeline;
})();
