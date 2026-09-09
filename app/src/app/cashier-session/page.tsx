'use client';

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatNaira } from '@/lib/format';

type Session = { id: string; opened_at: string };
type ClosedSession = {
  expected_cash: string; expected_transfer: string; expected_pos: string;
  actual_cash: string; actual_transfer: string; actual_pos: string; variance: string;
};

export default function CashierSessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [closed, setClosed] = useState<ClosedSession | null>(null);
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [pos, setPos] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function openSession() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/cashier-sessions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setSession(data);
      setClosed(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cashier-sessions/${session.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualCash: Number(cash || 0), actualTransfer: Number(transfer || 0), actualPos: Number(pos || 0) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setClosed(data);
      setSession(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Cashier Session</h1>
        <p className="text-sm text-ink/60">Open at the start of your shift, close and reconcile at the end</p>
      </div>

      <ErrorSummary message={error} />

      {!session && !closed && (
        <Button onClick={openSession} disabled={submitting} className="mt-4">
          {submitting ? 'Opening…' : 'Open session'}
        </Button>
      )}

      {session && (
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-mist-border p-5">
          <p className="text-sm text-forest-700">Session open since {new Date(session.opened_at).toLocaleTimeString('en-NG')}</p>
          <p className="text-sm font-medium text-ink">Count your till and enter the actual totals to close out:</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Cash" type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} />
            <Input label="Bank transfer" type="number" min={0} value={transfer} onChange={(e) => setTransfer(e.target.value)} />
            <Input label="POS" type="number" min={0} value={pos} onChange={(e) => setPos(e.target.value)} />
          </div>
          <Button onClick={closeSession} disabled={submitting} variant="secondary" className="self-start">
            {submitting ? 'Closing…' : 'Close & reconcile'}
          </Button>
        </div>
      )}

      {closed && (
        <div className="mt-4 rounded-lg border border-mist-border p-5">
          <p className="mb-3 font-medium text-ink">Session closed</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink/50">
                <th className="pb-2">Method</th><th className="pb-2 text-right">Expected</th><th className="pb-2 text-right">Actual</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr><td className="py-1 text-ink/70">Cash</td><td className="py-1 text-right">{formatNaira(closed.expected_cash)}</td><td className="py-1 text-right">{formatNaira(closed.actual_cash)}</td></tr>
              <tr><td className="py-1 text-ink/70">Transfer</td><td className="py-1 text-right">{formatNaira(closed.expected_transfer)}</td><td className="py-1 text-right">{formatNaira(closed.actual_transfer)}</td></tr>
              <tr><td className="py-1 text-ink/70">POS</td><td className="py-1 text-right">{formatNaira(closed.expected_pos)}</td><td className="py-1 text-right">{formatNaira(closed.actual_pos)}</td></tr>
            </tbody>
          </table>
          <p className={`mt-3 font-semibold ${Number(closed.variance) < 0 ? 'text-clay' : Number(closed.variance) > 0 ? 'text-amber' : 'text-forest-700'}`}>
            Variance: {formatNaira(closed.variance)}
          </p>
          <Button onClick={() => setClosed(null)} variant="secondary" className="mt-4">Start a new session</Button>
        </div>
      )}
    </AppShell>
  );
}
