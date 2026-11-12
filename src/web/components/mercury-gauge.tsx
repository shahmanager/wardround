// MercuryGauge: horizontal 35–42 °C scale in the thermometer vernacular
// (plan 8). Filled to today's reading (ink, mercury at 38.0 or above), a
// hollow marker for yesterday, and the value always shown as text. Exposed
// as an accessible image with a full text alternative.
import { CONFIG, formatTemp } from '@/domain'

const MIN = 35
const MAX = 42
const W = 252
const H = 54
const X0 = 34
const X1 = 240
const TRACK_Y = 30
const TRACK_H = 9
const MID = TRACK_Y + TRACK_H / 2

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, v))
}

function vx(v: number): number {
  return X0 + ((clamp(v) - MIN) / (MAX - MIN)) * (X1 - X0)
}

export function MercuryGauge({ value, yesterday = null }: { value: number; yesterday?: number | null }) {
  const fever = value >= CONFIG.FEVER_THRESHOLD_C
  const fill = fever ? 'var(--color-mercury)' : 'var(--color-ink)'
  const fillWidth = Math.max(vx(value) - X0, 0)

  const label =
    `Temperature today ${formatTemp(value)} degrees Celsius` +
    (yesterday !== null ? `, yesterday ${formatTemp(yesterday)}` : '') +
    `, on a scale of 35 to 42 degrees with the fever line at 38` +
    (fever ? ', today is a fever' : '')

  return (
    <div role="img" aria-label={label} className="flex items-center gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-auto max-w-full flex-none"
        aria-hidden="true"
        focusable="false"
      >
        {/* bulb */}
        <circle cx={16} cy={MID} r={11} fill={fill} />
        {/* tube */}
        <rect x={16} y={TRACK_Y} width={X1 - 16} height={TRACK_H} rx={TRACK_H / 2} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
        {/* mercury column */}
        <rect x={17.5} y={TRACK_Y + 1.5} width={Math.max(fillWidth, 0)} height={TRACK_H - 3} rx={(TRACK_H - 3) / 2} fill={fill} />
        {/* ticks each degree; labels at 35, 38, 42 */}
        {[35, 36, 37, 38, 39, 40, 41, 42].map((t) => {
          const strong = t === 38
          return (
            <line
              key={t}
              x1={vx(t)}
              x2={vx(t)}
              y1={TRACK_Y + TRACK_H + 1}
              y2={strong ? TRACK_Y + TRACK_H + 9 : TRACK_Y + TRACK_H + 5}
              stroke="var(--color-ink)"
              strokeWidth={strong ? 1.75 : 1}
            />
          )
        })}
        {[35, 38, 42].map((t) => (
          <text
            key={t}
            x={vx(t)}
            y={H - 1}
            textAnchor="middle"
            fontSize={9}
            fill={t === 38 ? 'var(--color-ink)' : 'var(--color-muted)'}
            fontWeight={t === 38 ? 600 : 400}
          >
            {t}
          </text>
        ))}
        {/* yesterday: hollow marker */}
        {yesterday !== null && (
          <circle cx={vx(yesterday)} cy={MID} r={4.5} fill="var(--color-gauze)" stroke="var(--color-ink)" strokeWidth={1.5} />
        )}
      </svg>
      {/* the value stays readable text, never only inside the image */}
      <span aria-hidden="true" className="font-signage text-lg font-semibold tabular-nums">
        {formatTemp(value)} °C
      </span>
    </div>
  )
}
