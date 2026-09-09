import { pool } from '../db';

export async function listAuditLogs(filters: { module?: string; recordId?: string; limit?: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.module) { params.push(filters.module); conditions.push(`module = $${params.length}`); }
  if (filters.recordId) { params.push(filters.recordId); conditions.push(`record_id = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(filters.limit ?? 100);

  const { rows } = await pool.query(
    `SELECT al.*, u.username AS actor_username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
      ORDER BY al.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}
