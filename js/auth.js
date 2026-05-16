/* ============================================================
   AUTH.js — Session management
   ============================================================ */
(function(){
  const SESSION_KEY = 'church_session_v1';

  const Auth = {
    session(){
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    login(email, password, remember){
      const users = DB._raw('users');
      const user = users.find(u => u.email === email && u.password_hash === password && u.is_active);
      if (!user) return { ok:false, error:'بيانات الدخول غير صحيحة' };

      const church = user.church_id ? DB._raw('churches').find(c => c.church_id===user.church_id) : null;
      const session = {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        church_id: user.church_id,
        church_name: church?.church_name || 'منصة الإدارة',
        church_code: church?.church_code,
        permissions: user.permissions || {},
        logged_at: new Date().toISOString()
      };
      const store = remember ? localStorage : sessionStorage;
      store.setItem(SESSION_KEY, JSON.stringify(session));
      // update last_login
      const idx = users.findIndex(u => u.user_id===user.user_id);
      if (idx>=0){ users[idx].last_login = new Date().toISOString(); }
      // persist via raw save trick: re-insert nothing; force save via reset of cache
      try{
        const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
        all.users = users; localStorage.setItem('church_db_v1', JSON.stringify(all));
      }catch(_){}
      return { ok:true, session };
    },
    logout(){
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      location.href = 'login.html';
    },
    require(roles){
      const s = Auth.session();
      if (!s){ location.href='login.html'; return false; }
      if (roles && roles.length && !roles.includes(s.role)){
        alert('ليس لديك صلاحية للوصول لهذه الصفحة');
        location.href = s.role==='super_admin' ? 'super-admin.html' : 'dashboard.html';
        return false;
      }
      return true;
    }
  };
  window.Auth = Auth;
})();
