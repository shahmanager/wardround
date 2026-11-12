// Deterministic template-workspace seed (plan section 7).
// Fixed seed PRNG, fixed demo start day, fictional Indian names.
// Output: seed/seed-template.sql — applied to D1 with `npm run db:seed:*`.
// The template workspace is never edited by visitors; creating a visitor
// workspace copies it with INSERT ... SELECT statements.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONFIG } from '../src/domain/config'
import { allBeds } from '../src/domain/beds'
import { dateAdd } from '../src/domain/dates'

const D = CONFIG.DEMO_START_DAY
const day = (back: number) => dateAdd(D, -back)

// --- seeded PRNG (mulberry32) ----------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(0x5a17d3)

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T

function temp(base: number): number {
  return Math.round((base + (rnd() - 0.5) * 0.8) * 10) / 10
}

function q(s: string): string {
  return `'${s.replaceAll("'", "''")}'`
}

// --- names -------------------------------------------------------------------
const FIRST = ['Ramesh', 'Sunita', 'Arjun', 'Meena', 'Farhan', 'Lakshmi', 'Devika', 'Sameer', 'Anita', 'Rohit', 'Zoya', 'Karthik', 'Pooja', 'Naveen', 'Ishita', 'Salman', 'Geeta', 'Harish', 'Nadia', 'Vinod', 'Tanvi', 'Aakash', 'Rekha', 'Imran', 'Shalini', 'Gaurav', 'Fatima', 'Manoj', 'Divya', 'Suresh', 'Kiran', 'Rahul', 'Anjali', 'Vikas', 'Neha', 'Ajay', 'Priyanka', 'Sanjay', 'Deepa', 'Amit'] as const
const LAST = ['Kumar', 'Sharma', 'Patel', 'Reddy', 'Khan', 'Iyer', 'Das', 'Gupta', 'Menon', 'Joshi', 'Bose', 'Rao', 'Nair', 'Singh', 'Kulkarni', 'Mehta'] as const

function personName(i: number): string {
  return `${FIRST[(i * 7 + 3) % FIRST.length]} ${LAST[(i * 5 + 1) % LAST.length]}`
}

// --- staff -------------------------------------------------------------------
type StaffRow = [id: string, name: string, role: 'NURSE' | 'DOCTOR' | 'ADMIN', isHead: 0 | 1, order: number]
const staff: StaffRow[] = [
  ['nurse-asha', 'Nurse Asha Nair', 'NURSE', 0, 1],
  ['nurse-imran', 'Nurse Imran Sheikh', 'NURSE', 0, 2],
  ['nurse-kavya', 'Nurse Kavya Reddy', 'NURSE', 0, 3],
  ['doctor-rao', 'Dr. Vikram Rao', 'DOCTOR', 0, 4],
  ['doctor-neha', 'Dr. Neha Kulkarni', 'DOCTOR', 1, 5],
  ['admin-priya', 'Priya Menon', 'ADMIN', 0, 6],
]
const nurses = ['nurse-asha', 'nurse-imran', 'nurse-kavya']
const nurseNames: Record<string, string> = {
  'nurse-asha': 'Nurse Asha',
  'nurse-imran': 'Nurse Imran',
  'nurse-kavya': 'Nurse Kavya',
}

// --- rows ----------------------------------------------------------------------
interface PatientRow {
  id: string
  name: string
  age: number
  sex: 'F' | 'M' | 'X'
  bed: string | null
  status: 'ADMITTED' | 'DISCHARGE_APPROVED' | 'DISCHARGED' | 'DECEASED'
  admittedDay: string | null
  firstEligibleDay: string | null
  statusChangedDay: string | null
  outcome: 'cured' | 'died' | null
  closedDay: string | null
}
interface ReadingRow {
  id: string
  patientId: string
  day: string
  temp: number
  masked: boolean
  late: boolean
  by: string
  byRole: 'NURSE' | 'DOCTOR'
  at: string
  reason: string | null
}
interface VisitRow {
  id: string
  patientId: string
  day: string
  at: string
  by: string
  note: string | null
  viaApproval: boolean
}
interface WaitRow { id: string; name: string; age: number; sex: 'F' | 'M' | 'X'; addedDay: string; position: number }
interface AuditRow { id: string; day: string; at: string; actor: string | null; role: string; action: string; patient: string | null; detail: string | null }

