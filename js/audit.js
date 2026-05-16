/* ============================================================
   AUDIT.js — Centralized Audit Logging (Phase 1)
   ------------------------------------------------------------
   Every meaningful action calls Audit.log(action, meta).
   Records: who, when, role, church, action, before/after, ip-ish.
   ============================================================ */
(function(){
  const TABLE = 'audit_logs';

  function ensureTable(){
    if (!window.DB) return;
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    if (!Array.isArray(all[TABLE])){
      all[TABLE] = [];
      localStorage.setItem('church_db_v1', JSON.stringify(all));
    }
  }

  const Audit = {
    log(action, meta){
      try{
        ensureTable();
        const s = window.Auth && Auth.session();
        const row = {
          log_id: 'aud-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4),
          church_id: s?.church_id || null,
          user_id:   s?.user_id   || null,
          user_name: s?.full_name || 'anonymous',
          role:      s?.role      || 'guest',
          action,
          meta:      meta || {},
          severity:  (meta && meta.severity) || 'info',
          created_at: new Date().toISOString(),
          impersonator_id: sessionStorage.getItem('impersonator_id') || null
        };
        const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
        all[TABLE] = all[TABLE] || [];
        all[TABLE].push(row);
        // cap log size to avoid bloating localStorage
        if (all[TABLE].length > 5000) all[TABLE] = all[TABLE].slice(-5000);
        localStorage.setItem('church_db_v1', JSON.stringify(all));
      }catch(e){ /* never throw from audit */ }
    },

    list(filter){
      ensureTable();
      const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
      let rows = all[TABLE] || [];
      const s = window.Auth && Auth.session();
      if (s && s.role !== 'super_admin') rows = rows.filter(r => r.church_id === s.church_id);
      if (filter && filter.action)   rows = rows.filter(r => r.action.includes(filter.action));
      if (filter && filter.user_id)  rows = rows.filter(r => r.user_id === filter.user_id);
      if (filter && filter.severity) rows = rows.filter(r => r.severity === filter.severity);
      return rows.sort((a,b) => b.created_at.localeCompare(a.created_at));
    },

    clear(){ /* super-admin only — debug */
      const s = window.Auth && Auth.session();
      if (!s || s.role !== 'super_admin') return false;
      const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
      all[TABLE] = [];
      localStorage.setItem('church_db_v1', JSON.stringify(all));
      return true;
    }
  };

  ensureTable();
  window.Audit = Audit;
})();
