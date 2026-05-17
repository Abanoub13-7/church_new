/* ============================================================
   AI-OPS.js  —  Phase 8
   AI-like operational insights · risk scores · recommendations
   Pure heuristics over existing data; safe & deterministic.
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function byChurch(cid, t){ return (root()[t]||[]).filter(r=>r.church_id===cid); }
  function days(ms){ return ms/864e5; }

  const AIOps = {
    /* TENANT-LEVEL */
    churchInsights(cid){
      const out = [];
      const all = root();
      const members = byChurch(cid,'members');
      const att = byChurch(cid,'attendance_records');
      const events = byChurch(cid,'events');
      const wf = byChurch(cid,'workflow_instances');
      const fin = byChurch(cid,'financial_transactions');
      const last30 = Date.now()-30*864e5;
      const recentAtt = att.filter(a=>new Date(a.check_in_at||a.created_at||0).getTime()>last30).length;
      const ratio = members.length ? recentAtt/members.length : 0;
      if (members.length>=10 && ratio<0.2)
        out.push(insight('declining_engagement','warning','انخفاض ملحوظ في الحضور','نسبة الحضور آخر 30 يوم أقل من 20%. فعّل افتقاد العائدين.'));
      const inactiveCount = members.filter(m=>m.member_status==='inactive').length;
      if (inactiveCount/Math.max(1,members.length) > 0.3)
        out.push(insight('inactive_ministries','warning','عدد كبير من المخدومين غير النشطين',`${inactiveCount} مخدوم غير نشط. راجع خطة الافتقاد.`));
      const atRisk = members.filter(m=>m.member_status==='at_risk').length;
      if (atRisk>0)
        out.push(insight('attendance_risk','danger','مخدومون في خطر الانقطاع',`${atRisk} مخدوم بحاجة لمتابعة فورية.`));
      const stuckWF = wf.filter(w=>w.status==='running' && new Date(w.created_at||0).getTime()<Date.now()-7*864e5).length;
      if (stuckWF>0)
        out.push(insight('workflow_bottleneck','warning','Workflows عالقة',`${stuckWF} workflow عالق لأكثر من أسبوع.`));
      const recentFin = fin.filter(t=>new Date(t.created_at||0).getTime()>last30).length;
      if (fin.length>5 && recentFin===0)
        out.push(insight('finance_instability','warning','نشاط مالي متوقف','لا توجد حركات مالية خلال 30 يوم.'));
      return out;
    },

    /* RISK SCORE per church */
    churchRisk(cid){
      const h = TenantMgmt.health(cid);
      const ins = AIOps.churchInsights(cid);
      let risk = 100 - h.score;
      ins.forEach(i => { if (i.severity==='danger') risk+=10; if (i.severity==='warning') risk+=5; });
      risk = Math.min(100, Math.max(0, risk));
      let band='منخفض', color='var(--green,#22c55e)';
      if (risk>=70){ band='حرج'; color='var(--red,#ef4444)'; }
      else if (risk>=45){ band='مرتفع'; color='var(--orange,#f97316)'; }
      else if (risk>=25){ band='متوسط'; color='var(--blue,#3b82f6)'; }
      return { risk, band, color, insights:ins, health:h };
    },

    /* PLATFORM-WIDE */
    platformInsights(){
      const out=[];
      const churches = DB._raw('churches');
      const unhealthy = churches.filter(c=>TenantMgmt.health(c.church_id).score<30);
      if (unhealthy.length)
        out.push(insight('unhealthy_tenants','danger',`${unhealthy.length} كنيسة في حالة حرجة`,'صحة تشغيلية منخفضة جداً تتطلب تدخل.'));
      const inactive = churches.filter(c => TenantMgmt.operational(c.church_id).loginActivity===0);
      if (inactive.length)
        out.push(insight('inactive_churches','warning',`${inactive.length} كنيسة بدون نشاط 30 يوم`,'تواصل معهم لاستعادة النشاط.'));
      const churn = UsageAnalytics.churnRisk().filter(x=>x.band==='critical');
      if (churn.length)
        out.push(insight('churn_critical','danger',`${churn.length} كنيسة معرضة لمغادرة المنصة`,'احتمالية انسحاب مرتفعة جداً.'));
      // feature adoption issue
      const usage = UsageAnalytics.featureUsage();
      const total = churches.length||1;
      Object.entries(usage).forEach(([k,v]) => {
        if (v/total < 0.3) out.push(insight('adoption_low_'+k,'info',`اعتماد ميزة "${k}" منخفض`,`فقط ${v} من ${total} كنيسة تستخدم هذه الميزة.`));
      });
      return out;
    },

    /* Smart recommendations */
    recommendations(cid){
      const recs = [];
      const r = AIOps.churchRisk(cid);
      const u = TenantMgmt.usageVsLimits(cid);
      const sub = Billing.getByChurch(cid);
      if (u.members.pct > 80) recs.push(rec('upgrade_plan','high','اقترح ترقية الخطة','عدد المخدومين يقترب من الحد الأقصى.'));
      if (u.storage_mb.pct > 80) recs.push(rec('cleanup_storage','medium','تنظيف التخزين','مساحة التخزين تقترب من الحد.'));
      if (sub?.status==='trial') recs.push(rec('convert_trial','high','تحويل التجريبي إلى مدفوع','قدّم عرضاً خاصاً لتحويل الكنيسة.'));
      if (r.health.signals.completedWF===0) recs.push(rec('activate_workflows','medium','تفعيل Workflows','لا يوجد workflows مكتملة. درّب المستخدمين.'));
      if (r.health.signals.recentAtt<5) recs.push(rec('boost_attendance','medium','تحسين الحضور','شجّع استخدام جلسات الحضور والـ QR.'));
      if (r.health.signals.finance<3) recs.push(rec('activate_finance','low','تفعيل وحدة الماليات','لم يتم تسجيل نشاط مالي يُذكر.'));
      return recs;
    }
  };

  function insight(key, sev, title, detail){
    return { insight_id: 'ins-'+key+'-'+Date.now().toString(36), key, severity:sev, title, detail, at: new Date().toISOString() };
  }
  function rec(key, priority, title, detail){
    return { rec_id:'rec-'+key, key, priority, title, detail };
  }

  window.AIOps = AIOps;
})();
