// The /api/* contract (docs/API.md). Every route: load rows, call src/domain,
// then write the change and the audit row in one D1 batch (R32). The route
// bodies hold sequencing only — no rule logic lives here.
import { Hono } from 'hono'
import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  approvalInvalidated,
  allBeds,
  computeStreak,
  complianceStats,
  CONFIG,
  dateAdd,
  dayDiff,
  delayStats,
  evaluatePatientDay,
  evaluateTempInput,
  formatTemp,
  mortalityStats,
  validateAdmission,
  validateApprove,
  validateCompleteDischarge,
  validateCorrection,
  validateDeath,
  validateDoctorReading,
  validateLateEntry,
  validateNewReading,
  validateUndo,
  validateVisit,
  type FlowError,
  type Patient,
  type Reading,
  type Visit,
} from '../domain'
import type { AppEnv } from './env'
import {
  clearedSessionCookie,
  getSessionSecret,
  sessionCookie,
  visitorCookieValue,
  VISITOR_COOKIE,
  VISITOR_TTL_S,
} from './auth'
import {
  getPatient,
  getReading,
  getTemplateDay,
  getTemplateStaff,
  getTemplateStaffList,
  getWorkspaceDay,
  listAudit,
  listPatients,
  listReadings,
  listVisits,
  listWaitlist,
  resetStatements,
} from './db'
import { apiError, mutationGuard, requirePermission, requireSession, securityHeaders } from './middleware'
import { reports } from './reports'

type Db = AppEnv['Bindings']['DB']

/** The single shared demo ward every visitor works on. */
const SHARED_WORKSPACE_ID = 'template'

const nowIso = (): string => new Date().toISOString()
/** Audit timestamps combine the workspace day with the wall-clock time (R33). */
const atIso = (day: string): string => `${day}T${nowIso().slice(11)}`

