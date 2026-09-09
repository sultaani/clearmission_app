import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { createJobOrder, listJobOrders } from '@/lib/services/jobOrders';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user); // both roles can see the job order list (PRD: Cashier "Search transactions")
  return NextResponse.json(await listJobOrders());
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user); // both Admin and Cashier can create Job Orders
  const body = await req.json();
  const result = await createJobOrder({ ...body, cashierId: user!.id });
  return NextResponse.json(result, { status: 201 });
});
