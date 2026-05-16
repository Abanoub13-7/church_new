/* ============================================================
   AUTH.js — Session management (Phase 1 hardened)
   Uses Security module: PBKDF2 hashes, lockout, expiry, idle.
   ============================================================ */
(function(){
  const SESSION_KEY = 'church_session_v1';

  const Auth = {
    session(){
      // delegate to Security for expiry/idle validation
      if (window.Security) return Security.validateSession();
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    },

    async login(email, password, remember){
      const Sec = window.Security;
      if (Sec && Sec.isLocked(email)){
        const l = Sec.getLock(email);
        const mins = Math.ceil((l.locked_until - Date.now())/60000);
        Sec.logEvent('login.attempt_while_locked', { email, severity:'warning' });
        return { ok:false, error:`الحساب مقفل مؤقتاً — حاول بعد ${mins} دقيقة` };
      }

      // anti-burst delay
      if (Sec) await new Promise(r=>setTimeout(r, Sec.config.RETRY_DELAY_MS));

      const users = (window.DB && DB._raw('users')) || [];
      const user = users.find(u => u.email === email && u.is_active);

      let pwOk = false;
      if (user){
        if (Sec) pwOk = await Sec.verifyPassword(password, user.password_hash);
        else pwOk = (user.password_hash === password);
      }

      if (!user || !pwOk){
        if (Sec) Sec.registerFailure(email, user ? 'bad_password' : 'unknown_user');
        try{ window.Audit && Audit.log('auth.login_failed', { email, severity:'warning' }); }catch(_){}
        return { ok:false, error:'بيانات الدخول غير صحيحة' };
      }

      // migrate plaintext → pbkdf2 on first successful login
      if (Sec && typeof user.password_hash === 'string' && !user.password_hash.startsWith('pbkdf2$')){
        try{ await Sec.migrateUserPassword(user, password); }catch(_){}
      }

      // tenant suspension
      const churchRow = user.church_id ? DB._raw('churches').find(c => c.church_id===user.church_id) : null;
      if (churchRow && ['suspended','frozen','deactivated'].includes(churchRow.subscription_status) && user.role !== 'super_admin'){
        Sec && Sec.logEvent('login.blocked_suspended', { email, church_id:user.church_id, severity:'warning' });
        return { ok:false, error:'تم تعليق اشتراك الكنيسة. يُرجى التواصل مع إدارة المنصة.' };
      }

      if (Sec) Sec.resetFailures(email);

      const church = user.church_id ? DB._raw('churches').find(c => c.church_id===user.church_id) : null;
      const now = Date.now();
      const absMs = remember ? (Sec? Sec.config.REMEMBER_MS : 30*864e5)
                             : (Sec? Sec.config.ABS_LIMIT_MS : 8*36e5);
      const idleMs = Sec? Sec.config.IDLE_LIMIT_MS : 30*60*1000;

      const session = {
        user_id: user.user_id, full_name: user.full_name, email: user.email,
        role: user.role, church_id: user.church_id,
        church_name: church?.church_name || 'منصة الإدارة',
        church_code: church?.church_code,
        permissions: user.permissions || {},
        logged_at: new Date().toISOString(),
        remember: !!remember,
        expires_at: now + absMs,
        idle_until: now + idleMs,
        last_activity: new Date().toISOString()
      };
      if (Sec) Sec.writeSession(session, remember);
      else (remember? localStorage:sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));

      // update last_login
      try{
        const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
        const idx = (all.users||[]).findIndex(u => u.user_id===user.user_id);
        if (idx>=0){ all.users[idx].last_login = new Date().toISOString(); localStorage.setItem('church_db_v1', JSON.stringify(all)); }
      }catch(_){}
      Sec && Sec.logEvent('login.success', { email, user_id:user.user_id });
      try{ window.Audit && Audit.log('auth.login_success', { email }); }catch(_){}
      return { ok:true, session };
    },

    logout(){
      try{ window.Audit && Audit.log('auth.logout', {}); }catch(_){}
      window.Security && Security.logEvent('logout', {});
      if (window.Security) Security.clearSession();
      else { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }
      location.href = 'login.html';
    },

    require(roles){
      const s = Auth.session();
      if (!s){ location.href='login.html'; return false; }
      if (roles && roles.length && !roles.includes(s.role)){
        window.Security && Security.logEvent('authz.role_denied', { required:roles, got:s.role, severity:'warning' });
        alert('ليس لديك صلاحية للوصول لهذه الصفحة');
        location.href = s.role==='super_admin' ? 'super-admin.html' : 'dashboard.html';
        return false;
      }
      return true;
    }
  };
  window.Auth = Auth;
})();
