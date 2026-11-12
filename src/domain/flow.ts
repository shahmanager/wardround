// Flow guards: every blocked action returns a stable code plus a message
// that says what happened and what to do next (R35). The Worker calls these
// before writing; the UI renders the same codes.
import { evaluateTempInput } from './temp'
import { computeStreak, readingQualifies } from './streak'
import { CONFIG } from './config'
import { isValidBed } from './beds'
import { dateAdd, dayDiff } from './dates'
import type { Patient, Reading, Role, Visit } from './types'

export interface FlowError {
  code: string
  message: string
}

const ACTIVE: PatientStatus[] = ['ADMITTED', 'DISCHARGE_APPROVED']
type PatientStatus = Patient['status']

function isActive(p: Patient): boolean {
  return ACTIVE.includes(p.status)
}

function hhmm(at: string): string {
  return at.slice(11, 16)
}

// ---- readings ---------------------------------------------------------------

export interface NewReadingArgs {
  patient: Patient
  today: string
  existingActiveToday: Reading | null
  prevReading: Reading | null
  input: { value: number; masked: boolean; confirmed: boolean }
  recordedByName: string
}

export function validateNewReading(args: NewReadingArgs): FlowError | null {
  const { patient, today, existingActiveToday, prevReading, input, recordedByName } = args
  if (!isActive(patient)) {
    return { code: 'R10_STATUS', message: 'This record is closed. Discharged and deceased records are read-only.' }
  }
  if (existingActiveToday) {
    return {
      code: 'R1_DUPLICATE',
      message: `Already recorded today: ${evaluateFormat(existingActiveToday.tempC)} at ${hhmm(existingActiveToday.recordedAt)} by ${recordedByName}. Use Correct reading if this was wrong.`,
    }
  }
  const evaluation = evaluateTempInput(String(input.value), prevReading?.tempC ?? null)
  if (!evaluation.ok) {
    return { code: evaluation.code ?? 'R3_RANGE', message: evaluation.message ?? 'Invalid reading.' }
  }
  if (evaluation.needsConfirm && !input.confirmed) {
    return {
      code: 'R3_CONFIRM',
      message: 'That value is unusual. Confirm the reading on the thermometer, then choose "Yes, this reading is correct".',
    }
  }
  return null
}

function evaluateFormat(v: number): string {
  return `${v.toFixed(1)} °C`
}

export interface DoctorReadingArgs {
  patient: Patient
  today: string
  todayReading: Reading | null
  reason: string | null
  confirmed: boolean
}

/** R11: the doctor exception path. */
export function validateDoctorReading(args: DoctorReadingArgs): FlowError | null {
  const { patient, todayReading, reason } = args
  if (!isActive(patient)) {
    return { code: 'R10_STATUS', message: 'This record is closed. Discharged and deceased records are read-only.' }
  }
  if (todayReading) {
    return { code: 'R1_DUPLICATE', message: `Already recorded today: ${evaluateFormat(todayReading.tempC)}. Use Correct reading if this was wrong.` }
  }
  if (!reason || reason.trim().length === 0) {
    return { code: 'R11_REASON', message: 'A reason is required when a doctor records the temperature themselves (it counts as a process exception).' }
  }
  return null
}

// ---- visits -----------------------------------------------------------------

export interface VisitArgs {
  patient: Patient
  today: string
  todayReading: Reading | null
  existingVisit: Visit | null
}

export function validateVisit(args: VisitArgs): FlowError | null {
  const { patient, todayReading, existingVisit } = args
  if (!isActive(patient)) {
    return { code: 'R10_STATUS', message: 'This record is closed. Discharged and deceased records are read-only.' }
  }
  if (!todayReading) {
    return { code: 'R13_NO_READING', message: 'Temperature not recorded yet. A nurse records it, or you can record it yourself.' }
  }
  if (existingVisit) {
    return { code: 'R12_DUPLICATE', message: `A visit is already logged today (${hhmm(existingVisit.loggedAt)}).` }
  }
  return null
}

