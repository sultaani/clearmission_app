import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { getInvoiceDetail } from '@/lib/services/payments';

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user);
  const inv = await getInvoiceDetail(id);
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(inv);
});
