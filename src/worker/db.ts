// Row mappers and thin query helpers. The worker's job is to load rows, map
// them to the domain shapes, hand them to src/domain, and write results back.
import type {
  AuditEntry,
  Outcome,
  Patient,
  PatientStatus,
  Reading,
  ReadingStatus,
  Role,
  Sex,
  Staff,
  Visit,
  WaitlistEntry,
} from '../domain'

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (v == null ? null : String(v))
const num = (v: unknown): number => Number(v)
const flag = (v: unknown): boolean => v === 1

export function staffFromRow(r: Row): Staff {
  return {
    id: String(r.id),
    name: String(r.name),
    role: r.role as Role,
    isHead: flag(r.is_head),
    displayOrder: num(r.display_order),
  }
}

export function patientFromRow(r: Row): Patient {
  return {
    id: String(r.id),
    name: String(r.name),
    age: num(r.age),
    sex: r.sex as Sex,
    bed: str(r.bed),
    status: r.status as PatientStatus,
    admittedDay: str(r.admitted_day),
    firstEligibleDay: str(r.first_eligible_day),
    statusChangedDay: str(r.status_changed_day),
    outcome: str(r.outcome) as Outcome | null,
    closedDay: str(r.closed_day),
  }
}

export function readingFromRow(r: Row): Reading {
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    day: String(r.day),
    tempC: num(r.temp_c),
    status: r.status as ReadingStatus,
    masked: flag(r.masked),
    lateEntry: flag(r.late_entry),
    recordedBy: String(r.recorded_by),
    recordedByRole: r.recorded_by_role as Role,
    recordedAt: String(r.recorded_at),
    reason: str(r.reason),
    supersedesId: str(r.supersedes_id),
  }
}

export function visitFromRow(r: Row): Visit {
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    day: String(r.day),
    loggedAt: String(r.logged_at),
    loggedBy: String(r.logged_by),
    note: str(r.note),
    viaDischargeApproval: flag(r.via_discharge_approval),
  }
}

export function auditFromRow(r: Row): AuditEntry {
  return {
    id: String(r.id),
    day: String(r.day),
    at: String(r.at),
    actorId: str(r.actor_id),
    actorRole: String(r.actor_role),
    action: String(r.action),
    patientId: str(r.patient_id),
    detail: str(r.detail),
  }
}

export function waitlistFromRow(r: Row): WaitlistEntry {
  return {
    id: String(r.id),
    name: String(r.name),
    age: num(r.age),
    sex: r.sex as Sex,
    addedDay: String(r.added_day),
    position: num(r.position),
  }
}

// ---- queries -----------------------------------------------------------------

async function q(db: D1Database, sql: string, ...bind: unknown[]): Promise<Row[]> {
  const res = await db.prepare(sql).bind(...bind).all()
  return res.results ?? []
}

export async function one(db: D1Database, sql: string, ...bind: unknown[]): Promise<Row | null> {
  const rows = await q(db, sql, ...bind)
  return rows[0] ?? null
}

async function count(db: D1Database, sql: string, ...bind: unknown[]): Promise<number> {
  const rows = await q(db, sql, ...bind)
  return rows[0] ? num(rows[0].n) : 0
}

export const getTemplateDay = async (db: D1Database): Promise<string | null> => {
  const r = await one(db, "SELECT current_day FROM workspaces WHERE id = 'template'")
  return r ? String(r.current_day) : null
}

export const getTemplateStaffList = async (db: D1Database): Promise<Staff[]> => {
  const rows = await q(db, "SELECT * FROM staff WHERE ws_id = 'template' ORDER BY display_order")
  return rows.map(staffFromRow)
}

export const getTemplateStaff = async (db: D1Database, staffId: string): Promise<Staff | null> => {
  const r = await one(db, "SELECT * FROM staff WHERE ws_id = 'template' AND id = ?", staffId)
  return r ? staffFromRow(r) : null
}

export const getStaff = async (db: D1Database, wsId: string, staffId: string): Promise<Staff | null> => {
  const r = await one(db, 'SELECT * FROM staff WHERE ws_id = ? AND id = ?', wsId, staffId)
  return r ? staffFromRow(r) : null
}

export const getWorkspaceDay = async (db: D1Database, wsId: string): Promise<string | null> => {
  const r = await one(db, 'SELECT current_day FROM workspaces WHERE id = ?', wsId)
  return r ? String(r.current_day) : null
}

export const getPatient = async (db: D1Database, wsId: string, patientId: string): Promise<Patient | null> => {
  const r = await one(db, 'SELECT * FROM patients WHERE ws_id = ? AND id = ?', wsId, patientId)
  return r ? patientFromRow(r) : null
}

export const listPatients = async (db: D1Database, wsId: string): Promise<Patient[]> => {
  const rows = await q(db, 'SELECT * FROM patients WHERE ws_id = ? ORDER BY bed, id', wsId)
  return rows.map(patientFromRow)
}

export const getReading = async (db: D1Database, wsId: string, readingId: string): Promise<Reading | null> => {
  const r = await one(db, 'SELECT * FROM readings WHERE ws_id = ? AND id = ?', wsId, readingId)
  return r ? readingFromRow(r) : null
}

