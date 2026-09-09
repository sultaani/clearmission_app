import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { setUserActive } from '@/lib/auth';

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  if (user!.id === id) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }
  const body = await req.json();
  const updated = await setUserActive(id, body.isActive);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
});
