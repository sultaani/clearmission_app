import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listUsers, createUser } from '@/lib/auth';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  return NextResponse.json(await listUsers());
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  if (!body.username || !body.password || !body.role) {
    return NextResponse.json({ error: 'username, password, and role are all required' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  const created = await createUser(body);
  return NextResponse.json(created, { status: 201 });
});
