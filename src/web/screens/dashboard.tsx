// Dashboard: the head doctor's management view (route /dashboard; R27–R30).
// Ruled rows, sentence case; words as well as styling carry the status, and
// every figure shows its numerator and denominator. Nothing is invented.
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CONFIG } from '@/domain'
import { api, queryKeys, type DashboardResponse } from '@/web/app/api'
import { Button, EmptyState, SectionHeading, SkeletonRows } from '@/web/components/ui'

const BENCHMARK_PCT = Math.round(CONFIG.MORTALITY_BENCHMARK * 1000) / 10

const oneDecimal = (value: number): string => value.toFixed(1)

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

function StatRow({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-ink/10 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>
        <p className="font-signage text-xl font-semibold tabular-nums text-ink">{value}</p>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
      </dd>
    </div>
  )
}

export function DashboardScreen() {
  const dashboardQ = useQuery({ queryKey: queryKeys.dashboard, queryFn: api.getDashboard })

  if (dashboardQ.isPending) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <SkeletonRows rows={7} />
      </div>
    )
  }

  if (dashboardQ.isError) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <EmptyState
          title="The dashboard could not be loaded."
          body="Check the connection and try again."
        />
        <div className="mt-4">
          <Button onClick={() => void dashboardQ.refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  const { compliance, delay, occupancy, avgLengthOfStay, exceptions7d, closedCases, outcomes } =
    dashboardQ.data
  const occupancyPct =
    occupancy.capacity > 0 ? (occupancy.occupied / occupancy.capacity) * 100 : null

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <h1 className="font-signage text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted">
          Ward performance for the head doctor, from closed cases and today&apos;s round.
        </p>
      </header>

      <section className="mt-8">
        <SectionHeading>Mortality</SectionHeading>
        <p className="mt-3 text-lg text-ink">{mortalitySentence(dashboardQ.data.mortality)}</p>
      </section>

      <section className="mt-10">
        <SectionHeading>Ward figures</SectionHeading>
        <dl className="mt-2">
          <StatRow
            label="Compliance"
            value={`${compliance.measuredCount} of ${compliance.bedCount} measured`}
            detail={`${compliance.visitCount} visits logged, ${compliance.visitsAfterTempCount} after the temperature.`}
          />
          <StatRow
            label="Discharge delays"
            value={
              delay.avgDelayDays === null
                ? 'No completed discharges'
                : `${oneDecimal(delay.avgDelayDays)} days average`
            }
            detail={`${delay.delayedNow} approved and waiting, ${delay.bedDaysHeld} bed days held.`}
          />
          <StatRow
            label="Occupancy"
            value={`${occupancy.occupied} of ${occupancy.capacity} beds`}
            detail={occupancyPct === null ? 'No capacity recorded.' : `${oneDecimal(occupancyPct)}% in use.`}
          />
          <StatRow
            label="Average length of stay"
            value={avgLengthOfStay === null ? 'Not yet known' : `${oneDecimal(avgLengthOfStay)} days`}
            detail="Across closed cases with a known outcome."
          />
          <StatRow
            label="Exceptions, 7 days"
            value={`${exceptions7d.doctorReadings} doctor readings, ${exceptions7d.lateEntries} late entries`}
            detail="Doctor readings outside the round and entries after the day closed."
          />
          <StatRow
            label="Closed cases"
            value={closedCases}
            detail={`${outcomes.deaths} deaths, ${outcomes.cured} cured.`}
          />
        </dl>
      </section>
    </div>
  )
}
