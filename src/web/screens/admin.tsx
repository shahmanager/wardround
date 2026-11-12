// Admin: Beds and discharges (route /beds; PLAN section 6). Summary line,
// ready-to-discharge with R20 completion, eligible awaiting sign-off (R17),
// the ward map, admission per R24/R25, and the waitlist (R26).
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queryKeys } from '@/web/app/api'
import { Button, Chip, EmptyState, Field, Modal, SectionHeading, SkeletonRows, useToasts } from '@/web/components/ui'
import { BedTag } from '@/web/components/bed-tag'
import { WardMap } from '@/web/components/ward-map'
import type { WardMapBed } from '@/web/components/ward-map'
import { allBeds, dayDiff, formatDay } from '@/domain'
import type { Patient, Sex, WaitlistEntry } from '@/domain'

const bedOrder = new Map(allBeds().map((b, i) => [b, i] as const))
const byBedOrder = (a: string, b: string): number => (bedOrder.get(a) ?? 0) - (bedOrder.get(b) ?? 0)

const STATUS_LABEL: Record<Patient['status'], string> = {
  ADMITTED: 'Admitted',
  DISCHARGE_APPROVED: 'Discharge approved',
  DISCHARGED: 'Discharged',
  DECEASED: 'Deceased',
}

const SEX_LABEL: Record<Sex, string> = { F: 'Female', M: 'Male', X: 'Other' }

/** The API contract throws ApiClientError { code, message }; read it without coupling to its class. */
function errorInfo(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: unknown; message?: unknown } | null
  if (e && typeof e === 'object' && typeof e.message === 'string') {
    return { code: typeof e.code === 'string' ? e.code : null, message: e.message }
  }
  return { code: null, message: 'That did not save. Check the details and try again.' }
}

// ---- admit form -------------------------------------------------------------

interface AdmitPrefill {
  bed?: string
  entry?: WaitlistEntry
}

interface AdmitModalProps {
  prefill: AdmitPrefill
  freeBeds: string[]
  onClose: () => void
}

