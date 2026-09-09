import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { recordProcurement } from '@/lib/services/inventory';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']); // PRD lists "Record procurement" under Admin only, not Cashier
  const body = await req.json();
  const result = await recordProcurement({ ...body, recordedBy: user!.id });
  return NextResponse.json(result, { status: 201 });
});
