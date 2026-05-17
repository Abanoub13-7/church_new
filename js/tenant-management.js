/* ============================================================
   TENANT-MANAGEMENT.js  —  Phase 3
   Lifecycle ops · resource usage · health score · feature flags
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(a){ localStorage.setItem('church_db_v1', JSON.stringify(a)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9); }
  function now(){ return new Date().toISOString(); }

  function ensure(){
    const all = root();
    ['feature_flags','tenant_events'].forEach(t => { if (!Array.isArray(all[t])) all[t]=[]; });
    save(all);
  }

  const TM = {
    listTenants(){ return DB._raw('churches')||[]; },
    get(cid){ return TM.listTenants().find(c=>c.church_id===cid); },

    create({ name, code, plan, admin_email, admin_name }){
      const all = root();
      const ch = {
        church_id: uid('ch'),
        church_name: name, church_code: code,
        subscription_plan: plan||'free',
        subscription_status: 'trial',
        created_at: now()
      };
      all.churches.push(ch);
      // bootstrap an admin user
      if (admin_email){
        all.users.push({
          user_id: uid('usr'), church_id: ch.church_id,
          full_name: admin_name||'Church Admin',
          email: admin_email, password_hash: 'changeme',
          role:'church_admin', is_active:true, created_at: now()
        });
      }
      save(all);
      // create subscription via Billing
      Billing?.runLifecycle?.();
      // Force subscription creation by re-ensuring
      if (window.Billing){
        const all2 = root();
        if (!all2.subscriptions.find(s=>s.church_id===ch.church_id)){
          // force via internal seeding path: simplest is calling listSubscriptions which triggers ensure on first load only
          // explicitly:
          const trialEnds = new Date(Date.now()+14*864e5).toISOString();
          all2.subscriptions.push({
            subscription_id: uid('sub'), church_id: ch.church_id, plan_key: ch.subscription_plan,
            billing_cycle:'monthly', status:'trial', started_at:now(),
            trial_ends_at:trialEnds, current_period_start:now(),
            current_period_end: new Date(Date.now()+30*864e5).toISOString(),
            grace_until:null, cancel_requested:false, auto_renew:true, created_at:now()
          });
          save(all2);
        }
      }
      Audit?.log('tenant.created',{ church_id:ch.church_id, name });
      return ch;
    },
    setStatus(cid, status, reason){
      const all = root();
      const c = all.churches.find(x=>x.church_id===cid); if (!c) return null;
      const old = c.subscription_status;
      c.subscription_status = status;
      all.tenant_events = all.tenant_events||[];
      all.tenant_events.push({ event_id:uid('tev'), church_id:cid, type:'status_change', from:old, to:status, reason, at:now() });
      save(all);
      Audit?.log('tenant.status_change',{ church_id:cid, from:old, to:status, reason });
      return c;
    },
    suspend(cid, reason){ return TM.setStatus(cid,'suspended', reason); },
    freeze(cid, reason){  return TM.setStatus(cid,'frozen', reason); },
    archive(cid, reason){ return TM.setStatus(cid,'archived', reason); },
    reactivate(cid){      return TM.setStatus(cid,'active','reactivated'); },

    /* ----- Resource usage ----- */
    usage(cid){
      const all = root();
      const f = arr => (all[arr]||[]).filter(r=>r.church_id===cid);
      const users = f('users').length;
      const members = f('members').length;
      const events = f('events').length;
      const workflows = (f('workflow_instances').length) || (f('workflows')||[]).length;
      // crude storage estimate from members + audit + records
      const blob = JSON.stringify({a:f('members'),b:f('audit_logs'),c:f('attendance_records'),d:f('events')});
      const storage_mb = +(blob.length/(1024*1024)).toFixed(2);
      const activity = f('audit_logs').length;
      return { users, members, events, workflows, storage_mb, activity };
    },
    usageVsLimits(cid){
      const u = TM.usage(cid);
      const limit = k => Billing?.limit?.(cid,k) ?? Infinity;
      function pct(used, lim){ return lim===Infinity?0:Math.min(100, Math.round(used/lim*100)); }
      return {
        users:      { used:u.users,      limit:limit('users'),      pct: pct(u.users,      limit('users')) },
        members:    { used:u.members,    limit:limit('members'),    pct: pct(u.members,    limit('members')) },
        events:     { used:u.events,     limit:limit('events'),     pct: pct(u.events,     limit('events')) },
        workflows:  { used:u.workflows,  limit:limit('workflows'),  pct: pct(u.workflows,  limit('workflows')) },
        storage_mb: { used:u.storage_mb, limit:limit('storage_mb'), pct: pct(u.storage_mb, limit('storage_mb')) }
      };
    },

    /* ----- Health score ----- */
    health(cid){
      const all = root();
      const f = arr => (all[arr]||[]).filter(r=>r.church_id===cid);
      const members = f('members').length;
      const att = f('attendance_records');
      const last30 = Date.now()-30*864e5;
      const recentAtt = att.filter(a => new Date(a.check_in_at||a.created_at||0).getTime() > last30).length;
      const events = f('events').length;
      const completedWF = (f('workflow_instances')||[]).filter(w=>w.status==='completed').length;
      const finance = (f('financial_transactions')||[]).length;
      const logins = (f('audit_logs')||[]).filter(l=>l.action==='auth.login_success' && new Date(l.created_at).getTime()>last30).length;

      // weighted score
      let score = 0;
      score += Math.min(25, recentAtt/Math.max(1,members)*100); // engagement (attendance/member)
      score += Math.min(20, logins/Math.max(1,f('users').length)*20); // login activity
      score += Math.min(15, events*1.5);          // events count
      score += Math.min(15, completedWF*2);       // workflow completion
      score += Math.min(15, finance*1.5);         // finance activity
      score += members>0 ? 10 : 0;                // base content
      score = Math.round(Math.min(100, score));

      let band='red', label='حرج';
      if (score>=75){ band='green'; label='ممتاز'; }
      else if (score>=50){ band='blue'; label='جيد'; }
      else if (score>=30){ band='orange'; label='ضعيف'; }
      return { score, band, label, signals:{ recentAtt, logins, events, completedWF, finance, members } };
    },

    /* ----- Feature flags ----- */
    flags(cid){
      ensure();
      const all = root();
      return (all.feature_flags||[]).filter(f=>f.church_id===cid);
    },
    setFlag(cid, feature, enabled){
      ensure();
      const all = root();
      let f = all.feature_flags.find(x=>x.church_id===cid && x.feature===feature);
      if (!f){ f={ flag_id:uid('flg'), church_id:cid, feature, enabled:!!enabled, updated_at:now() }; all.feature_flags.push(f); }
      else { f.enabled = !!enabled; f.updated_at = now(); }
      save(all);
      Audit?.log('tenant.flag_change',{ church_id:cid, feature, enabled:!!enabled });
      return f;
    },
    isFlagEnabled(cid, feature){
      const f = TM.flags(cid).find(x=>x.feature===feature);
      // Default: respect plan limits if no explicit flag
      if (!f) return Billing?.isFeatureAllowed?.(cid, feature) ?? true;
      return f.enabled;
    },

    /* ----- Operational metrics ----- */
    operational(cid){
      const all = root();
      const f = arr => (all[arr]||[]).filter(r=>r.church_id===cid);
      const last30 = Date.now()-30*864e5;
      const logs = f('audit_logs');
      const loginActivity = logs.filter(l=>l.action==='auth.login_success' && new Date(l.created_at).getTime()>last30).length;
      const engagement = f('attendance_records').filter(a=>new Date(a.check_in_at||a.created_at||0).getTime()>last30).length;
      const workflowActivity = (f('workflow_instances')||[]).filter(w=>new Date(w.created_at||0).getTime()>last30).length;
      const financeUsage = (f('financial_transactions')||[]).filter(t=>new Date(t.created_at||0).getTime()>last30).length;
      const eventParticipation = (f('event_bookings')||[]).filter(b=>new Date(b.created_at||0).getTime()>last30).length;
      return { loginActivity, engagement, workflowActivity, financeUsage, eventParticipation };
    }
  };
  ensure();
  window.TenantMgmt = TM;
})();
