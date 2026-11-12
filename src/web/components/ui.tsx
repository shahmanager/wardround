// Shared UI primitives (docs/UI-CONTRACT.md). Ward-signage identity: ink
// primary buttons, ruled rows, tag-shaped chips. Status is never colour alone
// (every chip carries an icon), every touch target is at least 44 px, and
// motion is action feedback only (150–250 ms; index.css clamps durations
// under prefers-reduced-motion).
import {
  Component,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEventHandler,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'

// ---- Icons (inline SVG, stroke ink, 1.5 px, no emoji) ---------------------------

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  )
}

function AlertTriangleIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5 22 20H2Z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.5h.01" />
    </svg>
  )
}

function ExclamationIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5.5 5.5l13 13" />
      <path d="M18.5 5.5l-13 13" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg {...iconProps} className="animate-spin">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

// ---- Button ----------------------------------------------------------------------

const buttonVariantClasses = {
  primary: 'bg-ink text-gauze hover:bg-ink/90',
  secondary: 'border border-ink/30 bg-white text-ink hover:border-ink',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'bg-mercury text-white hover:bg-mercury/90',
} as const

const buttonSizeClasses = {
  md: 'min-h-11 px-4 text-base', // 44 px
  lg: 'min-h-12 px-5 text-base', // 48 px, nurse flow
} as const

export interface ButtonProps {
  variant?: keyof typeof buttonVariantClasses
  size?: keyof typeof buttonSizeClasses
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  onClick?: MouseEventHandler<HTMLButtonElement>
  className?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  className,
  children,
}: ButtonProps) {
  const inactive = disabled || loading
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md font-body font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${buttonSizeClasses[size]} ${buttonVariantClasses[variant]}${className ? ` ${className}` : ''}`}
    >
      {loading && <SpinnerIcon />}
      {children}
    </button>
  )
}

// ---- Chip (icon + text, never colour alone) ---------------------------------------

export interface ChipProps {
  tone?: 'neutral' | 'amber' | 'done' | 'alert'
  children: ReactNode
}

const chipToneClasses = {
  neutral: 'border border-ink/25 bg-white text-ink',
  amber: 'bg-signal-tint text-signal',
  done: 'bg-done/10 text-done border border-done/30',
  alert: 'bg-mercury text-white',
} as const

function ChipIcon({ tone }: { tone: keyof typeof chipToneClasses }) {
  if (tone === 'done') return <CheckIcon />
  if (tone === 'alert') return <AlertTriangleIcon />
  if (tone === 'amber') return <ExclamationIcon />
  return <CircleIcon />
}

export function Chip({ tone = 'neutral', children }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${chipToneClasses[tone]}`}
    >
      <ChipIcon tone={tone} />
      {children}
    </span>
  )
}

// ---- Field (labelled input wrapper) -------------------------------------------------

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

/**
 * Wraps a single input element: associates the label by id and wires
 * aria-describedby to the hint and error. Pass one input/select/textarea as
 * the child (no wrapper elements).
 */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const messageId = error ? errorId : hint ? hintId : undefined

  let control = children
  if (isValidElement<Record<string, unknown>>(children)) {
    const describedBy =
      [children.props['aria-describedby'], messageId].filter(Boolean).join(' ') || undefined
    control = cloneElement(children, {
      id,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {control}
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-sm font-medium text-mercury">
          {error}
        </p>
      )}
    </div>
  )
}

// ---- TextArea ------------------------------------------------------------------------

const controlClasses =
  'w-full min-h-11 rounded-md border border-ink/30 bg-white px-3 py-2 text-base text-ink placeholder:text-muted/70'

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, rows = 3, ...props }: TextAreaProps) {
  return <textarea rows={rows} className={`${controlClasses} ${className ?? ''}`} {...props} />
}

// ---- Modal and Sheet (shared focus-trapping overlay) ----------------------------------

const focusableSelector =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

// Keyframes live with the component (index.css is token-only). Both are
// 150–250 ms action feedback; reduced-motion is clamped globally in index.css.
const overlayStyles = `
@keyframes wr-overlay-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes wr-panel-in { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
@keyframes wr-sheet-in { from { transform: translateY(40px) } to { transform: translateY(0) } }
`

interface OverlayDialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  kind: 'modal' | 'sheet'
}

