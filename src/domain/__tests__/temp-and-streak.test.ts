import { describe, expect, test } from 'vitest'
import { evaluateTempInput } from '../temp'
import { START, day, rd, pt } from './helpers'
import { computeStreak } from '../streak'

// R3: input validation at exact boundaries (plan section 11).
describe('R3: temperature input', () => {
  test('accepts a plain value with no previous reading', () => {
    const e = evaluateTempInput('37.2', null)
    expect(e).toMatchObject({ ok: true, value: 37.2, needsConfirm: false, fever: false, needsAttention: false })
  })
  test('accepts a comma decimal', () => {
    const e = evaluateTempInput('37,2', null)
    expect(e.ok).toBe(true)
    expect(e.value).toBe(37.2)
  })
  test('rejects more than one decimal place', () => {
    expect(evaluateTempInput('37.25', null)).toMatchObject({ ok: false, code: 'R3_FORMAT' })
  })
  test('rejects non-numeric input', () => {
    expect(evaluateTempInput('abc', null)).toMatchObject({ ok: false, code: 'R3_FORMAT' })
    expect(evaluateTempInput('', null)).toMatchObject({ ok: false, code: 'R3_FORMAT' })
  })
  test('98.6 gets the Fahrenheit hint, not a range error', () => {
    const e = evaluateTempInput('98.6', null)
    expect(e.ok).toBe(false)
    expect(e.code).toBe('R3_FAHRENHEIT')
    expect(e.message).toContain('°F')
  })
  test.each([
    ['52', 'R3_RANGE'],
    ['29.9', 'R3_RANGE'],
    ['45.1', 'R3_RANGE'],
    ['120', 'R3_RANGE'],
  ])('%s is a hard range error', (raw, code) => {
    const e = evaluateTempInput(raw, null)
    expect(e.ok).toBe(false)
    expect(e.code).toBe(code)
    expect(e.message).toContain('Check the thermometer')
  })
  test.each(['30.0', '34.9', '40.0', '45.0'])('%s is inside the hard range (needs confirm)', (raw) => {
    const e = evaluateTempInput(raw, null)
    expect(e.ok).toBe(true)
    expect(e.needsConfirm).toBe(true)
  })
  test('35.0 does not need confirmation', () => {
    expect(evaluateTempInput('35.0', null).needsConfirm).toBe(false)
  })
  test('39.9 does not need confirmation; 40.0 does', () => {
    expect(evaluateTempInput('39.9', null).needsConfirm).toBe(false)
    expect(evaluateTempInput('40.0', null).needsConfirm).toBe(true)
  })
  test('a jump of 2.0 °C or more from the previous reading needs confirmation', () => {
    expect(evaluateTempInput('38.8', 36.8).needsConfirm).toBe(true)
    expect(evaluateTempInput('38.7', 36.8).needsConfirm).toBe(false)
    expect(evaluateTempInput('38.5', 40.5).needsConfirm).toBe(true)
    expect(evaluateTempInput('38.6', 40.5).needsConfirm).toBe(false)
    // below 35.0 always needs confirmation, even without a jump
    expect(evaluateTempInput('34.9', 36.8).needsConfirm).toBe(true)
  })
  test('fever flag at the exact threshold (R4)', () => {
    expect(evaluateTempInput('37.9', null).fever).toBe(false)
    expect(evaluateTempInput('38.0', null).fever).toBe(true)
    expect(evaluateTempInput('39.9', null).fever).toBe(true)
  })
  test('attention flag below 35.0 and at or above 40.0 (R5)', () => {
    expect(evaluateTempInput('34.9', null).needsAttention).toBe(true)
    expect(evaluateTempInput('35.0', null).needsAttention).toBe(false)
    expect(evaluateTempInput('39.9', null).needsAttention).toBe(false)
    expect(evaluateTempInput('40.0', null).needsAttention).toBe(true)
  })
})

// R16: streak at the exact boundaries (plan section 4 table).
describe('R16: fever-free streak', () => {
  const admitted = day(14)
  test('counts 3 clean days back from today', () => {
    const s = computeStreak({ readings: [rd('p', 0, 36.8), rd('p', 1, 36.9), rd('p', 2, 37.0), rd('p', 3, 37.1)], today: START, admittedDay: admitted })
    expect(s).toBe(3)
  })
  test('fever two days back stops the count at 2', () => {
    const s = computeStreak({ readings: [rd('p', 0, 36.8), rd('p', 1, 36.9), rd('p', 2, 38.2), rd('p', 3, 37.1)], today: START, admittedDay: admitted })
    expect(s).toBe(2)
  })
  test('a missed day breaks the count at 1', () => {
    const s = computeStreak({ readings: [rd('p', 0, 36.8), rd('p', 2, 37.0), rd('p', 3, 37.1)], today: START, admittedDay: admitted })
    expect(s).toBe(1)
  })
  test('a masked day does not qualify', () => {
    const s = computeStreak({ readings: [rd('p', 0, 36.8), rd('p', 1, 36.9), rd('p', 2, 36.9, { masked: true }), rd('p', 3, 37.1)], today: START, admittedDay: admitted })
    expect(s).toBe(2)
  })
  test('when today is not yet measured the count starts from yesterday', () => {
    const s = computeStreak({ readings: [rd('p', 1, 36.9), rd('p', 2, 37.0), rd('p', 3, 37.1)], today: START, admittedDay: admitted })
    expect(s).toBe(3)
  })
  test('fever today means streak 0', () => {
    const s = computeStreak({ readings: [rd('p', 0, 38.4), rd('p', 1, 36.9), rd('p', 2, 37.0)], today: START, admittedDay: admitted })
    expect(s).toBe(0)
  })
  test('never counts days before admission', () => {
    const s = computeStreak({ readings: [rd('p', 1, 36.9)], today: START, admittedDay: day(1) })
    expect(s).toBe(1)
  })
  test('void and superseded readings do not count', () => {
    const s = computeStreak({
      readings: [rd('p', 0, 36.8), rd('p', 1, 36.9), rd('p', 2, 36.9, { status: 'void' }), rd('p', 3, 36.9, { status: 'superseded' })],
      today: START,
      admittedDay: admitted,
    })
    expect(s).toBe(2)
  })
  test('cap of 3 (more clean days do not raise it)', () => {
    const s = computeStreak({ readings: [rd('p', 0, 36.8), rd('p', 1, 36.9), rd('p', 2, 37.0), rd('p', 3, 37.1), rd('p', 4, 36.8)], today: START, admittedDay: admitted })
    expect(s).toBe(3)
  })
})