function AdmitModal({ prefill, freeBeds, onClose }: AdmitModalProps) {
  const { push } = useToasts()
  const queryClient = useQueryClient()
  const entry = prefill.entry

  const [name, setName] = useState(entry?.name ?? '')
  const [age, setAge] = useState(entry ? String(entry.age) : '')
  const [sex, setSex] = useState<Sex | ''>(entry?.sex ?? '')
  const [bed, setBed] = useState(prefill.bed ?? '')
  const [formError, setFormError] = useState<{ code: string | null; message: string } | null>(null)

  const admit = useMutation({ mutationFn: api.admitPatient })

  const noBeds = freeBeds.length === 0

  function goToReadyToDischarge() {
    onClose()
    const el = document.getElementById('ready-to-discharge')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }

  async function submit(confirmDuplicate: boolean) {
    setFormError(null)
    const ageNum = Number(age)
    if (!entry && !name.trim()) {
      setFormError({ code: null, message: 'Enter the patient\u2019s name.' })
      return
    }
    if (!entry && (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120)) {
      setFormError({ code: null, message: 'Enter an age from 0 to 120.' })
      return
    }
    if (!entry && !sex) {
      setFormError({ code: null, message: 'Choose the patient\u2019s sex.' })
      return
    }
    if (!bed) {
      setFormError({ code: null, message: 'Choose a free bed.' })
      return
    }
    try {
      const { patient } = await admit.mutateAsync({
        name: entry ? entry.name : name.trim(),
        age: entry ? entry.age : ageNum,
        sex: entry ? entry.sex : (sex as Sex),
        bed,
        confirmDuplicate,
        fromWaitlistId: entry?.id,
      })
      push({ tone: 'ok', message: `Admitted ${patient.name} to bed ${bed}` })
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.beds })
      onClose()
    } catch (err) {
      setFormError(errorInfo(err))
    }
  }

  const r24 = formError?.code === 'R24_NO_BEDS' || (noBeds && formError === null)
  const duplicate = formError?.code === 'R25_DUPLICATE'

  return (
    <Modal open title={entry ? 'Admit from waitlist' : 'Admit patient'} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(false)
        }}
      >
        {entry ? (
          <div className="text-ink">
            <p className="font-signage text-lg font-semibold">{entry.name}</p>
            <p className="text-sm text-muted">
              {entry.age} years, {SEX_LABEL[entry.sex]}, added {formatDay(entry.addedDay)}. Only the bed is chosen.
            </p>
          </div>
        ) : (
          <>
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setFormError(null)
                }}
                className="h-11 w-full rounded-md border border-ink/25 bg-white px-3"
                autoComplete="off"
                required
              />
            </Field>
            <div className="flex gap-4">
              <Field label="Age" hint="Years, 0 to 120.">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  step={1}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value)
                    setFormError(null)
                  }}
                  className="h-11 w-28 rounded-md border border-ink/25 bg-white px-3"
                  required
                />
              </Field>
              <Field label="Sex">
                <select
                  value={sex}
                  onChange={(e) => {
                    setSex(e.target.value as Sex | '')
                    setFormError(null)
                  }}
                  className="h-11 w-40 rounded-md border border-ink/25 bg-white px-3"
                  required
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                  <option value="X">Other</option>
                </select>
              </Field>
            </div>
          </>
        )}

        <Field label="Bed" hint="Only free beds are listed.">
          <select
            value={bed}
            onChange={(e) => {
              setBed(e.target.value)
              setFormError(null)
            }}
            className="h-11 w-48 rounded-md border border-ink/25 bg-white px-3"
            required
          >
            <option value="" disabled>
              Choose a bed…
            </option>
            {freeBeds.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>

        {r24 && (
          <div className="rounded-md bg-signal-tint p-4 text-signal" role="status">
            <p>No free beds. Complete a pending discharge to free one.</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={goToReadyToDischarge}>
                Go to Ready to discharge
              </Button>
            </div>
          </div>
        )}

        {duplicate && formError && (
          <div className="rounded-md bg-signal-tint p-4 text-signal" role="alert">
            <p>{formError.message}</p>
            <p className="mt-1 text-sm">Possible duplicate — confirm?</p>
            <div className="mt-3">
              <Button loading={admit.isPending} onClick={() => void submit(true)}>
                Yes, admit anyway
              </Button>
            </div>
          </div>
        )}

        {formError && !duplicate && !r24 && <p className="text-mercury">{formError.message}</p>}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={admit.isPending} disabled={noBeds}>
            {entry ? 'Admit from waitlist' : 'Admit patient'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- screen -----------------------------------------------------------------

export function AdminScreen() {
  const { push } = useToasts()
  const queryClient = useQueryClient()

  const wardQ = useQuery({ queryKey: queryKeys.ward, queryFn: () => api.getWard() })
  const bedsQ = useQuery({ queryKey: queryKeys.beds, queryFn: () => api.getBeds() })

  const [dischargeTarget, setDischargeTarget] = useState<Patient | null>(null)
  const [admitPrefill, setAdmitPrefill] = useState<AdmitPrefill | null>(null)
  // The bed freed by the last completed discharge, for the ward map's walk-out.
  const [justFreed, setJustFreed] = useState<{ bed: string } | null>(null)

  // The prop only needs to live long enough for the figure to leave; clearing
  // it keeps a later remount from replaying the walk.
  useEffect(() => {
    if (!justFreed) return
    const timer = setTimeout(() => setJustFreed(null), 1800)
    return () => clearTimeout(timer)
  }, [justFreed])

  const completeDischarge = useMutation({
    mutationFn: (t: { id: string; name: string; bed: string }) => api.completeDischarge(t.id).then(() => t),
    onSuccess: (t) => {
      push({ tone: 'ok', message: `Discharge completed — bed ${t.bed} is free` })
      setDischargeTarget(null)
      if (t.bed) setJustFreed({ bed: t.bed })
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.beds })
    },
    onError: (err) => {
      push({ tone: 'error', message: errorInfo(err).message })
      setDischargeTarget(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward })
      void queryClient.invalidateQueries({ queryKey: queryKeys.beds })
    },
  })

  if (wardQ.isPending || bedsQ.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <SkeletonRows rows={8} />
      </div>
    )
  }

  if (wardQ.isError || bedsQ.isError) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <EmptyState
          title="The ward data could not be loaded."
          body="Check the connection and try again."
        />
        <div className="mt-4">
          <Button
            onClick={() => {
              void wardQ.refetch()
              void bedsQ.refetch()
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const ward = wardQ.data
  const beds = bedsQ.data
  const currentDay = ward.currentDay

  const patients = [...ward.patients].sort((a, b) => byBedOrder(a.bed ?? '', b.bed ?? ''))
  const readyToDischarge = patients.filter((p) => p.status === 'DISCHARGE_APPROVED')
  const awaitingSignOff = patients.filter((p) => p.status === 'ADMITTED' && p.day.eligible)
  const freeBeds = [...beds.freeBeds].sort(byBedOrder)

  const mapBeds: WardMapBed[] = allBeds().map((bed) => {
    if (beds.freeBeds.includes(bed)) return { bed, state: 'free' }
    const holder = beds.occupiedBeds.find((o) => o.bed === bed)
    if (!holder) return { bed, state: 'free' }
    return holder.patient.status === 'DISCHARGE_APPROVED'
      ? { bed, state: 'ready', patientName: holder.patient.name }
      : { bed, state: 'occupied', patientName: holder.patient.name }
  })

  const waitlist = [...beds.waitlist].sort((a, b) => a.position - b.position)
  const longestWait = waitlist.reduce((max, e) => Math.max(max, dayDiff(e.addedDay, currentDay)), 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-signage text-3xl font-bold tracking-tight">Beds and discharges</h1>
          <p className="mt-1 text-lg">
            {ward.occupied} of {ward.capacity} beds occupied, {readyToDischarge.length} ready to discharge
          </p>
        </div>
        <Button size="lg" onClick={() => setAdmitPrefill({})}>
          Admit patient
        </Button>
      </header>

      {/* Section 1: R20/R21 */}
      <section id="ready-to-discharge" tabIndex={-1} className="mt-10 scroll-mt-4 focus:outline-none">
        <SectionHeading>Ready to discharge</SectionHeading>
        <p className="text-sm text-muted">Doctor approved. Completing the discharge frees the bed (R20).</p>
        {readyToDischarge.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No patients are ready to discharge yet."
              body="Patients appear here once a doctor approves their discharge."
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
            {readyToDischarge.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <BedTag bed={p.bed ?? ''} />
                <span className="min-w-48 font-medium">{p.name}</span>
                {p.day.delayDays > 0 && (
                  <Chip tone="amber">
                    Discharge delayed {p.day.delayDays} {p.day.delayDays === 1 ? 'day' : 'days'}
                  </Chip>
                )}
                <span className="grow" />
                <Button onClick={() => setDischargeTarget(p)}>Complete discharge</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 2: R17 — read-only */}
      <section className="mt-10">
        <SectionHeading>Eligible, awaiting doctor sign-off</SectionHeading>
        <p className="text-sm text-muted">A doctor signs off before admin can discharge.</p>
        {awaitingSignOff.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No patients are awaiting doctor sign-off." body="Newly eligible patients appear here automatically (R17)." />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
            {awaitingSignOff.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <BedTag bed={p.bed ?? ''} />
                <span className="min-w-48 font-medium">{p.name}</span>
                <span className="text-sm text-muted">
                  Eligible since {p.firstEligibleDay ? formatDay(p.firstEligibleDay) : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 3: ward map */}
      <section className="mt-10">
        <SectionHeading>Ward map</SectionHeading>
        <p className="text-sm text-muted">Select a free bed to start an admission with that bed preselected.</p>
        <div className="mt-4">
          <WardMap beds={mapBeds} onFreeBedClick={(bed) => setAdmitPrefill({ bed })} justFreed={justFreed} />
        </div>
      </section>

      {/* Waitlist: R26 */}
      <section className="mt-10">
        <SectionHeading>Waitlist</SectionHeading>
        <p className="text-sm text-muted">
          {waitlist.length === 0
            ? 'Admissions from the waitlist pre-fill the patient and ask only for the bed (R26).'
            : `${waitlist.length} waiting · longest wait ${longestWait} ${longestWait === 1 ? 'day' : 'days'}`}
        </p>
        {waitlist.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="The waitlist is empty." body="Patients waiting for a bed appear here in arrival order." />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
            {waitlist.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="w-8 text-right font-signage text-lg font-semibold">{e.position}</span>
                <span className="min-w-48 font-medium">{e.name}</span>
                <span className="text-sm text-muted">
                  {e.age} years, {SEX_LABEL[e.sex]}
                </span>
                <span className="text-sm text-muted">Added {formatDay(e.addedDay)}</span>
                <span className="grow" />
                <Button variant="secondary" onClick={() => setAdmitPrefill({ entry: e })}>
                  Admit from waitlist
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Occupied beds: ops.view context */}
      <section className="mt-10">
        <SectionHeading>Occupied beds</SectionHeading>
        <p className="text-sm text-muted">Every patient in a bed right now.</p>
        {beds.occupiedBeds.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No patients are in beds." body="Admit a patient from the waitlist or the Admit patient form." />
          </div>
        ) : (
          <table className="mt-2 w-full max-w-3xl text-left">
            <thead>
              <tr className="border-b border-ink/20 text-sm text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Bed</th>
                <th scope="col" className="py-2 pr-4 font-medium">Patient</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {[...beds.occupiedBeds].sort((a, b) => byBedOrder(a.bed, b.bed)).map((o) => (
                <tr key={o.bed}>
                  <td className="py-2.5 pr-4"><BedTag bed={o.bed} size="sm" /></td>
                  <td className="py-2.5 pr-4 font-medium">{o.patient.name}</td>
                  <td className="py-2.5 pr-4">
                    {o.patient.status === 'DISCHARGE_APPROVED' ? (
                      <Chip tone="done">Discharge approved</Chip>
                    ) : (
                      <span>{STATUS_LABEL[o.patient.status]}</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <Link to={`/patient/${o.patient.id}`} className="text-focus underline underline-offset-2">
                      View record
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Confirm discharge: names patient, bed and the consequence (R20) */}
      <Modal open={dischargeTarget !== null} title="Complete discharge" onClose={() => setDischargeTarget(null)}>
        {dischargeTarget && (
          <div>
            <p>
              Discharge <strong>{dischargeTarget.name}</strong> from bed {dischargeTarget.bed}?
            </p>
            <p className="mt-2 text-muted">The bed is freed and the outcome is recorded as cured. This cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" onClick={() => setDischargeTarget(null)}>
                Cancel
              </Button>
              <Button
                loading={completeDischarge.isPending}
                onClick={() =>
                  completeDischarge.mutate({
                    id: dischargeTarget.id,
                    name: dischargeTarget.name,
                    bed: dischargeTarget.bed ?? '',
                  })
                }
              >
                Complete discharge
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {admitPrefill && (
        <AdmitModal prefill={admitPrefill} freeBeds={freeBeds} onClose={() => setAdmitPrefill(null)} />
      )}
    </div>
  )
}
