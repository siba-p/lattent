/* End-to-end tests of the Razorpay webhook and the contact form against the real schema
   (PGlite). Payloads are signed as Razorpay signs them (HMAC-SHA256 of the raw body, hex).
   Usage: node --experimental-strip-types tests/db/razorpay.test.mjs */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRazorpay } from '../../supabase/functions/_shared/razorpay.ts';
import { handleContact } from '../../supabase/functions/_shared/contact.ts';

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
  async getSubscription(id) { const r = await svc('select ls_updated_at, email, user_id from public.subscriptions where id = $1', [id]); return r[0] ? { ls_updated_at: r[0].ls_updated_at && new Date(r[0].ls_updated_at).toISOString(), email: r[0].email, user_id: r[0].user_id } : null; },
  async upsertSubscription(row) {
    const cols = Object.keys(row);
    await svc(`insert into public.subscriptions (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')})
      on conflict (id) do update set ${cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}, updated_at = now()`, cols.map(c => row[c]));
  },
  async markRefunded(orderId) { return (await svc(`update public.subscriptions set status = 'refunded' where order_id = $1 returning id`, [orderId])).length; },
  async ensureLabTeam(id) { await svc('select public.ensure_lab_team($1)', [id]); },
};

const cfg = { secret: 'rzp_whsec_1', proPlans: ['plan_PRO'], labPlans: ['plan_LAB'], proLinks: ['plink_PRO'], labLinks: ['plink_LAB'], prepaidMonths: 12 };
const sign = raw => createHmac('sha256', cfg.secret).update(raw).digest('hex');
let clock = Math.floor(Date.parse('2026-10-16T10:00:00Z') / 1000);
const send = async (ev, sig, id) => { const raw = JSON.stringify(ev); return handleRazorpay(raw, sig === undefined ? sign(raw) : sig, id || 'evt_' + (clock++), store, cfg); };
const subEv = (event, o) => ({ entity: 'event', event, created_at: o.at || clock++, payload: {
  subscription: { entity: { id: o.id, plan_id: o.plan || 'plan_PRO', status: o.status || 'active', current_end: clock + 30 * 86400, ended_at: o.ended || null, customer_id: 'cust_1', short_url: 'https://rzp.io/i/x', notes: o.notes || {} } },
  payment: o.email ? { entity: { id: 'pay_' + clock, email: o.email, order_id: 'order_' + o.id } } : undefined } });
