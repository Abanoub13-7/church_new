/* ============================================================
   SUPPORT.PAGE.js — Ticket center (super admin + tenants)
   ============================================================ */
(function(){
  if (!App.init('support')) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';

  function badge(s){
    const m={ open:['مفتوحة','blue'],pending:['قيد المتابعة','orange'],escalated:['مُصعّدة','red'],resolved:['تم الحل','green'],closed:['مغلقة','gray']};
    const [t,c]=m[s]||[s,'gray']; return `<span class="badge ${c}">${t}</span>`;
  }
  function prio(p){
    const m={low:'منخفضة',normal:'عادية',high:'عالية',urgent:'عاجلة'};
    const c={low:'gray',normal:'blue',high:'orange',urgent:'red'}[p]||'gray';
    return `<span class="badge ${c}">${m[p]||p}</span>`;
  }
  function render(){
    const tickets = Support.list();
    const m = Support.metrics();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">مركز الدعم</h1>
        <p class="page-subtitle">${isSuper?'إدارة جميع التذاكر عبر المنصة':'تقديم ومتابعة تذاكر الدعم'}</p></div>
        <div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> تذكرة جديدة</button>
        <a href="knowledge-base.html" class="btn btn-ghost"><i class="fa-solid fa-book"></i> قاعدة المعرفة</a></div>
      </div>
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-ticket"></i></div><div><div class="stat-value">${m.total}</div><div class="stat-label">إجمالي التذاكر</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-folder-open"></i></div><div><div class="stat-value">${m.open}</div><div class="stat-label">مفتوحة</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div><div class="stat-value">${m.escalated}</div><div class="stat-label">مُصعّدة</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-stopwatch"></i></div><div><div class="stat-value">${m.avgHours}h</div><div class="stat-label">متوسط الحل</div></div></div>
      </div>
      <div class="card"><div class="card-header"><h3>التذاكر</h3></div>
        <table class="table">
          <thead><tr><th>#</th><th>الموضوع</th><th>النوع</th><th>الأولوية</th><th>الحالة</th><th>الكنيسة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>${tickets.map(t=>`<tr>
            <td><b>${t.ticket_number}</b></td><td>${t.subject}</td>
            <td>${t.type}</td><td>${prio(t.priority)}</td><td>${badge(t.status)}</td>
            <td>${(DB._raw('churches').find(c=>c.church_id===t.church_id)||{}).church_name||'-'}</td>
            <td>${UI.fmt.relative(t.created_at)}</td>
            <td><button class="btn btn-sm btn-ghost" data-view="${t.ticket_id}">عرض</button></td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد تذاكر</td></tr>'}</tbody>
        </table></div>
    `);
    document.getElementById('new').onclick = newModal;
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = ()=> viewModal(b.dataset.view));
  }
  function newModal(){
    UI.modal(`<h3>تذكرة جديدة</h3>
      <label>الموضوع</label><input id="s" class="input">
      <label>الوصف</label><textarea id="b" class="input" rows="4"></textarea>
      <label>النوع</label>
      <select id="t" class="input"><option value="support">طلب دعم</option><option value="bug">بلاغ خطأ</option><option value="feature">طلب ميزة</option></select>
      <label>الأولوية</label>
      <select id="p" class="input"><option value="low">منخفضة</option><option value="normal" selected>عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">إرسال</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Support.create({ subject:s.value, body:b.value, type:t.value, priority:p.value });
      UI.toast('تم إنشاء التذكرة','success'); UI.closeModal(); render();
    };
  }
  function viewModal(id){
    const t = Support.get(id);
    const msgs = Support.messages(id);
    UI.modal(`<h3>${t.ticket_number} — ${t.subject}</h3>
      <div>${badge(t.status)} ${prio(t.priority)} <small class="muted">منذ ${UI.fmt.relative(t.created_at)}</small></div>
      <div style="max-height:300px;overflow:auto;margin:1rem 0;border:1px solid var(--border);padding:.5rem;border-radius:8px">
        ${msgs.map(m=>`<div style="margin-bottom:.5rem"><b>${m.author_name}</b> <small class="muted">${UI.fmt.relative(m.created_at)}</small>
        ${m.internal?'<span class="badge orange">داخلية</span>':''}<div>${(m.body||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div></div>`).join('')||'<p class="muted">لا توجد رسائل</p>'}
      </div>
      <label>رد جديد</label><textarea id="reply" class="input" rows="3"></textarea>
      <label><input type="checkbox" id="internal"> ملاحظة داخلية</label>
      <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
        ${isSuper?`
          <button class="btn btn-orange" data-st="escalated">تصعيد</button>
          <button class="btn btn-success" data-st="resolved">حل</button>
          <button class="btn btn-ghost" data-st="closed">إغلاق</button>
          <button class="btn btn-primary" id="assign">تعيين</button>`:''}
        <button class="btn btn-primary" id="send" style="margin-inline-start:auto">إرسال الرد</button>
      </div>`);
    document.getElementById('send').onclick = ()=>{ Support.addMessage(id, document.getElementById('reply').value, document.getElementById('internal').checked); UI.closeModal(); viewModal(id); };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = ()=>{ Support.setStatus(id, b.dataset.st); UI.toast('تم تحديث الحالة','success'); UI.closeModal(); render(); });
    if (isSuper) document.getElementById('assign').onclick = ()=>{
      const team = prompt('الفريق (support|tech|finance):','support'); if(!team)return;
      Support.assign(id, team, null); UI.toast('تم التعيين','success'); UI.closeModal(); viewModal(id);
    };
  }
  render();
})();
