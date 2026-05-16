/* Mock data seeded into LocalStorage on first load */
window.MOCK_DATA = {
  churches: [
    { church_id:'ch-001', church_name:'كنيسة السيدة العذراء', church_code:'STM-001', church_logo:'', subscription_plan:'pro', subscription_status:'active', church_admin_id:'usr-001', created_at:'2024-01-15T10:00:00Z' },
    { church_id:'ch-002', church_name:'كنيسة الأنبا أنطونيوس', church_code:'STA-002', church_logo:'', subscription_plan:'basic', subscription_status:'trial', church_admin_id:'usr-010', created_at:'2024-06-20T10:00:00Z' },
    { church_id:'ch-003', church_name:'كنيسة الشهيد مارجرجس', church_code:'STG-003', church_logo:'', subscription_plan:'enterprise', subscription_status:'active', church_admin_id:'usr-020', created_at:'2023-09-01T10:00:00Z' }
  ],

  users: [
    { user_id:'usr-super', church_id:null, full_name:'مدير المنصة', email:'super@platform.local', password_hash:'super123', role:'super_admin', is_active:true, created_at:'2024-01-01T00:00:00Z' },
    { user_id:'usr-001', church_id:'ch-001', member_id:'mem-001', full_name:'الأب يوحنا', email:'admin@church.local', password_hash:'admin123', role:'church_admin', is_active:true, created_at:'2024-01-15T10:00:00Z' },
    { user_id:'usr-002', church_id:'ch-001', member_id:'mem-002', full_name:'مينا عاطف', email:'mina@church.local', password_hash:'mina123', role:'servant', is_active:true, created_at:'2024-02-01T10:00:00Z' },
    { user_id:'usr-003', church_id:'ch-001', member_id:'mem-003', full_name:'مريم سمير', email:'maryam@church.local', password_hash:'maryam123', role:'supervisor', is_active:true, created_at:'2024-02-10T10:00:00Z' },
    { user_id:'usr-004', church_id:'ch-001', full_name:'أمين الخدمة', email:'service@church.local', password_hash:'srv123', role:'service_admin', is_active:true, created_at:'2024-01-20T10:00:00Z' }
  ],

  service_classes: [
    { class_id:'cls-001', church_id:'ch-001', class_name:'الابتدائي - بنين', age_stage:'primary', supervisor_id:'usr-002' },
    { class_id:'cls-002', church_id:'ch-001', class_name:'الإعدادي - بنات', age_stage:'preparatory', supervisor_id:'usr-003' },
    { class_id:'cls-003', church_id:'ch-001', class_name:'الثانوي', age_stage:'secondary', supervisor_id:'usr-003' },
    { class_id:'cls-004', church_id:'ch-001', class_name:'الجامعة', age_stage:'university', supervisor_id:'usr-004' }
  ],

  members: [
    { member_id:'mem-001', church_id:'ch-001', full_name:'الأب يوحنا الكاهن', gender:'male', age_stage:'adult', phone:'01000000001', member_status:'active', qr_code:'QR-MEM-001' },
    { member_id:'mem-002', church_id:'ch-001', full_name:'مينا عاطف', gender:'male', age_stage:'youth', phone:'01000000002', service_class_id:'cls-001', member_status:'active', qr_code:'QR-MEM-002' },
    { member_id:'mem-003', church_id:'ch-001', full_name:'مريم سمير', gender:'female', age_stage:'youth', phone:'01000000003', service_class_id:'cls-002', member_status:'active', qr_code:'QR-MEM-003' },
    { member_id:'mem-004', church_id:'ch-001', full_name:'كيرلس وائل', gender:'male', age_stage:'primary', parent_phone:'01000000004', service_class_id:'cls-001', member_status:'at_risk', qr_code:'QR-MEM-004' },
    { member_id:'mem-005', church_id:'ch-001', full_name:'ماريا جورج', gender:'female', age_stage:'primary', parent_phone:'01000000005', service_class_id:'cls-001', member_status:'active', qr_code:'QR-MEM-005' },
    { member_id:'mem-006', church_id:'ch-001', full_name:'بيشوي ناجي', gender:'male', age_stage:'preparatory', parent_phone:'01000000006', service_class_id:'cls-002', member_status:'new', first_visit_at:new Date(Date.now()-7*864e5).toISOString(), qr_code:'QR-MEM-006' },
    { member_id:'mem-007', church_id:'ch-001', full_name:'يوستينا ميلاد', gender:'female', age_stage:'secondary', phone:'01000000007', service_class_id:'cls-003', member_status:'active', qr_code:'QR-MEM-007' },
    { member_id:'mem-008', church_id:'ch-001', full_name:'مارك سامح', gender:'male', age_stage:'university', phone:'01000000008', service_class_id:'cls-004', member_status:'inactive', qr_code:'QR-MEM-008' }
  ],

  attendance_sessions: [
    { session_id:'ses-001', church_id:'ch-001', activity_type:'mass', title:'قداس الأحد', starts_at:new Date(Date.now()-7*864e5).toISOString(), status:'closed' },
    { session_id:'ses-002', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-7*864e5).toISOString(), status:'closed' },
    { session_id:'ses-003', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-14*864e5).toISOString(), status:'closed' },
    { session_id:'ses-004', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-21*864e5).toISOString(), status:'closed' }
  ],

  attendance_records: [
    { record_id:'rec-001', church_id:'ch-001', session_id:'ses-002', member_id:'mem-005', check_in_at:new Date(Date.now()-7*864e5).toISOString(), check_in_method:'qr', is_late:false },
    { record_id:'rec-002', church_id:'ch-001', session_id:'ses-003', member_id:'mem-005', check_in_at:new Date(Date.now()-14*864e5).toISOString(), check_in_method:'qr', is_late:false }
  ],

  events: [
    { event_id:'evt-001', church_id:'ch-001', title:'مؤتمر الشباب الصيفي', event_type:'conference', starts_at:new Date(Date.now()+30*864e5).toISOString(), location:'دير الأنبا بيشوي', capacity:100, price:500, status:'open' },
    { event_id:'evt-002', church_id:'ch-001', title:'رحلة الإسكندرية', event_type:'trip', starts_at:new Date(Date.now()+14*864e5).toISOString(), location:'الإسكندرية', capacity:50, price:300, status:'open' }
  ],

  event_bookings: [],
  followup_tasks: [
    { task_id:'tsk-001', church_id:'ch-001', member_id:'mem-004', assigned_to:'usr-002', created_by:'system', reason:'غياب 3 مرات متتالية عن مدارس الأحد', priority:'high', due_at:new Date(Date.now()+2*864e5).toISOString(), status:'open', escalation_level:0, created_at:new Date().toISOString() }
  ],
  followup_logs: [],
  notifications: [
    { notification_id:'ntf-001', church_id:'ch-001', user_id:'usr-002', type:'task', title:'مهمة افتقاد جديدة', body:'كيرلس وائل غاب 3 مرات', is_read:false, created_at:new Date().toISOString() }
  ],
  financial_transactions: [
    { transaction_id:'fin-001', church_id:'ch-001', type:'donation', amount:500, currency:'EGP', category:'عشور', payment_method:'cash', transaction_date:new Date().toISOString() },
    { transaction_id:'fin-002', church_id:'ch-001', type:'event_payment', amount:300, currency:'EGP', event_id:'evt-002', member_id:'mem-007', payment_method:'cash', transaction_date:new Date().toISOString() }
  ],
  servant_assignments: [
    { assignment_id:'asn-001', church_id:'ch-001', user_id:'usr-002', class_id:'cls-001', role:'خادم رئيسي', active:true }
  ],
  member_notes: [],
  member_risk_scores: [],
  workflow_actions: [
    { action_id:'wfa-001', church_id:'ch-001', name:'افتقاد بعد 3 غيابات متتالية', trigger_type:'absence_streak', trigger_config:{ count:3 }, steps:[
      { step:1, action:'create_task', assignTo:'class_servant', priority:'high' },
      { step:2, action:'wait', delay_hours:48 },
      { step:3, action:'escalate', to:'supervisor' },
      { step:4, action:'wait', delay_hours:72 },
      { step:5, action:'escalate', to:'service_admin' }
    ], is_active:true },
    { action_id:'wfa-002', church_id:'ch-001', name:'ترحيب بزائر جديد', trigger_type:'first_visit', trigger_config:{}, steps:[
      { step:1, action:'create_task', assignTo:'class_servant', priority:'medium', note:'متابعة زائر جديد' },
      { step:2, action:'send_whatsapp', template:'welcome' },
      { step:3, action:'wait', delay_hours:168 },
      { step:4, action:'create_task', assignTo:'class_servant', note:'متابعة بعد أسبوع' }
    ], is_active:true }
  ],
  workflow_history: [],
  church_settings: [
    { church_id:'ch-001', timezone:'Africa/Cairo', language:'ar', week_start:'sunday', ai_enabled:true, absence_threshold:3, theme:'auto' }
  ],
  audit_logs: []
};
