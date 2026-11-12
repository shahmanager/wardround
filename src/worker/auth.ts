// HMAC-signed HttpOnly session cookie. The payload is { wsId, staffId, exp };
// the role is never carried in the cookie — it is re-read from the staff table
// on every request (R31). The signing secret comes from SESSION_SECRET, or is
// lazily bootstrapped into the meta table (never exposed to clients).
import { one } from './db'

export const SESSION_COOKIE = 'wr_session'
const TTL_S = 12 * 60 * 60

function toB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const strB64url = (s: string): string => toB64url(new TextEncoder().encode(s))

function fromB64url(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4))
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}

async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)))
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export interface SessionPayload {
  wsId: string
  staffId: string
  exp: number
}

export async function sessionCookie(secret: string, wsId: string, staffId: string): Promise<string> {
  const payload: SessionPayload = { wsId, staffId, exp: Math.floor(Date.now() / 1000) + TTL_S }
  const body = strB64url(JSON.stringify(payload))
  const sig = toB64url(await hmac(secret, body))
  return `${SESSION_COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_S}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export async function verifySessionToken(secret: string, token: string): Promise<SessionPayload | null> {
  const dot = token.indexOf('.')
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = toB64url(await hmac(secret, body))
  if (!bytesEqual(fromB64url(sig), fromB64url(expected))) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<SessionPayload>
    if (typeof payload.wsId !== 'string' || typeof payload.staffId !== 'string' || typeof payload.exp !== 'number') {
      return null
    }
    return payload as SessionPayload
  } catch {
    return null
  }
}

let cachedSecret: string | null = null

export async function getSessionSecret(db: D1Database, provided?: string): Promise<string> {
  if (provided) return provided
  if (cachedSecret) return cachedSecret
  const existing = await one(db, "SELECT value FROM meta WHERE key = 'session_secret'")
  if (existing) {
    cachedSecret = String(existing.value)
    return cachedSecret
  }
  const generated = crypto.randomUUID() + crypto.randomUUID()
  await db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('session_secret', ?)").bind(generated).run()
  const back = await one(db, "SELECT value FROM meta WHERE key = 'session_secret'")
  cachedSecret = back ? String(back.value) : generated
  return cachedSecret
}
