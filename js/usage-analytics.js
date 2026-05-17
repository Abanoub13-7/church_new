/* ============================================================
   USAGE-ANALYTICS.js  —  Phase 4
   SaaS-level BI · churn risk · executive metrics · metering
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function byChurch(cid, arr){ return (root()[arr]||[]).filter(r=>r.church_id===cid); }
  function days(ms){ return ms/864e5; }

  const UA = {
    topActiveChurches(limit){
      const churches = DB._raw('churches');
      const ranked = churches.map(c => {
        const h = TenantMgmt.health(c.church_id);
        const op = TenantMgmt.operational(c.church_id);
        return { church:c, score:h.score, activity: op.loginActivity+op.engagement+op.workflowActivity+op.financeUsage };
      }).sort((a,b)=>b.activity-a.activity);
      return ranked.slice(0, limit||10);
    },

    featureUsage(){
      const churches = DB._raw('churches');
      const counts = { events:0, finance:0, workflows:0, attendance:0, ai:0, notifications:0 };
      churches.forEach(c => {
        const u = TenantMgmt.usage(c.church_id);
        counts.events    += u.events>0?1:0;
        counts.workflows += u.workflows>0?1:0;
        counts.attendance+= (byChurch(c.church_id,'attendance_records').length>0)?1:0;
        counts.finance   += (byChurch(c.church_id,'financial_transactions').length>0)?1:0;
        counts.ai        += (byChurch(c.church_id,'ai_insights')||[]).length>0?1:0;
        counts.notifications += (byChurch(c.church_id,'notifications')||[]).length>0?1:0;
      });
      return counts;
    },

    growthTrend(){
      // group churches by month created
      const buckets = {};
      DB._raw('churches').forEach(c => {
        const d = new Date(c.created_at||Date.now());
        const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        buckets[k] = (buckets[k]||0)+1;
      });
      const keys = Object.keys(buckets).sort();
      return { labels:keys, values:keys.map(k=>buckets[k]) };
    },

    revenueTrend(){
      const invs = Billing.listInvoices().filter(i=>i.status==='paid');
      const buckets = {};
      invs.forEach(i => {
        const d = new Date(i.issued_at);
        const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        buckets[k] = (buckets[k]||0)+(+i.amount||0);
      });
      const keys = Object.keys(buckets).sort();
      return { labels:keys, values:keys.map(k=>buckets[k]) };
    },

    /* Churn risk: tenants likely to leave/downgrade/become inactive */
    churnRisk(){
      const churches = DB._raw('churches');
      return churches.map(c => {
        const h = TenantMgmt.health(c.church_id);
        const op = TenantMgmt.operational(c.church_id);
        const sub = Billing.getByChurch(c.church_id);
        let risk = 0;
        if (h.score < 30) risk += 40;
        else if (h.score < 50) risk += 25;
        else if (h.score < 70) risk += 10;
        if (op.loginActivity===0) risk += 25;
        else if (op.loginActivity<5) risk += 10;
        if (sub){
          if (sub.status==='grace_period') risk += 20;
          if (sub.status==='pending_payment') risk += 25;
          if (sub.status==='trial') risk += 15;
        }
        if (op.engagement===0) risk += 10;
        risk = Math.min(100, risk);
        let band = 'low';
        if (risk>=70) band='critical';
        else if (risk>=45) band='high';
        else if (risk>=25) band='medium';
        return { church:c, risk, band, reasons:reasonList(h,op,sub) };
      }).sort((a,b)=>b.risk-a.risk);
    },

    /* Per-tenant metering */
    metering(cid){
      const all = root();
      const f = arr => (all[arr]||[]).filter(r=>r.church_id===cid);
      return {
        storage_mb: TenantMgmt.usage(cid).storage_mb,
        events: f('events').length,
        workflows: (f('workflow_instances')||[]).length,
        analytics_views: (f('audit_logs')||[]).filter(l=>(l.action||'').startsWith('analytics.')).length,
        user_activity: (f('audit_logs')||[]).length
      };
    },

    /* Platform-wide health */
    platformHealth(){
      const churches = DB._raw('churches');
      const last7 = Date.now()-7*864e5;
      let activeT=0, inactiveT=0, warnings=0;
      churches.forEach(c => {
        const op = TenantMgmt.operational(c.church_id);
        if (op.loginActivity>0) activeT++; else inactiveT++;
      });
      const auditCount = (root().audit_logs||[]).filter(l=>new Date(l.created_at).getTime()>last7).length;
      const subs = Billing.listSubscriptions();
      warnings = subs.filter(s=>['grace_period','pending_payment','suspended'].includes(s.status)).length;
      return { activeT, inactiveT, auditCount, warnings, totalT:churches.length };
    }
  };

  function reasonList(h,op,sub){
    const out=[];
    if (h.score<30) out.push('صحة منخفضة جداً');
    else if (h.score<50) out.push('صحة ضعيفة');
    if (op.loginActivity===0) out.push('لا توجد تسجيلات دخول 30 يوم');
    if (op.engagement===0) out.push('لا يوجد حضور');
    if (sub?.status==='grace_period') out.push('في فترة السماح');
    if (sub?.status==='trial') out.push('في الفترة التجريبية');
    if (sub?.status==='pending_payment') out.push('دفعة معلقة');
    return out;
  }

  window.UsageAnalytics = UA;
})();
