# UI contract (frozen)

Read PLAN.md section 8 (design system) and section 15 (do-not list) first.
Design tokens are Tailwind theme names from `src/web/styles/index.css`:
`bg-gauze text-ink text-muted bg-mercury text-signal bg-signal-tint text-done
text-focus bg-chart-grid bg-tape font-signage font-body`. Fonts are
self-hosted (imports already in `src/web/main.tsx`). Rows, not cards. No
emoji, no gradients, sentence case, buttons say what happens. Touch targets
≥ 44px (48px on the nurse flow). Status never by colour alone (icon + text).
Every list has an empty state; every screen has loading and error states.

## File ownership (do not edit files outside your list; do not edit App.tsx)

## Shared primitives — `src/web/components/ui.tsx` (owner: shell agent)
```ts
Button({ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'md'|'lg', disabled?, loading?, type?, onClick?, children })
Chip({ tone?: 'neutral'|'amber'|'done'|'alert', children })            // icon+text, never colour alone
Field({ label, hint?, error?, children })                              // labelled input wrapper
TextArea({ ...props })
Modal({ open, title, onClose, children })                              // traps focus, Esc closes, names consequence
Sheet({ open, title, onClose, children })                              // mobile bottom sheet
Tabs({ tabs: Array<{ id, label }>, value, onChange })
EmptyState({ title, body })
SkeletonRows({ rows?: number })
StatTile({ label, value, sub? })
SectionHeading({ children })
useToasts() → { toasts, push({ tone: 'ok'|'error'|'warn', message }) }  // aria-live region mounted by App
ErrorBoundary                                                           // class component
```
Icons: inline SVG, stroke ink, 1.5px, no emoji.

## Signature components (per-owner, imported by screens via `@/`)
- `components/bed-tag.tsx` (nurse agent): `BedTag({ bed: string, size?: 'sm'|'md' })` — punched-hole tag look, Barlow, wing letter + number.
- `components/mercury-gauge.tsx` (nurse agent): `MercuryGauge({ value: number, yesterday?: number | null })` — SVG 35–42 °C scale, tick at 38.0, filled bar (ink, mercury ≥ 38), hollow yesterday marker, value always as text, `role="img"` + aria-label.
- `components/streak-ladder.tsx` (nurse agent): `StreakLadder({ streak: number, total?: number })` — three rungs, "2 of 3 fever-free days" text.
- `components/observation-chart.tsx` (doctor agent): `ObservationChart({ readings: Reading[], today: string, admittedDay: string | null })` — inline SVG on chart-grid paper, 35–41 °C y-axis, dashed line at 38.0, circle=normal / triangle=fever / diamond=masked, gaps marked "no reading", plus a plain data table below.
- `components/ward-map.tsx` (admin agent): `WardMap({ beds: Array<{ bed, state: 'occupied'|'free'|'ready', patientName? }>, onFreeBedClick?: (bed) => void })` — two wings in bays of four along a corridor with nurse station; state by icon + label + colour.

## Screens (per-owner)
- `screens/sign-in.tsx` (shell agent): four role groups with one-line role description + named staff buttons; sign-in creates the workspace.
- `screens/nurse.tsx` (nurse agent): mobile-first rounds sheet; progress "41 of 74 measured"; tabs To measure / Done; search by name or bed; rows sorted by bed; bottom sheet with wrong-patient guard header (bed, name, age, yesterday's reading), one large decimal input, the R6 medicine question, primary "Record temperature"; per-keystroke validation via `evaluateTempInput`; toasts on save ("Bed A-12: 37.1 °C recorded, no fever"); Correct/Undo where allowed.
- `screens/doctor.tsx` (doctor agent): two-pane queue + chart (tablet+); groups: Needs attention, Ready for discharge, Ready to visit, Waiting for temperature (Log visit disabled with reason + "Record temperature yourself" R11 path), Visited today; approve discharge action.
- `screens/patient-detail.tsx` (doctor agent): header (name, age, bed, day of stay, status), observation chart, streak ladder, role-appropriate actions (disabled stays visible with helper text), patient activity log.
- `screens/dashboard.tsx` (doctor agent): head doctor; mortality sentence first (R28), compliance with pending names, occupancy, delays, exceptions.
- `screens/admin.tsx` (admin agent): summary; Ready to discharge (Complete discharge + delay chip); Eligible awaiting sign-off (read-only); ward map (free bed click → admit form with bed preselected); Admit patient form (R24/R25); waitlist; death confirm is on patient detail (doctor only).
- `screens/about.tsx` + `content/about.ts` (about agent): nine sections, side nav on desktop / tabs mobile, rules + RBAC tables GENERATED from `src/domain` registries.

## App integration (owned by the main session, not by agents)
`App.tsx` (routes + nav + toasts mount), route guards by permission, `src/web/app/api.ts`, `src/web/app/session.ts`.
