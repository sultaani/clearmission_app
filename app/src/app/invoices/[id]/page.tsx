'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge, paymentStatusTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { formatNaira, formatDateTime } from '@/lib/format';
import { FilePdf, Image as ImageIcon } from '@phosphor-icons/react/dist/ssr';

type InvoiceDetail = {
  id: string; invoice_no: string; customer_name: string; customer_phone: string | null;
  job_order_no: string; job_order_id: string; subtotal: string; amount_paid: string;
  outstanding: string; payment_status: string; created_at: string;
  items: Array<{ description: string; quantity: string; unit: string; standard_rate: string; collected_amount: string }>;
  payments: Array<{ amount_allocated: string; method: string; created_at: string; receipt_no: string | null; receipt_id: string | null }>;
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/${id}`).then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setInv(d)));
  }, [id]);

  if (error) return <AppShell><p className="text-clay">{error}</p></AppShell>;
  if (!inv) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{inv.invoice_no}</h1>
          <p className="text-sm text-ink/60">
            {inv.customer_name}{inv.customer_phone ? ` · ${inv.customer_phone}` : ''} · {formatDateTime(inv.created_at)}
          </p>
          <Link href={`/job-orders/${inv.job_order_id}`} className="text-sm text-forest-700 hover:underline">
            From {inv.job_order_no}
          </Link>
        </div>
        <Badge tone={paymentStatusTone(inv.payment_status)}>{inv.payment_status}</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item, i) => (
              <tr key={i} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink">{item.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{item.quantity} {item.unit}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(item.collected_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-1 rounded-lg border border-mist-border bg-mist px-4 py-3 text-sm sm:w-72 sm:self-end">
        <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular-nums">{formatNaira(inv.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink/60">Paid</span><span className="tabular-nums text-forest-700">{formatNaira(inv.amount_paid)}</span></div>
        <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="tabular-nums text-clay">{formatNaira(inv.outstanding)}</span></div>
      </div>

      {inv.payments.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Payments applied</h2>
          <div className="flex flex-col gap-2">
            {inv.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-mist-border px-4 py-2 text-sm">
                <span className="text-ink/70">{formatDateTime(p.created_at)} · {p.method.replace('_', ' ')}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-medium text-forest-700">{formatNaira(p.amount_allocated)}</span>
                  {p.receipt_id && (
                    <a href={`/api/receipts/${p.receipt_id}/pdf`} target="_blank" rel="noreferrer" className="text-forest-700 hover:underline">
                      {p.receipt_no}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary"><FilePdf size={16} /> Download PDF</Button>
        </a>
        <a href={`/api/invoices/${inv.id}/jpg`} target="_blank" rel="noreferrer">
          <Button variant="secondary"><ImageIcon size={16} /> Download JPG</Button>
        </a>
      </div>
    </AppShell>
  );
}
