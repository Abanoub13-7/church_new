/* SETTINGS */
(function(){
  if (!App.init('settings', ['church_admin'])) return;
  const s = Auth.session();
  const settings = DB.find('church_settings', x => x.church_id === s.church_id) || { church_id:s.church_id };
  const church = DB._raw('churches').find(c=>c.church_id===s.church_id);

  App.render(`
    <div class="page-header"><div><h1 class="page-title">الإعدادات</h1><p class="page-subtitle">${church?.church_name}</p></div></div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title">معلومات الكنيسة</div></div>
        <div class="form-group"><label class="form-label">اسم الكنيسة</label><input class="form-control" id="ch-name" value="${church?.church_name||''}"></div>
        <div class="form-group"><label class="form-label">كود الكنيسة</label><input class="form-control" id="ch-code" value="${church?.church_code||''}" disabled></div>
        <div class="form-group"><label class="form-label">خطة الاشتراك</label>
          <select class="form-select" disabled><option>${church?.subscription_plan||'free'}</option></select></div>
        <button class="btn btn-accent" onclick="SettingsPage.saveChurch()"><i class="fa-solid fa-save"></i> حفظ</button>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">إعدادات النظام</div></div>
        <div class="form-group"><label class="form-label">حد الغياب لتفعيل الافتقاد</label><input class="form-control" type="number" id="abs" value="${settings.absence_threshold||3}"></div>
        <div class="form-group"><label class="form-label">المنطقة الزمنية</label><input class="form-control" id="tz" value="${settings.timezone||'Africa/Cairo'}"></div>
        <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem"><input type="checkbox" id="ai-on" ${settings.ai_enabled!==false?'checked':''}> تفعيل محرك AI</label>
        <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem"><input type="checkbox" id="wa-on" ${settings.whatsapp_enabled?'checked':''}> تفعيل تكامل WhatsApp</label>
        <button class="btn btn-accent" onclick="SettingsPage.saveSettings()"><i class="fa-solid fa-save"></i> حفظ</button>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">إعادة تعيين البيانات التجريبية</div></div>
        <p class="text-muted mb-2">سيؤدي هذا إلى مسح جميع البيانات الحالية وإعادة تحميل البيانات الافتراضية.</p>
        <button class="btn btn-danger" onclick="if(confirm('متأكد؟')){DB.reset();UI.toast('تمت إعادة التعيين','success');setTimeout(()=>location.href='login.html',800)}">
          <i class="fa-solid fa-trash"></i> إعادة تعيين
        </button>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">عن المنصة</div></div>
        <p><b>Church Mega Platform v4.0</b></p>
        <p class="text-muted">معمارية SaaS متعددة المستأجرين — Multi-Tenant Architecture</p>
        <ul style="margin-top:1rem;padding-inline-start:1.5rem;color:var(--text2)">
          <li>AI Behavior Analysis Engine</li>
          <li>Workflow Automation Engine</li>
          <li>Smart Attendance (QR/Manual/Group)</li>
          <li>RBAC + Multi-Tenant Isolation</li>
        </ul>
      </div>
    </div>
  `);

  window.SettingsPage = {
    saveChurch(){
      const all = JSON.parse(localStorage.getItem('church_db_v1'));
      const idx = all.churches.findIndex(c=>c.church_id===s.church_id);
      if (idx>=0){ all.churches[idx].church_name = document.getElementById('ch-name').value; localStorage.setItem('church_db_v1', JSON.stringify(all)); }
      UI.toast('تم الحفظ','success');
    },
    saveSettings(){
      const data = {
        absence_threshold: +document.getElementById('abs').value,
        timezone: document.getElementById('tz').value,
        ai_enabled: document.getElementById('ai-on').checked,
        whatsapp_enabled: document.getElementById('wa-on').checked
      };
      const existing = DB.find('church_settings', x => x.church_id === s.church_id);
      if (existing) DB.update('church_settings','church_id',s.church_id,data);
      else DB.insert('church_settings', { church_id:s.church_id, ...data });
      UI.toast('تم الحفظ','success');
    }
  };
})();
