import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { materialReport } from '@/lib/services/reports';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const itemId = req.nextUrl.searchParams.get('inventoryItemId');
  if (!itemId) return NextResponse.json({ error: 'inventoryItemId is required' }, { status: 400 });
  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const to = req.nextUrl.searchParams.get('to') ?? undefined;
  return NextResponse.json(await materialReport(itemId, { from, to }));
});
