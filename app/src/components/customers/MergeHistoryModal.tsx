'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { formatDateTime } from '@/lib/format';

type MergeRow = {
  id: string; source_name: string; survivor_name: string; merged_at: string;
  undone_at: string | null; merged_by_username: string | null; records_moved: number;
};

export function MergeHistoryModal({
  open, onClose, onChanged,
}: { open: boolean; onClose: () => void; onChanged: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Merge history">
      <History onChanged={onChanged} />
    </Modal>
  );
}

// Mounted only while the modal is open, so it always shows the latest history.
function History({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<MergeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/customers/merge')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Could not load merge history');
        setRows(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load merge history'));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function undo(id: string) {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/customers/merge/${id}/undo`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Undo failed');
      setConfirming(null);
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-clay">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink/50">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-ink/60">No merges yet.</p>}
      <ul className="flex flex-col gap-3">
        {rows?.map((m) => (
          <li key={m.id} className="rounded-lg border border-mist-border p-3">
            <p className="text-sm text-ink">
              <span className="font-medium">{m.source_name}</span> merged into{' '}
              <span className="font-medium">{m.survivor_name}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink/50">
              {formatDateTime(m.merged_at)}{m.merged_by_username ? ` by ${m.merged_by_username}` : ''} · {m.records_moved} record{m.records_moved === 1 ? '' : 's'} moved
            </p>
            <div className="mt-2">
              {m.undone_at ? (
                <Badge tone="neutral">Undone {formatDateTime(m.undone_at)}</Badge>
              ) : confirming === m.id ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="destructive" disabled={busy === m.id} onClick={() => undo(m.id)}>
                    {busy === m.id ? 'Undoing…' : 'Yes, undo this merge'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirming(m.id)}>Undo</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
