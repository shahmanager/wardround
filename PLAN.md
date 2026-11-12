# WardRound: build brief (final)

## 0. Read this first

You are a senior full-stack engineer, product designer and technical product manager in one. Build **WardRound**, a ward rounds and discharge tracker for a virus quarantine and treatment centre. It will be opened by an evaluator on a public Cloudflare URL for a Technical Product Manager (TPM) campus assessment. It is judged on: product thinking, correctness of the rules, engineering quality, design craft, and how clearly the thinking is explained inside the app.

Be ambitious: a real backend, real server-side RBAC, a PRD-grade About section, and a distinctive visual identity. But a working link and correct rules beat breadth. Tier 0 must be finished and deployed before Tier 1; Tier 1 before Tier 2 (see section 10).

**Working agreement**
1. **Plan first, no code.** Output: file tree, data model (tables and constraints), API list, the design plan from section 8 (pass 1), and the phase plan. Wait for approval.
2. **Spec-first.** Section 5 is the spec. Implement it as pure functions in `src/domain/` with unit tests before building screens. The React app and the Worker import the same domain module.
3. **Vertical slices, deployed continuously.** After every phase: typecheck, lint, tests, build, deploy to Cloudflare, tag `phase-N`. If you lack credentials, write the exact commands in `DEPLOY.md` and stop at that gate. Never leave `main` broken; the last good tag must always be deployable.
4. **No dead buttons, no placeholder text, no lorem ipsum.** If something is not built, it is not in the UI.
5. **Record decisions.** Every non-obvious decision goes in `DECISIONS.md` (decision, alternatives rejected, why, trade-off).
6. **Resolve ambiguity yourself** using the goals in section 1 and safety first. Do not stop to ask unless you are blocked. List every ambiguity and your resolution in the final report.

## 1. Product

**One line:** a shared ward board that tells nurses who still needs a temperature, tells doctors who is ready to see, and tells admin who can go home.

**Context (from the head doctor).** A virus with 15% expected mortality (85% success benchmark); main symptom is prolonged fever. A patient is cured after 3 full days without fever, and discharge depends only on that. 74 beds, always full, patients waiting, staff stretched. Required daily process per patient: a nurse measures temperature, then a doctor visits, the same day.

**The five problems (everything traces to these):**
1. Nobody knows who has been measured today, so some are measured twice and some not at all.
2. Nobody knows who the doctor has already visited.
3. Doctors arrive before the temperature exists and waste time.
4. Doctors forget to tell admin about discharges; patients stay 1 to 2 extra days and beds stay blocked.
5. Nobody can measure the centre's mortality against the 15% benchmark.

**Goals:** G1 every patient measured exactly once per day. G2 doctors see patients only after the temperature exists. G3 eligible patients surface automatically, with no human message. G4 discharge delay approaches zero. G5 mortality is visible against the benchmark, with the sample size shown.

**Non-goals:** diagnosis or clinical decision support, prescribing, billing, real hospital-record integration, multi-facility, patient or family access, push/SMS notifications, offline sync.

**Rule for scope:** every feature must serve a goal above or prevent a wrong or dangerous action. Tier 1 and Tier 2 features in section 10 qualify; nothing else is added.

## 2. Roles and RBAC

Three roles: **nurse, doctor, admin**. The **Head Doctor** is a doctor with `isHead = true`, which adds a few permissions. This demonstrates permission-based RBAC rather than hard-coded role checks.

Permissions are constants in `src/domain/permissions.ts`, and one function `can(user, permission, ctx?)` is used by the Worker (authoritative) and the UI (convenience).

| Permission | Nurse | Doctor | Head Doctor | Admin |
|---|---|---|---|---|
| patient.view | yes | yes | yes | yes |
| reading.record | yes | exception only (flagged) | exception only | no |
| reading.undo_own (within 5 min) | yes | no | no | no |
| reading.correct | today's reading, until the visit is logged | any open reading, with reason | same | no |
| reading.late_entry (previous day) | no | yes, with reason | yes | no |
| reading.accept_masked | no | yes, with reason | yes | no |
| visit.log | no | yes | yes | no |
| discharge.approve | no | yes | yes | no |
| discharge.complete | no | no | no | yes |
| patient.admit, waitlist.manage | no | no | no | yes |
| patient.record_death | no | yes (confirm dialog) | yes | no |
| dashboard.view (mortality, KPIs) | no | no | yes | no |
| ops.view (occupancy, delays, waitlist) | no | no | yes | yes |
| audit.view | no | no | yes | yes |
| settings.manage | no | no | yes | no |

