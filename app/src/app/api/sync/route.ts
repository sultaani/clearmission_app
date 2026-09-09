import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { syncBatch, SyncOperation } from '@/lib/services/offlineSync';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user, ['cashier']); // offline queue is the Cashier POS's, not Admin's
  const body = await req.json();
  const operations: SyncOperation[] = body.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    return NextResponse.json({ error: 'operations must be a non-empty array' }, { status: 400 });
  }
  const results = await syncBatch(user!.id, operations);
  return NextResponse.json({ results });
});
