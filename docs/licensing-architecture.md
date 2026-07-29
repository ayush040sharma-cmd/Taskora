# Taskora Licensing Architecture

This document describes the licensing/feature-gating system: how it's structured, how it
interacts with authentication and RBAC, and how to extend it. It reflects what is actually
implemented in the codebase today, not a future/aspirational design.

---

## 1. Authentication

Authentication is unchanged by the licensing system — it is a read-only consumer of it.

- **Login/Register**: `backend/routes/auth.js` — issues a JWT (`jwt.sign`) containing
  `{ id, email, name, role, is_admin }`, set as an httpOnly cookie (`taskora_token`) via
  `backend/utils/cookies.js`. `SameSite=None; Secure` in production (cross-origin
  `taskora.io` ↔ `api.taskora.io`), `SameSite=Lax` in dev.
- **Google OAuth**: `backend/routes/oauth.js` — a hand-rolled flow (not Passport, not
  next-auth), independent of licensing entirely. Issues the same JWT shape as password login.
- **Request-time verification**: `backend/middleware/auth.js` — the `auth` middleware.
  Verifies the JWT (cookie or `Authorization: Bearer`), then **always re-reads
  `role`, `is_admin`, `suspended` from the database** — the JWT's claims for these are
  never trusted, to prevent privilege escalation via a stale or forged token.

**Licensing's only touchpoint here**: `auth` middleware also reads `plan` and `email` in
the same query, and additionally attaches:

```js
req.user = {
  ...decoded,
  role, is_admin,      // unchanged — sourced from DB, same as before licensing existed
  email,               // DB is source of truth, not the JWT claim
  plan,                // normalized to a PLANS.* value (see §3 for why normalization matters)
  isInternal,          // computed via isInternalUser(email) — see §5
};
```

This is the **only** change made to authentication code. Login, register, OAuth, JWT
signing/verification, and cookie handling are byte-for-byte unchanged.

---

## 2. RBAC (Role-Based Access Control)

RBAC is a **separate, untouched system** that always runs before licensing. There are two
parallel RBAC mechanisms in this codebase (both pre-existing, neither modified):

1. **`backend/middleware/rbac.js`** — role hierarchy: `team_member` (1) < `manager` (2) <
   `super_boss` (3). Exposes `requireRole(...roles)`, `requireMinRole(minRole)`,
   `requirePermission(key)`.
2. **`backend/middleware/permission.js`** — a DB-backed "enterprise permission" system
   (`requirePerm(permissionKey, minScope?)`) resolving `user_roles` /
   `role_permissions_map` / `user_permission_overrides`, with a legacy-role fallback.

**Frontend RBAC**: `frontend/src/utils/canAccess.js` (`hasPermission`, `canViewSidebar`) and
`frontend/src/config/permissions.js` (`ROLE_PERMISSIONS` by `onboarding_role`). The Manager
Dashboard is gated by exactly one check:
`frontend/src/pages/Dashboard.jsx` → `hasPermission("manager:view", user?.role)`.

**Critical invariant**: licensing never appears *before* RBAC in a middleware chain, and
never influences an RBAC decision. Every route that has both looks like:

```js
router.post("/assign", auth, requireMinRole("manager"), requireFeature(FEATURES.SIMULATION), handler);
//           ^auth      ^RBAC (unchanged)              ^licensing (new)            ^business logic
```

A `team_member` on the highest paid plan is still rejected by `requireMinRole("manager")`
before licensing is ever evaluated — role and plan are orthogonal axes.

---

## 3. Licensing — Core Concepts

Licensing answers exactly one question per request: **"does this user's plan grant this
feature (or allow one more of this resource)?"** It does not know about roles, workspaces,
or permissions — that's RBAC's job, and it always runs first.

Two kinds of licensing checks:

| Kind | Middleware | Answers |
|---|---|---|
| Capability (boolean) | `requireFeature(feature)` | Can this plan use this feature at all? |
| Usage limit (numeric) | `enforceLimit(feature, getCurrentCount)` | Has this account hit its ceiling for this resource? |

