'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Select } from '@/components/Field';
import { useAuth } from '@/lib/AuthContext';
import { formatNaira } from '@/lib/format';
import { ArrowLeft, Trophy } from '@phosphor-icons/react/dist/ssr';

type Metric = 'orders' | 'revenue';
type Ranked = { customer_id: string; name: string; job_orders: number; revenue: number; rank: number };
type Rankings = {
  year: number;
  metric: Metric;
  availableYears: number[];
  totals: { orders: number; revenue: number };
  customerOfTheYear: Ranked[];
  yearTop: Ranked[];
  months: Array<{ month: string; top: Ranked[]; tied: boolean }>;
};

const METRICS: Array<{ value: Metric; label: string; hint: string }> = [
  { value: 'orders', label: 'Most job orders', hint: 'Ties are broken by revenue' },
  { value: 'revenue', label: 'Highest revenue', hint: 'Ties are broken by job orders' },
];

function monthName(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-NG', { month: 'long' });
}

export default function TopCustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [metric, setMetric] = useState<Metric>('orders');
  const [includeAll, setIncludeAll] = useState(false);
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    const qs = new URLSearchParams({ year: String(year), metric, includeExcluded: includeAll ? '1' : '0' });
    fetch(`/api/customers/rankings?${qs}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? 'Could not load rankings');
        // If this year has no sales, jump to the latest year that does (this refetches).
        if (body.availableYears.length > 0 && !body.availableYears.includes(year)) {
          setYear(body.availableYears[0]);
          return;
        }
        setError(null);
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load rankings'));
  }, [isAdmin, year, metric, includeAll]);

  if (authLoading) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;
  if (!isAdmin) {
    return (
      <AppShell>
        <p className="text-sm text-ink/60">Top customers are visible to Admin accounts only.</p>
      </AppShell>
    );
  }

  const yearWinners = data?.customerOfTheYear ?? [];
  const winner = yearWinners[0];
  const share = winner && data && data.totals.revenue > 0 ? Math.round((winner.revenue / data.totals.revenue) * 100) : 0;
  const years = data?.availableYears.length ? data.availableYears : [year];

  return (
    <AppShell>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-ink/60 hover:text-forest-700">
        <ArrowLeft size={14} aria-hidden="true" />Customers
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Top customers</h1>
        <p className="text-sm text-ink/60">Who bought the most, month by month and across the year</p>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-32">
          <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Rank by</span>
          <div role="radiogroup" aria-label="Rank by" className="inline-flex overflow-hidden rounded border border-mist-border">
            {METRICS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={metric === m.value}
                title={m.hint}
                onClick={() => setMetric(m.value)}
                className={`cursor-pointer px-3 py-2 text-sm transition-colors duration-200 ${
                  metric === m.value ? 'bg-forest text-white' : 'bg-white text-ink hover:bg-mist'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink/80">
          <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} className="accent-forest" />
          Include walk-in and Clearmission&apos;s own jobs
        </label>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-clay">{error}</p>}
      {!data && !error && <p className="text-sm text-ink/50">Loading…</p>}

      {data && (
        <>
          <section aria-label={`Customer of the year ${data.year}`} className="mb-8 rounded-lg border border-forest bg-forest-50 p-5">
            <div className="flex items-start gap-4">
              <span className="rounded-full bg-forest p-3 text-white"><Trophy size={26} weight="fill" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-forest-700">Customer of the year {data.year}</p>
                {winner ? (
                  <>
                    <p className="text-2xl font-bold text-ink">
                      {yearWinners.map((w, i) => (
                        <span key={w.customer_id}>
                          {i > 0 && <span className="text-ink/40"> and </span>}
                          <Link href={`/customers/${w.customer_id}`} className="hover:underline">{w.name}</Link>
                        </span>
                      ))}
                    </p>
                    {yearWinners.length > 1 && <Badge tone="gold">Tied</Badge>}
                    <p className="mt-1 text-sm text-ink/70">
                      {winner.job_orders} job order{winner.job_orders === 1 ? '' : 's'} · {formatNaira(winner.revenue)}
                      {yearWinners.length === 1 && share > 0 && ` · ${share}% of ${data.year} revenue`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink/60">No sales recorded for {data.year}.</p>
                )}
              </div>
            </div>
          </section>

          {data.yearTop.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-ink">Top customers of {data.year}</h2>
              <div className="overflow-x-auto rounded-lg border border-mist-border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3 text-right">Job orders</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.yearTop.map((c) => (
                      <tr key={c.customer_id} className="border-b border-mist-border last:border-0">
                        <td className="px-4 py-3 tabular-nums text-ink/50">{c.rank}</td>
                        <td className="px-4 py-3">
                          <Link href={`/customers/${c.customer_id}`} className="font-medium text-forest-700 hover:underline">{c.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{c.job_orders}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Top customer each month</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.months.map((m) => {
                const winners = m.top.filter((t) => t.rank === 1);
                const rest = m.top.filter((t) => t.rank !== 1).slice(0, 2);
                return (
                  <div key={m.month} className="rounded-lg border border-mist-border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-ink/60">{monthName(m.month)}</p>
                      {m.tied && <Badge tone="gold">Tied</Badge>}
                    </div>
                    {winners.length === 0 ? (
                      <p className="text-sm text-ink/40">No sales</p>
                    ) : (
                      <>
                        {winners.map((w) => (
                          <div key={w.customer_id} className="mb-1">
                            <Link href={`/customers/${w.customer_id}`} className="block truncate font-medium text-ink hover:underline">{w.name}</Link>
                            <p className="text-xs tabular-nums text-forest-700">
                              {w.job_orders} order{w.job_orders === 1 ? '' : 's'} · {formatNaira(w.revenue)}
                            </p>
                          </div>
                        ))}
                        {rest.length > 0 && (
                          <ol className="mt-2 border-t border-mist-border pt-2 text-xs text-ink/60">
                            {rest.map((r) => (
                              <li key={r.customer_id} className="flex justify-between gap-2">
                                <span className="truncate">{r.rank}. {r.name}</span>
                                <span className="shrink-0 tabular-nums">{r.job_orders} · {formatNaira(r.revenue)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
