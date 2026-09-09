import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { recordExpense, listExpenses } from '@/lib/services/expenses';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  return NextResponse.json(await listExpenses());
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user); // PRD #41 — both Admin and Cashier can record expenses, no approval workflow
  const body = await req.json();
  const result = await recordExpense({ ...body, recordedBy: user!.id });
  return NextResponse.json(result, { status: 201 });
});
