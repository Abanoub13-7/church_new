/* ============================================================
   WHITE-LABEL.js  —  Phase 5
   Per-tenant branding · subdomain · preview
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(a){ localStorage.setItem('church_db_v1', JSON.stringify(a)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9); }
  function now(){ return new Date().toISOString(); }
  function ensure(){
    const a=root(); if (!Array.isArray(a.tenant_branding)) a.tenant_branding=[]; save(a);
  }

  const DEFAULT = {
    primary_color:'#2563eb', accent_color:'#7c3aed', logo_url:'',
    header_text:'منصة الكنيسة', welcome_message:'أهلاً بك',
    login_bg:'', subdomain:'', published:false
  };

  const WL = {
    get(cid){
      ensure();
      const row = root().tenant_branding.find(b=>b.church_id===cid);
      return row || { ...DEFAULT, church_id:cid };
    },
    save(cid, patch, publish){
      ensure();
      const all = root();
      let row = all.tenant_branding.find(b=>b.church_id===cid);
      if (!row){ row = { branding_id:uid('brd'), church_id:cid, ...DEFAULT, created_at:now() }; all.tenant_branding.push(row); }
      Object.assign(row, patch, { updated_at: now() });
      if (publish) row.published = true;
      save(all);
      Audit?.log('whitelabel.saved',{ church_id:cid, publish:!!publish });
      // apply live if current tenant
      const s = Auth?.session?.();
      if (s && s.church_id===cid && publish) WL.applyToDocument(row);
      return row;
    },
    publish(cid){ return WL.save(cid, {}, true); },
    unpublish(cid){
      const all = root(); const r = all.tenant_branding.find(b=>b.church_id===cid);
      if (r){ r.published=false; save(all); }
    },
    applyToDocument(b){
      try{
        const root = document.documentElement;
        if (b.primary_color) root.style.setProperty('--primary', b.primary_color);
        if (b.accent_color)  root.style.setProperty('--accent', b.accent_color);
      }catch(_){}
    },
    applyForCurrent(){
      const s = Auth?.session?.(); if (!s || !s.church_id) return;
      const b = WL.get(s.church_id);
      if (b && b.published) WL.applyToDocument(b);
    },
    subdomainURL(b){
      if (!b.subdomain) return '';
      return `https://${b.subdomain}.platform.com`;
    }
  };
  ensure();
  window.WhiteLabel = WL;
  document.addEventListener('DOMContentLoaded', () => { try{ WL.applyForCurrent(); }catch(_){} });
})();
