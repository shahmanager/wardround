// WardRound Worker: Hono app for /api/*, static assets fall through from the
// platform (run_worker_first in wrangler.jsonc keeps the SPA fallback away
// from API routes). Sessions are HMAC-signed HttpOnly cookies; the role is
// always re-read from the staff table, never trusted from the client (R31).
import { Hono } from 'hono'
import { routes } from './routes'

export interface Env {
  DB: D1Database
  SESSION_SECRET?: string
  APP_ENV?: string
}

const app = new Hono<{ Bindings: Env }>()

app.route('/api', routes)

export default {
  fetch: app.fetch,
}
