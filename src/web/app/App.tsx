// App shell (owned by the main session, not by agents): caution strip, top
// bar, demo controls, routes, and RBAC guards. The Worker enforces permissions
// on every request; this UI uses the same domain `can()` so no role ever sees
// an action it cannot take, and guarded pages explain who they belong to.
import { useCallback, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { can, ROLE_LABELS, type Permission, type Staff } from '@/domain'
import { api } from './api'
import { useSession } from './session'
import { Button, ErrorBoundary, Modal, useToasts } from '@/web/components/ui'
import { SignIn } from '@/web/screens/sign-in'
import { NurseScreen } from '@/web/screens/nurse'
import { DoctorVisits } from '@/web/screens/doctor'
import { AdminScreen } from '@/web/screens/admin'
import { AboutPage } from '@/web/screens/about'

// Landed by agent D in flight; audit is the DeepSeek handoff task.
import { PatientDetail } from '@/web/screens/patient-detail'
import { DashboardScreen } from '@/web/screens/dashboard'
import { AuditScreen } from '@/web/screens/audit'

function roleLabel(staff: Staff): string {
  if (staff.role === 'DOCTOR' && staff.isHead) return 'Head Doctor'
  return ROLE_LABELS[staff.role]
}

// ---- Chrome (strip + top bar + demo controls) -----------------------------------

function TopBar({ me }: { me: NonNullable<ReturnType<typeof useSession>['me']> }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmAdvance, setConfirmAdvance] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState<'advance' | 'reset' | 'signout' | null>(null)
  const { push } = useToasts()

  const advanceDay = useCallback(async () => {
    setBusy('advance')
    try {
      const result = await api.advanceDay()
      queryClient.invalidateQueries()
      push({ tone: 'ok', message: `The ward clock advanced to ${result.currentDay}.` })
      setMenuOpen(false)
    } catch {
      push({ tone: 'error', message: 'Could not advance the day. Retry.' })
    } finally {
      setBusy(null)
      setConfirmAdvance(false)
    }
  }, [queryClient, push])

  const resetDemo = useCallback(async () => {
    setBusy('reset')
    try {
      await api.resetDemo()
      queryClient.invalidateQueries()
      push({ tone: 'ok', message: 'Demo data reset to the start state.' })
      setMenuOpen(false)
    } catch {
      push({ tone: 'error', message: 'Could not reset the demo data. Retry.' })
    } finally {
      setBusy(null)
      setConfirmReset(false)
    }
  }, [queryClient, push])

  const signOut = useCallback(async () => {
    setBusy('signout')
    try {
      await api.signOut()
    } finally {
      queryClient.clear()
      navigate('/signin')
    }
  }, [queryClient, navigate])

  return (
    <header className="border-b border-ink/15 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 sm:px-6">
        <Link to="/" className="font-signage text-2xl font-bold tracking-tight text-ink">
          WardRound
        </Link>
        <nav aria-label="Primary" className="ml-2 hidden gap-1 sm:flex">
          {can(me.staff, 'reading.record') && me.staff.role === 'NURSE' && (
            <Link to="/rounds" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
              Rounds
            </Link>
          )}
          {can(me.staff, 'visit.log') && (
            <Link to="/visits" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
              Visits
            </Link>
          )}
          {can(me.staff, 'patient.admit') && (
            <Link to="/beds" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
              Beds
            </Link>
          )}
          {can(me.staff, 'dashboard.view') && (
            <Link to="/dashboard" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
              Dashboard
            </Link>
          )}
          {can(me.staff, 'audit.view') && (
            <Link to="/audit" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
              Audit log
            </Link>
          )}
          <Link to="/about" className="rounded px-3 py-2 text-sm font-semibold hover:bg-gauze">
            About
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted md:inline">
            Demo day <span className="font-semibold text-ink">{me.currentDay}</span>
          </span>
          <span className="hidden text-sm md:inline">
            <span className="font-semibold">{me.staff.name}</span>{' '}
            <span className="text-muted">({roleLabel(me.staff)})</span>
          </span>
          <div className="relative">
            <Button variant="ghost" size="md" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
              Demo ▾
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border border-ink/15 bg-white p-2 shadow-lg">
                <p className="px-2 pb-1 text-xs text-muted">
                  Demo controls apply to this visitor workspace only.
                </p>
                <Button variant="secondary" size="md" className="w-full" onClick={() => setConfirmAdvance(true)}>
                  Advance to next day
                </Button>
                <Button variant="ghost" size="md" className="mt-1 w-full" onClick={() => setConfirmReset(true)}>
                  Reset demo data
                </Button>
              </div>
            )}
          </div>
          <Button variant="secondary" size="md" loading={busy === 'signout'} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <Modal
        open={confirmAdvance}
        title="Advance to the next day?"
        onClose={() => setConfirmAdvance(false)}
      >
        <p className="text-sm text-muted">
          The workspace clock moves to the next calendar day. Today&apos;s measurements and visits
          become history, and every patient returns to the To measure list.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmAdvance(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy === 'advance'} onClick={advanceDay}>
            Advance day
          </Button>
        </div>
      </Modal>
      <Modal open={confirmReset} title="Reset demo data?" onClose={() => setConfirmReset(false)}>
        <p className="text-sm text-muted">
          Every change made in this session is erased and the demo start state is restored. This
          cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy === 'reset'} onClick={resetDemo}>
            Reset demo data
          </Button>
        </div>
      </Modal>
    </header>
  )
}

