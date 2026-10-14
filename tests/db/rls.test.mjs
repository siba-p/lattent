/* Security tests for the Supabase migration, run in PGlite (Postgres compiled to WASM).
   A minimal stand-in for Supabase's auth schema and roles is created first; each check
   then acts as a specific user through SET ROLE and the JWT settings, exactly as
   PostgREST does in production. Usage: node tests/db/rls.test.mjs */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', '..', 'supabase', 'migrations');
const db = new PGlite();
let failures = 0, passes = 0;
const ok = (cond, name) => { if (cond) { passes++; console.log('ok  ', name); } else { failures++; console.log('FAIL', name); } };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'));
await db.exec(`grant all on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);

const users = {};
async function signup(name, email) {
  await db.exec('reset role');
  const r = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  users[name] = { id: r.rows[0].id, email };
}
async function as(name, fn) {
  if (name === 'service') await db.exec(`set role service_role`);
  else if (name === 'anon') await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false);`);
  else {
    const u = users[name];
    await db.exec('set role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })]);
  }
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const tryq = async (sql, params) => { try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } };
const ent = async name => as(name, async () => (await db.query('select public.my_entitlement() as e')).rows[0].e);
const proj = (n, extra) => JSON.stringify(Object.assign({ tables: [{ name: n, rows: [[1, 2]] }], items: [] }, extra || {}));
const addSub = (id, email, plan, status, extra) => as('service', () => db.query(
  `insert into public.subscriptions (id, email, plan, status, ends_at, user_id) values ($1, $2, $3, $4, $5,
     (select id from public.profiles where lower(email) = lower($2)))
   on conflict (id) do update set status = excluded.status, ends_at = excluded.ends_at`,
  [id, email, plan, status, (extra && extra.ends_at) || null]));

await signup('alice', 'alice@uni.edu');
await signup('bob', 'bob@uni.edu');
await signup('carol', 'carol@lab.org');
await signup('eve', 'eve@evil.com');

/* free plan quotas */
for (let i = 0; i < 3; i++) await as('bob', () => db.query('insert into public.projects (name, data) values ($1, $2)', ['B' + i, proj('b' + i)]));
const fourth = await as('bob', () => tryq('insert into public.projects (name, data) values ($1, $2)', ['B4', proj('b4')]));
ok(/project limit/.test(fourth.error || ''), 'free plan stops at 3 cloud projects');
ok((await ent('bob')).plan === 'free', 'bob is on the free plan');

/* isolation between users */
const eveSees = await as('eve', () => tryq('select * from public.projects'));
ok(eveSees.rows && eveSees.rows.length === 0, 'eve cannot read anyone else\'s projects');
const bobProj = await as('bob', async () => (await db.query('select id from public.projects order by name limit 1')).rows[0].id);
const eveUpd = await as('eve', () => tryq('update public.projects set name = $1 where id = $2 returning id', ['pwned', bobProj]));
ok(!eveUpd.error && eveUpd.rows.length === 0, 'eve cannot update bob\'s project');
const eveDel = await as('eve', () => tryq('delete from public.projects where id = $1 returning id', [bobProj]));
ok(!eveDel.error && eveDel.rows.length === 0, 'eve cannot delete bob\'s project');
const eveSpoof = await as('eve', () => tryq('insert into public.projects (owner, name, data) values ($1, $2, $3)', [users.bob.id, 'x', proj('x')]));
ok(!!eveSpoof.error, 'eve cannot create a project owned by bob');
const steal = await as('bob', () => tryq('update public.projects set owner = $1 where id = $2', [users.eve.id, bobProj]));
ok(!!steal.error, 'owner column cannot be changed by clients');
const ver = await as('bob', async () => (await db.query('update public.projects set name = $1 where id = $2 returning version, bytes', ['renamed', bobProj])).rows[0]);
ok(ver.version === 2 && ver.bytes > 0, 'version and size are maintained by the server');
const fake = await as('bob', () => tryq('update public.projects set bytes = 1 where id = $1', [bobProj]));
ok(!!fake.error, 'clients cannot write the size column');

/* billing tables are read-only for clients */
const selfUpgrade = await as('eve', () => tryq(`insert into public.subscriptions (id, email, plan, status) values ('x', 'eve@evil.com', 'pro', 'active')`));
ok(!!selfUpgrade.error, 'eve cannot grant herself a subscription');
const hook = await as('eve', () => tryq('select * from public.webhook_events'));
ok(!!hook.error || hook.rows.length === 0, 'webhook log is not readable by clients');
const internal = await as('eve', () => tryq('select public.entitlement_for($1)', [users.alice.id]));
ok(!!internal.error, 'internal entitlement function is not callable by clients');
const anonRead = await as('anon', () => tryq('select * from public.projects'));
ok(!!anonRead.error || anonRead.rows.length === 0, 'anonymous visitors see nothing');
const anonEnt = await as('anon', () => tryq('select public.my_entitlement()'));
ok(!!anonEnt.error, 'anonymous visitors cannot call my_entitlement');

