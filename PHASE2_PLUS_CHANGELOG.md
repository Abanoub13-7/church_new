# PHASE 2+ ENTERPRISE UPGRADE — Changelog

This upgrade preserves all existing modules (auth, permissions, workflow-engine,
finance-engine, audit, attendance, super-admin, notifications-engine, ai-engine)
and adds an enterprise visualization, reporting, analytics, notification, and
performance layer on top.

## NEW FILES
- `css/enterprise.css` — BPM canvas, workflow nodes, timeline, kanban, journey,
  health gauge, priority chips, notification dropdown, skeleton loaders,
  responsive + print styles.
- `js/performance.js` — `Perf.Cache`, memoization, debounce/throttle,
  pagination helpers, skeleton renderer, centralized error handlers
  (`window.error` / `unhandledrejection`).
- `js/analytics-engine.js` — `AnalyticsEngine` API:
  `churchHealth()`, `risks()`, `insights()`, `attendanceTrend()`,
  `ministryScorecard()`, `servantScorecard()`, cross-module signals.
- `js/notifications-ui.js` — `NotifUI` realtime-like topbar dropdown with
  8-second polling, unread badge, priority colors, quick actions.
- `js/workflow-builder.js` — Visual SVG drag-and-drop BPM builder
  (Phase 1: nodes, ports, connections, inspector, journey panel, timeline,
  kanban, simulation, JSON export, 3 prebuilt templates).
- `js/finance-reports.js` — Executive financial reporting page
  (Phase 2: KPI cards, 12-month trend, doughnuts per category, treasury
  movement, period comparison, smart insights, print-ready PDF view).
- `js/analytics-page.js` — Operational intelligence dashboard
  (Phase 4: church health gauge, parts breakdown, risk detection,
  insights, ministry & servant scorecards, attendance trend).
- `workflow-builder.html`, `finance-reports.html`, `analytics.html`
  — page shells wiring the modules.

## PATCHED FILES
- All `*.html` pages now load `enterprise.css`, `performance.js`,
  `analytics-engine.js`, and `notifications-ui.js` (idempotent patching).
- `js/app.js` sidebar nav extended with:
  - “التحليلات التشغيلية” → analytics.html
  - “Workflow Builder” → workflow-builder.html
  - “التقارير المالية” → finance-reports.html (role-scoped)

## PHASE COVERAGE
- **Phase 1 — Visual Workflow Builder**: drag/drop nodes, ports & SVG arrows,
  inspector with priority/status, branching templates (attendance, finance,
  follow-up), live status dots, timeline, kanban board, member journey, KPI
  strip, JSON export, responsive layout.
- **Phase 2 — Financial Reports UI**: executive KPIs, multi-chart dashboards
  (line/doughnut/bar), period comparison, treasury analytics, smart insights,
  print/PDF-ready layout, role-based access enforcement.
- **Phase 3 — Notification Center**: live topbar dropdown, unread badge,
  priority filtering, 8s polling refresh, quick-open & mark-all-read.
  Existing notifications page enhanced via the new dropdown integration.
- **Phase 4 — Analytics Layer**: AnalyticsEngine computes health score from
  attendance / workflow / follow-up / servants / finance; risk detection and
  operational insights; ministry + servant scorecards.
- **Phase 5 — Performance**: `Perf.Cache` TTL memo cache, debounce/throttle,
  pagination helpers, skeleton loaders, global error capture, idle scheduling.

## ARCHITECTURE NOTES
- 100% additive — no breaking changes to existing engines or pages.
- Reuses existing globals: `DB`, `Auth`, `UI`, `App`, `WorkflowEngine`,
  `FinanceEngine`, `NotificationsEngine`, `AIEngine`.
- All new pages bootstrap through the existing `App.init()` flow so
  permission guards and role checks apply automatically.
- LocalStorage namespaced (`wf_builder_diagrams_v1`) — no DB schema changes.
- Mobile/tablet responsive grids and BPM canvas fallback for small screens.
- Print styles strip chrome for clean PDF export.