// ---- discharge --------------------------------------------------------------

export interface ApproveArgs {
  patient: Patient
  today: string
  streak: number
  todayReading: Reading | null
}

export function validateApprove(args: ApproveArgs): FlowError | null {
  const { patient, streak, todayReading } = args
  if (patient.status !== 'ADMITTED' || streak < CONFIG.STREAK_DAYS_FOR_CURE) {
    return { code: 'R18_NOT_ELIGIBLE', message: 'Not eligible yet: the fever-free streak is under 3 days, or the patient is not awaiting approval.' }
  }
  if (!todayReading || !readingQualifies(todayReading)) {
    return { code: 'R18_NO_READING', message: 'A qualifying temperature for today is required before approval.' }
  }
  return null
}

export function validateCompleteDischarge(args: { patient: Patient }): FlowError | null {
  if (args.patient.status !== 'DISCHARGE_APPROVED') {
    return { code: 'R20_NOT_APPROVED', message: 'Only a doctor-approved patient can be discharged by admin.' }
  }
  return null
}

/**
 * R19: after any reading change, an approval is invalid when the patient
 * no longer qualifies — the approval-day reading is gone, masked, or a
 * fever, or the streak dropped below 3.
 */
export function approvalInvalidated(args: { patient: Patient; readings: Reading[]; today: string }): FlowError | null {
  const { patient, readings, today } = args
  if (patient.status !== 'DISCHARGE_APPROVED') return null
  const active = readings.filter((r) => r.status === 'active')
  const todayReading = active.find((r) => r.day === today) ?? null
  if (!todayReading) {
    return { code: 'R19_REVOKED', message: 'No qualifying reading exists for the approval day.' }
  }
  if (!readingQualifies(todayReading)) {
    return { code: 'R19_REVOKED', message: 'The approval-day reading no longer qualifies (fever or fever-reducing medicine).' }
  }
  const streak = computeStreak({ readings: active, today, admittedDay: patient.admittedDay })
  if (streak < CONFIG.STREAK_DAYS_FOR_CURE) {
    return { code: 'R19_REVOKED', message: 'The fever-free streak is no longer 3 days.' }
  }
  return null
}

// ---- undo (R7) ----------------------------------------------------------------

export interface UndoArgs {
  reading: Reading | null
  actorStaffId: string
  actorRole: Role
  today: string
  nowAt: string
}

export function validateUndo(args: UndoArgs): FlowError | null {
  const { reading, actorStaffId, actorRole, today, nowAt } = args
  if (actorRole !== 'NURSE') {
    return { code: 'R7_ROLE', message: 'Only the nurse who recorded a reading can undo it, within 5 minutes.' }
  }
  if (!reading || reading.status !== 'active') {
    return { code: 'R7_NOT_YOURS', message: 'There is no open reading of yours to undo.' }
  }
  if (reading.recordedBy !== actorStaffId) {
    return { code: 'R7_NOT_YOURS', message: 'Only the nurse who recorded a reading can undo it, within 5 minutes.' }
  }
  if (reading.day !== today) {
    return { code: 'R7_ONLY_TODAY', message: 'Only today\'s reading can be undone. Ask a doctor to correct it instead.' }
  }
  const windowMs = CONFIG.UNDO_WINDOW_MIN * 60_000
  if (Date.parse(nowAt) - Date.parse(reading.recordedAt) >= windowMs) {
    return { code: 'R7_WINDOW', message: 'The 5-minute undo window has passed. Use Correct reading instead.' }
  }
  return null
}

// ---- correction (R8) -----------------------------------------------------------

export interface CorrectionArgs {
  actorRole: Role
  reading: Reading | null
  today: string
  visitToday: Visit | null
  reason: string | null
}

