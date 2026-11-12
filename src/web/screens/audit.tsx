// Audit log (/audit): append-only record of every clinical change (R32).
// Visible to the Head Doctor and Admin (audit.view); everyone else gets the
// plain restricted-area page. Newest first, plain ruled rows, filters by
// patient, actor and action. Data via api.getAudit per docs/API.md.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { can, formatDay } from '@/domain'
import type { AuditEntry } from '@/domain'
import { api, queryKeys, type AuditFilters } from '@/web/app/api'
import { useSession } from '@/web/app/session'
import {
  Button,
  EmptyState,
  Field,
  SectionHeading,
  SkeletonRows,
} from '@/web/components/ui'

/** Action codes are stable API values; the table shows sentence case. */
const ACTION_LABELS: Record<string, string> = {
  'patient.admitted': 'Patient admitted',
  'patient.record_death': 'Death recorded',
  'reading.recorded': 'Reading recorded',
  'reading.undone': 'Reading undone',
  'reading.corrected': 'Reading corrected',
  'reading.late_entry': 'Late entry',
  'reading.accepted_masked': 'Masked reading accepted',
  'visit.logged': 'Visit logged',
  'discharge.approved': 'Discharge approved',
  'discharge.revoked': 'Approval revoked',
  'discharge.completed': 'Discharge completed',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/\./g, ' ')
}

const ROLE_LABELS: Record<string, string> = {
  NURSE: 'Nurse',
  DOCTOR: 'Doctor',
  ADMIN: 'Admin',
  SYSTEM: 'System',
}

/** Audit times combine the workspace day with wall-clock time, so read the
 *  clock digits from the ISO string rather than converting to the device zone. */
function clockTime(at: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(at)
  return m ? `${m[1]}:${m[2]}` : ''
}

function Restricted() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-signage text-3xl font-bold tracking-tight">Audit log</h1>
      <p className="mt-3 text-muted">This area is for the Head Doctor and Admin.</p>
      <p className="mt-2 text-muted">
        Sign in as Dr. Neha Kulkarni or Priya Menon to read the audit trail.
      </p>
      <div className="mt-6">
        <Link to="/" className="text-focus underline underline-offset-2">
          Back to the ward board
        </Link>
      </div>
    </div>
  )
}

