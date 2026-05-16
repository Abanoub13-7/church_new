/* ============================================================
   PERMISSIONS.js — Role-Based Access Control
   ============================================================ */
(function(){
  // role => set of permission strings
  const ROLE_MATRIX = {
    super_admin: ['platform.*'], // platform only — no member data
    church_admin: ['*'],          // everything in their tenant
    service_admin: [
      'members.view','members.edit','attendance.*','followup.*','events.*','workflows.view','ai.view','notifications.*'
    ],
    supervisor: [
      'members.view','attendance.view','attendance.record','followup.view','followup.update','ai.view'
    ],
    servant: [
      'members.view','attendance.record','followup.view','followup.update','events.view'
    ],
    finance: ['finance.*','members.view','events.view'],
    viewer: ['members.view','attendance.view','events.view']
  };

  function expand(perms){
    const out = new Set();
    perms.forEach(p => out.add(p));
    return out;
  }

  const Permissions = {
    can(action){
      const s = Auth.session(); if (!s) return false;
      const perms = expand(ROLE_MATRIX[s.role] || []);
      // overrides
      const overrides = s.permissions || {};
      if (overrides[action] === false) return false;
      if (overrides[action] === true) return true;
      // wildcard match
      if (perms.has('*')) return true;
      if (perms.has(action)) return true;
      const ns = action.split('.')[0];
      if (perms.has(ns+'.*')) return true;
      return false;
    },
    guard(action){
      if (!Permissions.can(action)){
        UI.toast('ليس لديك صلاحية لهذا الإجراء','error');
        return false;
      }
      return true;
    }
  };
  window.Permissions = Permissions;
})();
