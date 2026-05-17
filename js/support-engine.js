/* ============================================================
   SUPPORT-ENGINE.js  —  Phase 6
   Tickets · workflow · assignments · analytics · KB
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(a){ localStorage.setItem('church_db_v1', JSON.stringify(a)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9); }
  function now(){ return new Date().toISOString(); }
  function ensure(){
    const a=root();
    ['support_tickets','ticket_messages','kb_articles','ticket_assignments'].forEach(t=>{ if(!Array.isArray(a[t])) a[t]=[]; });
    if (!a.kb_articles.length){
      a.kb_articles = [
        kb('بداية الاستخدام','onboarding','# مرحباً بك\n\nاتبع الخطوات أدناه لإعداد كنيستك على المنصة.'),
        kb('كيف أضيف مخدوماً جديداً؟','faq','افتح صفحة المخدومين ثم اضغط "إضافة جديد"...'),
        kb('استكشاف أخطاء تسجيل الدخول','troubleshooting','تأكد من تفعيل الحساب والمتصفح يدعم localStorage.'),
        kb('دليل الاشتراكات','guide','تعرف على خطط الاشتراك وكيفية الترقية والتجديد.')
      ];
    }
    save(a);
  }
  function kb(title,cat,body){ return { article_id:uid('kb'), title, category:cat, body, views:0, created_at:now() }; }

  const Support = {
    /* TICKETS */
    list(filter){
      ensure();
      const s = Auth?.session?.();
      let rows = root().support_tickets||[];
      if (s && s.role!=='super_admin') rows = rows.filter(r=>r.church_id===s.church_id);
      if (filter?.status) rows = rows.filter(r=>r.status===filter.status);
      if (filter?.priority) rows = rows.filter(r=>r.priority===filter.priority);
      if (filter?.church_id) rows = rows.filter(r=>r.church_id===filter.church_id);
      return rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
    },
    get(id){ ensure(); return (root().support_tickets||[]).find(t=>t.ticket_id===id); },
    create({ subject, body, type, priority, church_id }){
      ensure();
      const s = Auth?.session?.();
      const all = root();
      const t = {
        ticket_id: uid('tkt'), ticket_number:'TKT-'+Date.now().toString(36).toUpperCase(),
        church_id: church_id || s?.church_id,
        subject, type:type||'support', // support|bug|feature
        priority: priority||'normal',  // low|normal|high|urgent
        status: 'open',                // open|pending|escalated|resolved|closed
        created_by: s?.user_id, created_by_name: s?.full_name,
        assigned_to: null, assigned_team: null,
        created_at: now(), updated_at: now()
      };
      all.support_tickets.push(t);
      if (body){
        all.ticket_messages.push({ msg_id:uid('msg'), ticket_id:t.ticket_id, body, author_id:s?.user_id, author_name:s?.full_name, internal:false, created_at: now() });
      }
      save(all);
      Audit?.log('support.ticket_created',{ ticket_id:t.ticket_id, subject });
      return t;
    },
    addMessage(tid, body, internal){
      const s = Auth?.session?.();
      const all = root();
      all.ticket_messages.push({ msg_id:uid('msg'), ticket_id:tid, body, author_id:s?.user_id, author_name:s?.full_name, internal:!!internal, created_at: now() });
      const t = all.support_tickets.find(x=>x.ticket_id===tid);
      if (t){ t.updated_at = now(); if (t.status==='resolved') t.status='pending'; }
      save(all);
    },
    messages(tid){ ensure(); return (root().ticket_messages||[]).filter(m=>m.ticket_id===tid).sort((a,b)=>a.created_at.localeCompare(b.created_at)); },
    setStatus(tid, status){
      const all = root();
      const t = all.support_tickets.find(x=>x.ticket_id===tid); if (!t) return;
      t.status = status;
      if (status==='resolved'||status==='closed') t.closed_at = now();
      t.updated_at = now();
      save(all);
      Audit?.log('support.ticket_status',{ ticket_id:tid, status });
    },
    assign(tid, team, user_id){
      const all = root();
      const t = all.support_tickets.find(x=>x.ticket_id===tid); if (!t) return;
      t.assigned_team = team; t.assigned_to = user_id; t.updated_at = now();
      all.ticket_assignments.push({ id:uid('asg'), ticket_id:tid, team, user_id, at:now() });
      save(all);
      Audit?.log('support.ticket_assigned',{ ticket_id:tid, team, user_id });
    },

    /* ANALYTICS */
    metrics(){
      const rows = root().support_tickets||[];
      const open = rows.filter(r=>['open','pending','escalated'].includes(r.status)).length;
      const resolved = rows.filter(r=>['resolved','closed'].includes(r.status));
      const escalated = rows.filter(r=>r.status==='escalated').length;
      let avgHours = 0;
      if (resolved.length){
        avgHours = resolved.reduce((s,r)=> s + ((new Date(r.closed_at||r.updated_at) - new Date(r.created_at))/3600000), 0) / resolved.length;
      }
      const total = rows.length;
      const satisfaction = total ? Math.round((resolved.length/total)*100) : 0;
      return { open, total, escalated, avgHours: +avgHours.toFixed(1), satisfaction, resolved: resolved.length };
    },

    /* KB */
    kbList(category){
      ensure();
      let rows = root().kb_articles||[];
      if (category) rows = rows.filter(r=>r.category===category);
      return rows.sort((a,b)=>a.title.localeCompare(b.title));
    },
    kbGet(id){ const r = (root().kb_articles||[]).find(a=>a.article_id===id); if (r){ const all=root(); const x=all.kb_articles.find(a=>a.article_id===id); x.views=(x.views||0)+1; save(all);} return r; },
    kbUpsert({ article_id, title, category, body }){
      ensure();
      const all = root();
      if (article_id){
        const r = all.kb_articles.find(a=>a.article_id===article_id);
        if (r){ r.title=title; r.category=category; r.body=body; r.updated_at=now(); save(all); return r; }
      }
      const r = kb(title,category,body); all.kb_articles.push(r); save(all);
      return r;
    },
    kbDelete(id){ const all=root(); all.kb_articles = (all.kb_articles||[]).filter(a=>a.article_id!==id); save(all); }
  };
  ensure();
  window.Support = Support;
})();
