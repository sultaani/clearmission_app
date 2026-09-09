'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { formatNaira } from '@/lib/format';
import { Plus } from '@phosphor-icons/react/dist/ssr';

type Product = {
  id: string; name: string; category: string; pricing_model: string;
  default_price: string; unit: string | null; is_active: boolean;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
  }, []);

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Products &amp; Pricing</h1>
          <p className="text-sm text-ink/60">Standard rates the POS uses to calculate prices</p>
        </div>
        <Link href="/products/new"><Button><Plus size={16} /> New product</Button></Link>
      </div>

      <div className="flex flex-col gap-6">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="mb-2 text-sm font-semibold text-ink">{category}</h2>
            <div className="overflow-x-auto rounded-lg border border-mist-border">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Pricing</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-mist-border last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-4 py-3 text-ink/70">
                        {p.pricing_model === 'area_based' ? `per ${p.unit ?? 'unit'} (W×H×rate)` : `per ${p.unit ?? 'unit'}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatNaira(p.default_price)}</td>
                      <td className="px-4 py-3">{p.is_active ? <Badge tone="forest">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${p.id}/edit`}><Button size="sm" variant="secondary">Edit</Button></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
