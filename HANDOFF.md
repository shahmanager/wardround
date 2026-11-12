# HANDOFF.md — DeepSeek takeover brief

You (DeepSeek) are taking over Tier-1 polish and QA on **WardRound**, a Cloudflare Workers + D1 + React app built for a Technical Product Manager campus assessment (virus quarantine & treatment centre). The main session and 6 parallel agents are finishing the core build; you pick up polish, one unowned screen, QA, and the submission scaffold so the submission can wrap fast.

**The spec is law:** `PLAN.md`. **Frozen contracts:** `docs/API.md`, `docs/UI-CONTRACT.md`. **The domain is proven:** `src/domain/**` with 152 passing tests — read it, never modify it.

## 1. Thirty-second context

- One-line product: a shared ward board that tells nurses who still needs a temperature, tells doctors who is ready to see, and tells admin who can go home.
- Virus with 15% expected mortality; patient cured after **3 full days without fever**; discharge depends only on that; 74 beds, always full. Daily process per patient: nurse measures temperature, doctor visits, same day.
- Roles: **Nurse** (Asha Nair, Imran Sheikh, Kavya Reddy), **Doctor** (Dr. Vikram Rao), **Head Doctor** (Dr. Neha Kulkarni — dashboard, audit, settings), **Admin** (Priya Menon — beds, discharges, admissions, waitlist). Real server-side RBAC via signed session cookies; UI hides what a role never uses and shows disabled actions with the reason.
- Rules are numbered R1–R36 in `src/domain/rules.ts` (single source of truth; the About page renders them from code). Key ones for your work: R1 one active reading/patient/day; R3 input validation (30–45 °C, °F hint, confirm on unusual values); R16 fever-free streak (missed day breaks it); R18 doctor approves discharge; R20 admin completes it and frees the bed; R28 mortality alert in plain language.
- Design identity: hospital signage + observation chart vernacular. Tokens in `src/web/styles/index.css` (`bg-gauze text-ink text-muted bg-mercury text-signal bg-signal-tint text-done text-focus bg-chart-grid bg-tape`, `font-signage` = Barlow Semi Condensed, `font-body` = Atkinson Hyperlegible). Rows, not cards. No emoji, gradients, glassmorphism, all-caps eyebrow labels, or middle-dot meta strings. Sentence case. Status never by colour alone. WCAG AA.

## 2. Stack and how to run

- Frontend: Vite + React 19 + Tailwind v4 + React Router 7 + TanStack Query 5, TypeScript strict (`noUncheckedIndexedAccess` on — guard array access). Fonts self-hosted.
- Backend: Hono on a Cloudflare Worker (`src/worker/**`), D1 database, sessions via HMAC-signed HttpOnly cookie. Per-visitor sandbox: every visitor gets a workspace copied from the `template` workspace; "Advance to next day" moves that workspace's clock; "Reset demo data" re-copies the template.
- Local run:
  ```
  npm install                 # if node_modules missing
  npm run db:migrate:local
  npm run db:seed:template    # regenerates seed/seed-template.sql + applies locally
  npm run build
  npx wrangler dev            # http://127.0.0.1:8787  (build first — assets come from dist/)
  ```
- Sign in as any demo staff from the sign-in screen. Verify: `npx vitest run` (domain 152 + worker suite), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Deploy (Wrangler is logged in): `npm run build && npm run deploy`. Remote D1 is already migrated + seeded; remote DB only needs reseeding if the seed script changes.

## 3. State at handoff

- Done and proven: domain rules + tests; schema + migration; deterministic seed generator; API/UI contracts; CI; build pipeline; remote D1 migrated + seeded.
- Landing in parallel (6 agents): worker API + API tests; web shell (ui primitives, api client, sign-in); nurse screen; doctor queue + patient detail + observation chart + dashboard; admin screen + ward map; About page + README/DEPLOY/DECISIONS.
- **Coordinate:** before touching `mercury-gauge.tsx`, `nurse.tsx`, `ward-map.tsx`, `admin.tsx`, confirm the file exists (agents landed). If it does not exist yet, do Task 2 (audit screen) first and come back. Never edit two agents' files at once.

## 4. Your work, in order

### Task 1 — the two animations (owner: you)

**1a. Mercury rise.** On a successful "Record temperature" in the nurse bottom sheet, the MercuryGauge fill animates from yesterday's value to today's value over ~600 ms, ease-out, and turns mercury red as it crosses (or starts at) 38.0 °C. One shot, no loop. Implementation: add an optional `animateFrom?: number | null` prop to `MercuryGauge` in `src/web/components/mercury-gauge.tsx` and animate the SVG fill bar with a CSS transition (no JS animation library). From `src/web/screens/nurse.tsx`, pass yesterday's reading as `animateFrom` when it exists; keep the numeric text value updating with the same timing (or switch at the end — pick one and be consistent). Respect `prefers-reduced-motion`: render the end state instantly (the global CSS rule already nukes durations — verify it does not break the width transition into a permanent mid-state; if it does, gate the animation with a `matchMedia('(prefers-reduced-motion: reduce)')` check).

