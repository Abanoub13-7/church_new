/* ============================================================
   EVENT-WORKFLOW-ENGINE.js — Event lifecycle → Workflows / Tasks
   Hooks into WorkflowEngine and Permissions
   ============================================================ */
(function(){

  function assignTask({ event_id, title, role, assigned_to, due_at }){
    return DB.insert('event_tasks', {
      event_id, title, role,
      assigned_to: assigned_to||null,
      due_at: due_at || null,
      status:'open', escalation_level:0
    });
  }

  function completeTask(taskId){
    DB.update('event_tasks','task_id',taskId,{ status:'done', completed_at:new Date().toISOString() });
    Audit.log('event.task.complete',{ task_id:taskId });
  }

  function escalateOverdueTasks(){
    const now = Date.now();
    DB.filter('event_tasks', t => t.status==='open' && t.due_at && new Date(t.due_at).getTime() < now)
      .forEach(t => {
        const lvl = (t.escalation_level||0)+1;
        DB.update('event_tasks','task_id',t.task_id,{ escalation_level:lvl, status: lvl>=3?'escalated':'open' });
        if (window.EventNotificationEngine) EventNotificationEngine.onTaskOverdue(t);
      });
  }

  /* === LIFECYCLE HOOKS === */
  function onLifecycleChange(eventId, from, to){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;

    if (to === 'review') {
      // notify church admins for approval
      DB.filter('users', u => ['church_admin','service_admin'].includes(u.role)).forEach(u =>
        Notify.toUser(u.user_id,'approval','اعتماد فعالية مطلوب',`فعالية ${ev.title} بانتظار الاعتماد`,'events.html'));
    }
    if (to === 'published' || to === 'reg_open') {
      // ensure default tasks exist from template
      const tpl = ev.template_id ? DB.byId('event_templates','template_id',ev.template_id) : null;
      if (tpl?.defaults?.tasks) {
        tpl.defaults.tasks.forEach(t => {
          if (!DB.find('event_tasks', x => x.event_id===eventId && x.title===t.title)) {
            assignTask({ event_id:eventId, title:t.title, role:t.role });
          }
        });
      }
    }
    if (to === 'completed') {
      // Mark no-shows + trigger follow-up workflow for absentees
      const bookings = DB.filter('event_bookings', b => b.event_id===eventId);
      bookings.filter(b => ['confirmed','approved'].includes(b.booking_status))
        .forEach(b => DB.update('event_bookings','booking_id',b.booking_id,{ booking_status:'no_show' }));
      // create follow-up tasks for no-shows
      bookings.filter(b => b.booking_status==='no_show').forEach(b => {
        DB.insert('followup_tasks', {
          member_id: b.member_id,
          assigned_to: null,
          created_by: 'event-engine',
          reason: `لم يحضر فعالية: ${ev.title}`,
          priority:'medium',
          due_at: new Date(Date.now()+3*864e5).toISOString(),
          status:'open', escalation_level:0
        });
      });
    }
  }

  /* === REGISTRATION HOOKS === */
  function onRegistered(booking, ev){
    // Assign servant follow-up for new registrations
    const servants = DB.filter('users', u => ['servant','servant_leader','supervisor'].includes(u.role));
    if (servants.length) {
      const s = servants[Math.floor(Math.random()*servants.length)];
      assignTask({
        event_id: ev.event_id,
        title: `متابعة تسجيل: ${(DB.byId('members','member_id',booking.member_id)||{}).full_name||''}`,
        role: 'servant',
        assigned_to: s.user_id,
        due_at: new Date(Date.now()+2*864e5).toISOString()
      });
    }
  }

  /* === APPROVAL CHAIN === */
  function requestEventApproval(eventId){
    return EventEngine.transition(eventId,'review');
  }
  function requestBudgetApproval(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev || !ev.budget_id) throw new Error('لا توجد ميزانية');
    DB.update('event_budgets','budget_id',ev.budget_id,{ approval_status:'pending' });
    DB.filter('users', u => ['church_admin','finance','financial_manager'].includes(u.role)).forEach(u =>
      Notify.toUser(u.user_id,'approval','اعتماد ميزانية فعالية',`${ev.title}`,'events.html'));
    Audit.log('event.budget.submit',{ event_id:eventId });
  }
  function approveBudget(budgetId){
    const b = DB.byId('event_budgets','budget_id',budgetId);
    if (!b) return;
    DB.update('event_budgets','budget_id',budgetId,{
      approval_status:'approved',
      approved_total: b.estimated_total,
      approved_by:(Auth.session()||{}).user_id,
      approved_at:new Date().toISOString()
    });
    Audit.log('event.budget.approve',{ budget_id:budgetId });
  }

  window.EventWorkflowEngine = {
    assignTask, completeTask, escalateOverdueTasks,
    onLifecycleChange, onRegistered,
    requestEventApproval, requestBudgetApproval, approveBudget
  };
})();
