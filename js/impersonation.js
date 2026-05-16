/* ============================================================
   IMPERSONATION.js — Super Admin "Login As" support
   ------------------------------------------------------------
   Stores a snapshot of the super admin session, swaps the
   active session for a target church admin, and shows a
   persistent banner. Exiting restores the original session.
   ============================================================ */
(function(){
  const SESSION_KEY = 'church_session_v1';
  const SNAPSHOT_KEY = 'impersonator_snapshot_v1';

  const Impersonation = {
    isActive(){ return !!localStorage.getItem(SNAPSHOT_KEY); },

    start(targetChurchId){
      const s = Auth.session();
      if (!s || s.role !== 'super_admin'){
        UI.toast('فقط مدير المنصة يمكنه الدخول بصلاحية كنيسة','error'); return;
      }
      const church = DB._raw('churches').find(c => c.church_id === targetChurchId);
      if (!church){ UI.toast('الكنيسة غير موجودة','error'); return; }
      const admin = DB._raw('users').find(u => u.user_id === church.church_admin_id);
      if (!admin){ UI.toast('لا يوجد مدير كنيسة معرف','error'); return; }

      // snapshot original
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
      sessionStorage.setItem('impersonator_id', s.user_id);

      const newSession = {
        user_id: admin.user_id, full_name: admin.full_name, email: admin.email,
        role: admin.role, church_id: admin.church_id,
        church_name: church.church_name, church_code: church.church_code,
        permissions: admin.permissions || {},
        logged_at: new Date().toISOString(),
        impersonated_by: s.user_id
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));

      Audit.log('impersonation.start', {
        target_church_id: targetChurchId, target_user_id: admin.user_id, severity:'warning'
      });
      location.href = 'dashboard.html';
    },

    stop(){
      const snap = localStorage.getItem(SNAPSHOT_KEY);
      if (!snap){ location.href='login.html'; return; }
      Audit.log('impersonation.stop', { severity:'warning' });
      localStorage.setItem(SESSION_KEY, snap);
      sessionStorage.setItem(SESSION_KEY, snap);
      localStorage.removeItem(SNAPSHOT_KEY);
      sessionStorage.removeItem('impersonator_id');
      location.href = 'super-admin.html';
    },

    renderBanner(){
      if (!Impersonation.isActive()) return;
      if (document.getElementById('impersonation-banner')) return;
      const s = Auth.session();
      const b = document.createElement('div');
      b.id = 'impersonation-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#dc2626;color:#fff;padding:.6rem 1rem;display:flex;justify-content:center;align-items:center;gap:1rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:Cairo,sans-serif';
      b.innerHTML = `
        <i class="fa-solid fa-user-secret"></i>
        وضع الانتحال نشط — أنت تتصفح بصلاحية: <u>${s.full_name}</u> (${s.church_name})
        <button id="imp-exit" style="margin-inline-start:1rem;background:#fff;color:#dc2626;border:none;padding:.35rem .9rem;border-radius:6px;font-weight:700;cursor:pointer">خروج من الانتحال</button>`;
      document.body.appendChild(b);
      document.body.style.paddingTop = '48px';
      document.getElementById('imp-exit').onclick = () => Impersonation.stop();
    }
  };

  window.Impersonation = Impersonation;
  document.addEventListener('DOMContentLoaded', () => Impersonation.renderBanner());
})();
