'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';

export default function NewProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState<'product' | 'service'>('product');
  const [pricingModel, setPricingModel] = useState<'flat_per_unit' | 'area_based' | 'inventory_tracked'>('flat_per_unit');
  const [unit, setUnit] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!name || !category || !defaultPrice) {
      setError('Name, category, and a default price are all required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, kind, pricingModel, unit: unit || undefined,
          defaultPrice: Number(defaultPrice), requiresDimensions: pricingModel === 'area_based',
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push('/products');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">New Product / Service</h1>
      </div>
      <div className="max-w-md flex flex-col gap-4">
        <ErrorSummary message={error} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. DI Printing" />
        <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="product">Product</option>
          <option value="service">Service</option>
        </Select>
        <Select label="Pricing model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as any)}>
          <option value="flat_per_unit">Flat per unit</option>
          <option value="area_based">Area-based (width × height × rate)</option>
          <option value="inventory_tracked">Inventory-tracked</option>
        </Select>
        <Input label="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sheet, metre, piece…" />
        <Input label="Default price" type="number" min={0} value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} />
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save product'}</Button>
      </div>
    </AppShell>
  );
}
