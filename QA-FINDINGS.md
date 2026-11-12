# WardRound — QA findings

Run window: 12 Nov 2026, 17:40–18:05 IST (Asia/Calcutta). Operator: QA/Tier-1 polish agent.
Environment: Windows, Node v24.20.0, Vite 6.4.6, Vitest 3.2.7, repo at
`C:\Users\Devam Shah\Downloads\factwise test\WardRound`.

Status at time of writing: **end-to-end demo QA is BLOCKED** — the production build
does not complete because screens owned by other in-flight agents are missing or
truncated, and the Worker API is missing three routes the UI calls. Everything that
could be checked without a running app is below; the demo-path matrix is marked
pending and must be re-run once the build is green.

## 1. Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Domain tests | `npx vitest run` | **PASS — 152/152 tests, 4 files** (metrics 26, flow 65, streak.property 18, temp-and-streak 43), 6.82 s |
| Typecheck | `npx tsc --noEmit` | **FAIL — 92 errors** across 15 files (breakdown below). Files touched by this task are clean. |
| Production build | `npm run build` | **FAIL** — `[vite:load-fallback] Could not load …/src/web/screens/dashboard (imported by src/web/app/App.tsx): ENOENT`; 50 modules transformed before the failure. |
| Lint | `npm run lint` | not run: build/typecheck gates fail first; re-run after the app is green. |

Typecheck error breakdown by file:

```
47  src/web/screens/patient-detail.tsx
 9  scripts/seed-template.ts
 9  src/web/screens/doctor.tsx
 9  src/worker/routes.ts
 6  src/web/app/App.tsx
 3  scripts/check-placeholders.ts
 2  src/domain/flow.ts
 1  src/domain/__tests__/*.test.ts and helpers.ts (4 files)
 1  src/domain/dates.ts
 1  src/worker/auth.ts
 1  src/worker/middleware.ts
```

## 2. Findings

Severity: Critical = blocks the demo or the build; Important = user-visible bug or contract
violation; Minor = polish. "Reported" means the file belongs to another agent or is frozen
by the brief (`src/domain/**`, `src/worker/**`, `App.tsx`).

| # | Where | Finding | Severity | Status |
| --- | --- | --- | --- | --- |
| F1 | `src/web/screens/dashboard.tsx` (missing) | `src/web/app/App.tsx:20` imports `DashboardScreen`; the file does not exist, so `vite build` fails. Demo step 7 cannot run. | Critical | Reported (owner: doctor-agent screen set) |
| F2 | `src/worker/routes.ts` | Only 18 routes are registered; `GET /api/audit`, `GET /api/dashboard` and `GET /api/beds` are **missing** even though `api.ts` and the screens call them. Audit screen, admin ward map and dashboard cannot load. | Critical | Reported (worker frozen by brief) |
| F3 | `src/web/screens/patient-detail.tsx:365` | File is truncated mid-implementation: `return <UntitledForm />` (undefined component), `PatientDetail` is never exported, 47 type errors, imports use the wrong alias (`@/app/*`, `@/components/*` instead of `@/web/...`). | Critical | Reported |
| F4 | `src/web/screens/doctor.tsx:10-24` | Wrong import aliases (`@/app/api`, `@/components/*`) make every component unresolved; also implicit-`any` and `unknown` errors at lines 124, 171-172, 209. Build cannot resolve these modules. | Critical | Reported |
| F5 | `src/web/app/App.tsx:57` | `const result = await api.resetDemo()` is never used (`TS6133`) — the reset toast could include the restored day. Also line 19 expects a named `PatientDetail` export that F3 does not provide. | Important | Reported (App.tsx is main-session owned) |
| F6 | `src/domain/flow.ts:9`, `src/domain/dates.ts:8`, `src/domain/__tests__/*` | Frozen-module type errors: `Role` imported from `./types` but not exported; unused `today`/`y`; test helpers cast partial readings. Tests still pass because Vitest strips types. | Important | Reported (domain frozen — do not modify) |
| F7 | `scripts/check-placeholders.ts`, `scripts/seed-template.ts` | `@types/node` is not installed, so `node:fs`/`node:path`/`import.meta.dirname` fail typecheck; plus unused `nurseNames` and several `noUncheckedIndexedAccess` failures in the seed script. `npm run release` would fail its typecheck gate. | Important | Reported |
| F8 | `src/worker/routes.ts`, `middleware.ts:12`, `auth.ts:5` | Worker type errors: unused imports for the not-yet-written audit/dashboard/beds handlers; `ApproveArgs` missing `today`; `c.json(..., { status })` typed as non-ContentfulStatusCode; `one` not exported from `db`. | Important | Reported |
| F9 | `src/web/screens/admin.tsx` | Fixed here: admit response is `{ patient }` but the code treated it as `Patient`; imports used the wrong `@/app`, `@/components` aliases. | Critical | **Fixed** |
| F10 | `src/web/screens/nurse.tsx` | Fixed here: unused `queryKeys` import (typecheck error). Gauge now receives `animateFrom` after a successful reading. | Important | **Fixed** |
| F11 | `src/web/screens/audit.tsx` | Fixed here: empty state previously said "No audit entries yet." when unfiltered; now always "No entries match these filters." per HANDOFF §4. | Important | **Fixed** |
| F12 | `src/web/app/App.tsx:121` | Top bar renders `{name} · {role}` with a middle dot; the design identity calls for plain meta strings, no middle-dot separators. | Minor | Reported |
| F13 | `src/web/screens/audit.tsx:196` | Actor filter sends `actor=SYSTEM` for system rows; whether the Worker matches `actor_role = SYSTEM` (actor_id is NULL) is unverified until the `/api/audit` route lands. Patient text filter is likewise sent verbatim — verify the route matches name or id. | Minor | Open dependency |
| F14 | `src/web/screens/audit.tsx:89` | Action filter options come from the newest 500 entries only; very old action types can be absent from the select. Acceptable for a demo. | Minor | Accepted |

