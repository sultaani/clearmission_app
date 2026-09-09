import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listExpenseCategories, createExpenseCategory } from '@/lib/services/expenses';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  return NextResponse.json(await listExpenseCategories());
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const category = await createExpenseCategory(name);
  return NextResponse.json(category, { status: 201 });
});
