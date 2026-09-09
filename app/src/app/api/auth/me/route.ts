import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  return NextResponse.json({ user });
});