const patients: PatientRow[] = []
const readings: ReadingRow[] = []
const visits: VisitRow[] = []
const waitlist: WaitRow[] = []
const audit: AuditRow[] = []
let auditSeq = 0

function aud(day: string, at: string, actor: string | null, role: string, action: string, patient: string | null, detail: string | null): void {
  auditSeq += 1
  audit.push({ id: `a-${String(auditSeq).padStart(4, '0')}`, day, at, actor, role, action, patient, detail })
}

const nowIso = `${D}T09:45:00Z`

function addPatient(p: PatientRow): void {
  patients.push(p)
  if (p.admittedDay) aud(p.admittedDay, `${p.admittedDay}T08:00:00Z`, null, 'SYSTEM', 'patient.admitted', p.id, `Admitted to bed ${p.bed}`)
}

function addReading(patientId: string, dayBack: number, t: number, by: string, at: string, opts: { masked?: boolean; late?: boolean; reason?: string } = {}): void {
  readings.push({
    id: `r-${patientId}-${day(dayBack)}`,
    patientId,
    day: day(dayBack),
    temp: t,
    masked: opts.masked ?? false,
    late: opts.late ?? false,
    by,
    byRole: by.startsWith('nurse') ? 'NURSE' : 'DOCTOR',
    at,
    reason: opts.reason ?? null,
  })
}

/** History from admission (inclusive) up to `uptoBack` (exclusive), 36.6–38.0 base. */
function history(p: PatientRow, uptoBack: number, ensureBreakAt: number | 'none'): void {
  const admBack = p.admittedDay ? Math.round((Date.parse(D) - Date.parse(p.admittedDay)) / 86_400_000) : uptoBack
  const base = 36.8 + rnd() * 0.7
  for (let b = admBack; b > uptoBack; b--) {
    if (b === ensureBreakAt) {
      if (b !== admBack) continue // leave the gap (missing day)
      addReading(p.id, b, 38.4 + rnd() * 0.6, pick(nurses), `${day(b)}T08:00:00Z`)
      continue
    }
    addReading(p.id, b, temp(base), pick(nurses), `${day(b)}T08:00:00Z`)
  }
}

const beds = allBeds()

// --- the 74 current patients -------------------------------------------------
for (let i = 0; i < 74; i++) {
  const bed = beds[i] as string
  const id = `p-${String(i + 1).padStart(3, '0')}`
  const name = personName(i)
  const age = 18 + ((i * 13) % 60)
  const sex = (['F', 'M', 'M', 'F', 'X', 'F', 'M'] as const)[i % 7]
  const admBack = 1 + ((i * 5) % 14)
  const p: PatientRow = { id, name, age, sex, bed, status: 'ADMITTED', admittedDay: day(admBack), firstEligibleDay: null, statusChangedDay: day(admBack), outcome: null, closedDay: null }
  addPatient(p)
}

// Special states (seed section 7), by patient index:
// p-001..p-004 streak 2, unmeasured today (a normal reading today makes them eligible live)
for (let i = 0; i < 4; i++) {
  const p = patients[i] as PatientRow
  const admBack = 5 + i
  p.admittedDay = day(admBack)
  p.statusChangedDay = day(admBack)
  const base = 37.0
  addReading(p.id, 2, temp(base), nurses[i % 3]!, `${day(2)}T08:00:00Z`)
  addReading(p.id, 1, temp(36.9), nurses[(i + 1) % 3]!, `${day(1)}T08:00:00Z`)
  for (let b = admBack; b > 3; b--) {
    addReading(p.id, b, temp(36.8 + rnd() * 0.8), nurses[b % 3]!, `${day(b)}T08:00:00Z`)
  }
  if (i % 2 === 0) {
    addReading(p.id, 3, 38.4, nurses[(i + 2) % 3]!, `${day(3)}T08:00:00Z`) // fever breaks the streak
  } // odd i: D-3 is a missing day — the gap breaks the streak
}

