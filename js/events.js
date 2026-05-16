/* EVENTS — list, create, bookings, waitlist */
(function(){
  if (!App.init('events')) return;

  function render(){
    const events = DB.all('events').sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at));
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الفعاليات</h1>
          <p class="page-subtitle">${events.filter(e=>e.status==='open').length} فعالية مفتوحة</p></div>
        <button class="btn btn-accent" onclick="EventsPage.showForm()"><i class="fa-solid fa-plus"></i> فعالية جديدة</button>
      </div>
      <div class="grid grid-3">
        ${events.length ? events.map(e => {
          const bookings = DB.filter('event_bookings', b => b.event_id===e.event_id);
          const confirmed = bookings.filter(b=>b.booking_status==='confirmed' || b.booking_status==='attended').length;
          const waiting = bookings.filter(b=>b.booking_status==='waiting').length;
          const pct = e.capacity ? Math.min(100, confirmed/e.capacity*100) : 0;
          const isFull = e.capacity && confirmed >= e.capacity;
          return `<div class="card">
            <div class="flex-between mb-2">
              <span class="badge badge-${e.status==='open'?'green':e.status==='full'?'orange':'gray'}">${e.event_type}</span>
              ${isFull?'<span class="badge badge-red">مكتمل</span>':''}
            </div>
            <h3>${e.title}</h3>
            <div class="text-muted mt-1"><i class="fa-solid fa-calendar"></i> ${UI.fmt.dateTime(e.starts_at)}</div>
            <div class="text-muted"><i class="fa-solid fa-location-dot"></i> ${e.location||'—'}</div>
            <div class="mt-2">
              <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.3rem"><span>${confirmed}/${e.capacity||'∞'} مؤكد</span>${waiting?`<span class="text-muted">${waiting} في الانتظار</span>`:''}</div>
              <div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--green),var(--accent))"></div></div>
            </div>
            <div class="mt-2 flex">
              <button class="btn btn-accent btn-sm" onclick="EventsPage.book('${e.event_id}')"><i class="fa-solid fa-ticket"></i> حجز</button>
              <button class="btn btn-ghost btn-sm" onclick="EventsPage.view('${e.event_id}')"><i class="fa-solid fa-list"></i> الحجوزات (${bookings.length})</button>
            </div>
          </div>`;
        }).join('') : '<div class="empty"><i class="fa-solid fa-calendar-xmark"></i>لا توجد فعاليات</div>'}
      </div>
    `);
  }

  window.EventsPage = {
    showForm(){
      UI.modal(`
        <div class="modal-header"><h3>فعالية جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="ev-form">
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title" required></div>
          <div class="form-group"><label class="form-label">الوصف</label><textarea class="form-control" name="description"></textarea></div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">النوع</label>
              <select class="form-select" name="event_type"><option value="conference">مؤتمر</option><option value="trip">رحلة</option><option value="retreat">خلوة</option><option value="celebration">احتفال</option></select></div>
            <div class="form-group"><label class="form-label">السعة</label><input class="form-control" type="number" name="capacity" value="50"></div>
          </div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">يبدأ</label><input class="form-control" type="datetime-local" name="starts_at" required></div>
            <div class="form-group"><label class="form-label">السعر</label><input class="form-control" type="number" name="price" value="0"></div>
          </div>
          <div class="form-group"><label class="form-label">المكان</label><input class="form-control" name="location"></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="EventsPage.save()"><i class="fa-solid fa-save"></i> حفظ</button></div>`);
    },
    save(){
      const fd = new FormData(document.getElementById('ev-form'));
      const data = Object.fromEntries(fd.entries());
      data.starts_at = new Date(data.starts_at).toISOString();
      data.capacity = +data.capacity; data.price = +data.price;
      data.status = 'open';
      DB.insert('events', data);
      UI.toast('تم إنشاء الفعالية','success'); UI.closeModal(); render();
    },
    book(eid){
      const e = DB.byId('events','event_id',eid);
      const members = DB.all('members');
      UI.modal(`
        <div class="modal-header"><h3>حجز: ${e.title}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">اختر المخدوم</label>
            <select class="form-select" id="book-member"><option value="">—</option>${members.map(m=>`<option value="${m.member_id}">${m.full_name}</option>`).join('')}</select></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="EventsPage.doBook('${eid}')"><i class="fa-solid fa-ticket"></i> تأكيد</button></div>`);
    },
    doBook(eid){
      const mid = document.getElementById('book-member').value;
      if (!mid) return UI.toast('اختر مخدوم','error');
      const e = DB.byId('events','event_id',eid);
      const confirmed = DB.count('event_bookings', b => b.event_id===eid && ['confirmed','attended'].includes(b.booking_status));
      const status = (e.capacity && confirmed >= e.capacity) ? 'waiting' : 'confirmed';
      DB.insert('event_bookings', { event_id:eid, member_id:mid, booking_status:status, payment_status:'unpaid', qr_ticket:'TKT-'+Date.now() });
      if (status === 'waiting'){
        UI.toast('الفعالية مكتملة — تم وضعك في قائمة الانتظار','warning');
        DB.update('events','event_id',eid,{ status:'full' });
      } else UI.toast('تم الحجز بنجاح','success');
      UI.closeModal(); render();
    },
    view(eid){
      const bookings = DB.filter('event_bookings', b => b.event_id===eid);
      UI.modal(`
        <div class="modal-header"><h3>الحجوزات</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <table class="table"><thead><tr><th>الاسم</th><th>الحالة</th><th>الدفع</th><th>التذكرة</th></tr></thead>
          <tbody>${bookings.map(b => {
            const m = DB.byId('members','member_id',b.member_id);
            return `<tr><td>${m?.full_name||'—'}</td>
              <td><span class="badge badge-${b.booking_status==='waiting'?'orange':b.booking_status==='attended'?'green':b.booking_status==='no_show'?'red':'blue'}">${b.booking_status}</span></td>
              <td>${b.payment_status}</td><td><code>${b.qr_ticket}</code></td></tr>`;
          }).join('') || '<tr><td colspan="4"><div class="empty">لا توجد حجوزات</div></td></tr>'}</tbody></table>
        </div>`);
    }
  };
  render();
})();
