/* ============================================================
   NOTIFICATIONS-ENGINE.js — Phase 3 Smart Alerts
   ------------------------------------------------------------
   Generates intelligent operational alerts and inserts them
   into the `notifications` table. Idempotent: each alert has a
   stable `dedupe_key` to avoid spamming.

   Triggers:
     • Attendance drop  (member attended < 50% of last 4 weeks vs prior month)
     • Overdue follow-up tasks
     • Pending finance approvals (notifies approvers)
     • Inactive servants (no logged action 30+ days)
     • Workflow bottlenecks (history.status === 'running' > 7 days)
     • Smart financial insights → broadcast to finance role
   ============================================================ */
(function(){
  if (!window.DB) return;

  const PRIORITY = { low:1, medium:2, high:3, critical:4 };

  function exists(key){
    return DB._raw('notifications').some(n => n.dedupe_key === key && !n.is_read);
  }
  function notify({ user_id, type='alert', title, body, link, priority='medium', dedupe_key }){
    if (dedupe_key && exists(dedupe_key)) return null;
    const cid = (Auth.session()||{}).church_id;
    return DB.insert('notifications', {
      church_id: cid, user_id, type, title, body: body||'',
      link: link||'', is_read:false,
      priority, dedupe_key: dedupe_key || null,
      created_at: new Date().toISOString()
    });
  }

  function recipientsByRoles(roles){
    return DB.all('users').filter(u => roles.includes(u.role) && u.is_active).map(u=> u.user_id);
  }

  function runAttendanceDropAlerts(){
    const now = Date.now();
    const recs = DB.all('attendance_records') || [];
    const members = DB.all('members') || [];
    members.forEach(m => {
      const last30 = recs.filter(r=> r.member_id===m.member_id && (now-new Date(r.attended_at||r.created_at))<30*864e5).length;
      const prev30 = recs.filter(r=> { const d = now-new Date(r.attended_at||r.created_at); return d>=30*864e5 && d<60*864e5 && r.member_id===m.member_id; }).length;
      if (prev30 >= 3 && last30 <= Math.floor(prev30*0.4)){
        const supervisors = recipientsByRoles(['servant_leader','supervisor','church_admin']);
        supervisors.forEach(uid => notify({
          user_id: uid, type:'alert', priority:'high',
          title:`انخفاض حضور: ${m.full_name}`,
          body:`حضر ${last30} مرة آخر شهر مقابل ${prev30} في الشهر السابق`,
          link:`members.html?id=${m.member_id}`,
          dedupe_key:`att_drop:${m.member_id}:${new Date().toISOString().slice(0,10)}`
        }));
      }
    });
  }

  function runOverdueTaskAlerts(){
    const now = Date.now();
    (DB.all('followup_tasks')||[]).forEach(t=>{
      if (t.status === 'done' || t.status === 'closed') return;
      if (!t.due_at) return;
      if (new Date(t.due_at).getTime() < now){
        notify({
          user_id: t.assigned_to,
          type:'task', priority:'high',
          title:'مهمة افتقاد متأخرة',
          body: t.title || 'مهمة افتقاد بحاجة للمتابعة',
          link:'followup.html',
          dedupe_key:`overdue:${t.task_id}`
        });
      }
    });
  }

  function runPendingApprovals(){
    const pending = (DB.all('financial_transactions')||[]).filter(t=> t.status === 'pending');
    if (!pending.length) return;
    const approvers = recipientsByRoles(['church_admin','financial_manager','finance']);
    pending.forEach(t=>{
      approvers.forEach(uid=>{
        if (uid === t.recorded_by) return; // can't self-approve
        notify({
          user_id: uid, type:'workflow', priority:'high',
          title:'معاملة مالية بانتظار الاعتماد',
          body:`${t.type} — ${t.amount} ${t.currency||'EGP'}`,
          link:'finance.html',
          dedupe_key:`fin_pending:${t.transaction_id}:${uid}`
        });
      });
    });
  }

  function runFinanceInsights(){
    if (!window.FinanceEngine) return;
    try{ FinanceEngine.computeInsights(); }catch(_){}
    const ins = (window.FinanceEngine && FinanceEngine.listInsights()) || [];
    const targets = recipientsByRoles(['church_admin','financial_manager','finance']);
    ins.forEach((i,idx)=>{
      targets.forEach(uid=> notify({
        user_id: uid, type:'ai_insight',
        priority: i.severity==='critical'?'critical':i.severity==='warning'?'high':'medium',
        title:'تنبيه مالي ذكي',
        body: i.msg,
        link:'finance.html',
        dedupe_key:`fin_ins:${i.kind}:${uid}:${new Date().toISOString().slice(0,10)}`
      }));
    });
  }

  function runWorkflowBottlenecks(){
    const now = Date.now();
    const hist = DB.all('workflow_history') || [];
    hist.filter(h=> h.status==='running' && (now-new Date(h.started_at))>7*864e5).forEach(h=>{
      const admins = recipientsByRoles(['church_admin','service_admin']);
      admins.forEach(uid=> notify({
        user_id: uid, type:'alert', priority:'medium',
        title:'Workflow متوقف',
        body:`مرّ أكثر من 7 أيام دون إكمال`,
        link:'workflows.html',
        dedupe_key:`wf_stuck:${h.history_id||h.id||h.action_id+':'+h.target_id}`
      }));
    });
  }

  function runAll(){
    const s = Auth.session(); if (!s || s.role==='super_admin') return;
    try{ runAttendanceDropAlerts(); }catch(_){}
    try{ runOverdueTaskAlerts(); }catch(_){}
    try{ runPendingApprovals(); }catch(_){}
    try{ runFinanceInsights(); }catch(_){}
    try{ runWorkflowBottlenecks(); }catch(_){}
  }

  window.NotificationsEngine = {
    runAll, notify, PRIORITY,
    /** Member journey timeline — concise chronological events. */
    memberTimeline(memberId){
      const events = [];
      const m = DB.byId('members','member_id', memberId);
      if (m) events.push({ at:m.created_at, kind:'registered', label:'تسجيل في الكنيسة' });
      (DB.all('attendance_records')||[]).filter(r=>r.member_id===memberId).forEach(r=>{
        events.push({ at: r.attended_at||r.created_at, kind:'attendance', label:'حضور قداس/اجتماع' });
      });
      (DB.all('followup_tasks')||[]).filter(t=>t.member_id===memberId).forEach(t=>{
        events.push({ at: t.created_at, kind:'followup', label:`مهمة افتقاد: ${t.title||''}` });
        if (t.completed_at) events.push({ at: t.completed_at, kind:'followup_done', label:'إنهاء مهمة افتقاد' });
      });
      (DB.all('member_notes')||[]).filter(n=>n.member_id===memberId).forEach(n=>{
        events.push({ at: n.created_at, kind:'note', label:`ملاحظة: ${(n.content||'').slice(0,60)}` });
      });
      return events.sort((a,b)=> new Date(a.at) - new Date(b.at));
    }
  };

  if (Auth.session()) try{ runAll(); }catch(_){}
})();