// p-005, p-006 eligible, measured today, not visited (approvable now)
// p-007 eligible, not measured today (approval disabled with the reason)
for (let i = 4; i <= 6; i++) {
  const p = patients[i] as PatientRow
  const admBack = 7 + i
  p.admittedDay = day(admBack)
  p.statusChangedDay = day(admBack)
  p.firstEligibleDay = day(3)
  addReading(p.id, 3, temp(36.9), nurses[i % 3]!, `${day(3)}T08:00:00Z`)
  addReading(p.id, 2, temp(37.0), nurses[(i + 1) % 3]!, `${day(2)}T08:00:00Z`)
  addReading(p.id, 1, temp(36.8), nurses[(i + 2) % 3]!, `${day(1)}T08:00:00Z`)
  history(p, 3, -1)
  if (i <= 5) addReading(p.id, 0, temp(36.7), nurses[i % 3]!, `${D}T08:${String(10 + (i - 4) * 15).padStart(2, '0')}:00Z`)
}

// p-008 DISCHARGE_APPROVED today (doctor approved 09:40; counts as the visit)
// p-009 DISCHARGE_APPROVED yesterday (delay chip)
{
  const p8 = patients[7] as PatientRow
  p8.admittedDay = day(9)
  p8.statusChangedDay = day(9)
  p8.firstEligibleDay = day(3)
  addReading(p8.id, 3, temp(36.9), 'nurse-asha', `${day(3)}T08:00:00Z`)
  addReading(p8.id, 2, temp(37.0), 'nurse-imran', `${day(2)}T08:00:00Z`)
  addReading(p8.id, 1, temp(36.8), 'nurse-kavya', `${day(1)}T08:00:00Z`)
  history(p8, 3, -1)
  addReading(p8.id, 0, 36.9, 'nurse-asha', `${D}T08:10:00Z`)
  p8.status = 'DISCHARGE_APPROVED'
  p8.statusChangedDay = D
  visits.push({ id: `v-${p8.id}-${D}`, patientId: p8.id, day: D, at: `${D}T09:40:00Z`, by: 'doctor-rao', note: null, viaApproval: true })
  aud(D, `${D}T09:40:00Z`, 'doctor-rao', 'DOCTOR', 'discharge.approved', p8.id, 'Approved after sign-off')
}
{
  const p9 = patients[8] as PatientRow
  p9.admittedDay = day(10)
  p9.statusChangedDay = day(10)
  p9.firstEligibleDay = day(4)
  addReading(p9.id, 4, temp(36.9), 'nurse-asha', `${day(4)}T08:00:00Z`)
  addReading(p9.id, 3, temp(37.0), 'nurse-imran', `${day(3)}T08:00:00Z`)
  addReading(p9.id, 2, temp(36.8), 'nurse-kavya', `${day(2)}T08:00:00Z`)
  addReading(p9.id, 1, 36.9, 'nurse-asha', `${day(1)}T08:00:00Z`)
  history(p9, 4, -1)
  p9.status = 'DISCHARGE_APPROVED'
  p9.statusChangedDay = day(1)
  aud(day(1), `${day(1)}T10:05:00Z`, 'doctor-rao', 'DOCTOR', 'discharge.approved', p9.id, 'Approved after sign-off')
}

// p-010, p-011 one missed day in the past week (visible gap, broken streak)
for (let i = 9; i <= 10; i++) {
  const p = patients[i] as PatientRow
  p.admittedDay = day(11)
  p.statusChangedDay = day(11)
  addReading(p.id, 6, temp(37.4), 'nurse-imran', `${day(6)}T08:00:00Z`)
  addReading(p.id, 4, temp(37.1), 'nurse-kavya', `${day(4)}T08:00:00Z`)
  addReading(p.id, 3, temp(36.9), 'nurse-asha', `${day(3)}T08:00:00Z`)
  addReading(p.id, 2, temp(37.2), 'nurse-imran', `${day(2)}T08:00:00Z`)
  addReading(p.id, 1, temp(37.0), 'nurse-kavya', `${day(1)}T08:00:00Z`)
  history(p, 6, 5) // gap on D-5
}

