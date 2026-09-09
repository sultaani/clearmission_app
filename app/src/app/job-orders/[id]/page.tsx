'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Badge, paymentStatusTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { formatNaira, formatDateTime } from '@/lib/format';
import { useAuth } from '@/lib/AuthContext';
import { FilePdf, Image as ImageIcon, Trash } from '@phosphor-icons/react/dist/ssr';

type JobOrderDetail = {
  id: string;
  job_order_no: string;
  customer_name: string;
  cashier_username: string;
  subtotal: string;
  amount_paid: string;
  outstanding_balance: string;
  payment_status: string;
  created_at: string;
  remark: string | null;
  invoice_id: string | null;
  items: Array<{
    id: string; description: string; quantity: string; unit: string;
    standard_rate: string; collected_amount: string; material_cost: string;
  }>;
};

export default function JobOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [jo, setJo] = useState<JobOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/job-orders/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setJo(data);
      });
  }, [id]);

  async function handleDelete() {
    if (!confirm('Delete this job order? It will be removed from all totals but can be restored by an Admin.')) return;
    const res = await fetch(`/api/job-orders/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/job-orders');
    else setError((await res.json()).error);
  }

  if (error) {
    return (
      <AppShell>
        <p className="text-clay">{error}</p>
      </AppShell>
    );
  }
  if (!jo) {
    return (
      <AppShell>
        <p className="text-ink/50">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{jo.job_order_no}</h1>
          <p className="text-sm text-ink/60">{jo.customer_name} · {formatDateTime(jo.created_at)} · by {jo.cashier_username}</p>
        </div>
        <Badge tone={paymentStatusTone(jo.payment_status)}>{jo.payment_status}</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {jo.items.map((item) => (
              <tr key={item.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink">{item.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{item.quantity} {item.unit}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{formatNaira(item.standard_rate)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">{formatNaira(item.collected_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-1 rounded-lg border border-mist-border bg-mist px-4 py-3 text-sm sm:w-72 sm:self-end">
        <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular-nums">{formatNaira(jo.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink/60">Paid</span><span className="tabular-nums text-forest-700">{formatNaira(jo.amount_paid)}</span></div>
        <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="tabular-nums text-clay">{formatNaira(jo.outstanding_balance)}</span></div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {jo.invoice_id && (
          <>
            <a href={`/api/invoices/${jo.invoice_id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="secondary"><FilePdf size={16} /> Invoice PDF</Button>
            </a>
            <a href={`/api/invoices/${jo.invoice_id}/jpg`} target="_blank" rel="noreferrer">
              <Button variant="secondary"><ImageIcon size={16} /> Invoice JPG</Button>
            </a>
          </>
        )}
        {user?.role === 'admin' && (
          <Button variant="destructive" onClick={handleDelete}>
            <Trash size={16} /> Delete job order
          </Button>
        )}
      </div>
    </AppShell>
  );
}
