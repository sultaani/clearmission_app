import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, withErrorHandling } from '@/lib/apiHelpers';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { withActor } from '@/lib/auth';
import { withTransaction } from '@/lib/db';

// Exposed mainly for completeness / manual correction — the normal path is
// createJobOrder's own combinedLayouts option, exercised in Phase 2/3.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  requireRole(user);
  const body = await req.json();
  const { jobOrderId, inventoryItemId, specifiedLength, specifiedWidthFt, quantityConsumed, remark } = body;
  const result = await withTransaction((client) =>
    withActor(client, user!.id, () =>
      client.query(
        `INSERT INTO material_layouts
           (job_order_id, inventory_item_id, specified_length, specified_width_ft,
            quantity_consumed, layout_method, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,'manual_layout',$6,$7) RETURNING id`,
        [jobOrderId, inventoryItemId, specifiedLength, specifiedWidthFt ?? null,
         quantityConsumed, remark ?? null, user!.id]
      )
    )
  );
  return NextResponse.json(result.rows[0], { status: 201 });
});
