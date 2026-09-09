import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { softDelete, restore } from '@/lib/services/deletedRecords';

export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) => {
    const { entity, id } = await params;
    const user = await getSessionUser(req);
    requireRole(user, ['admin']);
    await softDelete(entity, id, user!.id);
    return NextResponse.json({ ok: true });
  }
);

export const PATCH = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) => {
    const { entity, id } = await params;
    const user = await getSessionUser(req);
    requireRole(user, ['admin']);
    const body = await req.json();
    if (body.action !== 'restore') {
      return NextResponse.json({ error: "Only { action: 'restore' } is supported" }, { status: 400 });
    }
    await restore(entity, id, user!.id);
    return NextResponse.json({ ok: true });
  }
);
