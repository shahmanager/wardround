// Patient detail (route /patient/:id; PLAN section 6, R23). Open to every
// role; the actions come from permissions via can(), never from hard-coded
// role checks. Terminal records (DISCHARGED / DECEASED) are read-only.
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiClientError, queryKeys } from '@/app/api'
import type { MeResponse, PatientDetailResponse } from '@/app/api'
import { useSession } from '@/app/session'
import { BedTag } from '@/components/bed-tag'
import { StreakLadder } from '@/components/streak-ladder'
import { ObservationChart } from '@/components/observation-chart'
import { MercuryGauge } from '@/components/mercury-gauge'
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Modal,
  SectionHeading,
  SkeletonRows,
  TextArea,
  useToasts,
} from '@/components/ui'
import {
  can,
  computeStreak,
  CONFIG,
  dateAdd,
  dayDiff,
  evaluateTempInput,
  formatDay,
  formatTemp,
  validateApprove,
  validateCompleteDischarge,
  validateCorrection,
  validateDeath,
  validateLateEntry,
  validateUndo,
  validateVisit,
} from '@/domain'
import type { AuditEntry, Patient, PatientDayState, Sex } from '@/domain'

const STATUS_LABEL: Record<Patient['status'], string> = {
  ADMITTED: 'Admitted',
  DISCHARGE_APPROVED: 'Discharge approved',
  DISCHARGED: 'Discharged',
  DECEASED: 'Deceased',
}

const STATUS_TONE: Record<Patient['status'], 'neutral' | 'done' | 'alert'> = {
  ADMITTED: 'neutral',
  DISCHARGE_APPROVED: 'done',
  DISCHARGED: 'done',
  DECEASED: 'alert',
}

const SEX_LABEL: Record<Sex, string> = { F: 'Female', M: 'Male', X: 'Other' }

function messageOf(err: unknown): string | null {
  const e = err as { message?: unknown } | null
  if (e && typeof e === 'object' && typeof e.message === 'string') return e.message
  return null
}

function errorInfo(err: unknown): string {
  return messageOf(err) ?? 'That did not save. Check the connection and try again.'
}

function loadErrorInfo(err: unknown): string {
  return messageOf(err) ?? 'Could not load this patient. Check the connection and try again.'
}

function hhmm(at: string): string {
  return at.slice(11, 16)
}

function bedName(bed: string | null): string {
  return bed ?? 'the ward'
}

function daysText(days: number): string {
  return days === 1 ? '1 day' : days + ' days'
}

function stayText(patient: Patient, today: string): string {
  if (patient.admittedDay === null) return 'Admission day not recorded.'
  const endDay = patient.closedDay ?? today
  const days = dayDiff(patient.admittedDay, endDay) + 1
  if (patient.status === 'DISCHARGED' || patient.status === 'DECEASED') {
    return 'Stay lasted ' + daysText(days) + '.'
  }
  return 'Day ' + days + ' of stay.'
}

function dayFlags(day: PatientDayState): Array<{ tone: 'amber' | 'alert'; label: string }> {
  const flags: Array<{ tone: 'amber' | 'alert'; label: string }> = []
  if (day.flags.needsAttention) flags.push({ tone: 'alert', label: 'Needs attention' })
  if (day.flags.masked) flags.push({ tone: 'amber', label: 'Fever-reducing medicine given today' })
  if (day.flags.missedYesterday) flags.push({ tone: 'amber', label: 'No reading yesterday' })
  if (day.flags.lateEntry) flags.push({ tone: 'amber', label: 'Late entry on record' })
  if (day.flags.delayed) flags.push({ tone: 'amber', label: 'Discharge delayed ' + daysText(day.delayDays) })
  return flags
}

