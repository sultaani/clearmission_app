'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { formatNaira, formatDate } from '@/lib/format';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';

type QuotationDetail = {
  id: string; quotation_no: string; customer_name: string; total: string; valid_until: string | null;
  remark: string | null; created_at: string;
  items: Array<{ description: string; quantity: number; rate: number; total: number }>;
};

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState<QuotationDetail | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/quotations/${id}`).then((r) => r.json()).then((d) => (d.error ? setError(d.error) : setQ(d)));
  }, [id]);

  async function convert() {
    setConverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotations/${id}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push(`/job-orders/${data.jobOrderId}`);
    } finally {
      setConverting(false);
    }
  }

  if (error && !q) return <AppShell><p className="text-clay">{error}</p></AppShell>;
  if (!q) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">{q.quotation_no}</h1>
        <p className="text-sm text-ink/60">{q.customer_name} · {formatDate(q.created_at)}</p>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((item, i) => (
              <tr key={i} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink">{item.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{item.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink/70">{formatNaira(item.rate)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-mist-border bg-mist px-4 py-3 sm:w-72 sm:self-end">
        <span className="text-sm font-medium">Total</span>
        <span className="tabular-nums text-lg font-bold text-forest-700">{formatNaira(q.total)}</span>
      </div>

      <Button onClick={convert} disabled={converting} className="mt-6">
        {converting ? 'Converting…' : 'Convert to Job Order'} <ArrowRight size={16} />
      </Button>
    </AppShell>
  );
}
