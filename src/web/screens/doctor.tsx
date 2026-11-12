// Doctor: Today's visits (route /visits; PLAN section 6). Two panes on
// tablet and up — queue left, selected patient's observation chart right;
// stacked on smaller screens. Groups in order: Needs attention (R5),
// Ready for discharge (R17), Ready to visit, Waiting for temperature
// (R13: Log visit disabled with the reason + the R11 exception path),
// Visited today.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queryKeys } from '@/web/app/api'
import { BedTag } from '@/web/components/bed-tag'
import { StreakLadder } from '@/web/components/streak-ladder'
import { ObservationChart } from '@/web/components/observation-chart'
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Modal,
  SectionHeading,
  SkeletonRows,
  StatTile,
  TextArea,
  useToasts,
} from '@/web/components/ui'
import { CONFIG, dayDiff, evaluateTempInput, formatDay, formatTemp, readingQualifies } from '@/domain'
import type { PatientDayState } from '@/domain'

type WardPatient = Awaited<ReturnType<typeof api.getWard>>['patients'][number]
type DetailPayload = Awaited<ReturnType<typeof api.getPatient>>

/** What the modals need, whichever payload (ward row or detail) they come from. */
interface ModalPatient {
  id: string
  name: string
  bed: string | null
  day: PatientDayState
}

type ModalTarget =
  | { kind: 'visit'; patient: ModalPatient }
  | { kind: 'record'; patient: ModalPatient }
  | { kind: 'approve'; patient: ModalPatient }

function asModalPatient(p: WardPatient): ModalPatient {
  return { id: p.id, name: p.name, bed: p.bed, day: p.day }
}

function detailToModalPatient(d: DetailPayload): ModalPatient {
  return { id: d.patient.id, name: d.patient.name, bed: d.patient.bed, day: d.day }
}

/** Same mapping the admin screen uses, so status copy stays consistent app-wide. */
const STATUS_LABEL: Record<WardPatient['status'], string> = {
  ADMITTED: 'Admitted',
  DISCHARGE_APPROVED: 'Discharge approved',
  DISCHARGED: 'Discharged',
  DECEASED: 'Deceased',
}

function errorInfo(err: unknown): string {
  const e = err as { message?: unknown } | null
  if (e && typeof e === 'object' && typeof e.message === 'string') return e.message
  return 'That did not save. Check the connection and try again.'
}

function hhmm(at: string): string {
  return at.slice(11, 16)
}

function bedName(bed: string | null): string {
  return bed ?? 'the ward'
}

/** Ward order: wing letter, then bed number. */
function compareBed(a: WardPatient, b: WardPatient): number {
  const ab = a.bed ?? ''
  const bb = b.bed ?? ''
  const wing = ab.slice(0, 1).localeCompare(bb.slice(0, 1))
  if (wing !== 0) return wing
  const na = Number.parseInt(ab.slice(1), 10) || 0
  const nb = Number.parseInt(bb.slice(1), 10) || 0
  return na - nb
}

function qualifiesToday(d: PatientDayState): boolean {
  return d.todayReading !== null && readingQualifies(d.todayReading)
}

/** Change since yesterday, the register doctors read before a visit. */
function temperatureTrend(d: PatientDayState): { delta: number; arrow: '↑' | '↓' | '→'; text: string } | null {
  if (d.todayReading === null || d.yesterdayReading === null) return null
  const delta = Math.round((d.todayReading.tempC - d.yesterdayReading.tempC) * 10) / 10
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  const magnitude = Math.abs(delta).toFixed(1)
  return { delta, arrow, text: delta === 0 ? 'No change' : `${arrow} ${delta > 0 ? '+' : '−'}${magnitude} °C` }
}

/** Length of stay in whole days, 1-based, from the admission day. */
function stayLength(admittedDay: string | null, today: string): number | null {
  return admittedDay === null ? null : dayDiff(admittedDay, today) + 1
}

// ---- shared modals -------------------------------------------------------------

