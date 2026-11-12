// Nurse: Today's rounds (mobile-first, usable one-handed at 375px).
// Progress, tabs, search by name or bed, rows in bed order, and the
// measure sheet with the wrong-patient guard. All server state through
// TanStack Query; all rules come from the domain module.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import {
  CONFIG,
  can,
  evaluateTempInput,
  formatTemp,
} from '@/domain'
import type { Patient, PatientDayState, Reading, TempEvaluation } from '@/domain'
import { api } from '@/web/app/api'
import { BedTag } from '@/web/components/bed-tag'
import { MercuryGauge } from '@/web/components/mercury-gauge'
import { StreakLadder } from '@/web/components/streak-ladder'
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Modal,
  Sheet,
  SkeletonRows,
  Tabs,
  TextArea,
  useToasts,
} from '@/web/components/ui'

type WardPatient = Patient & { day: PatientDayState }
type TabId = 'to-measure' | 'done'

// ---- helpers ------------------------------------------------------------------

function bedParts(bed: string): { wing: string; num: number } {
  const m = /^([A-Za-z]+)-(\d+)$/.exec(bed)
  if (!m) return { wing: bed.toUpperCase(), num: 0 }
  return { wing: m[1]!.toUpperCase(), num: Number(m[2]) }
}

/** Ward order: wing letter, then bed number, so the nurse walks the ward in order. */
function compareByBed(a: WardPatient, b: WardPatient): number {
  const bedA = a.bed ? bedParts(a.bed) : null
  const bedB = b.bed ? bedParts(b.bed) : null
  if (!bedA || !bedB) return (a.bed ?? '').localeCompare(b.bed ?? '')
  return bedA.wing.localeCompare(bedB.wing) || bedA.num - bedB.num
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** R7 pre-check. The API exposes only the workspace calendar day, so the
 *  5-minute window is measured against the device clock here; the server
 *  stays authoritative (R7_WINDOW is surfaced below). */
function withinUndoWindow(reading: Reading): boolean {
  const t = Date.parse(reading.recordedAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < CONFIG.UNDO_WINDOW_MIN * 60_000
}

function errCode(e: unknown): string | null {
  if (e instanceof Error && 'code' in e) {
    const c = (e as { code: unknown }).code
    if (typeof c === 'string') return c
  }
  return null
}

function errText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.'
}

function yesterdayText(day: PatientDayState): string {
  const y = day.yesterdayReading
  return y ? `Yesterday ${formatTemp(y.tempC)} °C` : 'No reading yesterday'
}

/** Why this reading needs the explicit confirmation (R3). */
function confirmReason(ev: TempEvaluation, prev: number | null): string {
  const v = ev.value
  if (v === null) return 'check the thermometer'
  const parts: string[] = []
  if (v < CONFIG.TEMP_ATTENTION_LOW) parts.push(`${formatTemp(v)} °C is below ${formatTemp(CONFIG.TEMP_ATTENTION_LOW)} °C`)
  if (v >= CONFIG.TEMP_ATTENTION_HIGH) parts.push(`${formatTemp(v)} °C is ${formatTemp(CONFIG.TEMP_ATTENTION_HIGH)} °C or higher`)
  if (prev !== null && Math.abs(v - prev) >= CONFIG.JUMP_CONFIRM_C) {
    parts.push(`it differs from yesterday's ${formatTemp(prev)} °C by ${formatTemp(CONFIG.JUMP_CONFIRM_C)} °C or more`)
  }
  return parts.join('; ')
}

// ---- shared blocks --------------------------------------------------------------

function GuardHeader({ patient }: { patient: WardPatient }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-ink/5 p-3">
      <BedTag bed={patient.bed ?? ''} />
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {patient.name}, age {patient.age}
        </p>
        <p className="text-muted">{yesterdayText(patient.day)}</p>
      </div>
    </div>
  )
}

function ConfirmBlock({ why, confirmed, onChange }: { why: string; confirmed: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-3 rounded-lg bg-signal-tint p-3 text-signal">
      <p>This reading is unusual: {why}. Check the thermometer, then confirm.</p>
      <label className="mt-2 flex min-h-12 items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 flex-none accent-ink"
        />
        <span>Yes, this reading is correct</span>
      </label>
    </div>
  )
}

