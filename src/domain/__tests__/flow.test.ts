import { describe, expect, test } from 'vitest'
import { evaluatePatientDay } from '../patient-day'
import { validateAdmission, validateApprove, validateCompleteDischarge, validateCorrection, validateDeath, validateLateEntry, validateNewReading, validateUndo, validateVisit, approvalInvalidated } from '../flow'
import { pt, rd, START, day, vt } from './helpers'

const admitted = day(10)

// R16/R17/R21: the derived patient-day state.
describe('patient-day state', () => {
  test('TO_MEASURE before today\'s reading', () => {
    const s = evaluatePatientDay({ patient: pt({}), readings: [], visits: [], today: START })
    expect(s.status).toBe('TO_MEASURE')
  })
  test('MEASURED after the reading; VISITED after the visit', () => {
    const r = [rd('p-001', 0, 37.0)]
    expect(evaluatePatientDay({ patient: pt({}), readings: r, visits: [], today: START }).status).toBe('MEASURED')
    expect(evaluatePatientDay({ patient: pt({}), readings: r, visits: [vt('p-001', 0, `${START}T09:30:00Z`)], today: START }).status).toBe('VISITED')
  })
  test('eligible at streak 3 (R17) — computed, never typed in', () => {
    const s = evaluatePatientDay({
      patient: pt({}),
      readings: [rd('p-001', 0, 36.8), rd('p-001', 1, 36.9), rd('p-001', 2, 37.0)],
      visits: [],
      today: START,
    })
    expect(s.streak).toBe(3)
    expect(s.eligible).toBe(true)
  })
  test('not eligible with a broken streak', () => {
    const s = evaluatePatientDay({
      patient: pt({}),
      readings: [rd('p-001', 0, 36.8), rd('p-001', 1, 36.9), rd('p-001', 2, 38.2)],
      visits: [],
      today: START,
    })
    expect(s.eligible).toBe(false)
  })
  test('needs-attention flag on the reading (R5)', () => {
    const s = evaluatePatientDay({ patient: pt({}), readings: [rd('p-001', 0, 40.2)], visits: [], today: START })
    expect(s.flags.needsAttention).toBe(true)
  })
  test('missed yesterday flag only when admitted before yesterday', () => {
    const s = evaluatePatientDay({ patient: pt({ admittedDay: day(5) }), readings: [rd('p-001', 0, 37.0)], visits: [], today: START })
    expect(s.flags.missedYesterday).toBe(true)
    const s2 = evaluatePatientDay({ patient: pt({ admittedDay: day(1) }), readings: [rd('p-001', 0, 37.0)], visits: [], today: START })
    expect(s2.flags.missedYesterday).toBe(false)
  })
  test('delay chip for an approved patient still in bed (R21)', () => {
    const s = evaluatePatientDay({ patient: pt({ status: 'DISCHARGE_APPROVED', statusChangedDay: day(1), firstEligibleDay: day(2) }), readings: [rd('p-001', 0, 36.8)], visits: [], today: START })
    expect(s.flags.delayed).toBe(true)
    expect(s.delayDays).toBe(1)
  })
})

// R10/R1/R3/R6: guarding a new reading.
describe('R1/R3/R10: recording a reading', () => {
  test('blocked for a terminal patient (R10/R23)', () => {
    const e = validateNewReading({ patient: pt({ status: 'DISCHARGED' }), today: START, existingActiveToday: null, prevReading: null, input: { value: 37.0, masked: false, confirmed: true }, recordedByName: 'Nurse Asha' })
    expect(e).toMatchObject({ code: 'R10_STATUS' })
  })
  test('blocked as a duplicate (R1)', () => {
    const existing = rd('p-001', 0, 37.2, { recordedAt: `${START}T09:14:00Z` })
    const e = validateNewReading({ patient: pt({}), today: START, existingActiveToday: existing, prevReading: null, input: { value: 37.0, masked: false, confirmed: true }, recordedByName: 'Nurse Asha' })
    expect(e).toMatchObject({ code: 'R1_DUPLICATE' })
    expect(e?.message).toContain('37.2 °C at 09:14 by Nurse Asha')
    expect(e?.message).toContain('Use Correct reading')
  })
  test('unconfirmed out-of-band value is blocked (R3)', () => {
    const e = validateNewReading({ patient: pt({}), today: START, existingActiveToday: null, prevReading: rd('p-001', 1, 36.8), input: { value: 40.5, masked: false, confirmed: false }, recordedByName: 'Nurse Asha' })
    expect(e).toMatchObject({ code: 'R3_CONFIRM' })
  })
  test('confirmed out-of-band value passes', () => {
    const e = validateNewReading({ patient: pt({}), today: START, existingActiveToday: null, prevReading: rd('p-001', 1, 36.8), input: { value: 40.5, masked: false, confirmed: true }, recordedByName: 'Nurse Asha' })
    expect(e).toBeNull()
  })
})