// ---- Guards ---------------------------------------------------------------------

function Restricted({ who }: { who: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="font-signage text-3xl font-bold">This area is for the {who}.</h1>
      <p className="mt-3 text-muted">
        Your sign-in does not include this permission. Use the top bar to go back to your own
        workspace.
      </p>
      <p className="mt-4">
        <Link to="/" className="font-semibold text-focus underline">
          Back to my workspace
        </Link>
      </p>
    </div>
  )
}

/** Route guard: session required, permission enforced with an explanation. */
function Guard({ permission, who, children }: { permission: Permission; who: string; children: ReactNode }) {
  const { me, isLoading } = useSession()
  const location = useLocation()
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-muted" role="status">
        Loading your session…
      </div>
    )
  }
  if (me === null) return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  if (!can(me.staff, permission)) return <Restricted who={who} />
  return <>{children}</>
}

/** Any signed-in role may view a patient record (patient.view is universal). */
function RequireSession({ children }: { children: ReactNode }) {
  const { me, isLoading } = useSession()
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-muted" role="status">
        Loading your session…
      </div>
    )
  }
  if (me === null) return <Navigate to="/signin" replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { me, isLoading } = useSession()
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-muted" role="status">
        Loading your session…
      </div>
    )
  }
  if (me === null) return <Navigate to="/signin" replace />
  if (me.staff.role === 'NURSE') return <Navigate to="/rounds" replace />
  if (me.staff.role === 'ADMIN') return <Navigate to="/beds" replace />
  return <Navigate to="/visits" replace />
}

// ---- App ------------------------------------------------------------------------

export function App() {
  const { me, isLoading } = useSession()
  const { toasts } = useToasts()

  return (
    <div className="min-h-screen">
      <div className="caution-strip h-2" aria-hidden="true" />
      {me !== null && <TopBar me={me} />}
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/signin" element={me === null && !isLoading ? <SignIn /> : <Navigate to="/" replace />} />
          <Route
            path="/rounds"
            element={
              <Guard permission="reading.record" who="Nurse">
                <NurseScreen />
              </Guard>
            }
          />
          <Route
            path="/visits"
            element={
              <Guard permission="visit.log" who="Doctor">
                <DoctorVisits />
              </Guard>
            }
          />
          <Route
            path="/beds"
            element={
              <Guard permission="patient.admit" who="Admin">
                <AdminScreen />
              </Guard>
            }
          />
          <Route
            path="/patient/:id"
            element={
              <RequireSession>
                <PatientDetail />
              </RequireSession>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Guard permission="dashboard.view" who="Head Doctor">
                <DashboardScreen />
              </Guard>
            }
          />
          <Route
            path="/audit"
            element={
              <Guard permission="audit.view" who="Head Doctor and Admin">
                <AuditScreen />
              </Guard>
            }
          />
          <Route
            path="/about"
            element={
              <RequireSession>
                <AboutPage />
              </RequireSession>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      {toasts}
    </div>
  )
}