Both live in **`backend/middleware/planEnforce.js`** and both read exclusively from
**`backend/config/licensing.js`** — no plan name, feature name, or numeric limit is ever
hardcoded anywhere else in the codebase.

---

## 4. Feature Registry — `backend/config/licensing.js`

The single source of truth. Three exports:

```js
const FEATURES = Object.freeze({
  GANTT, SPRINTS, SIMULATION, JARVIS, AI_REASONING, EXPORT,
  PORTFOLIO_AI, SMART_ASSIGNMENT, FORECAST,
  PROJECT_LIMIT, TASK_LIMIT, MEMBER_LIMIT,   // *_LIMIT suffix = numeric, not boolean
});

const PLANS = Object.freeze({ FREE, PRO, ENTERPRISE, INTERNAL });

const PLAN_FEATURES = Object.freeze({
  FREE:       { GANTT: false, ..., PROJECT_LIMIT: 3, TASK_LIMIT: 10, MEMBER_LIMIT: 3 },
  PRO:        { GANTT: true, SIMULATION: false, ..., PROJECT_LIMIT: UNLIMITED, MEMBER_LIMIT: 25 },
  ENTERPRISE: { /* everything true / UNLIMITED */ },
  INTERNAL:   /* derived programmatically, see below — never hand-authored */
});
```

**Important, non-obvious rule**: `PRO`'s `MEMBER_LIMIT` is a real cap of **25**, not
unlimited — only `PROJECT_LIMIT` and `TASK_LIMIT` are unlimited on Pro. Don't assume "Pro =
unlimited" uniformly across the three limit features.

`INTERNAL` is **not hand-typed** — it's derived from `FEATURES` itself:

```js
[PLANS.INTERNAL]: Object.freeze(
  Object.fromEntries(
    Object.values(FEATURES).map(key => [key, key.endsWith("_LIMIT") ? UNLIMITED : true])
  )
)
```

This means adding a 13th feature to `FEATURES` automatically grants it to `INTERNAL` — it's
structurally impossible to forget to update the internal plan when adding a feature.

Everything (`FEATURES`, `PLANS`, each per-plan object, and `PLAN_FEATURES` itself) is
`Object.freeze()`'d at every level — a mutation attempt anywhere is silently a no-op.

A `UNLIMITED` sentinel (`null`) is exported and used for the three `*_LIMIT` features'
uncapped value — deliberately distinct from boolean `true`, since a limit is a number, not
an on/off flag.

**Known gap**: `GANTT`, `PORTFOLIO_AI`, and `FORECAST` exist in the registry but have **no
dedicated backend route to enforce them on** — see §13 for why, and what's needed to close
the gap.

---

## 5. Internal User — `backend/utils/isInternalUser.js`

```js
function isInternalUser(email) {
  if (!email || typeof email !== "string") return false;
  const domains = (process.env.INTERNAL_DOMAINS || "")
    .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length === 0) return false;
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at === -1 || at === lower.length - 1) return false;
  return domains.includes(lower.slice(at + 1));
}
```

- **No database column, no schema migration.** Computed fresh from the email on every
  call — nothing is persisted or cached.
- **No hardcoded domain anywhere.** If `INTERNAL_DOMAINS` is unset, `isInternalUser`
  always returns `false` — nobody is internal by default.
- **Exact-domain match only.** `user@subex.com` matches; `user@mail.subex.com`
  (subdomain) and `user@notsubex.com` (substring) do **not** — this was a deliberate
  choice to prevent an accidental bypass via a lookalike domain.
- Internal users bypass **both** `requireFeature` and `enforceLimit` entirely, checked
  before any plan/feature lookup happens.

---

## 6. UpgradeGate — Frontend Reaction to Licensing

`frontend/src/components/upgrade/UpgradeGate.jsx` is **reactive, not predictive**. It does
not consult any local plan/feature map to decide whether to show an upgrade prompt — it
only reacts to an actual backend 403 that already happened.

```jsx
<UpgradeGate upgradeError={caughtAxiosErrorOrNull}>
  {actualFeatureContent}
</UpgradeGate>
```

```js
const code    = upgradeError?.response?.data?.code;
const blocked = code === "PLAN_UPGRADE_REQUIRED" || code === "LIMIT_EXCEEDED";
```

