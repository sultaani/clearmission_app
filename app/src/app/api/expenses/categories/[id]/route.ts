import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { updateExpenseCategory } from '@/lib/services/expenses';

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  const updated = await updateExpenseCategory(id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
});