export function validateCorrection(args: CorrectionArgs): FlowError | null {
  const { actorRole, reading, today, visitToday, reason } = args
  if (!reading || reading.status !== 'active') {
    return { code: 'R8_NO_READING', message: 'There is no open reading to correct.' }
  }
  if (!reason || reason.trim().length === 0) {
    return { code: 'R8_REASON', message: 'A reason is required to correct a reading. The original is kept.' }
  }
  if (reading.day !== today) {
    return { code: 'R8_NOT_TODAY', message: 'Corrections apply to today\'s reading. For a previous day, a doctor records a late entry.' }
  }
  if (actorRole === 'NURSE' && visitToday) {
    return { code: 'R8_AFTER_VISIT', message: 'The doctor has already visited today, so a nurse can no longer correct this reading. Ask a doctor.' }
  }
  if (actorRole === 'ADMIN') {
    return { code: 'R8_ROLE', message: 'Admin cannot correct readings.' }
  }
  return null
}

// ---- late entry (R9) -------------------------------------------------------------

export interface LateEntryArgs {
  patient: Patient
  targetDay: string
  today: string
  reason: string | null
  existingActiveOnTarget: Reading | null
}

export function validateLateEntry(args: LateEntryArgs): FlowError | null {
  const { patient, targetDay, today, reason, existingActiveOnTarget } = args
  if (targetDay !== dateAdd(today, -1)) {
    return { code: 'R9_ONLY_YESTERDAY', message: 'Late entry covers the previous day only.' }
  }
  if (!reason || reason.trim().length === 0) {
    return { code: 'R9_REASON', message: 'A reason is required for a late entry.' }
  }
  if (patient.admittedDay && dayDiff(patient.admittedDay, targetDay) < 0) {
    return { code: 'R9_BEFORE_ADMISSION', message: 'The patient was not in the centre that day.' }
  }
  if (existingActiveOnTarget) {
    return { code: 'R1_DUPLICATE', message: `A reading already exists for that day (${evaluateFormat(existingActiveOnTarget.tempC)}). Use Correct reading instead.` }
  }
  return null
}

// ---- death (R22/R23) --------------------------------------------------------------

export function validateDeath(args: { patient: Patient }): FlowError | null {
  if (args.patient.status === 'DISCHARGED' || args.patient.status === 'DECEASED') {
    return { code: 'R23_TERMINAL', message: 'This record is closed and read-only.' }
  }
  return null
}

// ---- admission (R24/R25) ------------------------------------------------------------

export interface AdmissionArgs {
  name: string
  age: number
  sex: 'F' | 'M' | 'X'
  bed: string | null
  occupiedCount: number
  occupiedBeds: string[]
  existingPatients: Patient[]
  confirmDuplicate: boolean
}

export function validateAdmission(args: AdmissionArgs): FlowError | null {
  const { name, age, sex, bed, occupiedCount, occupiedBeds, existingPatients, confirmDuplicate } = args
  if (!name || name.trim().length === 0 || !Number.isFinite(age) || age < 0 || age > 120 || !sex || !bed || !isValidBed(bed)) {
    return { code: 'R25_FIELDS', message: 'Admission needs a name, an age from 0 to 120, a sex, and a free bed.' }
  }
  if (occupiedCount >= CONFIG.CAPACITY) {
    return { code: 'R24_NO_BEDS', message: 'No free beds. Complete a pending discharge to free one.' }
  }
  if (occupiedBeds.includes(bed)) {
    return { code: 'R25_BED_TAKEN', message: `Bed ${bed} is occupied. Choose a free bed.` }
  }
  if (!confirmDuplicate) {
    const dup = existingPatients.find((p) => ACTIVE.includes(p.status) && p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.age === age)
    if (dup) {
      return { code: 'R25_DUPLICATE', message: `Possible duplicate: ${dup.name}, ${dup.age}, is already admitted. Confirm to admit anyway.` }
    }
  }
  return null
}
