import { SignJWT, jwtVerify } from 'jose';
import { pool } from './db';

const DEV_FALLBACK_SECRET = 'dev-only-secret-change-in-production';
const rawSecret = process.env.SESSION_SECRET;

// Refuse to serve any request in production with no real secret set, rather than
// silently signing every session with a value that's sitting in plain text in this
// source file. This throws at module load, which — since every authenticated route
// imports something from this file, directly or via apiHelpers — means the app fails
// loudly on the first request instead of quietly accepting a known, guessable secret.
if (process.env.NODE_ENV === 'production' && (!rawSecret || rawSecret === DEV_FALLBACK_SECRET)) {
  throw new Error(
    'SESSION_SECRET must be set to a real, unique value in production. ' +
    'Refusing to start with an unset or default development secret.'
  );
}

const SECRET = new TextEncoder().encode(rawSecret ?? DEV_FALLBACK_SECRET);
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h inactivity-style expiry, reissued each request

export type SessionUser = { id: string; username: string; role: 'admin' | 'cashier' };

/** Verifies username/password against the DB (bcrypt hash stored via pgcrypto). */
export async function verifyLogin(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active
       FROM users
      WHERE username = $1
        AND password_hash = crypt($2, password_hash)`,
    [username, password]
  );
  const user = rows[0];
  if (!user || !user.is_active) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SECRET);
}

/**
 * Double-submit-cookie CSRF token. Issued alongside the session cookie on
 * login as a NON-httpOnly cookie (client JS needs to read it to echo it
 * back), and verified against the X-CSRF-Token header on every
 * state-changing request. sameSite:lax on the session cookie already blocks
 * most cross-site POSTs, but this covers browsers/configurations that don't
 * enforce it and is standard defense in depth for a finance app.
 */
export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: payload.sub as string,
      username: payload.username as string,
      role: payload.role as 'admin' | 'cashier',
    };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Throws AuthError if the user isn't logged in, or isn't one of `roles` when given. */
export function requireRole(user: SessionUser | null, roles?: Array<'admin' | 'cashier'>) {
  if (!user) throw new AuthError('Not authenticated', 401);
  if (roles && !roles.includes(user.role)) {
    throw new AuthError(`Requires role: ${roles.join(' or ')}`, 403);
  }
}

/**
 * Stamps the acting user onto the DB session (via SET LOCAL) so the generic
 * audit_logs trigger (fn_audit_trigger, reads app.current_user_id) can
 * attribute inserts/updates to the right person even though those triggers
 * fire deep inside plain SQL, with no direct access to the HTTP request.
 */
export async function withActor<T>(
  client: import('pg').PoolClient,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
  return fn();
}

export async function listUsers() {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active, created_at FROM users ORDER BY username`
  );
  return rows;
}

export async function createUser(input: { username: string; password: string; role: 'admin' | 'cashier' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, crypt($2, gen_salt('bf')), $3)
     RETURNING id, username, role, is_active, created_at`,
    [input.username, input.password, input.role]
  );
  return rows[0];
}

export async function setUserActive(id: string, isActive: boolean) {
  const { rows } = await pool.query(
    `UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1
     RETURNING id, username, role, is_active, created_at`,
    [id, isActive]
  );
  return rows[0] ?? null;
}
