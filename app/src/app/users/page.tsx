'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { ErrorSummary } from '@/components/ErrorSummary';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/lib/AuthContext';
import { Plus } from '@phosphor-icons/react/dist/ssr';

type User = { id: string; username: string; role: 'admin' | 'cashier'; is_active: boolean; created_at: string };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier'>('cashier');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    fetch('/api/users').then((r) => r.json()).then(setUsers);
  }
  useEffect(refresh, []);

  async function createUser() {
    setError(null);
    if (!username || !password) {
      setError('Username and password are both required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setUsername('');
      setPassword('');
      setOpen(false);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.is_active }),
    });
    if (res.ok) refresh();
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">User Accounts</h1>
          <p className="text-sm text-ink/60">Admin and Cashier accounts (PRD section 3)</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New user</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mist-border">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-mist-border bg-mist text-left text-xs font-medium uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Username</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Since</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-mist-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{u.username}</td>
                <td className="px-4 py-3 capitalize text-ink/70">{u.role}</td>
                <td className="px-4 py-3 text-ink/70">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">{u.is_active ? <Badge tone="forest">Active</Badge> : <Badge tone="clay">Deactivated</Badge>}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== currentUser?.id && (
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New user">
        <div className="flex flex-col gap-4">
          <ErrorSummary message={error} />
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters" />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </Select>
          <Button onClick={createUser} disabled={submitting}>{submitting ? 'Creating…' : 'Create user'}</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
