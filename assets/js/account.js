/* Account page: sign-in, plan and billing, cloud storage, Lab team, licence keys, deletion. */
(function () {
  'use strict';
  const CFG = window.BF_CONFIG, U = BF.ui, Pro = BF.pro, C = BF.cloud;
  const $ = s => document.querySelector(s);
  const esc = U.esc;
  const root = $('#acct-root');
  const qs = new URLSearchParams(location.search);
  const day = d => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const mb = b => (b / 1048576).toFixed(b < 1048576 ? 2 : 1) + ' MB';
  const PLAN = { free: 'Free', pro: 'Pro', lab: 'Lab', 'lab-member': 'Lab member', anonymous: 'Free' };
  const p = CFG.prices;
  const live = CFG.checkout && (CFG.checkout.monthly || CFG.checkout.yearly || CFG.checkout.lab);

  function planCards(signedIn) {
    if (!live) return '<p class="m-note">Paid plans open shortly. Meanwhile, the 7-day trial unlocks everything.</p>';
    const card = (id, title, price, per, sub, best) => `<div class="pcard${best ? ' best' : ''}"><b>${title}</b><div class="amt">$${price}<small>/${per}</small></div><p>${sub}</p>
      <button class="btn ${best ? 'primary' : ''}" data-buy="${id}">${signedIn ? 'Continue to secure checkout' : 'Sign in to buy'}</button></div>`;
    return `${CFG.earlyAccess ? '<p class="early">Early-access pricing while Lattent is new.</p>' : ''}
      <div class="pcards">${card('yearly', 'Pro yearly', p.yearly, 'year', 'Best value: about $' + (p.yearly / 12).toFixed(2) + ' a month', true)}${card('monthly', 'Pro monthly', p.monthly, 'month', 'Cancel any time')}${card('lab', 'Lab', p.lab, 'year', 'Up to 10 people, shared projects')}</div>
      <p class="hint">Payments are processed by Lemon Squeezy, our merchant of record, over a secure checkout. Lattent never sees your card details. Sales tax and VAT are included where they apply. 14-day refund, no questions asked.</p>`;
  }

  /* ---------- cloud disabled: licence keys and trial only ---------- */
  function renderLocal() {
    const k = Pro.kind(), s = Pro.state();
    root.innerHTML = `
      <section class="card acct"><h2>Plan</h2><div class="status ${Pro.active() ? 'on' : ''}"><span>${k === 'licence' ? '<b>Pro is active</b> on this browser.' : k === 'trial' ? `<b>Pro trial</b>: ${Math.ceil(Pro.trialLeft())} days left.` : k === 'trial-ended' ? 'Your trial has ended. You are on the free plan.' : 'You are on the <b>free plan</b>. Every analysis is free; Pro adds publication exports and more.'}</span></div>
        ${k === 'free' ? '<button class="btn primary" id="ac-trial">Start 7-day free trial</button>' : ''}</section>
      <section class="card acct"><h2>Plans</h2>${planCards(false)}</section>
      ${licenceBox(s)}`;
    wireLicence();
    const t = $('#ac-trial'); if (t) t.onclick = () => { Pro.startTrial(); renderLocal(); };
  }
  function licenceBox(s) {
    const has = s && s.key;
    return `<details class="card acct" ${has ? 'open' : ''}><summary><h2>Licence key</h2></summary>
      <p class="hint">If you received a licence key by email, activate it here. It is stored only in this browser.</p>
      ${has ? `<div class="status on">Licence ${esc(s.status)}${s.plan ? ' · ' + esc(s.plan) : ''}</div><button class="btn" id="ac-off">Deactivate on this browser</button>`
        : `<div class="row"><input type="text" id="ac-key" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autocomplete="off" spellcheck="false"><button class="btn primary" id="ac-go">Activate</button></div><p class="hint" id="ac-msg"></p>`}
    </details>`;
  }
  function wireLicence() {
    const go = $('#ac-go');
    if (go) go.onclick = () => {
      go.disabled = true; $('#ac-msg').textContent = 'Checking…';
      Pro.activate($('#ac-key').value).then(() => { U.toast('Pro activated. Thank you!', 'ok'); render(); })
        .catch(e => { $('#ac-msg').textContent = e.message; }).then(() => { go.disabled = false; });
    };
    const off = $('#ac-off'); if (off) off.onclick = () => Pro.deactivate().then(render);
  }

  /* ---------- signed out ---------- */
  function renderSignIn() {
    const buy = qs.get('buy');
    root.innerHTML = `
      <section class="card acct signin"><h2>Sign in or create an account</h2>
        <p>Enter your email and we will send you a secure sign-in link. No password to remember.${buy ? ' After signing in you will continue to checkout.' : ''}</p>
        <form id="si-form" class="row"><input type="email" id="si-email" placeholder="you@university.edu" autocomplete="email" required><button class="btn primary" type="submit">Email me a sign-in link</button></form>
        <p class="hint" id="si-msg"></p>
        <p class="hint">With an account you get cloud storage for your projects (3 projects free), your plan on every computer, and a shared workspace for your lab on the Lab plan.</p>
      </section>
      <section class="card acct"><h2>Plans</h2>${planCards(false)}</section>
      ${licenceBox(Pro.state())}`;
    $('#si-form').onsubmit = e => {
      e.preventDefault();
      const b = e.target.querySelector('button'); b.disabled = true;
      try { if (buy) sessionStorage.setItem('bf.buy', buy); } catch (x) { /* storage unavailable */ }
      C.signIn($('#si-email').value).then(() => { $('#si-msg').innerHTML = '<b>Check your inbox.</b> The link signs you in on this browser and expires in one hour.'; })
        .catch(err => { $('#si-msg').textContent = err.message; }).then(() => { b.disabled = false; });
    };
    document.querySelectorAll('[data-buy]').forEach(bn => bn.onclick = () => { $('#si-email').focus(); try { sessionStorage.setItem('bf.buy', bn.dataset.buy); } catch (x) { /* ignore */ } });
    wireLicence();
  }

  /* ---------- signed in ---------- */
  async function renderAccount() {
    root.innerHTML = '<p class="hint">Loading your account…</p>';
    let ent = null, subs = [], team = null, projects = [];
    try { [ent, subs, team, projects] = await Promise.all([C.entitlement(), C.subscriptions(), C.team(), C.list()]); }
    catch (e) { root.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const plan = ent ? ent.plan : 'free';
    const liveSub = subs.find(s => ['on_trial', 'active', 'past_due', 'paused', 'unpaid'].includes(s.status) || (s.status === 'cancelled' && s.ends_at && Date.parse(s.ends_at) > Date.now()));
    const subLine = s => {
      if (!s) return '';
      if (s.status === 'cancelled') return `Cancelled: access until ${day(s.ends_at)}.`;
      if (s.status === 'past_due') return '<span class="flag">Payment failed</span> We are retrying; please update your card.';
      if (s.status === 'paused') return 'Paused.';
      return 'Renews on ' + day(s.renews_at) + '.';
    };
    const pct = ent ? Math.min(100, 100 * ent.used_bytes / ent.quota_bytes) : 0;
    const pending = sessionStorage.getItem && (() => { try { return sessionStorage.getItem('bf.buy'); } catch (x) { return null; } })();
    root.innerHTML = `
      <section class="card acct"><div class="who"><div><p class="hint" style="margin:0">Signed in as</p><b>${esc(C.user.email)}</b></div><button class="btn small ghost" id="so">Sign out</button></div></section>
      <section class="card acct"><h2>Plan</h2>
        <div class="status ${ent && ent.pro ? 'on' : ''}"><b>${PLAN[plan] || plan}</b>${liveSub ? ' · ' + subLine(liveSub) : plan === 'lab-member' ? ' · provided by your lab' : ''}</div>
        <div id="activating"></div>
        ${liveSub ? `<div class="row">${liveSub.portal_url ? `<a class="btn" href="${esc(liveSub.portal_url)}" target="_blank" rel="noopener">Manage billing, invoices and cancellation</a>` : ''}${liveSub.update_payment_url ? `<a class="btn ghost" href="${esc(liveSub.update_payment_url)}" target="_blank" rel="noopener">Update card</a>` : ''}</div>` : plan === 'free' ? planCards(true) : ''}
      </section>
      <section class="card acct"><h2>Cloud storage</h2>
        <div class="meter"><i style="width:${pct.toFixed(1)}%"></i></div>
        <p class="hint">${ent ? `${mb(ent.used_bytes)} of ${mb(ent.quota_bytes)} used · ${ent.projects} of ${ent.quota_projects >= 2000 ? 'unlimited' : ent.quota_projects} projects` : ''}. Projects are private to you unless you share them with your lab. Open and save them from Studio's <b>Cloud</b> button.</p>
        <div class="plist">${projects.slice(0, 12).map(x => `<div><span>${esc(x.name)}</span><small>${day(x.updated_at)} · ${mb(x.bytes)}${x.team_id ? ' · shared with lab' : ''}</small></div>`).join('') || '<p class="hint">No cloud projects yet.</p>'}</div>
        <div class="row"><a class="btn" href="../studio/">Open Studio</a><button class="btn ghost" id="exp">Download all my data</button></div>
      </section>
      ${team ? teamBox(team) : ''}
      ${licenceBox(Pro.state())}
      <details class="card acct danger"><summary><h2>Delete account</h2></summary>
        <p>This permanently deletes your account and all your cloud projects. Projects saved in this browser are not affected. ${liveSub ? '<b>Cancel your subscription first</b> using Manage billing above.' : ''}</p>
        <div class="row"><input type="text" id="del-confirm" placeholder="Type DELETE to confirm" autocomplete="off"><button class="btn" id="del-go">Delete my account</button></div><p class="hint" id="del-msg"></p>
      </details>`;
    $('#so').onclick = () => C.signOut().then(render);
    $('#exp').onclick = () => C.exportAll().catch(e => U.toast(e.message));
    $('#del-go').onclick = () => {
      if ($('#del-confirm').value !== 'DELETE') { $('#del-msg').textContent = 'Type DELETE in capitals to confirm.'; return; }
      $('#del-msg').textContent = 'Deleting…';
      C.deleteAccount().then(() => { U.toast('Your account has been deleted.'); render(); })
        .catch(e => { $('#del-msg').innerHTML = esc(e.message) + (e.portal ? ` <a href="${esc(e.portal)}" target="_blank" rel="noopener">Manage billing</a>` : ''); });
    };
    document.querySelectorAll('[data-buy]').forEach(bn => bn.onclick = () => startCheckout(bn.dataset.buy));
    wireLicence();
    if (team) wireTeam(team);
    if (pending && plan === 'free') { try { sessionStorage.removeItem('bf.buy'); } catch (x) { /* ignore */ } startCheckout(pending); }
    if (qs.get('paid') && !(ent && ent.pro)) waitForActivation();
  }
  function startCheckout(variant) {
    const url = C.checkoutUrl(variant);
    if (!url) { U.toast('Checkout is not available yet.'); return; }
    location.href = url;
  }
  function waitForActivation() {
    const box = $('#activating');
    box.innerHTML = '<div class="status">Thank you! Activating your plan… this usually takes a few seconds.</div>';
    let n = 0;
    const tick = async () => {
      n++;
      const e = await C.entitlement().catch(() => null);
      if (e && e.pro) { U.toast('Your plan is active. Thank you!', 'ok'); history.replaceState(null, '', location.pathname); renderAccount(); return; }
      if (n < 30) setTimeout(tick, 3000); else box.innerHTML = '<div class="status">Payment received but not yet confirmed. Refresh in a minute; if it still shows Free, write to us from the email on your receipt.</div>';
    };
    setTimeout(tick, 2000);
  }

  function teamBox(t) {
    const members = t.roster.filter(r => !r.pending), invites = t.roster.filter(r => r.pending);
    return `<section class="card acct"><h2>${t.isOwner ? 'Your lab' : 'Your lab: ' + esc(t.name)}</h2>
      ${t.isOwner ? `<div class="row"><input type="text" id="tm-name" value="${esc(t.name)}" maxlength="120" aria-label="Lab name"><button class="btn small" id="tm-rename">Rename</button></div>
        <p class="hint">${members.length + invites.length} of ${t.seats} seats used. Members get every Pro feature and can open projects shared with the lab.</p>
        <form class="row" id="tm-inv"><input type="email" id="tm-email" placeholder="colleague@university.edu" required><button class="btn primary" type="submit">Invite</button></form><p class="hint" id="tm-msg"></p>` : '<p class="hint">Your Pro access is provided by this lab. Projects shared with the lab appear in Studio’s Cloud list.</p>'}
      <div class="plist">${members.map(m => `<div><span>${esc(m.email)}${m.role === 'owner' ? ' <small>(owner)</small>' : ''}</span>${t.isOwner && m.role !== 'owner' ? `<button class="linkbtn" data-rm="${esc(m.user_id)}">Remove</button>` : ''}</div>`).join('')}
        ${invites.map(m => `<div><span>${esc(m.email)} <small>invited, joins when they sign in</small></span>${t.isOwner ? `<button class="linkbtn" data-ci="${esc(m.email)}">Cancel</button>` : ''}</div>`).join('')}</div>
      ${t.isOwner ? '' : '<button class="btn small ghost" id="tm-leave">Leave this lab</button>'}
    </section>`;
  }
  function wireTeam(t) {
    const act = (pr, msg) => pr.then(r => { U.toast(msg || (r === 'invited' ? 'Invitation saved. They join when they sign in with that email.' : 'Done.'), 'ok'); renderAccount(); }).catch(e => { const m = $('#tm-msg'); if (m) m.textContent = e.message; else U.toast(e.message); });
    const inv = $('#tm-inv'); if (inv) inv.onsubmit = e => { e.preventDefault(); act(C.invite($('#tm-email').value)); };
    const rn = $('#tm-rename'); if (rn) rn.onclick = () => act(C.renameTeam($('#tm-name').value), 'Lab renamed.');
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => act(C.removeMember(b.dataset.rm), 'Member removed.'));
    document.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => act(C.cancelInvite(b.dataset.ci), 'Invitation cancelled.'));
    const lv = $('#tm-leave'); if (lv) lv.onclick = () => act(C.leaveTeam(), 'You left the lab.');
  }

  function render() {
    if (!C.enabled) return renderLocal();
    C.ready.then(() => (C.user ? renderAccount() : renderSignIn()));
  }
  document.addEventListener('bf:auth', () => { if (C.enabled) (C.user ? renderAccount() : renderSignIn()); });
  render();
})();
