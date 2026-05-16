/* MEMBERS — list, create, edit, QR, profile */
(function(){
  if (!App.init('members')) return;

  let filter = { q:'', stage:'', class:'', status:'' };
  const classes = DB.all('service_classes');

  function render(){
    const members = DB.all('members').filter(m => {
      if (filter.q && !m.full_name.includes(filter.q) && !(m.phone||'').includes(filter.q)) return false;
      if (filter.stage && m.age_stage !== filter.stage) return false;
      if (filter.class && m.service_class_id !== filter.class) return false;
      if (filter.status && m.member_status !== filter.status) return false;
      return true;
    });

    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">المخدومين</h1>
          <p class="page-subtitle">${DB.count('members')} مخدوم — ${DB.count('members',m=>m.member_status==='at_risk')} في خطر</p></div>
        <button class="btn btn-accent" onclick="MembersPage.showForm()"><i class="fa-solid fa-plus"></i> مخدوم جديد</button>
      </div>

      <div class="card mb-2">
        <div class="grid grid-4">
          <input class="form-control" placeholder="بحث بالاسم أو الهاتف..." value="${filter.q}" oninput="MembersPage.setFilter('q', this.value)">
          <select class="form-select" onchange="MembersPage.setFilter('stage', this.value)">
            <option value="">كل المراحل</option>
            ${['nursery','kg','primary','preparatory','secondary','university','youth','adult','senior'].map(s=>`<option value="${s}" ${filter.stage===s?'selected':''}>${stageLabel(s)}</option>`).join('')}
          </select>
          <select class="form-select" onchange="MembersPage.setFilter('class', this.value)">
            <option value="">كل الفصول</option>
            ${classes.map(c=>`<option value="${c.class_id}" ${filter.class===c.class_id?'selected':''}>${c.class_name}</option>`).join('')}
          </select>
          <select class="form-select" onchange="MembersPage.setFilter('status', this.value)">
            <option value="">كل الحالات</option>
            ${['active','inactive','new','at_risk','left'].map(s=>`<option value="${s}" ${filter.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>الاسم</th><th>المرحلة</th><th>الفصل</th><th>الهاتف</th><th>الحالة</th><th>الخطر</th><th></th></tr></thead>
          <tbody>${members.length ? members.map(rowHtml).join('') : '<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-users-slash"></i>لا يوجد مخدومين بهذه الفلاتر</div></td></tr>'}</tbody>
        </table>
      </div>
    `);
  }

  function rowHtml(m){
    const cls = classes.find(c=>c.class_id===m.service_class_id);
    const risk = DB.find('member_risk_scores', s => s.member_id===m.member_id);
    return `<tr>
      <td><b>${m.full_name}</b></td>
      <td>${stageLabel(m.age_stage)}</td>
      <td>${cls?.class_name||'—'}</td>
      <td dir="ltr">${m.phone||m.parent_phone||'—'}</td>
      <td><span class="badge badge-${statusBadge(m.member_status)}">${statusLabel(m.member_status)}</span></td>
      <td>${risk ? `<span class="badge risk-${risk.risk_level}">${risk.risk_level} (${risk.score})</span>` : '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="MembersPage.profile('${m.member_id}')"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="MembersPage.qr('${m.member_id}')"><i class="fa-solid fa-qrcode"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="WhatsApp.sendTemplate(DB.byId('members','member_id','${m.member_id}'),'default')"><i class="fa-brands fa-whatsapp" style="color:#25d366"></i></button>
      </td>
    </tr>`;
  }

  function stageLabel(s){ return ({nursery:'حضانة',kg:'KG',primary:'ابتدائي',preparatory:'إعدادي',secondary:'ثانوي',university:'جامعة',youth:'شباب',adult:'كبار',senior:'مسنين'})[s]||s||'—'; }
  function statusLabel(s){ return ({active:'نشط',inactive:'غير نشط',new:'جديد',at_risk:'في خطر',left:'غادر'})[s]||s; }
  function statusBadge(s){ return ({active:'green',inactive:'gray',new:'blue',at_risk:'red',left:'gray'})[s]||'gray'; }

  window.MembersPage = {
    setFilter(k,v){ filter[k]=v; render(); },
    showForm(member){
      const m = member || {};
      UI.modal(`
        <div class="modal-header"><h3>${m.member_id?'تعديل':'مخدوم جديد'}</h3>
          <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <form id="member-form">
            <div class="form-group"><label class="form-label">الاسم الكامل</label><input class="form-control" name="full_name" value="${m.full_name||''}" required></div>
            <div class="grid grid-2">
              <div class="form-group"><label class="form-label">النوع</label>
                <select class="form-select" name="gender"><option value="male" ${m.gender==='male'?'selected':''}>ذكر</option><option value="female" ${m.gender==='female'?'selected':''}>أنثى</option></select></div>
              <div class="form-group"><label class="form-label">المرحلة</label>
                <select class="form-select" name="age_stage">${['nursery','kg','primary','preparatory','secondary','university','youth','adult','senior'].map(s=>`<option value="${s}" ${m.age_stage===s?'selected':''}>${stageLabel(s)}</option>`).join('')}</select></div>
            </div>
            <div class="grid grid-2">
              <div class="form-group"><label class="form-label">الهاتف</label><input class="form-control" name="phone" value="${m.phone||''}"></div>
              <div class="form-group"><label class="form-label">هاتف ولي الأمر</label><input class="form-control" name="parent_phone" value="${m.parent_phone||''}"></div>
            </div>
            <div class="form-group"><label class="form-label">الفصل</label>
              <select class="form-select" name="service_class_id"><option value="">—</option>${classes.map(c=>`<option value="${c.class_id}" ${m.service_class_id===c.class_id?'selected':''}>${c.class_name}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="address" value="${m.address||''}"></div>
            <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" name="notes">${m.notes||''}</textarea></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="MembersPage.save('${m.member_id||''}')"><i class="fa-solid fa-save"></i> حفظ</button>
        </div>
      `);
    },
    save(id){
      const fd = new FormData(document.getElementById('member-form'));
      const data = Object.fromEntries(fd.entries());
      if (!data.full_name) return UI.toast('الاسم مطلوب','error');
      if (id){ DB.update('members','member_id',id,data); UI.toast('تم التحديث','success'); }
      else { data.member_status='new'; data.qr_code='QR-'+Date.now(); DB.insert('members',data); UI.toast('تمت الإضافة','success'); }
      UI.closeModal(); render();
    },
    profile(id){
      const m = DB.byId('members','member_id',id);
      const stats = Attendance.memberStats(id,90);
      const risk = DB.find('member_risk_scores', s => s.member_id===id);
      const tasks = DB.filter('followup_tasks', t => t.member_id===id);
      UI.modal(`
        <div class="modal-header"><h3>${m.full_name}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="grid grid-3 mb-2">
            <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-percent"></i></div><div><div class="stat-value">${stats.rate}%</div><div class="stat-label">نسبة الالتزام</div></div></div>
            <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${stats.attended}</div><div class="stat-label">حضور (90 يوم)</div></div></div>
            <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${risk?.score||0}</div><div class="stat-label">درجة الخطر</div></div></div>
          </div>
          ${risk ? `<div class="card mb-2"><b>تحليل AI:</b> ${risk.recommendation||'لا توصيات حالياً'}</div>`:''}
          <h4 class="mb-1">معلومات</h4>
          <table class="table">
            <tr><td><b>الهاتف</b></td><td dir="ltr">${m.phone||'—'}</td></tr>
            <tr><td><b>ولي الأمر</b></td><td dir="ltr">${m.parent_phone||'—'}</td></tr>
            <tr><td><b>المرحلة</b></td><td>${stageLabel(m.age_stage)}</td></tr>
            <tr><td><b>الحالة</b></td><td><span class="badge badge-${statusBadge(m.member_status)}">${statusLabel(m.member_status)}</span></td></tr>
            <tr><td><b>عدد المهام</b></td><td>${tasks.length}</td></tr>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="MembersPage.showForm(DB.byId('members','member_id','${id}'))"><i class="fa-solid fa-edit"></i> تعديل</button>
          <button class="btn btn-accent" onclick="MembersPage.qr('${id}')"><i class="fa-solid fa-qrcode"></i> QR</button>
        </div>
      `);
    },
    qr(id){
      const m = DB.byId('members','member_id',id);
      UI.modal(`<div class="modal-header"><h3>QR — ${m.full_name}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body" style="text-align:center"><div id="qr-box" style="display:inline-block;padding:1rem;background:#fff;border-radius:12px"></div><p class="mt-2">كود: <b>${m.qr_code}</b></p></div>`);
      setTimeout(()=> QR.generate(m.qr_code, document.getElementById('qr-box'), 200), 50);
    }
  };
  render();
})();