If `blocked` is false (including when `upgradeError` is `null`/`undefined`), `children`
render normally with zero overhead. If true, it blurs `children` and shows a small
"Unlock with {Plan}" overlay that opens `UpgradeModal` on click.

**Why this design, and why internal users need no special frontend handling**: since
internal users never receive a `PLAN_UPGRADE_REQUIRED`/`LIMIT_EXCEEDED` response from the
backend in the first place, `upgradeError` is simply never set for them by the consuming
component — the gate has nothing to react to. There is no `isInternal` check anywhere in
the frontend; the backend being the sole source of truth makes one unnecessary.

**Casing note**: the backend returns `requiredPlan` uppercase (`"PRO"`, matching
`PLANS.PRO`); the frontend's `PLAN_LABELS` map uses lowercase keys. `UpgradeGate` and
`AIBubble.jsx` both `.toLowerCase()` the value before using it — don't skip this when
wiring a new component, or `PLAN_LABELS[requiredPlan]` will silently render `undefined`.

**Where it's currently wired up**:
| Component | Trigger |
|---|---|
| `SimulationPanel.jsx` | wraps the whole panel; `/simulate/assign` and `/simulate/suggest` errors both feed `upgradeError` |
| `ImportWizard.jsx` (`ExportTab`) | wraps the export panel; note the response is `responseType: "blob"`, so the error body arrives as a `Blob` and must be read via `.text()` → `JSON.parse` before the `code` field is inspectable |
| `Dashboard.jsx` (Sprint Planning view) | wraps the sprint list/selector section |
| `AIBubble.jsx` (Jarvis chat) | does **not** use `UpgradeGate`'s blur pattern (a chat log has no "panel" to blur) — instead reuses `UpgradeModal` directly as a popup at the moment of denial |

**Not yet wired**: `JarvisVoiceAssistant.jsx` (the voice-orb UI, a second Jarvis surface).

---

## 7. Middleware Flow

The required pipeline order, enforced by argument order in each route (not by a global
middleware stack — Express has no notion of "run licensing after RBAC" other than argument
order within one route definition):

```
JWT Authentication (auth)
      ↓
RBAC (requireMinRole / requirePerm) — only on routes that have it
      ↓
Licensing (requireFeature / enforceLimit)
      ↓
Business logic (route handler)
```

Concrete example (`backend/routes/simulate.js`):

```js
router.post("/assign", auth, requireMinRole("manager"), requireFeature(FEATURES.SIMULATION), async (req, res) => { ... });
```

Routes with no RBAC (e.g. Sprints, Jarvis) simply have licensing directly after `auth` —
there is nothing to be "after" besides authentication itself.

**Internals of `requireFeature`/`enforceLimit`** (both share one `resolveUserPlan(req)`
helper in `planEnforce.js`):

1. If `req.user` is missing (defensive — only matters if mounted without `auth` running
   first), try to decode a token directly; if that fails, call `next()` and let the
   route's own auth reject with 401/403.
2. Prefer `req.user.plan` / `req.user.isInternal` (already resolved and normalized by the
   `auth` middleware, §1) — **no second DB round-trip in the common case.**
