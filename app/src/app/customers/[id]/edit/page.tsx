'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${id}`).then((r) => r.json()).then((d) => {
      setName(d.name ?? '');
      setPhone(d.phone ?? '');
      setAddress(d.address ?? '');
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, address }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push(`/customers/${id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <AppShell><p className="text-ink/50">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Edit Customer</h1>
      </div>
      <div className="max-w-md flex flex-col gap-4">
        <ErrorSummary message={error} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </AppShell>
  );
}
