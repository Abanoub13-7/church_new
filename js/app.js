/* ============================================================
   APP.js — Bootstrap, UI helpers, Theme, Layout
   ============================================================ */
(function(){
  // Theme
  const Theme = {
    get(){ return localStorage.getItem('theme') || 'light'; },
    set(t){ document.documentElement.dataset.theme = t; localStorage.setItem('theme',t); },
    toggle(){ Theme.set(Theme.get()==='dark' ? 'light' : 'dark'); }
  };
  Theme.set(Theme.get());

  // UI helpers
  const UI = {
    toast(msg, type='info'){
      let c = document.querySelector('.toast-container');
      if (!c){ c=document.createElement('div'); c.className='toast-container'; document.body.appendChild(c); }
      const t = document.createElement('div'); t.className='toast '+type;
      t.innerHTML = `<div>${msg}</div>`;
      c.appendChild(t);
      setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
    },
    modal(content){
      let b = document.querySelector('.modal-backdrop');
      if (!b){ b=document.createElement('div'); b.className='modal-backdrop'; document.body.appendChild(b); }
      b.innerHTML = `<div class="modal">${content}</div>`;
      b.classList.add('open');
      b.onclick = e => { if (e.target===b) UI.closeModal(); };
      return b;
    },
    closeModal(){ document.querySelector('.modal-backdrop')?.classList.remove('open'); },
    confirm(msg){ return window.confirm(msg); },
    fmt: {
      date(iso){ if (!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); },
      dateTime(iso){ if (!iso) return '—'; return new Date(iso).toLocaleString('ar-EG'); },
      relative(iso){
        if (!iso) return '—';
        const diff = Date.now() - new Date(iso).getTime();
        const d = Math.floor(diff/864e5);
        if (d<1) return 'اليوم';
        if (d===1) return 'أمس';
        if (d<7) return `منذ ${d} أيام`;
        if (d<30) return `منذ ${Math.floor(d/7)} أسابيع`;
        if (d<365) return `منذ ${Math.floor(d/30)} شهر`;
        return `منذ ${Math.floor(d/365)} سنة`;
      },
      money(n){ return new Intl.NumberFormat('ar-EG').format(n||0) + ' ج.م'; }
    }
  };
  window.UI = UI;
  window.Theme = Theme;

  /* === LAYOUT (sidebar + topbar) === */
  function renderLayout(activePage){
    const session = Auth.session();
    if (!session) return;
    const isSuper = session.role === 'super_admin';

    const NAV = isSuper ? [
      { id:'super-admin', label:'لوحة المنصة', icon:'fa-globe', href:'super-admin.html' }
    ] : [
      { section:'الرئيسية' },
      { id:'dashboard', label:'لوحة التحكم', icon:'fa-gauge-high', href:'dashboard.html' },
      { section:'الإدارة' },
      { id:'members',    label:'المخدومين',    icon:'fa-users',         href:'members.html' },
      { id:'users',      label:'المستخدمين',  icon:'fa-user-shield',   href:'users.html', roles:['church_admin','service_admin'] },
      { id:'attendance', label:'الحضور',       icon:'fa-clipboard-check', href:'attendance.html' },
      { id:'events',     label:'الفعاليات',   icon:'fa-calendar-days', href:'events.html' },
      { id:'followup',   label:'الافتقاد',    icon:'fa-hand-holding-heart', href:'followup.html' },
      { section:'الذكاء والأتمتة' },
      { id:'ai-insights',label:'تحليلات AI',  icon:'fa-brain',         href:'ai-insights.html' },
      { id:'workflows',  label:'Workflows',    icon:'fa-diagram-project', href:'workflows.html' },
      { id:'notifications', label:'الإشعارات', icon:'fa-bell',         href:'notifications.html' },
      { section:'النظام' },
      { id:'finance',    label:'الماليات',    icon:'fa-coins',         href:'finance.html', roles:['church_admin','finance'] },
      { id:'settings',   label:'الإعدادات',   icon:'fa-cog',           href:'settings.html', roles:['church_admin'] }
    ];

    const navHtml = NAV.map(item => {
      if (item.section) return `<div class="nav-title">${item.section}</div>`;
      if (item.roles && !item.roles.includes(session.role)) return '';
      const active = item.id === activePage ? 'active' : '';
      return `<a class="nav-link ${active}" href="${item.href}"><i class="fa-solid ${item.icon}"></i> <span>${item.label}</span></a>`;
    }).join('');

    const unread = DB.count('notifications', n => n.user_id===session.user_id && !n.is_read);

    document.body.insertAdjacentHTML('afterbegin', `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="logo">⛪</div>
            <div>
              <div class="title">${session.church_name}</div>
              <div class="sub">${session.church_code || 'Church Platform'}</div>
            </div>
          </div>
          <nav>${navHtml}</nav>
          <div style="margin-top:auto;padding-top:1rem">
            <a class="nav-link" href="#" onclick="Auth.logout();return false"><i class="fa-solid fa-right-from-bracket"></i> <span>تسجيل الخروج</span></a>
          </div>
        </aside>
        <div class="sidebar-overlay" onclick="document.getElementById('sidebar').classList.remove('open');this.classList.remove('show')"></div>
        <div class="main">
          <header class="topbar">
            <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.add('open');document.querySelector('.sidebar-overlay').classList.add('show')">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div class="topbar-search">
              <input placeholder="بحث سريع..." />
              <i class="fa-solid fa-magnifying-glass"></i>
            </div>
            <div class="topbar-actions">
              <button class="icon-btn" onclick="Theme.toggle();location.reload()" title="تبديل الثيم"><i class="fa-solid fa-moon"></i></button>
              <a href="notifications.html" class="icon-btn" title="الإشعارات">
                <i class="fa-solid fa-bell"></i>
                ${unread>0?'<span class="dot"></span>':''}
              </a>
              <div class="user-chip">
                <div class="avatar">${session.full_name.charAt(0)}</div>
                <div>
                  <div class="name">${session.full_name}</div>
                  <div class="role">${roleLabel(session.role)}</div>
                </div>
              </div>
            </div>
          </header>
          <main class="content" id="page-content"></main>
        </div>
      </div>
    `);
  }
  function roleLabel(r){
    return ({
      super_admin:'مدير المنصة', church_admin:'مدير الكنيسة',
      service_admin:'أمين الخدمة', servant:'خادم',
      supervisor:'مشرف', finance:'محاسب', viewer:'عرض فقط'
    })[r] || r;
  }

  /* === PAGE BOOTSTRAP === */
  window.App = {
    init(pageId, requiredRoles){
      if (!Auth.require(requiredRoles)) return false;
      renderLayout(pageId);
      return true;
    },
    content(){ return document.getElementById('page-content'); },
    render(html){ App.content().innerHTML = html; }
  };

  // Run workflow engine + AI on app start (every page load)
  window.addEventListener('DOMContentLoaded', () => {
    if (Auth.session() && window.WorkflowEngine && Auth.session().role !== 'super_admin'){
      try{ WorkflowEngine.runAll(); }catch(_){}
      try{ AIEngine.recomputeAll(); }catch(_){}
    }
  });
})();
