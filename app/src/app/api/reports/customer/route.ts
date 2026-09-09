import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { customerReport } from '@/lib/services/reports';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  return NextResponse.json(await customerReport());
});
