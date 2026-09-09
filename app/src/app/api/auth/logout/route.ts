import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/apiHelpers';

export const POST = withErrorHandling(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', '', { maxAge: 0, path: '/' });
  res.cookies.set('csrf_token', '', { maxAge: 0, path: '/' });
  return res;
});
