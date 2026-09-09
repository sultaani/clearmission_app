import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { recordAdjustment } from '@/lib/services/inventory';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  await recordAdjustment({ ...body, performedBy: user!.id });
  return NextResponse.json({ ok: true }, { status: 201 });
});
