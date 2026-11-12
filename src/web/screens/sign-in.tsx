// Sign-in (PLAN section 6). Four role groups as ruled sections; every person
// is one tap onto a bed-tag-style id chip. Signing in creates the visitor
// workspace, then the route follows the role.
import { useNavigate } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Role, Staff } from '@/domain'
import { api, ApiClientError } from '@/web/app/api'
import { queryKeys } from '@/web/app/api'
import { SkeletonRows } from '@/web/components/ui'

// ---- Role groups --------------------------------------------------------------------

interface RoleGroup {
  key: string
  title: string
  description: string
  tagPrefix: string
  destination: string
  staff: Staff[]
}

const roleDestinations: Record<Role, string> = {
  NURSE: '/rounds',
  DOCTOR: '/visits',
  ADMIN: '/beds',
}

function groupStaff(staff: Staff[]): RoleGroup[] {
  const inRole = (role: Role, isHead: boolean) =>
    staff
      .filter((s) => s.role === role && s.isHead === isHead)
      .sort((a, b) => a.displayOrder - b.displayOrder)

  const build = (
    key: string,
    title: string,
    description: string,
    tagPrefix: string,
    destination: string,
    members: Staff[],
  ): RoleGroup => ({ key, title, description, tagPrefix, destination, staff: members })

  const groups = [
    build(
      'nurse',
      'Nurses',
      "Take every patient's temperature once a day and keep the rounds board current.",
      'N',
      roleDestinations.NURSE,
      inRole('NURSE', false),
    ),
    build(
      'doctor',
      'Doctors',
      "See patients once today's temperature is in, log visits, and approve discharges.",
      'D',
      roleDestinations.DOCTOR,
      inRole('DOCTOR', false),
    ),
    build(
      'head-doctor',
      'Head Doctor',
      'Oversees the ward. Reads the dashboard, watches mortality against the 15% benchmark, and reviews the audit log.',
      'H',
      roleDestinations.DOCTOR,
      inRole('DOCTOR', true),
    ),
    build(
      'admin',
      'Admin',
      'Turns approved discharges into free beds and admits waiting patients.',
      'A',
      roleDestinations.ADMIN,
      inRole('ADMIN', false),
    ),
  ]
  return groups.filter((g) => g.staff.length > 0)
}

/** Bed-tag-style id chip with a punched hole (signage identity, no images). */
function IdTag({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center rounded-sm bg-ink py-0.5 pl-4 pr-2 font-signage text-sm font-semibold tracking-wide text-gauze"
    >
      <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gauze" />
      {label}
    </span>
  )
}

// ---- Screen ---------------------------------------------------------------------------

export function SignIn() {
  const navigate = useNavigate()
  const staffQuery = useQuery({
    queryKey: queryKeys.staff,
    queryFn: () => api.getStaff(),
    staleTime: Infinity,
  })

  const signIn = useMutation({
    mutationFn: (staffId: string) => api.createSession(staffId),
    onSuccess: (data) => {
      navigate(roleDestinations[data.staff.role])
    },
  })

  const pendingId = signIn.isPending ? signIn.variables : undefined
  const failedId = signIn.isError ? signIn.variables : undefined

  const renderBody = () => {
    if (staffQuery.isPending) {
      return (
        <div className="mt-10">
          <SkeletonRows rows={5} />
        </div>
      )
    }
    if (staffQuery.isError) {
      const message =
        staffQuery.error instanceof ApiClientError
          ? staffQuery.error.message
          : 'The staff list could not be loaded. Check the connection, then try again.'
      return (
        <div className="mt-10" role="alert">
          <p className="font-medium text-mercury">{message}</p>
          <button
            type="button"
            onClick={() => staffQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-ink/30 bg-white px-4 font-semibold text-ink transition-colors duration-150 hover:border-ink"
          >
            Try again
          </button>
        </div>
      )
    }

    const groups = groupStaff(staffQuery.data.staff)
    return (
      <div className="mt-2">
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`${group.key}-heading`}
            className="mt-8 border-t border-ink/15 pt-6 first:mt-6"
          >
            <h2 id={`${group.key}-heading`} className="font-signage text-2xl font-semibold text-ink">
              {group.title}
            </h2>
            <p className="mt-1 text-muted">{group.description}</p>
            <ul className="mt-3 flex flex-col">
              {group.staff.map((member, index) => {
                const isPending = pendingId === member.id
                const isFailed = failedId === member.id
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => signIn.mutate(member.id)}
                      disabled={signIn.isPending}
                      aria-describedby={isFailed ? 'sign-in-error' : undefined}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-sm px-2 text-left transition-colors duration-150 hover:bg-ink/5 ${
                        isFailed ? 'outline outline-1 outline-mercury' : ''
                      }`}
                    >
                      <IdTag label={`${group.tagPrefix}-${index + 1}`} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold text-ink">
                          {isPending ? `Signing in as ${member.name.replace(/^Nurse\s+/, '')}` : member.name.replace(/^Nurse\s+/, '')}
                        </span>
                        <span className="block text-sm text-muted">
                          {group.tagPrefix}-{index + 1}, password: demo
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <header>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="relative inline-block h-10 w-10 shrink-0 rounded-sm bg-ink">
            <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-gauze" />
          </span>
          <h1 className="font-signage text-5xl font-bold tracking-tight text-ink sm:text-6xl">
            WardRound
          </h1>
        </div>
        <p className="mt-3 max-w-prose text-muted">
          Ward rounds and discharge tracker for a quarantine and treatment centre.
        </p>
      </header>

      <p className="mt-6 max-w-prose text-muted">
        Demo mode: choose a person to sign in as. In production each user signs in with their own
        account.
      </p>

      {signIn.isError && (
        <p id="sign-in-error" role="alert" className="mt-4 font-medium text-mercury">
          {signIn.error instanceof ApiClientError
            ? signIn.error.message
            : 'Signing in failed. Check the connection, then try again.'}
        </p>
      )}

      {renderBody()}
    </main>
  )
}