export const listReadings = async (db: D1Database, wsId: string, patientId?: string): Promise<Reading[]> => {
  const rows = patientId
    ? await q(db, 'SELECT * FROM readings WHERE ws_id = ? AND patient_id = ? ORDER BY day DESC, recorded_at DESC', wsId, patientId)
    : await q(db, 'SELECT * FROM readings WHERE ws_id = ? ORDER BY day DESC, recorded_at DESC', wsId)
  return rows.map(readingFromRow)
}

export const listVisits = async (db: D1Database, wsId: string, patientId?: string): Promise<Visit[]> => {
  const rows = patientId
    ? await q(db, 'SELECT * FROM visits WHERE ws_id = ? AND patient_id = ? ORDER BY day DESC, logged_at DESC', wsId, patientId)
    : await q(db, 'SELECT * FROM visits WHERE ws_id = ? ORDER BY day DESC, logged_at DESC', wsId)
  return rows.map(visitFromRow)
}

export interface AuditFilter {
  patientId?: string
  actorId?: string
  action?: string
  limit: number
}

export const listAudit = async (db: D1Database, wsId: string, f: AuditFilter): Promise<AuditEntry[]> => {
  const conds = ['ws_id = ?']
  const bind: unknown[] = [wsId]
  if (f.patientId) {
    conds.push('patient_id = ?')
    bind.push(f.patientId)
  }
  if (f.actorId) {
    conds.push('actor_id = ?')
    bind.push(f.actorId)
  }
  if (f.action) {
    conds.push('action = ?')
    bind.push(f.action)
  }
  const sql = `SELECT * FROM audit WHERE ${conds.join(' AND ')} ORDER BY at DESC, id DESC LIMIT ?`
  const rows = await q(db, sql, ...bind, f.limit)
  return rows.map(auditFromRow)
}

export const listWaitlist = async (db: D1Database, wsId: string): Promise<WaitlistEntry[]> => {
  const rows = await q(db, 'SELECT * FROM waitlist WHERE ws_id = ? ORDER BY position', wsId)
  return rows.map(waitlistFromRow)
}

export const countActiveWorkspaces = (db: D1Database): Promise<number> =>
  count(db, "SELECT COUNT(*) AS n FROM workspaces WHERE id != 'template'")

// ---- sandbox workspace lifecycle ----------------------------------------------

/** Children first so the workspace delete never leaves orphan rows (and to
 * satisfy foreign keys): readings and visits reference patients. */
const DATA_TABLES = ['readings', 'visits', 'audit', 'waitlist', 'staff', 'patients'] as const

const COPY_COLUMNS: Readonly<Record<(typeof DATA_TABLES)[number], string>> = {
  staff: 'id, name, role, is_head, display_order',
  patients:
    'id, name, age, sex, bed, status, admitted_day, first_eligible_day, status_changed_day, status_changed_at, outcome, closed_day, created_day, created_at',
  readings:
    'id, patient_id, day, temp_c, status, masked, late_entry, recorded_by, recorded_by_role, recorded_at, reason, supersedes_id',
  visits: 'id, patient_id, day, logged_at, logged_by, note, via_discharge_approval',
  waitlist: 'id, name, age, sex, added_day, position',
  audit: 'id, day, at, actor_id, actor_role, action, patient_id, detail',
}

/** Parent-first copy order: D1 enforces FKs, so patients must land before
 *  readings/visits (both reference patients(ws_id, id)). */
const COPY_ORDER = ['staff', 'patients', 'waitlist', 'readings', 'visits', 'audit'] as const

/** Fast template copy for one visitor workspace: INSERT ... SELECT per table. */
export function copyStatements(db: D1Database, wsId: string): D1PreparedStatement[] {
  return COPY_ORDER.map((t) =>
    db.prepare(`INSERT INTO ${t} (ws_id, ${COPY_COLUMNS[t]}) SELECT ?, ${COPY_COLUMNS[t]} FROM ${t} WHERE ws_id = 'template'`).bind(wsId),
  )
}

/** Delete every workspace whose last_active_at is older than the cutoff. */
export function purgeStatements(db: D1Database, cutoff: string): D1PreparedStatement[] {
  const stale = "(SELECT id FROM workspaces WHERE last_active_at < ? AND id != 'template')"
  return [
    ...DATA_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE ws_id IN ${stale}`).bind(cutoff)),
    db.prepare("DELETE FROM workspaces WHERE last_active_at < ? AND id != 'template'").bind(cutoff),
  ]
}

/** Reset one workspace: clear its rows, restore the template copy and clock. */
export function resetStatements(db: D1Database, wsId: string): D1PreparedStatement[] {
  return [
    ...DATA_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE ws_id = ?`).bind(wsId)),
    db.prepare("UPDATE workspaces SET current_day = (SELECT current_day FROM workspaces WHERE id = 'template') WHERE id = ?").bind(wsId),
    ...copyStatements(db, wsId),
  ]
}