`demo.control` (advance day, reset) is available to everyone in demo mode and is deliberately outside RBAC. The About page says so.

**Enforcement:** every API route uses `requirePermission(...)` middleware. The UI hides navigation a role never uses, and shows an action as disabled with the reason when the user could reasonably expect it (for example Log visit before a temperature exists). Direct navigation to a forbidden screen shows a plain "This area is for the Head Doctor" page, and the API returns 403 with a typed error. A test calls every mutating endpoint as every role and asserts allow or deny.

## 3. Stack and architecture

- **Frontend:** Vite, React, TypeScript (strict), Tailwind with CSS-variable design tokens, React Router (BrowserRouter), TanStack Query for server state, Zod for validation. Charts are hand-written inline SVG (no chart library). Fonts self-hosted via `@fontsource/barlow-semi-condensed` and `@fontsource/atkinson-hyperlegible`, so there are no third-party requests.
- **Backend:** Cloudflare Worker with Hono for `/api/*`, Cloudflare D1 (SQLite), migrations in `/migrations`, and Wrangler. Static assets are served by the same Worker with single-page-app fallback. Configure the Worker to run first for `/api/*` so the SPA fallback never returns `index.html` for an API call, and test that `GET /api/health` returns JSON. Check the current Cloudflare documentation for the exact `wrangler.jsonc` options before writing them.
- **Tests:** Vitest for the domain and the API.

**Folder layout**
```
src/
  domain/    config.ts types.ts rules.ts permissions.ts   (pure: no React, no storage, no Date.now)
  domain/__tests__/
  worker/    index.ts routes/ middleware/ db/ auth/        (Hono app)
  web/       app/ components/ screens/ content/about.ts styles/
migrations/  0001_init.sql ...
scripts/     seed-template.ts check-placeholders.ts
docs: README.md DEPLOY.md DECISIONS.md
```

**Auth (real server-side sessions, deliberately not OAuth).** The landing screen lists named demo staff. `POST /api/session {staffId}` issues a signed (HMAC via WebCrypto) HttpOnly, Secure, SameSite=Lax cookie containing `{staffId, workspaceId, role, isHead, exp}`. The signing secret comes from a Wrangler secret (`SESSION_SECRET`), and `.dev.vars` is gitignored. The role is read from the staff table on every request, never trusted from the client. Mutating routes also check the `Origin` header and require a JSON content type. List SSO and per-user credentials under "Production path" in the About page.

**Per-visitor sandbox.** Every visitor gets an isolated workspace so reviewers cannot corrupt each other's demo. All tables use composite primary keys `(ws_id, id)`. A `template` workspace is seeded once by `npm run db:seed:template` (deterministic, seeded PRNG). Creating a visitor workspace copies the template with a few `INSERT ... SELECT` statements; it must be fast and must not seed row by row. "Reset demo data" deletes and re-copies the visitor's workspace. "Advance to next day" changes only that workspace's clock. Stale workspaces (older than 7 days) are purged lazily on creation, and there is a cap (for example 300 active workspaces) that returns a friendly 503 when reached.

**Database enforcement (the database is the last line of defence)**
- Partial unique index on active readings: `UNIQUE (ws_id, patient_id, day) WHERE status = 'active'`.
- One visit per patient per day: `UNIQUE (ws_id, patient_id, day)` on visits.
- One patient per bed: a unique constraint on occupied beds.
- CHECK constraints on status values and temperature range; foreign keys on.
- Corrections never UPDATE history away: insert a new reading that supersedes the old one (`supersedes_id`, `reason`).
- Every mutation validates with Zod, runs domain rules, and writes the change plus the audit row in one D1 batch (atomic). Errors return `{ error: { code, message } }` with stable codes the UI maps to its blocked-action copy.
- Derived values (streak, eligibility, delay) come from domain functions over readings and events. Do not store what you can derive, except where needed for metrics, and then document it.

**Time.** Never call `Date.now()` or `new Date()` in domain logic. A workspace clock holds `current_day` (ISO date); "today" always means that day. Audit timestamps combine `current_day` with real wall-clock time.

**Security basics.** Synthetic data only, with no real names or hospitals. No secrets in the repo. Input size limits. Basic security headers including a restrictive CSP.

**Observability.** `GET /api/health`, a request id on every log line, structured console logs, an error boundary in the React root, and a friendly error screen.

**SE practices.** Conventional commits, one commit per logical change; GitHub Actions workflow (typecheck, lint, test, build); README; DEPLOY.md with exact commands for `wrangler login`, `d1 create`, migrations, `secret put SESSION_SECRET`, and deploy; DECISIONS.md.

