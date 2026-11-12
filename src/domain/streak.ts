// R16: the fever-free streak. Pure over readings + the workspace clock.
import { CONFIG } from './config'
import { dateAdd, dayDiff } from './dates'
import type { Reading } from './types'

/** A day qualifies toward the streak when its active reading is non-masked and below 38.0. */
export function readingQualifies(r: Reading): boolean {
  return r.status === 'active' && !r.masked && r.tempC < CONFIG.FEVER_THRESHOLD_C
}

export interface StreakArgs {
  readings: Reading[]
  today: string
  admittedDay: string | null
}

/**
 * Count consecutive qualifying days ending today (if today measured) or
 * yesterday. A fever or masked reading today means the patient is not
 * fever-free today: streak 0 (ruling — a wrong early discharge costs more
 * than a bed-day). A missing day breaks the count. Days before admission
 * never count. Capped at STREAK_DAYS_FOR_CURE.
 */
export function computeStreak({ readings, today, admittedDay }: StreakArgs): number {
  const byDay = new Map<string, Reading>()
  for (const r of readings) {
    if (r.status === 'active' && !byDay.has(r.day)) byDay.set(r.day, r)
  }
  const todayR = byDay.get(today)
  if (todayR && !readingQualifies(todayR)) return 0

  const start = todayR ? today : dateAdd(today, -1)
  if (admittedDay && dayDiff(admittedDay, start) < 0) return 0
  const startR = byDay.get(start)
  if (!startR || !readingQualifies(startR)) return 0

  let count = 0
  let d = start
  for (;;) {
    const r = byDay.get(d)
    if (!r || !readingQualifies(r)) break
    count += 1
    if (count >= CONFIG.STREAK_DAYS_FOR_CURE) break
    const prev = dateAdd(d, -1)
    if (admittedDay && dayDiff(admittedDay, prev) < 0) break
    d = prev
  }
  return count
}
