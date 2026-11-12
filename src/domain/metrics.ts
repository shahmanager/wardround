// R27–R30: the metrics the head doctor manages the centre with. Every
// figure shows its numerator and denominator; nothing is invented.
import { CONFIG } from './config'
import { dayDiff } from './dates'
import type { Outcome, Patient, Reading, Visit } from './types'

export type MortalityBand = 'red' | 'amber' | 'ok' | 'small' | 'none'

export interface MortalityStats {
  deaths: number
  cured: number
  closed: number
  rate: number | null
  band: MortalityBand
  message: string
}

/** R27/R28: mortality over closed cases only (outcomes known). */
export function mortalityStats(closedCases: { outcome: Outcome | null }[]): MortalityStats {
  const known = closedCases.filter((c) => c.outcome !== null)
  const deaths = known.filter((c) => c.outcome === 'died').length
  const cured = known.length - deaths
  const closed = known.length
  const rate = closed > 0 ? deaths / closed : null
  const pct = rate === null ? null : Math.round(rate * 1000) / 10
  const nOfM = `(${deaths} of ${closed} closed cases)`

  if (closed === 0) {
    return { deaths, cured, closed, rate, band: 'none', message: 'No closed cases yet — the benchmark comparison starts when outcomes are known.' }
  }
  if (closed < CONFIG.MIN_SAMPLE_FOR_BENCHMARK) {
    return { deaths, cured, closed, rate, band: 'small', message: `Mortality is ${pct}% ${nOfM}. Sample too small to compare reliably.` }
  }
  if (rate !== null && rate > CONFIG.MORTALITY_BENCHMARK) {
    return { deaths, cured, closed, rate, band: 'red', message: `Mortality is ${pct}%, above the 15% benchmark ${nOfM}` }
  }
  if (rate !== null && rate >= CONFIG.MORTALITY_AMBER_FROM) {
    return { deaths, cured, closed, rate, band: 'amber', message: `Mortality is ${pct}%, close to the 15% benchmark ${nOfM}` }
  }
  return { deaths, cured, closed, rate, band: 'ok', message: `Mortality is ${pct}%, within the 15% benchmark ${nOfM}` }
}

// ---- R29: daily compliance -----------------------------------------------------

export interface ComplianceStats {
  bedCount: number
  measuredCount: number
  visitCount: number
  visitsTotal: number
  visitsAfterTempCount: number
  pendingMeasured: Patient[]
  pendingVisited: Patient[]
}

export function complianceStats(args: { patients: Patient[]; readings: Reading[]; visits: Visit[]; today: string }): ComplianceStats {
  const { patients, readings, visits, today } = args
  const inBed = patients.filter((p) => p.status === 'ADMITTED' || p.status === 'DISCHARGE_APPROVED')
  const activeToday = readings.filter((r) => r.status === 'active' && r.day === today)
  const measuredIds = new Set(activeToday.map((r) => r.patientId))
  const visitsToday = visits.filter((v) => v.day === today)

  const pendingMeasured = inBed.filter((p) => !measuredIds.has(p.id))
  const pendingVisited = inBed.filter((p) => !visitsToday.some((v) => v.patientId === p.id))

  let visitsAfterTemp = 0
  for (const v of visitsToday) {
    const r = activeToday.find((x) => x.patientId === v.patientId)
    if (r && v.loggedAt >= r.recordedAt) visitsAfterTemp += 1
  }

  return {
    bedCount: inBed.length,
    measuredCount: measuredIds.size,
    visitCount: visitsToday.length,
    visitsTotal: visitsToday.length,
    visitsAfterTempCount: visitsAfterTemp,
    pendingMeasured,
    pendingVisited,
  }
}

// ---- R30: discharge delay --------------------------------------------------------

export interface DelayStats {
  avgDelayDays: number | null
  delayedNow: number
  bedDaysHeld: number
}

export function delayStats(args: { patients: Patient[]; today: string }): DelayStats {
  const { patients, today } = args
  const discharged = patients.filter((p) => p.status === 'DISCHARGED' && p.outcome === 'cured' && p.firstEligibleDay !== null && p.closedDay !== null)
  const delays = discharged.map((p) => dayDiff(p.firstEligibleDay as string, p.closedDay as string))
  const avg = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null
  const delayedNow = patients.filter(
    (p) => p.status === 'DISCHARGE_APPROVED' && p.statusChangedDay !== null && dayDiff(p.statusChangedDay, today) > 0,
  ).length
  return { avgDelayDays: avg, delayedNow, bedDaysHeld: delays.reduce((a, b) => a + b, 0) }
}
