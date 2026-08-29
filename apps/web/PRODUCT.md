# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: **PH (propiedad horizontal) administration staff** — the internal team of a
copropiedad's administration (accounting, collections/cobranza, novedades handling) who use Aquila
as their daily working tool to run billing, collections, and accounting for the properties they
administer. Access is role-based (RBAC) across functions such as accounting (`contabilidad`),
collections (`cartera`), budget (`presupuesto`), and configuration.

Property owners and residents (`propietarios`) are **not users of the product** — they are domain
data only, with no login and no direct access (confirmed architectural decision, AD-26). Any
resident-facing output (account statements, receipts, email/SMS notices) is generated *by* staff
users *for* residents, not consumed by residents inside the app.

## Product Purpose

Aquila PH runs the periodic billing/settlement cycle (**liquidación**) for a copropiedad: turning
an annual budget and configurable billable concepts into monthly charges per property, tracking
collections and payment status, handling billing adjustments and disputes (**novedades**), and
keeping the accounting and audit trail that a regulated liquidation process requires. Success means
a copropiedad's staff can run a correct, auditable liquidation each period without hand-built
spreadsheets or hardcoded billing logic.

## Positioning

Aquila's liquidation formulas are **configurable through AEL**, a purpose-built business-rule
language, rather than hardcoded in the application. Where competing PH software bakes billing
calculations into fixed code paths, Aquila lets each copropiedad's billing logic — how a concept's
amount is computed, apportioned, and adjusted — be expressed and changed as data-driven rules,
while still being strongly typed, deterministic, and auditable (not a general scripting escape
hatch — see AD-21/AD-22/AD-23 in `PLAN_MAESTRO_IMPLEMENTACION.md`).

## Operating Context

- Multi-tenant SaaS: one tenant = one copropiedad (AD-24). Staff work within their copropiedad's
  data only, isolated by RLS.
- Recurring monthly liquidation cycles built from an **annual** budget (`presupuesto`) broken into
  periods (`periodos`).
- Core workflows staff perform: configure billable concepts and their formulas/regulatory basis
  (`conceptos`, `fundamentos normativos`), manage properties and common zones (`inmuebles`,
  `zonas comunes`) and ownership coefficients (`coeficientes`), run and review liquidations
  (`liquidación`), manage collections and delinquency (`cartera`, `recaudo`), record and reconcile
  payments including payment-gateway transactions (`pagos`, `pasarela`), post accounting entries
  and mappings (`contabilidad`), manage adjustments/disputes with an approval flow (`novedades`),
  manage vendors/third parties (`terceros`), send templated email/SMS communications, and review
  audit logs (`auditoría`).
- Onboarding creates a new tenant (copropiedad) and invites its staff (`onboarding`, `invitations`).
- A platform-level surface (`/plataforma`) exists for managing tenants/subscriptions at the Aquila
  operator level, separate from any single copropiedad's staff workflow.

## Capabilities and Constraints

- All monetary computation is decimal-exact; floating point and epsilon comparisons are forbidden
  in any money path (enforced in part by ESLint — see root `CLAUDE.md`).
- Liquidation logic must be fully traceable/auditable: diagnostics, versioning, and audit events are
  first-class, not optional add-ons (evidenced by `concepto-versiones`, `audit-log`, maker-checker
  patterns in the domain).
- AEL (v0) is an expression evaluator over a DAG of concepts — not a general-purpose VM/compiler;
  scope expansion there requires a real business case (AD-21/AD-23).
- Tenant isolation is enforced at the database layer (RLS), not just in application code — this is
  a hard security boundary, not a UI convenience.
- Terminology: **tenant** = copropiedad · **periodo** = a billing period within an annual budget ·
  **concepto** = a billable line item · **novedad** = a billing adjustment/dispute, subject to
  approval · **liquidación** = a settlement/billing run for a tenant + periodo.

## Brand Commitments

Product name: **Aquila PH** (confirmed — app name in runtime config, package name `aquila`). No
other binding brand constraints (tagline, logo usage rules, etc.) have been established yet.

## Evidence on Hand

**Pre-launch / internal development stage — no real customers yet.** There is no real copropiedad,
testimonial, case study, or usage data to cite. Future work must not fabricate customer names,
quotes, metrics, or before/after claims; any example data must be clearly fictional/placeholder.

## Product Principles

1. **Financial correctness is non-negotiable.** Decimal-exact arithmetic, no epsilon comparisons,
   full audit trail — these are absolute constraints (`PLAN_MAESTRO_IMPLEMENTACION.md` §9.2), not
   trade-offs to balance against speed or convenience.
2. **Billing logic is configurable, not hardcoded.** The AEL rule engine is the product's core
   differentiator; features should lean on it rather than reintroducing fixed calculations in the
   application layer.
3. **Tenant isolation is absolute.** The copropiedad boundary (RLS) is a security guarantee, never
   softened for convenience in any feature.
4. **Built for the back-office operator, not the resident.** Every surface is staff-facing;
   residents/owners are the subject of the data, never a logged-in audience.
5. **Every consequential action is traceable.** Versioning, approval flows (maker-checker), and
   audit logging are expected defaults for anything that changes billing state.
