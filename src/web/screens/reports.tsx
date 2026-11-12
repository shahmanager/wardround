// Reports: the head doctor's management view (route /reports). Same visual
// language as DashboardScreen — ruled sections, sentence case, tabular figures,
// no emoji or gradients. Every number shown comes from GET /api/reports; the
// chart carries no meaning that its text summary does not.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CONFIG, formatDay } from '@/domain'
import { ApiClientError, api, queryKeys, type ReportsResponse, type ReportsSeriesPoint } from '@/web/app/api'
import { Button, EmptyState, SectionHeading, SkeletonRows, StatTile } from '@/web/components/ui'

const BENCHMARK_PCT = Math.round(CONFIG.MORTALITY_BENCHMARK * 1000) / 10
const TARGET_SUCCESS_PCT = 85

const oneDecimal = (value: number): string => value.toFixed(1)
const percent = (rate: number | null): string => (rate === null ? '—' : `${oneDecimal(rate * 100)}%`)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Mortality tone in words, so the meaning never rests on colour alone. */
function mortalityTone(rate: number | null): string {
  if (rate === null) return 'no closed cases yet'
  return rate > CONFIG.MORTALITY_BENCHMARK ? 'above benchmark' : 'within benchmark'
}

function last7Sentence(m: ReportsResponse['mortalityLast7']): string {
  if (m.closed === 0) return 'Last 7 days: no closed cases, so no mortality rate yet.'
  const sentence = `Last 7 days: ${m.deaths} of ${m.closed} closed cases died (${percent(m.rate)}).`
  return m.closed < 5 ? `${sentence} Fewer than 5 closed cases, so treat this with care.` : sentence
}

interface BarSeries {
  label: string
  className: string
  value: (point: ReportsSeriesPoint) => number
}

/**
 * One grouped-bar panel, scaled to the tallest bar in the panel so a small
 * series (admissions) stays visible next to a large one (readings). Bars are
 * decorative: the figure's visually hidden list carries the same numbers.
 */
function GroupedBarPanel({ series, bars }: { series: ReportsSeriesPoint[]; bars: BarSeries[] }) {
  const max = Math.max(1, ...series.map((point) => Math.max(...bars.map((bar) => bar.value(point)))))
  const totals = bars.map((bar) => series.reduce((sum, point) => sum + bar.value(point), 0))
  const showLabel = (index: number): boolean =>
    series.length <= 14 || index % 3 === 0 || index === series.length - 1

  return (
    <div>
      <div className="flex h-40 items-end border-b border-ink/15" aria-hidden="true">
        {series.map((point) => (
          <div key={point.day} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px">
            {bars.map((bar) => (
              <span
                key={bar.label}
                className={`min-w-0 flex-1 rounded-t-sm ${bar.className}`}
                style={{ height: `${Math.round((bar.value(point) / max) * 100)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex" aria-hidden="true">
        {series.map((point, index) => (
          <div
            key={point.day}
            className="min-w-0 flex-1 text-center text-[10px] leading-none tabular-nums text-muted"
          >
            {showLabel(index) ? point.day.slice(8, 10) : ''}
          </div>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {bars.map((bar, index) => (
          <li key={bar.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${bar.className}`} />
            {bar.label} <span className="font-semibold tabular-nums text-ink">{totals[index] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DailyFlow({ series, currentDay }: { series: ReportsSeriesPoint[]; currentDay: string }) {
  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Daily flow for the last {series.length} days, ending {formatDay(currentDay)}. The same
        figures follow as text.
      </figcaption>
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Readings and visits</p>
          <GroupedBarPanel
            series={series}
            bars={[
              { label: 'Measured', className: 'bg-ink', value: (point) => point.measured },
              { label: 'Visits', className: 'bg-muted', value: (point) => point.visits },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Admissions and discharges</p>
          <GroupedBarPanel
            series={series}
            bars={[
              { label: 'Admitted', className: 'bg-done', value: (point) => point.admitted },
              { label: 'Discharged', className: 'bg-signal', value: (point) => point.discharged },
            ]}
          />
        </div>
      </div>
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.day}>
            {formatDay(point.day)}: {point.measured} measured, {point.visits} visits, {point.admitted}{' '}
            admitted, {point.discharged} discharged, {point.died} died, {point.closed} closed.
          </li>
        ))}
      </ul>
    </figure>
  )
}

interface RollingPoint {
  day: string
  rate: number | null
  closed: number
  deaths: number
}

/** Seven-day rolling mortality: deaths and closed cases summed within each window. */
function rollingMortality(series: ReportsSeriesPoint[]): RollingPoint[] {
  return series.map((point, index) => {
    const window = series.slice(Math.max(0, index - 6), index + 1)
    const closed = window.reduce((sum, day) => sum + day.closed, 0)
    const deaths = window.reduce((sum, day) => sum + day.died, 0)
    return { day: point.day, rate: closed === 0 ? null : deaths / closed, closed, deaths }
  })
}

function RollingMortalityChart({ series }: { series: ReportsSeriesPoint[] }) {
  const points = rollingMortality(series)
  // A fixed 0–40% scale keeps early windows with one or two closed cases from
  // flattening the recent run; anything above 40% is clamped to the top edge.
  const max = 0.4
  const width = 100
  const height = 40
  const pad = 2
  const x = (index: number): number => (points.length <= 1 ? 0 : (index / (points.length - 1)) * width)
  const y = (rate: number): number =>
    height - pad - (Math.min(rate, max) / max) * (height - pad * 2)
  let drawing = false
  const path = points
    .map((point, index) => {
      if (point.rate === null) return ''
      const command = `${drawing ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.rate).toFixed(2)}`
      drawing = true
      return command
    })
    .filter((command) => command !== '')
    .join(' ')

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Rolling 7-day mortality against the 15% benchmark over the last {series.length} days. The
        same figures follow as text.
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-40 w-full"
          aria-hidden="true"
        >
          <line
            x1="0"
            x2={width}
            y1={y(CONFIG.MORTALITY_BENCHMARK)}
            y2={y(CONFIG.MORTALITY_BENCHMARK)}
            stroke="currentColor"
            strokeWidth="0.6"
            strokeDasharray="2 1.5"
            className="text-signal"
            vectorEffect="non-scaling-stroke"
          />
          {path !== '' && (
            <g>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-ink"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point, index) =>
                point.rate === null ? null : (
                  <circle
                    key={point.day}
                    cx={x(index)}
                    cy={y(point.rate)}
                    r="0.9"
                    fill="currentColor"
                    className="text-ink"
                  />
                ),
              )}
            </g>
          )}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] leading-none text-muted" aria-hidden="true">
          <span>{formatDay(points[0]?.day ?? series[0]?.day ?? '')}</span>
          <span>dashed: {BENCHMARK_PCT}% benchmark</span>
          <span>{formatDay(points.at(-1)?.day ?? series.at(-1)?.day ?? '')}</span>
        </div>
      </div>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.day}>
            {formatDay(point.day)}: {last7Sentence({ deaths: point.deaths, closed: point.closed, rate: point.rate })}
          </li>
        ))}
      </ul>
    </figure>
  )
}

