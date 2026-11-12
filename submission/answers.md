# WardRound — TPM assessment submission

Draft scaffold. The answers are written separately; paste each one under its
question. Do not rewrite the app to fit the answers.

## Q1 — User types and the features each one uses

> Paste final answer here

## Q2 — Deployable link, screens and end-to-end workflow

> Paste final answer here

## Q3 — Additional logical constraints the developers must know

> Paste final answer here

## Q4 — Sprint prioritisation

> Paste final answer here

---

## Screenshot checklist

Capture each screen at desktop width (1440 px) unless noted; the nurse screen
also at 375 px. Use the demo path in `PLAN.md` section 13 so the data shown
matches the answer.

- [ ] Sign-in: four role groups with the named demo staff
- [ ] Nurse: bottom sheet mid-entry (wrong-patient guard header, large °C input)
- [ ] Nurse: Done row with the mercury gauge and the streak ladder at 3 of 3
- [ ] Nurse at 375 px: To measure list and the open sheet
- [ ] Doctor: queue groups (Needs attention, Ready for discharge, Waiting for temperature with the disabled Log visit reason)
- [ ] Patient detail: observation chart with the 38.0 dashed line and missed-day gap
- [ ] Admin: ward map with one free bed after a completed discharge
- [ ] Admin: Ready to discharge with the delay chip
- [ ] Head Doctor: dashboard with the mortality sentence and the compliance figures
- [ ] About page: top of the page (product brief and builder section)
- [ ] Audit log: filtered rows for one patient

Name the final PDF `Your Name TPM.pdf` (for example `Asha Nair TPM.pdf`).
Check the About page's `{{BUILDER_NAME}}`, `{{ROLE_AND_COLLEGE}}` and
`{{CONTACT}}` placeholders are filled in before exporting. Run
`npm run check:placeholders` to confirm none are left.