function OverlayDialog({ open, title, onClose, children, kind }: OverlayDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || panelRef.current === null) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const panelClasses =
    kind === 'modal'
      ? 'relative my-auto max-h-[85vh] w-full max-w-md overflow-auto rounded-lg border border-ink/15 bg-white shadow-lg animate-[wr-panel-in_180ms_ease-out]'
      : 'relative mt-auto max-h-[85vh] w-full overflow-auto rounded-t-lg border border-b-0 border-ink/15 bg-white shadow-lg animate-[wr-sheet-in_200ms_ease-out]'

  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${kind === 'modal' ? 'items-center p-4' : 'items-stretch'}`}>
      <style>{overlayStyles}</style>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/50 animate-[wr-overlay-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={panelClasses}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink/15 px-4 py-3">
          <h2 id={titleId} className="pt-1 font-signage text-xl font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink transition-colors duration-150 hover:bg-ink/5"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Centre-screen dialog: focus is trapped, Esc and backdrop clicks close it. */
export function Modal({ open, title, onClose, children }: ModalProps) {
  return (
    <OverlayDialog open={open} title={title} onClose={onClose} kind="modal">
      {children}
    </OverlayDialog>
  )
}

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Mobile bottom sheet, same focus guarantees as Modal. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  return (
    <OverlayDialog open={open} title={title} onClose={onClose} kind="sheet">
      {children}
    </OverlayDialog>
  )
}

// ---- Tabs -----------------------------------------------------------------------------

export interface TabsProps {
  tabs: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const moveFocus = (from: number, step: number) => {
    if (tabs.length === 0) return
    const next = (from + step + tabs.length) % tabs.length
    const button = tabRefs.current[next]
    if (button) {
      button.focus()
      const tab = tabs[next]
      if (tab) onChange(tab.id)
    }
  }

  return (
    <div role="tablist" className="flex border-b border-ink/15">
      {tabs.map((tab, index) => {
        const selected = value === tab.id
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                moveFocus(index, 1)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                moveFocus(index, -1)
              }
            }}
            className={`min-h-11 px-4 font-signage text-lg transition-colors duration-150 ${
              selected
                ? 'border-b-2 border-ink font-semibold text-ink'
                : 'border-b-2 border-transparent font-medium text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ---- EmptyState, SkeletonRows, StatTile, SectionHeading --------------------------------

export interface EmptyStateProps {
  title: string
  body: string
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-ink/25 px-6 py-10 text-center">
      <h3 className="font-signage text-lg font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-muted">{body}</p>
    </div>
  )
}

export interface SkeletonRowsProps {
  rows?: number
}

export function SkeletonRows({ rows = 3 }: SkeletonRowsProps) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-8 w-12 animate-pulse rounded-sm bg-ink/10" />
          <div className="h-4 flex-1 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-16 animate-pulse rounded bg-ink/10" />
        </div>
      ))}
    </div>
  )
}

export interface StatTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
}

export function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className="border border-ink/15 bg-white px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-signage text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {sub != null && sub !== false && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  )
}

export interface SectionHeadingProps {
  children: ReactNode
}

export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <h2 className="border-b border-ink/15 pb-2 font-signage text-xl font-semibold tracking-tight text-ink">
      {children}
    </h2>
  )
}

// ---- Toasts (module store; the aria-live region is mounted by App) ----------------------

export type ToastTone = 'ok' | 'error' | 'warn'

let toastList: Array<{ id: number; tone: ToastTone; message: string }> = []
let nextToastId = 0
const toastListeners = new Set<() => void>()
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()

function emitToasts() {
  for (const listener of toastListeners) listener()
}

function dismissToast(id: number) {
  toastTimers.delete(id)
  toastList = toastList.filter((t) => t.id !== id)
  emitToasts()
}

function pushToast(tone: ToastTone, message: string) {
  const id = ++nextToastId
  toastList = [...toastList, { id, tone, message }]
  emitToasts()
  toastTimers.set(
    id,
    setTimeout(() => dismissToast(id), 5000),
  )
}

const toastToneClasses = {
  ok: 'bg-ink text-gauze',
  error: 'bg-mercury text-white',
  warn: 'border border-signal/40 bg-signal-tint text-signal',
} as const

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'ok') return <CheckIcon />
  if (tone === 'error') return <AlertTriangleIcon />
  return <ExclamationIcon />
}

/**
 * Toast access for any component: `const { push } = useToasts()` then
 * `push({ tone: 'ok', message: '...' })`.
 *
 * `toasts` is the ready-to-render aria-live region (fixed position, icons
 * included). It is always mounted when rendered, so screen readers keep a
 * stable live region. App renders it once: `{toasts}`. Other components use
 * `push` only and do not render the region.
 */
export function useToasts(): {
  toasts: ReactNode
  push: (toast: { tone: ToastTone; message: string }) => void
} {
  const list = useSyncExternalStore(
    (onStoreChange) => {
      toastListeners.add(onStoreChange)
      return () => {
        toastListeners.delete(onStoreChange)
      }
    },
    () => toastList,
    () => toastList,
  )

  const push = useCallback((toast: { tone: ToastTone; message: string }) => {
    pushToast(toast.tone, toast.message)
  }, [])

  const region = (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:items-end"
    >
      {list.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto inline-flex max-w-md items-start gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-lg animate-[wr-overlay-in_150ms_ease-out] ${toastToneClasses[toast.tone]}`}
        >
          <span className="mt-0.5 shrink-0">
            <ToastIcon tone={toast.tone} />
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )

  return { toasts: region, push }
}

// ---- ErrorBoundary ----------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Root safety net (PLAN section 3 observability). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('WardRound render error:', error)
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="font-signage text-3xl font-semibold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-3 text-muted">
          The screen failed to render. Your session is untouched; reload the page to return to the
          ward board.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-ink px-4 font-body font-semibold text-gauze transition-colors duration-150 hover:bg-ink/90"
        >
          Reload the page
        </button>
      </main>
    )
  }
}

