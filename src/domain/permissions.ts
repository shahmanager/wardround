// Permission-based RBAC (section 2). `can()` is the single source of truth:
// the Worker enforces it on every route; the UI uses the same function to
// hide or disable actions. Roles never gain permissions by being hard-coded
// in route handlers.
import type { Principal } from './types'

export const PERMISSIONS = [
  'patient.view',
  'reading.record',
  'reading.undo_own',
  'reading.correct',
  'reading.late_entry',
  'reading.accept_masked',
  'visit.log',
  'discharge.approve',
  'discharge.complete',
  'patient.admit',
  'waitlist.manage',
  'patient.record_death',
  'dashboard.view',
  'ops.view',
  'audit.view',
  'settings.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type Role = 'NURSE' | 'DOCTOR' | 'ADMIN'

export const ROLE_LABELS: Record<Role, string> = {
  NURSE: 'Nurse',
  DOCTOR: 'Doctor',
  ADMIN: 'Admin',
}

/**
 * Can this principal perform the permission?
 * The doctor's `reading.record` is the R11 exception path: it exists as a
 * permission but the route requires a reason and counts it as a process
 * exception on the dashboard.
 */
export function can(p: Pick<Principal, 'role' | 'isHead'>, permission: Permission): boolean {
  const isDoctor = p.role === 'DOCTOR'
  switch (permission) {
    case 'patient.view':
      return true
    case 'reading.record':
      return p.role === 'NURSE' || isDoctor
    case 'reading.undo_own':
      return p.role === 'NURSE'
    case 'reading.correct':
      return p.role === 'NURSE' || isDoctor
    case 'reading.late_entry':
      return isDoctor
    case 'reading.accept_masked':
      return isDoctor
    case 'visit.log':
      return isDoctor
    case 'discharge.approve':
      return isDoctor
    case 'discharge.complete':
      return p.role === 'ADMIN'
    case 'patient.admit':
      return p.role === 'ADMIN'
    case 'waitlist.manage':
      return p.role === 'ADMIN'
    case 'patient.record_death':
      return isDoctor
    case 'dashboard.view':
      return isDoctor && p.isHead
    case 'ops.view':
      return (isDoctor && p.isHead) || p.role === 'ADMIN'
    case 'audit.view':
      return (isDoctor && p.isHead) || p.role === 'ADMIN'
    case 'settings.manage':
      return isDoctor && p.isHead
  }
}
