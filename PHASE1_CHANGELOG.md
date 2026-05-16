# PHASE 1 UPGRADE — Permissions & Super Admin Control Center

This is a focused architectural upgrade of the existing project. **No UI/visual identity was changed.** All modules and existing flows continue to work.

## What changed

### 1) Permission Matrix System — `js/permissions.js` (rewritten)
- **7 built-in roles**: `super_admin`, `church_admin`, `financial_manager`, `servant_leader`, `servant`, `viewer`, `member`.
- **Granular capabilities** (`canViewDashboard`, `canManageMembers`, `canEditMembers`, `canDeleteMembers`, `canManageAttendance`, `canManageFinance`, `canApproveFinance`, `canRejectFinance`, `canViewReports`, `canManageWorkflows`, `canManageUsers`, `canManageRoles`, `canAccessAI`, `canExportData`, `canManageChurch`, `canManageSubscriptions`, `canViewAuditLogs`, `canImpersonate`, `canBroadcastNotifications`, `canManageFeatureFlags`, `canManagePlatform`).
- **Backward-compatible alias map** — existing calls like `Permissions.can('members.edit')` still work.
- **Per-user overrides** (`session.permissions[cap] = true|false`) override the role matrix.
- **Custom roles** loaded from `custom_roles` table — fully dynamic.
- **Feature-flag aware**: if a church has a module disabled in `feature_flags`, related caps return false even for full-access roles.
- **`Permissions.applyDomGuards()`** — auto-hides any element with `data-perm="canX"` if user lacks the cap. Called automatically after layout and `App.render()`.
- **Financial manager intentionally lacks `canApproveFinance` / `canRejectFinance`** — only `church_admin` can approve.

### 2) Audit Logging — `js/audit.js` (new)
- Centralized `Audit.log(action, meta)` — non-throwing, capped at 5000 rows.
- Auto-records actor (user, role, church), severity, timestamp, and impersonator id.
- Wired into `auth.login_success`, `auth.login_failed`, `auth.login_blocked_suspended`, `auth.logout`, `permission.denied`, `church.created/updated/deleted/status_changed`, `feature_flag.changed`, `notification.sent/deleted`, `impersonation.start/stop`.

### 3) Super Admin Control Center — `js/super-admin.js` (rebuilt)
Single-page dashboard with tabs:
- **Overview** — totals, plan distribution chart, growth chart, recent platform events.
- **Churches** — create / edit / suspend / freeze / resume / **permanently delete** any church.
- **Subscriptions** — plan cards (free/basic/pro/enterprise), per-church usage bars vs plan limits, expiry tracking.
- **Feature Flags** — toggle any of `ai`, `attendance`, `finance`, `workflows`, `reports`, `notifications` per church.
- **Activity Monitor** — recent logins, failed logins, suspension-blocked logins, impersonation events, denied permissions.
- **Audit Logs** — full filterable table.
- **Global Notifications** — broadcast info / maintenance / alert / update to all churches or a specific one.

### 4) Impersonation Mode — `js/impersonation.js` (new)
- Super admin can "login as" any church's admin from the Churches tab.
- Original session is snapshotted; persistent **red banner** at top of every page until exit.
- `Impersonation.start()` / `Impersonation.stop()` — auditable, restores original session on exit.

### 5) Auth hardening — `js/auth.js` (patched)
- Blocks logins to **suspended / frozen / deactivated** churches with a clear message.
- Emits audit events on every login attempt and logout.

### 6) Schema additions — `data/schema.js`
New tables: `audit_logs`, `feature_flags`, `subscription_plans`, `custom_roles`, `platform_notifications`. Auto-seeded on first super-admin page load.

## How to use in existing pages
```html
<!-- hides a button if user lacks the capability -->
<button data-perm="canDeleteMembers" class="btn btn-danger">حذف</button>

<!-- guard inside a JS action handler -->
if (!Permissions.guard('canApproveFinance')) return;

<!-- audit any important action -->
Audit.log('finance.approved', { request_id, amount });
```

## Not changed
UI design tokens, CSS, HTML structure, existing module logic (members/attendance/finance/AI/workflows). The upgrade is additive and backward-compatible.

## Phases 2 (Finance approval workflow) and 3 (Member journey engine) are scoped for follow-up turns.
