/* ============================================================
   PERFORMANCE.js — caching, memoization, pagination, skeletons,
   debounce, virtualization helpers, centralized error handling
   ============================================================ */
(function(){
  const Cache = {
    _s: new Map(),
    get(key, ttlMs, factory){
      const hit = this._s.get(key);
      if (hit && (Date.now() - hit.t) < (ttlMs||5000)) return hit.v;
      const v = factory();
      this._s.set(key, { v, t: Date.now() });
      return v;
    },
    invalidate(prefix){
      if (!prefix){ this._s.clear(); return; }
      [...this._s.keys()].forEach(k => k.startsWith(prefix) && this._s.delete(k));
    }
  };

  function memo(fn, keyFn){
    const m = new Map();
    return function(){
      const k = keyFn ? keyFn.apply(null, arguments) : JSON.stringify(arguments);
      if (m.has(k)) return m.get(k);
      const v = fn.apply(this, arguments);
      m.set(k, v);
      return v;
    };
  }

  function debounce(fn, wait){
    let t; return function(){ clearTimeout(t); const a=arguments, c=this; t=setTimeout(()=>fn.apply(c,a), wait); };
  }
  function throttle(fn, wait){
    let last=0; return function(){ const now=Date.now(); if (now-last>=wait){ last=now; fn.apply(this,arguments);} };
  }

  /* Pagination helper */
  function paginate(items, page, pageSize){
    page = Math.max(1, page|0); pageSize = pageSize||25;
    const total = items.length, pages = Math.max(1, Math.ceil(total/pageSize));
    page = Math.min(page, pages);
    return { rows: items.slice((page-1)*pageSize, page*pageSize), page, pages, total, pageSize };
  }
  function pagerHtml(p, onClick){
    if (p.pages <= 1) return '';
    let out = `<div class="flex-between" style="margin-top:.75rem;font-size:.85rem;color:var(--text2)">
      <div>صفحة <b>${p.page}</b> / ${p.pages} — إجمالي ${p.total}</div>
      <div style="display:flex;gap:.25rem">`;
    out += `<button class="btn btn-ghost btn-sm" ${p.page<=1?'disabled':''} onclick="${onClick}(${p.page-1})">‹</button>`;
    out += `<button class="btn btn-ghost btn-sm" ${p.page>=p.pages?'disabled':''} onclick="${onClick}(${p.page+1})">›</button>`;
    out += `</div></div>`;
    return out;
  }

  /* Skeleton helpers */
  function skel(count, type){
    type = type || 'line';
    return Array.from({length:count}).map(()=>`<div class="skel skel-${type}"></div>`).join('');
  }

  /* Centralized error handling */
  function safe(fn, fallback){
    try { return fn(); } catch(e){ console.warn('[safe]', e); return fallback; }
  }
  window.addEventListener('error', e => {
    try { window.UI && UI.toast && UI.toast('حدث خطأ غير متوقع — تم تسجيله','error'); } catch(_){}
    console.error('[global error]', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', e => {
    console.error('[unhandled promise]', e.reason);
  });

  /* requestIdle wrapper */
  const idle = window.requestIdleCallback || (cb => setTimeout(()=>cb({timeRemaining:()=>50}),1));

  window.Perf = { Cache, memo, debounce, throttle, paginate, pagerHtml, skel, safe, idle };
})();
