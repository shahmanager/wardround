// Shared domain types. These describe the shapes the database returns and
// the pure functions compute over; nothing here touches storage or React.
import type { Role } from './permissions'

export type PatientStatus = 'ADMITTED' | 'DISCHARGE_APPROVED' | 'DISCHARGED' | 'DECEASED'
export type Outcome = 'cured' | 'died'
export type Sex = 'F' | 'M' | 'X'
export type ReadingStatus = 'active' | 'void' | 'superseded'

export interface Staff {
  id: string
  name: string
  role: Role
  isHead: boolean
  displayOrder: number
}

export interface Patient {
  id: string
  name: string
  age: number
  sex: Sex
  bed: string | null
  status: PatientStatus
  admittedDay: string | null
  firstEligibleDay: string | null
  statusChangedDay: string | null
  outcome: Outcome | null
  closedDay: string | null
}

export interface Reading {
  id: string
  patientId: string
  day: string
  tempC: number
  status: ReadingStatus
  masked: boolean
  lateEntry: boolean
  recordedBy: string
  recordedByRole: Role
  recordedAt: string
  reason: string | null
  supersedesId: string | null
}

export interface Visit {
  id: string
  patientId: string
  day: string
  loggedAt: string
  loggedBy: string
  note: string | null
  viaDischargeApproval: boolean
}

export interface AuditEntry {
  id: string
  day: string
  at: string
  actorId: string | null
  actorRole: string
  action: string
  patientId: string | null
  detail: string | null
}

export interface WaitlistEntry {
  id: string
  name: string
  age: number
  sex: Sex
  addedDay: string
  position: number
}

export interface Workspace {
  id: string
  currentDay: string
  createdAt: string
  lastActiveAt: string
}

/** Per-day derived state for one patient (section 4). */
export interface PatientDayState {
  status: 'TO_MEASURE' | 'MEASURED' | 'VISITED'
  todayReading: Reading | null
  yesterdayReading: Reading | null
  visitToday: Visit | null
  streak: number
  eligible: boolean
  flags: {
    needsAttention: boolean
    masked: boolean
    delayed: boolean
    missedYesterday: boolean
    lateEntry: boolean
  }
  delayDays: number
}

/** The signed-in user as the domain sees them. */
export interface Principal {
  workspaceId: string
  staffId: string
  name: string
  role: Role
  isHead: boolean
  currentDay: string
}
