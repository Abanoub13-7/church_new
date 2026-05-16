/* ============================================================
   ATTENDANCE.js — Multi-Activity Attendance Engine
   ============================================================ */
(function(){
  const ACTIVITY_TYPES = {
    mass:               { label:'قداس',           icon:'fa-church',       color:'purple', late_after:15 },
    meeting:            { label:'اجتماع',         icon:'fa-people-group', color:'blue',   late_after:10 },
    sunday_school:      { label:'مدارس أحد',     icon:'fa-book-open',    color:'green',  late_after:10 },
    conference:         { label:'مؤتمر',          icon:'fa-podcast',      color:'orange', late_after:30 },
    trip:               { label:'رحلة',           icon:'fa-bus',          color:'teal',   late_after:30 },
    retreat:            { label:'خلوة',           icon:'fa-mountain',     color:'purple', late_after:60 },
    service:            { label:'خدمة',           icon:'fa-hands-helping',color:'green' },
    choir:              { label:'كورال',          icon:'fa-music',        color:'pink' },
    bible_study:        { label:'درس كتاب',       icon:'fa-bible',        color:'blue' },
    youth_activity:     { label:'نشاط شباب',     icon:'fa-fire',         color:'orange' },
    servants_meeting:   { label:'اجتماع خدام',   icon:'fa-user-tie',     color:'purple' },
    confession:         { label:'اعتراف',         icon:'fa-cross',        color:'blue' },
    individual_followup:{ label:'متابعة فردية',  icon:'fa-user-check',   color:'green' }
  };

  const Attendance = {
    ACTIVITY_TYPES,

    createSession(data){
      if (!Permissions.guard('attendance.record')) return null;
      const def = ACTIVITY_TYPES[data.activity_type] || {};
      return DB.insert('attendance_sessions', {
        activity_type: data.activity_type,
        title: data.title || def.label,
        class_id: data.class_id || null,
        event_id: data.event_id || null,
        starts_at: data.starts_at || new Date().toISOString(),
        ends_at: data.ends_at || null,
        late_after_min: data.late_after_min ?? def.late_after ?? 15,
        status: 'open'
      });
    },

    checkIn(sessionId, memberId, method='manual', checkedBy=null){
      const session = DB.byId('attendance_sessions','session_id',sessionId);
      if (!session) return { ok:false, error:'الجلسة غير موجودة' };
      const member = DB.byId('members','member_id',memberId);
      if (!member) return { ok:false, error:'المخدوم غير موجود' };

      // Duplicate prevention
      const existing = DB.find('attendance_records', r => r.session_id===sessionId && r.member_id===memberId);
      if (existing) return { ok:false, error:'تم تسجيل الحضور مسبقاً', duplicate:true };

      // Late detection
      const startTime = new Date(session.starts_at).getTime();
      const lateAfter = (session.late_after_min || 15) * 60000;
      const is_late = Date.now() > (startTime + lateAfter);

      const record = DB.insert('attendance_records', {
        session_id: sessionId,
        member_id: memberId,
        check_in_at: new Date().toISOString(),
        check_in_method: method,
        is_late,
        checked_by: checkedBy || Auth.session()?.user_id
      });

      // Update member status if new
      if (member.member_status === 'new' && !member.first_visit_at){
        DB.update('members','member_id',memberId,{ first_visit_at: new Date().toISOString() });
      }

      return { ok:true, record, is_late };
    },

    checkInByQR(qrCode, sessionId, method='qr'){
      const member = DB.find('members', m => m.qr_code === qrCode);
      if (!member) return { ok:false, error:'كود QR غير معروف' };
      return Attendance.checkIn(sessionId, member.member_id, method);
    },

    groupCheckIn(sessionId, memberIds, method='group'){
      const results = memberIds.map(id => ({
        member_id: id,
        ...Attendance.checkIn(sessionId, id, method)
      }));
      return { ok:true, results, total:results.length, success: results.filter(r=>r.ok).length };
    },

    closeSession(sessionId){
      const session = DB.byId('attendance_sessions','session_id',sessionId);
      if (!session) return null;
      DB.update('attendance_sessions','session_id',sessionId,{ status:'closed' });

      // Auto-mark no-shows for event bookings
      if (session.event_id){
        const bookings = DB.filter('event_bookings', b => b.event_id===session.event_id && b.booking_status==='confirmed');
        bookings.forEach(b => {
          const attended = DB.find('attendance_records', r => r.session_id===sessionId && r.member_id===b.member_id);
          if (!attended) DB.update('event_bookings','booking_id',b.booking_id,{ booking_status:'no_show' });
          else DB.update('event_bookings','booking_id',b.booking_id,{ booking_status:'attended' });
        });
      }
      return session;
    },

    /* === ANALYTICS === */
    sessionStats(sessionId){
      const records = DB.filter('attendance_records', r => r.session_id===sessionId);
      return {
        total: records.length,
        on_time: records.filter(r=>!r.is_late).length,
        late: records.filter(r=>r.is_late).length,
        by_method: records.reduce((a,r)=>{ a[r.check_in_method]=(a[r.check_in_method]||0)+1; return a; },{})
      };
    },

    memberStats(memberId, days=90){
      const cutoff = Date.now() - days*864e5;
      const records = DB.filter('attendance_records', r => r.member_id===memberId && new Date(r.check_in_at).getTime() >= cutoff);
      const sessions = DB.filter('attendance_sessions', s => new Date(s.starts_at).getTime() >= cutoff);
      // Filter sessions relevant to this member's class
      const member = DB.byId('members','member_id',memberId);
      const relevant = sessions.filter(s => !s.class_id || s.class_id === member?.service_class_id || s.activity_type==='mass');
      return {
        attended: records.length,
        possible: relevant.length,
        rate: relevant.length ? Math.round(records.length/relevant.length*100) : 0,
        late_count: records.filter(r=>r.is_late).length
      };
    },

    classStats(classId, days=90){
      const cutoff = Date.now() - days*864e5;
      const members = DB.filter('members', m => m.service_class_id===classId);
      const sessions = DB.filter('attendance_sessions', s => s.class_id===classId && new Date(s.starts_at).getTime()>=cutoff);
      if (members.length===0 || sessions.length===0) return { rate:0, members:members.length, sessions:sessions.length };
      let total=0, attended=0;
      members.forEach(m => sessions.forEach(s => {
        total++;
        if (DB.find('attendance_records', r => r.session_id===s.session_id && r.member_id===m.member_id)) attended++;
      }));
      return { rate: Math.round(attended/total*100), members:members.length, sessions:sessions.length, attended };
    },

    mostAbsent(limit=10){
      const members = DB.all('members');
      const scored = members.map(m => ({ member:m, stats:Attendance.memberStats(m.member_id,60) }));
      return scored.filter(s => s.stats.possible>0).sort((a,b)=>a.stats.rate-b.stats.rate).slice(0,limit);
    }
  };
  window.Attendance = Attendance;
})();
