/* ATTENDANCE PAGE — sessions list, create, check-in (manual/QR/group) */
(function(){
  if (!App.init('attendance')) return;
  let currentScanner = null;

  function render(){
    const sessions = DB.all('attendance_sessions').sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at));
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الحضور</h1>
          <p class="page-subtitle">جلسات الحضور — ${sessions.filter(s=>s.status==='open').length} مفتوحة الآن</p></div>
        <button class="btn btn-accent" onclick="AttPage.newSession()"><i class="fa-solid fa-plus"></i> جلسة جديدة</button>
      </div>

      <div class="grid grid-4 mb-3">
        ${Object.entries(Attendance.ACTIVITY_TYPES).slice(0,4).map(([k,t]) => {
          const count = sessions.filter(s=>s.activity_type===k).length;
          return `<div class="stat-card ${t.color||''}"><div class="stat-icon"><i class="fa-solid ${t.icon}"></i></div>
            <div><div class="stat-value">${count}</div><div class="stat-label">${t.label}</div></div></div>`;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">الجلسات</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>النشاط</th><th>العنوان</th><th>الوقت</th><th>الحضور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${sessions.length ? sessions.map(s => {
            const stats = Attendance.sessionStats(s.session_id);
            const t = Attendance.ACTIVITY_TYPES[s.activity_type]||{};
            return `<tr>
              <td><i class="fa-solid ${t.icon}" style="color:var(--${t.color||'accent'})"></i> ${t.label}</td>
              <td><b>${s.title}</b></td>
              <td>${UI.fmt.dateTime(s.starts_at)}</td>
              <td>${stats.total} <small class="text-muted">(${stats.late} متأخر)</small></td>
              <td><span class="badge badge-${s.status==='open'?'green':'gray'}">${s.status==='open'?'مفتوحة':'مغلقة'}</span></td>
              <td>
                ${s.status==='open' ? `<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${s.session_id}')"><i class="fa-solid fa-check"></i> تسجيل</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="AttPage.viewSession('${s.session_id}')"><i class="fa-solid fa-eye"></i></button>
                ${s.status==='open' ? `<button class="btn btn-ghost btn-sm" onclick="AttPage.close('${s.session_id}')"><i class="fa-solid fa-lock"></i></button>` : ''}
              </td></tr>`;
          }).join('') : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-calendar-xmark"></i>لا توجد جلسات</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }

  window.AttPage = {
    newSession(){
      const classes = DB.all('service_classes');
      UI.modal(`
        <div class="modal-header"><h3>جلسة حضور جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="sess-form">
          <div class="form-group"><label class="form-label">نوع النشاط</label>
            <select class="form-select" name="activity_type" required>
              ${Object.entries(Attendance.ACTIVITY_TYPES).map(([k,t])=>`<option value="${k}">${t.label}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title" placeholder="مثلاً: قداس الأحد" required></div>
          <div class="form-group"><label class="form-label">الفصل (اختياري)</label>
            <select class="form-select" name="class_id"><option value="">—</option>${classes.map(c=>`<option value="${c.class_id}">${c.class_name}</option>`).join('')}</select></div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">يبدأ</label><input class="form-control" type="datetime-local" name="starts_at" value="${new Date().toISOString().slice(0,16)}"></div>
            <div class="form-group"><label class="form-label">يُعتبر متأخر بعد (دقيقة)</label><input class="form-control" type="number" name="late_after_min" value="15"></div>
          </div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="AttPage.saveSession()"><i class="fa-solid fa-save"></i> إنشاء وفتح</button>
        </div>`);
    },
    saveSession(){
      const fd = new FormData(document.getElementById('sess-form'));
      const data = Object.fromEntries(fd.entries());
      data.starts_at = new Date(data.starts_at).toISOString();
      data.late_after_min = +data.late_after_min;
      const s = Attendance.createSession(data);
      UI.closeModal();
      if (s) AttPage.openCheckin(s.session_id);
      render();
    },
    openCheckin(sid){
      const session = DB.byId('attendance_sessions','session_id',sid);
      const members = DB.all('members').filter(m => !session.class_id || m.service_class_id === session.class_id);
      const checkedIds = new Set(DB.filter('attendance_records', r => r.session_id===sid).map(r=>r.member_id));
      UI.modal(`
        <div class="modal-header"><h3>تسجيل: ${session.title}</h3><button class="icon-btn" onclick="AttPage.closeScanner();UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="tabs"><div class="tab active" onclick="AttPage.tab(event,'manual')">يدوي</div><div class="tab" onclick="AttPage.tab(event,'qr')">QR Scanner</div><div class="tab" onclick="AttPage.tab(event,'group')">جماعي</div></div>
          <div id="tab-manual">
            <input class="form-control mb-2" placeholder="بحث..." oninput="document.querySelectorAll('#manual-list .row').forEach(r=>r.style.display=r.dataset.name.includes(this.value)?'flex':'none')">
            <div id="manual-list" style="max-height:400px;overflow-y:auto">
              ${members.map(m => `<div class="row" data-name="${m.full_name}" style="display:flex;justify-content:space-between;align-items:center;padding:.6rem;border-bottom:1px solid var(--border)">
                <div>${m.full_name} <small class="text-muted">${m.phone||m.parent_phone||''}</small></div>
                ${checkedIds.has(m.member_id)
                  ? '<span class="badge badge-green"><i class="fa-solid fa-check"></i> حاضر</span>'
                  : `<button class="btn btn-accent btn-sm" onclick="AttPage.check('${sid}','${m.member_id}',this)"><i class="fa-solid fa-plus"></i></button>`}
              </div>`).join('')}
            </div>
          </div>
          <div id="tab-qr" style="display:none;text-align:center">
            <div id="qr-reader" style="width:100%;max-width:300px;margin:0 auto"></div>
            <p class="mt-2" id="qr-status">جاهز للمسح...</p>
          </div>
          <div id="tab-group" style="display:none">
            <p class="mb-2">اختر مجموعة لتسجيل حضورها دفعة واحدة:</p>
            <div style="max-height:300px;overflow-y:auto">
              ${members.filter(m=>!checkedIds.has(m.member_id)).map(m => `<label style="display:flex;gap:.5rem;padding:.4rem;border-bottom:1px solid var(--border)">
                <input type="checkbox" value="${m.member_id}" class="group-chk"> ${m.full_name}
              </label>`).join('')}
            </div>
            <button class="btn btn-accent mt-2" onclick="AttPage.groupSubmit('${sid}')"><i class="fa-solid fa-check-double"></i> تسجيل المحددين</button>
          </div>
        </div>`);
    },
    tab(e, name){
      document.querySelectorAll('.modal .tab').forEach(t=>t.classList.remove('active'));
      e.target.classList.add('active');
      ['manual','qr','group'].forEach(t => document.getElementById('tab-'+t).style.display = t===name ? 'block':'none');
      if (name==='qr' && !currentScanner){
        currentScanner = QR.startScanner('qr-reader', code => {
          const session = document.querySelector('.modal h3').textContent;
          const sid = Array.from(document.querySelectorAll('.modal .btn-accent')).map(b=>b.getAttribute('onclick')).find(s=>s&&s.includes("'"));
          // fetch session id from any check button
          const btn = document.querySelector('[onclick^="AttPage.check"]');
          const realSid = btn ? btn.getAttribute('onclick').match(/'([^']+)'/)[1] : null;
          if (!realSid) return;
          const r = Attendance.checkInByQR(code, realSid);
          document.getElementById('qr-status').textContent = r.ok ? '✅ تم تسجيل الحضور' : '❌ '+r.error;
          if (r.ok) UI.toast('تم تسجيل الحضور','success');
        });
      } else if (name!=='qr'){
        QR.stopScanner(currentScanner); currentScanner=null;
      }
    },
    closeScanner(){ QR.stopScanner(currentScanner); currentScanner=null; },
    check(sid, mid, btn){
      const r = Attendance.checkIn(sid, mid, 'manual');
      if (r.ok){
        btn.outerHTML = `<span class="badge badge-${r.is_late?'orange':'green'}"><i class="fa-solid fa-check"></i> ${r.is_late?'متأخر':'حاضر'}</span>`;
        UI.toast('تم التسجيل','success');
      } else UI.toast(r.error,'error');
    },
    groupSubmit(sid){
      const ids = Array.from(document.querySelectorAll('.group-chk:checked')).map(c=>c.value);
      const r = Attendance.groupCheckIn(sid, ids);
      UI.toast(`تم تسجيل ${r.success} من ${r.total}`,'success');
      UI.closeModal(); render();
    },
    close(sid){
      if (!UI.confirm('إغلاق الجلسة سيُحوّل غير الحاضرين تلقائياً إلى no-show. متابعة؟')) return;
      Attendance.closeSession(sid);
      UI.toast('تم إغلاق الجلسة','success'); render();
    },
    viewSession(sid){
      const session = DB.byId('attendance_sessions','session_id',sid);
      const records = DB.filter('attendance_records', r => r.session_id===sid);
      UI.modal(`
        <div class="modal-header"><h3>${session.title}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <p>${UI.fmt.dateTime(session.starts_at)} — ${records.length} حاضر</p>
          <table class="table mt-2"><thead><tr><th>الاسم</th><th>الوقت</th><th>الطريقة</th><th>متأخر؟</th></tr></thead>
          <tbody>${records.map(r => {
            const m = DB.byId('members','member_id',r.member_id);
            return `<tr><td>${m?.full_name||'—'}</td><td>${UI.fmt.dateTime(r.check_in_at)}</td><td>${r.check_in_method}</td><td>${r.is_late?'<span class="badge badge-orange">متأخر</span>':'<span class="badge badge-green">في الوقت</span>'}</td></tr>`;
          }).join('')}</tbody></table>
        </div>`);
    }
  };
  render();
})();
