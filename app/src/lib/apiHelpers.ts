import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SessionUser, AuthError } from './auth';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Double-submit CSRF check for state-changing requests. The client must echo
 * the (non-httpOnly) csrf_token cookie back as an X-CSRF-Token header — an
 * attacker's cross-site form can make the browser send the cookie
 * automatically, but can't read it to put in a header, since it isn't their
 * origin. Login/logout are exempt: there's no session yet to protect on
 * login, and logout has no side effect worth forging.
 */
function checkCsrf(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return true;
  if (req.nextUrl.pathname === '/api/auth/login' || req.nextUrl.pathname === '/api/auth/logout') return true;

  const cookieToken = req.cookies.get('csrf_token')?.value;
  const headerToken = req.headers.get('x-csrf-token');
  return !!cookieToken && !!headerToken && cookieToken === headerToken;
}

/**
 * node-postgres throws errors with a 5-character SQLSTATE `.code` (e.g. '22P02'
 * for a malformed UUID, '23505' for a unique violation). Those messages are
 * meant for a developer reading a log, not a client — they can describe
 * column types, constraint names, and other implementation detail that has
 * no business leaving the server. Anything we threw ourselves in application
 * code (`throw new Error('Payment amount must be positive')`) has no such
 * code and is exactly the kind of message we WANT the client to see.
 */
function isRawDatabaseError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = (err as { code: unknown }).code;
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return false;
  // P0001 is Postgres's default code for a plain `RAISE EXCEPTION` with no
  // explicit SQLSTATE — that's exactly how this app raises its own deliberate,
  // user-facing business-rule messages (e.g. "Not enough Flex in stock: need
  // 22.5m but only 2.5m available", from the inventory triggers). Those are
  // meant to reach the client; only genuine internal/driver errors (invalid
  // input syntax, constraint names, column types) should be masked.
  return code !== 'P0001';
}

/** Wraps a route handler: catches AuthError/validation errors into consistent JSON responses. */
export function withErrorHandling(
  handler: (req: NextRequest, ctx: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: any) => {
    try {
      if (!checkCsrf(req)) {
        return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
      }
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      if (isRawDatabaseError(err)) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}