/** Audit action codes ("READING_RECORDED") to readable words, sentence case. */
function actionLabel(action: string): string {
  const spaced = action.replace(/[_\-.]+/g, ' ').trim()
  if (spaced === '') return action
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const actor = entry.actorId !== null && entry.actorId !== '' ? entry.actorRole + ', ' + entry.actorId : entry.actorRole
  return (
    <li className="border-b border-ink/10 py-2">
      <p className="font-medium text-ink">{actionLabel(entry.action)}</p>
      <p className="text-sm text-muted">
        {actor} on {formatDay(entry.day)} at {hhmm(entry.at)}
      </p>
      {entry.detail !== null && entry.detail !== '' && <p className="text-sm">{entry.detail}</p>}
    </li>
  )
}

function ActionRow({
  children,
  hint,
  blocked,
}: {
  children: ReactNode
  hint?: string
  blocked?: string | null
}) {
  return (
    <li className="border-b border-ink/10 py-3">
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      {hint !== undefined && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {blocked !== null && blocked !== undefined && <p className="mt-1 text-sm text-ink">{blocked}</p>}
    </li>
  )
}

// ---- reading form modals ---------------------------------------------------------

interface DetailModalProps {
  detail: { patient: Patient; day: PatientDayState }
  onClose: () => void
}

/** R11 modal: value + MANDATORY reason; the exception path is stated on the form. */
function DoctorRecordModal({ detail, onClose }: DetailModalProps) {
  return (
    <ReadingModal
      detail={detail}
      onClose={onClose}
      doctorException
      title={'Record temperature yourself - ' + detail.patient.name}
      intro="This is the exception path: the nurse normally records temperatures. The reading is saved under your name with the reason below and counts as a process exception on the dashboard."
      reasonLabel="Reason (required)"
      reasonHint="Why the nurse's reading is not available"
      submitLabel="Save temperature"
    />
  )
}

/** Nurse path: value + the R6 medicine question; no reason needed. */
function NurseRecordModal({ detail, onClose }: DetailModalProps) {
  return (
    <ReadingModal
      detail={detail}
      onClose={onClose}
      doctorException={false}
      title={'Record temperature - ' + detail.patient.name + ', bed ' + bedName(detail.patient.bed)}
      intro="The ward round sheet is the usual place to record this; this form records the same reading."
      reasonLabel={undefined}
      reasonHint={undefined}
      submitLabel="Record temperature"
    />
  )
}

interface ReadingModalProps {
  detail: { patient: Patient; day: PatientDayState }
  onClose: () => void
  doctorException: boolean
  title: string
  intro: string
  reasonLabel: string | undefined
  reasonHint: string | undefined
  submitLabel: string
}

function ReadingModal({
  detail,
  onClose,
  doctorException,
  title,
  intro,
  reasonLabel,
  reasonHint,
  submitLabel,
}: ReadingModalProps) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [masked, setMasked] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const prev = detail.day.yesterdayReading?.tempC ?? null
  const evaluation = evaluateTempInput(value, prev)
  const valueError = value.trim() !== '' && !evaluation.ok ? evaluation.message : null
  const reasonReady = !doctorException || reason.trim() !== ''
  const ready =
    evaluation.ok && evaluation.value !== null && reasonReady && (!evaluation.needsConfirm || confirmed)

  const record = useMutation({
    mutationFn: () =>
      api.recordReading(detail.patient.id, {
        value: evaluation.value as number,
        ...(doctorException ? { reason: reason.trim() } : {}),
        ...(masked ? { masked: true } : {}),
        ...(evaluation.needsConfirm ? { confirm: true } : {}),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(detail.patient.id) })
      push({
        tone: 'ok',
        message:
          'Bed ' +
          bedName(detail.patient.bed) +
          ': ' +
          formatTemp(res.reading.tempC) +
          ' °C recorded, ' +
          (res.reading.tempC >= CONFIG.FEVER_THRESHOLD_C ? 'fever' : 'no fever'),
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={title} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          if (ready) record.mutate()
        }}
      >
        <p className="text-sm text-muted">{intro}</p>
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
        {!doctorException && (
          <label className="flex min-h-11 items-start gap-2 py-1">
            <input
              type="checkbox"
              checked={masked}
              onChange={(e) => setMasked(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>Fever-reducing medicine given in the last {CONFIG.ANTIPYRETIC_WINDOW_H} hours?</span>
          </label>
        )}
        {doctorException && reasonLabel !== undefined && (
          <Field label={reasonLabel} hint={reasonHint}>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </Field>
        )}
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
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** R8 correction: value + mandatory reason; the original is kept, superseded. */
function CorrectModal({
  detail,
  readingId,
  onClose,
}: DetailModalProps & { readingId: string }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const prev = detail.day.yesterdayReading?.tempC ?? null
  const evaluation = evaluateTempInput(value, prev)
  const valueError = value.trim() !== '' && !evaluation.ok ? evaluation.message : null
  const ready =
    evaluation.ok && evaluation.value !== null && reason.trim() !== '' && (!evaluation.needsConfirm || confirmed)

  const correct = useMutation({
    mutationFn: () =>
      api.correctReading(readingId, {
        value: evaluation.value as number,
        reason: reason.trim(),
        ...(evaluation.needsConfirm ? { confirm: true } : {}),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(detail.patient.id) })
      push({
        tone: 'ok',
        message:
          'Reading corrected for ' +
          detail.patient.name +
          ': ' +
          formatTemp(res.reading.tempC) +
          ' °C. The original is kept.',
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={"Correct today's reading - " + detail.patient.name} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          if (ready) correct.mutate()
        }}
      >
        <p className="text-sm text-muted">
          The original reading is kept and superseded, never deleted. A correction that removes eligibility
          revokes an approval automatically.
        </p>
        <Field
          label="Corrected temperature (°C)"
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
        <Field label="Reason (required)" hint="What was wrong with the original reading">
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
          <Button type="submit" disabled={!ready} loading={correct.isPending}>
            Save correction
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** R9 late entry: the previous day only, value + mandatory reason. */
function LateEntryModal({ detail, today, onClose }: DetailModalProps & { today: string }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const targetDay = dateAdd(today, -1)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const evaluation = evaluateTempInput(value, null)
  const valueError = value.trim() !== '' && !evaluation.ok ? evaluation.message : null
  const ready =
    evaluation.ok && evaluation.value !== null && reason.trim() !== '' && (!evaluation.needsConfirm || confirmed)

  const save = useMutation({
    mutationFn: () =>
      api.lateEntry(detail.patient.id, {
        value: evaluation.value as number,
        reason: reason.trim(),
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(detail.patient.id) })
      push({
        tone: 'ok',
        message: 'Late entry saved for ' + formatDay(targetDay) + ': ' + formatTemp(res.reading.tempC) + ' °C.',
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={'Late entry for yesterday - ' + detail.patient.name} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          if (ready) save.mutate()
        }}
      >
        <p className="text-sm text-muted">
          Only {formatDay(targetDay)} can be filled in late. A late entry needs a reason and counts as a
          process exception on the dashboard.
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
        <Field label="Reason (required)" hint="Why the reading was not recorded on the day">
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
          <Button type="submit" disabled={!ready} loading={save.isPending}>
            Save late entry
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- visit and discharge modals -------------------------------------------------

function VisitLogModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const log = useMutation({
    mutationFn: () => api.logVisit(patient.id, note.trim() !== '' ? note.trim() : undefined),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(patient.id) })
      push({ tone: 'ok', message: 'Visit logged for ' + patient.name + ' at ' + hhmm(res.visit.loggedAt) + '.' })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={'Log visit - ' + patient.name} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setFormError(null)
          log.mutate()
        }}
      >
        <p className="text-sm text-muted">
          Log today's visit for {patient.name} in bed {bedName(patient.bed)}. The temperature is already
          recorded.
        </p>
        <Field label="Note (optional)" hint="Anything the next clinician should know.">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
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
          <Button type="submit" loading={log.isPending}>
            Log visit
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ApproveDischargeModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const approve = useMutation({
    mutationFn: () => api.approveDischarge(patient.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(patient.id) })
      push({ tone: 'ok', message: 'Discharge approved for ' + patient.name + '. Admin can complete it.' })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={'Approve discharge - ' + patient.name} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Approve discharge for {patient.name} in bed {bedName(patient.bed)}? This tells admin the patient
          can leave. A later correction that removes eligibility revokes the approval automatically.
        </p>
        {formError !== null && (
          <p role="alert" className="text-sm font-medium text-mercury">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={approve.isPending}
            onClick={() => {
              setFormError(null)
              approve.mutate()
            }}
          >
            Approve discharge
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CompleteDischargeModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const complete = useMutation({
    mutationFn: () => api.completeDischarge(patient.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(patient.id) })
      push({
        tone: 'ok',
        message: 'Discharge completed for ' + patient.name + '. Bed ' + bedName(patient.bed) + ' is free.',
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={'Complete discharge - ' + patient.name} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Complete the discharge for {patient.name} in bed {bedName(patient.bed)}? This records the outcome
          as cured, frees the bed and closes the record. It cannot be undone.
        </p>
        {formError !== null && (
          <p role="alert" className="text-sm font-medium text-mercury">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={complete.isPending}
            onClick={() => {
              setFormError(null)
              complete.mutate()
            }}
          >
            Complete discharge
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RecordDeathModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const record = useMutation({
    mutationFn: () => api.recordDeath(patient.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(patient.id) })
      push({
        tone: 'ok',
        message: 'Death recorded for ' + patient.name + '. Bed ' + bedName(patient.bed) + ' is free.',
      })
      onClose()
    },
    onError: (err) => setFormError(errorInfo(err)),
  })

  return (
    <Modal open title={'Record death - ' + patient.name} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Record the death of {patient.name} in bed {bedName(patient.bed)}? This records the outcome as
          died, frees the bed, closes the record and cannot be undone.
        </p>
        {formError !== null && (
          <p role="alert" className="text-sm font-medium text-mercury">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={record.isPending}
            onClick={() => {
              setFormError(null)
              record.mutate()
            }}
          >
            Record death
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---- permissions-driven actions -------------------------------------------------

type ActionModal = 'record' | 'correct' | 'undo' | 'late' | 'visit' | 'approve' | 'complete' | 'death' | null

function PatientActions({ detail, me }: { detail: PatientDetailResponse; me: MeResponse }) {
  const { patient, day, readings } = detail
  const today = me.currentDay
  const staff = me.staff
  const [modal, setModal] = useState<ActionModal>(null)
  const { push } = useToasts()
  const queryClient = useQueryClient()

  const terminal = patient.status === 'DISCHARGED' || patient.status === 'DECEASED'
  const streak = computeStreak({ readings, today, admittedDay: patient.admittedDay })
  const targetDay = dateAdd(today, -1)
  const yesterdayActive = readings.find((r) => r.day === targetDay && r.status === 'active') ?? null
  const readingId = day.todayReading?.id ?? null

  const undo = useMutation({
    mutationFn: () => {
      if (readingId === null) throw new Error('There is no open reading to undo.')
      return api.undoReading(readingId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.patient(patient.id) })
      push({ tone: 'ok', message: 'Reading undone for ' + patient.name + '. Record it again if it was wrong.' })
    },
    onError: (err) => push({ tone: 'error', message: errorInfo(err) }),
  })

  const canRecord = can(staff, 'reading.record')
  const canCorrect = can(staff, 'reading.correct')
  const canUndo = can(staff, 'reading.undo_own')
  const canVisit = can(staff, 'visit.log')
  const canApprove = can(staff, 'discharge.approve')
  const canComplete = can(staff, 'discharge.complete')
  const canLate = can(staff, 'reading.late_entry')
  const canDeath = can(staff, 'patient.record_death')
  const doctorPath = can(staff, 'visit.log')

  const recordBlocked = terminal
    ? 'This record is closed and read-only.'
    : day.todayReading !== null
      ? 'Already recorded today: ' +
        formatTemp(day.todayReading.tempC) +
        ' °C at ' +
        hhmm(day.todayReading.recordedAt) +
        '. Correct it instead.'
      : null

  const correctionCheck =
    day.todayReading !== null
      ? validateCorrection({
          actorRole: staff.role,
          reading: day.todayReading,
          today,
          visitToday: day.visitToday,
          reason: 'The form requires a reason.',
        })
      : null
  const correctionBlocked = correctionCheck?.message ?? null

  const undoCheck =
    day.todayReading !== null
      ? validateUndo({
          reading: day.todayReading,
          actorStaffId: staff.id,
          actorRole: staff.role,
          today,
          nowAt: new Date().toISOString(),
        })
      : null
  const undoBlocked = undoCheck?.message ?? null

  const visitCheck =
    day.visitToday === null
      ? validateVisit({ patient, today, todayReading: day.todayReading, existingVisit: null })
      : null
  const visitBlocked = visitCheck?.message ?? null

  const approveCheck =
    patient.status === 'ADMITTED'
      ? validateApprove({ patient, today, streak, todayReading: day.todayReading })
      : null
  const approveBlocked = approveCheck?.message ?? null

  const lateCheck = validateLateEntry({
    patient,
    targetDay,
    today,
    reason: 'The form requires a reason.',
    existingActiveOnTarget: yesterdayActive,
  })
  const lateBlocked =
    lateCheck === null
      ? null
      : lateCheck.code === 'R1_DUPLICATE'
        ? 'A reading already exists for that day, so no late entry is needed.'
        : lateCheck.message

  const completeBlocked = validateCompleteDischarge({ patient })?.message ?? null
  const deathBlocked = validateDeath({ patient })?.message ?? null
  const close = () => setModal(null)

  if (terminal) {
    return (
      <section className="mt-8">
        <SectionHeading>Actions</SectionHeading>
        <p className="mt-3 border-l-4 border-ink/25 pl-3 text-sm text-muted">
          This record is closed and read-only. No clinical actions can be taken.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-8">
      <SectionHeading>Actions</SectionHeading>
      <p className="mt-2 text-sm text-muted">
        Only actions your role allows appear here. A disabled action says why.
      </p>
      <ul className="mt-2">
        {canRecord && (
          <ActionRow
            hint={
              doctorPath
                ? 'Record only when a nurse cannot. This needs a reason and counts as a process exception.'
                : 'The ward round sheet is the usual place. Record the same reading here.'
            }
            blocked={recordBlocked}
          >
            <Button disabled={recordBlocked !== null} onClick={() => setModal('record')}>
              {doctorPath ? 'Record temperature yourself' : 'Record temperature'}
            </Button>
          </ActionRow>
        )}

        {canCorrect && day.todayReading !== null && (
          <ActionRow
            hint="A correction needs a reason. The original reading is kept."
            blocked={correctionBlocked}
          >
            <Button variant="secondary" disabled={correctionBlocked !== null} onClick={() => setModal('correct')}>
              Correct today's reading
            </Button>
          </ActionRow>
        )}

        {canUndo && day.todayReading !== null && day.todayReading.recordedBy === staff.id && (
          <ActionRow hint="Within 5 minutes of recording it." blocked={undoBlocked}>
            <Button
              variant="secondary"
              disabled={undoBlocked !== null}
              loading={undo.isPending}
              onClick={() => undo.mutate()}
            >
              Undo my reading
            </Button>
          </ActionRow>
        )}

        {canLate && (
          <ActionRow
            hint={'Only ' + formatDay(targetDay) + ' can be entered late, with a reason.'}
            blocked={lateBlocked}
          >
            <Button variant="secondary" disabled={lateBlocked !== null} onClick={() => setModal('late')}>
              Late entry for yesterday
            </Button>
          </ActionRow>
        )}

        {canVisit &&
          (day.visitToday !== null ? (
            <ActionRow
              hint={
                'Logged at ' +
                hhmm(day.visitToday.loggedAt) +
                (day.visitToday.viaDischargeApproval ? ' when discharge was approved.' : '.')
              }
            >
              <Chip tone="done">Visit logged today</Chip>
            </ActionRow>
          ) : (
            <ActionRow hint="A visit can be logged after today's temperature is recorded." blocked={visitBlocked}>
              <Button disabled={visitBlocked !== null} onClick={() => setModal('visit')}>
                Log visit
              </Button>
            </ActionRow>
          ))}

        {canApprove &&
          (patient.status === 'ADMITTED' ? (
            <ActionRow
              hint="Needs 3 fever-free days and a qualifying temperature today."
              blocked={approveBlocked}
            >
              <Button disabled={approveBlocked !== null} onClick={() => setModal('approve')}>
                Approve discharge
              </Button>
            </ActionRow>
          ) : patient.status === 'DISCHARGE_APPROVED' ? (
            <ActionRow hint="Admin completes the discharge from the bed board.">
              <Chip tone="done">Discharge approved</Chip>
            </ActionRow>
          ) : null)}

        {canComplete && (
          <ActionRow
            hint="Only a doctor-approved discharge can be completed."
            blocked={completeBlocked}
          >
            <Button disabled={completeBlocked !== null} onClick={() => setModal('complete')}>
              Complete discharge
            </Button>
          </ActionRow>
        )}

        {canDeath && (
          <ActionRow
            hint="This closes the record and frees the bed. It cannot be undone."
            blocked={deathBlocked}
          >
            <Button variant="danger" disabled={deathBlocked !== null} onClick={() => setModal('death')}>
              Record death
            </Button>
          </ActionRow>
        )}
      </ul>

      {modal === 'record' &&
        (doctorPath ? (
          <DoctorRecordModal detail={detail} onClose={close} />
        ) : (
          <NurseRecordModal detail={detail} onClose={close} />
        ))}
      {modal === 'correct' && day.todayReading !== null && (
        <CorrectModal detail={detail} readingId={day.todayReading.id} onClose={close} />
      )}
      {modal === 'late' && <LateEntryModal detail={detail} today={today} onClose={close} />}
      {modal === 'visit' && <VisitLogModal patient={patient} onClose={close} />}
      {modal === 'approve' && <ApproveDischargeModal patient={patient} onClose={close} />}
      {modal === 'complete' && <CompleteDischargeModal patient={patient} onClose={close} />}
      {modal === 'death' && <RecordDeathModal patient={patient} onClose={close} />}
    </section>
  )
}

// ---- screen ---------------------------------------------------------------------

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</div>
}

export function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const patientId = id ?? ''
  const { me } = useSession()
  const detail = useQuery({
    queryKey: queryKeys.patient(patientId),
    queryFn: () => api.getPatient(patientId),
    enabled: patientId !== '',
  })

  if (me === null) {
    return (
      <Frame>
        <p role="status" className="text-muted">
          Loading your session.
        </p>
      </Frame>
    )
  }

  if (patientId === '') {
    return (
      <Frame>
        <EmptyState title="Patient not found" body="This address has no patient id. Open a patient from the ward board." />
      </Frame>
    )
  }

  if (detail.isPending) {
    return (
      <Frame>
        <h1 className="font-signage text-3xl font-semibold tracking-tight text-ink">Patient record</h1>
        <div className="mt-6">
          <SkeletonRows rows={8} />
        </div>
        <p className="mt-4 text-muted">Loading the patient record.</p>
      </Frame>
    )
  }

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.code === 'NOT_FOUND'
    return (
      <Frame>
        <h1 className="font-signage text-3xl font-semibold tracking-tight text-ink">Patient record</h1>
        <div className="mt-6">
          <EmptyState
            title={notFound ? 'Patient not found' : 'Could not load the patient record'}
            body={
              notFound
                ? 'No patient in this workspace matches this address. Go back to the ward board and choose a patient.'
                : loadErrorInfo(detail.error)
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link to="/" className="font-semibold text-focus underline underline-offset-2">
            Back to my workspace
          </Link>
          {!notFound && (
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </Frame>
    )
  }

  const { patient, day, readings, audit } = detail.data
  const today = me.currentDay
  const streak = computeStreak({ readings, today, admittedDay: patient.admittedDay })
  const terminal = patient.status === 'DISCHARGED' || patient.status === 'DECEASED'
  const flags = dayFlags(day)
  const auditNewestFirst = [...audit].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Frame>
      <p>
        <Link to="/" className="text-sm font-medium text-focus underline underline-offset-2">
          Back to my workspace
        </Link>
      </p>

      <header className="mt-2">
        <div className="flex flex-wrap items-center gap-3">
          {patient.bed !== null && <BedTag bed={patient.bed} />}
          <h1 className="font-signage text-3xl font-semibold tracking-tight text-ink">{patient.name}</h1>
          <Chip tone={STATUS_TONE[patient.status]}>{STATUS_LABEL[patient.status]}</Chip>
        </div>
        <p className="mt-2 text-muted">
          Age {patient.age}, {SEX_LABEL[patient.sex].toLowerCase()}. {stayText(patient, today)}
        </p>
        {flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {flags.map((flag) => (
              <Chip key={flag.label} tone={flag.tone}>
                {flag.label}
              </Chip>
            ))}
          </div>
        )}
        {terminal && (
          <p className="mt-3 border-l-4 border-ink/25 pl-3 text-sm text-muted">
            This record is closed. Discharged and deceased records are read-only.
          </p>
        )}
      </header>

      <section className="mt-8">
        <SectionHeading>Today</SectionHeading>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div>
            {day.todayReading !== null ? (
              <>
                <MercuryGauge
                  value={day.todayReading.tempC}
                  yesterday={day.yesterdayReading?.tempC ?? null}
                  animateFrom={day.yesterdayReading?.tempC ?? null}
                />
                <p className="mt-2 text-sm text-ink">
                  Recorded at {hhmm(day.todayReading.recordedAt)}
                  {day.todayReading.lateEntry ? ' as a late entry' : ''}
                  {day.todayReading.masked ? ' after fever-reducing medicine' : ''}.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Yesterday: {day.yesterdayReading !== null ? formatTemp(day.yesterdayReading.tempC) + ' °C' : 'no reading'}.
                </p>
              </>
            ) : (
              <>
                <p className="text-ink">No temperature recorded today.</p>
                <p className="mt-1 text-sm text-muted">
                  Yesterday: {day.yesterdayReading !== null ? formatTemp(day.yesterdayReading.tempC) + ' °C' : 'no reading'}.
                </p>
              </>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Fever-free streak</p>
            <div className="mt-2">
              <StreakLadder streak={streak} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {patient.status === 'ADMITTED'
                ? 'Discharge approval needs ' +
                  CONFIG.STREAK_DAYS_FOR_CURE +
                  ' fever-free days and a qualifying temperature today.'
                : patient.status === 'DISCHARGE_APPROVED'
                  ? 'Approved for discharge. Admin completes it.'
                  : 'The record is closed. The streak is shown for the record.'}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeading>Observations</SectionHeading>
        <div className="mt-3">
          <ObservationChart readings={readings} today={today} admittedDay={patient.admittedDay} />
        </div>
      </section>

      <PatientActions detail={detail.data} me={me} />

      <section className="mt-8">
        <SectionHeading>Activity log</SectionHeading>
        {auditNewestFirst.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No activity yet"
              body="Readings, visits, corrections and discharge decisions appear here."
            />
          </div>
        ) : (
          <ul className="mt-2">
            {auditNewestFirst.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </Frame>
  )
}