3. Fallback: if those fields are absent, query `SELECT plan, email FROM users WHERE id = $1`
   directly and normalize (`.toUpperCase()`, since `users.plan` is stored lowercase in the
   DB while `PLANS.*` are uppercase — **this exact mismatch was a real bug caught during
   testing; don't reintroduce it if you touch this normalization**).
4. `isInternal` → `next()` unconditionally.
5. `requireFeature`: `PLAN_FEATURES[plan][feature] === true` → `next()`; else 403.
6. `enforceLimit`: `PLAN_FEATURES[plan][feature] === UNLIMITED` → `next()` (without even
   calling `getCurrentCount` — verified in testing that the count callback is never
   invoked for unlimited plans); else compare `await getCurrentCount(req) < limit`.

---

## 8. Error Codes

Two, and only two, licensing-specific HTTP 403 response shapes exist. Nothing else in the
codebase should invent a third.

**`PLAN_UPGRADE_REQUIRED`** (from `requireFeature`):
```json
{ "code": "PLAN_UPGRADE_REQUIRED", "requiredPlan": "PRO", "feature": "SIMULATION" }
```
`requiredPlan` is computed as the smallest plan (walking `FREE → PRO → ENTERPRISE`) that
actually grants the feature — not a fixed guess.

**`LIMIT_EXCEEDED`** (from `enforceLimit`):
```json
{ "code": "LIMIT_EXCEEDED", "feature": "MEMBER_LIMIT", "limit": 3, "current": 3, "requiredPlan": "PRO" }
```
`requiredPlan` here is the smallest plan whose ceiling for that feature is `UNLIMITED` or
strictly higher than the current plan's.

Both `requiredPlan` values are uppercase (`PLANS.*` values) — see the casing note in §6
before consuming them on the frontend.

---

## 9. Environment Variables

| Variable | Where read | Purpose | Default if unset |
|---|---|---|---|
| `INTERNAL_DOMAINS` | `utils/isInternalUser.js` | Comma-separated email domains that bypass all licensing (e.g. `subex.com,partner.com`) | Nobody is internal |
| `JWT_SECRET` | `middleware/auth.js`, `routes/auth.js`, `routes/oauth.js`, `middleware/planEnforce.js` (fallback path) | JWT signing/verification — unrelated to licensing but licensing's fallback path uses it too | — (required) |
| `DATABASE_URL` | `db.js` | Postgres connection — `users.plan`, `users.email` live here | — (required) |

No new environment variable governs plan values or feature flags directly — those live
entirely in `config/licensing.js`, by design (see §12).

---

## 10. How to Add a New Feature

1. Add a key to `FEATURES` in `config/licensing.js` (e.g. `AUDIT_LOG_EXPORT: "AUDIT_LOG_EXPORT"`).
2. Add its value to `PLAN_FEATURES.FREE`, `.PRO`, `.ENTERPRISE` (boolean for a capability,
   a number or `UNLIMITED` for a `*_LIMIT`-suffixed key). **Do not touch `PLAN_FEATURES.INTERNAL`** —
   it picks up the new feature automatically.
3. If it's a capability feature: add `requireFeature(FEATURES.AUDIT_LOG_EXPORT)` as the
   last middleware argument (after any existing RBAC) on the relevant existing route(s).
4. If it's a `*_LIMIT` feature: write a small `getCurrentCount(req)` callback in the
   relevant route file (counting whatever resource this limits) and pass it to
   `enforceLimit(FEATURES.YOUR_LIMIT, thatCallback)`.
5. On the frontend, wrap the relevant component's content in
   `<UpgradeGate upgradeError={state}>`, and in the component's existing catch block, set
   that state when `err.response?.data?.code` is `PLAN_UPGRADE_REQUIRED` or
   `LIMIT_EXCEEDED` — do not add a new local plan check.

## 11. How to Add a New Pricing Plan

The current `PLANS` enum (`FREE`, `PRO`, `ENTERPRISE`, `INTERNAL`) is a flat list — adding
a genuinely new *plan* (not a feature) means:

1. Add the key to `PLANS` in `licensing.js`.
2. Add a full entry for it in `PLAN_FEATURES` — every existing `FEATURES` key must be
   given a value (there's no implicit default; an omitted key would read as `undefined`,
   which fails every `=== true` / `=== UNLIMITED` check, i.e. defaults to "denied").
3. If it should be purchasable, add it to `PLAN_PRICES` in `backend/routes/payments.js`
   (separate from licensing — pricing/checkout is not part of this framework) and to the
   `PLANS` array in `frontend/src/pages/Pricing.jsx` (marketing copy, also separate).
4. If it should be reachable via the upgrade-suggestion logic (§8), make sure it's in the
   right position in `planEnforce.js`'s `UPGRADE_PATH` array — this determines what
   `requiredPlan` gets suggested to users below it.

**Before doing this for a real add-on system**, read §14 below — the current flat
`FEATURES → PLANS` model doesn't scale well to optional add-on packs layered on top of a
base plan.

## 12. How to Add a New Internal Domain

Set the `INTERNAL_DOMAINS` environment variable (in Render's dashboard for production, or
`backend/.env` for local dev) to a comma-separated list:

```
INTERNAL_DOMAINS=subex.com,partner.com,newpartner.com
```

No code change, no redeploy of application logic required — only the environment variable
needs to change (which does require a restart of the Node process to take effect, since
`process.env` is read at call-time but the process itself needs the new value injected at
startup on most hosting platforms).

## 13. How to Protect a New API

1. Confirm the route already exists — this framework's convention (established across
   every phase of its build) is to **never invent a new route for licensing purposes**;
   only gate what already exists.
