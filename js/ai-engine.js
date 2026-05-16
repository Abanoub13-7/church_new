/* ============================================================
   AI-ENGINE.js — Behavior Analysis & Risk Score
   يحلل سلوك كل عضو ويُنتج Risk Score حقيقي
   ============================================================ */
(function(){
  const FACTORS = {
    ATTENDANCE_DROP: { weight: 35, label:'انخفاض الحضور' },
    LONG_INACTIVITY: { weight: 25, label:'فترة عدم نشاط طويلة' },
    NO_SERVING:      { weight: 15, label:'عدم المشاركة في الخدمة' },
    NO_EVENTS:       { weight: 10, label:'عدم حضور الفعاليات' },
    NO_FOLLOWUP_RESP:{ weight: 10, label:'عدم الاستجابة للافتقاد' },
    FAMILY_INACTIVE: { weight:  5, label:'عدم نشاط العائلة' }
  };

  function daysSince(iso){
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime())/86400000);
  }

  function analyzeMember(member){
    const factors = {};
    let score = 0;

    // 1) Attendance records
    const records = DB.filter('attendance_records', r => r.member_id === member.member_id);
    const sessions = DB.all('attendance_sessions');

    // last attendance
    const lastRecord = records.sort((a,b)=> new Date(b.check_in_at)-new Date(a.check_in_at))[0];
    const daysSinceLast = lastRecord ? daysSince(lastRecord.check_in_at) : 999;

    if (daysSinceLast > 60){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight; score += factors.LONG_INACTIVITY; }
    else if (daysSinceLast > 30){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight*0.6; score += factors.LONG_INACTIVITY; }
    else if (daysSinceLast > 14){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight*0.3; score += factors.LONG_INACTIVITY; }

    // attendance drop: compare last 30 days vs previous 30 days
    const now = Date.now();
    const last30 = records.filter(r => (now - new Date(r.check_in_at).getTime()) <= 30*864e5).length;
    const prev30 = records.filter(r => {
      const d = now - new Date(r.check_in_at).getTime();
      return d > 30*864e5 && d <= 60*864e5;
    }).length;
    if (prev30 > 0 && last30 < prev30){
      const drop = (prev30 - last30) / prev30;
      if (drop >= 0.6){ factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight; score += factors.ATTENDANCE_DROP; }
      else if (drop >= 0.3){ factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight*0.6; score += factors.ATTENDANCE_DROP; }
    } else if (prev30 === 0 && last30 === 0){
      factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight*0.5; score += factors.ATTENDANCE_DROP;
    }

    // 2) Serving: is this member also a servant (linked user)?
    const linkedUser = DB.find('users', u => u.member_id === member.member_id);
    if (linkedUser && ['servant','supervisor'].includes(linkedUser.role)){
      const servingSessions = sessions.filter(s => ['service','sunday_school','servants_meeting'].includes(s.activity_type));
      const served = records.filter(r => servingSessions.some(s => s.session_id===r.session_id)).length;
      if (served === 0){ factors.NO_SERVING = FACTORS.NO_SERVING.weight; score += factors.NO_SERVING; }
    }

    // 3) Events
    const bookings = DB.filter('event_bookings', b => b.member_id === member.member_id);
    if (bookings.length === 0){ factors.NO_EVENTS = FACTORS.NO_EVENTS.weight*0.5; score += factors.NO_EVENTS; }

    // 4) Follow-up response: open follow-up tasks without logs
    const openTasks = DB.filter('followup_tasks', t => t.member_id===member.member_id && t.status!=='done');
    if (openTasks.length > 0){
      const logs = DB.filter('followup_logs', l => openTasks.some(t=>t.task_id===l.task_id));
      const responsiveLogs = logs.filter(l => ['called','visited','whatsapp'].includes(l.action) && l.result);
      if (logs.length > 0 && responsiveLogs.length === 0){
        factors.NO_FOLLOWUP_RESP = FACTORS.NO_FOLLOWUP_RESP.weight;
        score += factors.NO_FOLLOWUP_RESP;
      }
    }

    score = Math.min(100, Math.round(score));
    const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

    const recommendations = [];
    if (factors.LONG_INACTIVITY) recommendations.push('إنشاء افتقاد عاجل — لم يحضر منذ '+daysSinceLast+' يوم');
    if (factors.ATTENDANCE_DROP) recommendations.push('انخفاض حضور ملحوظ — تواصل من خادم الفصل');
    if (factors.NO_SERVING) recommendations.push('تشجيع المخدوم على المشاركة في الخدمة');
    if (factors.NO_FOLLOWUP_RESP) recommendations.push('تصعيد للمشرف — لا يستجيب للافتقاد');

    return { score, level, factors, recommendations, daysSinceLast, last30, prev30 };
  }

  function recomputeAll(){
    const members = DB.all('members');
    members.forEach(m => {
      const result = analyzeMember(m);
      const existing = DB.find('member_risk_scores', s => s.member_id === m.member_id);
      const data = {
        member_id: m.member_id,
        church_id: m.church_id,
        risk_level: result.level,
        score: result.score,
        factors: result.factors,
        recommendation: result.recommendations.join(' • '),
        computed_at: new Date().toISOString()
      };
      if (existing) DB.update('member_risk_scores','score_id',existing.score_id, data);
      else DB.insert('member_risk_scores', data);

      // auto-update member_status for at-risk
      if (result.level === 'critical' || result.level === 'high'){
        if (m.member_status !== 'at_risk' && m.member_status !== 'inactive'){
          DB.update('members','member_id',m.member_id,{ member_status:'at_risk' });
        }
      }
    });
  }

  function insights(){
    recomputeAll();
    const scores = DB.all('member_risk_scores');
    const members = DB.all('members');
    const out = [];

    scores.filter(s => s.risk_level==='critical').forEach(s => {
      const m = members.find(x=>x.member_id===s.member_id);
      if (m) out.push({ type:'critical', icon:'fa-exclamation-triangle', title:m.full_name, body:s.recommendation });
    });

    // class with lowest attendance
    const classes = DB.all('service_classes');
    classes.forEach(c => {
      const classMembers = members.filter(m => m.service_class_id===c.class_id);
      if (classMembers.length === 0) return;
      const atRisk = classMembers.filter(m => {
        const s = scores.find(s=>s.member_id===m.member_id);
        return s && ['high','critical'].includes(s.risk_level);
      });
      if (atRisk.length / classMembers.length > 0.4){
        out.push({ type:'warning', icon:'fa-chart-line', title:'الفصل: '+c.class_name, body:`${atRisk.length} من ${classMembers.length} مخدوم في خطر — يحتاج مراجعة` });
      }
    });

    return out;
  }

  window.AIEngine = { analyzeMember, recomputeAll, insights, FACTORS };
})();
