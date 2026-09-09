'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { formatNaira, formatDateTime } from '@/lib/format';
import { FilePdf, Image as ImageIcon } from '@phosphor-icons/react/dist/ssr';

type ReceiptDetail = {
  id: string; receipt_no: string; created_at: string; amount: string; method: string;
  remark: string | null; customer_name: string; customer_phone: string | null;
  allocations: Array<{ invoice_no: string; invoice_id: string; amount_allocated: string; outstanding: string }>;
};

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/receipts/${id}`).then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setRec(d)));
  }, [id]);

  if (error) return <AppShell><p className="text-clay">{error}</p></AppShell>;
  if (!rec) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">{rec.receipt_no}</h1>
        <p className="text-sm text-ink/60">
          {rec.customer_name}{rec.customer_phone ? ` · ${rec.customer_phone}` : ''} · {formatDateTime(rec.created_at)}
        </p>
      </div>

      <div className="max-w-sm rounded-lg border border-mist-border p-5">
        <p className="text-sm text-ink/60">Amount received</p>
        <p className="tabular-nums text-2xl font-bold text-forest-700">{formatNaira(rec.amount)}</p>
        <p className="mt-1 text-sm capitalize text-ink/60">via {rec.method.replace('_', ' ')}</p>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Applied to</h2>
      <div className="flex flex-col gap-2">
        {rec.allocations.map((a, i) => (
          <div key={i} className="flex items-center justify-between rounded border border-mist-border px-4 py-2 text-sm">
            <Link href={`/invoices/${a.invoice_id}`} className="font-medium text-forest-700 hover:underline">{a.invoice_no}</Link>
            <div className="text-right">
              <p className="tabular-nums">{formatNaira(a.amount_allocated)}</p>
              <p className="text-xs text-ink/50">remaining: {formatNaira(a.outstanding)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <a href={`/api/receipts/${rec.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary"><FilePdf size={16} /> Download PDF</Button>
        </a>
        <a href={`/api/receipts/${rec.id}/jpg`} target="_blank" rel="noreferrer">
          <Button variant="secondary"><ImageIcon size={16} /> Download JPG</Button>
        </a>
      </div>
    </AppShell>
  );
}