// p-012 measured today 40.2 (needs attention now); p-013 40.1 yesterday, unmeasured today
{
  const p = patients[11] as PatientRow
  p.admittedDay = day(6)
  p.statusChangedDay = day(6)
  history(p, 1, -1)
  addReading(p.id, 1, 37.6, 'nurse-asha', `${day(1)}T08:00:00Z`)
  addReading(p.id, 0, 40.2, 'nurse-imran', `${D}T07:50:00Z`)
}
{
  const p = patients[12] as PatientRow
  p.admittedDay = day(8)
  p.statusChangedDay = day(8)
  history(p, 1, -1)
  addReading(p.id, 1, 40.1, 'nurse-kavya', `${day(1)}T08:00:00Z`)
}

// p-014 masked reading yesterday (R6)
{
  const p = patients[13] as PatientRow
  p.admittedDay = day(7)
  p.statusChangedDay = day(7)
  history(p, 2, -1)
  addReading(p.id, 2, 38.6, 'nurse-asha', `${day(2)}T08:00:00Z`)
  addReading(p.id, 1, 36.9, 'nurse-imran', `${day(1)}T08:00:00Z`, { masked: true, reason: 'Paracetamol given at 06:30' })
}

// p-015..p-025 measured today and visited (11 + the approved p-008 = 12 visited)
// p-026..p-029 measured today, not visited
// p-030..p-039 measured today, not visited
// -> 29 measured today, 12 visited, 45 unmeasured
for (let i = 14; i <= 38; i++) {
  const p = patients[i] as PatientRow
  const admBack = 1 + ((i * 3) % 14)
  p.admittedDay = day(admBack)
  p.statusChangedDay = day(admBack)
  const breakAt = [2, -1, 4][i % 3] // keep everyone ineligible: fever on D-2, none, fever on D-4
  history(p, 0, breakAt)
  if (breakAt === 2 && admBack !== 2) addReading(p.id, 2, 38.5, 'nurse-kavya', `${day(2)}T08:00:00Z`)
  if (breakAt === 4 && admBack !== 4) addReading(p.id, 4, 38.3, 'nurse-asha', `${day(4)}T08:00:00Z`)
  const at = `${D}T0${7 + (i % 2)}:${String(30 + (i % 6) * 5).padStart(2, '0')}:00Z`
  addReading(p.id, 0, temp(36.9), nurses[i % 3]!, at)
  if (i <= 24) {
    const vAt = `${D}T09:${String(20 + (i - 14)).padStart(2, '0')}:00Z`
    visits.push({ id: `v-${p.id}-${D}`, patientId: p.id, day: D, at: vAt, by: 'doctor-rao', note: i % 4 === 0 ? 'Continue current treatment' : null, viaApproval: false })
    aud(D, vAt, 'doctor-rao', 'DOCTOR', 'visit.logged', p.id, null)
  }
}

// --- closed historical cases (40: 33 cured, 7 died) --------------------------
for (let i = 0; i < 40; i++) {
  const cured = i < 33
  const id = `p-h${String(i + 1).padStart(2, '0')}`
  const closedBack = 6 + i // D-6 .. D-45
  const delay = cured ? (i < 29 ? 1 : 2) : 0
  const p: PatientRow = {
    id,
    name: personName(100 + i),
    age: 20 + ((i * 17) % 55),
    sex: (['F', 'M', 'M', 'F', 'M', 'F', 'X'] as const)[i % 7],
    bed: null,
    status: cured ? 'DISCHARGED' : 'DECEASED',
    admittedDay: day(closedBack + 3 + (i % 8)),
    firstEligibleDay: day(closedBack + delay),
    statusChangedDay: day(closedBack),
    outcome: cured ? 'cured' : 'died',
    closedDay: day(closedBack),
  }
  addPatient(p)
  aud(day(closedBack), `${day(closedBack)}T11:00:00Z`, 'admin-priya', 'ADMIN', cured ? 'discharge.completed' : 'patient.record_death', id, cured ? 'Outcome recorded as cured' : 'Outcome recorded as died')
}

