import { describe, expect, test } from 'vitest'
import fc from 'fast-check'
import { computeStreak } from '../streak'
import { START, day } from './helpers'

const DAYS = 14

// Property-based guards on the streak (plan section 11).
const readingSetArb = fc
  .record({
    admittedBack: fc.integer({ min: 3, max: DAYS }),
    days: fc.array(
      fc.record({
        back: fc.integer({ min: 0, max: DAYS }),
        temp: fc.integer({ min: 350, max: 400 }), // tenths of °C
        masked: fc.boolean(),
      }),
      { maxLength: 60 },
    ),
  })
  .map(({ admittedBack, days }) => {
    const byDay = new Map<number, { back: number; temp: number; masked: boolean }>()
    for (const d of days) byDay.set(d.back, d)
    return { admittedBack, byDay }
  })

function streakOf(set: { admittedBack: number; byDay: Map<number, { back: number; temp: number; masked: boolean }> }): number {
  const readings = [...set.byDay.values()].map((d) => ({
    day: day(d.back),
    tempC: d.temp / 10,
    masked: d.masked,
    status: 'active' as const,
  }))
  return computeStreak({ readings, today: START, admittedDay: day(set.admittedBack) })
}

describe('streak properties (fast-check)', () => {
  test('never exceeds the number of qualifying readings and never exceeds 3', () => {
    fc.assert(
      fc.property(readingSetArb, (set) => {
        const s = streakOf(set)
        expect(s).toBeLessThanOrEqual(3)
        const qualifying = [...set.byDay.values()].filter((d) => {
          const afterAdmission = d.back <= set.admittedBack
          return afterAdmission && d.temp / 10 < 38 && !d.masked
        }).length
        expect(s).toBeLessThanOrEqual(qualifying)
      }),
      { numRuns: 300 },
    )
  })

  test('removing a reading (creating a gap) never increases the streak', () => {
    fc.assert(
      fc.property(readingSetArb, (set) => {
        const base = streakOf(set)
        for (const back of set.byDay.keys()) {
          if (back === 0) continue
          const copy = new Map(set.byDay)
          copy.delete(back)
          expect(streakOf({ admittedBack: set.admittedBack, byDay: copy })).toBeLessThanOrEqual(base)
        }
      }),
      { numRuns: 300 },
    )
  })
})