function OutcomeBar({ outcomes, closedCases }: { outcomes: { deaths: number; cured: number }; closedCases: number }) {
  const deathShare = closedCases === 0 ? 0 : (outcomes.deaths / closedCases) * 100
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden bg-gauze" aria-hidden="true">
        <span className="bg-mercury" style={{ width: `${deathShare}%` }} />
        <span className="flex-1 bg-done" />
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <div>
          <dt className="text-muted">Died</dt>
          <dd className="font-signage text-xl font-semibold tabular-nums text-ink">{outcomes.deaths}</dd>
        </div>
        <div>
          <dt className="text-muted">Cured</dt>
          <dd className="font-signage text-xl font-semibold tabular-nums text-ink">{outcomes.cured}</dd>
        </div>
        <div>
          <dt className="text-muted">Closed cases</dt>
          <dd className="font-signage text-xl font-semibold tabular-nums text-ink">{closedCases}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-muted">
        Mortality counts closed cases only: cured plus died. Patients still in treatment are never
        in the rate.
      </p>
    </div>
  )
}

function ProcessRow({ label, children }: { label: string; children: ReactNode }) {  return (
    <div className="flex flex-col gap-0.5 border-b border-ink/10 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink tabular-nums">{children}</dd>
    </div>
  )
}

