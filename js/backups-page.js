/* ============================================================
   BACKUPS.PAGE.js — Backup & Restore center
   ============================================================ */
(function(){
  if (!App.init('backups', ['super_admin'])) return;
  Backup.schedule();
  function render(){
    const list = Backup.list();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">النسخ الاحتياطي والاستعادة</h1>
        <p class="page-subtitle">نسخ كاملة، نسخ لكل كنيسة، نسخ لكل وحدة، مع استعادة آمنة</p></div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary" id="full"><i class="fa-solid fa-database"></i> نسخة كاملة</button>
          <button class="btn btn-ghost" id="tenant"><i class="fa-solid fa-church"></i> نسخة كنيسة</button>
          <button class="btn btn-ghost" id="module"><i class="fa-solid fa-cube"></i> نسخة وحدة</button>
        </div>
      </div>

      <div class="card mb-3" style="background:rgba(239,68,68,.08);border-color:var(--red)">
        <b style="color:var(--red)">⚠️ تحذيرات الأمان:</b> الاستعادة تستبدل بيانات حالية. سيتم إنشاء نسخة احتياطية تلقائية قبل أي عملية استعادة لحماية البيانات.
      </div>

      <div class="card"><div class="card-header"><h3>النسخ المتوفرة (${list.length})</h3></div>
        <table class="table">
          <thead><tr><th>الوصف</th><th>النوع</th><th>النطاق</th><th>الحجم</th><th>التاريخ</th><th>المُنشئ</th><th>إجراءات</th></tr></thead>
          <tbody>${list.map(b=>`<tr>
            <td><b>${b.label}</b></td>
            <td><span class="badge blue">${b.type}</span></td>
            <td>${b.type==='tenant'?(DB._raw('churches').find(c=>c.church_id===b.church_id)?.church_name||'-'):b.type==='module'?b.module_key:'-'}</td>
            <td>${b.size_kb} KB</td>
            <td>${UI.fmt.dateTime(b.created_at)}</td>
            <td>${b.created_by_name||'-'}</td>
            <td style="display:flex;gap:.3rem">
              <button class="btn btn-sm btn-ghost" data-pre="${b.backup_id}"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-sm btn-success" data-rest="${b.backup_id}"><i class="fa-solid fa-rotate-left"></i> استعادة</button>
              <button class="btn btn-sm btn-ghost" data-dl="${b.backup_id}"><i class="fa-solid fa-download"></i></button>
              <button class="btn btn-sm btn-red" data-del="${b.backup_id}"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7" class="muted">لا توجد نسخ بعد</td></tr>'}</tbody>
        </table>
      </div>
    `);
    document.getElementById('full').onclick = ()=>{ const l=prompt('وصف النسخة:','Full snapshot'); if(l===null)return; Backup.create({label:l, type:'full'}); UI.toast('تم إنشاء النسخة','success'); render(); };
    document.getElementById('tenant').onclick = ()=>{
      const ch = DB._raw('churches');
      const opts = ch.map((c,i)=>`${i+1}. ${c.church_name}`).join('\n');
      const idx = +prompt('اختر رقم الكنيسة:\n'+opts); if(!idx) return;
      const c = ch[idx-1]; if(!c) return;
      Backup.create({ label:`Tenant: ${c.church_name}`, type:'tenant', church_id:c.church_id });
      UI.toast('تم','success'); render();
    };
    document.getElementById('module').onclick = ()=>{
      const mods = Backup.moduleKeys();
      const idx = +prompt('اختر وحدة:\n'+mods.map((m,i)=>`${i+1}. ${m}`).join('\n')); if(!idx) return;
      const k = mods[idx-1]; if(!k) return;
      Backup.create({ label:`Module: ${k}`, type:'module', module_key:k });
      UI.toast('تم','success'); render();
    };
    document.querySelectorAll('[data-pre]').forEach(b => b.onclick = ()=> preview(b.dataset.pre));
    document.querySelectorAll('[data-rest]').forEach(b => b.onclick = ()=> restoreModal(b.dataset.rest));
    document.querySelectorAll('[data-dl]').forEach(b => b.onclick = ()=> Backup.download(b.dataset.dl));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = ()=>{ if(confirm('حذف النسخة؟')){ Backup.remove(b.dataset.del); render(); } });
  }
  function preview(id){
    const p = Backup.preview(id);
    UI.modal(`<h3>معاينة: ${p.rec.label}</h3>
      <table class="table"><thead><tr><th>الجدول</th><th>عدد السجلات</th></tr></thead>
      <tbody>${Object.entries(p.counts).map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  function restoreModal(id){
    const p = Backup.preview(id);
    UI.modal(`<h3 style="color:var(--red)">⚠️ تأكيد الاستعادة</h3>
      <p>أنت على وشك استعادة <b>${p.rec.label}</b>. سيتم إنشاء نسخة احتياطية تلقائية أولاً.</p>
      <p>اكتب <b>RESTORE</b> للتأكيد:</p><input id="cnf" class="input">
      <label>الوضع</label>
      <select id="mode" class="input"><option value="replace">استبدال كامل</option><option value="merge">دمج</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-red" id="ok">تأكيد الاستعادة</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      if (document.getElementById('cnf').value!=='RESTORE'){ UI.toast('يجب كتابة RESTORE','warning'); return; }
      Backup.restore(id, document.getElementById('mode').value);
      UI.toast('تمت الاستعادة، سيتم إعادة التحميل','success');
      setTimeout(()=>location.reload(), 800);
    };
  }
  render();
})();
