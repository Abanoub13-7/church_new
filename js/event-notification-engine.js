/* ============================================================
   EVENT-NOTIFICATION-ENGINE.js — Event-specific notifications
   Wraps NotificationsEngine.notify and Notify.toUser
   ============================================================ */
(function(){

  function notify(user_id, opts){
    if (window.NotificationsEngine?.notify) {
      return NotificationsEngine.notify(Object.assign({ user_id }, opts));
    }
    if (window.Notify?.toUser) {
      return Notify.toUser(user_id, opts.type||'info', opts.title, opts.body, opts.link);
    }
  }

  function broadcastToRoles(roles, opts){
    DB.filter('users', u => roles.includes(u.role) && u.is_active!==false).forEach(u => notify(u.user_id, opts));
  }

  function memberUser(memberId){
    return DB.find('users', u => u.member_id === memberId);
  }

  /* === LIFECYCLE === */
  function onLifecycleChange(eventId, from, to){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    if (to === 'reg_open') {
      broadcastToRoles(['servant','servant_leader','supervisor','church_admin'], {
        type:'event', priority:'medium',
        title:`فُتح التسجيل: ${ev.title}`, body:UI.fmt.dateTime(ev.starts_at),
        link:'events.html', dedupe_key:`ev_open:${eventId}`
      });
    }
    if (to === 'ongoing') {
      broadcastToRoles(['servant','servant_leader','supervisor'], {
        type:'event', priority:'medium',
        title:`بدأت الفعالية: ${ev.title}`, body:ev.location||'',
        link:'events.html', dedupe_key:`ev_start:${eventId}`
      });
    }
    if (to === 'completed') {
      broadcastToRoles(['church_admin','servant_leader'], {
        type:'event', priority:'low',
        title:`اكتملت الفعالية: ${ev.title}`,
        body:`جاهزة لمراجعة الحضور والمتابعة`,
        link:'events.html', dedupe_key:`ev_done:${eventId}`
      });
    }
  }

  function onCancelled(eventId, reason){
    const ev = DB.byId('events','event_id',eventId);
    DB.filter('event_bookings', b => b.event_id===eventId && !['cancelled','rejected'].includes(b.booking_status))
      .forEach(b => {
        const u = memberUser(b.member_id);
        if (u) notify(u.user_id, { type:'alert', priority:'high',
          title:`أُلغيت الفعالية: ${ev.title}`,
          body: reason || 'تم إلغاء الفعالية. سيتم التواصل بخصوص أي مبالغ مدفوعة.',
          link:'events.html' });
      });
  }

  /* === BOOKING === */
  function onRegistered(booking, ev){
    const u = memberUser(booking.member_id);
    if (!u) return;
    const msg = booking.booking_status === 'pending' ? 'تم استلام طلبك وبانتظار الاعتماد'
              : booking.booking_status === 'waiting' ? `أنت في قائمة الانتظار #${booking.waitlist_position}`
              : `تم تأكيد حجزك — كود: ${booking.reservation_code}`;
    notify(u.user_id, { type:'event', priority:'medium', title:`تسجيل: ${ev.title}`, body:msg, link:'events.html' });
  }
  function onApproved(booking, ev){
    const u = memberUser(booking.member_id);
    if (u) notify(u.user_id, { type:'event', priority:'high', title:`تم اعتماد تسجيلك: ${ev.title}`, body:`كود الحجز: ${booking.reservation_code}`, link:'events.html' });
  }
  function onRejected(booking, reason){
    const u = memberUser(booking.member_id);
    const ev = DB.byId('events','event_id',booking.event_id);
    if (u) notify(u.user_id, { type:'event', priority:'medium', title:`تعذر اعتماد تسجيلك: ${ev?.title||''}`, body:reason||'يرجى التواصل مع الخدام', link:'events.html' });
  }
  function onPromoted(booking, ev){
    const u = memberUser(booking.member_id);
    if (u) notify(u.user_id, { type:'event', priority:'high', title:`تمت ترقيتك من قائمة الانتظار: ${ev.title}`, body:`كود: ${booking.reservation_code}`, link:'events.html' });
  }

  /* === TASKS === */
  function onTaskOverdue(task){
    if (task.assigned_to) notify(task.assigned_to, { type:'task', priority:'high', title:`مهمة فعالية متأخرة`, body:task.title, link:'events.html' });
  }

  /* === REMINDERS (call on a schedule / page load) === */
  function runReminders(){
    const now = Date.now();
    // 24h before event
    DB.all('events').forEach(ev => {
      if (!['reg_open','reg_closed','published','ongoing','active'].includes(ev.status)) return;
      const ms = new Date(ev.starts_at).getTime() - now;
      if (ms > 0 && ms < 25*36e5) {
        DB.filter('event_bookings', b => b.event_id===ev.event_id && ['confirmed','approved'].includes(b.booking_status))
          .forEach(b => {
            const u = memberUser(b.member_id);
            if (u) notify(u.user_id, { type:'reminder', priority:'medium', title:`تذكير: ${ev.title} غداً`, body:UI.fmt.dateTime(ev.starts_at), link:'events.html', dedupe_key:`ev_rem24:${ev.event_id}:${b.member_id}` });
          });
      }
      // capacity alert at 90% full
      const cap = EventEngine.capacityBreakdown(ev);
      if (cap.fill_pct >= 90 && cap.fill_pct < 100) {
        broadcastToRoles(['church_admin','servant_leader'], {
          type:'alert', priority:'high',
          title:`اقتراب اكتمال: ${ev.title} (${cap.fill_pct}%)`,
          body:`${cap.confirmed}/${EventEngine.capacity(ev)} حجز`,
          link:'events.html', dedupe_key:`ev_cap90:${ev.event_id}`
        });
      }
      // registration closing in 24h
      if (ev.registration_closes_at) {
        const cms = new Date(ev.registration_closes_at).getTime() - now;
        if (cms > 0 && cms < 25*36e5) {
          broadcastToRoles(['servant','servant_leader','supervisor'], {
            type:'reminder', priority:'medium',
            title:`يغلق التسجيل قريباً: ${ev.title}`,
            body:UI.fmt.dateTime(ev.registration_closes_at),
            link:'events.html', dedupe_key:`ev_regclose:${ev.event_id}`
          });
        }
      }
    });
  }

  window.EventNotificationEngine = {
    onLifecycleChange, onCancelled,
    onRegistered, onApproved, onRejected, onPromoted,
    onTaskOverdue, runReminders
  };
})();
