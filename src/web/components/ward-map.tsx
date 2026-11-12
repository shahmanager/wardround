// Ward map (plan section 8): a floor plan, not a spreadsheet. Wing A (A-1 to
// A-40) and wing B (B-41 to B-74) sit as bays of four beds along a central
// corridor with a nurse station. Bed state is always icon + label + colour,
// never colour alone. Free beds are keyboard-operable buttons when the
// caller passes onFreeBedClick.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { bedBays, wingOf } from '@/domain'

export interface WardMapBed {
  bed: string
  state: 'occupied' | 'free' | 'ready'
  patientName?: string
}

// ---- geometry (viewBox units; the svg scales to its container) -------------
const BED_W = 54
const BED_H = 64
const BED_GAP = 5
const BAY_PAD = 8
const BAY_W = BAY_PAD * 2 + 4 * BED_W + 3 * BED_GAP // 247
const BAY_H = BAY_PAD * 2 + BED_H // 80
const COL_GAP = 14
const ROW_GAP = 12
const ROWS = 5
const WING_RECT_X = { a: 4, b: 576 }
const WING_PAD = 8
const COL_X = { a1: 12, a2: 12 + BAY_W + COL_GAP, b1: 584, b2: 584 + BAY_W + COL_GAP }
const WING_LABEL_Y = 92
const GRID_TOP = 104
const GRID_BOTTOM = GRID_TOP + ROWS * BAY_H + (ROWS - 1) * ROW_GAP
const CORRIDOR = { x: 536, w: 40, y: 20 }
const NURSE = { x: CORRIDOR.x + CORRIDOR.w / 2 - 62, y: 20, w: 124, h: 44 }
const VIEW = { w: 1108, h: GRID_BOTTOM + 20 }

// The walk out (plan 8 / Task 1b): the freed bed's centre, the corridor's
// centre line, and the ward door at the corridor's far end. The figure walks
// from the bed to the corridor, then down it to the door.
const CORRIDOR_X = CORRIDOR.x + CORRIDOR.w / 2
const DOOR_Y = GRID_BOTTOM - 5

/**
 * Centre point of a bed in the plan's coordinates, derived from the same
 * bay geometry the Wing/Bay components use. Returns null for unknown beds.
 */