function auditStmt(
  db: Db,
  wsId: string,
  day: string,
  actorId: string,
  actorRole: string,
  action: string,
  patientId: string | null,
  detail: string | null,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO audit (ws_id, id, day, at, actor_id, actor_role, action, patient_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(wsId, crypto.randomUUID(), day, atIso(day), actorId, actorRole, action, patientId, detail)
}

const insertReadingStmt = (db: Db, wsId: string, r: Reading): D1PreparedStatement =>
  db
    .prepare(
      'INSERT INTO readings (ws_id, id, patient_id, day, temp_c, status, masked, late_entry, recorded_by, recorded_by_role, recorded_at, reason, supersedes_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(wsId, r.id, r.patientId, r.day, r.tempC, r.status, r.masked ? 1 : 0, r.lateEntry ? 1 : 0, r.recordedBy, r.recordedByRole, r.recordedAt, r.reason, r.supersedesId)

const insertVisitStmt = (db: Db, wsId: string, v: Visit): D1PreparedStatement =>
  db
    .prepare('INSERT INTO visits (ws_id, id, patient_id, day, logged_at, logged_by, note, via_discharge_approval) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(wsId, v.id, v.patientId, v.day, v.loggedAt, v.loggedBy, v.note, v.viaDischargeApproval ? 1 : 0)

/** R19 auto-revoke: approval invalidated → back to ADMITTED + audited reason. */
function revokeStatements(db: Db, wsId: string, day: string, actorId: string, actorRole: string, patient: Patient, reason: string): D1PreparedStatement[] {
  return [
    db
      .prepare('UPDATE patients SET status = ?, status_changed_day = ?, status_changed_at = ? WHERE ws_id = ? AND id = ?')
      .bind('ADMITTED', day, nowIso(), wsId, patient.id),
    auditStmt(db, wsId, day, actorId, actorRole, 'discharge.revoked', patient.id, reason),
  ]
}

async function parseBody<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T | null> {
  const raw: unknown = await c.req.json().catch(() => null)
  if (raw === null) return null
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function domainError(c: Context<AppEnv>, err: FlowError): Response {
  return apiError(c, 400, err.code, err.message)
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(key(item)) ?? []
    list.push(item)
    map.set(key(item), list)
  }
  return map
}

const patientInBed = (p: Patient): boolean => p.status === 'ADMITTED' || p.status === 'DISCHARGE_APPROVED'

// ---- bodies --------------------------------------------------------------------

const staffBody = z.object({ staffId: z.string().min(1) })
const readingBody = z.object({
  patientId: z.string().min(1),
  value: z.number().finite(),
  masked: z.boolean().optional(),
  confirm: z.boolean().optional(),
  reason: z.string().max(500).optional(),
})
const correctBody = z.object({ value: z.number().finite(), reason: z.string().max(500), confirm: z.boolean().optional() })
const lateBody = z.object({ patientId: z.string().min(1), value: z.number().finite(), reason: z.string().max(500) })
const visitBody = z.object({ patientId: z.string().min(1), note: z.string().max(500).optional() })
const patientIdBody = z.object({ patientId: z.string().min(1) })
const admitBody = z.object({
  name: z.string().min(1).max(80),
  age: z.number().finite(),
  sex: z.enum(['F', 'M', 'X']),
  bed: z.string().min(1),
  confirmDuplicate: z.boolean().optional(),
  fromWaitlistId: z.string().optional(),
})

const INVALID_BODY = 'INVALID_BODY'
const CONFIRM_MSG = 'That value is unusual. Confirm the reading on the thermometer, then choose "Yes, this reading is correct".'

export const routes = new Hono<AppEnv>()

routes.use('*', securityHeaders)

// ---- public routes (no session) --------------------------------------------

routes.get('/health', async (c) => {
  const day = await getTemplateDay(c.env.DB)
  return c.json({ ok: true, day })
})

routes.get('/staff', async (c) => {
  return c.json({ staff: await getTemplateStaffList(c.env.DB) })
})

// Session creation. A returning visitor keeps their workspace across sign-outs
// and role switches, because the demo path swaps roles on one ward (PLAN
// section 13). Only a first visit copies the template; the long-lived visitor
// cookie carries the workspace id, never the staff identity.
routes.post('/session', mutationGuard, async (c) => {
  const body = await parseBody(c, staffBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { staffId }.')
  const staff = await getTemplateStaff(c.env.DB, body.staffId)
  if (!staff) return apiError(c, 401, 'NO_SESSION', 'Unknown staff member. Choose a name from the sign-in list.')
  const secret = await getSessionSecret(c.env.DB, c.env.SESSION_SECRET)

  // One shared demo ward, and signing in is a pure read. The free-tier D1 row
  // budget is spent by reviewers using the app, not by copying the template per
  // visitor or by bookkeeping on a cookie that already names the workspace.
  const templateDay = await getTemplateDay(c.env.DB)
  if (!templateDay) return apiError(c, 500, 'INTERNAL', 'The template workspace is missing. Re-run the seed.')
  const wsId = SHARED_WORKSPACE_ID
  const currentDay = templateDay
  c.header('Set-Cookie', await sessionCookie(secret, wsId, staff.id))
  setCookie(c, VISITOR_COOKIE, await visitorCookieValue(secret, wsId), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: VISITOR_TTL_S,
  })
  return c.json({ workspaceId: wsId, currentDay, staff })
})

// Clears the staff session only. VISITOR_COOKIE survives, so signing back in —
// as another role, for the demo path — resumes the same visitor workspace.
routes.delete('/session', (c) => {
  c.header('Set-Cookie', clearedSessionCookie())
  return c.body(null, 204)
})

// ---- session-scoped routes ---------------------------------------------------

routes.get('/me', requireSession, (c) => {
  return c.json({
    staff: c.get('staff'),
    workspaceId: c.get('principal').workspaceId,
    currentDay: c.get('principal').currentDay,
  })
})

routes.post('/demo/advance', mutationGuard, requireSession, async (c) => {
  const p = c.get('principal')
  await c.env.DB.prepare("UPDATE workspaces SET current_day = date(current_day, '+1 day') WHERE id = ?").bind(p.workspaceId).run()
  return c.json({ currentDay: await getWorkspaceDay(c.env.DB, p.workspaceId) })
})

routes.post('/demo/reset', mutationGuard, requireSession, async (c) => {
  const p = c.get('principal')
  await c.env.DB.batch(resetStatements(c.env.DB, p.workspaceId))
  return c.json({ currentDay: await getWorkspaceDay(c.env.DB, p.workspaceId) })
})

routes.get('/ward', requireSession, requirePermission('patient.view'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const [patients, readings, visits] = await Promise.all([
    listPatients(db, p.workspaceId),
    listReadings(db, p.workspaceId),
    listVisits(db, p.workspaceId),
  ])
  const inBed = patients.filter(patientInBed)
  const readingsByPatient = groupBy(readings, (r) => r.patientId)
  const visitsByPatient = groupBy(visits, (v) => v.patientId)
  const compliance = complianceStats({ patients, readings, visits, today: p.currentDay })
  return c.json({
    currentDay: p.currentDay,
    capacity: CONFIG.CAPACITY,
    occupied: inBed.length,
    compliance: {
      bedCount: compliance.bedCount,
      measuredCount: compliance.measuredCount,
      visitCount: compliance.visitCount,
      visitsAfterTempCount: compliance.visitsAfterTempCount,
    },
    patients: inBed.map((patient) => ({
      ...patient,
      day: evaluatePatientDay({
        patient,
        readings: readingsByPatient.get(patient.id) ?? [],
        visits: visitsByPatient.get(patient.id) ?? [],
        today: p.currentDay,
      }),
    })),
  })
})

routes.get('/patient/:id', requireSession, requirePermission('patient.view'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const patient = await getPatient(db, p.workspaceId, c.req.param('id'))
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const [readings, visits, audit] = await Promise.all([
    listReadings(db, p.workspaceId, patient.id),
    listVisits(db, p.workspaceId, patient.id),
    listAudit(db, p.workspaceId, { patientId: patient.id, limit: 200 }),
  ])
  return c.json({
    patient,
    day: evaluatePatientDay({ patient, readings, visits, today: p.currentDay }),
    readings,
    visits,
    audit,
  })
})

// ---- mutations: readings -------------------------------------------------------

// Nurse normal path / doctor exception path (R11). After every successful
// write: audit row (R32), then the R19 approval recompute (auto-revoke).
routes.post('/reading', mutationGuard, requireSession, requirePermission('reading.record'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, readingBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { patientId, value }.')
  const patient = await getPatient(db, p.workspaceId, body.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const today = p.currentDay
  const readings = await listReadings(db, p.workspaceId, patient.id)
  const active = readings.filter((r) => r.status === 'active')
  const todayActive = active.find((r) => r.day === today) ?? null
  const prevActive = active.find((r) => r.day < today) ?? null

  let err: FlowError | null
  if (p.role === 'DOCTOR') {
    err = validateDoctorReading({ patient, today, todayReading: todayActive, reason: body.reason ?? null, confirmed: body.confirm ?? false })
    if (!err) {
      const ev = evaluateTempInput(String(body.value), prevActive?.tempC ?? null)
      if (!ev.ok) err = { code: ev.code ?? 'R3_RANGE', message: ev.message ?? 'Invalid reading.' }
      else if (ev.needsConfirm && !body.confirm) err = { code: 'R3_CONFIRM', message: CONFIRM_MSG }
    }
  } else {
    err = validateNewReading({
      patient,
      today,
      existingActiveToday: todayActive,
      prevReading: prevActive,
      input: { value: body.value, masked: body.masked ?? false, confirmed: body.confirm ?? false },
      recordedByName: p.name,
    })
  }
  if (err) return domainError(c, err)

  const reading: Reading = {
    id: crypto.randomUUID(),
    patientId: patient.id,
    day: today,
    tempC: body.value,
    status: 'active',
    masked: p.role === 'NURSE' ? (body.masked ?? false) : false,
    lateEntry: false,
    recordedBy: p.staffId,
    recordedByRole: p.role,
    recordedAt: nowIso(),
    reason: body.reason ?? null,
    supersedesId: null,
  }
  const detail = `Recorded ${formatTemp(reading.tempC)} °C${reading.masked ? ' (masked)' : ''}${reading.reason ? ` — ${reading.reason}` : ''}`
  const stmts: D1PreparedStatement[] = [
    insertReadingStmt(db, p.workspaceId, reading),
    auditStmt(db, p.workspaceId, today, p.staffId, p.role, 'reading.recorded', patient.id, detail),
  ]
  const revoke = approvalInvalidated({ patient, readings: [...readings, reading], today })
  if (revoke) stmts.push(...revokeStatements(db, p.workspaceId, today, p.staffId, p.role, patient, revoke.message))
  await db.batch(stmts)
  return c.json({ reading })
})

routes.post('/reading/:id/undo', mutationGuard, requireSession, requirePermission('reading.undo_own'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const reading = await getReading(db, p.workspaceId, c.req.param('id'))
  if (!reading) return apiError(c, 404, 'NOT_FOUND', 'No such reading.')
  const err = validateUndo({
    reading,
    actorStaffId: p.staffId,
    actorRole: p.role,
    today: p.currentDay,
    nowAt: nowIso(),
  })
  if (err) return domainError(c, err)
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE readings SET status = ? WHERE ws_id = ? AND id = ?').bind('void', p.workspaceId, reading.id),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'reading.voided', reading.patientId, null),
  ]
  // Removing a reading can also invalidate an approval (R19).
  const patient = await getPatient(db, p.workspaceId, reading.patientId)
  if (patient) {
    const others = (await listReadings(db, p.workspaceId, patient.id)).filter((r) => r.id !== reading.id)
    const revoke = approvalInvalidated({ patient, readings: others, today: p.currentDay })
    if (revoke) stmts.push(...revokeStatements(db, p.workspaceId, p.currentDay, p.staffId, p.role, patient, revoke.message))
  }
  await db.batch(stmts)
  return c.json({})
})

// Correction: insert a new reading that supersedes the old one; the original
// is kept (R8). The old row must flip status before the insert in the same
// batch or the one-active-reading index would reject the new row.
routes.post('/reading/:id/correct', mutationGuard, requireSession, requirePermission('reading.correct'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, correctBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { value, reason }.')
  const old = await getReading(db, p.workspaceId, c.req.param('id'))
  if (!old) return apiError(c, 404, 'NOT_FOUND', 'No such reading.')
  const patient = await getPatient(db, p.workspaceId, old.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const visitToday = (await listVisits(db, p.workspaceId, patient.id)).find((v) => v.day === p.currentDay) ?? null
  const err = validateCorrection({ actorRole: p.role, reading: old, today: p.currentDay, visitToday, reason: body.reason })
  if (err) return domainError(c, err)
  const ev = evaluateTempInput(String(body.value), old.tempC)
  if (!ev.ok) return domainError(c, { code: ev.code ?? 'R3_RANGE', message: ev.message ?? 'Invalid reading.' })
  if (ev.needsConfirm && !body.confirm) return domainError(c, { code: 'R3_CONFIRM', message: CONFIRM_MSG })

  const reading: Reading = {
    id: crypto.randomUUID(),
    patientId: old.patientId,
    day: old.day,
    tempC: body.value,
    status: 'active',
    masked: old.masked,
    lateEntry: old.lateEntry,
    recordedBy: p.staffId,
    recordedByRole: p.role,
    recordedAt: nowIso(),
    reason: body.reason,
    supersedesId: old.id,
  }
  const after = [...(await listReadings(db, p.workspaceId, patient.id)).map((r) => (r.id === old.id ? { ...r, status: 'superseded' as const } : r)), reading]
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE readings SET status = ? WHERE ws_id = ? AND id = ?').bind('superseded', p.workspaceId, old.id),
    insertReadingStmt(db, p.workspaceId, reading),
    auditStmt(
      db,
      p.workspaceId,
      p.currentDay,
      p.staffId,
      p.role,
      'reading.corrected',
      patient.id,
      `Corrected ${formatTemp(old.tempC)} → ${formatTemp(reading.tempC)} °C — ${body.reason}`,
    ),
  ]
  const revoke = approvalInvalidated({ patient, readings: after, today: p.currentDay })
  if (revoke) stmts.push(...revokeStatements(db, p.workspaceId, p.currentDay, p.staffId, p.role, patient, revoke.message))
  await db.batch(stmts)
  return c.json({ reading })
})

routes.post('/reading/late', mutationGuard, requireSession, requirePermission('reading.late_entry'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, lateBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { patientId, value, reason }.')
  const patient = await getPatient(db, p.workspaceId, body.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const targetDay = dateAdd(p.currentDay, -1)
  const readings = await listReadings(db, p.workspaceId, patient.id)
  const existingActiveOnTarget = readings.find((r) => r.status === 'active' && r.day === targetDay) ?? null
  const err = validateLateEntry({ patient, targetDay, today: p.currentDay, reason: body.reason, existingActiveOnTarget })
  if (err) return domainError(c, err)
  const ev = evaluateTempInput(String(body.value), null)
  if (!ev.ok) return domainError(c, { code: ev.code ?? 'R3_RANGE', message: ev.message ?? 'Invalid reading.' })

  const reading: Reading = {
    id: crypto.randomUUID(),
    patientId: patient.id,
    day: targetDay,
    tempC: body.value,
    status: 'active',
    masked: false,
    lateEntry: true,
    recordedBy: p.staffId,
    recordedByRole: p.role,
    recordedAt: nowIso(),
    reason: body.reason,
    supersedesId: null,
  }
  const stmts: D1PreparedStatement[] = [
    insertReadingStmt(db, p.workspaceId, reading),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'reading.late_entry', patient.id, `Late entry for ${targetDay}: ${formatTemp(reading.tempC)} °C — ${body.reason}`),
  ]
  const revoke = approvalInvalidated({ patient, readings: [...readings, reading], today: p.currentDay })
  if (revoke) stmts.push(...revokeStatements(db, p.workspaceId, p.currentDay, p.staffId, p.role, patient, revoke.message))
  await db.batch(stmts)
  return c.json({ reading })
})

// ---- mutations: visits and discharge ------------------------------------------

routes.post('/visit', mutationGuard, requireSession, requirePermission('visit.log'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, visitBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { patientId }.')
  const patient = await getPatient(db, p.workspaceId, body.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const todayReading = (await listReadings(db, p.workspaceId, patient.id)).find((r) => r.status === 'active' && r.day === p.currentDay) ?? null
  const existingVisit = (await listVisits(db, p.workspaceId, patient.id)).find((v) => v.day === p.currentDay) ?? null
  const err = validateVisit({ patient, today: p.currentDay, todayReading, existingVisit })
  if (err) return domainError(c, err)
  const visit: Visit = {
    id: crypto.randomUUID(),
    patientId: patient.id,
    day: p.currentDay,
    loggedAt: nowIso(),
    loggedBy: p.staffId,
    note: body.note ?? null,
    viaDischargeApproval: false,
  }
  await db.batch([
    insertVisitStmt(db, p.workspaceId, visit),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'visit.logged', patient.id, body.note ?? null),
  ])
  return c.json({ visit })
})

// Approve (R18): counts as today's visit when none was logged.
routes.post('/discharge/approve', mutationGuard, requireSession, requirePermission('discharge.approve'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, patientIdBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { patientId }.')
  const patient = await getPatient(db, p.workspaceId, body.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const active = (await listReadings(db, p.workspaceId, patient.id)).filter((r) => r.status === 'active')
  const streak = computeStreak({ readings: active, today: p.currentDay, admittedDay: patient.admittedDay })
  const todayReading = active.find((r) => r.day === p.currentDay) ?? null
  const err = validateApprove({ patient, today: p.currentDay, streak, todayReading })
  if (err) return domainError(c, err)
  const updated: Patient = {
    ...patient,
    status: 'DISCHARGE_APPROVED',
    statusChangedDay: p.currentDay,
    firstEligibleDay: patient.firstEligibleDay ?? p.currentDay,
  }
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('UPDATE patients SET status = ?, status_changed_day = ?, status_changed_at = ?, first_eligible_day = COALESCE(first_eligible_day, ?) WHERE ws_id = ? AND id = ?')
      .bind('DISCHARGE_APPROVED', p.currentDay, nowIso(), p.currentDay, p.workspaceId, patient.id),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'discharge.approved', patient.id, `Approved: streak ${streak} of ${CONFIG.STREAK_DAYS_FOR_CURE} fever-free days`),
  ]
  if (!(await listVisits(db, p.workspaceId, patient.id)).some((v) => v.day === p.currentDay)) {
    stmts.push(
      insertVisitStmt(db, p.workspaceId, {
        id: crypto.randomUUID(),
        patientId: patient.id,
        day: p.currentDay,
        loggedAt: nowIso(),
        loggedBy: p.staffId,
        note: null,
        viaDischargeApproval: true,
      }),
    )
  }
  await db.batch(stmts)
  return c.json({ patient: updated })
})

routes.post('/discharge/complete', mutationGuard, requireSession, requirePermission('discharge.complete'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, patientIdBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { patientId }.')
  const patient = await getPatient(db, p.workspaceId, body.patientId)
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const err = validateCompleteDischarge({ patient })
  if (err) return domainError(c, err)
  const updated: Patient = { ...patient, status: 'DISCHARGED', outcome: 'cured', closedDay: p.currentDay, bed: null, statusChangedDay: p.currentDay }
  await db.batch([
    db
      .prepare("UPDATE patients SET status = ?, outcome = ?, closed_day = ?, bed = NULL, status_changed_day = ?, status_changed_at = ? WHERE ws_id = ? AND id = ?")
      .bind('DISCHARGED', 'cured', p.currentDay, p.currentDay, nowIso(), p.workspaceId, patient.id),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'discharge.completed', patient.id, 'Outcome recorded as cured; bed freed'),
  ])
  return c.json({ patient: updated })
})

// ---- mutations: admission and death --------------------------------------------

routes.post('/patient/admit', mutationGuard, requireSession, requirePermission('patient.admit'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const body = await parseBody(c, admitBody)
  if (!body) return apiError(c, 400, INVALID_BODY, 'Send { name, age, sex, bed }.')
  const occupied = (await listPatients(db, p.workspaceId)).filter(patientInBed)
  const occupiedBeds = occupied.map((x) => x.bed).filter((b): b is string => b !== null)
  const err = validateAdmission({
    name: body.name,
    age: body.age,
    sex: body.sex,
    bed: body.bed,
    occupiedCount: occupied.length,
    occupiedBeds,
    existingPatients: await listPatients(db, p.workspaceId),
    confirmDuplicate: body.confirmDuplicate ?? false,
  })
  if (err) return domainError(c, err)
  const patient: Patient = {
    id: crypto.randomUUID(),
    name: body.name,
    age: body.age,
    sex: body.sex,
    bed: body.bed,
    status: 'ADMITTED',
    admittedDay: p.currentDay,
    firstEligibleDay: null,
    statusChangedDay: p.currentDay,
    outcome: null,
    closedDay: null,
  }
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT INTO patients (ws_id, id, name, age, sex, bed, status, admitted_day, first_eligible_day, status_changed_day, status_changed_at, outcome, closed_day, created_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(p.workspaceId, patient.id, patient.name, patient.age, patient.sex, patient.bed, patient.status, patient.admittedDay, patient.firstEligibleDay, patient.statusChangedDay, nowIso(), patient.outcome, patient.closedDay, p.currentDay, nowIso()),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'patient.admitted', patient.id, `Admitted to bed ${patient.bed}`),
  ]
  if (body.fromWaitlistId) {
    stmts.push(db.prepare('DELETE FROM waitlist WHERE ws_id = ? AND id = ?').bind(p.workspaceId, body.fromWaitlistId))
  }
  await db.batch(stmts)
  return c.json({ patient })
})

