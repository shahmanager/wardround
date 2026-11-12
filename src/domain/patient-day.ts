// R16/R17/R21: the derived patient-day state — nothing here is stored; it
// is computed from readings and events on every request.
import { computeStreak } from './streak'
import { dateAdd, dayDiff } from './dates'
import { CONFIG } from './config'
import type { Patient, PatientDayState, Reading, Visit } from './types'

export interface PatientDayArgs {
  patient: Patient
  readings: Reading[]
  visits: Visit[]
  today: string
}

export function evaluatePatientDay({ patient, readings, visits, today }: PatientDayArgs): PatientDayState {
  const active = readings.filter((r) => r.status === 'active')
  const byDay = (d: string): Reading | null => {
    const dayReadings = active.filter((r) => r.day === d)
    if (dayReadings.length === 0) return null
    return dayReadings.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b))
  }
  const todayReading = byDay(today)
  const yesterdayReading = byDay(dateAdd(today, -1))
  const visitToday = visits.find((v) => v.day === today) ?? null

  const streak = computeStreak({ readings: active, today, admittedDay: patient.admittedDay })
  const eligible = streak >= CONFIG.STREAK_DAYS_FOR_CURE

  const admittedBeforeYesterday =
    patient.admittedDay !== null && dayDiff(patient.admittedDay, today) >= 2

  const delayed =
    patient.status === 'DISCHARGE_APPROVED' &&
    patient.statusChangedDay !== null &&
    dayDiff(patient.statusChangedDay, today) > 0

  return {
    status: visitToday ? 'VISITED' : todayReading ? 'MEASURED' : 'TO_MEASURE',
    todayReading,
    yesterdayReading,
    visitToday,
    streak,
    eligible,
    flags: {
      needsAttention: todayReading !== null && (todayReading.tempC < CONFIG.TEMP_ATTENTION_LOW || todayReading.tempC >= CONFIG.TEMP_ATTENTION_HIGH),
      masked: todayReading?.masked ?? false,
      delayed,
      missedYesterday: yesterdayReading === null && admittedBeforeYesterday,
      lateEntry: (todayReading?.lateEntry ?? false) || (yesterdayReading?.lateEntry ?? false),
    },
    delayDays: delayed ? dayDiff(patient.statusChangedDay as string, today) : 0,
  }
}
