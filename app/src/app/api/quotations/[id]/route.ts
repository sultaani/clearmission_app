import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { getQuotationDetail } from '@/lib/services/quotations';

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user);
  const q = await getQuotationDetail(id);
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(q);
});
