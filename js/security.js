/* ============================================================
   SECURITY.js — Phase 1 Hardening
   ------------------------------------------------------------
   - Password hashing (PBKDF2 via WebCrypto, salted)
   - Session lifecycle (expiry, idle timeout, remember-me)
   - Failed-login tracking + temporary account lockout
   - Security event log (separate from generic audit)
   - Authorization helpers (server-style re-check on every page)
   - Backward compatible: legacy plaintext password_hash values are
     auto-migrated to PBKDF2 on first successful comparison.
   ============================================================ */
(function(){
  const SEC_KEY        = 'church_security_v1';   // failed attempts, lockouts, events
  const SESSION_KEY    = 'church_session_v1';
  const IDLE_LIMIT_MS  = 30 * 60 * 1000;         // 30 min idle = auto logout
  const ABS_LIMIT_MS   = 8  * 60 * 60 * 1000;    // 8h absolute (normal)
  const REMEMBER_MS    = 30 * 24 * 60 * 60 * 1000; // 30d remember-me
  const MAX_FAILED     = 5;
  const LOCKOUT_MS     = 15 * 60 * 1000;         // 15 min lock
  const RETRY_DELAY_MS = 800;                    // anti-burst delay

  /* ---------- storage helpers ---------- */
  function loadSec(){
    try{ return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; }
    catch(_){ return {}; }
  }
  function saveSec(s){ localStorage.setItem(SEC_KEY, JSON.stringify(s)); }

  /* ---------- crypto: PBKDF2-SHA256 ---------- */
  function buf2hex(buf){
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function hex2buf(hex){
    const a = new Uint8Array(hex.length/2);
    for (let i=0;i<a.length;i++) a[i] = parseInt(hex.substr(i*2,2),16);
    return a;
  }
  function randSalt(){
    const a = new Uint8Array(16);
    (crypto.getRandomValues || function(x){ for(let i=0;i<x.length;i++) x[i]=Math.floor(Math.random()*256);})(a);
    return buf2hex(a);
  }
  async function pbkdf2(password, saltHex, iter=50000){
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name:'PBKDF2', salt: hex2buf(saltHex), iterations: iter, hash:'SHA-256' },
      key, 256
    );
    return buf2hex(bits);
  }
  async function hashPassword(password){
    const salt = randSalt();
    const hash = await pbkdf2(password, salt);
    return `pbkdf2$50000$${salt}$${hash}`;
  }
  async function verifyPassword(password, stored){
    if (!stored) return false;
    if (typeof stored === 'string' && stored.startsWith('pbkdf2$')){
      const [, iterStr, salt, expected] = stored.split('$');
      const got = await pbkdf2(password, salt, parseInt(iterStr,10));
      // constant-time-ish compare
      if (got.length !== expected.length) return false;
      let diff = 0;
      for (let i=0;i<got.length;i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
      return diff === 0;
    }
    // legacy plaintext fallback
    return password === stored;
  }

  /* ---------- failed-login / lockout ---------- */
  function getLock(email){
    const sec = loadSec();
    return (sec.locks||{})[email] || { fails:0, locked_until:0, history:[] };
  }
  function setLock(email, lock){
    const sec = loadSec();
    sec.locks = sec.locks || {};
    sec.locks[email] = lock;
    saveSec(sec);
  }
  function isLocked(email){
    const l = getLock(email);
    return l.locked_until && Date.now() < l.locked_until;
  }
  function registerFailure(email, reason){
    const l = getLock(email);
    l.fails = (l.fails||0) + 1;
    l.history = (l.history||[]).slice(-9);
    l.history.push({ at: Date.now(), reason });
    if (l.fails >= MAX_FAILED){
      l.locked_until = Date.now() + LOCKOUT_MS;
      logEvent('login.locked', { email, severity:'critical', fails:l.fails });
    }
    setLock(email, l);
  }
  function resetFailures(email){
    setLock(email, { fails:0, locked_until:0, history:[] });
  }

  /* ---------- security event log ---------- */
  function logEvent(type, meta){
    const sec = loadSec();
    sec.events = sec.events || [];
    sec.events.push({
      id: 'sec-'+Math.random().toString(36).slice(2,10),
      type, meta: meta||{},
      severity: (meta&&meta.severity) || 'info',
      at: new Date().toISOString(),
      ua: navigator.userAgent.slice(0,140)
    });
    if (sec.events.length > 1000) sec.events = sec.events.slice(-1000);
    saveSec(sec);
    try{ window.Audit && Audit.log('security.'+type, meta); }catch(_){}
  }

  /* ---------- session ---------- */
  function readSessionRaw(){
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function writeSession(session, remember){
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  }
  function clearSession(){
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  function validateSession(){
    const s = readSessionRaw();
    if (!s) return null;
    const now = Date.now();
    if (s.expires_at && now > s.expires_at){
      logEvent('session.expired', { user_id:s.user_id });
      clearSession();
      return null;
    }
    if (s.idle_until && now > s.idle_until){
      logEvent('session.idle_timeout', { user_id:s.user_id });
      clearSession();
      return null;
    }
    return s;
  }
  function touchSession(){
    const s = readSessionRaw();
    if (!s) return;
    s.idle_until = Date.now() + IDLE_LIMIT_MS;
    s.last_activity = new Date().toISOString();
    const remember = !!localStorage.getItem(SESSION_KEY);
    writeSession(s, remember);
  }
  function listActiveSessions(){
    // single-tab model — return current session if valid
    const s = validateSession();
    return s ? [s] : [];
  }

  /* ---------- migrate legacy users to hashed pwds ---------- */
  async function migrateUserPassword(userRow, plainPassword){
    if (!userRow) return;
    if (typeof userRow.password_hash === 'string' && userRow.password_hash.startsWith('pbkdf2$')) return;
    const hashed = await hashPassword(plainPassword);
    try{
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      const users = all.users || [];
      const idx = users.findIndex(u => u.user_id === userRow.user_id);
      if (idx>=0){ users[idx].password_hash = hashed; all.users = users; localStorage.setItem('church_db_v1', JSON.stringify(all)); }
    }catch(_){}
  }

  /* ---------- idle watchdog (browser) ---------- */
  function startIdleWatchdog(){
    if (window.__idleStarted) return; window.__idleStarted = true;
    ['mousemove','keydown','click','touchstart','scroll'].forEach(ev=>{
      window.addEventListener(ev, touchSession, { passive:true });
    });
    setInterval(()=>{
      if (!validateSession() && !/login\.html$/.test(location.pathname)){
        location.href = 'login.html';
      }
    }, 60*1000);
  }

  /* ---------- public API ---------- */
  window.Security = {
    hashPassword, verifyPassword,
    isLocked, registerFailure, resetFailures, getLock,
    logEvent,
    listEvents(filter){
      const sec = loadSec();
      let ev = sec.events || [];
      if (filter && filter.type) ev = ev.filter(e=> e.type.includes(filter.type));
      if (filter && filter.severity) ev = ev.filter(e=> e.severity === filter.severity);
      return ev.slice().reverse();
    },
    listLocks(){
      const sec = loadSec();
      return Object.entries(sec.locks||{}).map(([email,l])=>({ email, ...l }));
    },
    unlock(email){
      resetFailures(email);
      logEvent('login.unlocked', { email });
    },
    validateSession, touchSession, clearSession, writeSession,
    startIdleWatchdog,
    migrateUserPassword,
    config: { IDLE_LIMIT_MS, ABS_LIMIT_MS, REMEMBER_MS, MAX_FAILED, LOCKOUT_MS, RETRY_DELAY_MS },
    /** Require capability — re-checked from session every call (cannot be spoofed by mutating DOM). */
    requireCap(cap){
      const s = validateSession();
      if (!s){ location.href='login.html'; return false; }
      if (window.Permissions && !Permissions.can(cap)){
        logEvent('authz.denied', { cap, user_id:s.user_id, severity:'warning' });
        return false;
      }
      return true;
    }
  };

  // auto-start watchdog on every page that loads security.js
  if (typeof window !== 'undefined') startIdleWatchdog();
})();
