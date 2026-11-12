// Middleware: security headers, server-side sessions (R31), permission-based
// RBAC via the domain's can(), and the same-origin / JSON-content-type guard
// for mutations. No role names are hard-coded in route handlers.
import { getCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { can, type Permission } from '../domain'
import type { AppEnv } from './env'
import { getSessionSecret, verifySessionToken, SESSION_COOKIE } from './auth'
import { getStaff, getWorkspaceDay } from './db'

export function apiError(c: Context<AppEnv>, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ error: { code, message } }, { status })
}

/** nosniff and a restrictive CSP on every API response. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Content-Security-Policy', "default-src 'none'")
}

/** Verify the signed cookie, re-load staff from the DB (role is authoritative
 * there, never in the cookie), and attach the principal to the context. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return apiError(c, 401, 'NO_SESSION', 'Sign in to continue.')
  const secret = await getSessionSecret(c.env.DB, c.env.SESSION_SECRET)
  const payload = await verifySessionToken(secret, token)
  if (!payload) return apiError(c, 401, 'NO_SESSION', 'The session is invalid. Sign in again.')
  if (payload.exp * 1000 <= Date.now()) {
    return apiError(c, 401, 'NO_SESSION', 'The session has expired. Sign in again.')
  }
  const [staff, currentDay] = await Promise.all([
    getStaff(c.env.DB, payload.wsId, payload.staffId),
    getWorkspaceDay(c.env.DB, payload.wsId),
  ])
  if (!staff || !currentDay) {
    return apiError(c, 401, 'NO_SESSION', 'The workspace no longer exists. Sign in again.')
  }
  // The session cookie is signed and short-lived; the workspace's own data is
  // not evidence of anything, so a read must not cost a write. Touching
  // last_active_at on every request burned the free-tier row budget and made
  // every GET fail once the cap was reached.
  c.set('staff', staff)
  c.set('principal', {
    workspaceId: payload.wsId,
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    isHead: staff.isHead,
    currentDay,
  })
  await next()
}

export const requirePermission = (permission: Permission): MiddlewareHandler<AppEnv> => async (c, next) => {
  const principal = c.get('principal')
  if (!principal || !can(principal, permission)) {
    return apiError(c, 403, 'FORBIDDEN', 'Your role does not have permission for this action.')
  }
  await next()
}

/** Mutations: JSON body and same-origin Origin (the check skips when no Origin
 * header is present, e.g. same-origin tools and tests). */
export const mutationGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const contentType = c.req.header('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    return apiError(c, 400, 'INVALID_BODY', 'Mutating requests need a JSON content type.')
  }
  const origin = c.req.header('origin')
  if (origin && new URL(origin).host !== new URL(c.req.url).host) {
    return apiError(c, 403, 'FORBIDDEN', 'Cross-origin mutation blocked.')
  }
  await next()
}
