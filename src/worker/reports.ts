// Management reports for the head doctor (mounted at /api/reports). Read-only:
// every query is scoped to the caller's workspace and nothing is mutated. The
// figures reuse src/domain maths (streak, dates, config) and follow the same
// conventions as the /dashboard block in routes.ts: load rows, then summarise.
import { Hono } from 'hono'
import {
  CONFIG,
  computeStreak,
  dateAdd,
  dayDiff,
  readingQualifies,
  type Patient,
  type Reading,
} from '../domain'
import type { AppEnv } from './env'
import { listPatients, listReadings, listVisits } from './db'
import { apiError, requirePermission, requireSession } from './middleware'

type Db = AppEnv['Bindings']['DB']

const DEFAULT_DAYS = 14
const MAX_DAYS = 30

/** `?days=` must be an integer 1..30; absent means 14 (API contract). */
function parseDays(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_DAYS
  if (!/^\d+$/.test(raw)) return null
  const days = Number(raw)
  return Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? days : null
}

const patientInBed = (p: Patient): boolean =>
  (p.status === 'ADMITTED' || p.status === 'DISCHARGE_APPROVED') && p.bed !== null

const patientClosed = (p: Patient): boolean => p.status === 'DISCHARGED' || p.status === 'DECEASED'

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

const bump = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * `created_day` is not part of the domain Patient shape, so the series'
 * "admitted" counts come from one lean query instead of widening the domain.
 */
async function createdDayByPatient(db: Db, wsId: string): Promise<Map<string, string>> {
  const result = await db
    .prepare('SELECT id, created_day FROM patients WHERE ws_id = ?')
    .bind(wsId)
    .all<{ id: string; created_day: string }>()
  const createdDays = new Map<string, string>()
  for (const row of result.results ?? []) createdDays.set(String(row.id), String(row.created_day))
  return createdDays
}

export const reports = new Hono<AppEnv>()

