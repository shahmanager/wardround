// Beds: wing A holds numbers 1–40, wing B holds 41–74 (seed data, section 7).
import { CONFIG } from './config'

export const WING_A = { name: 'A', from: 1, to: 40 } as const
export const WING_B = { name: 'B', from: 41, to: 74 } as const

export function bedLabel(wing: 'A' | 'B', n: number): string {
  return `${wing}-${n}`
}

export function allBeds(): string[] {
  const out: string[] = []
  for (let n = WING_A.from; n <= WING_A.to; n++) out.push(bedLabel('A', n))
  for (let n = WING_B.from; n <= WING_B.to; n++) out.push(bedLabel('B', n))
  return out
}

export function wingOf(bed: string): 'A' | 'B' {
  return bed.startsWith('A-') ? 'A' : 'B'
}

export function isValidBed(bed: string): boolean {
  return allBeds().includes(bed)
}

/** Bays of four along the corridor, for the ward map (section 8). */
export function bedBays(): string[][] {
  const beds = allBeds()
  const bays: string[][] = []
  for (let i = 0; i < beds.length; i += 4) {
    bays.push(beds.slice(i, i + 4))
  }
  return bays
}

export const BED_COUNT = CONFIG.CAPACITY