function TempInput({
  value,
  onChange,
  inputRef,
  large,
  ...aria
}: {
  value: string
  onChange: (v: string) => void
  inputRef?: Ref<HTMLInputElement>
  large?: boolean
} & {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="37.0"
      className={`block w-full rounded-lg border border-ink/30 bg-white font-signage font-semibold tabular-nums ${
        large ? 'px-4 py-3 text-4xl' : 'px-3 py-2 text-2xl'
      }`}
      {...aria}
    />
  )
}

// ---- rows (no hooks: safe to return early) ----------------------------------------

function ToMeasureRow({ patient, onOpen }: { patient: WardPatient; onOpen: () => void }) {
  return (
    <li className="border-b border-ink/10">
      <button type="button" onClick={onOpen} className="w-full py-3 text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <BedTag bed={patient.bed ?? ''} size="sm" />
            <span className="truncate font-medium">{patient.name}</span>
          </span>
          <span className="flex-none text-sm text-muted">{yesterdayText(patient.day)}</span>
        </span>
        <span className="mt-2 block">
          <StreakLadder streak={patient.day.streak} />
        </span>
      </button>
    </li>
  )
}

function DoneRow({
  patient,
  staffName,
  canCorrect,
  canUndo,
  undoPending,
  animateFrom,
  onCorrect,
  onUndo,
}: {
  patient: WardPatient
  staffName: (id: string) => string
  canCorrect: boolean
  canUndo: boolean
  undoPending: boolean
  /** Yesterday's reading, only right after this patient was measured today. */
  animateFrom: number | null
  onCorrect: () => void
  onUndo: () => void
}) {
  const r = patient.day.todayReading
  return (
    <li className="border-b border-ink/10 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <BedTag bed={patient.bed ?? ''} size="sm" />
          <span className="truncate font-medium">{patient.name}</span>
        </span>
        {r?.masked && <Chip tone="amber">Flagged</Chip>}
      </div>
      {r ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Recorded {hhmm(r.recordedAt)} by {staffName(r.recordedBy)}
            {r.masked ? ', medicine flagged' : ''}
          </p>
          <div className="mt-2">
            <MercuryGauge
              value={r.tempC}
              yesterday={patient.day.yesterdayReading?.tempC ?? null}
              animateFrom={animateFrom}
            />
          </div>
          {(canCorrect || canUndo) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {canCorrect && (
                <Button variant="secondary" size="lg" onClick={onCorrect}>
                  Correct reading
                </Button>
              )}
              {canUndo && (
                <Button variant="ghost" size="lg" loading={undoPending} onClick={onUndo}>
                  Undo
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">No reading on file.</p>
      )}
    </li>
  )
}

// ---- measure sheet (R1–R6) ----------------------------------------------------------

function MeasureSheet({
  patient,
  next,
  onClose,
  onSaved,
}: {
  patient: WardPatient
  next: WardPatient | null
  onClose: () => void
  onSaved: (saveAndNext: boolean) => void
}) {
  return (
    <Sheet open title={patient.name} onClose={onClose}>
      <MeasureForm key={patient.id} patient={patient} next={next} onSaved={onSaved} />
    </Sheet>
  )
}

function MeasureForm({
  patient,
  next,
  onSaved,
}: {
  patient: WardPatient
  next: WardPatient | null
  onSaved: (saveAndNext: boolean) => void
}) {
  const { push } = useToasts()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [raw, setRaw] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [maskedGiven, setMaskedGiven] = useState(false)
  const [tried, setTried] = useState(false)

  // Keyboard focus lands on the temperature input, so the next patient in
  // the round is ready the moment the sheet opens. The next animation frame
  // is needed because the sheet's own focus trap focuses its panel on mount.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  const record = useMutation({
    mutationFn: (args: { value: number; masked: boolean; confirm: boolean; saveAndNext: boolean }) =>
      api.recordReading(patient.id, { value: args.value, masked: args.masked, confirm: args.confirm }),
    onSuccess: (_reading, args) => {
      qc.invalidateQueries({ queryKey: ['ward'] })
      push({
        tone: args.masked ? 'warn' : 'ok',
        message:
          `Bed ${patient.bed}: ${formatTemp(args.value)} °C recorded` +
          (args.value >= CONFIG.FEVER_THRESHOLD_C ? ' — fever, the doctor will see it' : ', no fever') +
          (args.masked ? ', flagged (medicine given)' : ''),
      })
      onSaved(args.saveAndNext)
    },
    onError: (e) => push({ tone: 'error', message: errText(e) }),
  })

  // Duplicate guard (R1): if the patient was measured meanwhile, the sheet
  // says so and a second attempt never reaches the API.
  if (patient.day.status !== 'TO_MEASURE') {
    const r = patient.day.todayReading
    return (
      <div>
        <GuardHeader patient={patient} />
        <p className="mt-3 rounded-lg bg-signal-tint p-3 text-signal">
          Already recorded today{r ? `: ${formatTemp(r.tempC)} °C at ${hhmm(r.recordedAt)}` : ''}. Use Correct
          reading on the Done tab if this was wrong.
        </p>
      </div>
    )
  }

  const prevC = patient.day.yesterdayReading?.tempC ?? null
  const ev = evaluateTempInput(raw, prevC)

  let error: string | null = null
  if (raw.trim() === '') {
    if (tried) error = 'Enter the temperature in °C.'
  } else if (!ev.ok) {
    error = ev.message ?? 'Enter the temperature in °C.'
  } else if (ev.needsConfirm && !confirmed && tried) {
    error = "Tick 'Yes, this reading is correct' to save."
  }

  const submit = (saveAndNext: boolean) => {
    setTried(true)
    if (!ev.ok || ev.value === null) return
    if (ev.needsConfirm && !confirmed) return
    record.mutate({ value: ev.value, masked: maskedGiven, confirm: ev.needsConfirm, saveAndNext })
  }

  return (
    <div>
      {/* wrong-patient guard: bed, name, age and yesterday's reading stay visible */}
      <GuardHeader patient={patient} />

      <div className="mt-4">
        <Field
          label={`Temperature for ${patient.name} (°C)`}
          hint="One decimal place, for example 37.2."
          error={error ?? undefined}
        >
          <TempInput value={raw} onChange={setRaw} inputRef={inputRef} large />
        </Field>
      </div>

      {ev.ok && ev.needsConfirm && (
        <ConfirmBlock why={confirmReason(ev, prevC)} confirmed={confirmed} onChange={setConfirmed} />
      )}

      {/* R6: the medicine question, asked on every reading */}
      <label className="mt-4 flex min-h-12 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={maskedGiven}
          onChange={(e) => setMaskedGiven(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none accent-ink"
        />
        <span>
          Fever-reducing medicine given in the last {CONFIG.ANTIPYRETIC_WINDOW_H} hours?{' '}
          <span className="text-muted">
            The reading will be flagged and will not count toward the {CONFIG.STREAK_DAYS_FOR_CURE}-day streak.
          </span>
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" loading={record.isPending} onClick={() => submit(false)}>
          Record temperature
        </Button>
        {next && (
          <Button variant="secondary" size="lg" disabled={record.isPending} onClick={() => submit(true)}>
            Save and next
          </Button>
        )}
      </div>
    </div>
  )
}

// ---- correct-reading modal (R8) ----------------------------------------------------

function CorrectForm({ patient, reading, onClose }: { patient: WardPatient; reading: Reading; onClose: () => void }) {
  const { push } = useToasts()
  const qc = useQueryClient()

  const [raw, setRaw] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [tried, setTried] = useState(false)

  const ev = evaluateTempInput(raw, reading.tempC)

  const correct = useMutation({
    mutationFn: (value: number) =>
      api.correctReading(reading.id, { value, reason: reason.trim(), confirm: ev.needsConfirm }),
    onSuccess: (_r, value) => {
      qc.invalidateQueries({ queryKey: ['ward'] })
      push({
        tone: 'ok',
        message: `Bed ${patient.bed}: corrected to ${formatTemp(value)} °C. The original is kept.`,
      })
      onClose()
    },
    onError: (e) => push({ tone: 'error', message: errText(e) }),
  })

  let error: string | null = null
  if (raw.trim() === '') {
    if (tried) error = 'Enter the corrected temperature in °C.'
  } else if (!ev.ok) {
    error = ev.message ?? 'Enter the corrected temperature in °C.'
  } else if (ev.needsConfirm && !confirmed && tried) {
    error = "Tick 'Yes, this reading is correct' to save."
  }
  const reasonError = tried && reason.trim() === '' ? 'A reason is required. The original is kept.' : null

  const submit = () => {
    setTried(true)
    if (!ev.ok || ev.value === null) return
    if (ev.needsConfirm && !confirmed) return
    if (reason.trim() === '') return
    correct.mutate(ev.value)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="text-sm text-muted">
        Current reading: {formatTemp(reading.tempC)} °C at {hhmm(reading.recordedAt)}. The original is kept.
      </p>
      <div className="mt-3">
        <Field label={`New temperature for ${patient.name} (°C)`} error={error ?? undefined}>
          <TempInput value={raw} onChange={setRaw} />
        </Field>
      </div>

      {ev.ok && ev.needsConfirm && (
        <ConfirmBlock why={confirmReason(ev, reading.tempC)} confirmed={confirmed} onChange={setConfirmed} />
      )}

      <div className="mt-3">
        <Field label="Reason (required)" error={reasonError ?? undefined}>
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this reading being corrected?"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" loading={correct.isPending}>
          Save correction
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ---- screen -------------------------------------------------------------------------

export function NurseScreen() {
  const qc = useQueryClient()
  const { push } = useToasts()

  const wardQ = useQuery({ queryKey: ['ward'], queryFn: api.getWard })
  const meQ = useQuery({ queryKey: ['me'], queryFn: api.getMe })
  const staffQ = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })

  const [tab, setTab] = useState<TabId>('to-measure')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  // Which patient was just measured, and from which reading the gauge should
  // rise. Only the Done row for that patient animates; after a short while the
  // marker clears so remounts (tab switches, refetches) show the static gauge.
  const [justRecorded, setJustRecorded] = useState<{ patientId: string; from: number | null } | null>(null)

  const ward = wardQ.data
  const me = meQ.data?.staff
  const staffName = (id: string): string => staffQ.data?.staff.find((s) => s.id === id)?.name ?? id

  const patients = useMemo(() => (ward?.patients ?? []).slice().sort(compareByBed), [ward])

  const q = search.trim().toLowerCase()
  const matches = (p: WardPatient): boolean =>
    q === '' || p.name.toLowerCase().includes(q) || (p.bed ?? '').toLowerCase().includes(q)

  const toMeasure = patients.filter((p) => p.day.status === 'TO_MEASURE' && matches(p))
  const done = patients.filter((p) => p.day.status !== 'TO_MEASURE' && matches(p))
  const rows: WardPatient[] = tab === 'to-measure' ? toMeasure : done

  const active = activeId !== null ? (patients.find((p) => p.id === activeId) ?? null) : null
  const activeIndex = active !== null ? toMeasure.findIndex((p) => p.id === active.id) : -1
  const nextPatient = activeIndex >= 0 && activeIndex + 1 < toMeasure.length ? (toMeasure[activeIndex + 1] ?? null) : null
  const correcting =
    correctingId !== null ? (patients.find((p) => p.day.todayReading?.id === correctingId) ?? null) : null

  // The patient left the ward list entirely (concurrent change): close the sheet.
  useEffect(() => {
    if (activeId !== null && active === null) setActiveId(null)
  }, [activeId, active])

  // The rise starts from yesterday's reading when one exists; a first-ever
  // reading has no baseline to travel from.
  useEffect(() => {
    if (justRecorded === null) return
    const timer = setTimeout(() => setJustRecorded(null), 2500)
    return () => clearTimeout(timer)
  }, [justRecorded])

  const handleSaved = (saveAndNext: boolean) => {
    if (active) {
      setJustRecorded({ patientId: active.id, from: active.day.yesterdayReading?.tempC ?? null })
    }
    // Staying on To measure would unmount the only animating Done row, so the
    // gauge rise would never be seen. When the nurse stops (no next patient),
    // show Done so the saved row and its gauge animation are visible.
    if (saveAndNext && nextPatient) setActiveId(nextPatient.id)
    else {
      setActiveId(null)
      if (active) setTab('done')
    }
  }

  const undo = useMutation({
    mutationFn: (readingId: string) => api.undoReading(readingId),
    onSuccess: (_d, readingId) => {
      qc.invalidateQueries({ queryKey: ['ward'] })
      const bed = patients.find((p) => p.day.todayReading?.id === readingId)?.bed
      push({
        tone: 'ok',
        message: bed
          ? `Bed ${bed}: reading removed. The patient is back in To measure.`
          : 'Reading removed. The patient is back in To measure.',
      })
    },
    onError: (e) => {
      if (errCode(e) === 'R7_WINDOW') {
        push({ tone: 'warn', message: 'The 5-minute undo window has passed. Use Correct reading instead.' })
      } else {
        push({ tone: 'error', message: errText(e) })
      }
    },
  })

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <h1 className="font-signage text-3xl font-bold tracking-tight">Today's rounds</h1>
      {ward && (
        <p className="mt-1 text-muted">
          {ward.compliance.measuredCount} of {ward.compliance.bedCount} measured
        </p>
      )}

      <div className="mt-4">
        <Field label="Search patients" hint="Name or bed.">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. A-12"
            className="block w-full rounded-lg border border-ink/30 bg-white px-3 py-2"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Tabs
          tabs={[
            { id: 'to-measure', label: `To measure (${toMeasure.length})` },
            { id: 'done', label: `Done (${done.length})` },
          ]}
          value={tab}
          onChange={(id) => {
            if (id === 'to-measure' || id === 'done') setTab(id)
          }}
        />
      </div>

      {wardQ.isPending ? (
        <div className="mt-2">
          <SkeletonRows rows={6} />
        </div>
      ) : wardQ.isError ? (
        <div className="mt-6">
          <EmptyState title="Could not load the ward" body="Check the connection, then try again." />
          <div className="mt-3">
            <Button onClick={() => wardQ.refetch()}>Retry</Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6">
          {tab === 'to-measure' ? (
            <EmptyState
              title="All patients measured today."
              body={q !== '' ? 'No patient matches this search.' : 'New admissions appear here automatically.'}
            />
          ) : (
            <EmptyState
              title="No readings yet today."
              body={q !== '' ? 'No patient matches this search.' : 'Temperatures you record will appear here.'}
            />
          )}
        </div>
      ) : (
        <ul>
          {rows.map((p) =>
            p.day.status === 'TO_MEASURE' ? (
              <ToMeasureRow key={p.id} patient={p} onOpen={() => setActiveId(p.id)} />
            ) : (
              <DoneRow
                key={p.id}
                patient={p}
                staffName={staffName}
                canCorrect={me === undefined || can(me, 'reading.correct')}
                canUndo={p.day.todayReading !== null && me !== undefined && can(me, 'reading.undo_own') && p.day.todayReading.recordedBy === me.id && withinUndoWindow(p.day.todayReading)}
                undoPending={undo.isPending && undo.variables === p.day.todayReading?.id}
                animateFrom={justRecorded?.patientId === p.id ? justRecorded.from : null}
                onCorrect={() => setCorrectingId(p.day.todayReading?.id ?? null)}
                onUndo={() => {
                  if (p.day.todayReading) undo.mutate(p.day.todayReading.id)
                }}
              />
            ),
          )}
        </ul>
      )}

      {active && (
        <MeasureSheet patient={active} next={nextPatient} onClose={() => setActiveId(null)} onSaved={handleSaved} />
      )}
      {correcting?.day.todayReading && (
        <CorrectModal
          key={correcting.day.todayReading.id}
          patient={correcting}
          reading={correcting.day.todayReading}
          onClose={() => setCorrectingId(null)}
        />
      )}
    </div>
  )
}

function CorrectModal({
  patient,
  reading,
  onClose,
}: {
  patient: WardPatient
  reading: Reading
  onClose: () => void
}) {
  return (
    <Modal open title="Correct reading" onClose={onClose}>
      <CorrectForm key={reading.id} patient={patient} reading={reading} onClose={onClose} />
    </Modal>
  )
}
