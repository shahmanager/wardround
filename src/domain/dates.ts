// Pure date helpers over ISO calendar days (YYYY-MM-DD). No wall clock:
// every function takes its inputs explicitly, so the domain stays
// deterministic (R33 — "today" is passed in from the workspace clock).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

function civilFromIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

/** Returns `iso` shifted by `days` calendar days. */
export function dateAdd(iso: string, days: number): string {
  const { y, m, d } = civilFromIso(iso)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** Whole days from `fromIso` to `toIso` (toIso - fromIso). */
export function dayDiff(fromIso: string, toIso: string): number {
  const a = civilFromIso(fromIso)
  const b = civilFromIso(toIso)
  const ta = Date.UTC(a.y, a.m - 1, a.d)
  const tb = Date.UTC(b.y, b.m - 1, b.d)
  return Math.round((tb - ta) / 86_400_000)
}

/** All ISO days from `fromIso` up to and including `toIso`. Empty when from > to. */
export function dayRange(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  for (let d = dayDiff(fromIso, toIso); d >= 0; d--) out.push(dateAdd(fromIso, d))
  return out
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 12 Nov" — weekday derived purely from the ISO day (1970-01-01 was a Thursday). */
export function formatDay(iso: string): string {
  const { y, m, d } = civilFromIso(iso)
  const wd = WEEKDAYS[(Math.floor(Date.UTC(y, m - 1, d) / 86_400_000) + 3) % 7]
  return `${wd} ${d} ${MONTHS[m - 1]}`
}
