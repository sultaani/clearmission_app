import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { getJobOrder, softDeleteJobOrder, restoreJobOrder } from '@/lib/services/jobOrders';

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user);
  const jo = await getJobOrder(id);
  if (!jo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(jo);
});

// DELETE = soft delete. Admin only (PRD #3.1 — deleted records / restore are Admin-only).
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  await softDeleteJobOrder(id, user!.id);
  return NextResponse.json({ ok: true });
});

// PATCH { action: 'restore' } — Admin only
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user, ['admin']);
  const body = await req.json();
  if (body.action !== 'restore') {
    return NextResponse.json({ error: "Only { action: 'restore' } is supported" }, { status: 400 });
  }
  await restoreJobOrder(id, user!.id);
  return NextResponse.json({ ok: true });
});
