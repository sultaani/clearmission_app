import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listUnresolvedConflicts, resolveConflict } from '@/lib/services/offlineSync';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  return NextResponse.json(await listUnresolvedConflicts());
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const { conflictId } = await req.json();
  const result = await resolveConflict(conflictId, user!.id);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result);
});
