'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { formatNaira, formatDateTime } from '@/lib/format';

type Payment = { id: string; amount: string; method: string; created_at: string; customer_name: string; recorded_by: string; receipt_no: string | null };

export default function PaymentsHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    fetch('/api/payments/history').then((r) => r.json()).then(setPayments);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Payment History</h1>
        <p className="text-sm text-ink/60">Every payment received, most recent first</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">By</th><th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 text-ink/70">{formatDateTime(p.created_at)}</td>
                <td className="px-4 py-3 text-ink">{p.customer_name}</td>
                <td className="px-4 py-3 text-ink/70 capitalize">{p.method.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-ink/70">{p.recorded_by}</td>
                <td className="px-4 py-3 text-right tabular-nums text-forest-700">{formatNaira(p.amount)}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">No payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