## 4. Domain model

**Patient status:** `ADMITTED` → `DISCHARGE_APPROVED` → `DISCHARGED`; or `ADMITTED` / `DISCHARGE_APPROVED` → `DECEASED`. `DISCHARGED` and `DECEASED` are terminal and read-only.

**Patient-day state (derived):** `TO_MEASURE` → `MEASURED` → `VISITED`. Flags: `NEEDS_ATTENTION`, `MASKED`, `ELIGIBLE`, `DELAYED`, `MISSED_YESTERDAY`, `LATE_ENTRY`.

**Streak example (use in tests and the About page; today = D):**

| D-3 | D-2 | D-1 | D | Streak | Eligible |
|---|---|---|---|---|---|
| 37.1 | 37.0 | 36.9 | 36.8 | 3 (counts back from D, stops at 3) | yes |
| 37.1 | 38.2 | 36.9 | 36.8 | 2 (fever at D-2 stops the count) | no |
| 37.1 | 37.0 | none | 36.8 | 1 (missed day D-1 stops the count) | no |
| 37.1 | 37.0 | 36.9 | none | 3 (D not yet measured, counts from D-1) | yes (needs today's reading before approval) |
| 37.1 | 37.0 (masked) | 36.9 | 36.8 | 2 (masked day does not qualify) | no |

## 5. Rules (the spec)

**Config** in `src/domain/config.ts`, with no magic numbers elsewhere: `FEVER_THRESHOLD_C=38.0`, `TEMP_HARD_MIN=30.0`, `TEMP_HARD_MAX=45.0`, `TEMP_ATTENTION_LOW=35.0`, `TEMP_ATTENTION_HIGH=40.0`, `JUMP_CONFIRM_C=2.0`, `STREAK_DAYS_FOR_CURE=3`, `CAPACITY=74`, `MORTALITY_BENCHMARK=0.15`, `MORTALITY_AMBER_FROM=0.13`, `MIN_SAMPLE_FOR_BENCHMARK=20`, `UNDO_WINDOW_MIN=5`, `ANTIPYRETIC_WINDOW_H=6`.

Export a rules registry from `rules.ts`: `{ id, title, description, appliesTo }[]`. The About page renders its rules table from this registry, and tests are named by rule id (for example `R16: missed day breaks the streak`).

**Temperature readings**
- **R1** One active reading per patient per day. A duplicate is blocked: "Already recorded today: 37.2 °C at 09:14 by Nurse Asha. Use Correct reading if this was wrong."
- **R2** Readings are for the current day only; no future dates. A missed day stays a visible gap. (Late entry is the single exception, R9.)
- **R3** Input is a number with at most one decimal (accept a comma). Outside 30.0 to 45.0 is a hard error ("Check the thermometer and re-enter"). A value from 90 to 110 gets the message "That looks like °F. Enter the reading in °C, for example 37.0." Saving needs an explicit "Yes, this reading is correct" if the value is below 35.0, at or above 40.0, or differs from the previous reading by 2.0 °C or more.
- **R4** Fever means a reading at or above 38.0 °C. Show the result to the nurse immediately after saving.
- **R5** `NEEDS_ATTENTION` flag if the reading is below 35.0 or at or above 40.0. It pins the patient to the top of the doctor's queue. This is the only alert-style flag in the app; alerts stay rare so they stay meaningful.
- **R6 [Tier 1]** Masked readings: the nurse sheet asks "Fever-reducing medicine given in the last 6 hours?" If yes, the reading is saved and flagged `MASKED`, and it does not qualify toward the streak (it breaks the count). A doctor may accept it with a reason, and the acceptance is audited. The question and window are configurable, and the open question about this is listed in the About page.
- **R7 [Tier 1]** Undo: a nurse may void their own reading within 5 minutes without a reason; the patient returns to `TO_MEASURE`; it is audited.
- **R8** Correction: a nurse may correct today's reading with a mandatory reason until the doctor's visit for that day is logged; after that only a doctor can. The original is kept, superseded, never deleted.
- **R9 [Tier 1]** Late entry: a doctor may enter a reading for the previous day only, with a reason; it is flagged `LATE_ENTRY`, the streak is recomputed, and R19 may fire.
- **R10** Readings only for patients with status `ADMITTED` or `DISCHARGE_APPROVED`.
- **R11** A doctor may record today's temperature themselves (the exception path). It is saved with `recordedByRole = DOCTOR`, requires a reason, and is counted on the dashboard as a process exception.

**Doctor visits**
- **R12** One visit per patient per day.
- **R13** A visit cannot be logged until today's reading exists. The Log visit action is shown disabled with the reason ("Temperature not recorded yet"), and the doctor can use R11 from there.
- **R14** A visit may include an optional treatment note.
- **R15** A patient admitted today needs a reading and a visit today.

**Cure and discharge**
- **R16** Fever-free streak: start from today if today has a qualifying reading, otherwise from yesterday; count backwards over consecutive calendar days that each have an active, non-masked reading below 38.0. Stop at the first fever, masked reading, or missing day, or the day before admission. A missed day breaks the streak: we cannot claim a full fever-free day we did not measure, and with 15% mortality a wrong early discharge costs more than an extra bed-day.
- **R17** Eligible when streak is 3 or more. Eligibility is computed by the system and never typed in. The moment a patient becomes eligible they appear in Admin's "Eligible, awaiting doctor sign-off" list and pinned at the top of the doctor's queue with a "Ready for discharge" chip. This removes the "doctor forgot to tell admin" failure.
- **R18** Only a doctor can approve a discharge, only for an eligible patient who has a reading today. Status becomes `DISCHARGE_APPROVED`. Approving counts as today's visit if none was logged.
- **R19** If a later event invalidates eligibility (a correction turns a reading into a fever, a masked flag, a late entry), an approval is revoked automatically, status returns to `ADMITTED`, the audit entry says why, and both doctor and admin see a notice.
- **R20** Only admin can complete a discharge, only from `DISCHARGE_APPROVED`. The bed is freed at that moment and the outcome is recorded as cured.
- **R21** A patient who is `DISCHARGE_APPROVED` but still in a bed on a later day still needs a temperature and a visit, and Admin sees "Discharge delayed N day(s)".

**Death**
- **R22** Only a doctor can record a death, from any non-terminal status, behind a confirmation dialog that names the patient and bed. The bed is freed. It is irreversible in the prototype.
- **R23** Discharged and deceased records are read-only for everyone.

**Admission and capacity**
- **R24** Admit is blocked at 74 occupied beds: "No free beds. Complete a pending discharge to free one." with a link to the discharge list.
- **R25** Admission needs name, age (0 to 120), sex, and a free bed chosen from a list of free beds only. A current patient with the same name and age triggers a "Possible duplicate" confirmation. Two patients can never hold one bed (database constraint).
- **R26 [Tier 1]** Waitlist: admin-managed, first in first out, shown with its length and longest wait. Admitting from the waitlist pre-fills the form and asks only for the bed.

**Metrics**
- **R27** Mortality rate = deaths ÷ (deaths + cured discharges), closed cases only, since the centre opened. Current patients are excluded because their outcome is unknown. Always show the numerator and denominator.
- **R28** Above 15%: red alert in plain language, "Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)". From 13% to 15%: amber. With fewer than 20 closed cases: show the figure with "Sample too small to compare reliably" and no alert.
- **R29** Daily compliance: patients with a reading today ÷ patients in beds, and the same for visits, with the list still pending. Also "visits logged after the temperature" ÷ visits (target 100%).
- **R30** Discharge delay = days from the day a patient first became eligible to the day admin completed the discharge. Show the average over discharged patients and the count currently delayed. Also show "bed-days held after eligibility" (the sum of those delays) as the capacity cost of late discharge.

**Cross-cutting**
- **R31** Permissions are enforced on the server for every action (section 2).
- **R32** Every create, correction, undo, visit, approval, revocation, discharge, admission and death is written to an append-only audit log (who, role, what, when, why) in the same transaction. Nothing clinical is hard-deleted.
- **R33** "Today" comes from the workspace clock, not the device clock.
- **R34** If two users act on the same patient at once, the first valid write wins and the second user sees the saved value (via the R1 message).
- **R35** Every blocked action says why and what to do next.
- **R36** A reading attempted with no connection is not shown as saved; the user is told to retry. (Offline entry is out of scope.)

## 6. Screens

**App shell.** Top bar: product name, signed-in user and role, the demo day ("Day: Thu 12 Nov"), the demo menu (Advance to next day, Reset demo data, each behind a confirm that names the consequence), and a link to About. A thin caution-tape strip across the very top with the text "Demo ward: fictional patients" marks that nothing is real. Below it, a live "ward strip" of counts relevant to the role (for example measured 41 of 74, visited 12, ready for discharge 3). On mobile, demo controls and role switching collapse into one menu.

**Sign-in.** Four role groups, each with one sentence on what that role does in the app and its named demo staff. One line: "Demo mode: choose a person to sign in as. In production each user signs in with their own account." Signing in creates the workspace.

**Nurse: Today's rounds (mobile-first).** Progress "41 of 74 measured". Tabs: To measure (default) and Done; sorted by bed so the nurse walks the ward in order; search by name or bed. Row: bed tag, name, yesterday's reading, streak ladder, mercury gauge on Done rows. Tapping a row opens a bottom sheet whose header always shows bed, name, age and yesterday's reading (wrong-patient guard), one large numeric input in °C (`inputMode="decimal"`), the medicine question (R6), and the primary action "Record temperature". Inline validation per R1 to R4. After saving: toast "Bed A-12: 37.1 °C recorded, no fever", the sheet closes, the row moves to Done, and focus moves to the next patient to measure ("Save and next"). Done rows show value, time, recorder, and "Correct reading" or "Undo" where allowed. Empty state: "All patients measured today."

**Doctor: Today's visits.** On tablet and desktop, a two-pane layout: queue on the left, patient chart on the right. Groups in order: Needs attention, Ready for discharge, Ready to visit, Waiting for temperature (Log visit disabled with the reason), Visited today. Sort within Ready to visit: eligible first, then highest temperature today.

**Patient detail (all roles; actions follow RBAC).** Header: name, age, bed, day of stay, status. Observation chart (see section 8). Streak ladder with text ("2 of 3 fever-free days"). Actions per role; disabled actions stay visible with helper text. Activity log for this patient, newest first.

**Admin: Beds and discharges.** Summary "74 of 74 beds occupied, 3 ready to discharge". Section 1, Ready to discharge (doctor approved): "Complete discharge" with a delay chip. Section 2, Eligible, awaiting doctor sign-off: read-only. Section 3, ward map (see section 8): clicking a free bed starts admission with that bed preselected. Waitlist (Tier 1). "Admit patient" per R24 and R25.

**Dashboard (Head Doctor).** Lead with one plain-language sentence, for example "Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)", then the supporting figures: outcomes, today's compliance with pending names, occupancy, average length of stay, average discharge delay, bed-days held after eligibility, and process exceptions for the last 7 days (missed readings, doctor-recorded readings). Weekly mortality trend (Tier 1).

**Audit log (Tier 1, Head Doctor and Admin).** Filter by patient, actor and action.

**About (all roles).** See section 9.

## 7. Seed data

A deterministic generator (fixed seed, seeded PRNG, no `Math.random`) builds the `template` workspace. Demo start day is a fixed date. Use plausible Indian names; all data is fictional.

- Staff: three nurses (Asha Nair, Imran Sheikh, Kavya Reddy), two doctors (Dr. Vikram Rao, Dr. Neha Kulkarni, who is the Head Doctor), one admin (Priya Menon).
- 74 admitted patients in beds A-1 to B-34 (wing A 1 to 40, wing B 41 to 74), admitted 1 to 14 days before the start day, each with a realistic daily reading history except where stated below.
- State at the start of the demo day:
  - About 45 not yet measured today and 29 measured; of those 29, about 12 already visited.
  - 4 patients with a streak of 2 and no reading today (a normal reading today makes them eligible live).
  - 3 eligible now, awaiting sign-off, of which 2 already have a reading today (approvable now) and 1 does not (approval disabled with the reason).
  - 2 patients `DISCHARGE_APPROVED`, one approved yesterday (shows the delay chip).
  - 3 patients with one missed day in the past week (visible gap, broken streak).
  - 2 patients with a reading of 40.0 or higher yesterday, and 1 with a masked reading yesterday.
  - 10 patients on the waitlist.
- 40 closed historical cases: 33 discharged as cured and 7 deceased, so mortality is 17.5% and the alert is visible on first load. Include eligible and discharge days so average discharge delay is about 1.2 days.

## 8. Design system and visual identity

**Process (two passes, before any UI code).** Pass 1: write a compact design plan with named colour tokens (4 to 6 base hex values), type roles, a layout concept in one-sentence prose plus ASCII wireframes for the nurse round sheet and the ward map, and the principles. Pass 2: review the plan against the generic AI-design defaults listed below; if any part reads like a default rather than a choice made for this subject, revise it and say what changed and why. Only then build. Critique your own screens as you build (take screenshots if your environment allows).

**Concept: ward signage and the observation chart.** The subject's own vernacular: hospital wayfinding signage, bed tags and wristbands, the paper observation (TPR) chart on pale grid paper, and the mercury thermometer. The identity comes from these, not from a generic dashboard kit.

**Spend boldness in one place:** the **mercury gauge** and the **observation chart**. Everything around them stays quiet and disciplined.

**Palette (tokens; verify every text and background pair meets 4.5:1 and darken as needed):**
- Gauze `#EDF1F2` page background (cool, pale).
- Ink `#13222E` text and primary buttons.
- Muted `#566876` secondary text.
- Mercury `#C62F18` fever, needs-attention and the alert, and nothing else.
- Signal amber text `#8A5200` on tint `#FBE8BD` for warnings and delays.
- Done green `#1E7A4A` for completed and fever-free.
- Focus blue `#2457C5` for focus rings and links.
- Chart grid `#CFE0DA` used only behind the observation chart.
- Caution-tape yellow `#F5C400` with ink stripes, used only for the demo strip.

**Type:** two clearly distinct families. **Barlow Semi Condensed** (signage-like) for headings, bed tags, temperatures and counts, with tabular numerals. **Atkinson Hyperlegible** (designed for legibility) for body text, forms and tables. Sentence case. Body at least 16 px; line length under 80 characters. Use a defined type scale with intentional weights.

**Signature components**
- **Bed tag:** a small tag shaped like a ward bed label with a punched hole detail, showing wing letter and number (for example "A-12") in Barlow Semi Condensed.
- **Mercury gauge:** a horizontal scale from 35 to 42 °C with a tick at 38.0, filled to today's reading (Ink normally, Mercury at 38.0 or above), a hollow marker for yesterday, and the numeric value always shown as text. Exposed as an accessible image with a text alternative.
- **Streak ladder:** three rungs that fill as fever-free days accrue, with the text "2 of 3 fever-free days".
- **Observation chart:** inline SVG on the pale grid, day on the x axis, 35 to 41 °C on the y axis, a dashed line at 38.0, points differing by shape as well as colour (circle normal, triangle fever, diamond masked), missed days shown as gaps with a "no reading" marker, plus a plain table of the same data below.
- **Ward map:** a floor plan, not a spreadsheet grid: two wings of beds in bays of four along a central corridor with a nurse station, each bed showing occupied (name on hover or focus), free, or ready to discharge, by icon and label as well as colour.
- **Rows, not cards:** lists are ruled rows with clear hierarchy. Do not nest cards in cards.

**Motion.** Only motion that answers a user action: a saved row moves to Done, a ladder rung fills, a discharged bed becomes free on the map. About 150 to 250 ms. No page-load entrances, no hover lifts on everything. Respect `prefers-reduced-motion`.

**Avoid these generic AI-design defaults** (they appear regardless of subject): warm cream background with a serif and a terracotta accent; near-black with a single acid accent; broadsheet hairline columns with zero radius; the SaaS-card kit (identical rounded cards, one radius everywhere, the same soft shadow, gradient washes); template chrome such as tracked all-caps eyebrow labels above headings, middle-dot meta strings, monospace for small labels, arrows appended to buttons. Also no emoji, glassmorphism or stock illustration. Use different radii for different roles (inputs, tags, chips), and one shadow style only where something truly floats (sheets, dialogs).

**UX rules to apply and be able to justify** (list the ones you applied in `DECISIONS.md`):
- Nielsen's heuristics: visibility of system status, error prevention, recognition over recall, consistency, help users recover from errors.
- Medical UX: error-proof the wrong-patient case (name, bed, age and last reading in the sheet header); proportionate confirmation (undo for reversible actions, confirm dialogs only for irreversible ones: death, discharge, advance day, reset); alarm fatigue (few alerts, each specific).
- Laws of UX: Fitts (large targets for the most frequent action), Hick (one primary action per screen), Miller (chunked groups), Doherty (feedback under 400 ms, with optimistic updates and skeletons).
- Material Design and Apple HIG layout basics: 8 px spacing grid, touch targets at least 48 px on the nurse flow (never below 44 px anywhere), clear state styling (hover, focus, pressed, disabled).
- WCAG 2.2 AA: contrast 4.5:1 for text, status never by colour alone (icon plus text), visible focus rings, labelled inputs, dialogs that trap focus and close on Escape, `aria-live` toasts, keyboard-only operation, semantic HTML.
- Responsive: nurse flow usable one-handed at 375 px; doctor on tablet; admin and dashboard use desktop width well.
- Every list has an empty state that invites action. Every screen has loading and error states.

**Copy.** Plain, specific, sentence case, active voice. Buttons say what happens ("Record temperature", "Approve discharge"), and the same verb is used in the toast ("Temperature recorded"). Errors say what happened and how to fix it, and never apologise.

## 9. About section (`/about`): the product thinking, inside the app

Linked from the header on every screen. Desktop: sticky side navigation; mobile: tabs. All copy lives in `src/content/about.ts` as typed data so the human can edit it without touching components. The rules table and the RBAC matrix are **generated from the code** (`rules.ts`, `permissions.ts`) and the page says so, so documentation cannot drift from the implementation. Never invent statistics: where a baseline is unknown, say "baseline unknown, to be measured in a pilot".

1. **Product brief (PRD)** (anchor `#prd`)
   - Problem and context in the head doctor's terms; goals and non-goals.
   - Personas (nurse, doctor, head doctor, admin): job to be done, pains today, what WardRound changes.
   - Success metrics table: north star = discharge delay (days from eligible to discharged); input metrics = temperature compliance, visits logged after the temperature, doctor sign-off latency; guardrails = mortality versus 15% with sample size, zero discharges without a reading on the approval day, process exceptions trending down. Targets are labelled "proposed, to validate with the head doctor".
   - Requirements by priority (must, should, could, won't) mapped to rule ids.
   - Eight user stories with Given/When/Then acceptance criteria covering the core loop.
   - Non-functional requirements: security, privacy (India's DPDP Act applies before any real patient data), availability, accessibility, feedback speed.
   - Risks and mitigations: alarm fatigue, wrong-patient entry, data-entry burden on understaffed nurses, connectivity, data trust, clinical liability (the doctor decides; the system removes the delay, not the decision).
   - Rollout: shadow one shift beside the paper journal, then one ward with a champion nurse, then the whole centre, each with exit criteria; a downtime plan (paper fallback, back-entry through late entry); under 10 minutes of training per role.
2. **How it works:** the patient-day state machine as a simple diagram, the streak worked example from section 4, and the generated rules table with the reasoning for the important rules.
3. **Architecture:** a diagram (screens, API with RBAC middleware, domain rules shared by both, D1 with constraints, audit log), the generated RBAC matrix, the data model summary, the sandbox design, and the engineering practices used.
4. **Decisions:** from `DECISIONS.md`, each with the alternative rejected and why. At minimum: missed day breaks the streak; doctor approves and admin executes; real server-side sessions with demo accounts, not OAuth; per-visitor sandbox; database constraints for the key rules; mortality excludes current patients; masked readings do not qualify.
5. **Scope and roadmap:** what is in version 1 and what is deliberately left out and why; Now, Next, Later with a one-line reason each (single sign-on and per-user credentials, notifications for newly eligible patients, offline entry, hospital-record integration, nurse-to-patient assignment, shift handover, multi-ward, data export, backups and monitoring).
6. **Assumptions and open questions for the head doctor:** fever threshold 38.0 °C and whether it depends on measurement site; whether "3 full days" means three consecutive daily readings or 72 hours; how fever-reducing medicine should count; whether a missed day should reset the streak.
7. **Production path:** what changes before real use (per-user accounts and single sign-on, audit immutability, backups, monitoring, rate limiting, data-protection compliance, clinical sign-off on the rules).
8. **Demo guide:** the numbered path from section 13.
9. **About the builder:** fields `{{BUILDER_NAME}}`, `{{ROLE_AND_COLLEGE}}`, a short paragraph on how I approached the problem, a short honest paragraph on how I used AI and how I verified the output (tests, rules registry, manual demo runs), what I would do next with the team, and contact. Leave `{{...}}` placeholders in the content file for the human to fill, and add `npm run check:placeholders`, which fails if any `{{` remains. Do not include it in `npm test`; run it in `npm run release`.

## 10. Tiers

- **Tier 0 (must, complete and deployed first):** all rules not tagged Tier 1; RBAC; D1, migrations, sandbox, sessions; screens: sign-in, nurse rounds, doctor visits, patient detail, admin beds and discharges (with ward map), dashboard, About; seed; domain and API tests; CI; README, DEPLOY.md, DECISIONS.md.
- **Tier 1 (build in this order after Tier 0 is stable):** R6 masked readings, R7 undo, R9 late entry, R26 waitlist, audit log screen, weekly mortality trend, a guided demo tour (coach marks following section 13).
- **Tier 2 (only if time remains):** night mode (a deep navy-ink palette, same tokens, chosen because night shifts exist), a print-friendly end-of-shift handover sheet, keyboard shortcuts for the nurse flow, a Playwright smoke test of the demo path, automated accessibility checks.

## 11. Tests (required)

**Domain (Vitest), named by rule id:** streak with 3 clean days; fever on day 2 resets; missed day breaks; masked day does not qualify; streak when today is not yet measured; streak does not count days before admission; duplicate reading blocked; range and warning bands at exact boundaries (29.9, 30.0, 34.9, 35.0, 37.9, 38.0, 39.9, 40.0, 45.0, 45.1) and the 2.0 °C jump rule; °F hint for 98.6; visit blocked without a reading; approve blocked when not eligible; correction to a fever revokes approval; admit blocked at capacity; duplicate patient warning; mortality with zero closed cases does not divide by zero; below minimum sample shows no alert; amber band at 13% to 15%; undo window boundary at 5 minutes. Add property-based tests (fast-check) for the streak: it never exceeds the number of qualifying readings, and a missing day never increases it.

**API:** a permission-matrix test (every mutating endpoint, every role); one reading per day enforced by the database even if the domain check is bypassed; the audit row is written with each mutation; session cookie tampering is rejected; workspace isolation (one workspace cannot read or write another's rows); `/api/health` returns JSON.

`npm run test`, `npm run typecheck`, `npm run lint` and `npm run build` must all pass.

## 12. Phases and gates

Commit and tag after each phase and give a brief summary.

- **P0** Scaffold, tooling, CI, Cloudflare Worker with static assets, `/api/health`, deploy. *Gate:* live URL, health returns JSON, refreshing a deep link works.
- **P1** Domain: config, types, rules registry, permissions, tests green.
- **P2** Database, migrations, template seed, workspace copy, sessions, RBAC middleware, API tests. *Gate:* sign in as each role via the API; forbidden calls return 403.
- **P3** Design plan (pass 1 and 2) approved, tokens, app shell, nurse vertical slice end to end. Deploy.
- **P4** Doctor slice: queue, blocked visit, exception reading, approve, auto-revoke. Deploy.
- **P5** Admin slice: ward map, complete discharge, admit, capacity block. Deploy.
- **P6** Patient detail with observation chart, dashboard, demo controls.
- **P7** About section (all nine parts), builder placeholders, README, DEPLOY.md, DECISIONS.md.
- **P8** Tier 1 features in order, then Tier 2 if time remains.
- **P9** Polish: accessibility pass, keyboard-only pass, 375 px pass, Lighthouse accessibility at least 90, run the demo path twice (the second time after Reset demo data), fix what breaks.

## 13. Demo path (must work end to end; test it yourself)

1. Sign in as Nurse Asha. Record 37.0 for a patient with a streak of 2. The row moves to Done, the toast says no fever, and the ladder reaches 3 of 3.
2. Try to record the same patient again: blocked with the R1 message.
3. Enter 98.6: the °F hint. Enter 52: hard error. Enter 40.5: confirmation required.
4. Open the Dashboard as the nurse: "This area is for the Head Doctor" (and the API returns 403).
5. Switch to Dr. Rao. The patient from step 1 is in Ready for discharge. A patient in Waiting for temperature has Log visit disabled with the reason. Approve the discharge.
6. Switch to Admin Priya. The patient is in Ready to discharge. Try Admit first: blocked, no free beds. Complete the discharge: the bed is free on the ward map. Admit a new patient into it.
7. Switch to Dr. Kulkarni (Head Doctor). The dashboard reads "Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)", and today's compliance reflects the steps above.
8. Advance to next day: everyone returns to To measure and yesterday's unmeasured patients show a gap in their chart. Reset demo data restores the start.

## 14. Definition of done

- Live Cloudflare URL works on a phone in a private window; refreshing any route works; first load is populated.
- Each role completes its main flow; the demo path passes twice.
- Tests, typecheck, lint and build pass; CI green.
- Lighthouse accessibility at least 90; keyboard-only operation works; no console errors.
- The About page matches the implemented rules (generated tables), and `check:placeholders` is wired into `npm run release`.
- README, DEPLOY.md and DECISIONS.md are complete; no secrets in the repo.

**Final report must include:** what was built, test/build/deploy results with the live URL, what was skipped or simplified, every ambiguity and how you resolved it, and the list of `{{placeholders}}` the human must fill in.

## 15. Do not

- Add OAuth, passwords, email flows, or any third-party network requests from the browser.
- Use real patient data, real hospital names, or store clinical data in localStorage.
- Put business logic in components, or call `Date.now()` in the domain.
- Add features outside section 10, or leave placeholder text, dead buttons, or "coming soon" screens.
- Use gradients, glassmorphism, emoji, stock illustration, nested cards, all-caps eyebrow labels, or middle-dot meta strings.
