// MercuryGauge: horizontal 35–42 °C scale in the thermometer vernacular
// (plan 8). Filled to today's reading (ink, mercury at 38.0 or above), a
// hollow marker for yesterday, and the value always shown as text. Exposed
// as an accessible image with a full text alternative.
//
// Motion (Task 1a): when `animateFrom` carries yesterday's reading, the
// mercury column animates from that value to today's value over 600 ms
// ease-out and the numeric text switches at the end, so the eye follows one
// value. The column is a pathLength=100 line whose dash offset transitions —
// CSS only, no animation library. Under prefers-reduced-motion the end state
// renders immediately (the global clamp also zeroes the transition).
import { useEffect, useState } from 'react'
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
const RISE_MS = 600

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, v))
}

function vx(v: number): number {
  return X0 + ((clamp(v) - MIN) / (MAX - MIN)) * (X1 - X0)
}

/** 0 at 35 °C, 100 at 42 °C — the column's pathLength scale. */
function fillPercent(v: number): number {
  return ((clamp(v) - MIN) / (MAX - MIN)) * 100
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function MercuryGauge({
  value,
  yesterday = null,
  animateFrom = null,
}: {
  value: number
  yesterday?: number | null
  /** Optional starting reading (yesterday's) for the one-shot rise. */
  animateFrom?: number | null
}) {
  const start =
    animateFrom !== null && Number.isFinite(animateFrom) ? clamp(animateFrom) : null
  const animate = start !== null && start !== clamp(value) && !prefersReducedMotion()

  // The bar starts at yesterday's value and the text waits for it; with no
  // animation both start at the final value.
  const [barValue, setBarValue] = useState(animate ? (start as number) : value)
  const [textValue, setTextValue] = useState(animate ? (start as number) : value)

  useEffect(() => {
    if (!animate) {
      setBarValue(value)
      setTextValue(value)
      return
    }
    // Let the starting column paint once, then move it; this is what makes
    // the CSS transition run rather than jump.
    const frame = requestAnimationFrame(() => setBarValue(value))
    const timer = setTimeout(() => setTextValue(value), RISE_MS + 40)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [animate, value])

  const fever = barValue >= CONFIG.FEVER_THRESHOLD_C
  const fill = fever ? 'var(--color-mercury)' : 'var(--color-ink)'
  const feverText = value >= CONFIG.FEVER_THRESHOLD_C
  const offset = 100 - fillPercent(barValue)

  const label =
    `Temperature today ${formatTemp(value)} degrees Celsius` +
    (yesterday !== null ? `, yesterday ${formatTemp(yesterday)}` : '') +
    `, on a scale of 35 to 42 degrees with the fever line at 38` +
    (feverText ? ', today is a fever' : '')

  return (
    <div role="img" aria-label={label} className="flex items-center gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-auto max-w-full flex-none"
        aria-hidden="true"
        focusable="false"
      >
        {/* bulb */}
        <circle
          cx={16}
          cy={MID}
          r={11}
          fill={fill}
          style={{ transition: `fill ${RISE_MS}ms ease-out` }}
        />
        {/* tube */}
        <rect x={16} y={TRACK_Y} width={X1 - 16} height={TRACK_H} rx={TRACK_H / 2} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} />
        {/* mercury column: pathLength 100 makes the dash animation scale-free */}
        <line
          x1={X0}
          y1={MID}
          x2={X1}
          y2={MID}
          pathLength={100}
          stroke={fill}
          strokeWidth={TRACK_H - 3}
          strokeLinecap="round"
          strokeDasharray={100}
          strokeDashoffset={offset}
          style={{ transition: `stroke-dashoffset ${RISE_MS}ms ease-out, stroke ${RISE_MS}ms ease-out` }}
        />
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
      {/* the value stays readable text, never only inside the image; it swaps
          from yesterday to today when the column lands */}
      <span aria-hidden="true" className="font-signage text-lg font-semibold tabular-nums">
        {formatTemp(textValue)} °C
      </span>
    </div>
  )
}
