import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { listAuditLogs } from '@/lib/services/auditLogs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['admin']); // PRD #3.2 — Cashier cannot access audit logs
  const module_ = req.nextUrl.searchParams.get('module') ?? undefined;
  const recordId = req.nextUrl.searchParams.get('recordId') ?? undefined;
  return NextResponse.json(await listAuditLogs({ module: module_, recordId }));
});
