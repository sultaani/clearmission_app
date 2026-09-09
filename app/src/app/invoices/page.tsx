'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, paymentStatusTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { formatNaira, formatDate } from '@/lib/format';
import { FilePdf } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

type Invoice = { id: string; invoice_no: string; customer_name: string; subtotal: string; outstanding: string; payment_status: string; created_at: string };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetch('/api/invoices').then((r) => r.json()).then(setInvoices);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Invoices</h1>
        <p className="text-sm text-ink/60">Every invoice generated from a job order</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-forest-700 hover:underline">{inv.invoice_no}</Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{inv.customer_name}</td>
                <td className="px-4 py-3 text-ink/70">{formatDate(inv.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNaira(inv.subtotal)}</td>
                <td className="px-4 py-3"><Badge tone={paymentStatusTone(inv.payment_status)}>{inv.payment_status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary"><FilePdf size={14} /> PDF</Button>
                  </a>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
