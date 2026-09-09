import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { openSession } from '@/lib/services/cashierSessions';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['cashier']); // sessions belong to the Cashier operating the till
  const result = await openSession(user!.id);
  return NextResponse.json(result, { status: 201 });
});
