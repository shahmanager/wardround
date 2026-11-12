import type { Outcome, Patient, Reading, Role, Visit } from '../types'
import type { Permission } from '../permissions'
import { can } from '../permissions'

export const START = '2026-11-12'

export function day(n: number): string {
  // days back from START: day(0) = START, day(1) = yesterday
  const t = new Date(`${START}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() - n)
  return t.toISOString().slice(0, 10)
}

let readingSeq = 0
export function rd(
  patientId: string,
  daysBack: number,
  tempC: number,
  opts: Partial<Pick<Reading, 'masked' | 'lateEntry' | 'status' | 'recordedAt' | 'recordedBy' | 'recordedByRole' | 'reason'>> = {},
): Reading {
  readingSeq += 1
  return {
    id: `r-${readingSeq}`,
    patientId,
    day: day(daysBack),
    tempC,
    status: 'active',
    masked: false,
    lateEntry: false,
    recordedBy: 'nurse-asha',
    recordedByRole: 'NURSE',
    recordedAt: `${day(daysBack)}T08:00:00Z`,
    reason: null,
    supersedesId: null,
    ...opts,
  }
}

export function pt(overrides: Partial<Patient> & { id?: string } = {}): Patient {
  return {
    id: 'p-001',
    name: 'Ramesh Kumar',
    age: 42,
    sex: 'M',
    bed: 'A-1',
    status: 'ADMITTED',
    admittedDay: day(10),
    firstEligibleDay: null,
    statusChangedDay: day(10),
    outcome: null,
    closedDay: null,
    ...overrides,
  }
}

export function vt(patientId: string, daysBack: number, loggedAt?: string, note: string | null = null): Visit {
  return {
    id: `v-${patientId}-${day(daysBack)}`,
    patientId,
    day: day(daysBack),
    loggedAt: loggedAt ?? `${day(daysBack)}T09:30:00Z`,
    loggedBy: 'doctor-rao',
    note,
    viaDischargeApproval: false,
  }
}

export function closedCase(outcome: Outcome, closedDaysBack: number, eligibleDaysBack: number): Patient {
  return pt({
    id: `p-h-${outcome}-${closedDaysBack}`,
    status: outcome === 'died' ? 'DECEASED' : 'DISCHARGED',
    outcome,
    closedDay: day(closedDaysBack),
    firstEligibleDay: day(eligibleDaysBack),
    bed: null,
  })
}

// ---- permission matrix ----------------------------------------------------

const NURSE: { role: Role; isHead: boolean } = { role: 'NURSE', isHead: false }
const DOCTOR: { role: Role; isHead: boolean } = { role: 'DOCTOR', isHead: false }
const HEAD: { role: Role; isHead: boolean } = { role: 'DOCTOR', isHead: true }
const ADMIN: { role: Role; isHead: boolean } = { role: 'ADMIN', isHead: false }

const EXPECTED: Record<Permission, [boolean, boolean, boolean, boolean]> = {
  //                     nurse   doctor  head    admin
  'patient.view': [true, true, true, true],
  'reading.record': [true, true, true, false],
  'reading.undo_own': [true, false, false, false],
  'reading.correct': [true, true, true, false],
  'reading.late_entry': [false, true, true, false],
  'reading.accept_masked': [false, true, true, false],
  'visit.log': [false, true, true, false],
  'discharge.approve': [false, true, true, false],
  'discharge.complete': [false, false, false, true],
  'patient.admit': [false, false, false, true],
  'waitlist.manage': [false, false, false, true],
  'patient.record_death': [false, true, true, false],
  'dashboard.view': [false, false, true, false],
  'ops.view': [false, false, true, true],
  'audit.view': [false, false, true, true],
  'settings.manage': [false, false, true, false],
}

describe('permissions: server-side RBAC matrix (R31)', () => {
  for (const permission of Object.keys(EXPECTED) as Permission[]) {
    test(`${permission}`, () => {
      const [n, d, h, a] = EXPECTED[permission]
      expect(can(NURSE, permission)).toBe(n)
      expect(can(DOCTOR, permission)).toBe(d)
      expect(can(HEAD, permission)).toBe(h)
      expect(can(ADMIN, permission)).toBe(a)
    })
  }
})