interface PatientModalProps {
  patient: ModalPatient
  onClose: () => void
}

function VisitModal({ patient, onClose }: PatientModalProps) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const visit = useMutation({
    mutationFn: () => api.logVisit(patient.id, note.trim() === '' ? undefined : note.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: ['patient'] })
      push({ tone: 'ok', message: `Visit logged for Bed ${bedName(patient.bed)}` })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={`Log visit for ${patient.name}, bed ${bedName(patient.bed)}`} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          visit.mutate()
        }}
      >
        <Field label="Treatment note (optional)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        {formError !== null && (
          <p role="alert" className="text-sm font-medium text-mercury">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={visit.isPending}>
            Log visit
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** R11: the doctor records the temperature themselves — an exception, and it says so. */
function DoctorReadingModal({ patient, onClose }: PatientModalProps) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const prev = patient.day.yesterdayReading?.tempC ?? null
  const evaluation = evaluateTempInput(value, prev)
  const valueError = value.trim() !== '' && !evaluation.ok ? evaluation.message : null
  const ready =
    evaluation.ok && evaluation.value !== null && reason.trim() !== '' && (!evaluation.needsConfirm || confirmed)

  const record = useMutation({
    mutationFn: () =>
      api.recordReading(patient.id, {
        value: evaluation.value as number,
        reason: reason.trim(),
        ...(evaluation.needsConfirm ? { confirm: true } : {}),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: ['patient'] })
      push({
        tone: 'ok',
        message: `Temperature recorded for Bed ${bedName(patient.bed)}: ${formatTemp(res.reading.tempC)} °C, ${
          res.reading.tempC >= CONFIG.FEVER_THRESHOLD_C ? 'fever' : 'no fever'
        }`,
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={`Record temperature yourself — ${patient.name}`} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          if (ready) record.mutate()
        }}
      >
        <p className="text-sm text-muted">
          This is the exception path: the nurse normally records temperatures. The reading is saved under
          your name with the reason below and counts as a process exception on the dashboard.
        </p>
        <Field
          label="Temperature (°C)"
          hint="One decimal place, for example 37.2"
          error={valueError ?? undefined}
        >
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 w-32 rounded-md border border-ink/30 bg-white px-3 font-signage text-xl tabular-nums text-ink"
          />
        </Field>
        <Field label="Reason (required)" hint="Why the nurse's reading is not available">
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        {evaluation.needsConfirm && (
          <label className="flex min-h-11 items-start gap-2 py-1">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>Yes, this reading is correct.</span>
          </label>
        )}
        {formError !== null && (
          <p role="alert" className="text-sm font-medium text-mercury">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready} loading={record.isPending}>
            Save temperature
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ApproveModal({ patient, onClose }: PatientModalProps) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const approve = useMutation({
    mutationFn: () => api.approveDischarge(patient.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: ['patient'] })
      push({
        tone: 'ok',
        message: `Discharge approved — admin will see ${patient.name} in Ready to discharge`,
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={`Approve discharge for ${patient.name}?`} onClose={onClose}>
      <p>
        You are approving discharge for {patient.name} in bed {bedName(patient.bed)}.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>The status becomes Discharge approved.</li>
        {!patient.day.visitToday && <li>No visit is logged today, so this approval counts as today's visit.</li>}
        <li>Admin completes the discharge and frees the bed.</li>
      </ul>
      {formError !== null && (
        <p role="alert" className="mt-3 text-sm font-medium text-mercury">
          {formError}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" loading={approve.isPending} onClick={() => approve.mutate()}>
          Approve discharge
        </Button>
      </div>
    </Modal>
  )
}

// ---- queue ---------------------------------------------------------------------

interface Group {
  id: 'attention' | 'ready' | 'to-visit' | 'waiting' | 'visited'
  title: string
  patients: WardPatient[]
}

function buildGroups(patients: WardPatient[]): Group[] {
  const attention: WardPatient[] = []
  const ready: WardPatient[] = []
  const toVisit: WardPatient[] = []
  const waiting: WardPatient[] = []
  const visited: WardPatient[] = []
  for (const p of patients) {
    const d = p.day
    if (d.flags.needsAttention) attention.push(p)
    else if (d.eligible || p.status === 'DISCHARGE_APPROVED') ready.push(p)
    else if (d.visitToday) visited.push(p)
    else if (d.todayReading) toVisit.push(p)
    else waiting.push(p)
  }
  // Ready for discharge: approvable now, then eligible without a qualifying
  // reading today (R18), then already-approved waiting for admin.
  const readyRank = (p: WardPatient): number => {
    if (p.status === 'DISCHARGE_APPROVED') return 2
    return qualifiesToday(p.day) ? 0 : 1
  }
  ready.sort((a, b) => readyRank(a) - readyRank(b) || compareBed(a, b))
  // Ready to visit: eligible first, then highest temperature today.
  toVisit.sort((a, b) => {
    const ea = a.day.eligible ? 0 : 1
    const eb = b.day.eligible ? 0 : 1
    if (ea !== eb) return ea - eb
    const ta = a.day.todayReading?.tempC ?? -Infinity
    const tb = b.day.todayReading?.tempC ?? -Infinity
    return tb - ta
  })
  waiting.sort(compareBed)
  visited.sort(compareBed)
  const groups: Group[] = [
    { id: 'attention', title: 'Needs attention', patients: attention },
    { id: 'ready', title: 'Ready for discharge', patients: ready },
    { id: 'to-visit', title: 'Ready to visit', patients: toVisit },
    { id: 'waiting', title: 'Waiting for temperature', patients: waiting },
    { id: 'visited', title: 'Visited today', patients: visited },
  ]
  return groups.filter((g) => g.patients.length > 0)
}

interface QueueRowProps {
  patient: WardPatient
  today: string
  group: Group['id']
  selected: boolean
  onSelect: () => void
  onOpenModal: (target: ModalTarget) => void
}

function QueueRow({ patient, today, group, selected, onSelect, onOpenModal }: QueueRowProps) {
  const d = patient.day
  const temp = d.todayReading
  const trend = temperatureTrend(d)
  const tempLine = temp
    ? `${formatTemp(temp.tempC)} °C${
        temp.masked ? ', after medicine' : d.flags.needsAttention ? ', needs attention' : temp.tempC >= CONFIG.FEVER_THRESHOLD_C ? ', fever' : ''
      }`
    : 'No temperature yet'

  // Recognition over recall: the queue carries the facts the doctor would
  // otherwise open the record to check.
  const facts: string[] = []
  const stay = stayLength(patient.admittedDay, today)
  if (stay !== null) facts.push(`Day ${stay} of stay`)
  if (d.yesterdayReading !== null) facts.push(`Yesterday ${formatTemp(d.yesterdayReading.tempC)} °C`)
  if (d.visitToday !== null) {
    facts.push(d.visitToday.viaDischargeApproval ? 'Approved as visit' : `Visited ${hhmm(d.visitToday.loggedAt)}`)
  }
  if (d.flags.missedYesterday) facts.push('No reading yesterday')
  if (d.flags.masked) facts.push('After medicine')
  if (d.flags.lateEntry) facts.push('Late entry')

  let action: ReactNode = null
  if (group === 'waiting') {
    action = (
      <div className="flex flex-col items-end gap-1">
        <Button size="md" disabled aria-label="Log visit, unavailable: temperature not recorded yet">
          Log visit
        </Button>
        <Button size="md" variant="ghost" onClick={() => onOpenModal({ kind: 'record', patient: asModalPatient(patient) })}>
          Record temperature
        </Button>
      </div>
    )
  } else if (group === 'visited') {
    action = (
      <p className="pr-1 text-sm text-muted">
        {d.visitToday
          ? d.visitToday.viaDischargeApproval
            ? 'Approved as visit'
            : `Visited ${hhmm(d.visitToday.loggedAt)}`
          : 'Visited'}
      </p>
    )
  } else if (group === 'ready') {
    action =
      patient.status === 'DISCHARGE_APPROVED' ? (
        <Chip tone="done">Approved</Chip>
      ) : (
        <Button
          size="md"
          disabled={!qualifiesToday(d)}
          onClick={() => onOpenModal({ kind: 'approve', patient: asModalPatient(patient) })}
        >
          Approve discharge
        </Button>
      )
  } else {
    action = (
      <Button size="md" onClick={() => onOpenModal({ kind: 'visit', patient: asModalPatient(patient) })}>
        Log visit
      </Button>
    )
  }

  const blockedReason =
    group === 'waiting'
      ? 'Log visit unlocks once a temperature is recorded today.'
      : group === 'ready' && patient.status !== 'DISCHARGE_APPROVED' && !qualifiesToday(d)
        ? 'Needs a qualifying temperature for today before approval.'
        : null

  return (
    <li className={`border-b border-ink/10 ${selected ? 'bg-ink/[0.045]' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
          className="flex min-h-12 min-w-0 flex-1 basis-64 items-start gap-3 rounded-md px-1 py-0.5 text-left transition-colors duration-150 hover:bg-ink/5"
        >
          <span className="pt-0.5">
            <BedTag bed={patient.bed ?? ''} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="break-words font-semibold text-ink">{patient.name}</span>
              <span className="text-sm text-muted">Age {patient.age}</span>
            </span>
            <span
              className={`block break-words text-sm ${
                temp !== null && temp.tempC >= CONFIG.FEVER_THRESHOLD_C ? 'font-medium text-mercury' : 'text-muted'
              }`}
            >
              {tempLine}
            </span>
            {facts.length > 0 && <span className="mt-0.5 block text-sm text-muted">{facts.join(', ')}</span>}
            {trend !== null && (
              <span
                className={`mt-0.5 block text-sm tabular-nums ${
                  trend.delta > 0 ? 'text-mercury' : trend.delta < 0 ? 'text-done' : 'text-muted'
                }`}
              >
                {trend.text} since yesterday
              </span>
            )}
          </span>
          <span className="shrink-0 pt-0.5">
            <StreakLadder streak={d.streak} />
          </span>
        </button>
        <span className="shrink-0">{action}</span>
      </div>
      {blockedReason !== null && <p className="-mt-1 pb-2 pl-1 text-sm text-muted">{blockedReason}</p>}
    </li>
  )
}

// ---- chart pane ------------------------------------------------------------------

interface ChartPaneProps {
  patientId: string
  today: string
  onOpenModal: (target: ModalTarget) => void
}

function ChartPane({ patientId, today, onOpenModal }: ChartPaneProps) {
  const detail = useQuery({ queryKey: queryKeys.patient(patientId), queryFn: () => api.getPatient(patientId) })

  if (detail.isPending) {
    return (
      <div>
        <SkeletonRows rows={6} />
        <p className="mt-6 text-muted">Loading the observation chart.</p>
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div role="alert" className="border border-mercury/40 bg-white p-4">
        <p className="font-semibold text-mercury">Could not load this patient.</p>
        <p className="mt-1 text-sm text-muted">{errorInfo(detail.error)} Check the connection and try again.</p>
        <Button variant="secondary" onClick={() => void detail.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const { patient, day, readings } = detail.data
  const temp = day.todayReading
  const stay = stayLength(patient.admittedDay, today)
  const trend = temperatureTrend(day)

  return (
    <article className="min-w-0">
      <header className="flex flex-wrap items-center gap-3">
        <BedTag bed={patient.bed ?? ''} />
        <h2 className="font-signage text-2xl font-bold tracking-tight">{patient.name}</h2>
        <span className="text-muted">Age {patient.age}</span>
        <Chip tone={patient.status === 'DISCHARGE_APPROVED' ? 'done' : 'neutral'}>{STATUS_LABEL[patient.status]}</Chip>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-ink/10 py-3 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-muted">Admitted</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {patient.admittedDay === null ? 'Not recorded' : formatDay(patient.admittedDay)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Day of stay</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">{stay === null ? '—' : stay}</dd>
        </div>
        <div>
          <dt className="text-muted">Yesterday</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {day.yesterdayReading === null ? 'No reading' : `${formatTemp(day.yesterdayReading.tempC)} °C`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Trend</dt>
          <dd
            className={`mt-0.5 font-medium tabular-nums ${
              trend === null || trend.delta <= 0 ? 'text-ink' : 'text-mercury'
            }`}
          >
            {trend === null ? '—' : trend.text}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Visit today</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {day.visitToday === null ? 'Not yet' : hhmm(day.visitToday.loggedAt)}
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-2">
        {day.flags.masked && <Chip tone="amber">Temperature after fever-reducing medicine</Chip>}
        {day.flags.missedYesterday && <Chip tone="amber">No reading yesterday</Chip>}
        {day.flags.lateEntry && <Chip tone="amber">Late entry</Chip>}
        {day.flags.delayed && <Chip tone="amber">Discharge delayed {day.delayDays} day(s)</Chip>}
      </div>
      <p className="mt-3 font-signage text-xl">
        {temp ? (
          <>
            <span className={temp.tempC >= CONFIG.FEVER_THRESHOLD_C ? 'font-semibold text-mercury' : 'font-semibold'}>
              {formatTemp(temp.tempC)} °C
            </span>{' '}
            <span className="text-base text-muted">
              today, recorded {hhmm(temp.recordedAt)}
            </span>
          </>
        ) : (
          <span className="text-muted">No temperature recorded today</span>
        )}
      </p>
      <div className="mt-3">
        <StreakLadder streak={day.streak} />
      </div>
      <div className="mt-4">
        <ObservationChart readings={readings} today={today} admittedDay={patient.admittedDay} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {day.visitToday ? (
          <p className="text-sm text-muted">
            Visited today at {hhmm(day.visitToday.loggedAt)}
            {day.visitToday.viaDischargeApproval ? ' (via discharge approval)' : ''}.
          </p>
        ) : (
          <Button
            onClick={() => onOpenModal({ kind: 'visit', patient: detailToModalPatient(detail.data) })}
            disabled={!day.todayReading}
          >
            Log visit
          </Button>
        )}
        {!day.todayReading && (
          <Button
            variant="secondary"
            onClick={() => onOpenModal({ kind: 'record', patient: detailToModalPatient(detail.data) })}
          >
            Record temperature yourself
          </Button>
        )}
        {patient.status === 'ADMITTED' &&
          (day.eligible ? (
            <Button
              disabled={!qualifiesToday(day)}
              onClick={() => onOpenModal({ kind: 'approve', patient: detailToModalPatient(detail.data) })}
            >
              Approve discharge
            </Button>
          ) : (
            <Button disabled>Approve discharge</Button>
          ))}
        <Link to={`/patient/${patient.id}`} className="inline-flex min-h-11 items-center font-medium text-focus underline">
          Open the full record
        </Link>
      </div>
      {patient.status === 'ADMITTED' && !day.eligible && (
        <p className="mt-1 text-sm text-muted">
          Not eligible yet: {day.streak} of {CONFIG.STREAK_DAYS_FOR_CURE} fever-free days. Approval unlocks at 3.
        </p>
      )}
      {patient.status === 'ADMITTED' && day.eligible && !qualifiesToday(day) && (
        <p className="mt-1 text-sm text-muted">
          A qualifying temperature for today is required before approval.
        </p>
      )}
      {patient.status === 'DISCHARGE_APPROVED' && (
        <p className="mt-1 text-sm text-muted">
          Discharge approved — waiting for admin to complete it. Admin sees {patient.name} in Ready to discharge.
        </p>
      )}
      {!day.todayReading && (
        <p className="mt-1 text-sm text-muted">
          Temperature not recorded yet. A nurse records it, or you can record it yourself.
        </p>
      )}
    </article>
  )
}

// ---- screen ----------------------------------------------------------------------

export function DoctorVisits() {
  const ward = useQuery({ queryKey: queryKeys.ward, queryFn: () => api.getWard() })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalTarget | null>(null)
  // Open on the actionable queue, like the ward round starts: patients whose
  // temperature is in and who still need a doctor.
  const [tab, setTab] = useState<'all' | Group['id']>('to-visit')
  const [search, setSearch] = useState('')

  if (ward.isPending) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SkeletonRows rows={8} />
      </div>
    )
  }
  if (ward.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div role="alert" className="border border-mercury/40 bg-white p-4">
          <p className="font-semibold text-mercury">Could not load the ward board.</p>
          <p className="mt-1 text-sm text-muted">{errorInfo(ward.error)} Check the connection and try again.</p>
          <Button variant="secondary" onClick={() => void ward.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const data = ward.data
  const patients = [...data.patients].sort(compareBed)
  const groups = buildGroups(patients)
  // "Visited today" is a fact about the day, not a queue partition: a patient
  // can be visited and discharge-eligible at the same time, so this tab
  // deliberately overlaps the queue groups and matches the header tile.
  const visitedAll = patients.filter((p) => p.day.visitToday !== null)
  const unseen = Math.max(0, data.compliance.bedCount - data.compliance.visitCount)
  const unmeasured = Math.max(0, data.compliance.bedCount - data.compliance.measuredCount)
  const groupCount = (id: Group['id']) => groups.find((g) => g.id === id)?.patients.length ?? 0
  const tabItems: Array<{ id: 'all' | Group['id']; label: string; count: number }> = [
    { id: 'all', label: 'All zones', count: patients.length },
    { id: 'attention', label: 'Needs attention', count: groupCount('attention') },
    { id: 'ready', label: 'Discharge eligible', count: groupCount('ready') },
    { id: 'to-visit', label: 'Ready for visit', count: groupCount('to-visit') },
    { id: 'waiting', label: 'Waiting for temperature', count: groupCount('waiting') },
    { id: 'visited', label: 'Visited today', count: visitedAll.length },
  ]

  // Search filters the queue by the labels a doctor can see: name, bed, id.
  const needle = search.trim().toLowerCase()
  const searched =
    needle === ''
      ? patients
      : patients.filter((p) =>
          [p.name, p.bed ?? '', p.id].some((value) => value.toLowerCase().includes(needle)),
        )
  const searchedGroups = buildGroups(searched)
  const tabGroups: Group[] =
    tab === 'visited'
      ? [
          {
            id: 'visited',
            title: 'Visited today',
            patients: searched.filter((p) => p.day.visitToday !== null),
          },
        ]
      : searchedGroups.filter((g) => g.id === tab)
  const visibleGroups =
    tab === 'all' ? searchedGroups : tabGroups.filter((g) => g.patients.length > 0)
  const defaultId = visibleGroups[0]?.patients[0]?.id ?? null
  const closeModal = () => setModal(null)

  // Derived selection (no effect, and so no hook-order surprises on the
  // early returns above): keep the tapped patient while they are visible,
  // otherwise open the top of the current queue — needs attention first.
  const activeId =
    selectedId !== null &&
    visibleGroups.some((group) => group.patients.some((patient) => patient.id === selectedId))
      ? selectedId
      : defaultId
  const active = patients.find((patient) => patient.id === activeId) ?? null

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="border-b border-ink/15 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-signage text-sm font-semibold uppercase tracking-wide text-muted">
              Doctor round
            </p>
            <h1 className="mt-1 font-signage text-3xl font-bold tracking-tight">Today's visits</h1>
            <p className="mt-1 max-w-prose text-muted">
              A patient appears under Ready for visit the moment a nurse records today's temperature.
            </p>
          </div>
          <p className="text-muted">{formatDay(data.currentDay)}</p>
        </div>

        {unseen > 0 && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border border-signal/40 bg-signal-tint px-4 py-3"
          >
            <span className="font-semibold text-signal">Still to see</span>
            <span className="text-ink">
              {unseen === 1 ? '1 patient has' : `${unseen} patients have`} not been seen today.
              {unmeasured > 0 && ` ${unmeasured} still need a temperature first.`}
            </span>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Ready for visit" value={groupCount('to-visit')} sub="temperature in, not yet seen" />
          <StatTile label="Waiting on nurse" value={groupCount('waiting')} sub="visit locked until measured" />
          <StatTile
            label="Visited today"
            value={data.compliance.visitCount}
            sub="visits logged today"
          />
          <StatTile
            label="Discharge eligible"
            value={groupCount('ready')}
            sub={`${data.capacity - data.occupied} beds free`}
          />
        </dl>

        <div className="mt-4">
          <label htmlFor="visit-search" className="sr-only">
            Search the visit queue
          </label>
          <input
            id="visit-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, bed or ID"
            className="min-h-11 w-full rounded-sm border border-ink/20 bg-white px-3 text-ink placeholder:text-muted focus:border-focus"
          />
        </div>

        <nav aria-label="Queue filters" className="mt-4 flex gap-1 overflow-x-auto border-b border-ink/15">
          {tabItems.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={active}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {item.label} <span className="ml-1 tabular-nums">{item.count}</span>
              </button>
            )
          })}
        </nav>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(400px,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(460px,600px)_minmax(0,1fr)] xl:gap-8">
        <section aria-label="Visit queue">
          {visibleGroups.length === 0 ? (
            <EmptyState
              title={
                needle !== ''
                  ? 'No patient matches that search'
                  : tab !== 'all'
                    ? 'Nobody in this list right now'
                    : 'Everyone is seen'
              }
              body={
                needle !== ''
                  ? 'Try a name, a bed such as A-12, or part of a patient id.'
                  : tab !== 'all'
                    ? 'Switch to All zones to see the rest of the ward.'
                    : 'Every patient in a bed has been visited today. New patients appear as nurses record temperatures.'
              }
            />
          ) : (
            visibleGroups.map((group) => (
              <div key={group.id} className="mb-6">
                <SectionHeading>
                  {group.title} ({group.patients.length})
                </SectionHeading>
                {group.id === 'attention' && (
                  <p className="mb-2 text-sm text-mercury">
                    Fever today, or a temperature taken after medicine. Review before the visit.
                  </p>
                )}
                {group.id === 'waiting' && (
                  <p className="mb-2 text-sm text-muted">
                    A temperature is needed before the visit. You can record it yourself.
                  </p>
                )}
                <ul>
                  {group.patients.map((p) => (
                    <QueueRow
                      key={p.id}
                      patient={p}
                      today={data.currentDay}
                      group={group.id}
                      selected={p.id === activeId}
                      onSelect={() => setSelectedId(p.id)}
                      onOpenModal={setModal}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <section
          aria-label="Selected patient"
          className="min-w-0 lg:sticky lg:top-6 lg:border-l lg:border-ink/10 lg:pl-6 xl:pl-8"
        >
          {active === null ? (
            <EmptyState
              title="Select a patient"
              body="Choose someone from the queue to see their observation chart, streak and actions."
            />
          ) : (
            <ChartPane patientId={active.id} today={data.currentDay} onOpenModal={setModal} />
          )}
        </section>
      </div>

      {modal?.kind === 'visit' && <VisitModal patient={modal.patient} onClose={closeModal} />}
      {modal?.kind === 'record' && <DoctorReadingModal patient={modal.patient} onClose={closeModal} />}
      {modal?.kind === 'approve' && <ApproveModal patient={modal.patient} onClose={closeModal} />}
    </div>
  )
}