/* Pro subscription */
await addSub('sub_alice', 'alice@uni.edu', 'pro', 'active');
const ea = await ent('alice');
ok(ea.plan === 'pro' && ea.pro === true, 'active Pro subscription gives Pro');
for (let i = 0; i < 5; i++) await as('alice', () => db.query('insert into public.projects (name, data) values ($1, $2)', ['A' + i, proj('a' + i)]));
ok((await ent('alice')).projects === 5, 'Pro can store more than 3 projects');
const aliceSub = await as('alice', () => tryq('select id, status from public.subscriptions'));
ok(aliceSub.rows.length === 1 && aliceSub.rows[0].id === 'sub_alice', 'alice sees her own subscription only');
const eveSub = await as('eve', () => tryq('select id from public.subscriptions'));
ok(eveSub.rows.length === 0, 'eve cannot see alice\'s subscription');
const big = await as('alice', () => tryq('insert into public.projects (name, data) values ($1, $2)', ['huge', JSON.stringify({ blob: 'x'.repeat(5 * 1024 * 1024 + 10) })]));
ok(/5 MB|project_size/.test(big.error || ''), 'projects over 5 MB are rejected');
await addSub('sub_alice', 'alice@uni.edu', 'pro', 'cancelled', { ends_at: new Date(Date.now() + 86400e3).toISOString() });
ok((await ent('alice')).plan === 'pro', 'cancelled subscription keeps Pro until the period ends');
await addSub('sub_alice', 'alice@uni.edu', 'pro', 'expired');
ok((await ent('alice')).plan === 'free', 'expired subscription returns to free');
const after = await as('alice', () => tryq('insert into public.projects (name, data) values ($1, $2)', ['A9', proj('a9')]));
ok(/project limit/.test(after.error || ''), 'after expiry no new projects beyond the free limit');
const keep = await as('alice', () => tryq('select count(*)::int as n from public.projects'));
ok(keep.rows[0].n === 5, 'existing projects stay readable after expiry');
await addSub('sub_alice', 'alice@uni.edu', 'pro', 'past_due');
ok((await ent('alice')).plan === 'pro', 'past-due (payment retry) keeps access');

/* buying before creating an account */
await addSub('sub_frank', 'Frank@Uni.edu', 'pro', 'active');
await signup('frank', 'frank@uni.edu');
ok((await ent('frank')).plan === 'pro', 'purchase made before sign-up is linked by email');

/* Lab plan and teams */
await addSub('sub_carol', 'carol@lab.org', 'lab', 'active');
await as('service', () => db.query(`select public.ensure_lab_team('sub_carol')`));
ok((await ent('carol')).plan === 'lab', 'Lab owner has the lab plan');
const inv1 = await as('carol', async () => (await db.query(`select public.invite_member('dave@lab.org') as r`)).rows[0].r);
ok(inv1 === 'invited', 'inviting someone without an account creates an invite');
const inv2 = await as('carol', async () => (await db.query(`select public.invite_member('bob@uni.edu') as r`)).rows[0].r);
ok(inv2 === 'added', 'inviting an existing user adds them directly');
await signup('dave', 'dave@lab.org');
ok((await ent('dave')).plan === 'lab-member', 'invited user joins the team on sign-up');
ok((await ent('bob')).plan === 'lab-member', 'added user becomes a lab member');
const evilInvite = await as('eve', () => tryq(`select public.invite_member('mallory@x.com')`));
ok(!!evilInvite.error, 'non-owners cannot invite');
const team = await as('carol', async () => (await db.query('select id from public.teams')).rows[0].id);
const tp = await as('carol', async () => (await db.query('insert into public.projects (name, data, team_id) values ($1, $2, $3) returning id', ['Shared', proj('shared'), team])).rows[0].id);
const daveRead = await as('dave', () => tryq('select name from public.projects where id = $1', [tp]));
ok(daveRead.rows.length === 1, 'team member can read a team project');
const daveUpd = await as('dave', () => tryq('update public.projects set data = $1 where id = $2 returning version', [proj('edited'), tp]));
ok(daveUpd.rows && daveUpd.rows.length === 1 && daveUpd.rows[0].version === 2, 'team member can edit a team project');
const daveDel = await as('dave', () => tryq('delete from public.projects where id = $1 returning id', [tp]));
ok(daveDel.rows.length === 0, 'team member cannot delete the owner\'s project');
const eveTeam = await as('eve', () => tryq('select * from public.projects where id = $1', [tp]));
ok(eveTeam.rows.length === 0, 'outsider cannot see team projects');
const eveJoin = await as('eve', () => tryq('insert into public.projects (name, data, team_id) values ($1, $2, $3)', ['x', proj('x'), team]));
ok(!!eveJoin.error, 'outsider cannot put a project into someone else\'s team');
const eveMembers = await as('eve', () => tryq('select * from public.team_members'));
ok(eveMembers.rows.length === 0, 'outsider cannot list team members');
const daveInv = await as('dave', () => tryq('select * from public.team_invites'));
ok(daveInv.rows.length === 0, 'members cannot see pending invites');
const roster = await as('carol', async () => (await db.query('select email, role, pending from public.team_roster() order by email')).rows);
ok(roster.length === 3 && roster.some(x => x.email === 'dave@lab.org' && !x.pending), 'owner sees the team roster');
const eveRoster = await as('eve', async () => (await db.query('select * from public.team_roster()')).rows);
ok(eveRoster.length === 0, 'outsiders get an empty roster');
await as('carol', () => db.query('select public.remove_member($1)', [users.dave.id]));
ok((await ent('dave')).plan === 'free', 'removed member loses access');
const daveAfter = await as('dave', () => tryq('select * from public.projects where id = $1', [tp]));
ok(daveAfter.rows.length === 0, 'removed member can no longer read team projects');
await addSub('sub_carol', 'carol@lab.org', 'lab', 'expired');
ok((await ent('bob')).plan === 'free' && (await ent('carol')).plan === 'free', 'expired Lab plan revokes the whole team');

/* account deletion cascades */
await db.exec('reset role');
await db.query('delete from auth.users where id = $1', [users.alice.id]);
const left = await db.query('select count(*)::int as n from public.projects where owner = $1', [users.alice.id]);
const subLeft = await db.query(`select user_id from public.subscriptions where id = 'sub_alice'`);
ok(left.rows[0].n === 0 && subLeft.rows[0].user_id === null, 'deleting an account removes its projects and unlinks billing');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
