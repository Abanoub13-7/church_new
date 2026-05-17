/* ============================================================
   WHITE-LABEL.PAGE.js — Branding management
   ============================================================ */
(function(){
  if (!App.init('white-label', ['super_admin','church_admin'])) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';

  function render(selectedCid){
    const churches = DB._raw('churches');
    const cid = selectedCid || (isSuper ? churches[0]?.church_id : session.church_id);
    const b = WhiteLabel.get(cid);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">العلامة التجارية (White-Label)</h1>
        <p class="page-subtitle">تخصيص العلامة، الألوان، الشعار، والنطاق الفرعي لكل كنيسة</p>
      </div></div>
      ${isSuper?`<div class="card mb-3"><label>اختر الكنيسة</label>
        <select id="ch" class="input">${churches.map(c=>`<option value="${c.church_id}" ${c.church_id===cid?'selected':''}>${c.church_name}</option>`).join('')}</select>
      </div>`:''}
      <div class="grid grid-2">
        <div class="card">
          <h3>إعدادات العلامة</h3>
          <label>اسم الترويسة</label><input id="b-header" class="input" value="${b.header_text||''}">
          <label>رسالة الترحيب</label><input id="b-welcome" class="input" value="${b.welcome_message||''}">
          <label>رابط الشعار</label><input id="b-logo" class="input" value="${b.logo_url||''}">
          <label>رابط خلفية الدخول</label><input id="b-login" class="input" value="${b.login_bg||''}">
          <label>اللون الرئيسي</label><input id="b-primary" type="color" class="input" value="${b.primary_color}">
          <label>لون التمييز</label><input id="b-accent" type="color" class="input" value="${b.accent_color}">
          <label>النطاق الفرعي</label>
          <div style="display:flex;gap:.3rem;align-items:center">
            <input id="b-sub" class="input" value="${b.subdomain||''}" placeholder="church1">
            <span class="muted">.platform.com</span>
          </div>
          <div style="margin-top:1rem;display:flex;gap:.5rem">
            <button class="btn btn-ghost" id="save-draft">حفظ مسودة</button>
            <button class="btn btn-primary" id="publish">نشر</button>
          </div>
          <p class="muted" style="margin-top:.5rem">حالة: ${b.published?'<span class="badge green">منشورة</span>':'<span class="badge orange">مسودة</span>'}</p>
        </div>
        <div class="card">
          <h3>المعاينة</h3>
          <div id="preview" style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
            <div id="prev-header" style="background:${b.primary_color};color:#fff;padding:1rem;display:flex;align-items:center;gap:.5rem">
              ${b.logo_url?`<img src="${b.logo_url}" style="height:40px">`:'<i class="fa-solid fa-church" style="font-size:1.5rem"></i>'}
              <div><div id="prev-title" style="font-weight:700">${b.header_text||'منصة الكنيسة'}</div>
              <div id="prev-welcome" style="font-size:.85rem;opacity:.9">${b.welcome_message||''}</div></div>
            </div>
            <div style="padding:1rem">
              <button style="background:${b.accent_color};color:#fff;border:none;padding:.5rem 1rem;border-radius:8px">زر بلون التمييز</button>
              <p class="muted" style="margin-top:.5rem">${b.subdomain?`URL: ${WhiteLabel.subdomainURL(b)}`:'لم يتم تعيين نطاق فرعي'}</p>
            </div>
          </div>
        </div>
      </div>
    `);
    if (isSuper) document.getElementById('ch').onchange = e => render(e.target.value);
    function collect(){
      return {
        header_text: document.getElementById('b-header').value,
        welcome_message: document.getElementById('b-welcome').value,
        logo_url: document.getElementById('b-logo').value,
        login_bg: document.getElementById('b-login').value,
        primary_color: document.getElementById('b-primary').value,
        accent_color: document.getElementById('b-accent').value,
        subdomain: document.getElementById('b-sub').value
      };
    }
    ['b-header','b-welcome','b-logo','b-primary','b-accent','b-sub'].forEach(id => {
      document.getElementById(id).oninput = ()=> render(cid); // live re-render keeps simple
    });
    document.getElementById('save-draft').onclick = ()=>{ WhiteLabel.save(cid, collect(), false); UI.toast('تم الحفظ','success'); };
    document.getElementById('publish').onclick = ()=>{ WhiteLabel.save(cid, collect(), true); UI.toast('تم النشر','success'); render(cid); };
  }
  render();
})();