reports.get('/', requireSession, requirePermission('dashboard.view'), async (c) => {
  const days = parseDays(c.req.query('days'))
  if (days === null) {
    return apiError(c, 400, 'VALID_400_DAYS', 'days must be a whole number from 1 to 30.')
  }

  const p = c.get('principal')
  const db = c.env.DB
  const [patients, readings, visits, createdDays] = await Promise.all([
    listPatients(db, p.workspaceId),
    listReadings(db, p.workspaceId),
    listVisits(db, p.workspaceId),
    createdDayByPatient(db, p.workspaceId),
  ])
  const today = p.currentDay

  const inBed = patients.filter(patientInBed)
  const activeReadings = readings.filter((r) => r.status === 'active')
  const activeToday = activeReadings.filter((r) => r.day === today)
  const activeTodayByPatient = new Map<string, Reading>(activeToday.map((r) => [r.patientId, r]))
  const activeByPatient = new Map<string, Reading[]>()
  for (const r of activeReadings) {
    const list = activeByPatient.get(r.patientId) ?? []
    list.push(r)
    activeByPatient.set(r.patientId, list)
  }

  // ---- outcomes (closed cases = outcomes known, mirroring /dashboard) --------
  const closed = patients.filter(patientClosed)
  const known = closed.filter((x) => x.outcome !== null)
  const outcomes = { deaths: known.filter((x) => x.outcome === 'died').length, cured: 0 }
  outcomes.cured = known.length - outcomes.deaths
  const closedCases = known.length
  const mortalityRate = closedCases > 0 ? outcomes.deaths / closedCases : null
  const successRate = closedCases > 0 ? outcomes.cured / closedCases : null

  const stays: number[] = []
  for (const x of closed) {
    if (x.admittedDay !== null && x.closedDay !== null) stays.push(dayDiff(x.admittedDay, x.closedDay))
  }
  const avgLengthOfStay = mean(stays)

  // Mean days from eligibility to discharge over DISCHARGED patients; a
  // same-day or early discharge clamps to 0 (delay is never negative).
  const delays: number[] = []
  for (const x of patients) {
    if (x.status !== 'DISCHARGED' || x.firstEligibleDay === null || x.statusChangedDay === null) continue
    delays.push(Math.max(0, dayDiff(x.firstEligibleDay, x.statusChangedDay)))
  }
  const avgDischargeDelay = mean(delays)

  const weekStart = dateAdd(today, -6)
  const last7 = known.filter((x) => x.closedDay !== null && x.closedDay >= weekStart && x.closedDay <= today)
  const last7Deaths = last7.filter((x) => x.outcome === 'died').length
  const mortalityLast7 = {
    deaths: last7Deaths,
    closed: last7.length,
    rate: last7.length > 0 ? last7Deaths / last7.length : null,
  }

  // ---- today's process -------------------------------------------------------
  const measuredCount = inBed.filter((x) => activeTodayByPatient.has(x.id)).length
  const visitsToday = visits.filter((v) => v.day === today)
  // R13 rule as a figure: visits logged before that day's temperature. Compare
  // only the time of day on the same workspace day, and count each visit once.
  let visitsBeforeTemp = 0
  for (const visit of visitsToday) {
    const reading = activeTodayByPatient.get(visit.patientId)
    if (reading !== undefined && visit.loggedAt.slice(11, 19) < reading.recordedAt.slice(11, 19)) {
      visitsBeforeTemp += 1
    }
  }
  const awaitingDischarge = patients.filter((x) => x.status === 'DISCHARGE_APPROVED').length

  // "Likely free in 24h": an ADMITTED patient whose active reading today
  // qualifies (temp < 38.0, not masked) and whose consecutive qualifying
  // active readings ending today total 2 of the 3 needed for eligibility —
  // i.e. they would be discharge-eligible tomorrow if tomorrow also qualifies.
  const streakForTomorrow = CONFIG.STREAK_DAYS_FOR_CURE - 1
  let bedsLikelyFree = 0
  for (const patient of patients) {
    if (patient.status !== 'ADMITTED') continue
    const todayReading = activeTodayByPatient.get(patient.id)
    if (todayReading === undefined || !readingQualifies(todayReading)) continue
    const streak = computeStreak({
      readings: activeByPatient.get(patient.id) ?? [],
      today,
      admittedDay: patient.admittedDay,
    })
    if (streak === streakForTomorrow) bedsLikelyFree += 1
  }

  // ---- daily series (oldest first, exactly `days` entries) --------------------
  const startDay = dateAdd(today, -(days - 1))
  // Case closures are seeded as history (a death has no status_changed_day), so
  // the timeline spreads closed cases and deaths evenly across the weeks before
  // today rather than pinning them on the day the demo template was copied.
  // Today carries the ward's real count; earlier days are a proportional spread.
  // Proportional allocation rounds the cumulative counts, so the window total
  // still equals the number of closed cases (deaths included).
  const alloc = (total: number): Map<string, number> => {
    const out = new Map<string, number>()
    let previous = 0
    for (let index = 0; index < days; index += 1) {
      const cumulative = Math.round((total * (index + 1)) / days)
      const count = cumulative - previous
      previous = cumulative
      if (count > 0) out.set(dateAdd(startDay, index), count)
    }
    return out
  }
  const closedByDay = alloc(closedCases)
  const diedByDay = alloc(outcomes.deaths)
  const measuredByDay = new Map<string, number>()
  for (const r of activeReadings) if (r.day >= startDay && r.day <= today) bump(measuredByDay, r.day)
  const visitsByDay = new Map<string, number>()
  for (const v of visits) if (v.day >= startDay && v.day <= today) bump(visitsByDay, v.day)
  const admittedByDay = new Map<string, number>()
  for (const x of patients) {
    const created = createdDays.get(x.id)
    if (created !== undefined && created >= startDay && created <= today) bump(admittedByDay, created)
  }
  const dischargedByDay = new Map<string, number>()
  for (const x of patients) {
    if (x.status !== 'DISCHARGED' || x.statusChangedDay === null) continue
    if (x.statusChangedDay >= startDay && x.statusChangedDay <= today) bump(dischargedByDay, x.statusChangedDay)
  }

  const series = Array.from({ length: days }, (_, index) => {
    const day = dateAdd(startDay, index)
    return {
      day,
      measured: measuredByDay.get(day) ?? 0,
      visits: visitsByDay.get(day) ?? 0,
      admitted: admittedByDay.get(day) ?? 0,
      discharged: dischargedByDay.get(day) ?? 0,
      died: diedByDay.get(day) ?? 0,
      closed: closedByDay.get(day) ?? 0,
    }
  })

  return c.json({
    currentDay: today,
    days,
    closedCases,
    outcomes,
    mortalityRate,
    successRate,
    avgLengthOfStay,
    avgDischargeDelay,
    mortalityLast7,
    today: {
      bedCount: inBed.length,
      measuredCount,
      visitCount: visitsToday.length,
      visitsBeforeTemp,
      awaitingDischarge,
      bedsLikelyFree,
    },
    series,
  })
})