routes.post('/patient/:id/death', mutationGuard, requireSession, requirePermission('patient.record_death'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const patient = await getPatient(db, p.workspaceId, c.req.param('id'))
  if (!patient) return apiError(c, 404, 'NOT_FOUND', 'No such patient in this workspace.')
  const err = validateDeath({ patient })
  if (err) return domainError(c, err)
  const updated: Patient = { ...patient, status: 'DECEASED', outcome: 'died', closedDay: p.currentDay, bed: null, statusChangedDay: p.currentDay }
  await db.batch([
    db
      .prepare("UPDATE patients SET status = ?, outcome = ?, closed_day = ?, bed = NULL, status_changed_day = ?, status_changed_at = ? WHERE ws_id = ? AND id = ?")
      .bind('DECEASED', 'died', p.currentDay, p.currentDay, nowIso(), p.workspaceId, patient.id),
    auditStmt(db, p.workspaceId, p.currentDay, p.staffId, p.role, 'patient.record_death', patient.id, `Outcome recorded as died${patient.bed ? `; bed ${patient.bed} freed` : ''}`),
  ])
  return c.json({ patient: updated })
})

// ---- head doctor and admin views ------------------------------------------------

routes.get('/dashboard', requireSession, requirePermission('dashboard.view'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const [patients, readings, visits] = await Promise.all([
    listPatients(db, p.workspaceId),
    listReadings(db, p.workspaceId),
    listVisits(db, p.workspaceId),
  ])
  const inBed = patients.filter(patientInBed)
  const closed = patients.filter((x) => x.status === 'DISCHARGED' || x.status === 'DECEASED')
  const mortality = mortalityStats(closed)
  const compliance = complianceStats({ patients, readings, visits, today: p.currentDay })
  const delay = delayStats({ patients, today: p.currentDay })
  const stays: number[] = []
  for (const x of closed) {
    if (x.admittedDay !== null && x.closedDay !== null) stays.push(dayDiff(x.admittedDay, x.closedDay))
  }
  const avgLengthOfStay = stays.length > 0 ? stays.reduce((a, b) => a + b, 0) / stays.length : null
  const weekAgo = dateAdd(p.currentDay, -6)
  const inLast7Days = (r: Reading): boolean => r.day >= weekAgo && r.day <= p.currentDay
  const doctorReadings = readings.filter((r) => inLast7Days(r) && r.recordedByRole === 'DOCTOR' && !r.lateEntry).length
  const lateEntries = readings.filter((r) => inLast7Days(r) && r.lateEntry).length
  return c.json({
    mortality,
    compliance,
    delay,
    occupancy: { occupied: inBed.length, capacity: CONFIG.CAPACITY },
    avgLengthOfStay,
    exceptions7d: { doctorReadings, lateEntries },
    closedCases: mortality.closed,
    outcomes: { deaths: mortality.deaths, cured: mortality.cured },
  })
})

routes.route('/reports', reports)

routes.get('/audit', requireSession, requirePermission('audit.view'), async (c) => {
  const p = c.get('principal')
  const rawLimit = Number(c.req.query('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 200
  const entries = await listAudit(c.env.DB, p.workspaceId, {
    patientId: c.req.query('patient'),
    actorId: c.req.query('actor'),
    action: c.req.query('action'),
    limit,
  })
  return c.json({ entries })
})

routes.get('/beds', requireSession, requirePermission('ops.view'), async (c) => {
  const p = c.get('principal')
  const db = c.env.DB
  const [patients, waitlist] = await Promise.all([
    listPatients(db, p.workspaceId),
    listWaitlist(db, p.workspaceId),
  ])
  const inBed = patients.filter((x): x is Patient & { bed: string } => patientInBed(x) && x.bed !== null)
  const occupiedBeds = inBed.map((x) => ({
    bed: x.bed,
    patient: { id: x.id, name: x.name, status: x.status, firstEligibleDay: x.firstEligibleDay },
  }))
  const taken = new Set(occupiedBeds.map((o) => o.bed))
  return c.json({ freeBeds: allBeds().filter((b) => !taken.has(b)), occupiedBeds, waitlist })
})
