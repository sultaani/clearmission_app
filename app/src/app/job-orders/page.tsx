'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge, paymentStatusTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { formatNaira, formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { DownloadSimple } from '@phosphor-icons/react/dist/ssr';

type JobOrderRow = {
  id: string;
  job_order_no: string;
  created_at: string;
  customer_name: string;
  subtotal: string;
  outstanding_balance: string;
  payment_status: string;
};

export default function JobOrdersPage() {
  const [rows, setRows] = useState<JobOrderRow[] | null>(null);

  useEffect(() => {
    fetch('/api/job-orders').then((r) => r.json()).then(setRows);
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Job Orders</h1>
          <p className="text-sm text-ink/60">Every job order, most recent first</p>
        </div>
        <Button
          variant="secondary" size="sm" disabled={!rows?.length}
          onClick={() => rows && downloadCsv(`clearmission-job-orders-${new Date().toISOString().slice(0, 10)}.csv`, rows)}
        >
          <DownloadSimple size={16} /> Export CSV
        </Button>
      </div>

      {rows && (
        <div className="overflow-x-auto rounded-lg border border-mist-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Job Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-mist-border last:border-0 hover:bg-mist/50">
                  <td className="px-4 py-3">
                    <Link href={`/job-orders/${row.id}`} className="font-medium text-forest-700 hover:underline">
                      {row.job_order_no}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-ink/70">{row.customer_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(row.subtotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(row.outstanding_balance)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={paymentStatusTone(row.payment_status)}>{row.payment_status}</Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">No job orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