export function ReportsScreen() {
  const [days, setDays] = useState<14 | 30>(14)
  const reportsQ = useQuery<ReportsResponse>({
    queryKey: queryKeys.reports(days),
    queryFn: () => api.getReports(days),
    retry: false,
  })

  if (reportsQ.isPending) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SkeletonRows rows={8} />
      </div>
    )
  }

  if (reportsQ.isError) {
    const message =
      reportsQ.error instanceof ApiClientError
        ? reportsQ.error.message
        : 'Check the connection and try again.'
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState title="The report could not be loaded." body={message} />
        <div className="mt-4">
          <Button onClick={() => void reportsQ.refetch()}>Try again</Button>
        </div>
      </div>
    )
  }

  const data = reportsQ.data
  const today = data.today

  const downloadCsv = (): void => {
    const header = ['day', 'measured', 'visits', 'admitted', 'discharged', 'died', 'closed']
    const rows = data.series.map((point) =>
      [
        point.day,
        point.measured,
        point.visits,
        point.admitted,
        point.discharged,
        point.died,
        point.closed,
      ].join(','),
    )
    const csv = `${header.join(',')}\n${rows.join('\n')}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `wardround-reports-${days}d.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-4">
        <div>
          <p className="font-signage text-sm font-semibold uppercase tracking-wide text-muted">
            Head doctor
          </p>
          <h1 className="mt-1 font-signage text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 max-w-xl text-muted">
            Built from the ward&apos;s own readings, visits and outcomes.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-sm text-muted">As of {formatDay(data.currentDay)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2" role="group" aria-label="Report period">
              {[14, 30].map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={days === option}
                  onClick={() => setDays(option === 30 ? 30 : 14)}
                  className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold transition-colors duration-150 ${
                    days === option
                      ? 'border-ink bg-ink text-gauze'
                      : 'border-ink/30 bg-white text-ink hover:border-ink'
                  }`}
                >
                  {option} days
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={downloadCsv}>
              Download CSV
            </Button>
          </div>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Closed cases"
          value={data.closedCases}
          sub={`${data.outcomes.deaths} died, ${data.outcomes.cured} cured`}
        />
        <StatTile
          label="Mortality"
          value={percent(data.mortalityRate)}
          sub={`Benchmark ${BENCHMARK_PCT}%, ${mortalityTone(data.mortalityRate)}`}
        />
        <StatTile
          label="Success rate"
          value={percent(data.successRate)}
          sub={`Target ${TARGET_SUCCESS_PCT}%`}
        />
        <StatTile
          label="Average stay"
          value={data.avgLengthOfStay === null ? '—' : `${oneDecimal(data.avgLengthOfStay)} days`}
          sub="admitted to closed"
        />
        <StatTile
          label="Average discharge delay"
          value={data.avgDischargeDelay === null ? '—' : `${oneDecimal(data.avgDischargeDelay)} days`}
          sub="first eligible to discharged"
        />
      </dl>

      <section className="mt-8 border-y border-ink/15 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <div>
            <h2 className="font-signage text-xl font-semibold tracking-tight text-ink">
              Last 7 days
            </h2>
            <p className="mt-1 text-lg text-ink">{last7Sentence(data.mortalityLast7)}</p>
          </div>
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-muted">Deaths</dt>
              <dd className="font-signage text-2xl font-semibold tabular-nums text-ink">
                {data.mortalityLast7.deaths}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Closed</dt>
              <dd className="font-signage text-2xl font-semibold tabular-nums text-ink">
                {data.mortalityLast7.closed}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Rolling 7-day mortality">
          <RollingMortalityChart series={data.series} />
        </Section>

        <Section title="Outcomes">
          <OutcomeBar outcomes={data.outcomes} closedCases={data.closedCases} />
        </Section>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Daily flow">
          <DailyFlow series={data.series} currentDay={data.currentDay} />
        </Section>

        <Section title="Today's process">
          <dl>
            <ProcessRow label="Temperatures taken">
              {today.measuredCount} of {today.bedCount} patients in beds have a temperature today.
            </ProcessRow>
            <ProcessRow label="Doctor visits done">
              {today.visitCount} of {today.bedCount} patients in beds were visited today.
            </ProcessRow>
            <ProcessRow label="Visits before temperature (R13)">
              {today.visitsBeforeTemp === 0
                ? 'No visit was logged before the temperature today.'
                : `${today.visitsBeforeTemp} of ${today.visitCount} visits were logged before the temperature today.`}
            </ProcessRow>
            <ProcessRow label="Awaiting discharge">
              {today.awaitingDischarge === 0
                ? 'No approved discharge is waiting for admin.'
                : `${today.awaitingDischarge} approved ${
                    today.awaitingDischarge === 1 ? 'discharge is' : 'discharges are'
                  } waiting for admin.`}
            </ProcessRow>
            <ProcessRow label="Beds likely free in 24h">
              {today.bedsLikelyFree === 0
                ? `No bed of ${today.bedCount} is likely to free up within 24 hours.`
                : `${today.bedsLikelyFree} of ${today.bedCount} beds may free up within 24 hours.`}
            </ProcessRow>
          </dl>
          <p className="mt-2 text-sm text-muted">
            Every figure is the count of the ward&apos;s own records for today; the report never
            estimates.
          </p>
        </Section>
      </div>
    </div>
  )
}
