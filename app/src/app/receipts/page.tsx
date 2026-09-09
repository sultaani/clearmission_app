'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { formatNaira, formatDate } from '@/lib/format';
import { FilePdf } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

type Receipt = { id: string; receipt_no: string; customer_name: string; amount: string; method: string; created_at: string };

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    fetch('/api/receipts').then((r) => r.json()).then(setReceipts);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Receipts</h1>
        <p className="text-sm text-ink/60">Every payment received</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/receipts/${r.id}`} className="font-medium text-forest-700 hover:underline">{r.receipt_no}</Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{r.customer_name}</td>
                <td className="px-4 py-3 text-ink/70">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-ink/70 capitalize">{r.method.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-forest-700">{formatNaira(r.amount)}</td>
                <td className="px-4 py-3 text-right">
                  <a href={`/api/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary"><FilePdf size={14} /> PDF</Button>
                  </a>
                </td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">No receipts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
