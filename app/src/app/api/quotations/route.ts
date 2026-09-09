import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { createQuotation, listQuotations } from '@/lib/services/quotations';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const customerId = req.nextUrl.searchParams.get('customerId') ?? undefined;
  return NextResponse.json(await listQuotations(customerId));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const body = await req.json();
  const result = await createQuotation({ ...body, createdBy: user!.id });
  return NextResponse.json(result, { status: 201 });
});
