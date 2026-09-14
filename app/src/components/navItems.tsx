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
  /** One of the (up to) 4 real tabs in the mobile bottom nav, before the
   *  always-present 5th "More" tab. Order in this array matters: for each
   *  role, the first 4 primary items encountered (in the order they appear
   *  below) become the bottom nav — see AppShell.tsx. Everything else,
   *  primary or not, is reachable from the "More" grid on mobile, and from
   *  the full sidebar on desktop as before. */
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: SquaresFour, roles: ['admin'], primary: true },
  { href: '/pos', label: 'POS', icon: Receipt, roles: ['cashier'], primary: true },
  { href: '/job-orders', label: 'Job Orders', icon: ListChecks, roles: ['admin', 'cashier'], primary: true },
  { href: '/expenses', label: 'Expenses', icon: Wallet, roles: ['admin', 'cashier'], primary: true },
  // Reports must stay listed here, before Debts, so that Admin's first-4
  // primary items are Dashboard/Job Orders/Expenses/Reports — Debts is also
  // primary (for Cashier, who has no Dashboard/Reports), but by the time
  // Admin's list reaches Debts the bottom nav has already taken its 4.
  { href: '/reports', label: 'Reports', icon: ChartLineUp, roles: ['admin'], primary: true },
  { href: '/debts', label: 'Debts', icon: Wallet, roles: ['admin', 'cashier'], primary: true },
  { href: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'cashier'] },
  { href: '/search', label: 'Search', icon: MagnifyingGlass, roles: ['admin', 'cashier'] },
  { href: '/inventory', label: 'Inventory', icon: Archive, roles: ['admin', 'cashier'] },
  { href: '/procurements', label: 'Procurement', icon: Truck, roles: ['admin'] },
  { href: '/cashier-session', label: 'My Session', icon: ClockCounterClockwise, roles: ['cashier'] },
  { href: '/cashier-sessions', label: 'Session History', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/quotations', label: 'Quotations', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/payments', label: 'Record Payment', icon: Wallet, roles: ['admin', 'cashier'] },
  { href: '/payments/history', label: 'Payment History', icon: ClockCounterClockwise, roles: ['admin', 'cashier'] },
  { href: '/invoices', label: 'Invoices', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/receipts', label: 'Receipts', icon: Receipt, roles: ['admin', 'cashier'] },
  { href: '/products', label: 'Products', icon: Archive, roles: ['admin'] },
  { href: '/deleted-records', label: 'Deleted Records', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/audit-logs', label: 'Audit Logs', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/sync-conflicts', label: 'Sync Conflicts', icon: ClockCounterClockwise, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: SquaresFour, roles: ['admin'] },
  { href: '/users', label: 'User Accounts', icon: Users, roles: ['admin'] },
];

export { SignOut };

/** Splits a role's accessible nav items into the 4 mobile bottom-nav tabs
 *  and everything else (shown in the "More" grid on mobile). Shared between
 *  AppShell (renders the bottom nav) and the /more page (renders the grid)
 *  so the two can never drift out of sync with each other. */
export function getMobileNavSplit(role: 'admin' | 'cashier') {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const overflow = items.filter((i) => !primary.includes(i));
  return { primary, overflow };
}
