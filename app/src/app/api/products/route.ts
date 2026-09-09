import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listProducts, createProduct } from '@/lib/services/products';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const category = req.nextUrl.searchParams.get('category') ?? undefined;
  return NextResponse.json(await listProducts(category));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  const product = await createProduct(body);
  return NextResponse.json(product, { status: 201 });
});
