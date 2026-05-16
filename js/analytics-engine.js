/* ============================================================
   ANALYTICS-ENGINE.js — Operational intelligence layer
   Church health, risk detection, scorecards, cross-module insights
   ============================================================ */
(function(){
  const cache = Perf?.Cache;

  function _val(n){ return isFinite(n) ? Math.round(n) : 0; }

  function attendanceTrend(days){
    days = days || 60;
    const cutoff = Date.now() - days*864e5;
    const recs = DB.filter('attendance_records', r => new Date(r.check_in_at).getTime() >= cutoff);
    const byDay = {};
    recs.forEach(r => {
      const d = new Date(r.check_in_at).toISOString().slice(0,10);
      byDay[d] = (byDay[d]||0) + 1;
    });
    const labels = Object.keys(byDay).sort();
    return { labels, values: labels.map(l=>byDay[l]) };
  }

  function attendanceStability(){
    const t = attendanceTrend(60).values;
    if (t.length < 4) return 70;
    const half = Math.floor(t.length/2);
    const a = avg(t.slice(0,half)), b = avg(t.slice(half));
    if (a === 0) return 60;
    const delta = (b-a)/a;
    return Math.max(0, Math.min(100, 80 + delta*120));
  }
  function avg(a){ return a.reduce((s,x)=>s+x,0)/(a.length||1); }

  function workflowEfficiency(){
    const h = DB.all('workflow_history');
    if (!h.length) return 75;
    const done = h.filter(x => x.status==='completed').length;
    const failed = h.filter(x => x.status==='failed').length;
    const total = h.length;
    const eff = (done/total)*100 - (failed/total)*30;
    return Math.max(0, Math.min(100, eff));
  }
  function followupCompletion(){
    const f = DB.all('followups') || [];
    if (!f.length) return 80;
    const done = f.filter(x => x.status==='completed' || x.is_resolved).length;
    return (done / f.length) * 100;
  }
  function servantActivity(){
    const servants = DB.filter('users', u => ['servant','servant_leader','supervisor'].includes(u.role));
    if (!servants.length) return 75;
    const active = servants.filter(u => {
      if (!u.member_id) return false;
      const recent = DB.filter('attendance_records', r => r.member_id===u.member_id && (Date.now()-new Date(r.check_in_at).getTime())<30*864e5);
      return recent.length > 0;
    }).length;
    return (active/servants.length)*100;
  }
  function financialStability(){
    if (!window.FinanceEngine || !FinanceEngine.totals) return 80;
    try{
      const t = FinanceEngine.totals();
      if (!t) return 80;
      if (t.income <= 0) return 60;
      const ratio = t.income > 0 ? Math.min(1, (t.income - t.expense)/t.income) : 0;
      return Math.max(20, Math.min(100, 60 + ratio*40));
    } catch(_){ return 75; }
  }

  function churchHealth(){
    return Perf.Cache.get('analytics:health', 15000, () => {
      const parts = {
        attendance: attendanceStability(),
        workflow:   workflowEfficiency(),
        followup:   followupCompletion(),
        servants:   servantActivity(),
        finance:    financialStability()
      };
      const score = _val((parts.attendance*0.25 + parts.workflow*0.2 + parts.followup*0.2 + parts.servants*0.2 + parts.finance*0.15));
      return { score, parts };
    });
  }

  function risks(){
    const out = [];
    const t = attendanceTrend(60).values;
    if (t.length >= 6){
      const a = avg(t.slice(0,Math.floor(t.length/2))), b = avg(t.slice(Math.floor(t.length/2)));
      if (a>0 && (b-a)/a < -0.15) out.push({ kind:'attendance', sev:'high', msg:'انخفاض ملحوظ في الحضور خلال الفترة الأخيرة', delta: Math.round(((b-a)/a)*100)+'%' });
    }
    const inactive = DB.filter('users', u => ['servant','servant_leader'].includes(u.role)).filter(u => {
      if (!u.member_id) return true;
      const r = DB.filter('attendance_records', x => x.member_id===u.member_id);
      if (!r.length) return true;
      const last = r.sort((x,y)=> new Date(y.check_in_at)-new Date(x.check_in_at))[0];
      return (Date.now()-new Date(last.check_in_at).getTime()) > 45*864e5;
    });
    if (inactive.length) out.push({ kind:'servants', sev:inactive.length>3?'high':'medium', msg:`${inactive.length} خادم غير نشط لأكثر من 45 يوم`, list: inactive.slice(0,5).map(x=>x.full_name) });

    const blocked = DB.filter('workflow_history', h => h.status==='failed' || h.status==='escalated');
    if (blocked.length > 2) out.push({ kind:'workflows', sev:'high', msg:`${blocked.length} workflow متعثر أو مصعّد` });

    try {
      const t2 = FinanceEngine?.totals?.();
      if (t2 && t2.expense > t2.income && t2.income>0) out.push({ kind:'finance', sev:'critical', msg:'المصروفات تجاوزت الإيرادات في الفترة الحالية' });
    } catch(_){}

    const drop = DB.filter('members', m => {
      const r = DB.filter('attendance_records', x => x.member_id===m.member_id).sort((x,y)=> new Date(y.check_in_at)-new Date(x.check_in_at));
      if (!r.length) return false;
      return (Date.now()-new Date(r[0].check_in_at).getTime()) > 45*864e5;
    });
    if (drop.length > 5) out.push({ kind:'members', sev:'medium', msg:`${drop.length} مخدوم متغيب أكثر من 45 يوم — يحتاج افتقاد` });

    return out;
  }

  function insights(){
    const out = [];
    const h = churchHealth();
    if (h.score < 60) out.push({ icon:'fa-triangle-exclamation', sev:'critical', text:'مؤشر صحة الكنيسة منخفض — راجع المخاطر الحرجة' });
    else if (h.score < 75) out.push({ icon:'fa-bell', sev:'high', text:'مؤشر صحة الكنيسة في المنطقة الصفراء' });
    else out.push({ icon:'fa-circle-check', sev:'low', text:'الكنيسة في حالة تشغيلية صحية' });

    Object.entries(h.parts).forEach(([k,v]) => {
      if (v < 55) out.push({ icon:'fa-arrow-down', sev:'high', text:`أداء قسم "${labelOf(k)}" منخفض (${_val(v)}%)` });
    });
    return out;
  }
  function labelOf(k){ return ({attendance:'الحضور',workflow:'الـ Workflows',followup:'الافتقاد',servants:'نشاط الخدام',finance:'الماليات'})[k]||k; }

  function ministryScorecard(){
    const classes = DB.all('classes') || [];
    return classes.map(c => {
      const sessions = DB.filter('attendance_sessions', s => s.class_id===c.class_id);
      const recs = DB.filter('attendance_records', r => sessions.find(s => s.session_id===r.session_id));
      const score = sessions.length ? Math.min(100, (recs.length/sessions.length)*8) : 0;
      return { name:c.name||c.class_id, sessions:sessions.length, attendances:recs.length, score:_val(score) };
    }).sort((a,b)=>b.score-a.score);
  }

  function servantScorecard(){
    const servants = DB.filter('users', u => ['servant','servant_leader'].includes(u.role));
    return servants.map(s => {
      const completedFollowups = DB.filter('followups', f => f.assigned_to===s.user_id && (f.status==='completed'||f.is_resolved)).length;
      const open = DB.filter('followups', f => f.assigned_to===s.user_id && f.status!=='completed' && !f.is_resolved).length;
      const score = _val(Math.min(100, completedFollowups*8 - open*3 + 50));
      return { name:s.full_name, completed:completedFollowups, open, score };
    }).sort((a,b)=>b.score-a.score);
  }

  window.AnalyticsEngine = {
    attendanceTrend, churchHealth, risks, insights,
    ministryScorecard, servantScorecard,
    workflowEfficiency, followupCompletion, servantActivity, financialStability
  };
})();
