'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { formatNaira, formatDate } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { DownloadSimple } from '@phosphor-icons/react/dist/ssr';
import clsx from 'clsx';

type Tab = 'financial' | 'sales' | 'customer' | 'inventory';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'financial', label: 'Financial' },
  { key: 'sales', label: 'Sales' },
  { key: 'customer', label: 'Customers' },
  { key: 'inventory', label: 'Inventory' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('financial');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // Intentional: clear stale data from the previous tab before the new tab's fetch
    // resolves, so switching tabs never shows one tab's numbers mislabeled as another's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    fetch(`/api/reports/${tab}`).then((r) => r.json()).then(setData);
  }, [tab]);

  function handleExport() {
    if (!data) return;
    const today = new Date().toISOString().slice(0, 10);
    if (tab === 'financial' && data.daily) {
      downloadCsv(`clearmission-financial-${today}.csv`, data.daily);
    } else if (Array.isArray(data)) {
      downloadCsv(`clearmission-${tab}-${today}.csv`, data);
    }
  }

  const canExport = tab === 'financial' ? data?.daily?.length > 0 : Array.isArray(data) && data.length > 0;

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Reports</h1>
          <p className="text-sm text-ink/60">Business performance across every area</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={!canExport}>
          <DownloadSimple size={16} /> Export CSV
        </Button>
      </div>

      <div className="mb-6 flex gap-1 border-b border-mist-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-200',
              tab === t.key ? 'border-forest text-forest-700' : 'border-transparent text-ink/50 hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data && <p className="text-sm text-ink/50">Loading…</p>}

      {data && tab === 'financial' && (
        <div className="overflow-x-auto rounded-lg border border-mist-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Material cost</th>
                <th className="px-4 py-3 text-right">Expenses</th>
                <th className="px-4 py-3 text-right">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {data.daily?.map((d: any, i: number) => (
                <tr key={i} className="border-b border-mist-border last:border-0">
                  <td className="px-4 py-3 text-ink/70">{formatDate(d.day)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(d.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(d.material_cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(d.expenses)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-forest-700">{formatNaira(d.net_profit)}</td>
                </tr>
              ))}
            </tbody>
            {data.totals && (
              <tfoot>
                <tr className="border-t-2 border-mist-border bg-mist font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(data.totals.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(data.totals.material_cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(data.totals.expenses)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-forest-700">{formatNaira(data.totals.net_profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {data && tab === 'sales' && (
        <div className="overflow-x-auto rounded-lg border border-mist-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Job Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.map?.((r: any, i: number) => (
                <tr key={i} className="border-b border-mist-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.job_order_no}</td>
                  <td className="px-4 py-3 text-ink/70">{r.customer}</td>
                  <td className="px-4 py-3 text-ink/70">{r.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNaira(r.collected_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'customer' && (
        <div className="overflow-x-auto rounded-lg border border-mist-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Job Orders</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.map?.((r: any, i: number) => (
                <tr key={i} className="border-b border-mist-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.total_job_orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-forest-700">{formatNaira(r.total_revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-clay">{formatNaira(r.outstanding_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'inventory' && (
        <div className="overflow-x-auto rounded-lg border border-mist-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty on hand</th><th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.map?.((r: any, i: number) => (
                <tr key={i} className="border-b border-mist-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(r.quantity_on_hand).toLocaleString()} {r.unit}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-forest-700">{formatNaira(r.inventory_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
