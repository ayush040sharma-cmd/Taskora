# TASKORA — LOGO IMPLEMENTATION
### Ready-to-paste Claude Code prompt · Diagnose-first · Single scoped batch

---

## 🚨 STEP 1 — DIAGNOSE ONLY (do not write code yet)

Before touching anything, scan the codebase and report back:

1. Every file that currently renders the Taskora name/logo as UI — navbar, sidebar, login/auth screens, loading/splash screen, browser tab title, `<meta>` tags, README, `package.json` "name"/"description" fields, and any hardcoded "Taskora" text or existing logo image/SVG.
2. The exact file path + line number for each occurrence.
3. Where `favicon.ico` / `index.html` `<link rel="icon">` tags currently point, and what asset they currently reference.
4. Whether there's an existing `Logo` or `Brand` component already being reused across screens, or whether the name is hardcoded independently in each file (this changes how risky the change is).
5. Complexity rating (S/M/L) for the full swap based on what you find.

Do not modify any files in this step. Output the diagnosis report only and wait for confirmation before proceeding to Step 2.

---

## 🎯 STEP 2 — SCOPED IMPLEMENTATION (after diagnosis is confirmed)

### Assets (already finalized — do not regenerate or reinterpret the mark)

Save these two files exactly as provided into `frontend/public/`:

**`taskora-mark.svg`** (icon only, gradient version — primary asset)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="taskoraGradient" x1="8" y1="20" x2="94" y2="90" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <path d="M8 20 L62 20 L94 28 L62 36 L43 36 L43 90 L27 90 L27 36 L8 36 Z" fill="url(#taskoraGradient)"/>
</svg>
```

**`taskora-mark-solid.svg`** (single-color fallback, for contexts that can't render gradients)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M8 20 L62 20 L94 28 L62 36 L43 36 L43 90 L27 90 L27 36 L8 36 Z" fill="#E2E8F0"/>
</svg>
```

### Rules

- **Do not** regenerate, re-draw, or "improve" the mark's path data. Use the exact `d` attribute above everywhere the icon appears.
- **Do not** bake the wordmark into an SVG/image. The wordmark stays as live text (`taskora`, lowercase, Syne font-family, weight 800, gradient via `background-clip: text` — reuse the `.grad-text` pattern already in `tokens.css` if present, otherwise add it there, not inline).
- Create (or update, if one exists) a single reusable `Logo` component that renders icon + wordmark together, with props to render icon-only. Every screen that shows branding must use this component — no independent hardcoded copies.
- Update `index.html`:
  - `<link rel="icon" type="image/svg+xml" href="/taskora-mark.svg" />`
  - Add `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` (see PNG export note below)
  - Update `<title>` if it still says the old placeholder name
- Generate PNG exports from `taskora-mark.svg` at 512×512, 192×192, 180×180 (apple-touch-icon.png), and a bundled `favicon.ico` (16/32/48). Use `sharp` or an equivalent already in `package.json`; if nothing suitable is installed, flag it in the diagnosis rather than installing new dependencies without confirmation.
- Update `package.json` `name`/`description` and `README.md` header only if they still reference placeholder branding — do not rewrite unrelated README content.

### Explicitly out of scope for this batch

- No changes to color tokens, component styling, or layout beyond the logo swap itself.
- No changes to the dashboard, task cards, or any other screen content.
- No new dependencies unless flagged and confirmed first.

---

## ✅ ACCEPTANCE CHECKLIST

```
□ Diagnosis report delivered and confirmed before any code was written
□ taskora-mark.svg and taskora-mark-solid.svg saved to /public exactly as provided, path data unmodified
□ Single reusable Logo component created/updated — no duplicate hardcoded logo markup remaining anywhere
□ Wordmark remains live text (Syne 800, lowercase, gradient text-clip) — not baked into an image
□ Favicon + apple-touch-icon + all PNG sizes generated and linked correctly in index.html
□ No existing screen, layout, or component broken (manual check + no console errors)
□ Diffs shown for every changed file before considered complete
□ No unrelated changes outside the logo swap
```

Show diffs for every file touched. Wait for explicit confirmation before considering this batch done.
