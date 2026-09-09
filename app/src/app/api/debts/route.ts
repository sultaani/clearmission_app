import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listDebts, debtAgingSummary } from '@/lib/services/debts';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const customerId = req.nextUrl.searchParams.get('customerId') ?? undefined;
  const summary = req.nextUrl.searchParams.get('summary') === 'true';
  if (summary) {
    requireRole(user, ['admin']); // aging summary is a financial analytic — Admin only per PRD #63
    return NextResponse.json(await debtAgingSummary());
  }
  return NextResponse.json(await listDebts(customerId));
});
