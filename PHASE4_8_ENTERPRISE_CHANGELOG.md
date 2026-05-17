# PHASE 4-8 ENTERPRISE SAAS UPGRADE — Changelog

This release transforms the Super Admin into a full Platform Owner control plane.
All work is additive, vanilla HTML/CSS/JS, no backend changes, no UI redesign.

## New engines (js/)
- `billing-engine.js` — plans, subscriptions, invoices, payments, trials, renewals, grace periods, feature-limit guards, MRR/ARR metrics, automatic lifecycle.
- `tenant-management.js` — tenant CRUD, suspend/freeze/archive/reactivate, resource usage vs limits, health score, feature flags, operational metrics.
- `usage-analytics.js` — top active churches, feature usage, growth & revenue trends, churn risk, metering, platform health.
- `white-label.js` — per-tenant branding (colors, logo, headers, subdomain), draft/publish, live apply.
- `support-engine.js` — tickets, messages, assignments, status workflow, analytics, knowledge base.
- `backup-engine.js` — full/tenant/module snapshots, restore with auto pre-snapshot, download, scheduled daily snapshot.
- `ai-ops.js` — heuristic insights, per-tenant risk score, smart recommendations, platform-wide alerts.

## New pages (super admin)
- `tenants.html` · `platform-health.html`
- `subscriptions.html` · `billing.html`
- `usage-analytics.html` · `ai-ops.html`
- `white-label.html` · `support.html` · `knowledge-base.html` · `backups.html`

## New pages (tenant)
- `my-billing.html` (church_admin / financial_manager)
- White-label, support, KB are reused.

## Integrations preserved
- All actions log to **Audit**.
- Billing lifecycle, backup scheduler, and white-label theming run on every page load via `app.js`.
- Tenant feature flags fall back to plan limits (`Billing.isFeatureAllowed`).
- Suspended/expired tenants blocked at login (already in `auth.js`).
- Data isolation: `DB` multi-tenant guard untouched. Super-admin still blocked from member PII.

## Default data seeded
- 4 plans (Free, Starter, Growth, Enterprise) with full limit matrices.
- Subscription record auto-created per church.
- 4 KB articles.

## Navigation
- Super-admin sidebar reorganized into 4 sections (Platform, Billing, Intelligence, Operations).
- Tenant sidebar gained: my-billing, white-label, support, knowledge-base.
