/* ============================================================
   TICKET-ENGINE.js — Ticket + QR + Pass generation
   Uses qrcodejs (already loaded in page) when available.
   ============================================================ */
(function(){

  function ticketUrl(booking){
    // Encoded data the scanner page can verify
    return JSON.stringify({ t:'ticket', tk: booking.qr_ticket, ev: booking.event_id, m: booking.member_id, rc: booking.reservation_code });
  }

  function render(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return '';
    const ev = DB.byId('events','event_id', b.event_id);
    const m  = DB.byId('members','member_id', b.member_id) || { full_name:'—' };
    const statusBadge = `<span class="badge badge-${b.booking_status==='confirmed'?'green':b.booking_status==='waiting'?'orange':b.booking_status==='pending'?'blue':'gray'}">${b.booking_status}</span>`;
    return `
      <div class="ticket-pass">
        <div class="ticket-head">
          <div>
            <div class="text-muted" style="font-size:.75rem">تذكرة دخول</div>
            <h3 style="margin:.2rem 0">${ev?.title||'—'}</h3>
            <div class="text-muted">${ev ? UI.fmt.dateTime(ev.starts_at) : ''}</div>
            <div class="text-muted">${ev?.location||''}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="ticket-body">
          <div>
            <div class="text-muted" style="font-size:.75rem">المخدوم</div>
            <div style="font-weight:600">${m.full_name}</div>
            <div class="text-muted" style="font-size:.85rem;margin-top:.4rem">كود الحجز</div>
            <div style="font-family:monospace;font-weight:700">${b.reservation_code||'—'}</div>
            ${b.seat_class && b.seat_class!=='regular' ? `<div class="mt-1"><span class="badge badge-blue">${b.seat_class}</span></div>`:''}
            ${b.waitlist_position ? `<div class="mt-1 text-muted">في الانتظار رقم #${b.waitlist_position}</div>`:''}
          </div>
          <div id="qr-${bookingId}" class="ticket-qr"></div>
        </div>
        <div class="ticket-foot text-muted">${b.qr_ticket}</div>
      </div>
      <style>
        .ticket-pass{border:2px dashed var(--border);border-radius:14px;padding:1rem;background:linear-gradient(135deg, var(--bg1), var(--bg2))}
        .ticket-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:.6rem;border-bottom:1px dashed var(--border)}
        .ticket-body{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;padding:.8rem 0}
        .ticket-qr{width:140px;height:140px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px}
        .ticket-foot{text-align:center;font-family:monospace;font-size:.75rem;border-top:1px dashed var(--border);padding-top:.4rem}
      </style>
    `;
  }

  function attachQr(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    const el = document.getElementById('qr-'+bookingId);
    if (!el || !b || !window.QRCode) return;
    el.innerHTML = '';
    new QRCode(el, { text: ticketUrl(b), width:128, height:128, correctLevel: QRCode.CorrectLevel.M });
  }

  function verify(scanPayload){
    try {
      const d = JSON.parse(scanPayload);
      if (d.t !== 'ticket') return { ok:false, reason:'كود غير معروف' };
      const b = DB.find('event_bookings', x => x.qr_ticket === d.tk && x.event_id === d.ev);
      if (!b) return { ok:false, reason:'تذكرة غير موجودة' };
      return { ok:true, booking:b };
    } catch(_) { return { ok:false, reason:'كود تالف' }; }
  }

  window.TicketEngine = { render, attachQr, verify, ticketUrl };
})();
