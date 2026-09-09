import type { Icon } from '@phosphor-icons/react';
import {
  SquaresFour, Receipt, Users, ChartLineUp, Archive, ListChecks, SignOut,
  Wallet, ClockCounterClockwise, MagnifyingGlass, Truck,
} from '@phosphor-icons/react/dist/ssr';

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  roles: Array<'admin' | 'cashier'>;
  primary?: boolean; // shown in the mobile bottom nav (PRD #84 — keep it to a handful)
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: SquaresFour, roles: ['admin'], primary: true },
  { href: '/pos', label: 'POS', icon: Receipt, roles: ['cashier'], primary: true },
  { href: '/job-orders', label: 'Job Orders', icon: ListChecks, roles: ['admin', 'cashier'], primary: true },
  { href: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'cashier'], primary: true },
  { href: '/search', label: 'Search', icon: MagnifyingGlass, roles: ['admin', 'cashier'] },
  { href: '/inventory', label: 'Inventory', icon: Archive, roles: ['admin', 'cashier'] },
  { href: '/procurements', label: 'Procurement', icon: Truck, roles: ['admin'] },
  { href: '/expenses', label: 'Expenses', icon: Wallet, roles: ['admin', 'cashier'] },
  { href: '/debts', label: 'Debts', icon: Wallet, roles: ['admin', 'cashier'] },
  { href: '/cashier-session', label: 'My Session', icon: ClockCounterClockwise, roles: ['cashier'] },
  { href: '/cashier-sessions', label: 'Session History', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/quotations', label: 'Quotations', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/payments', label: 'Record Payment', icon: Wallet, roles: ['admin', 'cashier'] },
  { href: '/payments/history', label: 'Payment History', icon: ClockCounterClockwise, roles: ['admin', 'cashier'] },
  { href: '/invoices', label: 'Invoices', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/receipts', label: 'Receipts', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/reports', label: 'Reports', icon: ChartLineUp, roles: ['admin'], primary: true },
  { href: '/products', label: 'Products', icon: Archive, roles: ['admin'] },
  { href: '/deleted-records', label: 'Deleted Records', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/audit-logs', label: 'Audit Logs', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/sync-conflicts', label: 'Sync Conflicts', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: SquaresFour, roles: ['admin'] },
  { href: '/users', label: 'User Accounts', icon: Users, roles: ['admin'] },
];

export { SignOut };
