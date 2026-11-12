# DECISIONS.md

Numbered decisions, each with the alternative rejected, the reason, and the trade-off accepted. Product rules also live on the About page inside the app (generated where possible); this file is the record.

1. **A missed day breaks the fever-free streak.**
   Rejected: skipping the gap and counting clean days around it. Why: a fever-free day we did not measure cannot be claimed, and with a 15% expected mortality a wrong early discharge costs more than an extra bed-day. Trade-off: more conservative discharges — a missed day sets the patient back to zero.

2. **The doctor approves a discharge; admin executes it.**
   Rejected: one role completing discharges end to end. Why: approval is a clinical decision, completion is a bed-management action; splitting them keeps the decision audited and gives admin a system-fed list instead of word of mouth. Trade-off: two actions, and admin cannot act before the doctor.

3. **Real server-side sessions with named demo accounts, not OAuth.**
   Rejected: no auth, or client-faked sign-in. Why: RBAC is only real when the server checks a signed session and reads the role from the staff table on every request; demo accounts keep the review link one click away. Trade-off: shared accounts until per-user credentials or SSO (Production path).

4. **A per-visitor sandbox workspace.**
   Rejected: one shared demo dataset. Why: reviewers sign in independently and would corrupt each other's demo otherwise. Trade-off: a workspace copy at sign-in — bounded by `INSERT ... SELECT`, a 7-day lazy purge and a 300-workspace cap with a friendly 503. The workspace is remembered by a signed 7-day `wr_visitor` cookie that outlives the 12-hour staff session, so the demo path's role switches (nurse → doctor → admin → head doctor) continue on the same ward. The cookie carries only a workspace id, never a role or identity; every API call still needs a valid staff session.

5. **The database is the last line of defence.**
   Rejected: trusting the domain layer alone. Why: one active reading per patient-day, one visit per patient-day and one patient per bed must never break, so partial unique indexes and CHECK constraints enforce them where nothing can bypass them. Trade-off: constraints in migrations must stay in sync with the domain tests.

6. **Corrections supersede; history is never rewritten.**
   Rejected: updating the reading row in place. Why: clinical trust requires the original value and the reason for every change; a new row with `supersedes_id` keeps the full chain. Trade-off: more rows and slightly more complex reads.

7. **Mortality counts closed cases only.**
   Rejected: including current patients in the denominator. Why: their outcome is unknown; including them makes the figure move with admissions instead of outcomes. Trade-off: the figure lags admissions, so the closed-case count is always shown beside it, and under 20 closed cases no alert is raised.

8. **Masked readings do not qualify toward the streak.**
   Rejected: counting a reading taken after fever-reducing medicine as a clean day. Why: a suppressed fever is not a recovered patient. Trade-off: a stricter streak; whether the reset is the right clinical call is an open question for the head doctor.

9. **A non-qualifying reading today (fever or masked) stops the streak before approval.**
   Rejected: approving on the strength of the streak alone. Why: approval requires a qualifying reading on the approval day. Trade-off: the doctor waits for a clean reading that day even after three clean days.

10. **The workspace owns the clock.**
    Rejected: `Date.now()` or the device clock in domain logic. Why: "today" must mean the same day for every role in a workspace, and tests must be deterministic. Trade-off: every domain function takes the day as an argument; audit rows combine the demo day with wall-clock time.

11. **The session secret bootstraps into the D1 meta table until a real Wrangler secret is set.**
    Rejected: hard-failing the deploy without `SESSION_SECRET`. Why: a timed submission must not break on an optional step; a generated secret in `meta` still signs cookies correctly. Trade-off: the secret lives in the database until `npx wrangler secret put SESSION_SECRET` is run — which is why the replacement is listed in the Production path.

12. **Static Assets serving instead of the Vite Cloudflare plugin.**
    Rejected: `@cloudflare/vite-plugin`. Why: `run_worker_first: ["/api/*"]` plus the SPA fallback is the currently documented Workers pattern, with fewer moving parts on Windows; the `/api/health` JSON test proves the worker runs first. Trade-off: `npm run dev` builds once before serving.

13. **API tests run through wrangler's `getPlatformProxy()` against local D1.**
    Rejected: `vitest-pool-workers`. Why: stability on Windows under the timebox. Trade-off: slower test boot.

14. **CI ships, but green remote CI is not the gate.**
    Rejected: gating the submission on a remote runner. Why: no remote in the window; local typecheck, lint, test and build are the release contract (`npm run release`). Trade-off: the GitHub Actions workflow exists but its first green run happens after the submission.

15. **The waitlist is its own table; patients have no WAITING status.**
    Rejected: modelling waiting people as patients with a WAITING status. Why: a status that no rule reads is a dead state, and waitlist rows must never leak into beds, readings or compliance denominators. Trade-off: two admission paths (form and waitlist prefill) instead of one.

16. **Late entry is only for the previous day, and never for a day before admission.**
    Rejected: free-date back-entry, or silently accepting a pre-admission "reading". Why: a doctor's correction of yesterday's gap is a real process; anything older is paper history, and a reading before admission is meaningless. Trade-off: gaps older than one day stay visible and unfillable in the prototype.
