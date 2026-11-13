'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { formatNaira, formatDate } from '@/lib/format';
import { MagnifyingGlass, Check, ArrowsMerge, ClockCounterClockwise, UsersThree, Trophy } from '@phosphor-icons/react/dist/ssr';
import { MergeCustomersModal, type MergeCandidate, type MergeResult } from '@/components/customers/MergeCustomersModal';
import { DuplicateSuggestionsModal } from '@/components/customers/DuplicateSuggestionsModal';
import { MergeHistoryModal } from '@/components/customers/MergeHistoryModal';

type Customer = {
  customer_id: string;
  customer_code: string;
  name: string;
  total_job_orders: number;
  total_revenue: number;
  outstanding_balance: number;
  last_job_order_at: string | null;
};

const LIST_CAP = 200; // the API returns at most this many when no search is typed

export default function CustomersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');

  // Merge tools (Admin only). The selection is kept across searches so duplicates
  // that sit far apart in the alphabet can still be picked together.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, MergeCandidate>>(new Map());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeList, setMergeList] = useState<MergeCandidate[]>([]);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    const url = search ? `/api/customers?search=${encodeURIComponent(search)}` : '/api/customers';
    fetch(url).then((r) => r.json()).then(setCustomers);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function toCandidate(c: Customer): MergeCandidate {
    return {
      customer_id: c.customer_id, customer_code: c.customer_code, name: c.name,
      total_job_orders: c.total_job_orders, total_revenue: c.total_revenue,
    };
  }

  function toggle(c: Customer) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.customer_id)) next.delete(c.customer_id);
      else next.set(c.customer_id, toCandidate(c));
      return next;
    });
  }

  function selectAllShown() {
    setSelected((prev) => {
      const next = new Map(prev);
      customers.forEach((c) => next.set(c.customer_id, toCandidate(c)));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Map());
  }

  function openMerge(list: MergeCandidate[]) {
    setMergeList(list);
    setMergeOpen(true);
  }

  function handleMerged(r: MergeResult) {
    setMergeOpen(false);
    setDupesOpen(false);
    exitSelectMode();
    setNotice(
      `Merged ${r.mergedCount} customer${r.mergedCount === 1 ? '' : 's'} into ${r.survivorName}. ` +
      `${r.recordsMoved} record${r.recordsMoved === 1 ? '' : 's'} moved.`
    );
    load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Customers</h1>
          <p className="text-sm text-ink/60">{customers.length} customer{customers.length === 1 ? '' : 's'} shown</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/customers/top">
              <Button variant="secondary" size="sm"><Trophy size={16} aria-hidden="true" />Top customers</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setDupesOpen(true)}>
              <UsersThree size={16} aria-hidden="true" />Find duplicates
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
              <ClockCounterClockwise size={16} aria-hidden="true" />Merge history
            </Button>
            <Button
              variant={selectMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              <ArrowsMerge size={16} aria-hidden="true" />{selectMode ? 'Done selecting' : 'Select to merge'}
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-forest-50 px-4 py-3 text-sm text-forest-700">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="cursor-pointer font-medium hover:underline">Dismiss</button>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search customers"
            className="w-full rounded border border-mist-border py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-forest"
          />
        </div>
        {selectMode && (
          <Button variant="ghost" size="sm" onClick={selectAllShown} disabled={customers.length === 0}>
            Select all shown
          </Button>
        )}
      </div>

      {selectMode && (
        <p className="mb-3 text-sm text-ink/60">
          Tick every record that belongs to the same person. Your selection stays when you search again.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => {
          const isSelected = selected.has(c.customer_id);
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  {selectMode && (
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        isSelected ? 'border-forest bg-forest text-white' : 'border-mist-border bg-white'
                      }`}
                    >
                      {isSelected && <Check size={14} weight="bold" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-ink/50">{c.customer_code}</p>
                  </div>
                </div>
                {c.outstanding_balance > 0 && (
                  <span className="shrink-0 rounded bg-clay-50 px-2 py-0.5 text-xs font-medium text-clay">
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
            </>
          );
          const cardClass = 'rounded-lg border p-4 transition-colors duration-200 hover:border-forest';
          return selectMode ? (
            <button
              type="button"
              key={c.customer_id}
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggle(c)}
              className={`${cardClass} cursor-pointer text-left ${isSelected ? 'border-forest bg-forest-50' : 'border-mist-border'}`}
            >
              {body}
            </button>
          ) : (
            <Link href={`/customers/${c.customer_id}`} key={c.customer_id} className={`${cardClass} border-mist-border`}>
              {body}
            </Link>
          );
        })}
        {customers.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-ink/50">No customers found.</p>
        )}
      </div>

      {!search && customers.length >= LIST_CAP && (
        <p className="mt-4 text-center text-sm text-ink/50">
          Showing the first {LIST_CAP} customers. Search by name to find others.
        </p>
      )}

      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-20 z-10 mt-6 flex items-center justify-between gap-3 rounded-lg border border-forest bg-white px-4 py-3 shadow-lg lg:bottom-4">
          <span className="text-sm font-medium text-ink">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Clear</Button>
            <Button size="sm" disabled={selected.size < 2} onClick={() => openMerge(Array.from(selected.values()))}>
              {selected.size < 2 ? 'Select at least 2' : `Merge ${selected.size} customers`}
            </Button>
          </div>
        </div>
      )}

      {isAdmin && (
        <>
          <MergeCustomersModal open={mergeOpen} onClose={() => setMergeOpen(false)} customers={mergeList} onMerged={handleMerged} />
          <DuplicateSuggestionsModal
            open={dupesOpen}
            onClose={() => setDupesOpen(false)}
            onReview={(members) => { setDupesOpen(false); openMerge(members); }}
          />
          <MergeHistoryModal
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            onChanged={() => { load(); setNotice('Merge undone. The customer and their records are back.'); }}
          />
        </>
      )}
    </AppShell>
  );
}