function bedPoint(bed: string): { x: number; y: number } | null {
  const bays = bedBays()
  const wing = wingOf(bed)
  const wingBays = bays.filter((b) => wingOf(b[0] ?? '') === wing)
  const originX = wing === 'A' ? COL_X.a1 : COL_X.b1
  for (let i = 0; i < wingBays.length; i += 1) {
    const bay = wingBays[i]
    if (!bay) continue
    const at = bay.indexOf(bed)
    if (at === -1) continue
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = (col === 0 ? originX : originX + BAY_W + COL_GAP) + BAY_PAD + at * (BED_W + BED_GAP)
    const y = GRID_TOP + row * (BAY_H + ROW_GAP) + BAY_PAD
    // feet land in the bay aisle just below the bed, so the figure steps out
    // rather than appearing on the mattress
    return { x: x + BED_W / 2, y: y + BED_H + 3 }
  }
  return null
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const WALK_MS = 1200

/** Decorative one-shot figure: 11px tall, ink, walks out and fades. */
function Walker({ from, pxKey }: { from: { x: number; y: number }; pxKey: number }) {
  const style = {
    '--wr-from-x': `${from.x}px`,
    '--wr-from-y': `${from.y}px`,
    '--wr-corridor-x': `${CORRIDOR_X}px`,
    '--wr-door-y': `${DOOR_Y}px`,
  } as CSSProperties
  return (
    <g key={pxKey} className="wr-walker" style={style} aria-hidden="true">
      {/* head, torso, two legs — feet at the local origin */}
      <g fill="var(--color-ink)">
        <rect x={-2} y={-11} width={4} height={4} />
        <rect x={-2} y={-7} width={4} height={4} />
        <rect className="wr-leg wr-leg-a" x={-2} y={-3} width={1.5} height={3} />
        <rect className="wr-leg wr-leg-b" x={0.5} y={-3} width={1.5} height={3} />
      </g>
    </g>
  )
}

type BedState = WardMapBed['state']

const STYLES: Record<BedState, { fill: string; fillOpacity?: number; stroke: string; text: string }> = {
  occupied: { fill: 'var(--color-ink)', stroke: 'none', text: '#ffffff' },
  free: { fill: '#ffffff', stroke: 'var(--color-ink)', text: 'var(--color-ink)' },
  ready: { fill: 'var(--color-done)', fillOpacity: 0.1, stroke: 'var(--color-done)', text: 'var(--color-ink)' },
}

function bedLabel(info: WardMapBed, interactive: boolean): string {
  if (info.state === 'occupied') return `Bed ${info.bed}, occupied${info.patientName ? ` by ${info.patientName}` : ''}`
  if (info.state === 'ready') {
    return `Bed ${info.bed}, ready for discharge${info.patientName ? `: ${info.patientName}` : ''}`
  }
  return interactive ? `Bed ${info.bed}, free. Activate to start admitting a patient here.` : `Bed ${info.bed}, free`
}

/** 16px state glyphs, reused in the map (as nested svg) and the legend. */
function StateIcon({ kind, color, x, y }: { kind: BedState; color: string; x?: number; y?: number }) {
  return (
    <svg x={x} y={y} width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {kind === 'occupied' && (
        <g fill={color}>
          <circle cx={8} cy={5} r={3} />
          <path d="M2.5 14c0-2.9 2.4-4.8 5.5-4.8s5.5 1.9 5.5 4.8z" />
        </g>
      )}
      {kind === 'free' && (
        <g fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round">
          <path d="M1.5 13.5V9.5c0-1.3 1.1-2 2.5-2h8c1.4 0 2.5.7 2.5 2v4" />
          <path d="M1.5 13.5h13" />
          <path d="M4 7.5v-2c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" />
        </g>
      )}
      {kind === 'ready' && (
        <g>
          <path d="M4 1.5v13" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
          <path d="M4 2h8.5l-2.5 3 2.5 3H4z" fill={color} />
        </g>
      )}
    </svg>
  )
}

interface CellHandlers {
  interactive: boolean
  onActivate: (bed: string) => void
  onInspect: (bed: string | null) => void
  inspected: boolean
}

function BedCell({ info, x, y, ...h }: { info: WardMapBed; x: number; y: number } & CellHandlers) {
  const style = STYLES[info.state]
  const label = bedLabel(info, h.interactive)
  const isButton = info.state === 'free' && h.interactive
  return (
    <g
      transform={`translate(${x} ${y})`}
      {...(isButton
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': label,
            style: { cursor: 'pointer' },
            onClick: () => h.onActivate(info.bed),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                h.onActivate(info.bed)
              }
            },
          }
        : { role: 'img', 'aria-label': label })}
      onMouseEnter={() => h.onInspect(info.bed)}
      onMouseLeave={() => h.onInspect(null)}
      onFocus={() => h.onInspect(info.bed)}
      onBlur={() => h.onInspect(null)}
    >
      <title>{label}</title>
      <rect width={BED_W} height={BED_H} rx={6} fill={style.fill} fillOpacity={style.fillOpacity} stroke={style.stroke} strokeWidth={1.5} />
      <StateIcon kind={info.state} color={info.state === 'occupied' ? '#ffffff' : info.state === 'ready' ? 'var(--color-done)' : 'var(--color-muted)'} x={BED_W / 2 - 8} y={11} />
      <text x={BED_W / 2} y={BED_H - 12} textAnchor="middle" fontSize={14} fontWeight={600} fill={style.text} style={{ fontFamily: 'var(--font-signage)' }}>
        {info.bed}
      </text>
      {h.inspected && (
        <rect x={-3} y={-3} width={BED_W + 6} height={BED_H + 6} rx={8} fill="none" stroke="var(--color-focus)" strokeWidth={2} />
      )}
    </g>
  )
}

interface MapData {
  byBed: Map<string, WardMapBed>
  interactive: boolean
  onActivate: (bed: string) => void
  onInspect: (bed: string | null) => void
  inspected: string | null
}

