// The rules registry: one entry per numbered rule in the brief (section 5).
// The About page renders its rules table from this registry, and tests are
// named by rule id — documentation cannot drift from implementation.
// Tier 1 features are flagged; they are built after Tier 0 is stable.
export type RuleArea =
  | 'readings'
  | 'visits'
  | 'cure and discharge'
  | 'death'
  | 'admission and capacity'
  | 'metrics'
  | 'cross-cutting'

export interface Rule {
  id: string
  title: string
  description: string
  area: RuleArea
  tier: 0 | 1
}

export const RULES: Rule[] = [
  { id: 'R1', title: 'One active reading per patient per day', description: 'A duplicate is blocked and points to Correct reading; the database enforces it with a partial unique index.', area: 'readings', tier: 0 },
  { id: 'R2', title: 'Readings are for the current day only', description: 'No future dates. A missed day stays a visible gap; late entry (R9) is the single exception.', area: 'readings', tier: 0 },
  { id: 'R3', title: 'Validated temperature input', description: 'One decimal place, comma accepted. Outside 30.0–45.0 is a hard error. 90–110 suggests °F. Below 35.0, at or above 40.0, or a jump of 2.0 °C or more needs explicit confirmation.', area: 'readings', tier: 0 },
  { id: 'R4', title: 'Fever is 38.0 °C or above', description: 'The result is shown to the nurse immediately after saving.', area: 'readings', tier: 0 },
  { id: 'R5', title: 'Needs-attention band', description: 'Below 35.0 or at or above 40.0 flags NEEDS_ATTENTION and pins the patient to the top of the doctor queue. The only alert-style flag in the app.', area: 'readings', tier: 0 },
  { id: 'R6', title: 'Masked readings', description: 'If fever-reducing medicine was given in the last 6 hours, the reading is flagged MASKED and does not qualify toward the streak. A doctor may accept it with a reason.', area: 'readings', tier: 1 },
  { id: 'R7', title: 'Undo within 5 minutes', description: 'A nurse may void their own reading within 5 minutes without a reason; the patient returns to To measure; audited.', area: 'readings', tier: 1 },
  { id: 'R8', title: 'Correction with a reason', description: 'A nurse may correct today\'s reading until the day\'s visit is logged; after that only a doctor can. The original is superseded, never deleted.', area: 'readings', tier: 0 },
  { id: 'R9', title: 'Late entry for the previous day', description: 'A doctor may enter a reading for the previous day only, with a reason; flagged LATE_ENTRY and the streak is recomputed.', area: 'readings', tier: 1 },
  { id: 'R10', title: 'Readings only for active patients', description: 'Readings require status ADMITTED or DISCHARGE_APPROVED; terminal records are read-only.', area: 'readings', tier: 0 },
  { id: 'R11', title: 'Doctor may record the temperature themselves', description: 'The exception path when the doctor arrives first: requires a reason and counts as a process exception on the dashboard.', area: 'readings', tier: 0 },
  { id: 'R12', title: 'One visit per patient per day', description: 'Enforced in the domain and by a unique index.', area: 'visits', tier: 0 },
  { id: 'R13', title: 'Visit requires today\'s reading', description: 'Log visit is shown disabled with the reason until the temperature exists; the doctor can record it themselves from there (R11).', area: 'visits', tier: 0 },
  { id: 'R14', title: 'Optional treatment note', description: 'A visit may carry a treatment note.', area: 'visits', tier: 0 },
  { id: 'R15', title: 'Admitted today needs both today', description: 'A patient admitted today needs a reading and a visit today.', area: 'visits', tier: 0 },
  { id: 'R16', title: 'Fever-free streak', description: 'Counts backwards over consecutive calendar days with an active, non-masked reading below 38.0, starting from today if measured, otherwise yesterday. Fever, masked, or a missing day stops the count, as does the day before admission.', area: 'cure and discharge', tier: 0 },
  { id: 'R17', title: 'Eligibility is computed, never typed in', description: 'Eligible at a streak of 3; surfaces simultaneously to the doctor queue and the admin sign-off list.', area: 'cure and discharge', tier: 0 },
  { id: 'R18', title: 'Only a doctor approves discharge', description: 'Requires eligibility and a qualifying reading today. Approving counts as the day\'s visit if none was logged.', area: 'cure and discharge', tier: 0 },
  { id: 'R19', title: 'Approval auto-revokes', description: 'If eligibility later breaks (correction to fever, masked, late entry), approval returns to ADMITTED with an audited reason.', area: 'cure and discharge', tier: 0 },
  { id: 'R20', title: 'Only admin completes a discharge', description: 'From DISCHARGE_APPROVED only; the bed is freed and the outcome recorded as cured.', area: 'cure and discharge', tier: 0 },
  { id: 'R21', title: 'Delayed discharge stays visible', description: 'An approved patient still in a bed shows "Discharge delayed N day(s)" and still needs today\'s reading and visit.', area: 'cure and discharge', tier: 0 },
  { id: 'R22', title: 'Only a doctor records a death', description: 'From any non-terminal status, behind a confirmation dialog naming the patient and bed; the bed is freed.', area: 'death', tier: 0 },
  { id: 'R23', title: 'Terminal records are read-only', description: 'Discharged and deceased records accept no further mutations.', area: 'death', tier: 0 },
  { id: 'R24', title: 'Admission blocked at capacity', description: 'At 74 occupied beds, admit is blocked with a pointer to the pending discharge list.', area: 'admission and capacity', tier: 0 },
  { id: 'R25', title: 'Admission validation', description: 'Name, age 0–120, sex, and a bed chosen from free beds only. Same name and age as a current patient asks for confirmation. One patient per bed at the database level.', area: 'admission and capacity', tier: 0 },
  { id: 'R26', title: 'Waitlist', description: 'Admin-managed, first in first out, with length and longest wait; admitting from the waitlist pre-fills the form.', area: 'admission and capacity', tier: 1 },
  { id: 'R27', title: 'Mortality over closed cases', description: 'Deaths ÷ (deaths + cured discharges) since opening; current patients excluded because their outcome is unknown. Numerator and denominator always shown.', area: 'metrics', tier: 0 },
  { id: 'R28', title: 'Benchmark alerting', description: 'Above 15%: red, in plain language. 13–15%: amber. Under 20 closed cases: shown without an alert, labelled too small to compare.', area: 'metrics', tier: 0 },
  { id: 'R29', title: 'Daily compliance', description: 'Measured today ÷ patients in beds, visited today ÷ patients in beds, and visits logged after the temperature (target 100%), each with the pending list.', area: 'metrics', tier: 0 },
  { id: 'R30', title: 'Discharge delay', description: 'Days from first eligibility to completed discharge: average over discharged patients, count currently delayed, and bed-days held after eligibility.', area: 'metrics', tier: 0 },
  { id: 'R31', title: 'Server-side permissions', description: 'Every action is enforced by the Worker, not the UI; the UI only hides or disables.', area: 'cross-cutting', tier: 0 },
  { id: 'R32', title: 'Append-only audit log', description: 'Every create, correction, undo, visit, approval, revocation, discharge, admission and death is audited in the same transaction. Nothing clinical is hard-deleted.', area: 'cross-cutting', tier: 0 },
  { id: 'R33', title: 'The workspace owns the clock', description: '"Today" comes from the workspace, never the device; domain code takes every date as an argument.', area: 'cross-cutting', tier: 0 },
  { id: 'R34', title: 'First valid write wins', description: 'Concurrent actions on one patient resolve through the R1 duplicate block: the second user sees the saved value.', area: 'cross-cutting', tier: 0 },
  { id: 'R35', title: 'Blocked actions explain themselves', description: 'Every disabled or rejected action says why and what to do next.', area: 'cross-cutting', tier: 0 },
  { id: 'R36', title: 'Never show unsaved as saved', description: 'A reading that failed to reach the server is never shown as recorded; the user is told to retry.', area: 'cross-cutting', tier: 0 },
]

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id)
}