**1b. The walk out.** When admin completes a discharge, the ward map plays a one-shot ~1.2 s scene: a small pixel figure (8–12 px tall, ink colour) steps out of the freed bed, walks along the corridor toward the ward door (map edge), and fades; the bed flips to the free state as the figure leaves. No loop. Respect `prefers-reduced-motion` (skip straight to the free state). Implementation: CSS keyframes inside `src/web/components/ward-map.tsx`; `src/web/screens/admin.tsx` triggers it after a successful `api.completeDischarge` by passing the freed bed id (and corridor direction) to WardMap as e.g. `justFreed?: { bed: string }` local state, cleared after the animation (or on next query). Must not shift layout: animate an absolutely positioned SVG figure inside the map's coordinate space. Acceptable simpler version if needed: figure walks a fixed distance along the corridor and fades — note the simplification in your report.

### Task 2 — audit log screen (Tier 1, currently unowned)

- `src/web/screens/audit.tsx`, route `/audit`, gated by the `audit.view` permission (Head Doctor + Admin; everyone else gets the plain restricted-area page — copy: "This area is for the Head Doctor and Admin.").
- Table, newest first: time (day + HH:MM), actor, role, action, patient (link to /patient/:id), detail. Filters: patient (text), actor (select), action (select from the distinct actions present). Data via `api.getAudit(filters)` per `docs/API.md`. Plain ruled rows; use the shared `ui.tsx` primitives; empty state "No entries match these filters."; loading + error states.
- OPTIONAL, only if everything else is green and time remains: weekly mortality trend — small SVG bar chart on the dashboard from closed cases by week. Skip it if it would touch worker code; do not invent a new endpoint.

### Task 3 — QA pass (this is the demo the evaluator will run)

- Run the demo path (`PLAN.md` section 13) **twice**, the second time right after "Reset demo data":
  1. Nurse Asha: record 37.0 for a streak-2 patient → row moves to Done, toast "no fever", ladder reaches 3 of 3.
  2. Record again for the same patient → blocked with the "Already recorded today…" message.
  3. Enter 98.6 → °F hint. Enter 52 → hard error. Enter 40.5 → confirmation required.
  4. Nurse opens the Dashboard → "This area is for the Head Doctor."
  5. Dr. Rao: that patient is in Ready for discharge; a Waiting-for-temperature patient has Log visit disabled with the reason; approve the discharge.
  6. Admin Priya: patient in Ready to discharge; Admit blocked (no free beds); Complete discharge → bed free on the map; admit a new patient into it.
  7. Dr. Kulkarni: dashboard reads "Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)"; compliance reflects the steps above.
  8. Advance to next day → everyone back to To measure; yesterday's unmeasured show a gap. Reset restores the start.
- Check at 375 px (mobile emulation), tablet width, and desktop; keyboard-only on the nurse flow (tab order, focus visible, Esc closes modals/sheets); zero console errors; Lighthouse accessibility ≥ 90.
- Write `QA-FINDINGS.md`: one line per finding — where, what, severity (Critical / Important / Minor), fixed-or-reported. Fix CSS/copy-level issues directly. **Never change `src/domain/**` or worker business logic** — report logic issues instead.

### Task 4 — submission scaffold (last, if time)

- `submission/answers.md` with the four question headers from the assessment (Q1 user types + features per user; Q2 deployable link + screens + workflow; Q3 additional logical constraints for developers — reference the app's R-rules, disabled-with-reason actions, warnings, and RBAC denials; Q4 the sprint-prioritisation question) each with a `> Paste final answer here` marker — the human's answers are already written elsewhere; do NOT write new answer content.
- Add a screenshot checklist: sign-in; nurse sheet mid-entry; nurse Done row with gauge; doctor queue groups; patient detail with observation chart; admin ward map + Ready to discharge; dashboard mortality alert; About page top. Name the final PDF convention: `Your Name TPM.pdf`.

## 5. Hard rules

- **Never modify:** `src/domain/**`, `src/worker/**`, `docs/API.md`, `docs/UI-CONTRACT.md`, `PLAN.md`, `App.tsx`, `main.tsx`, `index.css` tokens, other agents' screens beyond the two files each animation task explicitly names.
- No new dependencies. No `Math.random` in the seed. No secrets in the repo.
- Do not commit — the main session commits. Do not run `git` commands at all.
- Every blocked or disabled action must say why and what to do next. No dead buttons, no placeholder text. The only intentional placeholders are `{{BUILDER_NAME}}`, `{{ROLE_AND_COLLEGE}}`, `{{CONTACT}}` in the About content — leave them exactly as they are (the human fills them before submission).
- Verify after each task: `npx tsc --noEmit` (your files clean; other in-flight files may error — report, don't fix), `npx vitest run` (domain 152 must stay green), `npm run build` must succeed.
- If blocked more than ~10 minutes on anything, choose the simplest honest alternative and note it in your report.

## 6. Report back

`QA-FINDINGS.md` + a summary containing: files touched, animation implementation notes (exact props/triggers), test and build outputs (counts), every deviation with a one-line reason, and anything the main session must fix before deploy.
