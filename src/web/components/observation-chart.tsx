// ObservationChart: the ward's paper TPR chart, drawn as inline SVG on pale
// grid paper (plan section 8). Day on the x axis (admission to today),
// 35–41 °C on the y axis, a dashed line at 38.0. Points differ by shape as
// well as colour (circle = no fever, triangle = fever, diamond = after
// fever-reducing medicine), missed days are gaps with a "no reading" tick,
// yesterday is hollow, and the numeric value always appears as text. The
// plain table below is the same data as text — the chart never carries a
// meaning the table does not.
import type { ReactNode } from 'react'
import { CONFIG, dateAdd, dayDiff, formatDay, formatTemp } from '@/domain'
import type { Reading } from '@/domain'

export interface ObservationChartProps {
  readings: Reading[]
  /** The workspace clock day (R33) — passed in, never read from the device. */
  today: string
  admittedDay: string | null
}

const COL_W = 44
const MARGIN = { top: 28, right: 16, bottom: 46, left: 42 } as const
const PLOT_H = 208
const Y_MIN = 35
const Y_MAX = 41
const MAX_DAYS = 14
const Y_TICKS = [35, 36, 37, 38, 39, 40, 41] as const

interface DayCell {
  day: string
  reading: Reading | null
}

type PointKind = 'normal' | 'fever' | 'masked'

function pointKind(r: Reading): PointKind {
  if (r.masked) return 'masked'
  if (r.tempC >= CONFIG.FEVER_THRESHOLD_C) return 'fever'
  return 'normal'
}

function fillClass(kind: PointKind): string {
  if (kind === 'fever') return 'fill-mercury'
  if (kind === 'masked') return 'fill-signal'
  return 'fill-ink'
}

function strokeClass(kind: PointKind): string {
  if (kind === 'fever') return 'stroke-mercury'
  if (kind === 'masked') return 'stroke-signal'
  return 'stroke-ink'
}

/** Fever, medicine and late-entry status in words, for the table's flag column. */
function flagFor(r: Reading | null): string {
  if (r === null) return 'No reading'
  const parts: string[] = []
  if (r.tempC >= CONFIG.FEVER_THRESHOLD_C) parts.push('Fever')
  if (r.masked) parts.push('Fever-reducing medicine')
  if (r.lateEntry) parts.push('Late entry')
  if (parts.length === 0) parts.push('No fever')
  return parts.join(', ')
}

function LegendMark({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-sm text-muted">{children}</span>
}

function markSvg(shape: 'circle' | 'triangle' | 'diamond' | 'hollow' | 'dashed', fill: string) {
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true } as const
  if (shape === 'triangle') {
    return (
      <svg {...common}>
        <polygon points="6,0.8 11.2,10.6 0.8,10.6" className={fill} />
      </svg>
    )
  }
  if (shape === 'diamond') {
    return (
      <svg {...common}>
        <polygon points="6,0.5 11,6 6,11.5 1,6" className={fill} />
      </svg>
    )
  }
  if (shape === 'hollow') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4.5" fill="none" strokeWidth="1.5" className="stroke-ink" />
      </svg>
    )
  }
  if (shape === 'dashed') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4.5" fill="none" strokeWidth="1.5" strokeDasharray="2.5 1.8" className="stroke-ink" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="4.5" className={fill} />
    </svg>
  )
}