const ent = async email => {
  const u = (await db.query('select id from auth.users where email = $1', [email])).rows[0];
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email })]);
  const r = (await db.query('select public.my_entitlement() as e')).rows[0].e;
  await db.exec('reset role');
  return r.plan;
};
const user = async email => (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;

const priya = await user('priya@iitd.ac.in');
let r = await send(subEv('subscription.activated', { id: 'sub_A', email: 'priya@iitd.ac.in' }), 'f'.repeat(64));
ok(r.status === 401 && await ent('priya@iitd.ac.in') === 'free', 'unsigned Razorpay event is refused and grants nothing');
r = await send(subEv('subscription.activated', { id: 'sub_A', email: 'priya@iitd.ac.in' }));
ok(r.status === 200 && await ent('priya@iitd.ac.in') === 'pro', 'subscription.activated gives Pro (matched by email)');
const dupEv = subEv('subscription.charged', { id: 'sub_A', email: 'priya@iitd.ac.in' });
await send(dupEv, undefined, 'evt_dup'); r = await send(dupEv, undefined, 'evt_dup');
ok(r.body === 'duplicate', 'a replayed delivery (same event id) is ignored');
r = await send(subEv('subscription.halted', { id: 'sub_A', email: 'priya@iitd.ac.in', status: 'halted', at: clock - 5000 }));
ok(r.body.includes('stale') && await ent('priya@iitd.ac.in') === 'pro', 'an older, out-of-order event cannot downgrade');
await send(subEv('subscription.cancelled', { id: 'sub_A', status: 'cancelled' }));
ok(await ent('priya@iitd.ac.in') === 'pro', 'cancelled keeps Pro until the paid period ends');
await send(subEv('subscription.completed', { id: 'sub_A', status: 'completed' }));
ok(await ent('priya@iitd.ac.in') === 'free', 'completed subscription returns to free');
r = await send(subEv('subscription.activated', { id: 'sub_X', plan: 'plan_OTHER', email: 'priya@iitd.ac.in' }));
ok(r.body.includes('unknown plan'), 'an unknown plan id is ignored');

/* one-time payment link: a prepaid year */
const ravi = await user('ravi@lab.org');
r = await send({ entity: 'event', event: 'payment_link.paid', created_at: clock++, payload: { payment_link: { entity: { id: 'plink_LAB', customer: { email: 'ravi@lab.org' } } }, payment: { entity: { id: 'pay_77', email: 'ravi@lab.org', order_id: 'order_77' } } } });
ok(r.status === 200 && await ent('ravi@lab.org') === 'lab', 'a one-time Lab payment gives the Lab plan');
const end = (await db.query(`select ends_at, status, provider from public.subscriptions where id = 'rzpl_pay_77'`)).rows[0];
ok(end.status === 'prepaid' && end.provider === 'razorpay' && Math.abs(new Date(end.ends_at) - Date.parse('2027-10-16T10:00:00Z')) < 3 * 864e5, 'prepaid plan lasts twelve months and records the provider');
await db.query(`update public.subscriptions set ends_at = now() - interval '1 day' where id = 'rzpl_pay_77'`);
ok(await ent('ravi@lab.org') === 'free', 'a prepaid plan ends on its end date');
await db.query(`update public.subscriptions set ends_at = now() + interval '200 days' where id = 'rzpl_pay_77'`);
r = await send({ entity: 'event', event: 'refund.processed', created_at: clock++, payload: { payment: { entity: { id: 'pay_77', order_id: 'order_77' } }, refund: { entity: { payment_id: 'pay_77' } } } });
ok(r.body === 'refunded 1' && await ent('ravi@lab.org') === 'free', 'a refund revokes the prepaid plan');

/* the contact form */
const saved = [], mails = [];
const cstore = { async recentCount(email) { return saved.filter(e => e.email === email).length; }, async save(e) { saved.push(e); return saved.length; } };
const mailer = { async send(subject, text, replyTo) { mails.push({ subject, text, replyTo }); return true; } };
const good = { name: 'Dr Asha Rao', email: 'Asha@Uni.edu', organisation: 'IISc', topic: 'lab', message: 'We would like a Lab plan for eight people, paid by invoice.', elapsed: 9000 };
r = await handleContact(good, cstore, mailer);
ok(r.status === 200 && saved.length === 1 && mails[0].replyTo === 'asha@uni.edu' && /Lab plan/.test(mails[0].subject), 'a valid enquiry is stored and emailed with the sender as reply-to');
r = await handleContact(Object.assign({}, good, { website: 'http://spam' }), cstore, mailer);
ok(r.status === 200 && saved.length === 1, 'a bot that fills the hidden field is silently dropped');
r = await handleContact(Object.assign({}, good, { elapsed: 400 }), cstore, mailer);
ok(r.status === 400 && saved.length === 1, 'an instant submission is refused');
r = await handleContact(Object.assign({}, good, { email: 'not-an-email' }), cstore, mailer);
ok(r.status === 400, 'an invalid address is refused');
await handleContact(good, cstore, mailer); await handleContact(good, cstore, mailer);
r = await handleContact(good, cstore, mailer);
ok(r.status === 429, 'more than three messages an hour from one address are rate-limited');
r = await handleContact(Object.assign({}, good, { topic: 'x', message: 'Hello\u0000 there, this is a test message' }), cstore, mailer);
/* the database accepts what the function stores */
await db.exec('set role service_role');
const row = (await db.query(`insert into public.enquiries (name, email, organisation, topic, message) values ($1,$2,$3,$4,$5) returning id`, [saved[0].name, saved[0].email, saved[0].organisation, saved[0].topic, saved[0].message])).rows[0];
await db.exec('reset role');
ok(!!row.id, 'enquiries table accepts a valid enquiry');
await db.exec('set role anon');
let blocked = false; try { await db.query('select * from public.enquiries'); } catch (e) { blocked = true; }
await db.exec('reset role');
ok(blocked, 'the public cannot read enquiries');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
