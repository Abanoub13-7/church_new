/* ============================================================
   DB.js — LocalStorage Adapter with Multi-Tenant Isolation
   كل query تلقائياً مقيد بـ church_id الخاص بالـ session
   جاهز للاستبدال بـ REST API / Supabase / Postgres لاحقاً
   ============================================================ */
(function(){
  const STORAGE_KEY = 'church_db_v1';
  let cache = null;

  function load(){
    if (cache) return cache;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){ cache = JSON.parse(raw); return cache; }
    // seed
    cache = JSON.parse(JSON.stringify(window.MOCK_DATA || {}));
    save();
    return cache;
  }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); }
  function uuid(prefix='id'){ return prefix+'-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }

  function getChurchId(){
    const s = window.Auth && Auth.session();
    return s ? s.church_id : null;
  }
  function isSuperAdmin(){
    const s = window.Auth && Auth.session();
    return s && s.role === 'super_admin';
  }

  /**
   * Apply multi-tenant guard: every query is scoped to current church_id.
   * Super admin BYPASSES tenant scope for churches/users tables only — but
   * we deliberately do NOT expose member-level tables to super admin.
   */
  function scoped(table, rows){
    if (isSuperAdmin()){
      // Super admin sees aggregate only (churches, users meta) — block sensitive tables
      const FORBIDDEN_FOR_SUPER = [
        'members','attendance_records','attendance_sessions','followup_tasks',
        'followup_logs','member_notes','member_risk_scores','financial_transactions'
      ];
      if (FORBIDDEN_FOR_SUPER.includes(table)) return [];
      return rows;
    }
    const cid = getChurchId();
    if (!cid) return [];
    return rows.filter(r => r.church_id === cid || r.church_id === null);
  }

  const DB = {
    // raw access (no scoping) — for super admin
    _raw(table){ return load()[table] || []; },

    all(table){
      const data = load();
      return scoped(table, data[table] || []);
    },
    find(table, predicate){
      return DB.all(table).find(predicate);
    },
    filter(table, predicate){
      return DB.all(table).filter(predicate);
    },
    byId(table, idField, id){
      return DB.find(table, r => r[idField] === id);
    },
    insert(table, row){
      load();
      const pkField = Object.keys((window.SCHEMA?.[table]?.fields)||{}).find(f => window.SCHEMA[table].fields[f].pk) || (table.replace(/s$/,'')+'_id');
      if (!row[pkField]) row[pkField] = uuid(table.slice(0,3));
      if (!row.created_at) row.created_at = new Date().toISOString();
      if (!row.church_id && !isSuperAdmin()) row.church_id = getChurchId();
      cache[table] = cache[table] || [];
      cache[table].push(row);
      save();
      DB._emit('insert', table, row);
      return row;
    },
    update(table, idField, id, patch){
      load();
      const list = cache[table] || [];
      const idx = list.findIndex(r => r[idField]===id);
      if (idx<0) return null;
      // tenant guard
      if (!isSuperAdmin() && list[idx].church_id !== getChurchId()) return null;
      list[idx] = { ...list[idx], ...patch, updated_at:new Date().toISOString() };
      save();
      DB._emit('update', table, list[idx]);
      return list[idx];
    },
    remove(table, idField, id){
      load();
      const list = cache[table] || [];
      const before = list.length;
      cache[table] = list.filter(r => {
        if (r[idField] !== id) return true;
        if (!isSuperAdmin() && r.church_id !== getChurchId()) return true;
        return false;
      });
      save();
      const removed = before !== cache[table].length;
      if (removed) DB._emit('remove', table, { [idField]: id });
      return removed;
    },
    count(table, predicate){
      const rows = DB.all(table);
      return predicate ? rows.filter(predicate).length : rows.length;
    },
    reset(){
      localStorage.removeItem(STORAGE_KEY); cache = null; load();
    },

    // simple pub/sub for reactive UIs
    _subs:[],
    on(fn){ DB._subs.push(fn); },
    _emit(op, table, row){ DB._subs.forEach(fn => { try{ fn(op,table,row); }catch(_){} }); }
  };

  window.DB = DB;
})();
