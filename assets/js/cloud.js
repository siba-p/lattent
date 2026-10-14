/* Benchfit cloud: accounts (email sign-in links), plan, cloud projects, Lab teams,
   checkout and account deletion. Talks only to Supabase with the public anon key;
   the database's row-level security decides what each user may read or write. */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG;
  const U = BF.ui;
  const C = { enabled: false, user: null, session: null, ent: null };
  BF.cloud = C;
  const sbCfg = CFG.supabase || {};
  if (!sbCfg.url || !sbCfg.anonKey || !window.supabase || !window.supabase.createClient) return;

  const sb = window.supabase.createClient(sbCfg.url, sbCfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'bf.auth' }
  });
  C.enabled = true;
  C.client = sb;
  const fire = () => document.dispatchEvent(new CustomEvent('bf:auth', { detail: { user: C.user } }));
  const ENT_KEY = 'bf.ent';
  const cacheEnt = e => { C.ent = e; U.store.set(ENT_KEY, e ? Object.assign({ uid: C.user && C.user.id, at: Date.now() }, e) : null); document.dispatchEvent(new CustomEvent('bf:pro')); };

  C.ready = (async () => {
    const { data } = await sb.auth.getSession();
    C.session = data.session; C.user = data.session ? data.session.user : null;
    if (C.user) await C.entitlement().catch(() => null); else cacheEnt(null);
    fire();
  })();
  sb.auth.onAuthStateChange((evt, session) => {
    const before = C.user && C.user.id;
    C.session = session; C.user = session ? session.user : null;
    if (!C.user) cacheEnt(null);
    if ((C.user && C.user.id) !== before) { if (C.user) C.entitlement().catch(() => null); fire(); }
  });

  C.signIn = async function (email) {
    email = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    const redirect = location.href.split('#')[0].replace(/[?&](code|error[^=]*)=[^&]*/g, '');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    if (error) throw new Error(error.message);
  };
  C.signOut = async function () { await sb.auth.signOut(); cacheEnt(null); fire(); };

  C.entitlement = async function () {
    if (!C.user) return null;
    const { data, error } = await sb.rpc('my_entitlement');
    if (error) throw new Error(error.message);
    cacheEnt(data);
    return data;
  };

  /* ---------- projects ---------- */
  const need = () => { if (!C.user) throw new Error('Sign in to use cloud storage.'); };
  const friendly = e => {
    const m = (e && e.message) || String(e);
    if (/quota: project limit/.test(m)) return 'Your plan’s cloud project limit is reached. Delete a project or upgrade to Pro.';
    if (/quota: storage/.test(m)) return 'Your cloud storage is full. Delete old projects or upgrade.';
    if (/5 MB|project_size/.test(m)) return 'This project is larger than 5 MB, the limit for one cloud project.';
    if (/JWT|session/i.test(m)) return 'Your session expired. Please sign in again.';
    return m;
  };
  C.friendly = friendly;
  C.list = async function () {
    need();
    const { data, error } = await sb.from('projects').select('id,name,updated_at,bytes,version,team_id,owner').order('updated_at', { ascending: false }).limit(500);
    if (error) throw new Error(friendly(error));
    return data;
  };
  C.load = async function (id) {
    need();
    const { data, error } = await sb.from('projects').select('*').eq('id', id).single();
    if (error) throw new Error(friendly(error));
    return data;
  };
  /* Optimistic concurrency: an update only succeeds if nobody saved a newer version. */
  C.save = async function (name, data, meta) {
    need();
    meta = meta || {};
    if (meta.id) {
      const q = sb.from('projects').update({ name, data, team_id: meta.teamId || null }).eq('id', meta.id);
      const { data: rows, error } = await (meta.force ? q : q.eq('version', meta.version)).select('id,version,updated_at,team_id');
      if (error) throw new Error(friendly(error));
      if (!rows.length) { const e = new Error('This project was changed elsewhere since you opened it.'); e.conflict = true; throw e; }
      return rows[0];
    }
    const { data: row, error } = await sb.from('projects').insert({ name, data, team_id: meta.teamId || null }).select('id,version,updated_at,team_id').single();
    if (error) throw new Error(friendly(error));
    return row;
  };
  C.remove = async function (id) {
    need();
    const { error } = await sb.from('projects').delete().eq('id', id);
    if (error) throw new Error(friendly(error));
  };
  C.exportAll = async function () {
    need();
    const { data, error } = await sb.from('projects').select('*').eq('owner', C.user.id);
    if (error) throw new Error(friendly(error));
    U.download('benchfit-cloud-export-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json', JSON.stringify({ exported: new Date().toISOString(), email: C.user.email, projects: data }, null, 1));
  };

  /* ---------- billing ---------- */
  C.subscriptions = async function () {
    need();
    const { data, error } = await sb.from('subscriptions').select('id,plan,status,renews_at,ends_at,portal_url,update_payment_url').order('updated_at', { ascending: false });
    if (error) throw new Error(friendly(error));
    return data;
  };
  C.checkoutUrl = function (variant) {
    const base = CFG.checkout && CFG.checkout[variant];
    if (!base || !C.user) return null;
    const u = new URL(base);
    u.searchParams.set('checkout[email]', C.user.email);
    u.searchParams.set('checkout[custom][user_id]', C.user.id);
    return u.toString();
  };

  /* ---------- Lab team ---------- */
  C.team = async function () {
    need();
    const { data: teams, error } = await sb.from('teams').select('id,name,seats,owner');
    if (error) throw new Error(friendly(error));
    if (!teams.length) return null;
    const { data: roster, error: e2 } = await sb.rpc('team_roster');
    if (e2) throw new Error(friendly(e2));
    const t = teams.find(x => x.owner === C.user.id) || teams[0];
    return Object.assign({}, t, { isOwner: t.owner === C.user.id, roster });
  };
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(friendly(error)); return data; };
  C.invite = email => rpc('invite_member', { member_email: email });
  C.removeMember = id => rpc('remove_member', { member: id });
  C.cancelInvite = email => rpc('cancel_invite', { member_email: email });
  C.leaveTeam = () => rpc('leave_team');
  C.renameTeam = name => rpc('rename_team', { new_name: name });

  /* ---------- account deletion ---------- */
  C.deleteAccount = async function () {
    need();
    const r = await fetch(sbCfg.url + '/functions/v1/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + C.session.access_token, apikey: sbCfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Could not delete the account.'); e.portal = j.portal_url; throw e; }
    await sb.auth.signOut(); cacheEnt(null); fire();
    return true;
  };
})();
