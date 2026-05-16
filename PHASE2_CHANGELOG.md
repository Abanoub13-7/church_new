# PHASE 2 CHANGELOG — Enterprise Hardening

This iteration adds Phase 1 (security), Phase 2 (enterprise finance) and
Phase 3 (smart notifications + member journey) on top of the existing
codebase WITHOUT changing the UI language or breaking current modules.

## Phase 1 — Authentication & Security
- **`js/security.js`** (new): PBKDF2-SHA256 password hashing (50k iters, 16-byte salt),
  constant-time comparison, automatic migration of legacy plaintext `password_hash`
  values on first successful login.
- Session lifecycle: absolute expiry (8h normal / 30d remember-me), 30-min idle
  timeout enforced by an event-driven watchdog, server-style re-validation on
  every page load.
- Failed-login tracking: 5 attempts → 15-min account lockout, anti-burst delay,
  separate `Security` event log distinct from generic audit.
- Authorization helper `Security.requireCap()` re-reads the session for each
  sensitive action so DOM-mutation bypasses cannot grant capabilities.
- **`security.html` + `js/security-page.js`** (new): admin console for active
  session, locked accounts (with unlock), recent security events.

## Phase 2 — Enterprise Finance
- **`js/finance-engine.js`** (new):
  - Chart of accounts (cash, bank, donations, tithes, salaries, expenses, …).
  - **Double-entry ledger** — every approved transaction produces balanced
    debit + credit entries in `ledger_entries`.
  - **Treasuries** with persistent running balance and full history timeline.
  - **Financial periods** (monthly) with open/closed status; locked periods
    block new transactions and require privileged re-open.
  - **Transaction lifecycle** `pending → approved (locked) | rejected → reversed`.
    Approved transactions are immutable; corrections happen via reversal entries
    that preserve audit integrity.
  - **Approval chains** with multi-step history, rejection notes, and a
    hard self-approval block (recorder cannot approve their own txn).
  - **Smart insights**: unusual spending, income drop, negative/inactive
    treasuries, broadcast to finance approvers via the notification engine.
  - **Exportable ledger CSV** (Excel-ready); period reports printable from the UI.
- `js/finance.js` rewritten on top of the engine — approve / reject / reverse
  actions, treasury panel, period panel, insights banner, transaction detail
  modal with full approval chain.

## Phase 3 — Workflow / Notifications Intelligence
- **`js/notifications-engine.js`** (new): idempotent (dedupe_key) smart-alert
  generator. Runs on every page load and produces priority-tagged
  notifications for:
  - attendance drops (4-week vs prior-month comparison)
  - overdue follow-up tasks
  - pending financial approvals (to approvers only, never the recorder)
  - workflow histories stuck > 7 days
  - smart financial insights
- Priority field added to notifications (low/medium/high/critical) and the
  notifications page sorts by priority then recency.
- Member journey timeline helper `NotificationsEngine.memberTimeline(memberId)`
  combines registration, attendance, follow-up, and notes into a single
  chronological view.

## Schema additions
- `treasuries`, `ledger_entries`, `fin_periods`, `fin_insights` registered in
  `data/schema.js`. Existing tables are unchanged; `financial_transactions`
  rows now carry the optional fields `status`, `locked`, `period_id`,
  `approval_chain`, `reversal_of`, `reversed_by` (additive).

## Backward compatibility
- All legacy users in `mock-data.js` still log in with their original
  passwords; `Security` rewrites the stored hash to PBKDF2 on first success.
- Existing finance rows without a `status` simply render as legacy entries in
  the new ledger UI and behave identically to before.
- Every existing page received `security.js`, `finance-engine.js`, and
  `notifications-engine.js` via additive `<script>` insertions; nothing was
  removed.
