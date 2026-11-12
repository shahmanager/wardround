// R3/R4/R5: temperature input validation and classification.
import { CONFIG } from './config'

export type TempInputCode = 'R3_FORMAT' | 'R3_FAHRENHEIT' | 'R3_RANGE'

export interface TempEvaluation {
  /** False only for hard errors (format, Fahrenheit, range). */
  ok: boolean
  value: number | null
  code: TempInputCode | null
  message: string | null
  /** R3: unusual value — saving needs an explicit "Yes, this reading is correct". */
  needsConfirm: boolean
  /** R4: at or above 38.0 °C. */
  fever: boolean
  /** R5: below 35.0 or at or above 40.0. */
  needsAttention: boolean
}

export function evaluateTempInput(raw: string, prev: number | null): TempEvaluation {
  const none: TempEvaluation = { ok: false, value: null, code: null, message: null, needsConfirm: false, fever: false, needsAttention: false }
  const normalized = raw.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d)?$/.test(normalized)) {
    return { ...none, code: 'R3_FORMAT', message: 'Enter a number with one decimal place, for example 37.2.' }
  }
  const v = Number(normalized)
  if (v >= 90 && v <= 110) {
    return { ...none, code: 'R3_FAHRENHEIT', message: 'That looks like °F. Enter the reading in °C, for example 37.0.' }
  }
  if (v < CONFIG.TEMP_HARD_MIN || v > CONFIG.TEMP_HARD_MAX) {
    return { ...none, code: 'R3_RANGE', message: 'That is outside a possible temperature range. Check the thermometer and re-enter.' }
  }
  const jump = prev !== null && Math.abs(v - prev) >= CONFIG.JUMP_CONFIRM_C
  const needsConfirm = v < CONFIG.TEMP_ATTENTION_LOW || v >= CONFIG.TEMP_ATTENTION_HIGH || jump
  return {
    ok: true,
    value: v,
    code: null,
    message: null,
    needsConfirm,
    fever: v >= CONFIG.FEVER_THRESHOLD_C,
    needsAttention: v < CONFIG.TEMP_ATTENTION_LOW || v >= CONFIG.TEMP_ATTENTION_HIGH,
  }
}

/** "37.2" — one decimal place, for messages (R1). */
export function formatTemp(v: number): string {
  return v.toFixed(1)
}
