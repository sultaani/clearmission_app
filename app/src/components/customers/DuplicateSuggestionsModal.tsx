'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { formatNaira } from '@/lib/format';
import type { MergeCandidate } from './MergeCustomersModal';

type Group = { members: MergeCandidate[]; combined_orders: number };

export function DuplicateSuggestionsModal({
  open, onClose, onReview,
}: {
  open: boolean;
  onClose: () => void;
  onReview: (members: MergeCandidate[]) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Possible duplicates">
      <Suggestions onReview={onReview} />
    </Modal>
  );
}

// Mounted only while the modal is open, so it looks for duplicates fresh each time.
function Suggestions({ onReview }: { onReview: (members: MergeCandidate[]) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/customers/duplicates')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Could not load suggestions');
        setGroups(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load suggestions'));
  }, []);

  return (
    <>
      <p className="mb-4 text-sm text-ink/60">
        These names look alike. They are suggestions only: check each group, then choose Review to merge the ones that are the same person.
      </p>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      {!groups && !error && <p className="text-sm text-ink/50">Looking for similar names…</p>}
      {groups && groups.length === 0 && <p className="text-sm text-ink/60">No likely duplicates found.</p>}
      <div className="flex flex-col gap-3">
        {groups?.map((g, i) => (
          <div key={i} className="rounded-lg border border-mist-border p-3">
            <ul className="mb-3 flex flex-col gap-1">
              {g.members.map((m) => (
                <li key={m.customer_id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{m.name}</span>
                  <span className="shrink-0 tabular-nums text-ink/50">
                    {m.total_job_orders} order{m.total_job_orders === 1 ? '' : 's'} · {formatNaira(m.total_revenue)}
                  </span>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" onClick={() => onReview(g.members)}>Review and merge</Button>
          </div>
        ))}
      </div>
    </>
  );
}
