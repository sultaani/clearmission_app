'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Input } from '@/components/Field';
import { formatNaira, formatDate } from '@/lib/format';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';

type Customer = {
  customer_id: string;
  customer_code: string;
  name: string;
  total_job_orders: number;
  total_revenue: number;
  outstanding_balance: number;
  last_job_order_at: string | null;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const url = search ? `/api/customers?search=${encodeURIComponent(search)}` : '/api/customers';
      fetch(url).then((r) => r.json()).then(setCustomers);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Customers</h1>
        <p className="text-sm text-ink/60">{customers.length} customer{customers.length === 1 ? '' : 's'}</p>
      </div>

      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search customers"
          className="w-full rounded border border-mist-border py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-forest"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => (
          <Link href={`/customers/${c.customer_id}`} key={c.customer_id} className="rounded-lg border border-mist-border p-4 transition-colors duration-200 hover:border-forest">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-ink">{c.name}</p>
                <p className="text-xs text-ink/50">{c.customer_code}</p>
              </div>
              {c.outstanding_balance > 0 && (
                <span className="rounded bg-clay-50 px-2 py-0.5 text-xs font-medium text-clay">
                  Owes {formatNaira(c.outstanding_balance)}
                </span>
              )}
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-ink/60">{c.total_job_orders} job order{c.total_job_orders === 1 ? '' : 's'}</span>
              <span className="tabular-nums font-medium text-forest-700">{formatNaira(c.total_revenue)}</span>
            </div>
            {c.last_job_order_at && (
              <p className="mt-1 text-xs text-ink/40">Last order {formatDate(c.last_job_order_at)}</p>
            )}
          </Link>
        ))}
        {customers.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-ink/50">No customers found.</p>
        )}
      </div>
    </AppShell>
  );
}