export function ObservationChart({ readings, today, admittedDay }: ObservationChartProps) {
  // Latest active reading per day; voided and superseded entries are history,
  // not data (R7/R8), so a day whose only entries are them is a gap.
  const activeByDay = new Map<string, Reading>()
  for (const r of readings) {
    if (r.status !== 'active') continue
    const existing = activeByDay.get(r.day)
    if (existing === undefined || r.recordedAt >= existing.recordedAt) activeByDay.set(r.day, r)
  }

  // Window: admission day to today, capped at the most recent 14 columns so
  // long stays stay legible (the table still says which window is shown).
  let start = admittedDay ?? today
  for (const day of activeByDay.keys()) {
    if (dayDiff(day, start) < 0) start = day
  }
  let capped = false
  if (dayDiff(start, today) + 1 > MAX_DAYS) {
    start = dateAdd(today, -(MAX_DAYS - 1))
    capped = true
  }
  const nDays = dayDiff(start, today) + 1
  const yesterday = dateAdd(today, -1)

  const cells: DayCell[] = []
  for (let i = 0; i < nDays; i++) {
    const day = dateAdd(start, i)
    cells.push({ day, reading: activeByDay.get(day) ?? null })
  }

  const width = MARGIN.left + MARGIN.right + nDays * COL_W
  const height = MARGIN.top + PLOT_H + MARGIN.bottom
  const baseline = MARGIN.top + PLOT_H
  const xFor = (i: number) => MARGIN.left + i * COL_W + COL_W / 2
  const feverY = MARGIN.top + (1 - (CONFIG.FEVER_THRESHOLD_C - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H
  const yFor = (t: number) => {
    const clamped = Math.min(Y_MAX, Math.max(Y_MIN, t))
    return MARGIN.top + (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H
  }
  const showEveryOther = nDays > 10

  const nReadings = cells.filter((c) => c.reading !== null).length
  const nFever = cells.filter((c) => c.reading !== null && pointKind(c.reading) === 'fever').length
  const nGaps = nDays - nReadings
  const aria = [
    `Observation chart from ${formatDay(start)} to ${formatDay(today)}.`,
    `${nReadings} readings, ${nFever} with fever, ${nGaps} ${nGaps === 1 ? 'day' : 'days'} with no reading.`,
    'The same data follows as a table.',
  ].join(' ')

  return (
    <div>
      <figure className="m-0">
        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-label={aria}
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full min-w-[320px]"
          >
            <rect x="0" y="0" width={width} height={height} className="fill-white" />
            {/* chart paper: grid in the chart-grid token, axes in ink */}
            {Y_TICKS.map((v) => (
              <line
                key={v}
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={yFor(v)}
                y2={yFor(v)}
                className="stroke-chart-grid"
                strokeWidth="1"
              />
            ))}
            {cells.map((c, i) => (
              <line
                key={`col-${c.day}`}
                x1={xFor(i)}
                x2={xFor(i)}
                y1={MARGIN.top}
                y2={baseline}
                className="stroke-chart-grid"
                strokeWidth="1"
              />
            ))}
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={baseline}
              y2={baseline}
              className="stroke-ink"
              strokeWidth="1.5"
            />
            <text
              x={MARGIN.left - 6}
              y={MARGIN.top - 10}
              fontSize="10.5"
              textAnchor="end"
              className="fill-muted"
            >
              °C
            </text>
            {/* dashed fever line at 38.0 (R4) */}
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={feverY}
              y2={feverY}
              className="stroke-mercury"
              strokeWidth="1.25"
              strokeDasharray="6 4"
            />
            <text x={MARGIN.left + 6} y={feverY - 5} fontSize="10" className="fill-mercury">
              fever line 38.0
            </text>
            {Y_TICKS.map((v) => (
              <text
                key={`ylab-${v}`}
                x={MARGIN.left - 6}
                y={yFor(v) + 3.5}
                fontSize="10.5"
                textAnchor="end"
                className="fill-muted"
              >
                {v}
              </text>
            ))}
            {cells.map((c, i) => {
              if (showEveryOther && i % 2 === 1 && i !== nDays - 1) return null
              const isToday = i === nDays - 1
              return (
                <g key={`xlab-${c.day}`}>
                  <text
                    x={xFor(i)}
                    y={baseline + 16}
                    fontSize="10"
                    textAnchor="middle"
                    className={isToday ? 'fill-ink font-semibold' : 'fill-muted'}
                  >
                    {c.day.slice(8, 10)}
                  </text>
                  {isToday && (
                    <text
                      x={xFor(i)}
                      y={baseline + 29}
                      fontSize="9.5"
                      textAnchor="middle"
                      className="fill-ink"
                    >
                      today
                    </text>
                  )}
                </g>
              )
            })}
            {/* points and missed-day gaps */}
            {cells.map((c, i) => {
              const x = xFor(i)
              if (c.reading === null) {
                return (
                  <g key={`gap-${c.day}`}>
                    <line
                      x1={x}
                      x2={x}
                      y1={baseline - 12}
                      y2={baseline}
                      className="stroke-muted"
                      strokeWidth="1.5"
                    />
                    <text x={x} y={baseline - 29} fontSize="9" textAnchor="middle" className="fill-muted">
                      no
                    </text>
                    <text x={x} y={baseline - 19} fontSize="9" textAnchor="middle" className="fill-muted">
                      reading
                    </text>
                  </g>
                )
              }
              const r = c.reading
              const y = yFor(r.tempC)
              const kind = pointKind(r)
              const hollow = c.day === yesterday
              const cls = `${hollow ? 'fill-white' : fillClass(kind)} ${strokeClass(kind)}`
              const dash = r.lateEntry ? '3 2' : undefined
              const shape =
                kind === 'fever' ? (
                  <polygon
                    points={`${x},${y - 6.5} ${x + 6},${y + 4.5} ${x - 6},${y + 4.5}`}
                    className={cls}
                    strokeWidth="1.5"
                    strokeDasharray={dash}
                  />
                ) : kind === 'masked' ? (
                  <polygon
                    points={`${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`}
                    className={cls}
                    strokeWidth="1.5"
                    strokeDasharray={dash}
                  />
                ) : (
                  <circle cx={x} cy={y} r="5.5" className={cls} strokeWidth="1.5" strokeDasharray={dash} />
                )
              return (
                <g key={`pt-${c.day}`}>
                  {shape}
                  <text x={x} y={y - 11} fontSize="10" textAnchor="middle" className="fill-ink font-signage">
                    {formatTemp(r.tempC)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        {capped && (
          <figcaption className="mt-1 text-sm text-muted">
            Showing the last {MAX_DAYS} days of the stay.
          </figcaption>
        )}
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <LegendMark>{markSvg('circle', 'fill-ink')} No fever</LegendMark>
          <LegendMark>{markSvg('triangle', 'fill-mercury')} Fever, 38.0 °C or above</LegendMark>
          <LegendMark>{markSvg('diamond', 'fill-signal')} Fever-reducing medicine given</LegendMark>
          <LegendMark>{markSvg('hollow', '')} Hollow marker: yesterday</LegendMark>
          <LegendMark>{markSvg('dashed', '')} Dashed outline: late entry</LegendMark>
          <LegendMark>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <line x1="6" y1="2" x2="6" y2="10" strokeWidth="1.5" className="stroke-muted" />
            </svg>
            Tick: no reading that day
          </LegendMark>
        </figcaption>
      </figure>
      <table className="mt-4 w-full border-collapse text-left text-sm">
        <caption className="sr-only">Temperatures by day, the same data as the chart</caption>
        <thead>
          <tr className="border-b border-ink/30">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Day
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Temperature
            </th>
            <th scope="col" className="py-2 font-semibold">
              Flag
            </th>
          </tr>
        </thead>
        <tbody>
          {[...cells].reverse().map((c) => (
            <tr key={c.day} className="border-b border-ink/10">
              <th scope="row" className="py-2 pr-3 font-normal">
                {formatDay(c.day)}
                {c.day === today ? ' (today)' : ''}
              </th>
              <td className="py-2 pr-3 font-signage tabular-nums">
                {c.reading ? `${formatTemp(c.reading.tempC)} °C` : '—'}
              </td>
              <td className="py-2">{flagFor(c.reading)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
