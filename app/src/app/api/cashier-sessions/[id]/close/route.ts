import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { closeSession } from '@/lib/services/cashierSessions';

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user, ['cashier']);
  const body = await req.json();
  const result = await closeSession({ sessionId: id, ...body });
  return NextResponse.json(result);
});
