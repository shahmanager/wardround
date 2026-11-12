// Dashboard: the head doctor's management view (route /dashboard; R27–R30).
// Ruled rows and quiet figures; words as well as styling carry the status, and
// every figure shows its numerator and denominator. Nothing is invented.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CONFIG, formatDay, readingQualifies } from '@/domain'
import { api, queryKeys, type DashboardResponse, type WardResponse } from '@/web/app/api'
import { BedTag } from '@/web/components/bed-tag'
import { Button, Chip, EmptyState, SectionHeading, SkeletonRows, StatTile } from '@/web/components/ui'

const BENCHMARK_PCT = Math.round(CONFIG.MORTALITY_BENCHMARK * 1000) / 10

const oneDecimal = (value: number): string => value.toFixed(1)

/** Width of a share of the whole, clamped so a stray figure cannot overflow. */
const share = (part: number, whole: number): string =>
  whole <= 0 ? '0%' : `${Math.min(100, Math.max(0, (part / whole) * 100))}%`

/**
 * R27/R28: the benchmark sentence. The comparison word is always present;
 * only an above-benchmark figure gains the tinted highlight, so the meaning
 * never rests on colour alone.
 */
function mortalitySentence(m: DashboardResponse['mortality']): ReactNode {
  if (m.rate === null) {
    return <>No closed cases yet — the {BENCHMARK_PCT}% comparison starts when outcomes are known.</>
  }
  const percent = oneDecimal(m.rate * 100)
  const comparison =
    m.rate > CONFIG.MORTALITY_BENCHMARK ? 'above' : m.rate < CONFIG.MORTALITY_BENCHMARK ? 'below' : 'at'
  const figure =
    comparison === 'above' ? (
      <strong className="bg-signal-tint px-1 font-bold text-signal">{percent}%</strong>
    ) : (
      <strong className="font-semibold text-ink">{percent}%</strong>
    )
  return (
    <>
      Mortality is {figure}, {comparison} the {BENCHMARK_PCT}% benchmark ({m.deaths} of {m.closed}{' '}
      closed cases).
    </>
  )
}

