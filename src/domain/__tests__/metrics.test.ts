import { describe, expect, test } from 'vitest'
import { mortalityStats, complianceStats, delayStats } from '../metrics'
import { closedCase, pt, rd, START, day, vt } from './helpers'

// R27/R28: mortality against the benchmark.
describe('R27/R28: mortality', () => {
  test('zero closed cases does not divide by zero', () => {
    const m = mortalityStats([])
    expect(m.closed).toBe(0)
    expect(m.rate).toBeNull()
    expect(m.band).toBe('none')
  })
  test('under the minimum sample: shown, never alerted', () => {
    const m = mortalityStats([closedCase('died', 5, 8), closedCase('cured', 4, 5), closedCase('cured', 3, 4)])
    expect(m.rate).toBeCloseTo(1 / 3)
    expect(m.band).toBe('small')
    expect(m.message).toContain('Sample too small')
  })
  test('above the benchmark: red, in plain language, numerator and denominator shown', () => {
    const cases = [...Array(7)].map((_, i) => closedCase('died', 30 + i, 31 + i))
      .concat([...Array(33)].map((_, i) => closedCase('cured', 30 + i, 31 + i)))
    const m = mortalityStats(cases)
    expect(m.band).toBe('red')
    expect(m.message).toBe('Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)')
  })
  test('at exactly 15%: amber, not red', () => {
    const cases = [...Array(6)].map((_, i) => closedCase('died', 30 + i, 31 + i))
      .concat([...Array(34)].map((_, i) => closedCase('cured', 30 + i, 31 + i)))
    expect(mortalityStats(cases).band).toBe('amber')
  })
  test('the amber band runs from 13%', () => {
    const cases = [...Array(13)].map((_, i) => closedCase('died', 30 + i, 31 + i))
      .concat([...Array(87)].map((_, i) => closedCase('cured', 30 + i, 31 + i)))
    expect(mortalityStats(cases).band).toBe('amber')
    // just below 13%: ok (5 of 40 = 12.5%)
    const below = [...Array(5)].map((_, i) => closedCase('died', 30 + i, 31 + i))
      .concat([...Array(35)].map((_, i) => closedCase('cured', 30 + i, 31 + i)))
    expect(mortalityStats(below).band).toBe('ok')
  })
  test('below the amber band: ok', () => {
    const cases = [...Array(4)].map((_, i) => closedCase('died', 30 + i, 31 + i))
      .concat([...Array(36)].map((_, i) => closedCase('cured', 30 + i, 31 + i)))
    expect(mortalityStats(cases).band).toBe('ok')
  })
})

// R29: daily compliance.
describe('R29: daily compliance', () => {
  const p1 = pt({ id: 'p-001', bed: 'A-1' })
  const p2 = pt({ id: 'p-002', bed: 'A-2' })
  const p3 = pt({ id: 'p-003', bed: 'A-3' })
  const readings = [rd('p-001', 0, 37.0, { recordedAt: `${START}T08:00:00Z` }), rd('p-002', 0, 37.0, { recordedAt: `${START}T09:00:00Z` })]
  const visits = [vt('p-001', 0, `${START}T09:30:00Z`), vt('p-002', 0, `${START}T08:30:00Z`)]
  const c = complianceStats({ patients: [p1, p2, p3], readings, visits, today: START })
  test('counts measured and visited over patients in beds', () => {
    expect(c.bedCount).toBe(3)
    expect(c.measuredCount).toBe(2)
    expect(c.visitCount).toBe(2)
    expect(c.pendingMeasured.map((p) => p.id)).toEqual(['p-003'])
  })
  test('visits logged after the temperature count toward the target', () => {
    expect(c.visitsTotal).toBe(2)
    expect(c.visitsAfterTempCount).toBe(1) // p-002's visit came before the reading
  })
})

// R30: discharge delay.
describe('R30: discharge delay', () => {
  test('average over discharged patients; bed-days held', () => {
    const discharged = [
      pt({ id: 'p-010', status: 'DISCHARGED', outcome: 'cured', firstEligibleDay: day(5), closedDay: day(4), bed: null }),
      pt({ id: 'p-011', status: 'DISCHARGED', outcome: 'cured', firstEligibleDay: day(8), closedDay: day(4), bed: null }),
      pt({ id: 'p-012', status: 'DISCHARGED', outcome: 'cured', firstEligibleDay: day(5), closedDay: day(5), bed: null }),
      pt({ id: 'p-013', status: 'DISCHARGED', outcome: 'died', firstEligibleDay: day(5), closedDay: day(3), bed: null }),
    ]
    const approvedNow = pt({ id: 'p-014', status: 'DISCHARGE_APPROVED', firstEligibleDay: day(2), statusChangedDay: day(1) })
    const d = delayStats({ patients: [...discharged, approvedNow, pt({ id: 'p-015' })], today: START })
    // cured cases only: delays 1, 4, 0 (the deceased case is not a discharge delay)
    expect(d.avgDelayDays).toBeCloseTo(5 / 3, 5)
    expect(d.bedDaysHeld).toBe(5)
    expect(d.delayedNow).toBe(1)
  })
  test('no discharged patients yet', () => {
    const d = delayStats({ patients: [pt({})], today: START })
    expect(d.avgDelayDays).toBeNull()
    expect(d.bedDaysHeld).toBe(0)
  })
})
