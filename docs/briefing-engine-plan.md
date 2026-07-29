# Taskora — AI Daily Briefing Engine
## Execution Plan (v1.1 — sanity-checked against the live codebase 2026-07-13)

**Feature:** Decision-support briefing system (email first, Slack/push later)
**Positioning:** Execution Intelligence, not notifications
**Estimated effort:** 5–6 weeks, 1 engineer to production · 3 weeks to internal dogfood
**Owner:** TBD

> **Corrections applied in this revision** (see full sanity-check discussion in this conversation
> for detail): the plan below is otherwise unchanged from the original v1 draft. Five things were
> fixed:
> 1. §0.1 — the "cold start" problem statement now reflects that two anti-sleep mechanisms already
>    exist in production (they mitigate, not eliminate, the issue — hence still open as `P-001`).
> 2. §2/§3.1 — the citation "`MASTER_AUDIT UX-015`: managers score 0/7" was wrong on both counts.
>    Corrected to the real source and number.
> 3. §3.1/§5.1 — removed the claim that the What-If Sim engine can be "reused" for Sprint
>    Confidence with a rename. It can't — it's a different kind of engine, and the thing being
>    renamed already appears to have been renamed. Sprint Confidence is net-new work.
> 4. §0.2/§12 — `users.timezone` already exists in the schema; removed it from the "new work" list,
>    replaced with the real gap (it's never actually populated from the browser).
> 5. Everything else in the plan (BE-002, P1-02, IA-002, Resend/Razorpay/INTERNAL_DOMAINS config,
>    node-cron usage, CommandCenter argument) was checked and confirmed accurate — left as-is.

---

## 0. THE ONE ARCHITECTURAL DECISION THAT MATTERS

**The LLM never produces a number.**

Every metric, score, percentage, count, and delta is computed deterministically in SQL. The LLM
receives a frozen `facts` JSON object and is allowed to do exactly three things:

1. Write the subject line
2. Characterise the day in one sentence ("Today looks manageable")
3. Turn machine-generated *reason codes* into natural language ("This blocks three downstream
   tasks and is required before Friday's release")

If the model emits a digit that does not appear in the facts object, the output is **rejected**
and the deterministic template is sent instead.

Why this is non-negotiable: this email is a decision-support artifact. A single hallucinated
"Sprint confidence: 88%" and the feature is dead — permanently. Nobody trusts an advisor that
makes up numbers once.

Everything below follows from this.

---

## 1. PHASE 0 — PREREQUISITES (do these first, ~4 days)

These are not optional. Each one blocks the feature.

### 0.1 Scheduler infrastructure
**Problem:** Backend runs on Render free tier, which spins down after 15 min idle. **Two
mitigations already exist in production** — `server.js` self-pings `/health` roughly every 10
minutes (`PERFORMANCE_REPORT.md:66`), and `.github/workflows/keepalive.yml` externally pings the
live backend every 14 minutes. Neither fully eliminates the problem: `MASTER_AUDIT.md`'s `P-001`
(P0, "Render free tier cold start 30-45s") is still open as of the last audit, and a
`node-cron`-scheduled job firing *inside* a process that has gone cold regardless of the pings is
still a real failure mode — the ping keeps the process warm, it doesn't guarantee a cron tick
lands during a gap. Treat this as "mostly mitigated, not solved," not "unaddressed."

**Decision required — pick one:**

| Option | Cost | Reliability | Notes |
|---|---|---|---|
| **A. Render Starter + `node-cron` in-process** | $7/mo | Good | Simplest. Also fully resolves `P-001`, which the current pings only mitigate. **Recommended.** |
| B. Render Cron Job (separate service) | $ | Best | Cleanest separation; duplicate deploy config |
| C. External trigger (GitHub Actions / cron-job.org → `POST /api/internal/briefings/tick` with shared secret) | Free | Adequate | Good *fallback* even if you pick A — and note `keepalive.yml` already gives you a working GitHub Actions cron pattern to copy |

**Recommendation:** A + C. Upgrade to Starter (you need it anyway for cold start), run `node-cron`
in-process, and keep an external hourly ping as a dead-man's-switch. Guard the tick endpoint with
`X-Internal-Secret` and rate-limit it.

### 0.2 Migration tooling
This feature adds new tables. You currently have `schema.sql` → `schema-v11.sql` with **no
migration runner and no history table** (`BE-002`, confirmed — `backend/package.json` has no
migration library, and `MASTER_AUDIT.md`'s own Post-Launch Roadmap independently recommends
`node-pg-migrate`). Adopt `node-pg-migrate` now, or at minimum add a `schema_migrations` table and
`schema-v12.sql`. Doing several tables by hand across dev/staging/prod without a runner is how you
get a production schema nobody can reason about.

### 0.3 Email deliverability
- Verify sending domain on Resend: **SPF, DKIM, DMARC** on `taskora.io`.
- **Send briefings from a subdomain** (e.g. `brief@mail.taskora.io`) — separate from transactional
  (`support@taskora.io`). A bounce/complaint storm on a daily marketing-adjacent send must not
  poison password-reset deliverability. This is the mistake that is expensive to undo.
- Configure Resend webhooks → `/api/webhooks/resend` (delivered / bounced / complained / opened / clicked).

### 0.4 P1-02 (global shortcut in modal inputs)
**Deferred — not needed right now.** For the record: I checked this against current code
(`frontend/src/pages/Dashboard.jsx:310-351`) and the `inInput` guard the audit recommended is
already present and looks correct — typing in `SprintModal.jsx`'s Sprint Name field (a real
`<input>`) should already be safe. Either this was already fixed, or it needs a live repro to
chase further. No action taken; revisit only if it's actually observed in the running app.

---

## 2. ARCHITECTURE

Four layers. Each independently testable. The engine is a **platform capability** — email is just
the first renderer.

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1 — SIGNAL / METRICS CORE          (deterministic)    │
│ services/metrics/*.js                                        │
│ executionScore · sprintConfidence · workloadPct ·            │
│ riskScore · focusTime · blockerAge · dependencyImpact        │
│ → writes daily rows to metric_snapshots                      │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2 — FACTS BUILDER + RANKING ENGINE (deterministic)    │
│ services/briefing/buildContext.js                            │
│ buildBriefingContext(userId, type, localDate) → facts JSON   │
│ rankTasks(facts) → top N + reason codes (enum)               │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3 — NARRATION            (LLM, constrained, optional)  │
│ services/briefing/narrate.js  → Claude, JSON-only output     │
│ Validates: no new numbers. Fails → deterministic fallback.   │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌──────────────┬──────────────────┬───────────────────────────┐
│ RENDERER:    │ RENDERER:        │ RENDERER: (future)        │
│ Email (MJML) │ In-app "Today"   │ Slack / Teams / Push      │
└──────────────┴──────────────────┴───────────────────────────┘
```

**Three surfaces, one engine.** The same facts + ranking that power the morning email should power
the manager Command Center landing view. `MASTER_AUDIT.md`'s own execution order (line 1327)
independently recommends making `CommandCenter` the default landing view for managers as its
single highest-impact fix — corroborated separately by `PHASE3_VALIDATION.md`'s "10-Second Manager
Test" (Part 4), where managers scored **0/6**, not 0/7, on the target checklist (that specific
0/6 → 6/6 claim lives in `PHASE3_VALIDATION.md:953`, not under a `MASTER_AUDIT` finding ID — the
real `UX-015` in `MASTER_AUDIT.md` is an unrelated finding, "What-If Simulation uses P50/P90
jargon," discussed in §5.1 below). Building this engine *fixes the in-app manager experience too*.
That's the argument for prioritising it, and it holds up — it was just mis-cited in the first
draft of this plan.

---

## 3. PHASE 1 — METRICS CORE (Week 1)

### 3.1 Canonicalise the metrics
Right now "Execution Score" and "Sprint Confidence" are aspirational — they don't appear anywhere
in this codebase (checked: no matches for either term in any `.md` or source file), and there's no
Monte-Carlo or percentile-based forecasting engine anywhere to build on. **This needs to be said
plainly: these are net-new metrics, not a rename of something that exists.** In particular, the
`simulate.js` / `SimulationPanel.jsx` "What-If Simulation" feature (`backend/services/
workloadEngine.js` — `simulateAssignment`, `predictFutureLoad`) is a **per-task assignment/load
simulator** — "what happens to this person's workload if I assign them this task" — not a
sprint-level probabilistic forecast. It has no `P50`/`P90` output today (that jargon, tracked as
real `MASTER_AUDIT.md` findings `UX-015`/`MC-006`, appears to have already been fixed —
`SimulationPanel.jsx` currently shows plain load percentages and a "14-Day Load Forecast," not
percentile language). There is nothing to "reuse" for Sprint Confidence beyond the general pattern
of "read tasks + capacity from the DB" — the actual confidence math is new.

Define both metrics **once**, in one service, and have Analytics, Command Center, and the briefing
all call it. Otherwise the email says 82% and the dashboard says 76% and you've built a trust bug.

**Proposed definitions (adjust, but write them down and freeze them):**

```
Execution Score (per user, per day) — 0..100
  0.35 · completion_ratio      (tasks done / tasks planned for the day)
  0.25 · on_time_ratio         (done before due / done)
  0.20 · (1 − blocked_ratio)   (blocked tasks / assigned tasks)
  0.20 · (1 − overload_penalty)(clamp(workload_pct − 100, 0, 100) / 100)

Sprint Confidence (per sprint) — 0..100
  Net-new: no existing engine to build on (see above). Monte-Carlo or closed-form over:
  remaining points, historical velocity (last 3 sprints), open blockers weighted by
  dependency depth, team capacity net of leave/travel. Note `sprints` has no story-points
  column today — that's a schema addition, not just a metrics-service addition.

Focus Time (per user, per day)
  contracted_hours − meeting_hours − admin_overhead(default 1h)

Dependency Impact (per task)
  count of transitive downstream tasks currently blocked by this task
```

### 3.2 Snapshotting — **START THIS FIRST**
```sql
CREATE TABLE metric_snapshots (
  id             BIGSERIAL PRIMARY KEY,
  workspace_id   INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        INT REFERENCES users(id) ON DELETE CASCADE,  -- NULL = workspace-level
  sprint_id      INT REFERENCES sprints(id) ON DELETE CASCADE,-- NULL = not sprint-scoped
  metric         TEXT NOT NULL,          -- 'execution_score' | 'sprint_confidence' | ...
  value          NUMERIC(6,2) NOT NULL,
  inputs         JSONB,                  -- the raw components, for debugging "why 82?"
  local_date     DATE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, user_id, sprint_id, metric, local_date)
);
CREATE INDEX ON metric_snapshots (user_id, metric, local_date DESC);
```

**Ship the snapshot cron two weeks before the first email.** "Yesterday: 74% ↑ +7%" is the single
most compelling line in the entire mock — and it is *unrecoverable* if you didn't record yesterday.
This is the highest-regret item in the plan.

**Acceptance:** 14 consecutive days of snapshots for every active user, verified in prod, before
Phase 4 ships.

---

## 4. PHASE 2 — FACTS BUILDER + RANKING ENGINE (Week 2)

### 4.1 The facts contract
`buildBriefingContext(userId, 'morning'|'evening', localDate)` returns a **strict, versioned JSON
object**. This is the only thing downstream layers may read. Zod-schema it.

```jsonc
{
  "schema_version": 1,
  "persona": "ic",                    // "ic" | "manager"
  "user": { "id": 12, "first_name": "Harish", "tz": "Asia/Kolkata" },
  "date": "2026-07-14",
  "headline": {
    "execution_score": 82,
    "execution_score_delta": null,     // morning: null; evening: +7
    "focus_time_minutes": 380,
    "meetings": 2,
    "high_risk_tasks": 1,
    "blocked_tasks": 2
  },
  "priorities": [
    {
      "task_id": 4412,
      "title": "Implement GitHub webhook validation",
      "stars": 5,
      "effort_minutes": 120,
      "reason_codes": ["BLOCKS_N_TASKS", "RELEASE_DEPENDENCY"],
      "reason_params": { "n": 3, "release_date": "2026-07-17" }
    }
  ],
  "attention": [
    { "type": "OVERLOADED_PEER", "user": "Rahul", "load_pct": 105,
      "suggested_action": { "kind": "REASSIGN", "task_id": 453, "to_user_id": 19 } }
  ],
  "projection": { "sprint_confidence_now": 72, "sprint_confidence_if_done": 88 },
  "suppress": false,                   // see 4.3
  "suppress_reason": null
}
```

### 4.2 Ranking — never sort by due date
```
score(task) =
    0.30 · dependency_impact_norm     // how many people you unblock
  + 0.20 · risk_score
  + 0.15 · business_value             // priority × task type weight
  + 0.15 · deadline_pressure          // clamp(1 / days_to_due, 0, 1)
  + 0.10 · waiting_on_you_hours_norm  // PR/approval aging — someone is stuck
  + 0.10 · effort_fit                 // does it fit today's remaining focus time?

tie-break: shorter effort first (quick wins compound)
```

**Reason codes are an enum, not free text.** The LLM renders them; it does not invent them.

```
BLOCKS_N_TASKS · RELEASE_DEPENDENCY · WAITING_ON_YOU_XH · BLOCKING_PERSON ·
OVERDUE_XD · HIGH_RISK · QUICK_WIN · SAFE_TO_DEFER · SPRINT_CRITICAL
```

### 4.3 The empty-workspace rule
A new user with 4 tasks must **not** receive "Execution Score: 0% · 0 priorities · Focus time: 0h".
That email actively damages the product.

```
if (facts.task_count < 3 || facts.priorities.length === 0) {
  suppress = true;
  → send the onboarding nudge instead (or nothing), never the brief
}
```

**Acceptance:** golden-fixture tests over 6 synthetic workspaces (empty · tiny · healthy · on-fire ·
manager-heavy · solo-user). Snapshot the facts JSON. Diffs must be intentional.

---

## 5. PHASE 3 — NARRATION LAYER (Week 3, ~3 days)

### 5.1 Call shape
- **Model:** Haiku for IC briefs (1 call/user/day), Sonnet for manager briefs (higher stakes, lower volume).
- **Cost:** roughly $0.001–0.003 per user per day at Haiku. 1,000 DAU ≈ $60–90/mo. Budget it, alert on it.
- **Input:** the facts JSON + a fixed system prompt.
- **Output:** JSON only, Zod-validated:
  ```jsonc
  { "subject": "...", "day_characterisation": "...",
    "priority_reasons": [{ "task_id": 4412, "text": "..." }],
    "closing_recommendation": "..." }
  ```

### 5.2 The hallucination firewall (mandatory)
```js
const allowed = collectAllNumbers(facts);          // Set of every numeric token in facts
const emitted = extractNumbers(llmOutput);         // regex all digit-runs
if (emitted.some(n => !allowed.has(n))) {
  logger.warn('narration rejected: unsanctioned number', { userId, emitted });
  return deterministicNarration(facts);            // template fallback
}
```

### 5.3 Failure policy
| Failure | Behaviour |
|---|---|
| LLM timeout / 5xx / rate limit | Send **deterministic template** version. Never skip the send. |
| Validation reject | Same. Log for prompt tuning. |
| `ANTHROPIC_API_KEY` unset | Deterministic mode, feature still works. |

The deterministic renderer is not a stub — it is a first-class, always-shippable email. The LLM is an
*enhancement layer*. Build the fallback first; it makes the whole system boring and reliable.

---

## 6. PHASE 4 — EMAIL RENDERING & DELIVERY (Week 4)

### 6.1 Templating
- **MJML** (or `react-email`) → compiled HTML + **plaintext alternative** (missing plaintext part
  hurts deliverability and looks amateur in Apple Watch / screen readers).
- Table-based, inline CSS, ≤600px. **No flexbox, no grid, no SVG** — Outlook's Word renderer will
  destroy them. Score bars = table cells with background colours and fixed widths.

### 6.2 Dark mode — set expectations correctly
The spec says "support dark mode." Realistically: Apple Mail / iOS honour `prefers-color-scheme`;
**Gmail and Outlook force their own colour inversion and you cannot fully control it.**

The achievable goal is **"does not break under forced inversion"**, not "has a bespoke dark theme."
Design light, choose colours with contrast that survives inversion, add `<meta name="color-scheme"
content="light dark">`, avoid pure-white logos on transparent backgrounds. Test on Litmus or Email
on Acid before launch. Don't ship a dark theme you can't guarantee.

### 6.3 Delivery guarantees
```sql
CREATE TABLE briefing_runs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_type   TEXT NOT NULL,              -- 'morning_ic' | 'evening_ic' | 'morning_mgr' | 'evening_mgr'
  local_date   DATE NOT NULL,
  status       TEXT NOT NULL,              -- queued|generating|sent|failed|suppressed
  suppress_reason TEXT,
  facts        JSONB,                      -- the exact facts used — audit trail
  narration_source TEXT,                   -- 'llm' | 'fallback'
  provider_message_id TEXT,
  attempts     INT DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  UNIQUE (user_id, brief_type, local_date)   -- ← idempotency. Prevents double-sends on retry/restart.
);

CREATE TABLE email_events (               -- fed by Resend webhook
  id          BIGSERIAL PRIMARY KEY,
  run_id      BIGINT REFERENCES briefing_runs(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,              -- delivered|opened|clicked|bounced|complained
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```
- **Retry:** exponential backoff, max 3 attempts, then `failed` + alert.
- **Auto-suppression:** 2 hard bounces or 1 spam complaint → set `briefing_preferences.enabled = false`
  automatically. Protects the sending domain.
- **Headers:** `List-Unsubscribe` + `List-Unsubscribe-Post` (one-click). Visible "Manage briefing
  preferences" / "Unsubscribe" footer on every send. Legally required and it protects your domain reputation.

### 6.4 Scheduler design (handles all timezones with one job)
```
Hourly cron at :00 UTC
  → SELECT users WHERE briefing_preferences.enabled
      AND EXTRACT(hour FROM now() AT TIME ZONE u.tz) = prefs.send_hour
      AND EXTRACT(dow  FROM now() AT TIME ZONE u.tz) = ANY(prefs.weekdays)
      AND NOT EXISTS (SELECT 1 FROM briefing_runs
                      WHERE user_id = u.id AND brief_type = $1
                        AND local_date = (now() AT TIME ZONE u.tz)::date)
  → enqueue in batches of 50, concurrency-limited
```
Restart-safe (the `NOT EXISTS` + unique index does the work), no per-user timers, no drift.

`users.timezone` **already exists** (`schema-v5.sql:66`, `VARCHAR(50) DEFAULT 'UTC'`) — no schema
change needed here. The real gap: it's never actually populated from the browser at signup, so
every user is currently defaulted to `'UTC'` regardless of where they actually are. Fix the
signup/onboarding flow to set it from `Intl.DateTimeFormat().resolvedOptions().timeZone`, and
consider a one-time backfill prompt ("confirm your timezone") for existing users before this
feature ships — otherwise everyone's brief arrives at the wrong local hour.

---

## 7. PHASE 5 — ACTIONS & PREFERENCES (Week 5)

### 7.1 One-click actions — **NEVER MUTATE ON GET**

The mock has "Approve PR ↓ Accept" buttons. Read this carefully:

> Outlook Safe Links, Gmail's image/link proxy, and corporate mail scanners **pre-fetch every URL in
> an email**. If `GET /brief/approve?token=…` performs the approval, tasks will be approved,
> reassigned, and moved by *security scanners*, not by humans. You will not notice for weeks, and
> you will not be able to explain it.

**Correct flow:**
```
Email button → GET /brief/action?t=<signed JWT, 15-min exp, single-use, jti tracked>
             → opens Taskora with a pre-filled confirmation sheet
             → user clicks "Confirm"
             → POST via normal authenticated API → mutation
```
The token identifies the *intent*, not the authorisation. It is one click plus one confirm. That's
still dramatically better than "log in, navigate, find task, act."

```sql
CREATE TABLE briefing_actions (
  id          BIGSERIAL PRIMARY KEY,
  run_id      BIGINT REFERENCES briefing_runs(id) ON DELETE CASCADE,
  jti         UUID UNIQUE NOT NULL,
  kind        TEXT NOT NULL,          -- REASSIGN|APPROVE|REVIEW_BLOCKER|OPEN_TASK
  params      JSONB NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 7.2 Preferences
```sql
CREATE TABLE briefing_preferences (
  user_id      INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  morning_enabled BOOLEAN DEFAULT true,
  evening_enabled BOOLEAN DEFAULT false,   -- ← opt-IN, see §8
  send_hour_morning SMALLINT DEFAULT 8,
  send_hour_evening SMALLINT DEFAULT 18,
  weekdays     SMALLINT[] DEFAULT '{1,2,3,4,5}',
  channel      TEXT DEFAULT 'email',       -- future: 'slack','push'
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```
UI lives at **Settings → Notifications** (matches the `IA-002` target structure in
`MASTER_AUDIT.md:1014`, confirmed real). Manager persona is derived from
`role IN ('manager','super_boss')`, not a separate preference.

---

## 8. ROLLOUT

| Stage | Duration | Scope |
|---|---|---|
| Snapshot cron only (silent) | 2 weeks | All users. No emails. Builds trend history. |
| Internal dogfood | 2 weeks | `INTERNAL_DOMAINS` users. Morning IC brief only. |
| + Manager brief | 1 week | Internal managers |
| + Evening briefs | 1 week | Internal |
| Public beta | — | **Opt-in at signup. Morning only, by default.** |

**Default to one email per day, not two.** Two unrequested daily emails to a fresh signup is the
fastest route to a spam complaint, and a spam complaint on a shared domain hurts your password-reset
deliverability. Earn the evening brief.

**Kill switch:** `BRIEFINGS_ENABLED=false` env var. Non-negotiable for a system that emails your
entire user base on a timer.

### Success metrics (in priority order)
1. **D7/D30 retention: briefed cohort vs unbriefed cohort** ← the only one that matters
2. Action click-through rate (did anyone *act* on a recommendation?)
3. Open rate (vanity, but a leading indicator)
4. Unsubscribe rate (< 2% or the content is wrong)

If briefed users don't retain better, the feature is beautiful and worthless. Instrument for this
from day one.

---

## 9. TESTING STRATEGY

| Layer | Test |
|---|---|
| Metrics | Unit tests with fixed fixtures; every formula has a hand-computed expected value |
| Snapshots | Backfill idempotency; re-running the cron twice produces no duplicates |
| Facts builder | Golden JSON snapshots × 6 synthetic workspaces |
| Ranking | Assertion suite: "task blocking 3 others outranks task due tomorrow blocking nobody" |
| Narration | 100-run fuzz against the number-firewall; assert 0 unsanctioned numbers escape |
| Rendering | Litmus/Email on Acid: Gmail (web/iOS/Android), Outlook 2016+/365, Apple Mail — light + dark |
| Scheduler | Timezone matrix (Asia/Kolkata, America/Los_Angeles, UTC, a DST-crossing zone) |
| Delivery | Kill the process mid-send; assert no duplicate email on restart |
| Actions | Assert GET never mutates. Simulate a link prefetcher hitting every URL in a rendered email. |

---

## 10. RISK REGISTER

| Risk | Severity | Mitigation |
|---|---|---|
| LLM hallucinates a metric | **Critical** — kills trust permanently | Number firewall (§5.2) + deterministic fallback |
| GET-prefetch triggers actions | **Critical** — silent data corruption | Confirm-sheet flow (§7.1) |
| Briefing bounces poison transactional email | High | Separate sending subdomain (§0.3) |
| Empty/new workspaces get embarrassing emails | High | Suppression rule (§4.3) |
| No trend data at launch | High | Snapshot cron ships 2 weeks early (§3.2) |
| Render free tier never fires the cron | High | Starter tier + external dead-man's-switch (§0.1) — existing pings reduce but don't eliminate this risk |
| Email/app metrics disagree | High | Single canonical metrics service (§3.1) |
| AI cost scales with DAU | Medium | Haiku for IC; cost alerting; cache per (user, date) |
| Email fatigue → spam complaints | Medium | One brief/day default; opt-in evening; one-click unsubscribe |
| Everyone's timezone defaults to UTC | Medium (new — see §6.4) | Populate `users.timezone` at signup/onboarding before launch, backfill-prompt existing users |

---

## 11. HONEST ASSESSMENT

**Agree it's a genuine differentiator.** "Don't make me search for work — tell me what matters" is a
real category claim, and it's *defensible* precisely because it requires the risk/dependency/capacity
model Taskora already has and ClickUp mostly doesn't.

**Two caveats:**

**It is downstream of data density, not upstream.** A briefing engine over a workspace with 6 tasks
and 2 users produces a worse experience than no email at all. The feature's value is roughly
proportional to how much real activity is in the workspace. Which means the ClickUp parity features
that drive *adoption* (import, integrations, API) are what make this feature good. It isn't
either/or — but "P1 ahead of parity features" is only right if you have workspaces with real data to
brief on. Check that first.

**The strongest version of this is probably Slack, not email.** Email is right to build first (Resend
is already wired, and email is where a morning brief belongs), but the layered architecture above
exists so the second channel costs days, not weeks. Don't let anyone talk you into hardcoding
email-shaped assumptions into the facts builder.

**The unlock nobody's mentioned:** this engine also fixes the in-app manager experience.
`PHASE3_VALIDATION.md`'s 10-second manager test found managers score **0/6** — they open Taskora to
an empty Kanban board. The same facts + ranking that generate the morning email, rendered in-app,
*are* the Command Center landing view (`MASTER_AUDIT.md`'s own execution order agrees, independent
of this plan). Build the engine once, ship it to two surfaces, fix two problems.

---

## 12. DELIVERABLES CHECKLIST

- [ ] Phase 0: Render Starter, cron infra, migration runner, Resend subdomain + DNS, webhook endpoint
- [ ] `schema-v12.sql`: `metric_snapshots`, `briefing_preferences`, `briefing_runs`, `briefing_actions`, `email_events` — plus a signup/onboarding fix to populate the *existing* `users.timezone` column (no new column needed)
- [ ] `services/metrics/` — canonical, shared with Analytics + Command Center; built from scratch (no existing engine to extend)
- [ ] Snapshot cron **live in prod ≥2 weeks before first send**
- [ ] `services/briefing/buildContext.js` + Zod facts schema (versioned)
- [ ] `services/briefing/rank.js` + reason-code enum
- [ ] `services/briefing/narrate.js` + number firewall + deterministic fallback
- [ ] MJML templates × 4 (IC morning/evening, Manager morning/evening) + plaintext
- [ ] Scheduler + idempotent dispatch + retry/backoff
- [ ] Resend webhook → `email_events` → auto-suppression
- [ ] Signed-token action flow + confirm sheet (no GET mutations)
- [ ] Settings → Notifications preferences UI
- [ ] In-app "Today" view reusing the same engine (Command Center default for managers)
- [ ] `BRIEFINGS_ENABLED` kill switch
- [ ] Retention-cohort instrumentation
