import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { dashboardSummary } from '@/lib/services/dashboard';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']); // PRD #3.2 — Cashier cannot access management analytics
  return NextResponse.json(await dashboardSummary());
});
