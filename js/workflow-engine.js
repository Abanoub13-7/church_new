/* ============================================================
   WORKFLOW-ENGINE.js — Trigger-based automation
   Triggers → Steps → Escalation → History
   ============================================================ */
(function(){

  /* === TRIGGER DETECTORS === */
  const Detectors = {
    // Detect members with N consecutive absences in a recurring activity
    absence_streak(config){
      const threshold = config.count || 3;
      const members = DB.all('members');
      const found = [];
      const sundayClasses = DB.filter('attendance_sessions', s => s.activity_type==='sunday_school');
      // group sessions by class, sorted desc
      const byClass = {};
      sundayClasses.forEach(s => {
        const k = s.class_id || 'none';
        (byClass[k] = byClass[k] || []).push(s);
      });
      Object.values(byClass).forEach(list => list.sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at)));

      members.forEach(m => {
        if (!m.service_class_id) return;
        const sessions = (byClass[m.service_class_id]||[]).slice(0, threshold);
        if (sessions.length < threshold) return;
        const attended = sessions.filter(s => DB.find('attendance_records', r => r.session_id===s.session_id && r.member_id===m.member_id));
        if (attended.length === 0){
          // check not already running workflow for this trigger+member
          const existing = DB.find('workflow_history', w => w.target_id===m.member_id && w.status==='running' && w.action_id);
          if (!existing) found.push(m);
        }
      });
      return found;
    },
    first_visit(){
      const recent = DB.filter('members', m => m.first_visit_at && (Date.now() - new Date(m.first_visit_at).getTime()) < 7*864e5);
      return recent.filter(m => !DB.find('workflow_history', w => w.target_id===m.member_id && w.action_id));
    },
    servant_inactive(config){
      const days = config.days || 30;
      const servants = DB.filter('users', u => ['servant','supervisor'].includes(u.role) && u.member_id);
      const out = [];
      servants.forEach(u => {
        const last = DB.filter('attendance_records', r => r.member_id===u.member_id)
          .sort((a,b)=> new Date(b.check_in_at)-new Date(a.check_in_at))[0];
        if (!last || (Date.now() - new Date(last.check_in_at).getTime()) > days*864e5){
          out.push({ user:u, days: last ? Math.floor((Date.now()-new Date(last.check_in_at))/864e5) : 999 });
        }
      });
      return out;
    },
    event_full(){
      return DB.filter('events', e => {
        if (e.status === 'full') return false;
        if (!e.capacity) return false;
        const booked = DB.count('event_bookings', b => b.event_id===e.event_id && ['confirmed','attended'].includes(b.booking_status));
        return booked >= e.capacity;
      });
    }
  };

  /* === STEP EXECUTORS === */
  const Executors = {
    create_task(step, ctx){
      const member = ctx.member;
      const classServant = member?.service_class_id
        ? DB.find('servant_assignments', a => a.class_id===member.service_class_id && a.active)
        : null;
      const assignTo = step.assignTo === 'class_servant'
        ? classServant?.user_id
        : step.assignTo === 'supervisor'
          ? DB.find('service_classes', c => c.class_id===member?.service_class_id)?.supervisor_id
          : step.assignTo === 'service_admin'
            ? DB.find('users', u => u.role==='service_admin')?.user_id
            : step.assignTo;

      const task = DB.insert('followup_tasks', {
        member_id: member?.member_id,
        assigned_to: assignTo,
        created_by: 'system',
        reason: ctx.reason,
        priority: step.priority || 'medium',
        due_at: new Date(Date.now() + 48*36e5).toISOString(),
        status: 'open',
        escalation_level: ctx.escalation_level || 0,
        workflow_id: ctx.workflow_id
      });
      Notify.toUser(assignTo, 'task','مهمة افتقاد جديدة', ctx.reason, 'followup.html');
      return { taskId: task.task_id, assignTo };
    },
    escalate(step, ctx){
      ctx.escalation_level = (ctx.escalation_level||0) + 1;
      ctx.reason = '⚠️ تصعيد ['+ctx.escalation_level+']: '+(ctx.reason||'');
      return Executors.create_task({ ...step, assignTo: step.to }, ctx);
    },
    send_whatsapp(step, ctx){
      const member = ctx.member;
      const template = step.template || 'default';
      const messages = {
        welcome: `سلام ونعمة 🌹\nأهلاً بك ${member?.full_name} في كنيستنا. سعداء بانضمامك ونتمنى لقاءك دائماً.`,
        absence: `سلام ونعمة 🌹\n${member?.full_name}، افتقدناك في الفصل. نتمنى رؤيتك قريباً.`,
        default: `سلام ونعمة 🌹 ${member?.full_name}`
      };
      const msg = messages[template] || messages.default;
      // log only — actual WhatsApp send is in whatsapp.js
      return { whatsapp_queued: true, message: msg, to: member?.phone || member?.parent_phone };
    },
    wait(step){ return { waited_hours: step.delay_hours }; },
    notify(step, ctx){
      Notify.toUser(step.to, 'workflow','إشعار Workflow', ctx.reason, 'workflows.html');
      return { notified: step.to };
    }
  };

  /* === RUNNER === */
  function runAction(action){
    const triggered = (Detectors[action.trigger_type] || (()=>[]))(action.trigger_config||{});
    triggered.forEach(target => {
      const member = target.member_id ? target : (target.user ? DB.find('members', m => m.member_id===target.user.member_id) : target);
      const wf = DB.insert('workflow_history', {
        action_id: action.action_id,
        target_type: 'member',
        target_id: member?.member_id,
        current_step: 0,
        status: 'running',
        log: [],
        started_at: new Date().toISOString()
      });
      const ctx = {
        member,
        reason: action.name,
        workflow_id: wf.workflow_id,
        escalation_level: 0
      };
      // execute step 1 immediately; wait steps are simulated by scheduling
      executeStep(action, wf, ctx, 0);
    });
  }

  function executeStep(action, wf, ctx, stepIdx){
    if (stepIdx >= action.steps.length){
      DB.update('workflow_history','workflow_id',wf.workflow_id,{ status:'completed', completed_at:new Date().toISOString() });
      return;
    }
    const step = action.steps[stepIdx];
    const exec = Executors[step.action];
    let result = { skipped:true };
    if (exec){
      try{ result = exec(step, ctx); }
      catch(e){ result = { error: e.message }; }
    }
    const log = wf.log || [];
    log.push({ step:stepIdx+1, action:step.action, at:new Date().toISOString(), result });
    DB.update('workflow_history','workflow_id',wf.workflow_id,{ log, current_step:stepIdx+1 });

    if (step.action === 'wait' && step.delay_hours){
      // demo: shorten wait to 3 seconds per simulated 24h, max 6s
      const ms = Math.min(6000, (step.delay_hours/24)*3000);
      setTimeout(()=> executeStep(action, wf, ctx, stepIdx+1), ms);
    } else {
      executeStep(action, wf, ctx, stepIdx+1);
    }
  }

  function runAll(){
    const actions = DB.filter('workflow_actions', a => a.is_active);
    actions.forEach(runAction);
  }

  /* === NOTIFY HELPER === */
  const Notify = {
    toUser(userId, type, title, body, link){
      if (!userId) return;
      const user = DB._raw('users').find(u => u.user_id===userId);
      if (!user) return;
      DB.insert('notifications', {
        church_id: user.church_id,
        user_id: userId, type, title, body, link, is_read:false
      });
    }
  };

  window.WorkflowEngine = { runAll, runAction, Detectors, Executors };
  window.Notify = Notify;
})();
