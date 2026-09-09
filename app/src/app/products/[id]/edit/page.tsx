'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/products/${id}`).then((r) => r.json()).then((d) => {
      setName(d.name);
      setDefaultPrice(String(d.default_price));
      setIsActive(String(d.is_active));
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, defaultPrice: Number(defaultPrice), isActive: isActive === 'true' }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push('/products');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Edit Product / Service</h1>
        <p className="text-sm text-ink/60">Changing the rate here only affects new job order items — it doesn&apos;t retroactively change past sales</p>
      </div>
      <div className="max-w-md flex flex-col gap-4">
        <ErrorSummary message={error} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Default price" type="number" min={0} value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} />
        <Select label="Status" value={isActive} onChange={(e) => setIsActive(e.target.value)}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </AppShell>
  );
}