/** A bullet chart: the value as a bar, the benchmark as a ruled tick. */
function BulletChart({ percent }: { percent: number | null }) {
  const scale = Math.max(25, Math.ceil(((percent ?? 0) * 1.25) / 5) * 5)
  const valueWidth = percent === null ? '0%' : share(percent, scale)
  const benchmarkLeft = share(BENCHMARK_PCT, scale)
  return (
    <div className="mt-5">
      <div className="relative h-9 rounded-sm bg-ink/[0.06]" role="img" aria-label={
        percent === null
          ? `No mortality figure yet. The benchmark is ${BENCHMARK_PCT}%.`
          : `Mortality ${oneDecimal(percent)}% against a ${BENCHMARK_PCT}% benchmark.`
      }>
        <div className="absolute inset-y-1.5 left-0 rounded-sm bg-ink" style={{ width: valueWidth }} />
        <div className="absolute inset-y-0 border-l-2 border-dashed border-mercury" style={{ left: benchmarkLeft }} />
      </div>
      <div className="relative mt-1 h-5 text-sm text-muted">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: benchmarkLeft }}>
          {BENCHMARK_PCT}% benchmark
        </span>
        <span className="absolute right-0">{scale}%</span>
      </div>
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading>{title}</SectionHeading>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** A labelled process figure with a fill bar; omit `whole` for a bare count. */
function ProcessRow({
  label,
  count,
  whole,
  detail,
}: {
  label: string
  count: number
  whole?: number
  detail?: string
}) {
  const percent = whole !== undefined && whole > 0 ? (count / whole) * 100 : 0
  return (
    <div className="border-b border-ink/10 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink">{label}</dt>
        <dd className="font-semibold tabular-nums text-ink">
          {whole === undefined ? count : `${count} / ${whole}`}
        </dd>
      </div>
      {whole !== undefined && (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-sm bg-ink/10" aria-hidden="true">
          <div className="bg-ink" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
      {detail !== undefined && <p className="mt-1 text-sm text-muted">{detail}</p>}
    </div>
  )
}

function PendingRow({ patient }: { patient: WardResponse['patients'][number] }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <BedTag bed={patient.bed ?? ''} size="sm" />
        <span className="truncate font-medium text-ink">{patient.name}</span>
        <span className="text-sm text-muted">Age {patient.age}</span>
      </div>
      <Link
        to={`/patient/${patient.id}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-focus underline"
      >
        Open record
      </Link>
    </li>
  )
}

export function DashboardScreen() {
  const dashboardQ = useQuery({ queryKey: queryKeys.dashboard, queryFn: api.getDashboard })
  const wardQ = useQuery({ queryKey: queryKeys.ward, queryFn: () => api.getWard() })

  if (dashboardQ.isPending) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SkeletonRows rows={8} />
      </div>
    )
  }

  if (dashboardQ.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          title="The dashboard could not be loaded."
          body="Check the connection and try again."
        />
        <div className="mt-4">
          <Button onClick={() => void dashboardQ.refetch()}>Try again</Button>
        </div>
      </div>
    )
  }

  const data = dashboardQ.data
  const { mortality, compliance, delay, occupancy, avgLengthOfStay, exceptions7d, closedCases, outcomes } = data
  const patients = wardQ.data?.patients ?? []
  const pending = patients
    .filter((p) => p.day.todayReading === null && p.status === 'ADMITTED')
    .sort((a, b) => (a.bed ?? '').localeCompare(b.bed ?? ''))
  const approved = patients
    .filter((p) => p.status === 'DISCHARGE_APPROVED')
    .sort((a, b) => b.day.delayDays - a.day.delayDays)
  const admittedCount = patients.filter((p) => p.status === 'ADMITTED').length
  const freeBeds = Math.max(0, occupancy.capacity - occupancy.occupied)
  const measuredPct = compliance.bedCount > 0 ? (compliance.measuredCount / compliance.bedCount) * 100 : null
  const successRate = closedCases > 0 ? outcomes.cured / closedCases : null
  const bedsLikelyFree = patients.filter(
    (p) =>
      p.status === 'ADMITTED' &&
      p.day.streak === CONFIG.STREAK_DAYS_FOR_CURE - 1 &&
      p.day.todayReading !== null &&
      readingQualifies(p.day.todayReading),
  ).length

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-4">
        <div>
          <p className="font-signage text-sm font-semibold uppercase tracking-wide text-muted">
            Head doctor
          </p>
          <h1 className="mt-1 font-signage text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <p className="text-muted">
          {wardQ.data ? `${formatDay(wardQ.data.currentDay)}, ` : ''}
          {compliance.measuredCount} of {compliance.bedCount} measured, {compliance.visitCount} visited today.
        </p>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile
          label="Mortality"
          value={mortality.rate === null ? '—' : `${oneDecimal(mortality.rate * 100)}%`}
          sub={`Benchmark ${BENCHMARK_PCT}%`}
        />
        <StatTile
          label="Success rate"
          value={successRate === null ? '—' : `${oneDecimal(successRate * 100)}%`}
          sub="cured of closed cases"
        />
        <StatTile
          label="Compliance"
          value={`${compliance.measuredCount} of ${compliance.bedCount}`}
          sub="measured today"
        />
        <StatTile label="Occupancy" value={`${occupancy.occupied} of ${occupancy.capacity}`} sub="beds in use" />
        <StatTile label="Discharge queue" value={delay.delayedNow} sub="approved, waiting for admin" />
      </dl>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-10">
          <Section title="Mortality">
            <p className="text-lg text-ink">{mortalitySentence(mortality)}</p>
            <BulletChart percent={mortality.rate === null ? null : mortality.rate * 100} />
            {mortality.closed > 0 ? (
              <div className="mt-6">
                <div className="flex h-6 overflow-hidden rounded-sm border border-ink/15">
                  <div className="bg-mercury" style={{ width: share(outcomes.deaths, mortality.closed) }} />
                  <div className="bg-done" style={{ width: share(outcomes.cured, mortality.closed) }} />
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Deaths</dt>
                    <dd className="font-semibold tabular-nums text-ink">{outcomes.deaths}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cured</dt>
                    <dd className="font-semibold tabular-nums text-ink">{outcomes.cured}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Closed cases</dt>
                    <dd className="font-semibold tabular-nums text-ink">{closedCases}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No case has closed yet. Outcomes appear here once a discharge is completed or a death is
                recorded.
              </p>
            )}
          </Section>

          <Section
            title="Today's round"
            action={
              <Link to="/audit" className="text-sm font-medium text-focus underline">
                Audit log
              </Link>
            }
          >
            <div className="flex h-6 overflow-hidden rounded-sm border border-ink/15">
              <div className="bg-ink" style={{ width: share(compliance.measuredCount, compliance.bedCount) }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {compliance.measuredCount} of {compliance.bedCount} patients have a temperature today
              {measuredPct === null ? '.' : ` (${Math.round(measuredPct)}%).`}{' '}
              {compliance.visitCount} visits logged, {compliance.visitsAfterTempCount} of them after the
              temperature was recorded.
            </p>
            {wardQ.isPending ? (
              <p className="mt-4 text-sm text-muted">Loading who is still waiting…</p>
            ) : pending.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Every patient in a bed has a temperature today.</p>
            ) : (
              <>
                <p className="mt-5 text-sm font-semibold text-ink">
                  {pending.length === 1
                    ? '1 patient is still waiting for a temperature.'
                    : `${pending.length} patients are still waiting for a temperature.`}
                </p>
                <ul className="mt-1">
                  {pending.slice(0, 12).map((p) => (
                    <PendingRow key={p.id} patient={p} />
                  ))}
                </ul>
                {pending.length > 12 && (
                  <p className="mt-2 text-sm text-muted">And {pending.length - 12} more.</p>
                )}
              </>
            )}
          </Section>

          <Section title="Today's process">
            <dl>
              <ProcessRow
                label="Temperatures taken"
                count={compliance.measuredCount}
                whole={compliance.bedCount}
                detail="Nurses record one temperature per patient per day."
              />
              <ProcessRow
                label="Doctor visits done"
                count={compliance.visitCount}
                whole={compliance.bedCount}
                detail="A visit unlocks once today's temperature is recorded."
              />
              <ProcessRow
                label="Visits after the temperature"
                count={compliance.visitsAfterTempCount}
                whole={compliance.visitCount}
                detail="The rule keeps visits after the reading; a visit before it is blocked."
              />
              <ProcessRow
                label="Awaiting discharge"
                count={delay.delayedNow}
                detail="Approved by a doctor, waiting for an admin to free the bed."
              />
              <ProcessRow
                label="Beds likely free in 24h"
                count={bedsLikelyFree}
                detail="Patients on their second fever-free day with a qualifying reading today."
              />
            </dl>
          </Section>
        </div>

        <div className="flex flex-col gap-10">
          <Section title="Beds">
            <div className="flex h-6 overflow-hidden rounded-sm border border-ink/15">
              <div className="bg-ink" style={{ width: share(admittedCount, occupancy.capacity) }} />
              <div className="bg-signal" style={{ width: share(approved.length, occupancy.capacity) }} />
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-ink" />
                  Admitted
                </dt>
                <dd className="font-semibold tabular-nums text-ink">{admittedCount}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-signal" />
                  Approved, waiting for admin
                </dt>
                <dd className="font-semibold tabular-nums text-ink">{approved.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm border border-ink/25 bg-white" />
                  Free
                </dt>
                <dd className="font-semibold tabular-nums text-ink">{freeBeds}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-muted">
              {occupancy.occupied} of {occupancy.capacity} beds occupied.
            </p>
          </Section>

          <Section title="Discharges">
            {approved.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-ink">
                  {approved.length === 1
                    ? '1 approved discharge is waiting for admin.'
                    : `${approved.length} approved discharges are waiting for admin.`}
                </p>
                <ul className="mt-1">
                  {approved.slice(0, 8).map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 py-2 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <BedTag bed={p.bed ?? ''} size="sm" />
                        <span className="truncate font-medium text-ink">{p.name}</span>
                      </div>
                      <span className="text-sm text-muted">
                        {p.day.delayDays === 0
                          ? 'Approved today'
                          : p.day.delayDays === 1
                            ? 'Waiting 1 day'
                            : `Waiting ${p.day.delayDays} days`}
                      </span>
                    </li>
                  ))}
                </ul>
                {approved.length > 8 && (
                  <p className="mt-2 text-sm text-muted">And {approved.length - 8} more.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                No discharge is waiting for admin. Approvals appear here the moment a doctor signs one.
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink/10 pt-4 text-sm">
              <div>
                <dt className="text-muted">Average delay</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {delay.avgDelayDays === null ? '—' : `${oneDecimal(delay.avgDelayDays)} days`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Bed days held</dt>
                <dd className="font-semibold tabular-nums text-ink">{delay.bedDaysHeld}</dd>
              </div>
              <div>
                <dt className="text-muted">Average length of stay</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {avgLengthOfStay === null ? '—' : `${oneDecimal(avgLengthOfStay)} days`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Closed cases</dt>
                <dd className="font-semibold tabular-nums text-ink">{closedCases}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Exceptions, 7 days">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Doctor readings outside the round</dt>
                <dd className="font-semibold tabular-nums text-ink">{exceptions7d.doctorReadings}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Late entries after the day closed</dt>
                <dd className="font-semibold tabular-nums text-ink">{exceptions7d.lateEntries}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-muted">
              Doctor readings and late entries are listed in the audit log.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone={closedCases > 0 ? 'done' : 'neutral'}>
                {outcomes.deaths} deaths, {outcomes.cured} cured
              </Chip>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
