import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { recordPayment } from '@/lib/services/payments';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const body = await req.json();
  const result = await recordPayment({ ...body, recordedBy: user!.id });
  return NextResponse.json(result, { status: 201 });
});
