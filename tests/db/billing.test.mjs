/* End-to-end tests of the Lemon Squeezy webhook handler against the real schema (PGlite).
   Signed payloads are built exactly as Lemon Squeezy builds them (HMAC-SHA256 of the raw
   body). Usage: node tests/db/billing.test.mjs */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleWebhook, verifySignature } from '../../supabase/functions/_shared/billing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', '..', 'supabase', 'migrations');
const db = new PGlite();
let fails = 0, passes = 0;
const ok = (c, n) => { if (c) { passes++; console.log('ok  ', n); } else { fails++; console.log('FAIL', n); } };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;`);
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'));
await db.exec('grant all on all tables in schema public to service_role;');

/* the same store the Edge Function uses, implemented over SQL as the service role */
const svc = async (sql, p) => { await db.exec('set role service_role'); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
const store = {
  async recordEvent(id, name, payload) { const r = await svc('insert into public.webhook_events (id, event_name, payload) values ($1,$2,$3) on conflict do nothing returning id', [id, name, JSON.stringify(payload)]); return r.length === 1; },
  async userExists(id) { return (await svc('select 1 from public.profiles where id = $1', [id])).length === 1; },
  async findUserIdByEmail(email) { const r = await svc('select id from public.profiles where lower(email) = lower($1) limit 1', [email]); return r[0] ? r[0].id : null; },
  async getSubscription(id) { const r = await svc('select ls_updated_at from public.subscriptions where id = $1', [id]); return r[0] ? { ls_updated_at: r[0].ls_updated_at && new Date(r[0].ls_updated_at).toISOString() } : null; },
  async upsertSubscription(row) {
    const cols = Object.keys(row);
    await svc(`insert into public.subscriptions (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')})
      on conflict (id) do update set ${cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}, updated_at = now()`, cols.map(c => row[c]));
  },
  async markRefunded(orderId) { return (await svc(`update public.subscriptions set status = 'refunded' where order_id = $1 returning id`, [orderId])).length; },
  async ensureLabTeam(id) { await svc('select public.ensure_lab_team($1)', [id]); },
};
const cfg = { secret: 'whsec_test_123', storeId: '4242', proVariants: ['111', '112'], labVariants: ['113'], allowTestMode: false };
const sign = raw => createHmac('sha256', cfg.secret).update(raw).digest('hex');
const send = async (ev, sig) => { const raw = JSON.stringify(ev); return handleWebhook(raw, sig === undefined ? sign(raw) : sig, store, cfg); };
let clock = Date.parse('2026-10-15T10:00:00Z');
const subEvent = (name, o) => ({
  meta: { event_name: name, custom_data: o.userId ? { user_id: o.userId } : undefined },
  data: { type: 'subscriptions', id: o.id, attributes: {
    store_id: o.store || 4242, customer_id: 9, order_id: o.order || 5001, variant_id: o.variant || 111, user_email: o.email,
    status: o.status || 'active', renews_at: '2026-11-15T10:00:00Z', ends_at: o.ends_at || null, test_mode: !!o.test,
    updated_at: o.updated_at || new Date(clock += 1000).toISOString(),
    urls: { customer_portal: 'https://store.lemonsqueezy.com/billing?x=1', update_payment_method: 'https://store.lemonsqueezy.com/pay?x=1' } } }
});
const ent = async email => {
  const u = (await db.query('select id from auth.users where email = $1', [email])).rows[0];
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email })]);
  const r = (await db.query('select public.my_entitlement() as e')).rows[0].e;
  await db.exec('reset role');
  return r.plan;
};
const user = async email => (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;

/* signature checks */
const rawGood = JSON.stringify({ a: 1 });
ok(await verifySignature(rawGood, sign(rawGood), cfg.secret), 'valid signature accepted');
ok(!(await verifySignature(rawGood + ' ', sign(rawGood), cfg.secret)), 'tampered body rejected');
ok(!(await verifySignature(rawGood, sign(rawGood).replace(/.$/, c => (c === '0' ? '1' : '0')), cfg.secret)), 'altered signature rejected');
ok(!(await verifySignature(rawGood, '', cfg.secret)), 'missing signature rejected');
ok(!(await verifySignature(rawGood, 'zz', cfg.secret)), 'malformed signature rejected');

const ana = await user('ana@uni.edu');
const forged = await send(subEvent('subscription_created', { id: '900', email: 'ana@uni.edu', userId: ana }), 'deadbeef'.repeat(8));
ok(forged.status === 401, 'unsigned (forged) event is refused with 401');
ok(await ent('ana@uni.edu') === 'free', 'forged event granted nothing');

/* normal lifecycle */
let r = await send(subEvent('subscription_created', { id: '901', email: 'ana@uni.edu', userId: ana }));
ok(r.status === 200 && await ent('ana@uni.edu') === 'pro', 'subscription_created gives Pro');
const dup = subEvent('subscription_updated', { id: '901', email: 'ana@uni.edu', userId: ana, status: 'active' });
await send(dup); r = await send(dup);
ok(r.body === 'duplicate', 'replayed delivery is ignored');
const stale = subEvent('subscription_updated', { id: '901', email: 'ana@uni.edu', status: 'expired', updated_at: '2026-10-15T09:00:00Z' });
r = await send(stale);
ok(r.body.includes('stale') && await ent('ana@uni.edu') === 'pro', 'out-of-order older update cannot downgrade');
await send(subEvent('subscription_cancelled', { id: '901', email: 'ana@uni.edu', status: 'cancelled', ends_at: new Date(Date.now() + 20 * 864e5).toISOString() }));
ok(await ent('ana@uni.edu') === 'pro', 'cancelled keeps Pro until the end of the period');
await send(subEvent('subscription_expired', { id: '901', email: 'ana@uni.edu', status: 'expired' }));
ok(await ent('ana@uni.edu') === 'free', 'expired returns to free');
await send(subEvent('subscription_resumed', { id: '901', email: 'ana@uni.edu', status: 'active' }));
ok(await ent('ana@uni.edu') === 'pro', 'resumed restores Pro');

/* refunds */
r = await send({ meta: { event_name: 'order_refunded' }, data: { type: 'orders', id: 5001, attributes: { store_id: 4242, status: 'refunded', updated_at: new Date(clock += 1000).toISOString() } } });
ok(r.body === 'refunded 1' && await ent('ana@uni.edu') === 'free', 'refund revokes access');

/* guards */
r = await send(subEvent('subscription_created', { id: '902', email: 'x@y.com', store: 1 }));
ok(r.body.includes('other store'), 'events from another store are ignored');
r = await send(subEvent('subscription_created', { id: '903', email: 'x@y.com', test: true }));
ok(r.body.includes('test mode'), 'test-mode events are ignored in production');
r = await send(subEvent('subscription_created', { id: '904', email: 'x@y.com', variant: 999 }));
ok(r.body.includes('unknown variant'), 'unknown products are ignored');
r = await send(subEvent('subscription_created', { id: '905', email: 'mallory@x.com', userId: '00000000-0000-4000-8000-000000000000' }));
const orphan = (await db.query(`select user_id from public.subscriptions where id = '905'`)).rows[0];
ok(r.status === 200 && orphan.user_id === null, 'a made-up user id in custom data is not trusted');

/* buy first, sign up later */
await send(subEvent('subscription_created', { id: '906', email: 'Ben@Lab.org' }));
await user('ben@lab.org');
ok(await ent('ben@lab.org') === 'pro', 'purchase before sign-up activates on sign-up');

/* Lab */
const cat = await user('cat@lab.org');
await send(subEvent('subscription_created', { id: '907', email: 'cat@lab.org', userId: cat, variant: 113 }));
const team = (await db.query('select t.id, t.seats from public.teams t where t.owner = $1', [cat])).rows[0];
ok(!!team && await ent('cat@lab.org') === 'lab', 'Lab purchase creates the team and the lab plan');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
