/* ============================================================
   BACKUP-ENGINE.js  —  Phase 7
   Snapshots · restore · module backups · tenant backups · audit
   ============================================================ */
(function(){
  const BK_KEY='church_backups_v1';
  function loadAll(){ try{ return JSON.parse(localStorage.getItem(BK_KEY)||'[]'); }catch(_){ return []; } }
  function saveAll(list){ localStorage.setItem(BK_KEY, JSON.stringify(list)); }
  function dbRoot(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3); }
  function now(){ return new Date().toISOString(); }

  function pruneByTenant(snapshot, cid){
    const out = {};
    Object.keys(snapshot).forEach(table => {
      if (!Array.isArray(snapshot[table])){ out[table]=snapshot[table]; return; }
      out[table] = snapshot[table].filter(r=>r.church_id===cid);
    });
    return out;
  }
  function pickModule(snapshot, tables){
    const out = {};
    tables.forEach(t => { out[t]=snapshot[t]||[]; });
    return out;
  }

  const MODULES = {
    finance: ['financial_transactions','treasuries','event_budgets','invoices','invoice_payments'],
    events:  ['events','event_bookings','event_templates'],
    members: ['members','service_classes','servant_assignments'],
    attendance: ['attendance_sessions','attendance_records'],
    workflows: ['workflows','workflow_instances'],
    notifications: ['notifications','platform_notifications'],
    billing: ['subscriptions','subscription_plans','invoices','invoice_payments','subscription_history','billing_notices']
  };

  const Backup = {
    list(){ return loadAll().sort((a,b)=>b.created_at.localeCompare(a.created_at)); },
    listForChurch(cid){ return Backup.list().filter(b=>!b.church_id||b.church_id===cid); },

    create({ label, type, church_id, module_key }){
      const snap = dbRoot();
      let data;
      if (type==='tenant' && church_id) data = pruneByTenant(snap, church_id);
      else if (type==='module' && module_key) data = pickModule(snap, MODULES[module_key]||[]);
      else { type='full'; data = snap; }

      const blob = JSON.stringify(data);
      const rec = {
        backup_id: uid('bkp'),
        label: label || `${type==='full'?'Full':type==='tenant'?'Tenant':'Module'} backup`,
        type, church_id: church_id||null, module_key: module_key||null,
        size_kb: +(blob.length/1024).toFixed(1),
        data_b64: btoa(unescape(encodeURIComponent(blob))),
        created_at: now(),
        created_by: Auth?.session?.()?.user_id,
        created_by_name: Auth?.session?.()?.full_name,
        is_scheduled: false
      };
      const list = loadAll(); list.push(rec);
      // cap at 50 newest
      if (list.length>50) list.sort((a,b)=>b.created_at.localeCompare(a.created_at)).length=50;
      saveAll(list);
      Audit?.log('backup.created',{ backup_id:rec.backup_id, type, label:rec.label });
      return rec;
    },

    preview(id){
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return null;
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const counts = {}; Object.keys(data).forEach(t => counts[t] = Array.isArray(data[t])?data[t].length:1);
      return { rec, counts };
    },

    restore(id, mode){
      // mode: 'replace' | 'merge'
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return false;
      // safety auto-snapshot before restore
      Backup.create({ label:`Auto pre-restore ${rec.label}`, type:'full' });
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const current = dbRoot();
      if (rec.type==='full' && mode==='replace'){
        localStorage.setItem('church_db_v1', JSON.stringify(data));
      } else if (rec.type==='tenant' && rec.church_id){
        // For tenant restores: remove tenant rows then add backup rows
        Object.keys(data).forEach(t => {
          if (!Array.isArray(data[t])) return;
          current[t] = (current[t]||[]).filter(r=>r.church_id!==rec.church_id);
          current[t] = current[t].concat(data[t]);
        });
        localStorage.setItem('church_db_v1', JSON.stringify(current));
      } else {
        // module restore: replace those tables
        Object.keys(data).forEach(t => { current[t] = data[t]; });
        localStorage.setItem('church_db_v1', JSON.stringify(current));
      }
      Audit?.log('backup.restored',{ backup_id:id, mode });
      return true;
    },

    remove(id){
      const list = loadAll().filter(b=>b.backup_id!==id);
      saveAll(list);
      Audit?.log('backup.deleted',{ backup_id:id });
    },

    download(id){
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return;
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`${rec.label.replace(/\s+/g,'_')}.json`; a.click();
      URL.revokeObjectURL(url);
    },

    schedule(){ /* placeholder for cron-like in-browser, runs on page load */
      const lastKey = 'church_backups_last_auto';
      const last = +localStorage.getItem(lastKey)||0;
      if (Date.now()-last > 24*36e5){
        Backup.create({ label:'Auto daily snapshot', type:'full' });
        localStorage.setItem(lastKey, Date.now());
      }
    },
    moduleKeys(){ return Object.keys(MODULES); }
  };
  window.Backup = Backup;
})();
