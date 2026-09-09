import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { renderInvoiceJpg } from '@/lib/services/documents';

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser(req);
  requireRole(user);
  const jpg = await renderInvoiceJpg(id);
  return new NextResponse(new Uint8Array(jpg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="invoice-${id}.jpg"`,
    },
  });
});