function Bay({ beds, x, y, map }: { beds: string[]; x: number; y: number; map: MapData }) {
  return (
    <g>
      <rect x={x} y={y} width={BAY_W} height={BAY_H} rx={6} fill="#ffffff" stroke="var(--color-ink)" strokeOpacity={0.15} />
      {beds.map((bed, i) => {
        const info = map.byBed.get(bed) ?? { bed, state: 'free' as const }
        return (
          <BedCell
            key={bed}
            info={info}
            x={x + BAY_PAD + i * (BED_W + BED_GAP)}
            y={y + BAY_PAD}
            interactive={map.interactive}
            onActivate={map.onActivate}
            onInspect={map.onInspect}
            inspected={map.inspected === bed}
          />
        )
      })}
    </g>
  )
}

function Wing({ bays, originX, rectX, label, map }: { bays: string[][]; originX: number; rectX: number; label: string; map: MapData }) {
  return (
    <g>
      <rect
        x={rectX}
        y={WING_LABEL_Y - 28}
        width={2 * BAY_W + COL_GAP + 2 * WING_PAD}
        height={GRID_BOTTOM - (WING_LABEL_Y - 28) + 2 * WING_PAD}
        rx={10}
        fill="#ffffff"
        stroke="var(--color-ink)"
        strokeOpacity={0.12}
      />
      <text x={originX} y={WING_LABEL_Y - 6} fontSize={15} fontWeight={700} fill="var(--color-ink)" style={{ fontFamily: 'var(--font-signage)' }}>
        {label}
      </text>
      {bays.map((bay, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = col === 0 ? originX : originX + BAY_W + COL_GAP
        const y = GRID_TOP + row * (BAY_H + ROW_GAP)
        return <Bay key={bay.join('|')} beds={bay} x={x} y={y} map={map} />
      })}
    </g>
  )
}

