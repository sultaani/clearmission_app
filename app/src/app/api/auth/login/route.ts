import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, createSessionToken, generateCsrfToken } from '@/lib/auth';
import { withErrorHandling } from '@/lib/apiHelpers';
import { isRateLimited, recordFailedAttempt, clearAttempts, getClientKey } from '@/lib/rateLimit';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const clientKey = getClientKey(req);

  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: 'Too many failed login attempts. Try again in a few minutes.' },
      { status: 429 }
    );
  }

  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'username and password are required' }, { status: 400 });
  }
  const user = await verifyLogin(username, password);
  if (!user) {
    recordFailedAttempt(clientKey);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  clearAttempts(clientKey);

  const token = await createSessionToken(user);
  const csrfToken = generateCsrfToken();
  const res = NextResponse.json({ user });
  res.cookies.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
    path: '/',
  });
  // Deliberately NOT httpOnly — client JS reads this to echo it back as a header.
  // The security property comes from same-origin JS being the only thing that can
  // read it, not from secrecy against the browser itself.
  res.cookies.set('csrf_token', csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
    path: '/',
  });
  return res;
});
