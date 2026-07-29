# TASKORA — PHASE 1 SPEC: DESIGN SYSTEM FOUNDATION
### Re-skin target: bring the shipped app in line with `taskora_brand_system_v1.html`
### Status: do not start Phase 2 (screen re-skins) until this phase's checklist passes

---

## WHY THIS PHASE EXISTS

The brand system (dark, Syne+DM Sans, blue→teal gradient, AI-glow card motif) was
designed and approved but never implemented. The live app is currently a generic
light-mode admin template. This phase ports the *tokens* — not full screens — so
every later phase has one source of truth to pull from instead of re-deriving
colors per component.

**Do not invent new colors, radii, or fonts in this phase or any later phase.**
If a screen needs something the token file doesn't have, stop and add it to the
token file first, with a reason, then use it. This is what keeps 50 screens from
drifting into 50 slightly-different blues.

---

## DELIVERABLES FOR THIS PHASE

1. `tokens.css` — already written, attached. Import once at app root.
2. `tailwind.tokens.js` — already written, attached. Merge into `tailwind.config.js`
   `theme.extend` if the app uses Tailwind; otherwise tokens.css alone is sufficient
   and this file can be ignored.
3. Dark mode set as the **default** theme (not opt-in). The existing light/dark
   toggle in Settings (see screenshot: Settings modal, "Light mode" switch) stays,
   but it inverts — light becomes the secondary option, dark is what new users see.
4. One sample screen re-themed end-to-end as a proof-of-concept before touching
   anything else — use the **Board** view. If Board looks right with zero hacks,
   the token file is solid and Phase 2 can proceed screen-by-screen.

---

## TOKEN REFERENCE (already encoded in tokens.css — for human review)

### Surfaces
| Token | Hex | Usage |
|---|---|---|
| `--tk-bg` | `#020617` | App background |
| `--tk-bg-elevated` | `#0F172A` | Dashboard panel backgrounds, inset surfaces |
| `--tk-card` | `#0B1220` | Standard card background |
| `--tk-border` | `#1E293B` | Default border on all cards/inputs |

### Brand accent
| Token | Hex | Usage |
|---|---|---|
| `--tk-accent` | `#3B82F6` | Primary actions, links, focus states |
| `--tk-accent-2` | `#06B6D4` | Gradient endpoint, secondary accent |
| `--tk-gradient` | linear-gradient 90deg | Primary buttons, progress fills, avatars, the wordmark |

### Status (semantic — never reuse these for anything decorative)
| Token | Hex | Meaning |
|---|---|---|
| `--tk-status-ok` | `#22C55E` | Available / on track / low risk |
| `--tk-status-warn` | `#F59E0B` | Near capacity / medium risk |
| `--tk-status-danger` | `#EF4444` | Overloaded / overdue / high risk |

### Text
| Token | Hex | Usage |
|---|---|---|
| `--tk-text-primary` | `#E2E8F0` | Headings, primary copy |
| `--tk-text-secondary` | `#94A3B8` | Body copy, descriptions |
| `--tk-text-muted` | `#475569` | Metadata, timestamps, labels |

### Type
- **Display / headings / KPI numbers:** `Syne`, weight 700–800
- **Everything else:** `DM Sans`, weight 300–600
- Section eyebrows (e.g. "01 — COLOR SYSTEM") are `10px`, uppercase,
  `letter-spacing: 0.14em`, accent color, weight 600

### Radius
- Cards: `12px` (`16px` for hero containers / modals)
- Buttons / inputs: `10px`
- Pills (status badges): `20px` (fully rounded)

---

## THE ONE SIGNATURE MOTIF: AI-glow cards

This is the single most important visual idea in the brand system and the
thing most worth protecting from dilution.

**Rule:** the left-border gradient glow (`.tk-card-ai`) is reserved *exclusively*
for content the AI engine generated — predictions, risk reads, suggestions,
the "Next Best Action" card, chat responses. It must not be used as a generic
"featured card" style elsewhere. If everything gets the glow, nothing means
"the AI is talking" anymore.