## 3. Animations (Task 1) — implementation + static checks

**Mercury rise** — `src/web/components/mercury-gauge.tsx`:
new optional `animateFrom?: number | null` prop. The column is a `pathLength={100}` line whose
`strokeDashoffset` (and `stroke`) transition over 600 ms ease-out; the numeric text switches at
600+40 ms so the eye follows one value. Colour switches to `--color-mercury` at ≥38.0 °C during
the same transition. Reduced motion is checked with `matchMedia('(prefers-reduced-motion: reduce)')`
before the start values are set, so the end state renders immediately; the global CSS duration
clamp is a second safety net. No JS animation library, no layout shift (fixed viewBox, text width
unchanged for one-decimal values). Trigger: `src/web/screens/nurse.tsx` records
`{ patientId, from: yesterdayReading?.tempC ?? null }` in `handleSaved` for 2.5 s and passes it only
to that patient's Done row, so remounts/tab switches do not replay the rise.

**The walk out** — `src/web/components/ward-map.tsx` + `src/web/screens/admin.tsx`:
`WardMap` takes `justFreed?: { bed: string } | null`. On a new object it computes the bed centre
from the same bay geometry and plays a 1.2 s one-shot CSS keyframe: figure steps out of the bay,
walks horizontally to the corridor centre line, then down the corridor to the "Ward door" threshold
at the map edge and fades. The figure is an 11 px ink pixel figure (head, torso, alternating legs)
inside the SVG coordinate space — no layout shift, `aria-hidden`, no loop. Admin sets
`{ bed }` in `completeDischarge.onSuccess` and clears it after 1.8 s; WardMap also guards against
replaying the same object. Reduced motion: JS check skips the figure entirely and the bed still
flips to free because that comes from the query data. Simplification noted: the route is bed →
corridor → door rather than a wandering path.

Both animations verified by code review and by checking the rendered geometry mentally; **visual
runtime verification is pending** because the app cannot build yet (F1–F4).

## 4. Demo-path QA matrix (PLAN.md §13)

| Step | Run 1 (fresh sign-in) | Run 2 (after Reset demo data) | Notes |
| --- | --- | --- | --- |
| 1. Nurse Asha 37.0 → Done, no-fever toast, ladder 3/3 | pending | pending | blocked on build |
| 2. Duplicate blocked with "Already recorded today…" | pending | pending | |
| 3. 98.6 → °F hint; 52 → hard error; 40.5 → confirm | pending | pending | |
| 4. Nurse → Dashboard restricted copy | pending | pending | App Guard copy verified statically: "This area is for the Head Doctor." |
| 5. Dr Rao: ready + Log visit disabled reason, approve | pending | pending | |
| 6. Admin: ready, Admit blocked no beds, complete → free bed, admit into it | pending | pending | |
| 7. Head Doctor dashboard 17.5% vs 15% (7 of 40) | pending | pending | blocked on F1/F2 |
| 8. Advance day → To measure + gap; Reset restores | pending | pending | |

Viewports: 375 px — pending; tablet (~768 px) — pending; desktop (1440 px) — pending.
Keyboard-only nurse flow (tab order, focus visible, Esc closes sheet/modal) — pending.
Console errors — pending. Lighthouse accessibility ≥ 90 — pending (Lighthouse not installed;
run once the app is served).

## 5. Fixes applied by this task

- `src/web/components/mercury-gauge.tsx` — animated rise, reduced-motion handling, accessible label.
- `src/web/screens/nurse.tsx` — `animateFrom` wiring, `justRecorded` state with replay guard, unused import removed.
- `src/web/components/ward-map.tsx` — `justFreed` walk-out, ward door, reduced-motion skip.
- `src/web/screens/admin.tsx` — `justFreed` trigger; admit response destructured; import aliases corrected.
- `src/web/screens/audit.tsx` — new screen (filters, ruled table, RBAC page, loading/error/empty states, exact empty copy).
- `submission/answers.md` — four paste-markers + screenshot checklist.

## 6. Before deploy (main session / other agents)

1. Land `src/web/screens/dashboard.tsx` exporting `DashboardScreen` (F1) — without it the build fails.
2. Land the missing Worker routes `/api/audit`, `/api/dashboard`, `/api/beds` (F2) — screens cannot load data.
3. Finish `patient-detail.tsx` (export `PatientDetail`, remove `UntitledForm`) and fix `doctor.tsx` aliases (F3, F4).
4. Decide on frozen-module and script type errors (F6–F8); `npm run release` runs `tsc` and will fail until then.
5. Re-run this QA matrix and the Lighthouse check after the app builds; then remove stale `dist/` and rebuild.
