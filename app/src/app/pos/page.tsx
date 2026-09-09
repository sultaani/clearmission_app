'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira } from '@/lib/format';
import { Trash, Plus, WifiSlash, CloudCheck } from '@phosphor-icons/react/dist/ssr';
import { enqueue, listPending, syncPending } from '@/lib/offlineQueue';

type Product = {
  id: string;
  name: string;
  category: string;
  pricing_model: 'flat_per_unit' | 'area_based' | 'inventory_tracked';
  default_price: string;
  requires_dimensions: boolean;
  unit: string | null;
  material_group: string | null;
};

type MaterialOption = {
  id: string;
  name: string;
  roll_width_ft: string | null;
  quantity_on_hand: string;
  unit: string;
  min_stock_threshold: string;
};

type LineItem = {
  key: string;
  productServiceId: string;
  description: string;
  width?: number;
  height?: number;
  quantity: number;
  collectedAmount?: number; // undefined = use the system's standard calculation
  inventoryItemId?: string; // which physical roll/material was actually used
};

function emptyItem(): LineItem {
  return { key: crypto.randomUUID(), productServiceId: '', description: '', quantity: 1 };
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ jobOrderNo: string; invoiceNo: string; subtotal: number } | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(() => {
    listPending().then((p) => setPendingCount(p.length)).catch(() => {});
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { synced, conflicts } = await syncPending();
      if (synced > 0 || conflicts > 0) {
        setQueuedNotice(
          `Synced ${synced} queued job order${synced === 1 ? '' : 's'}` +
          (conflicts > 0 ? `, ${conflicts} need${conflicts === 1 ? 's' : ''} Admin review (Sync Conflicts page)` : '.')
        );
      }
      refreshPending();
    } catch {
      // still offline, or the server rejected the batch — leave items queued, try again next reconnect/manual sync
    } finally {
      setSyncing(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts);
    refreshPending();
    // Intentional: navigator.onLine is a browser API unavailable during SSR, so reading
    // it into state can only happen after mount — this is exactly the "synchronize with
    // an external system on mount" case the effect guidance carves out as legitimate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);

    function onOnline() {
      setIsOnline(true);
      runSync();
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshPending, runSync]);

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev));
  }

  function productFor(id: string) {
    return products.find((p) => p.id === id);
  }

  // Cache of material options per group (e.g. all 7 Flex widths), fetched lazily
  // the first time a product needing material selection is picked.
  const [materialsByGroup, setMaterialsByGroup] = useState<Record<string, MaterialOption[]>>({});

  useEffect(() => {
    const groups = new Set(
      items.map((i) => productFor(i.productServiceId)?.material_group).filter((g): g is string => !!g)
    );
    for (const group of groups) {
      if (materialsByGroup[group]) continue;
      fetch(`/api/inventory/by-group?group=${group}`)
        .then((r) => r.json())
        .then((options: MaterialOption[]) => setMaterialsByGroup((prev) => ({ ...prev, [group]: options })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, products]);

  // Live estimate so the cashier sees a number forming as they work — server has the real calculation
  function estimate(item: LineItem): number | null {
    const product = productFor(item.productServiceId);
    if (!product) return null;
    const rate = Number(product.default_price ?? 0);
    if (product.pricing_model === 'area_based') {
      if (!item.width || !item.height) return null;
      return item.width * item.height * rate * item.quantity;
    }
    return rate * item.quantity;
  }

  const estimatedTotal = items.reduce((sum, i) => sum + (i.collectedAmount ?? estimate(i) ?? 0), 0);

  async function handleSubmit() {
    setError(null);
    setQueuedNotice(null);
    if (!customerName.trim()) {
      setError('Enter a customer name (or "Walk-in" for a one-off sale).');
      return;
    }
    if (items.some((i) => !i.productServiceId)) {
      setError('Every line item needs a product or service selected.');
      return;
    }
    const missingMaterial = items.find((i) => {
      const product = productFor(i.productServiceId);
      return product?.material_group && !i.inventoryItemId;
    });
    if (missingMaterial) {
      setError(`Select which material/width was used for "${productFor(missingMaterial.productServiceId)?.name}".`);
      return;
    }
    setSubmitting(true);

    const clientRequestId = crypto.randomUUID();
    const payload = {
      walkIn: { name: customerName, phone: customerPhone || undefined },
      items: items.map((i) => ({
        productServiceId: i.productServiceId,
        category: productFor(i.productServiceId)?.category ?? 'Other',
        description: i.description || productFor(i.productServiceId)?.name,
        width: i.width,
        height: i.height,
        quantity: i.quantity,
        collectedAmount: i.collectedAmount,
        inventoryItemId: i.inventoryItemId,
      })),
    };

    try {
      const res = await fetch('/api/job-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, clientRequestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not create the job order.');
        return;
      }
      setResult(data);
      setItems([emptyItem()]);
      setCustomerName('');
      setCustomerPhone('');
    } catch {
      // fetch itself threw — no connection reached the server at all (offline, or server unreachable).
      // Queue it locally rather than losing the sale; it'll sync automatically on reconnect.
      await enqueue({ clientRequestId, type: 'job_order', payload });
      setQueuedNotice('No connection — this job order is saved on this device and will sync automatically once you\'re back online.');
      setItems([emptyItem()]);
      setCustomerName('');
      setCustomerPhone('');
      refreshPending();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">New Job Order</h1>
          <p className="text-sm text-ink/60">Add items, confirm the amount collected, and save</p>
        </div>
        {!isOnline && (
          <span className="flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber">
            <WifiSlash size={14} /> Offline
          </span>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-50 bg-amber-50 px-4 py-3 text-sm text-amber">
          <span>{pendingCount} job order{pendingCount === 1 ? '' : 's'} waiting to sync</span>
          <Button size="sm" variant="secondary" onClick={runSync} disabled={syncing || !isOnline}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      )}

      {queuedNotice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-50 bg-slate-50 px-4 py-3 text-sm text-slate">
          <CloudCheck size={16} /> {queuedNotice}
        </div>
      )}

      {result && (
        <div className="mb-6 rounded-lg border border-forest-100 bg-forest-50 px-4 py-3 text-sm text-forest-700">
          <p className="font-medium">Job order {result.jobOrderNo} saved — invoice {result.invoiceNo}</p>
          <p>Total: {formatNaira(result.subtotal)}</p>
        </div>
      )}

      <ErrorSummary message={error} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. ABC Limited or Walk-in" />
        <Input label="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {items.map((item, idx) => {
          const product = productFor(item.productServiceId);
          const est = estimate(item);
          return (
            <div key={item.key} className="rounded-lg border border-mist-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Item {idx + 1}</span>
                <button
                  onClick={() => removeItem(item.key)}
                  aria-label="Remove item"
                  className="cursor-pointer rounded p-1 text-ink/40 transition-colors duration-200 hover:bg-clay-50 hover:text-clay"
                >
                  <Trash size={16} />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Product / service"
                  value={item.productServiceId}
                  onChange={(e) => updateItem(item.key, { productServiceId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.category} — {p.name}</option>
                  ))}
                </Select>
                <Input
                  label="Description"
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                  placeholder={product?.name}
                />

                {product?.requires_dimensions && (
                  <>
                    <Input label="Width (ft)" type="number" min={0} step={0.1}
                      value={item.width ?? ''} onChange={(e) => updateItem(item.key, { width: Number(e.target.value) })} />
                    <Input label="Height (ft)" type="number" min={0} step={0.1}
                      value={item.height ?? ''} onChange={(e) => updateItem(item.key, { height: Number(e.target.value) })} />
                  </>
                )}

                {product?.material_group && (
                  <Select
                    label="Material used"
                    value={item.inventoryItemId ?? ''}
                    onChange={(e) => updateItem(item.key, { inventoryItemId: e.target.value })}
                    className="sm:col-span-2"
                  >
                    <option value="">Which roll/width was used?</option>
                    {(materialsByGroup[product.material_group] ?? []).map((m) => {
                      const low = Number(m.quantity_on_hand) <= Number(m.min_stock_threshold);
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} — {Number(m.quantity_on_hand).toLocaleString()} {m.unit} in stock
                          {low ? ' (LOW)' : ''}
                        </option>
                      );
                    })}
                  </Select>
                )}

                <Input label="Quantity" type="number" min={1} value={item.quantity}
                  onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })} />
                <Input
                  label="Amount collected"
                  type="number" min={0}
                  value={item.collectedAmount ?? ''}
                  placeholder={est !== null ? String(est) : 'standard price'}
                  hint={est !== null ? `Standard price: ${formatNaira(est)} — override here if negotiated` : undefined}
                  onChange={(e) => updateItem(item.key, { collectedAmount: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
          );
        })}

        <Button variant="secondary" onClick={addItem} className="self-start">
          <Plus size={16} /> Add another item
        </Button>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg border border-mist-border bg-mist px-4 py-3">
        <span className="text-sm font-medium text-ink">Estimated total</span>
        <span className="tabular-nums text-lg font-bold text-forest-700">{formatNaira(estimatedTotal)}</span>
      </div>

      <Button onClick={handleSubmit} disabled={submitting} className="mt-4 w-full sm:w-auto">
        {submitting ? 'Saving…' : 'Save job order'}
      </Button>
    </AppShell>
  );
}
