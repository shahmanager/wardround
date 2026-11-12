// BedTag: ward bed label with a punched hole, in the signage face (plan 8).
// The bed string is the single source of the wing letter and number.
export function BedTag({ bed, size = 'md' }: { bed: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? { text: 'text-sm', pad: 'px-2 py-0.5', hole: 'h-2 w-2' } : { text: 'text-base', pad: 'px-2.5 py-1', hole: 'h-2.5 w-2.5' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-ink font-signage font-semibold tracking-wide text-gauze ${dim.pad} ${dim.text}`}
    >
      {/* punched hole: shows the page colour through the tag */}
      <span aria-hidden="true" className={`shrink-0 rounded-full bg-gauze ring-1 ring-inset ring-gauze/40 ${dim.hole}`} />
      <span aria-hidden="true">{bed}</span>
      <span className="sr-only">Bed {bed}</span>
    </span>
  )
}
