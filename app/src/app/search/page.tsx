'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';

type Result = { type: string; id: string; label: string; sublabel: string; href: string };

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searched, setSearched] = useState(false);

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setResults(await res.json());
    setSearched(true);
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Search</h1>
        <p className="text-sm text-ink/60">Job orders, invoices, receipts, quotations, and customers</p>
      </div>

      <div className="relative mb-6 max-w-lg">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="CLM/JO/... or a customer name or phone"
          autoFocus
          aria-label="Search everything"
          className="w-full rounded border border-mist-border py-2.5 pl-9 pr-3 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-forest"
        />
      </div>

      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <Link key={`${r.type}-${r.id}`} href={r.href} className="flex items-center justify-between rounded-lg border border-mist-border px-4 py-3 transition-colors duration-200 hover:border-forest">
            <div>
              <Badge tone="neutral">{r.type}</Badge>
              <span className="ml-2 font-medium text-ink">{r.label}</span>
            </div>
            <span className="text-sm text-ink/50">{r.sublabel}</span>
          </Link>
        ))}
        {searched && results.length === 0 && (
          <p className="py-8 text-center text-sm text-ink/50">No matches for &quot;{query}&quot;.</p>
        )}
      </div>
    </AppShell>
  );
}
