# PHASE 3 — Enterprise Events & Reservation Module

Date: 2026-05-16

This phase transforms the basic events page into a connected enterprise event management system, while preserving the existing UI language, multi-tenant DB, permissions, audit, workflow, finance, notifications and analytics engines.

## New engines (js/)

| File | Responsibility |
|---|---|
| `event-engine.js` | Lifecycle, status, types, templates, capacity, role-based access |
| `registration-engine.js` | Eligibility, approval, waitlist auto-promotion, check-in, ticket codes |
| `ticket-engine.js` | Reservation codes, QR tickets, scan verification |
| `event-workflow-engine.js` | Task assignment, escalation, lifecycle hooks, follow-up triggers |
| `event-analytics.js` | Capacity, velocity, popularity, financial summary, member history |
| `event-notification-engine.js` | Lifecycle / booking / reminder / capacity notifications |

## Schema additions (`data/schema.js`)

Extended `events`, `event_bookings` and added:

- `event_templates` — reusable blueprints (defaults, tasks, budget lines)
- `event_tasks` — organizer/servant/volunteer assignments with escalation
- `event_budgets` — estimated/approved/actual + approval workflow
- `event_expenses` — categorized, linked to `financial_transactions`
- `event_timeline` — immutable per-event audit-style log

`events` now carries: `lifecycle`, derived `status`, `reserved_seats`, `vip_seats`, `servant_seats`, `waitlist_capacity`, `overbook_pct`, `access_rules`, `requires_approval`, `auto_close_when_full`, `registration_opens_at/closes_at`, `template_id`, `budget_id`, `treasury_id`, `approval_required`.

`event_bookings` adds: `pending|approved|rejected` statuses, `waitlist_position`, `seat_class` (regular/vip/servant/reserved), `amount_paid`, `reservation_code`, `checked_in_at`, `approved_by/at`, `rejected_reason`.

## Lifecycle

`draft → review → published → reg_open → reg_closed → ongoing → completed → archived` (with `cancelled` terminal).

Each transition: validated, audit-logged, timeline-logged, triggers notifications + workflow hooks. Status is auto-recomputed on every render from capacity vs. confirmed bookings (`active|full|waitlist`).

## Event Types

`conference, retreat, meeting, class, course, trip, camp, prayer, ministry, servant` — each with default capacity, icon, and `requires_approval` flag.

## Registration

- Eligibility: open window, no duplicates, role-based access rules (age/gender/ministry/class/attendance rate/serving level)
- Approval flow: `pending → approved/rejected` when `requires_approval`
- Waitlist: auto-position, auto-promotion on cancel/no-show, capacity-limited
- Smart overbooking: configurable % above hard capacity
- QR ticket + human reservation code generated per booking

## Deep integration

| System | Integration |
|---|---|
| Workflows | Lifecycle hooks create tasks from template, register no-show follow-ups in `followup_tasks` |
| Finance | `event_budgets` + `event_expenses`; budget approval routed to finance roles |
| Notifications | `NotificationsEngine.notify` used for registration / approval / waitlist promotion / 24h reminders / 90% capacity alerts / cancellation broadcasts |
| Audit | Every action logs via `Audit.log` |
| Permissions | Role gates on create/approve/cancel/register/approveReg/finance |
| Attendance | Check-in marks `attended`; lifecycle `completed` auto-flags remaining confirmed as `no_show` and creates follow-up tasks |
| Analytics | `EventAnalytics.overview/eventMetrics/popularityRanking/financialSummary/memberHistory` |

## Page UI (`events.html` / `js/events.js`)

Tabbed enterprise dashboard:

1. **Overview** — KPI cards, upcoming events, popularity ranking, pending approvals queue
2. **Events** — Cards with capacity bar + lifecycle stepper + quick actions
3. **Registrations** — Pending approvals queue, waitlist, recent registrations, inline approve/reject/check-in
4. **Templates** — Browse, one-click create from template
5. **Budget** (finance roles) — Budget list, approval, expense tracking
6. **Analytics** — Chart.js popularity + booking status distribution
7. **Timeline** — Recent immutable activity feed

Event detail drawer shows: KPIs, lifecycle stepper, financial summary, all lifecycle action buttons gated by `canTransition`, task list, bookings list, mini timeline.

## Preserved

- Original RTL Arabic UI language
- Existing CSS tokens (badges, cards, modal, grid)
- Existing engines (`Auth`, `DB`, `Audit`, `Permissions`, `WorkflowEngine`, `NotificationsEngine`, `FinanceEngine`)
- Existing multi-tenant `church_id` scoping (automatic via `DB.insert`)
- Existing schema fields (additive only, no breaking renames)

## Migration notes

The new schema is **additive**. Existing seed `events` rows in user `localStorage` may lack `lifecycle`/`status` enum extensions; the UI defensively falls back. To get the new seed data, users can call `localStorage.removeItem('church_db_v1')` once and reload.
