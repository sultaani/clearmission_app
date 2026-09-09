// Live HTTP security tests against a running `next start` server on :3000.
// Run manually: start the server, then `npx tsx tests/security.test.ts`.
// Not wired into the other DB-fixture-based suites since it drives real
// HTTP + a forged JWT, not the service layer directly.

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

const BASE = 'http://localhost:3000';

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get('set-cookie');
  const match = setCookie?.match(/session=([^;]+)/);
  if (!match) throw new Error(`Login failed for ${username}`);
  return match[1];
}

async function main() {
  console.log('=== Security regression ===');

  const adminCookie = await login('admin', 'admin123');
  const cashierCookie = await login('cashier', 'cashier123');

  // --- Role boundary enforcement ---
  const r1 = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: `session=${cashierCookie}` } });
  assert(r1.status === 403, 'Cashier blocked from Admin-only dashboard (403)');

  const r2 = await fetch(`${BASE}/api/audit-logs`, { headers: { Cookie: `session=${cashierCookie}` } });
  assert(r2.status === 403, 'Cashier blocked from audit logs (403)');

  const r3 = await fetch(`${BASE}/api/dashboard`);
  assert(r3.status === 401, 'No cookie at all is rejected (401)');

  // --- Forged / tampered session tokens ---
  const { SignJWT } = await import('jose');
  const wrongSecret = new TextEncoder().encode('attacker-guessed-secret');
  const forged = await new SignJWT({ username: 'admin', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('11111111-1111-1111-1111-111111111111')
    .setExpirationTime('1h')
    .sign(wrongSecret);
  const r4 = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: `session=${forged}` } });
  assert(r4.status === 401, 'Token signed with the wrong secret is rejected (401), not trusted');

  // --- SQL injection: entity parameter into a raw table-name FROM clause ---
  const r5 = await fetch(`${BASE}/api/deleted-records?entity=customers%3B+DROP+TABLE+users%3B+--`, {
    headers: { Cookie: `session=${adminCookie}` },
  });
  const body5 = await r5.json();
  assert(r5.status === 400 && /Unknown or non-deletable entity/.test(body5.error ?? ''),
    'Deleted-records entity injection attempt is rejected by whitelist validation, not executed');

  // confirm the users table is still actually there afterward (belt and suspenders)
  const r5b = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  assert(r5b.ok, 'users table (and admin login) still intact after the injection attempt');

  // --- Information disclosure: raw DB errors should not reach the client ---
  const r6 = await fetch(`${BASE}/api/job-orders/not-a-real-uuid`, { headers: { Cookie: `session=${adminCookie}` } });
  const body6 = await r6.json();
  assert(!/invalid input syntax|column|relation|SQLSTATE/i.test(body6.error ?? ''),
    `raw DB error text does not leak to the client (got: "${body6.error}")`);

  // --- Rate limiting on login ---
  const rateLimitIp = `test-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': rateLimitIp },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
  }
  const r7 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': rateLimitIp },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert(r7.status === 429, 'sixth failed login from the same IP is rate-limited (429)');

  const r8 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': rateLimitIp },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  assert(r8.status === 429, 'a CORRECT password from a blocked IP is still blocked (rate limit checked first)');

  const r9 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `${rateLimitIp}-other` },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  assert(r9.status === 200, 'a different IP is unaffected by another IP being rate-limited');

  // --- No 500s under hostile/malformed input ---
  const malformed = [
    () => fetch(`${BASE}/api/job-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `session=${adminCookie}` }, body: '{not json' }),
    () => fetch(`${BASE}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `session=${adminCookie}` }, body: JSON.stringify({}) }),
    () => fetch(`${BASE}/api/reports/material`, { headers: { Cookie: `session=${adminCookie}` } }),
    () => fetch(`${BASE}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `session=${cashierCookie}` }, body: JSON.stringify({ operations: [] }) }),
  ];
  for (const [i, req] of malformed.entries()) {
    const res = await req();
    assert(res.status < 500, `hostile request #${i + 1} returns ${res.status}, not a 500`);
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