// R11: the doctor exception path requires a reason.
describe('R11: doctor records the temperature', () => {
  test('without a reason it is blocked', () => {
    const e = validateDoctorReading({ patient: pt({}), today: START, todayReading: null, reason: null, confirmed: true })
    expect(e).toMatchObject({ code: 'R11_REASON' })
  })
  test('with a reason it passes', () => {
    expect(validateDoctorReading({ patient: pt({}), today: START, todayReading: null, reason: 'Nurse not available', confirmed: true })).toBeNull()
  })
  test('blocked when a reading already exists (R1)', () => {
    const e = validateDoctorReading({ patient: pt({}), today: START, todayReading: rd('p-001', 0, 37.0), reason: 'x', confirmed: true })
    expect(e).toMatchObject({ code: 'R1_DUPLICATE' })
  })
})

// R12/R13: the doctor visit.
describe('R12/R13: logging a visit', () => {
  test('blocked before today\'s reading exists (R13)', () => {
    const e = validateVisit({ patient: pt({}), today: START, todayReading: null, existingVisit: null })
    expect(e).toMatchObject({ code: 'R13_NO_READING' })
  })
  test('blocked as a duplicate visit (R12)', () => {
    const e = validateVisit({ patient: pt({}), today: START, todayReading: rd('p-001', 0, 37.0), existingVisit: vt('p-001', 0) })
    expect(e).toMatchObject({ code: 'R12_DUPLICATE' })
  })
  test('blocked for a terminal patient (R23)', () => {
    const e = validateVisit({ patient: pt({ status: 'DECEASED' }), today: START, todayReading: null, existingVisit: null })
    expect(e).toMatchObject({ code: 'R10_STATUS' })
  })
  test('passes with today\'s reading', () => {
    expect(validateVisit({ patient: pt({}), today: START, todayReading: rd('p-001', 0, 37.0), existingVisit: null })).toBeNull()
  })
})

// R18/R20: discharge approval and completion.
describe('R18/R20: discharge flow', () => {
  test('approve blocked when not eligible', () => {
    const e = validateApprove({ patient: pt({}), today: START, streak: 2, todayReading: rd('p-001', 0, 36.8) })
    expect(e).toMatchObject({ code: 'R18_NOT_ELIGIBLE' })
  })
  test('approve blocked without a reading today', () => {
    const e = validateApprove({ patient: pt({}), today: START, streak: 3, todayReading: null })
    expect(e).toMatchObject({ code: 'R18_NO_READING' })
  })
  test('approve blocked when today\'s reading is masked or fever', () => {
    expect(validateApprove({ patient: pt({}), today: START, streak: 3, todayReading: rd('p-001', 0, 36.8, { masked: true }) })).toMatchObject({ code: 'R18_NO_READING' })
    expect(validateApprove({ patient: pt({}), today: START, streak: 3, todayReading: rd('p-001', 0, 38.4) })).toMatchObject({ code: 'R18_NO_READING' })
  })
  test('approve blocked for an already-approved patient', () => {
    const e = validateApprove({ patient: pt({ status: 'DISCHARGE_APPROVED' }), today: START, streak: 3, todayReading: rd('p-001', 0, 36.8) })
    expect(e).toMatchObject({ code: 'R18_NOT_ELIGIBLE' })
  })
  test('approve passes for an eligible patient with a qualifying reading today', () => {
    expect(validateApprove({ patient: pt({}), today: START, streak: 3, todayReading: rd('p-001', 0, 36.8) })).toBeNull()
  })
  test('complete blocked unless approved (R20)', () => {
    expect(validateCompleteDischarge({ patient: pt({}) })).toMatchObject({ code: 'R20_NOT_APPROVED' })
    expect(validateCompleteDischarge({ patient: pt({ status: 'DISCHARGE_APPROVED' }) })).toBeNull()
  })
})

