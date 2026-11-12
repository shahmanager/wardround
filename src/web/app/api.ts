// API client, one function per endpoint in docs/API.md. The Worker is
// authoritative: this client only talks HTTP, validates nothing, and surfaces
// typed errors ({ code, message }) so screens can map them to blocked-action
// copy (R35). Every call carries the session cookie; there is no token store.
import type {
  AuditEntry,
  ComplianceStats,
  DelayStats,
  MortalityStats,
  Patient,
  PatientDayState,
  Reading,
  Staff,
  Visit,
  WaitlistEntry,
} from '@/domain'

const NETWORK_MESSAGE = 'Could not reach the server. Check the connection and retry.'

/** Typed error thrown by every api call; `code` is the domain error code. */
export class ApiClientError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const body = init?.body
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    })
  } catch {
    // R36: a failed fetch is never mistaken for a saved write.
    throw new ApiClientError('NETWORK', NETWORK_MESSAGE)
  }

  if (response.status === 204) return undefined as T

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const envelope = (payload as ErrorEnvelope | null)?.error
    throw new ApiClientError(
      envelope?.code ?? 'UNKNOWN',
      envelope?.message ?? `The request failed (HTTP ${response.status}). Retry.`,
    )
  }
  if (payload === null || typeof payload !== 'object') {
    throw new ApiClientError('BAD_RESPONSE', 'The server returned an unreadable response. Retry.')
  }
  return payload as T
}

// ---- Response shapes (docs/API.md) ---------------------------------------------

export interface SessionResponse {
  workspaceId: string
  currentDay: string
  staff: Staff
}

export interface MeResponse {
  staff: Staff
  workspaceId: string
  currentDay: string
}

export interface WardResponse {
  currentDay: string
  capacity: number
  occupied: number
  compliance: { bedCount: number; measuredCount: number; visitCount: number; visitsAfterTempCount: number }
  patients: Array<Patient & { day: PatientDayState }>
}

export interface PatientDetailResponse {
  patient: Patient
  day: PatientDayState
  readings: Reading[]
  visits: Visit[]
  audit: AuditEntry[]
}

export interface DashboardResponse {
  mortality: MortalityStats
  compliance: ComplianceStats
  delay: DelayStats
  occupancy: { occupied: number; capacity: number }
  avgLengthOfStay: number | null
  exceptions7d: { doctorReadings: number; lateEntries: number }
  closedCases: number
  outcomes: { deaths: number; cured: number }
}

export interface ReportsSeriesPoint {
  day: string
  measured: number
  visits: number
  admitted: number
  discharged: number
  died: number
  closed: number
}

export interface ReportsResponse {
  currentDay: string
  days: number
  closedCases: number
  outcomes: { deaths: number; cured: number }
  mortalityRate: number | null
  successRate: number | null
  avgLengthOfStay: number | null
  avgDischargeDelay: number | null
  mortalityLast7: { deaths: number; closed: number; rate: number | null }
  today: {
    bedCount: number
    measuredCount: number
    visitCount: number
    visitsBeforeTemp: number
    awaitingDischarge: number
    bedsLikelyFree: number
  }
  series: ReportsSeriesPoint[]
}

export interface AuditFilters {
  patient?: string
  actor?: string
  action?: string
  limit?: number
}

export interface BedsResponse {
  freeBeds: string[]
  occupiedBeds: Array<{ bed: string; patient: { id: string; name: string; status: Patient['status']; firstEligibleDay: string | null } }>
  waitlist: WaitlistEntry[]
}

export interface AdmitInput {
  name: string
  age: number
  sex: Patient['sex']
  bed: string
  confirmDuplicate?: boolean
  fromWaitlistId?: string
}

export interface ReadingInput {
  value: number
  masked?: boolean
  confirm?: boolean
  reason?: string
}

export interface CorrectInput {
  value: number
  reason: string
  confirm?: boolean
}

// Shared query keys so every screen invalidates the same cache entries.
export const queryKeys = {
  me: ['me'] as const,
  staff: ['staff'] as const,
  ward: ['ward'] as const,
  patient: (id: string) => ['patient', id] as const,
  dashboard: ['dashboard'] as const,
  reports: (days: number) => ['reports', days] as const,
  beds: ['beds'] as const,
  audit: (filters?: AuditFilters) => ['audit', filters ?? {}] as const,
}

// ---- Client ---------------------------------------------------------------------

export const api = {
  // Session / demo (demo.control — everyone in demo mode)
  getStaff: () => request<{ staff: Staff[] }>('/staff'),
  createSession: (staffId: string) => request<SessionResponse>('/session', { method: 'POST', body: { staffId } }),
  signOut: () => request<void>('/session', { method: 'DELETE' }),
  getMe: () => request<MeResponse>('/me'),
  advanceDay: () => request<{ currentDay: string }>('/demo/advance', { method: 'POST', body: {} }),
  resetDemo: () => request<{ currentDay: string }>('/demo/reset', { method: 'POST', body: {} }),

  // Ward (patient.view)
  getWard: () => request<WardResponse>('/ward'),
  getPatient: (id: string) => request<PatientDetailResponse>(`/patient/${encodeURIComponent(id)}`),

  // Readings
  recordReading: (patientId: string, input: ReadingInput) =>
    request<{ reading: Reading }>('/reading', { method: 'POST', body: { patientId, ...input } }),
  undoReading: (id: string) =>
    request<Record<string, never>>(`/reading/${encodeURIComponent(id)}/undo`, { method: 'POST', body: {} }),
  correctReading: (id: string, input: CorrectInput) =>
    request<{ reading: Reading }>(`/reading/${encodeURIComponent(id)}/correct`, { method: 'POST', body: input }),
  lateEntry: (patientId: string, input: { value: number; reason: string }) =>
    request<{ reading: Reading }>('/reading/late', { method: 'POST', body: { patientId, ...input } }),

  // Visits and discharge
  logVisit: (patientId: string, note?: string) =>
    request<{ visit: Visit }>('/visit', { method: 'POST', body: { patientId, ...(note ? { note } : {}) } }),
  approveDischarge: (patientId: string) =>
    request<{ patient: Patient }>('/discharge/approve', { method: 'POST', body: { patientId } }),
  completeDischarge: (patientId: string) =>
    request<{ patient: Patient }>('/discharge/complete', { method: 'POST', body: { patientId } }),

  // Admissions and death
  admitPatient: (input: AdmitInput) =>
    request<{ patient: Patient }>('/patient/admit', { method: 'POST', body: input }),
  recordDeath: (patientId: string) =>
    request<{ patient: Patient }>(`/patient/${encodeURIComponent(patientId)}/death`, { method: 'POST', body: {} }),

  // Head doctor / admin views
  getDashboard: () => request<DashboardResponse>('/dashboard'),
  getReports: (days: number) => request<ReportsResponse>(`/reports?days=${days}`),
  getAudit: (filters?: AuditFilters) => {
    const params = new URLSearchParams()
    if (filters?.patient) params.set('patient', filters.patient)
    if (filters?.actor) params.set('actor', filters.actor)
    if (filters?.action) params.set('action', filters.action)
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    const qs = params.toString()
    return request<{ entries: AuditEntry[] }>(`/audit${qs ? `?${qs}` : ''}`)
  },
  getBeds: () => request<BedsResponse>('/beds'),
}
