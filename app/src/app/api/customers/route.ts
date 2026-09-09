import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/apiHelpers';
import { withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listCustomers, createCustomer } from '@/lib/services/customers';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user); // any authenticated role — both Admin and Cashier manage customers
  const search = req.nextUrl.searchParams.get('search') ?? undefined;
  return NextResponse.json(await listCustomers(search));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  return NextResponse.json(await createCustomer(body), { status: 201 });
});
