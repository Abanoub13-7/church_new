/* ============================================================
   EVENT-ANALYTICS.js — Capacity, velocity, attendance, finance
   ============================================================ */
(function(){

  function eventMetrics(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return null;
    const cap = EventEngine.capacityBreakdown(ev);
    const bookings = DB.filter('event_bookings', b => b.event_id===eventId);
    const total = bookings.length;
    const attended = cap.attended;
    const expected = cap.confirmed + cap.pending;
    const noShow = cap.no_show;
    const attendanceRate = (attended+noShow) ? Math.round(attended/(attended+noShow)*100) : null;

    // Registration velocity (last 7 days)
    const now = Date.now();
    const last7 = bookings.filter(b => (now - new Date(b.created_at).getTime()) < 7*864e5).length;
    const prev7 = bookings.filter(b => { const d = now-new Date(b.created_at).getTime(); return d>=7*864e5 && d<14*864e5; }).length;
    const velocityChange = prev7 ? Math.round((last7-prev7)/prev7*100) : null;

    return {
      ev, cap, total, attended, noShow, expected, attendanceRate,
      fillPct: cap.fill_pct, velocity7d: last7, velocityChange,
      cancellations: cap.cancelled
    };
  }

  function overview(){
    const events = DB.all('events');
    const active = events.filter(e => ['active','reg_open','published','full','waitlist'].includes(e.status) || ['reg_open','reg_closed','ongoing','published'].includes(e.lifecycle));
    const completed = events.filter(e => e.status==='completed');
    const cancelled = events.filter(e => e.status==='cancelled');
    const pending   = events.filter(e => e.status==='pending_approval');
    const totalBookings = DB.all('event_bookings').length;
    const totalAttended = DB.count('event_bookings', b => b.booking_status==='attended');
    const totalWaiting  = DB.count('event_bookings', b => b.booking_status==='waiting');
    const totalPending  = DB.count('event_bookings', b => b.booking_status==='pending');

    return {
      events_total: events.length,
      events_active: active.length,
      events_completed: completed.length,
      events_cancelled: cancelled.length,
      events_pending: pending.length,
      bookings_total: totalBookings,
      bookings_attended: totalAttended,
      bookings_waiting: totalWaiting,
      bookings_pending: totalPending,
      avg_fill: events.length ? Math.round(events.reduce((s,e)=> s+EventEngine.capacityBreakdown(e).fill_pct,0)/events.length) : 0
    };
  }

  function financialSummary(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return null;
    const bookings = DB.filter('event_bookings', b => b.event_id===eventId && b.booking_status!=='cancelled' && b.booking_status!=='rejected');
    const revenue = bookings.reduce((s,b)=> s+(+b.amount_paid||0), 0);
    const expected = bookings.length * (+ev.price||0);
    const expenses = DB.filter('event_expenses', e => e.event_id===eventId && e.status!=='rejected').reduce((s,e)=> s+(+e.amount||0),0);
    const budget = ev.budget_id ? DB.byId('event_budgets','budget_id',ev.budget_id) : null;
    return {
      revenue, expected_revenue: expected, expenses,
      net: revenue - expenses,
      budget_estimated: budget?.estimated_total||0,
      budget_approved: budget?.approved_total||0,
      budget_utilization: budget?.estimated_total ? Math.round(expenses/budget.estimated_total*100) : 0
    };
  }

  function popularityRanking(){
    const events = DB.all('events');
    return events.map(e => ({
      event_id:e.event_id, title:e.title,
      registrations: DB.count('event_bookings', b=> b.event_id===e.event_id && !['cancelled','rejected'].includes(b.booking_status)),
      fill: EventEngine.capacityBreakdown(e).fill_pct
    })).sort((a,b)=> b.registrations - a.registrations);
  }

  function memberHistory(memberId){
    const bookings = DB.filter('event_bookings', b => b.member_id===memberId);
    return bookings.map(b => ({
      booking: b,
      event: DB.byId('events','event_id', b.event_id)
    })).sort((a,b)=> new Date(b.event?.starts_at||0) - new Date(a.event?.starts_at||0));
  }

  window.EventAnalytics = { eventMetrics, overview, financialSummary, popularityRanking, memberHistory };
})();
