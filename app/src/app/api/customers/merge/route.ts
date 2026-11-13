import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { mergeCustomers, listMerges } from '@/lib/services/customerMerge';

// Merging rewrites history for several customers at once, so it is Admin-only.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  if (typeof body.survivorId !== 'string' || !Array.isArray(body.sourceIds)) {
    return NextResponse.json({ error: 'survivorId and sourceIds are required' }, { status: 400 });
  }
  const result = await mergeCustomers(
    {
      survivorId: body.survivorId,
      sourceIds: body.sourceIds.filter((x: unknown): x is string => typeof x === 'string'),
      newName: typeof body.newName === 'string' ? body.newName : undefined,
    },
    user!.id
  );
  return NextResponse.json(result);
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  return NextResponse.json(await listMerges());
});
