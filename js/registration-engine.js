/* ============================================================
   REGISTRATION-ENGINE.js — Smart Registration / Approval / Waitlist
   ============================================================ */
(function(){

  function ticketCode(){
    return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  }
  function reservationCode(){
    return 'R-' + Math.random().toString(36).slice(2,8).toUpperCase();
  }

  /* === ELIGIBILITY === */
  function checkEligibility(eventId, memberId){
    const ev = DB.byId('events','event_id',eventId);
    const m  = DB.byId('members','member_id',memberId);
    if (!ev || !m) return { ok:false, reason:'بيانات غير صحيحة' };
    if (!['reg_open','published'].includes(ev.lifecycle)) return { ok:false, reason:'التسجيل غير متاح حالياً' };
    if (ev.registration_closes_at && new Date(ev.registration_closes_at) < new Date()) return { ok:false, reason:'انتهى موعد التسجيل' };
    if (ev.registration_opens_at && new Date(ev.registration_opens_at) > new Date()) return { ok:false, reason:'لم يبدأ التسجيل بعد' };
    const dup = DB.find('event_bookings', b => b.event_id===eventId && b.member_id===memberId && !['cancelled','rejected','no_show'].includes(b.booking_status));
    if (dup) return { ok:false, reason:'تم التسجيل مسبقاً' };
    return EventEngine.canMemberRegister(ev, m);
  }

  /* === REGISTER === */
  function register(eventId, memberId, opts){
    opts = opts || {};
    const elig = checkEligibility(eventId, memberId);
    if (!elig.ok) throw new Error(elig.reason);
    const ev = DB.byId('events','event_id',eventId);
    const cap = EventEngine.capacityBreakdown(ev);
    const full = cap.confirmed >= EventEngine.capacity(ev);

    let booking_status, waitlist_position = null;
    if (ev.requires_approval) {
      booking_status = 'pending';
    } else if (full) {
      if (!ev.has_waiting_list) throw new Error('الفعالية مكتملة');
      const wlSize = DB.count('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting');
      if (ev.waitlist_capacity && wlSize >= ev.waitlist_capacity) throw new Error('قائمة الانتظار مكتملة');
      booking_status = 'waiting';
      waitlist_position = wlSize + 1;
    } else {
      booking_status = 'confirmed';
    }

    const booking = DB.insert('event_bookings', {
      event_id: eventId, member_id: memberId,
      booking_status, waitlist_position,
      seat_class: opts.seat_class || 'regular',
      payment_status: ev.price > 0 ? 'unpaid' : 'paid',
      amount_paid: 0,
      qr_ticket: ticketCode(),
      reservation_code: reservationCode(),
      notes: opts.notes || ''
    });

    EventTimeline.log(eventId, booking_status === 'waiting' ? 'waitlisted' : (booking_status==='pending'?'registered_pending':'registered'),
      { member_id: memberId, booking_id: booking.booking_id, position: waitlist_position });
    Audit.log('event.register',{ event_id:eventId, member_id:memberId, status:booking_status });

    EventEngine.recomputeStatus(eventId);

    if (window.EventNotificationEngine) {
      EventNotificationEngine.onRegistered(booking, ev);
    }
    if (window.EventWorkflowEngine) {
      EventWorkflowEngine.onRegistered(booking, ev);
    }
    return booking;
  }

  /* === APPROVE / REJECT === */
  function approveBooking(bookingId, notes){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    const ev = DB.byId('events','event_id',b.event_id);
    const cap = EventEngine.capacityBreakdown(ev);
    const full = cap.confirmed >= EventEngine.capacity(ev);
    const newStatus = full && ev.has_waiting_list ? 'waiting' : 'confirmed';
    const wl_pos = newStatus==='waiting' ? (DB.count('event_bookings', x=> x.event_id===b.event_id && x.booking_status==='waiting')+1) : null;
    DB.update('event_bookings','booking_id',bookingId,{
      booking_status:newStatus, waitlist_position:wl_pos,
      approved_by:(Auth.session()||{}).user_id, approved_at:new Date().toISOString(),
      notes: notes ? ((b.notes||'')+'\n'+notes) : b.notes
    });
    EventTimeline.log(b.event_id,'approved_reg',{ member_id:b.member_id, booking_id:bookingId });
    Audit.log('event.booking.approve',{ booking_id:bookingId });
    EventEngine.recomputeStatus(b.event_id);
    if (window.EventNotificationEngine) EventNotificationEngine.onApproved(b, ev);
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  function rejectBooking(bookingId, reason){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'rejected', rejected_reason: reason||'' });
    EventTimeline.log(b.event_id,'rejected_reg',{ member_id:b.member_id, booking_id:bookingId, reason });
    Audit.log('event.booking.reject',{ booking_id:bookingId, reason });
    if (window.EventNotificationEngine) EventNotificationEngine.onRejected(b, reason);
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  /* === CANCEL — auto promotes top of waitlist === */
  function cancelBooking(bookingId, reason){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return;
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'cancelled', notes:(b.notes||'')+'\nإلغاء: '+(reason||'') });
    EventTimeline.log(b.event_id,'cancelled_reg',{ member_id:b.member_id, booking_id:bookingId, reason });
    Audit.log('event.booking.cancel',{ booking_id:bookingId });
    promoteWaitlist(b.event_id);
    EventEngine.recomputeStatus(b.event_id);
  }

  /* === AUTO PROMOTE WAITLIST === */
  function promoteWaitlist(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    const cap = EventEngine.capacity(ev);
    let confirmed = DB.count('event_bookings', b=> b.event_id===eventId && ['confirmed','approved','attended'].includes(b.booking_status));
    const waiting = DB.filter('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting')
      .sort((a,b)=> (a.waitlist_position||0)-(b.waitlist_position||0));
    const promoted = [];
    for (const w of waiting) {
      if (confirmed >= cap) break;
      DB.update('event_bookings','booking_id',w.booking_id,{ booking_status:'confirmed', waitlist_position:null });
      EventTimeline.log(eventId,'promoted',{ member_id:w.member_id, booking_id:w.booking_id });
      Audit.log('event.booking.promote',{ booking_id:w.booking_id });
      if (window.EventNotificationEngine) EventNotificationEngine.onPromoted(w, ev);
      promoted.push(w);
      confirmed++;
    }
    // re-number waitlist
    DB.filter('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting')
      .sort((a,b)=> (a.waitlist_position||0)-(b.waitlist_position||0))
      .forEach((b,i)=> DB.update('event_bookings','booking_id',b.booking_id,{ waitlist_position:i+1 }));
    return promoted;
  }

  /* === CHECK-IN === */
  function checkIn(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'attended', checked_in_at:new Date().toISOString() });
    EventTimeline.log(b.event_id,'checked_in',{ member_id:b.member_id, booking_id:bookingId });
    Audit.log('event.checkin',{ booking_id:bookingId });
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  function markNoShow(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return;
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'no_show' });
    EventTimeline.log(b.event_id,'no_show',{ member_id:b.member_id, booking_id:bookingId });
    promoteWaitlist(b.event_id);
  }

  window.RegistrationEngine = {
    ticketCode, reservationCode,
    checkEligibility, register,
    approveBooking, rejectBooking, cancelBooking,
    promoteWaitlist, checkIn, markNoShow
  };
})();