export function WardMap({
  beds,
  onFreeBedClick,
  justFreed = null,
}: {
  beds: WardMapBed[]
  onFreeBedClick?: (bed: string) => void
  /** A bed freed just now: plays the one-shot walk out to the ward door. */
  justFreed?: { bed: string } | null
}) {
  const [inspected, setInspected] = useState<string | null>(null)
  const [walk, setWalk] = useState<{ from: { x: number; y: number }; n: number } | null>(null)
  const walkSeq = useRef(0)

  // One shot per freed bed. A new object from the caller restarts the step;
  // the same object across renders does not. Reduced motion: no figure at all,
  // the bed still flips to free because that comes from the data.
  useEffect(() => {
    if (!justFreed || prefersReducedMotion()) return
    const from = bedPoint(justFreed.bed)
    if (!from) return
    walkSeq.current += 1
    setWalk({ from, n: walkSeq.current })
  }, [justFreed])

  useEffect(() => {
    if (!walk) return
    const timer = setTimeout(() => setWalk(null), WALK_MS + 60)
    return () => clearTimeout(timer)
  }, [walk])

  const byBed = new Map(beds.map((b) => [b.bed, b]))
  const counts = { occupied: 0, free: 0, ready: 0 }
  for (const b of beds) counts[b.state] += 1
  const total = beds.length

  const active = inspected ? byBed.get(inspected) ?? null : null
  const caption = !active
    ? 'Point at a bed to see who is in it.'
    : active.state === 'occupied'
      ? `Bed ${active.bed} — ${active.patientName ?? 'occupied'}`
      : active.state === 'ready'
        ? `Bed ${active.bed} — ${active.patientName ?? 'patient'}, ready for discharge`
        : `Bed ${active.bed} is free. Select it to start an admission.`

  const bays = bedBays()
  const wingABays = bays.filter((b) => wingOf(b[0] ?? '') === 'A')
  const wingBBays = bays.filter((b) => wingOf(b[0] ?? '') === 'B')

  const mapData: MapData = {
    byBed,
    interactive: !!onFreeBedClick,
    onActivate: (bed) => onFreeBedClick?.(bed),
    onInspect: setInspected,
    inspected,
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="block w-full max-w-5xl"
        role="group"
        aria-label={`Ward map: ${total} beds in bays of four along a central corridor — ${counts.occupied} occupied, ${counts.ready} ready for discharge, ${counts.free} free.`}
      >
        <style>{`
          @keyframes wr-walk-out {
            0% { transform: translate(var(--wr-from-x), var(--wr-from-y)); opacity: 0; }
            8% { opacity: 1; }
            24% { transform: translate(var(--wr-from-x), var(--wr-from-y)); }
            46% { transform: translate(var(--wr-corridor-x), var(--wr-from-y)); }
            92% { transform: translate(var(--wr-corridor-x), var(--wr-door-y)); opacity: 1; }
            100% { transform: translate(var(--wr-corridor-x), var(--wr-door-y)); opacity: 0; }
          }
          .wr-walker { animation: wr-walk-out ${WALK_MS}ms cubic-bezier(0.33, 0, 0.3, 1) both; }
          @keyframes wr-walk-step {
            0%, 49% { transform: translateY(0); }
            50%, 100% { transform: translateY(-1.5px); }
          }
          .wr-leg-a { animation: wr-walk-step 320ms steps(1, end) infinite; }
          .wr-leg-b { animation: wr-walk-step 320ms steps(1, end) 160ms infinite; }
          @media (prefers-reduced-motion: reduce) {
            .wr-walker, .wr-leg-a, .wr-leg-b { animation: none !important; }
          }
        `}</style>

        {/* Central corridor */}
        <rect x={CORRIDOR.x} y={CORRIDOR.y} width={CORRIDOR.w} height={GRID_BOTTOM - CORRIDOR.y} fill="#ffffff" stroke="var(--color-ink)" strokeOpacity={0.12} />
        {/* ward door at the corridor's far end: the walk-out's destination */}
        <g aria-hidden="true">
          <rect x={CORRIDOR.x} y={GRID_BOTTOM - 3} width={CORRIDOR.w} height={3} fill="var(--color-ink)" />
          <text
            x={CORRIDOR_X}
            y={VIEW.h - 3}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-muted)"
            style={{ fontFamily: 'var(--font-signage)' }}
          >
            Ward door
          </text>
        </g>
        <text
          x={CORRIDOR.x + CORRIDOR.w / 2}
          y={(CORRIDOR.y + GRID_BOTTOM) / 2}
          textAnchor="middle"
          fontSize={13}
          fill="var(--color-muted)"
          transform={`rotate(90 ${CORRIDOR.x + CORRIDOR.w / 2} ${(CORRIDOR.y + GRID_BOTTOM) / 2})`}
          style={{ fontFamily: 'var(--font-signage)' }}
        >
          Central corridor
        </text>

        {/* Nurse station at the corridor head */}
        <g role="img" aria-label="Nurse station">
          <rect x={NURSE.x} y={NURSE.y} width={NURSE.w} height={NURSE.h} rx={8} fill="var(--color-ink)" />
          <text x={NURSE.x + NURSE.w / 2} y={NURSE.y + 27} textAnchor="middle" fontSize={13} fontWeight={600} fill="#ffffff" style={{ fontFamily: 'var(--font-signage)' }}>
            Nurse station
          </text>
        </g>

        <Wing bays={wingABays} originX={COL_X.a1} rectX={WING_RECT_X.a} label="Wing A" map={mapData} />
        <Wing bays={wingBBays} originX={COL_X.b1} rectX={WING_RECT_X.b} label="Wing B" map={mapData} />

        {/* the figure is decorative; the toast announces the discharge */}
        {walk && <Walker from={walk.from} pxKey={walk.n} />}
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <li className="flex items-center gap-2">
            <StateIcon kind="occupied" color="var(--color-ink)" /> Occupied
          </li>
          <li className="flex items-center gap-2">
            <StateIcon kind="free" color="var(--color-muted)" /> Free
          </li>
          <li className="flex items-center gap-2">
            <StateIcon kind="ready" color="var(--color-done)" /> Ready for discharge
          </li>
        </ul>
        <p aria-live="polite" className="text-sm text-muted">
          {caption}
        </p>
      </div>
    </figure>
  )
}
