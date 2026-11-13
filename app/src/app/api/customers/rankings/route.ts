import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { getCustomerRankings } from '@/lib/services/customerRankings';

// Per-customer revenue is management analytics (PRD: Cashier cannot see it), so Admin-only.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get('year') ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  const metric = sp.get('metric') === 'revenue' ? 'revenue' : 'orders';
  const includeExcluded = sp.get('includeExcluded') === '1';
  return NextResponse.json(await getCustomerRankings({ year, metric, includeExcluded }));
});
