import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { salesReport } from '@/lib/services/reports';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  return NextResponse.json(await salesReport({ from, to }));
});
