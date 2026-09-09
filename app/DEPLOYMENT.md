# Deploying Clearmission to Production

This wasn't done as part of this build — there's no cloud account or
credentials available in the sandbox this was built in. Everything below is
accurate to what the app actually needs (verified against its real code,
not guessed), but the actual `vercel deploy` / Neon project creation is a
step for whoever has those accounts.

## 1. Database — Neon

1. Create a Neon project (Postgres 16+; the schema uses `pgcrypto` and
   `pg_trgm` extensions, both available on Neon by default).
2. Run the schema files against it, in order, using Neon's SQL editor or
   `psql` with the connection string Neon gives you:
   ```
   psql "$NEON_CONNECTION_STRING" -f schema/01_core.sql
   psql "$NEON_CONNECTION_STRING" -f schema/02_inventory.sql
   ... (03 through 10, in numeric order)
   ```
3. Run `schema/11_scoped_app_role.sql` **as a separate step, using a
   superuser/admin connection** — it creates a new `clearmission_app` role
   with only DML privileges (no CREATE/DROP/TRUNCATE). This was tested
   directly against a live database in this build: confirmed `DROP TABLE`
   and `CREATE TABLE` both fail under that role while normal app operations
   succeed. Before running it against the real database:
   - Replace `change-this-password` with a real generated password.
   - Replace `your_database_name` with Neon's actual database name (Neon
     usually calls it `neondb` unless you named it something else) — this
     is a literal identifier requirement, not a placeholder for convenience;
     `GRANT CONNECT ON DATABASE current_database()` is invalid syntax and
     will fail (found this by actually running it, not by reading docs).
4. Point the app's `DATABASE_URL` at the `clearmission_app` role's
   connection string, not the admin/superuser one used to run the schema
   files. The app has no legitimate reason to hold elevated DB privileges
   at runtime.
5. Neon's point-in-time recovery is available on paid tiers and is
   configured in the Neon dashboard, not in this codebase — turn it on
   before going live. On the free tier, there's a much shorter retention
   window; know which one you're on.

## 2. App — Vercel

1. Import this repo (the `app/` folder is the Next.js project root) into a
   new Vercel project.
2. Set these environment variables in Vercel's project settings — **all
   three are required; the app will not start without them**, by design:
   - `DATABASE_URL` — the `clearmission_app` connection string from step 1.
     Confirmed in this build: the app throws immediately at startup if this
     is unset, rather than silently failing on the first query.
   - `SESSION_SECRET` — a long random string (`openssl rand -base64 32` is
     fine), unique to this deployment. Confirmed in this build: the app
     refuses to start in production if this is unset OR equals the
     development fallback string that ships in the source — verified by
     actually starting the built app with the variable unset and watching
     it throw, not just reading the code and assuming it would.
   - `NODE_ENV=production` — Vercel sets this automatically; only relevant
     if deploying somewhere that doesn't.
3. Vercel's build command is just `next build` (the default) — no custom
   build config needed. Confirmed clean build under Next.js 16 / React 19
   in this sandbox before this doc was written.
4. First deploy: log in as the seeded `admin`/`admin123` account **and
   change that password immediately** — there's no forced-password-change
   flow yet (see Known Gaps in the main README), so this is a manual step
   that's easy to forget.

## 3. What to check immediately after the first real deploy

- Hit `/api/dashboard` while logged out — should be 401. While logged in
  as the cashier seed account — should be 403. These are automated in
  `tests/security.test.ts`, but that suite runs against `localhost`; rerun
  it once with `BASE` pointed at the real deployment URL as a smoke test.
- Confirm the security headers are present: `curl -I https://your-domain/`
  should show `X-Frame-Options: DENY`, `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`. These were added
  and verified with a Nikto scan during this build (see the main README's
  security section) — a fresh scan against the real domain isn't a bad
  idea either, since a reverse proxy or CDN in front of Vercel could
  theoretically strip headers Vercel itself doesn't touch.
- Confirm rate limiting still works: 6 rapid failed logins from one source
  should 429 on the 6th. **Important caveat, stated plainly**: the rate
  limiter is in-memory per server process. Vercel's serverless functions
  are not guaranteed to be the same process between requests, so this
  protection may be substantially weaker in that environment than it is
  against a single long-running `next start` process (which is how it was
  tested in this build, on a traditional Node server, not on Vercel's
  actual serverless infrastructure). If going to Vercel specifically, this
  needs a shared store (Vercel KV, Upstash Redis, or similar) before it can
  be trusted — **this is a real gap in the current implementation for a
  serverless target, not just a note.**

## 4. Monitoring and error tracking — not configured, here's what's needed

Nothing in this codebase currently reports errors anywhere except server
logs (`console.error`, visible in Vercel's function logs). For production:

- **Error tracking**: Sentry's Next.js SDK (`@sentry/nextjs`) is the
  standard choice and integrates with `next.config.js` via a wrapping
  function. Not added here — would need a Sentry account/DSN, which
  wasn't available to set up in this environment.
- **Uptime monitoring**: something external hitting `/api/dashboard` or
  the login page on an interval (UptimeRobot, Better Uptime, or Vercel's
  own monitoring) — nothing currently alerts anyone if the app goes down.
- **Database monitoring**: Neon's dashboard shows connection count, query
  performance, and storage — worth checking after real usage starts, since
  none of this was load-tested (see Known Gaps).
