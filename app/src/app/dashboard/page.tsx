'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { StatTile } from '@/components/StatTile';
import { formatNaira } from '@/lib/format';
import {
  CurrencyCircleDollar, HandCoins, TrendUp, Package, Warning, Trophy,
} from '@phosphor-icons/react/dist/ssr';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Dashboard = {
  revenueToday: number;
  paymentsToday: number;
  expensesToday: number;
  profitToday: number;
  jobOrdersToday: number;
  outstandingDebt: number;
  lowStockCount: number;
  activeSessions: number;
  customerOfMonth: { name: string; job_orders: number; revenue: number } | null;
};

type FinancialReport = {
  daily: Array<{ day: string; revenue: number; net_profit: number }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [trend, setTrend] = useState<FinancialReport['daily']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then((r) => r.json()),
      fetch('/api/reports/financial').then((r) => r.json()),
    ])
      .then(([dash, fin]) => {
        if (dash.error) throw new Error(dash.error);
        setData(dash);
        setTrend(fin.daily ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Dashboard</h1>
        <p className="text-sm text-ink/60">Today at a glance</p>
      </div>

      {error && <p className="text-clay">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Revenue today" value={formatNaira(data.revenueToday)} tone="forest" icon={<CurrencyCircleDollar size={20} />} />
            <StatTile label="Payments today" value={formatNaira(data.paymentsToday)} tone="slate" icon={<HandCoins size={20} />} />
            <StatTile label="Profit today" value={formatNaira(data.profitToday)} tone="forest" icon={<TrendUp size={20} />} />
            <StatTile label="Job orders today" value={String(data.jobOrdersToday)} tone="slate" icon={<Package size={20} />} />
            <StatTile label="Outstanding debt" value={formatNaira(data.outstandingDebt)} tone="clay" icon={<Warning size={20} />} />
            <StatTile label="Low stock items" value={String(data.lowStockCount)} tone="amber" icon={<Warning size={20} />} />
            <StatTile label="Active cashier sessions" value={String(data.activeSessions)} tone="slate" />
            <StatTile
              label="Customer of the month"
              value={data.customerOfMonth?.name ?? '—'}
              tone="gold"
              icon={<Trophy size={20} />}
            />
          </div>

          <div className="mt-8 rounded-lg border border-mist-border p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Revenue trend</h2>
            {trend.length >= 4 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend}>
                  <CartesianGrid stroke="#EEF2ED" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#1A1D1B99' }} tickLine={false} axisLine={{ stroke: '#DCE3DA' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#1A1D1B99' }} tickLine={false} axisLine={false} width={70}
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatNaira(Number(v))} contentStyle={{ borderRadius: 6, borderColor: '#DCE3DA', fontSize: 13 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1B5E20" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net_profit" name="Net profit" stroke="#2F5D8A" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-ink/50">Not enough days of data yet to chart a trend.</p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
