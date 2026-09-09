import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listDeletedRecords } from '@/lib/services/deletedRecords';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']); // PRD #3.1/#77 — viewing/restoring deleted records is Admin-only
  const entity = req.nextUrl.searchParams.get('entity');
  return NextResponse.json(await listDeletedRecords(entity ?? undefined));
});