Apply `.tk-card-ai` to:
- AI Insight cards (Manager Dashboard, Summary page)
- AI Risk Intelligence cards
- "Next Best Action" card (Summary screen)
- Chat assistant message bubbles (AI side only — not the user's side)

Do NOT apply it to:
- Regular task cards
- KPI stat cards
- Plain content cards (sprint progress, calendar, etc.)

---

## COMPONENT MAPPING — old generic UI → token-based primitive

Use this table when re-skinning each screen in Phase 2. Left column is what's
currently shipped (per screenshots); right column is what it becomes.

| Current (generic admin template) | Becomes |
|---|---|
| White card, soft gray shadow | `.tk-card` (dark, hairline border, no shadow) |
| Default blue button (`#1554F6`-ish) | `.tk-btn-primary` (gradient fill) |
| Outlined gray button | `.tk-btn-secondary` |
| Status badges (light bg pill) | `.tk-pill--ok` / `--warn` / `--danger` |
| Plain text "Overloaded" / "High Risk" labels | `.tk-pill--danger` |
| KPI stat cards (white, sans-serif numerals) | `.tk-card` wrapper + Syne numerals |
| Avatar circles (flat color) | `.tk-avatar` (gradient fill) |
| Workload heatmap cells (currently just colored text) | `.tk-heatcell--ok/warn/over` |
| Sprint/task progress bars (flat blue) | `.tk-progress-track` + `.tk-progress-fill` (gradient) |

---

## RULES THAT APPLY TO EVERY SCREEN, EVERY PHASE

1. **No new colors outside the token file.** If a screen seems to need a color
   the tokens don't have, that's a signal to revisit the token file, not to
   hardcode a one-off hex value in a component.
2. **No drop shadows.** The brand system uses border + subtle background shift
   for elevation, never `box-shadow` blur. This is a deliberate "flat, precise"
   feel — don't reintroduce Material-style shadows.
3. **Numerals that matter (KPIs, percentages, counts) use Syne, not DM Sans.**
   This is what gives the dashboard its "engineered" feel instead of looking
   like a spreadsheet.
4. **Status colors are semantic, not decorative.** Green/amber/red always mean
   ok/warn/danger in that order. Never use red for something that isn't bad,
   or use the accent blue/teal for a "danger" state.
5. **The gradient is for the brand's "intelligence" actions only** — primary
   CTAs, the wordmark, AI-related elements, progress fills. Don't gradient
   every button on the screen or it stops feeling intentional.

---

## ACCEPTANCE CHECKLIST — PHASE 1

```
□ tokens.css imported at app root; no component has hardcoded hex values
  duplicating a token (search for #3B82F6, #06B6D4, #0B1220 etc. outside
  the token file — should return zero matches)
□ Dark theme is the default on first load (no flash of light theme)
□ Settings light/dark toggle still works and persists per-user
□ Board view fully re-themed using ONLY tk-* primitives, zero one-off styles
□ Board view visually matches the brand system's "Task Card" section
  (see taskora_brand_system_v1.html section 05) — left risk-color strip,
  avatar, meta row, "Move Task" link styling
□ Primary button on Board ("+ Create") uses .tk-btn-primary (gradient)
□ No box-shadow anywhere in the re-themed screen
□ All status pills (priority/risk labels) use .tk-pill--ok/warn/danger,
  not ad-hoc colored text
□ Mobile check at 375px — cards don't overflow, text doesn't clip
□ Font check: KPI/stat numbers render in Syne, body text in DM Sans
```

All boxes must be checked before starting Phase 2. Phase 2 will re-skin one
screen at a time (Summary → Manager Dashboard → AI Risk Intelligence → Calendar
→ Gantt → Sprint Board) using this exact same token set with zero new tokens
unless explicitly justified and added back to `tokens.css` first.

---

## NEXT PHASE PREVIEW (do not start yet)

**Phase 2** will re-skin existing screens in this priority order, based on
which screens a buyer/evaluator will actually spend time on:
1. Board (proof of concept — done in this phase)
2. Summary/Dashboard
3. Manager Dashboard (currently the weakest screen visually — KPI cards read
   as generic template, workload chart shows a single floating bar)
4. AI Risk Intelligence (closest to "wow" already — light pass needed)
5. Calendar, Gantt, Sprint Board (lower priority, same token pass)

**Phase 3** (can run in parallel with Phase 2) fixes demo data: seed 4–5 named
team members at varied realistic load %, remove the single-admin-at-200%
pattern, populate empty states (Collaboration, Approvals, AI Predictions tabs
currently show "no data yet" messaging that reads as broken, not empty).
