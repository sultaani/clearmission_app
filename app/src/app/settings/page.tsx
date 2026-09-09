'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';
import { Plus, PencilSimple, Check, X } from '@phosphor-icons/react/dist/ssr';

type Category = { id: string; name: string; is_active: boolean };

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    fetch('/api/expenses/categories/all').then((r) => r.json()).then(setCategories);
  }
  useEffect(refresh, []);

  async function addCategory() {
    setError(null);
    if (!newCategory.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/expenses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setNewCategory('');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: string) {
    await fetch(`/api/expenses/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName }),
    });
    setEditingId(null);
    refresh();
  }

  async function toggleActive(cat: Category) {
    await fetch(`/api/expenses/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !cat.is_active }),
    });
    refresh();
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-ink/60">System configuration</p>
      </div>

      <div className="max-w-md rounded-lg border border-mist-border p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Expense categories</h2>

        <div className="mb-4 flex flex-col gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-mist-border px-3 py-2">
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded border border-mist-border px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button onClick={() => saveEdit(c.id)} aria-label="Save" className="cursor-pointer text-forest-700"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} aria-label="Cancel" className="cursor-pointer text-ink/40"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.is_active ? 'neutral' : 'clay'}>{c.name}</Badge>
                    {!c.is_active && <span className="text-xs text-ink/40">inactive</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingId(c.id); setEditingName(c.name); }} aria-label={`Edit ${c.name}`} className="cursor-pointer text-ink/40 hover:text-forest-700">
                      <PencilSimple size={14} />
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(c)}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <ErrorSummary message={error} />
        <div className="mt-3 flex gap-2">
          <Input label="Add category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1" />
          <Button onClick={addCategory} disabled={submitting} className="mt-6"><Plus size={16} /></Button>
        </div>
        <p className="mt-4 text-xs text-ink/50">
          Manage Admin and Cashier accounts on the <a href="/users" className="text-forest-700 hover:underline">User Accounts</a> page.
        </p>
      </div>
    </AppShell>
  );
}
