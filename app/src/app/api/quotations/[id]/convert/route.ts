import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { convertQuotationToJobOrder } from '@/lib/services/jobOrders';

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user);
  const result = await convertQuotationToJobOrder(id, user!.id);
  return NextResponse.json(result, { status: 201 });
});