// R19: approval auto-revocation.
describe('R19: approval auto-revokes', () => {
  const approved = pt({ status: 'DISCHARGE_APPROVED', statusChangedDay: day(0), firstEligibleDay: day(3) })
  const history = [rd('p-001', 1, 36.9), rd('p-001', 2, 37.0), rd('p-001', 3, 37.1)]
  test('a correction turning today\'s reading into a fever revokes', () => {
    const readings = [...history, rd('p-001', 0, 39.5)]
    expect(approvalInvalidated({ patient: approved, readings, today: START })).toMatchObject({ code: 'R19_REVOKED' })
  })
  test('a masked flag on today\'s reading revokes', () => {
    const readings = [...history, rd('p-001', 0, 36.8, { masked: true })]
    expect(approvalInvalidated({ patient: approved, readings, today: START })).not.toBeNull()
  })
  test('a correction that stays fever-free does not revoke', () => {
    const readings = [...history, rd('p-001', 0, 37.0)]
    expect(approvalInvalidated({ patient: approved, readings, today: START })).toBeNull()
  })
  test('a broken streak revokes', () => {
    const readings = [rd('p-001', 0, 36.8), rd('p-001', 1, 38.2), rd('p-001', 2, 37.0), rd('p-001', 3, 37.1)]
    expect(approvalInvalidated({ patient: approved, readings, today: START })).not.toBeNull()
  })
  test('an admitted patient is never "invalidated"', () => {
    expect(approvalInvalidated({ patient: pt({}), readings: [], today: START })).toBeNull()
  })
})

// R7: undo window.
describe('R7: undo within 5 minutes', () => {
  const reading = rd('p-001', 0, 37.0, { recordedBy: 'nurse-asha', recordedAt: `${START}T09:00:00Z` })
  test('allowed within the window for the recording nurse', () => {
    expect(validateUndo({ reading, actorStaffId: 'nurse-asha', actorRole: 'NURSE', today: START, nowAt: `${START}T09:04:59Z` })).toBeNull()
  })
  test('blocked at the boundary after 5 minutes', () => {
    const e = validateUndo({ reading, actorStaffId: 'nurse-asha', actorRole: 'NURSE', today: START, nowAt: `${START}T09:05:00Z` })
    expect(e).toMatchObject({ code: 'R7_WINDOW' })
  })
  test('blocked for other roles and other nurses', () => {
    expect(validateUndo({ reading, actorStaffId: 'nurse-imran', actorRole: 'NURSE', today: START, nowAt: `${START}T09:01:00Z` })).toMatchObject({ code: 'R7_NOT_YOURS' })
    expect(validateUndo({ reading, actorStaffId: 'doctor-rao', actorRole: 'DOCTOR', today: START, nowAt: `${START}T09:01:00Z` })).toMatchObject({ code: 'R7_ROLE' })
  })
  test('blocked for a previous day', () => {
    const old = rd('p-001', 1, 37.0, { recordedBy: 'nurse-asha', recordedAt: `${day(1)}T09:00:00Z` })
    expect(validateUndo({ reading: old, actorStaffId: 'nurse-asha', actorRole: 'NURSE', today: START, nowAt: `${day(1)}T09:01:00Z` })).toMatchObject({ code: 'R7_ONLY_TODAY' })
  })
})

// R8: correction rules.
describe('R8: correction with a reason', () => {
  test('nurse blocked after the visit is logged', () => {
    const e = validateCorrection({ actorRole: 'NURSE', reading: rd('p-001', 0, 37.0), today: START, visitToday: vt('p-001', 0), reason: 'typo' })
    expect(e).toMatchObject({ code: 'R8_AFTER_VISIT' })
  })
  test('doctor may correct after the visit, with a reason', () => {
    expect(validateCorrection({ actorRole: 'DOCTOR', reading: rd('p-001', 0, 37.0), today: START, visitToday: vt('p-001', 0), reason: 'thermometer swapped' })).toBeNull()
  })
  test('a reason is mandatory', () => {
    expect(validateCorrection({ actorRole: 'DOCTOR', reading: rd('p-001', 0, 37.0), today: START, visitToday: null, reason: '' })).toMatchObject({ code: 'R8_REASON' })
    expect(validateCorrection({ actorRole: 'DOCTOR', reading: rd('p-001', 0, 37.0), today: START, visitToday: null, reason: null })).toMatchObject({ code: 'R8_REASON' })
  })
  test('no open reading to correct', () => {
    expect(validateCorrection({ actorRole: 'DOCTOR', reading: null, today: START, visitToday: null, reason: 'x' })).toMatchObject({ code: 'R8_NO_READING' })
  })
})