// --- waitlist (10) ------------------------------------------------------------
for (let i = 0; i < 10; i++) {
  waitlist.push({
    id: `w-${String(i + 1).padStart(2, '0')}`,
    name: personName(200 + i),
    age: 20 + ((i * 11) % 60),
    sex: (['F', 'M'] as const)[i % 2],
    addedDay: day(i),
    position: i + 1,
  })
}

// --- SQL ----------------------------------------------------------------------
const lines: string[] = []
lines.push('-- WardRound template workspace seed. Generated by scripts/seed-template.ts — do not edit by hand.')
lines.push(`INSERT INTO workspaces (id, current_day, created_at, last_active_at) VALUES ('template', ${q(D)}, ${q(nowIso)}, ${q(nowIso)});`)
for (const s of staff) {
  lines.push(`INSERT INTO staff (ws_id, id, name, role, is_head, display_order) VALUES ('template', ${q(s[0])}, ${q(s[1])}, ${q(s[2])}, ${s[3]}, ${s[4]});`)
}
for (const p of patients) {
  lines.push(
    `INSERT INTO patients (ws_id, id, name, age, sex, bed, status, admitted_day, first_eligible_day, status_changed_day, status_changed_at, outcome, closed_day, created_day, created_at) VALUES ('template', ${q(p.id)}, ${q(p.name)}, ${p.age}, ${q(p.sex)}, ${p.bed ? q(p.bed) : 'NULL'}, ${q(p.status)}, ${p.admittedDay ? q(p.admittedDay) : 'NULL'}, ${p.firstEligibleDay ? q(p.firstEligibleDay) : 'NULL'}, ${p.statusChangedDay ? q(p.statusChangedDay) : 'NULL'}, ${p.admittedDay ? q(`${p.admittedDay}T08:00:00Z`) : 'NULL'}, ${p.outcome ? q(p.outcome) : 'NULL'}, ${p.closedDay ? q(p.closedDay) : 'NULL'}, ${p.admittedDay ? q(p.admittedDay) : q(D)}, ${q(nowIso)});`,
  )
}
for (const r of readings) {
  lines.push(
    `INSERT INTO readings (ws_id, id, patient_id, day, temp_c, status, masked, late_entry, recorded_by, recorded_by_role, recorded_at, reason, supersedes_id) VALUES ('template', ${q(r.id)}, ${q(r.patientId)}, ${q(r.day)}, ${r.temp}, 'active', ${r.masked ? 1 : 0}, ${r.late ? 1 : 0}, ${q(r.by)}, ${q(r.byRole)}, ${q(r.at)}, ${r.reason ? q(r.reason) : 'NULL'}, NULL);`,
  )
}
for (const v of visits) {
  lines.push(
    `INSERT INTO visits (ws_id, id, patient_id, day, logged_at, logged_by, note, via_discharge_approval) VALUES ('template', ${q(v.id)}, ${q(v.patientId)}, ${q(v.day)}, ${q(v.at)}, ${q(v.by)}, ${v.note ? q(v.note) : 'NULL'}, ${v.viaApproval ? 1 : 0});`,
  )
}
for (const w of waitlist) {
  lines.push(`INSERT INTO waitlist (ws_id, id, name, age, sex, added_day, position) VALUES ('template', ${q(w.id)}, ${q(w.name)}, ${w.age}, ${q(w.sex)}, ${q(w.addedDay)}, ${w.position});`)
}
for (const a of audit) {
  lines.push(`INSERT INTO audit (ws_id, id, day, at, actor_id, actor_role, action, patient_id, detail) VALUES ('template', ${q(a.id)}, ${q(a.day)}, ${q(a.at)}, ${a.actor ? q(a.actor) : 'NULL'}, ${q(a.role)}, ${q(a.action)}, ${a.patient ? q(a.patient) : 'NULL'}, ${a.detail ? q(a.detail) : 'NULL'});`)
}

const out = resolve(import.meta.dirname, '..', 'seed', 'seed-template.sql')
mkdirSync(resolve(import.meta.dirname, '..', 'seed'), { recursive: true })
writeFileSync(out, lines.join('\n') + '\n', 'utf8')
console.log(`seed/seed-template.sql written: ${patients.length} patients, ${readings.length} readings, ${visits.length} visits, ${waitlist.length} waitlist, ${audit.length} audit rows`)
