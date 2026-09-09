import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listInventoryItemsByGroup } from '@/lib/services/inventory';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const group = req.nextUrl.searchParams.get('group');
  if (!group) return NextResponse.json({ error: 'group is required' }, { status: 400 });
  return NextResponse.json(await listInventoryItemsByGroup(group));
});