// R9: late entry.
describe('R9: late entry for the previous day', () => {
  test('only the previous day is allowed', () => {
    expect(validateLateEntry({ patient: pt({ admittedDay: day(9) }), targetDay: day(2), today: START, reason: 'x', existingActiveOnTarget: null })).toMatchObject({ code: 'R9_ONLY_YESTERDAY' })
    expect(validateLateEntry({ patient: pt({ admittedDay: day(9) }), targetDay: START, today: START, reason: 'x', existingActiveOnTarget: null })).toMatchObject({ code: 'R9_ONLY_YESTERDAY' })
  })
  test('a reason is mandatory', () => {
    expect(validateLateEntry({ patient: pt({ admittedDay: day(9) }), targetDay: day(1), today: START, reason: null, existingActiveOnTarget: null })).toMatchObject({ code: 'R9_REASON' })
  })
  test('blocked when the target day already has a reading (R1)', () => {
    expect(validateLateEntry({ patient: pt({ admittedDay: day(9) }), targetDay: day(1), today: START, reason: 'x', existingActiveOnTarget: rd('p-001', 1, 36.9) })).toMatchObject({ code: 'R1_DUPLICATE' })
  })
  test('blocked before admission', () => {
    expect(validateLateEntry({ patient: pt({ admittedDay: day(1) }), targetDay: day(1), today: START, reason: 'x', existingActiveOnTarget: null })).toMatchObject({ code: 'R9_BEFORE_ADMISSION' })
  })
  test('passes for yesterday when nothing exists', () => {
    expect(validateLateEntry({ patient: pt({ admittedDay: day(9) }), targetDay: day(1), today: START, reason: 'journal recovered', existingActiveOnTarget: null })).toBeNull()
  })
})

// R22/R23: death and read-only terminal records.
describe('R22/R23: death', () => {
  test('blocked for terminal patients', () => {
    expect(validateDeath({ patient: pt({ status: 'DISCHARGED' }) })).toMatchObject({ code: 'R23_TERMINAL' })
    expect(validateDeath({ patient: pt({ status: 'DECEASED' }) })).toMatchObject({ code: 'R23_TERMINAL' })
  })
  test('allowed from any non-terminal status', () => {
    expect(validateDeath({ patient: pt({}) })).toBeNull()
    expect(validateDeath({ patient: pt({ status: 'DISCHARGE_APPROVED' }) })).toBeNull()
  })
})

// R24/R25: admission and capacity.
describe('R24/R25: admission', () => {
  const beds = ['A-1', 'A-2', 'A-3']
  test('blocked at capacity', () => {
    const e = validateAdmission({ name: 'New Patient', age: 30, sex: 'M', bed: 'B-74', occupiedCount: 74, occupiedBeds: [], existingPatients: [], confirmDuplicate: false })
    expect(e).toMatchObject({ code: 'R24_NO_BEDS' })
    expect(e?.message).toContain('Complete a pending discharge')
  })
  test('blocked when the chosen bed is occupied', () => {
    const e = validateAdmission({ name: 'New Patient', age: 30, sex: 'M', bed: 'A-2', occupiedCount: 73, occupiedBeds: beds, existingPatients: [], confirmDuplicate: false })
    expect(e).toMatchObject({ code: 'R25_BED_TAKEN' })
  })
  test('possible duplicate needs confirmation', () => {
    const e = validateAdmission({ name: 'ramesh kumar', age: 42, sex: 'M', bed: 'A-1', occupiedCount: 73, occupiedBeds: beds, existingPatients: [pt({ name: 'Ramesh Kumar', age: 42 })], confirmDuplicate: false })
    expect(e).toMatchObject({ code: 'R25_DUPLICATE' })
  })
  test('confirmed duplicate passes; different age does not warn', () => {
    expect(validateAdmission({ name: 'Ramesh Kumar', age: 42, sex: 'M', bed: 'A-1', occupiedCount: 73, occupiedBeds: beds, existingPatients: [pt({ name: 'Ramesh Kumar', age: 42 })], confirmDuplicate: true })).toBeNull()
    expect(validateAdmission({ name: 'Ramesh Kumar', age: 43, sex: 'M', bed: 'A-1', occupiedCount: 73, occupiedBeds: beds, existingPatients: [pt({ name: 'Ramesh Kumar', age: 42 })], confirmDuplicate: false })).toBeNull()
  })
  test('invalid fields are rejected', () => {
    expect(validateAdmission({ name: '  ', age: 30, sex: 'M', bed: 'A-1', occupiedCount: 73, occupiedBeds: beds, existingPatients: [], confirmDuplicate: false })).toMatchObject({ code: 'R25_FIELDS' })
    expect(validateAdmission({ name: 'X', age: 130, sex: 'M', bed: 'A-1', occupiedCount: 73, occupiedBeds: beds, existingPatients: [], confirmDuplicate: false })).toMatchObject({ code: 'R25_FIELDS' })
  })
})