export function AuditScreen() {
  const { me, isLoading: sessionLoading } = useSession()

  const [patientInput, setPatientInput] = useState('')
  const [patient, setPatient] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')

  // Debounce the free-text patient filter so typing does not fire a request
  // per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setPatient(patientInput.trim()), 300)
    return () => clearTimeout(t)
  }, [patientInput])

  const allowed = me !== null && can(me.staff, 'audit.view')

  const optionsQ = useQuery({
    queryKey: ['audit', 'options'],
    queryFn: () => api.getAudit({ limit: 500 }),
    enabled: allowed,
    staleTime: 60_000,
  })

  const staffQ = useQuery({
    queryKey: queryKeys.staff,
    queryFn: api.getStaff,
    enabled: allowed,
    staleTime: 60_000,
  })

  // In-bed patients give names for the patient link; closed records fall back
  // to their id. The audit row itself is the source of truth.
  const wardQ = useQuery({
    queryKey: queryKeys.ward,
    queryFn: api.getWard,
    enabled: allowed,
    staleTime: 30_000,
  })

  const filters: AuditFilters = {
    ...(patient ? { patient } : {}),
    ...(actor ? { actor } : {}),
    ...(action ? { action } : {}),
    limit: 200,
  }

  const auditQ = useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: () => api.getAudit(filters),
    enabled: allowed,
    staleTime: 10_000,
  })

  const staffById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of staffQ.data?.staff ?? []) map.set(s.id, s.name)
    return map
  }, [staffQ.data])

  const patientById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of wardQ.data?.patients ?? []) map.set(p.id, p.name)
    return map
  }, [wardQ.data])

  const actionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of optionsQ.data?.entries ?? []) set.add(e.action)
    return [...set].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)))
  }, [optionsQ.data])

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <SkeletonRows rows={8} />
      </div>
    )
  }

  if (!allowed) return <Restricted />

  const entries: AuditEntry[] = auditQ.data?.entries ?? []
  const filtered = patient !== '' || actor !== '' || action !== ''

  function clearFilters() {
    setPatientInput('')
    setPatient('')
    setActor('')
    setAction('')
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header>
        <h1 className="font-signage text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 max-w-prose text-muted">
          The log lists every admission, reading, visit and discharge, newest first. Entries are
          append-only and cannot be edited.
        </p>
      </header>

      <section className="mt-8" aria-label="Audit filters">
        <SectionHeading>Filters</SectionHeading>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field label="Patient" hint="Name or patient ID.">
            <input
              type="search"
              value={patientInput}
              onChange={(e) => setPatientInput(e.target.value)}
              placeholder="e.g. Asha or p-008"
              className="h-11 w-full rounded-md border border-ink/30 bg-white px-3"
            />
          </Field>
          <Field label="Actor">
            <select
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="h-11 w-full rounded-md border border-ink/30 bg-white px-3"
            >
              <option value="">All staff</option>
              {(staffQ.data?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="SYSTEM">System</option>
            </select>
          </Field>
          <Field label="Action">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-11 w-full rounded-md border border-ink/30 bg-white px-3"
            >
              <option value="">All actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <div className="pb-0.5">
            <Button variant="secondary" onClick={clearFilters} disabled={!filtered && patientInput === ''}>
              Clear filters
            </Button>
          </div>
        </div>
        {optionsQ.isError && (
          <p className="mt-3 text-sm text-muted">
            The action list could not be loaded. Filters still work when the audit log loads.
          </p>
        )}
      </section>

      <section className="mt-8" aria-label="Audit entries">
        {auditQ.isPending ? (
          <SkeletonRows rows={8} />
        ) : auditQ.isError ? (
          <div>
            <EmptyState
              title="The audit log could not be loaded."
              body="Check the connection, then try again."
            />
            <div className="mt-4">
              <Button onClick={() => auditQ.refetch()}>Try again</Button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No entries match these filters."
            body={
              filtered
                ? 'Change the patient, actor or action filter, or clear them to see the whole log.'
                : 'No clinical changes have been recorded yet. Entries appear here as they happen.'
            }
          />
        ) : (
          <>
            <p className="mb-2 text-sm text-muted" aria-live="polite">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              {filtered ? ', filtered' : ''}
            </p>
            <div className="overflow-x-auto border-y border-ink/15">
              <table className="w-full min-w-[760px] text-left">
                <caption className="sr-only">
                  Audit log, newest first: time, actor, role, action, patient and detail.
                </caption>
                <thead>
                  <tr className="border-b border-ink/20 text-sm text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Time</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Actor</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Role</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Action</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Patient</th>
                    <th scope="col" className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-signage tabular-nums">
                        <span className="block">{clockTime(entry.at)}</span>
                        <span className="block text-sm text-muted">{formatDay(entry.day)}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {entry.actorId !== null
                          ? (staffById.get(entry.actorId) ?? entry.actorId)
                          : 'System'}
                      </td>
                      <td className="py-2.5 pr-4 text-muted">
                        {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                      </td>
                      <td className="py-2.5 pr-4">{actionLabel(entry.action)}</td>
                      <td className="py-2.5 pr-4">
                        {entry.patientId !== null ? (
                          <Link
                            to={`/patient/${entry.patientId}`}
                            className="text-focus underline underline-offset-2"
                          >
                            {patientById.get(entry.patientId) ?? entry.patientId}
                          </Link>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td className="max-w-md py-2.5 text-muted">
                        {entry.detail !== null && entry.detail !== '' ? entry.detail : 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
