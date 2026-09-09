'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Badge, paymentStatusTone } from '@/components/Badge';
import { formatNaira, formatDate } from '@/lib/format';

type CustomerProfile = {
  customer_id: string; customer_code: string; name: string;
  total_job_orders: number; total_revenue: number; outstanding_balance: number; avg_job_order_value: number;
  jobOrders: Array<{ id: string; job_order_no: string; subtotal: string; outstanding_balance: string; payment_status: string; created_at: string }>;
  debts: Array<{ invoice_no: string; outstanding: number; age_bucket: string }>;
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    fetch(`/api/customers/${id}`).then((r) => r.json()).then(setCustomer);
  }, [id]);

  if (!customer) {
    return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{customer.name}</h1>
          <p className="text-sm text-ink/60">{customer.customer_code}</p>
        </div>
        <Link href={`/customers/${customer.customer_id}/edit`}>
          <Button variant="secondary" size="sm">Edit</Button>
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Job orders</p>
          <p className="text-lg font-bold text-ink">{customer.total_job_orders}</p>
        </div>
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Total revenue</p>
          <p className="tabular-nums text-lg font-bold text-forest-700">{formatNaira(customer.total_revenue)}</p>
        </div>
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Outstanding</p>
          <p className="tabular-nums text-lg font-bold text-clay">{formatNaira(customer.outstanding_balance)}</p>
        </div>
        <div className="rounded-lg border border-mist-border p-4">
          <p className="text-xs text-ink/50">Avg order value</p>
          <p className="tabular-nums text-lg font-bold text-ink">{formatNaira(customer.avg_job_order_value)}</p>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink">Job order history</h2>
      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Job Order</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {customer.jobOrders.map((jo) => (
              <tr key={jo.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/job-orders/${jo.id}`} className="font-medium text-forest-700 hover:underline">{jo.job_order_no}</Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{formatDate(jo.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(jo.subtotal)}</td>
                <td className="px-4 py-3"><Badge tone={paymentStatusTone(jo.payment_status)}>{jo.payment_status}</Badge></td>
              </tr>
            ))}
            {customer.jobOrders.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/50">No job orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
