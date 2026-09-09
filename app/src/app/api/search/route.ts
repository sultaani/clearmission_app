import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { globalSearch } from '@/lib/services/search';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) return NextResponse.json([]);
  return NextResponse.json(await globalSearch(q.trim()));
});
