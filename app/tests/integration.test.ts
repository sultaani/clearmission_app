import { config } from 'dotenv';
config({ path: '.env.local' });
import { pool } from '../src/lib/db';
import { verifyLogin, createSessionToken, verifySessionToken } from '../src/lib/auth';
import { createJobOrder, getJobOrder } from '../src/lib/services/jobOrders';
import { recordPayment } from '../src/lib/services/payments';
import { recordProcurement, listLowStock } from '../src/lib/services/inventory';
import { recordExpense, listExpenseCategories } from '../src/lib/services/expenses';
import { openSession, closeSession } from '../src/lib/services/cashierSessions';
import { dashboardSummary } from '../src/lib/services/dashboard';
import { salesReport, financialReport, customerReport } from '../src/lib/services/reports';
import { listDebts, debtAgingSummary } from '../src/lib/services/debts';
import { listAuditLogs } from '../src/lib/services/auditLogs';
import { createCustomer } from '../src/lib/services/customers';
import { listProducts } from '../src/lib/services/products';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Phase 1: Foundation — auth ===');
  const badLogin = await verifyLogin('cashier', 'wrong-password');
  assert(badLogin === null, 'wrong password is rejected');

  const cashierUser = await verifyLogin('cashier', 'cashier123');
  assert(cashierUser !== null && cashierUser.role === 'cashier', 'cashier logs in with correct role');

  const adminUser = await verifyLogin('admin', 'admin123');
  assert(adminUser !== null && adminUser.role === 'admin', 'admin logs in with correct role');

  const token = await createSessionToken(cashierUser!);
  const decoded = await verifySessionToken(token);
  assert(decoded?.username === 'cashier', 'session token round-trips correctly');

  const tampered = await verifySessionToken(token + 'x');
  assert(tampered === null, 'tampered session token is rejected');

  console.log('\n=== Phase 2: Core operations — customers, products, POS job order ===');
  const products = await listProducts();
  assert(products.length >= 10, `products/services seeded (found ${products.length})`);

  const artCardA3 = products.find((p: any) => p.name === 'Art Card A3');
  const flex = products.find((p: any) => p.name === 'Flex Printing');
  const shirt = products.find((p: any) => p.name === 'Branded Shirt');
  assert(!!artCardA3 && !!flex && !!shirt, 'key priced products found in catalog');

  const newCustomer = await createCustomer({ name: 'ABC Limited', phone: '08011112222' });
  assert(!!newCustomer.customer_code?.startsWith('CUS-'), `customer created with code ${newCustomer.customer_code}`);

  // Stock up Art Card A3 before selling any (a real shop procures before it can sell)
  await recordProcurement({ inventoryItemId: artCardA3.inventory_item_id, quantity: 1000, totalCost: 150000, recordedBy: adminUser!.id });

  // Job order: 500 A3 Art Cards (standard price) + 10 branded shirts (negotiated price)
  const jo = await createJobOrder({
    cashierId: cashierUser!.id,
    customerId: newCustomer.id,
    items: [
      { productServiceId: artCardA3.id, category: 'DI Printing', description: '500 A3 Art Cards', quantity: 500 },
      { productServiceId: shirt.id, category: 'Branding', description: '10 branded shirts', quantity: 10, collectedAmount: 45000 },
    ],
  });
  assert(jo.jobOrderNo.startsWith('CLM/JO/'), `job order created: ${jo.jobOrderNo}`);
  assert(jo.subtotal === 500 * 200 + 45000, `subtotal correct: standard DI price + negotiated shirt price = ${jo.subtotal}`);
  assert(jo.invoiceNo.startsWith('CLM/INV/'), `invoice auto-generated: ${jo.invoiceNo}`);

  const fetched = await getJobOrder(jo.jobOrderId);
  assert(fetched?.items.length === 2, 'job order has both line items on read-back');

  console.log('\n=== Phase 3: Inventory — procurement + large-format job (via POS) ===');
  const flexItemId = flex.inventory_item_id;
  await recordProcurement({ inventoryItemId: flexItemId, quantity: 100, totalCost: 160000, recordedBy: adminUser!.id });
  const flexStockBefore = (await pool.query(`SELECT quantity_on_hand FROM inventory_items WHERE id=$1`, [flexItemId])).rows[0].quantity_on_hand;

  const largeFormatJo = await createJobOrder({
    cashierId: cashierUser!.id,
    walkIn: { name: 'Walk-in Flex Customer' },
    items: [
      { productServiceId: flex.id, category: 'Large Format', description: '4x2 Flex', width: 4, height: 2, quantity: 1 },
    ],
  });
  const flexStockAfter = (await pool.query(`SELECT quantity_on_hand FROM inventory_items WHERE id=$1`, [flexItemId])).rows[0].quantity_on_hand;
  assert(Number(flexStockBefore) - Number(flexStockAfter) === 2, `4x2 Flex job deducted 2 linear metres (8sqft/4ft roll)`);
  assert(largeFormatJo.subtotal === 4 * 2 * 200, `large-format standard pricing correct: ${largeFormatJo.subtotal}`);

  await pool.query(`UPDATE inventory_items SET quantity_on_hand = 15 WHERE name = 'SAV'`);
  const lowStock = await listLowStock();
  assert(lowStock.some((i: any) => i.name === 'SAV'), 'low stock view picks up SAV below threshold');

  console.log('\n=== Phase 4: Financial management — payment allocation, expenses, cashier session ===');
  const session = await openSession(cashierUser!.id);
  assert(!!session.id, 'cashier session opened');

  await expectThrow(() => openSession(cashierUser!.id), 'cannot open a second session while one is already open');

  const payment = await recordPayment({
    customerId: newCustomer.id,
    amount: 40000,
    method: 'cash',
    recordedBy: cashierUser!.id,
    cashierSessionId: session.id,
  });
  assert(payment.receiptNo.startsWith('CLM/RC/'), `payment recorded, receipt generated: ${payment.receiptNo}`);

  const joAfterPayment = await getJobOrder(jo.jobOrderId);
  assert(Number(joAfterPayment!.amount_paid) === 40000, 'job order amount_paid reflects the payment');
  assert(joAfterPayment!.payment_status === 'partial', 'job order status is partial after part-payment');

  const categories = await listExpenseCategories();
  const fuelCat = categories.find((c: any) => c.name === 'Fuel');
  await recordExpense({ categoryId: fuelCat.id, amount: 5000, paymentMethod: 'cash', recordedBy: cashierUser!.id, cashierSessionId: session.id, description: 'Generator fuel' });

  const closed = await closeSession({ sessionId: session.id, actualCash: 44500, actualTransfer: 0, actualPos: 0 });
  // expected cash = 40000 payment; actual = 44500 declared by cashier -> variance = +4500 (cashier over, e.g. undeclared change) — just checking the arithmetic, not the realism
  assert(Number(closed.expected_cash) === 40000, `expected cash computed from session payments: ${closed.expected_cash}`);
  assert(Number(closed.variance) === 4500, `variance computed correctly: ${closed.variance}`);

  console.log('\n=== Phase 5: Management — dashboard, reports, debts, audit log ===');
  const dash = await dashboardSummary();
  assert(dash.jobOrdersToday >= 2, `dashboard shows today's job orders: ${dash.jobOrdersToday}`);
  assert(dash.revenueToday > 0, `dashboard shows today's revenue: ${dash.revenueToday}`);
  assert(dash.outstandingDebt > 0, `dashboard shows outstanding debt: ${dash.outstandingDebt}`);
  assert(dash.lowStockCount >= 1, `dashboard shows low stock count: ${dash.lowStockCount}`);

  const sales = await salesReport({});
  assert(sales.length >= 3, `sales report returns line-item rows (${sales.length})`);

  const fin = await financialReport({});
  assert(fin.totals.revenue > 0, `financial report totals revenue: ${fin.totals.revenue}`);

  const custReport = await customerReport();
  assert(custReport.find((c: any) => c.customer_id === newCustomer.id)?.total_job_orders === 1,
    'customer report shows correct job order count for ABC Limited (numeric, not string)');

  const debts = await listDebts();
  assert(debts.some((d: any) => d.customer_name === 'ABC Limited'), 'ABC Limited appears in debts list (145000 - 40000 outstanding)');

  const aging = await debtAgingSummary();
  assert(aging.some((a: any) => a.age_bucket === 'current'), 'debt aging summary has a current bucket');

  const logs = await listAuditLogs({ module: 'job_orders' });
  assert(logs.length >= 2, `audit log captured job order inserts (${logs.length} entries)`);

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

async function expectThrow(fn: () => Promise<unknown>, msg: string) {
  try {
    await fn();
    assert(false, msg);
  } catch {
    assert(true, msg);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
