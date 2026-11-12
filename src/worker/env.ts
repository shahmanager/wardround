// Worker-local typing: the Hono context carries the principal loaded by the
// session middleware plus the full staff row (for /api/me).
import type { Principal, Staff } from '../domain'
import type { Env } from './index'

export interface AppEnv {
  Bindings: Env
  Variables: { principal: Principal; staff: Staff }
}
