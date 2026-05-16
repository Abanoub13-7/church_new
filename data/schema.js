/* ============================================================
   CHURCH MEGA PLATFORM — DATABASE SCHEMA
   Multi-Tenant SaaS Architecture
   كل جدول يحتوي على church_id لعزل البيانات
   ============================================================ */

window.SCHEMA = {

  /* ===== CHURCHES (Tenant Root) ===== */
  churches: {
    fields: {
      church_id:           { type: 'uuid', pk: true },
      church_name:         { type: 'string', required: true },
      church_code:         { type: 'string', unique: true },
      church_logo:         { type: 'string' },
      subscription_plan:   { type: 'enum', values: ['free','basic','pro','enterprise'] },
      subscription_status: { type: 'enum', values: ['active','trial','suspended','cancelled'] },
      subscription_expires_at: { type: 'datetime' },
      church_admin_id:     { type: 'uuid', ref: 'users.user_id' },
      created_at:          { type: 'datetime' }
    }
  },

  /* ===== USERS (Login Accounts Only) ===== */
  users: {
    fields: {
      user_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id', nullable: true }, // optional link
      full_name:     { type: 'string', required: true },
      email:         { type: 'string', unique: true },
      phone:         { type: 'string' },
      password_hash: { type: 'string' },
      role:          { type: 'enum', values: ['super_admin','church_admin','service_admin','servant','supervisor','finance','viewer'] },
      permissions:   { type: 'json' }, // granular overrides
      is_active:     { type: 'boolean', default: true },
      last_login:    { type: 'datetime' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== MEMBERS (Served People — May NOT have login) ===== */
  members: {
    fields: {
      member_id:           { type: 'uuid', pk: true },
      church_id:           { type: 'uuid', ref: 'churches.church_id', required: true },
      full_name:           { type: 'string', required: true },
      gender:              { type: 'enum', values: ['male','female'] },
      birth_date:          { type: 'date' },
      age_stage:           { type: 'enum', values: ['nursery','kg','primary','preparatory','secondary','university','youth','adult','senior'] },
      phone:               { type: 'string' },
      parent_phone:        { type: 'string' },
      address:             { type: 'string' },
      spiritual_father:    { type: 'string' },
      confession_status:   { type: 'enum', values: ['regular','irregular','none'] },
      service_class_id:    { type: 'uuid', ref: 'service_classes.class_id' },
      school:              { type: 'string' },
      university:          { type: 'string' },
      job:                 { type: 'string' },
      health_notes:        { type: 'text' },
      notes:               { type: 'text' },
      qr_code:             { type: 'string', unique: true },
      member_status:       { type: 'enum', values: ['active','inactive','new','at_risk','left'] },
      first_visit_at:      { type: 'datetime' },
      created_at:          { type: 'datetime' }
    }
  },

  /* ===== SERVICE CLASSES ===== */
  service_classes: {
    fields: {
      class_id:       { type: 'uuid', pk: true },
      church_id:      { type: 'uuid', ref: 'churches.church_id', required: true },
      class_name:     { type: 'string' },
      age_stage:      { type: 'string' },
      supervisor_id:  { type: 'uuid', ref: 'users.user_id' },
      created_at:     { type: 'datetime' }
    }
  },

  /* ===== SERVANT ASSIGNMENTS ===== */
  servant_assignments: {
    fields: {
      assignment_id: { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      class_id:      { type: 'uuid', ref: 'service_classes.class_id' },
      role:          { type: 'string' },
      assigned_at:   { type: 'datetime' },
      active:        { type: 'boolean', default: true }
    }
  },

  /* ===== ATTENDANCE SESSIONS (any activity) ===== */
  attendance_sessions: {
    fields: {
      session_id:    { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      activity_type: { type: 'enum', values: [
        'mass','meeting','sunday_school','conference','trip','retreat',
        'service','choir','bible_study','youth_activity','servants_meeting',
        'confession','individual_followup'
      ]},
      title:         { type: 'string' },
      class_id:      { type: 'uuid', ref: 'service_classes.class_id', nullable: true },
      event_id:      { type: 'uuid', ref: 'events.event_id', nullable: true },
      starts_at:     { type: 'datetime' },
      ends_at:       { type: 'datetime' },
      late_after_min:{ type: 'int', default: 15 },
      created_by:    { type: 'uuid', ref: 'users.user_id' },
      status:        { type: 'enum', values: ['scheduled','open','closed'] }
    }
  },

  /* ===== ATTENDANCE RECORDS ===== */
  attendance_records: {
    fields: {
      record_id:     { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      session_id:    { type: 'uuid', ref: 'attendance_sessions.session_id' },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      check_in_at:   { type: 'datetime' },
      check_in_method:{ type: 'enum', values: ['qr','manual','group','family','face'] },
      is_late:       { type: 'boolean' },
      checked_by:    { type: 'uuid', ref: 'users.user_id' },
      notes:         { type: 'string' }
    },
    constraints: ['UNIQUE(session_id, member_id)'] // duplicate prevention
  },

  /* ===== EVENTS ===== */
  events: {
    fields: {
      event_id:      { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      title:         { type: 'string' },
      description:   { type: 'text' },
      event_type:    { type: 'string' },
      starts_at:     { type: 'datetime' },
      ends_at:       { type: 'datetime' },
      location:      { type: 'string' },
      capacity:      { type: 'int' },
      price:         { type: 'decimal' },
      has_waiting_list:{ type: 'boolean', default: true },
      status:        { type: 'enum', values: ['draft','open','full','closed','cancelled'] },
      created_by:    { type: 'uuid', ref: 'users.user_id' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== EVENT BOOKINGS ===== */
  event_bookings: {
    fields: {
      booking_id:    { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:      { type: 'uuid', ref: 'events.event_id' },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      booking_status:{ type: 'enum', values: ['confirmed','waiting','cancelled','attended','no_show'] },
      bus_number:    { type: 'string', nullable: true },
      room_number:   { type: 'string', nullable: true },
      payment_status:{ type: 'enum', values: ['unpaid','partial','paid','refunded'] },
      qr_ticket:     { type: 'string' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== FOLLOWUP TASKS ===== */
  followup_tasks: {
    fields: {
      task_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      assigned_to:   { type: 'uuid', ref: 'users.user_id' },
      created_by:    { type: 'string' }, // 'system' or user_id
      reason:        { type: 'string' }, // e.g. "3 consecutive absences"
      priority:      { type: 'enum', values: ['low','medium','high','urgent'] },
      due_at:        { type: 'datetime' },
      status:        { type: 'enum', values: ['open','in_progress','done','escalated','cancelled'] },
      escalation_level:{ type: 'int', default: 0 },
      workflow_id:   { type: 'uuid', ref: 'workflow_history.workflow_id', nullable: true },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== FOLLOWUP LOGS ===== */
  followup_logs: {
    fields: {
      log_id:        { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      task_id:       { type: 'uuid', ref: 'followup_tasks.task_id' },
      action:        { type: 'enum', values: ['called','visited','whatsapp','no_response','completed','escalated'] },
      result:        { type: 'text' },
      performed_by:  { type: 'uuid', ref: 'users.user_id' },
      performed_at:  { type: 'datetime' }
    }
  },

  /* ===== NOTIFICATIONS ===== */
  notifications: {
    fields: {
      notification_id:{ type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      type:          { type: 'enum', values: ['info','warning','alert','task','workflow','ai_insight'] },
      title:         { type: 'string' },
      body:          { type: 'text' },
      link:          { type: 'string' },
      is_read:       { type: 'boolean', default: false },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== FINANCIAL TRANSACTIONS ===== */
  financial_transactions: {
    fields: {
      transaction_id:{ type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      type:          { type: 'enum', values: ['donation','tithe','event_payment','expense','salary','other'] },
      amount:        { type: 'decimal' },
      currency:      { type: 'string', default: 'EGP' },
      category:      { type: 'string' },
      description:   { type: 'text' },
      member_id:     { type: 'uuid', ref: 'members.member_id', nullable: true },
      event_id:      { type: 'uuid', ref: 'events.event_id', nullable: true },
      payment_method:{ type: 'enum', values: ['cash','bank','online','other'] },
      recorded_by:   { type: 'uuid', ref: 'users.user_id' },
      transaction_date:{ type: 'datetime' }
    }
  },

  /* ===== MEMBER NOTES ===== */
  member_notes: {
    fields: {
      note_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      note_type:     { type: 'enum', values: ['spiritual','social','health','general','confidential'] },
      content:       { type: 'text' },
      visibility:    { type: 'enum', values: ['public','servants','admin','confessor_only'] },
      created_by:    { type: 'uuid', ref: 'users.user_id' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== MEMBER RISK SCORES (AI) ===== */
  member_risk_scores: {
    fields: {
      score_id:      { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      risk_level:    { type: 'enum', values: ['low','medium','high','critical'] },
      score:         { type: 'int' }, // 0-100
      factors:       { type: 'json' }, // breakdown of contributing factors
      recommendation:{ type: 'text' },
      computed_at:   { type: 'datetime' }
    }
  },

  /* ===== WORKFLOW ACTIONS (rule definitions) ===== */
  workflow_actions: {
    fields: {
      action_id:     { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      name:          { type: 'string' },
      trigger_type:  { type: 'enum', values: [
        'absence_streak','first_visit','servant_inactive','event_full',
        'low_attendance','risk_change','manual'
      ]},
      trigger_config:{ type: 'json' },
      steps:         { type: 'json' }, // array of {action, delay, assignTo, ...}
      is_active:     { type: 'boolean', default: true },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== WORKFLOW HISTORY ===== */
  workflow_history: {
    fields: {
      workflow_id:   { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      action_id:     { type: 'uuid', ref: 'workflow_actions.action_id' },
      target_type:   { type: 'enum', values: ['member','user','event','task'] },
      target_id:     { type: 'uuid' },
      current_step:  { type: 'int', default: 0 },
      status:        { type: 'enum', values: ['running','completed','failed','escalated','cancelled'] },
      log:           { type: 'json' }, // array of step results
      started_at:    { type: 'datetime' },
      completed_at:  { type: 'datetime', nullable: true }
    }
  },

  /* ===== CHURCH SETTINGS ===== */
  church_settings: {
    fields: {
      church_id:           { type: 'uuid', pk: true, ref: 'churches.church_id' },
      timezone:            { type: 'string', default: 'Africa/Cairo' },
      language:            { type: 'string', default: 'ar' },
      week_start:          { type: 'string', default: 'sunday' },
      whatsapp_enabled:    { type: 'boolean' },
      whatsapp_api_key:    { type: 'string' },
      ai_enabled:          { type: 'boolean', default: true },
      absence_threshold:   { type: 'int', default: 3 },
      risk_recalc_interval:{ type: 'string', default: 'daily' },
      theme:               { type: 'enum', values: ['light','dark','auto'] }
    }
  },

  /* ===== AUDIT LOGS ===== */
  audit_logs: {
    fields: {
      log_id:        { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      action:        { type: 'string' }, // 'create','update','delete','login','export'
      entity_type:   { type: 'string' },
      entity_id:     { type: 'uuid' },
      changes:       { type: 'json' },
      ip_address:    { type: 'string' },
      user_agent:    { type: 'string' },
      created_at:    { type: 'datetime' }
    }
  }
};