2. Identify what RBAC (if any) already runs on it — licensing always goes *after* that in
   the argument list, never before or in place of it.
3. Pick (or add, per §10) the `FEATURES` key that matches. Some existing features
   currently have **no route to attach to** — `GANTT` (pure frontend visualization of
   shared `/api/tasks` data, no dedicated endpoint), `PORTFOLIO_AI` (cross-workspace
   aggregation isn't built), and standalone `FORECAST` (currently embedded inside
   `/api/simulate/assign`'s response, not separable without restructuring that endpoint).
   Don't force a gate onto a route that serves a broader purpose than the one feature —
   `GET /api/tasks` is shared by everyone's board, not just Gantt users, so it must never
   be gated.
4. Add `requireFeature(FEATURES.X)` (or `enforceLimit`) as the final middleware argument.
5. **Deliberate exception worth knowing before you "complete" AI gating**:
   `POST /api/ai/predict/:taskId` (single-task risk score) is intentionally **not** gated
   behind `AI_REASONING`, even though `/analyze`, `/health`, and `/alerts` are. Free tier
   is meant to keep basic risk badges — but `/predict` currently returns the full
   prediction object (score *and* reasoning) unsplit. Gating the whole route would take
   away Free's badge entirely, which is a regression, not a licensing fix. This needs a
   response-shape split (return reasoning only when the plan allows it), not a route gate,
   and hasn't been built yet.

## 14. How Frontend Reacts to Licensing

See §6 for the mechanics. The short version for someone wiring a new component:

```jsx
const [upgradeError, setUpgradeError] = useState(null);

async function doTheThing() {
  try {
    const res = await api.post("/whatever", body);
    setUpgradeError(null);
    // ...handle res.data normally
  } catch (err) {
    const code = err.response?.data?.code;
    if (code === "PLAN_UPGRADE_REQUIRED" || code === "LIMIT_EXCEEDED") {
      setUpgradeError(err);
    } else {
      // existing generic error handling — don't let this branch also catch licensing errors
    }
  }
}

return (
  <UpgradeGate upgradeError={upgradeError}>
    {/* the actual feature UI */}
  </UpgradeGate>
);
```

If the surface doesn't fit a "blur a panel" interaction (a chat log, a single button with
no surrounding content), reuse `UpgradeModal` directly instead of forcing `UpgradeGate`'s
wrapper — see `AIBubble.jsx` for the precedent. Do not invent a third upgrade-prompt visual.

---

## 15. Recommended Future Direction — Products Layer

Not implemented. Recorded here as the agreed direction for when add-ons are actually needed:

```
FEATURES → PRODUCTS → PLANS
```

Instead of `PLAN_FEATURES` mapping a flat plan directly to every feature, introduce a
`PRODUCTS` layer (e.g. `CORE`, `AI_MODULE`, `PORTFOLIO_MODULE`, `INTEGRATIONS_MODULE`,
`AUTOMATION_MODULE`) that each own a subset of `FEATURES`, and have a plan be a *set of
products* rather than a hardcoded feature list:

```
Enterprise = CORE + AI_MODULE + PORTFOLIO_MODULE
Enterprise + AI Pack = CORE + AI_MODULE (extra) + PORTFOLIO_MODULE
```

This is how Jira, GitHub Enterprise, Monday.com, and Asana structure their pricing as they
mature — it allows selling add-on packs without redesigning the licensing engine each time.
This is a **breaking change to `PLAN_FEATURES`'s shape** (from `Plan → Feature → value` to
`Plan → Product[] ` and `Product → Feature → value`), so it should be planned as its own
migration, not bolted on incrementally.
