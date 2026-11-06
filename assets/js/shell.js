/* Lattent app shell: header/footer, data parsing, exports, reports and the Pro gate. */
(function () {
  'use strict';
  const BF = window.BF;
  const CFG = window.BF_CONFIG;
  const U = {};
  BF.ui = U;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  U.$ = $; U.$$ = $$;
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  U.store = store;

  /* ---------- formatting ---------- */
  U.fmt = (v, sig) => BF.plot.num(v, sig || 3);
  U.pfmt = p => (!isFinite(p) ? '–' : p < 0.0001 ? '< 0.0001' : p.toFixed(4));
  U.stars = p => (!isFinite(p) ? '' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns');

  /* ---------- pasted tables ---------- */
  U.parseGrid = function (text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim() !== '' && !/^\s*#/.test(l));
    if (!lines.length) return { header: null, rows: [] };
    const sample = lines.slice(0, 5).join('\n');
    let delim, decimalComma = false;
    if (sample.includes('\t')) { delim = '\t'; decimalComma = /\d,\d/.test(sample) && !/\d\.\d/.test(sample); }
    else if (sample.includes(';')) { delim = ';'; decimalComma = /\d,\d/.test(sample); }
    else if (sample.includes(',')) delim = ',';
    else delim = /\s+/;
    const cells = lines.map(l => (delim instanceof RegExp ? l.trim().split(delim) : l.split(delim)).map(c => c.trim().replace(/^"|"$/g, '')));
    const num = c => {
      if (c === '') return NaN;
      const s = decimalComma ? c.replace(/\./g, '').replace(',', '.') : c;
      return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? parseFloat(s) : NaN;
    };
    const first = cells[0];
    const isHeader = first.some((c, i) => c !== '' && !isFinite(num(c)) && (i > 0 || cells.length > 1 && isFinite(num(cells[1][0]))));
    const header = isHeader ? first : null;
    const body = isHeader ? cells.slice(1) : cells;
    return { header, rows: body.map(r => r.map(num)), raw: body };
  };

  /* ---------- toast ---------- */
  U.toast = function (msg, kind) {
    let t = $('#bf-toast');
    if (!t) { t = document.createElement('div'); t.id = 'bf-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 2600);
  };

  /* ---------- downloads ---------- */
  U.download = function (name, mime, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  U.svgToCanvas = function (svg, W, H, scale, watermark) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const x = c.getContext('2d');
        if (!x) return reject(new Error('The figure is too large for this browser; choose a lower resolution.'));
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        if (watermark) {
          x.font = `${11 * scale}px Arial`; x.fillStyle = 'rgba(0,0,0,0.38)'; x.textAlign = 'right';
          x.fillText(watermark, c.width - 10 * scale, c.height - 8 * scale);
        }
        resolve(c);
      };
      img.onerror = () => reject(new Error('Could not render the figure'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
  U.svgToPng = (svg, W, H, scale, watermark) => U.svgToCanvas(svg, W, H, scale, watermark)
    .then(c => new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed; the figure may be too large for this browser.'))), 'image/png')));
  U.csv = rows => rows.map(r => r.map(v => {
    const s = v == null ? '' : typeof v === 'number' ? (isFinite(v) ? String(Number(v.toPrecision(8))) : '') : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');

  /* ---------- Pro: licence keys (Lemon Squeezy) and a local trial ---------- */
  const LS = 'https://api.lemonsqueezy.com/v1/licenses/';
  const Pro = {};
  BF.pro = Pro;
  Pro.state = () => store.get('bf.pro', null);
  Pro.trial = () => store.get('bf.trial', null);
  Pro.trialLeft = function () {
    const t = Pro.trial();
    if (!t) return null;
    return Math.max(0, CFG.trialDays - (Date.now() - t.start) / 864e5);
  };
  /* Plan from the signed-in account, cached so Pro keeps working offline for a while. */
  Pro.account = function () {
    const e = store.get('bf.ent', null);
    if (!e || !e.pro || Date.now() - (e.at || 0) > 14 * 864e5) return null;
    return e;
  };
  Pro.active = function () {
    if (Pro.account()) return true;
    const s = Pro.state();
    if (s && s.status === 'active' && (!s.expires || Date.parse(s.expires) > Date.now())) return true;
    const left = Pro.trialLeft();
    return left != null && left > 0;
  };
  Pro.kind = function () {
    const a = Pro.account();
    if (a) return a.plan === 'lab' ? 'lab' : a.plan === 'lab-member' ? 'lab-member' : 'account';
    const s = Pro.state();
    if (s && s.status === 'active') return 'licence';
    const left = Pro.trialLeft();
    if (left != null && left > 0) return 'trial';
    return left != null ? 'trial-ended' : 'free';
  };
  Pro.startTrial = function () {
    if (Pro.trial()) { U.toast(Pro.trialLeft() > 0 ? 'Your trial is already running.' : 'The free trial has been used on this browser.'); return false; }
    store.set('bf.trial', { start: Date.now() });
    U.toast('Pro trial started: ' + CFG.trialDays + ' days, no card needed.', 'ok');
    document.dispatchEvent(new CustomEvent('bf:pro'));
    return true;
  };
  async function lsPost(endpoint, params) {
    const body = new URLSearchParams(params);
    const r = await fetch(LS + endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body });
    return r.json();
  }
  Pro.activate = async function (key) {
    key = key.trim();
    if (!key) throw new Error('Paste your licence key.');
    const res = await lsPost('activate', { license_key: key, instance_name: 'Lattent web · ' + (navigator.platform || 'browser') });
    if (!res.activated) {
      const e = String(res.error || '');
      if (/not found/i.test(e)) throw new Error('That licence key was not found. Check it against your purchase email.');
      if (/limit/i.test(e)) throw new Error('This key is already active on the maximum number of browsers. Deactivate it on one of them first.');
      if (/expired|disabled/i.test(e)) throw new Error('This licence has expired or been disabled.');
      throw new Error(e || 'This licence key could not be activated.');
    }
    if (CFG.storeId && res.meta && Number(res.meta.store_id) !== Number(CFG.storeId)) throw new Error('This key was not issued by Lattent.');
    store.set('bf.pro', { key, instance: res.instance && res.instance.id, status: res.license_key.status === 'expired' ? 'expired' : 'active', expires: res.license_key.expires_at, checked: Date.now(), plan: res.meta && res.meta.variant_name, email: res.meta && res.meta.customer_email });
    document.dispatchEvent(new CustomEvent('bf:pro'));
    return Pro.state();
  };
  Pro.deactivate = async function () {
    const s = Pro.state();
    if (s && s.key && s.instance) { try { await lsPost('deactivate', { license_key: s.key, instance_id: s.instance }); } catch (e) { /* offline: forget locally */ } }
    store.del('bf.pro');
    document.dispatchEvent(new CustomEvent('bf:pro'));
  };
  /* Access codes, issued by the founders with scripts/access-code.py and bound to one email
     address. Only the SHA-256 of "email|code" is published in config.js (the access list), so a
     code cannot be read from the site; removing the entry revokes it at the next page load. */
  const normCode = (email, code) => email.trim().toLowerCase() + '|' + code.trim().toUpperCase().replace(/\s+/g, '');
  Pro.hash = async function (email, code) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normCode(email, code)));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  };
  Pro.isCode = v => /^\s*LAT-/i.test(v || '');
  const codeEntry = h => (CFG.access || []).find(x => x && x.h === h);
  const codeLive = e => !!e && !(e.until && Date.parse(e.until + 'T23:59:59Z') < Date.now());
  Pro.redeem = async function (email, code) {
    email = (email || '').trim(); code = (code || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter the email address the code was issued to.');
    if (!code) throw new Error('Enter your access code.');
    if (!window.isSecureContext || !crypto.subtle) throw new Error('Access codes need a secure (https) page.');
    const h = await Pro.hash(email, code), e = codeEntry(h);
    if (!e) throw new Error('That code does not match this email address. Check both against the message you received.');
    if (!codeLive(e)) throw new Error('This access code expired on ' + e.until + '.');
    store.set('bf.pro', { code: h, status: 'active', expires: e.until ? e.until + 'T23:59:59Z' : null, checked: Date.now(), plan: (e.plan === 'lab' ? 'Lab' : 'Pro') + ' · access code', email, note: e.note || '' });
    document.dispatchEvent(new CustomEvent('bf:pro'));
    return Pro.state();
  };
  Pro.revalidate = async function () {
    const s = Pro.state();
    if (s && s.code) {   // an access code: still listed, and not past its date?
      const e = codeEntry(s.code);
      if (!codeLive(e)) { store.del('bf.pro'); document.dispatchEvent(new CustomEvent('bf:pro')); return; }
      const until = e.until ? e.until + 'T23:59:59Z' : null;
      if (until !== (s.expires || null)) { s.expires = until; store.set('bf.pro', s); }
      return;
    }
    if (!s || !s.key || Date.now() - (s.checked || 0) < 3 * 864e5) return;
    try {
      const res = await lsPost('validate', { license_key: s.key, instance_id: s.instance || '' });
      if (res.valid === false && res.license_key) { s.status = res.license_key.status || 'inactive'; }
      else if (res.valid) { s.status = 'active'; s.expires = res.license_key.expires_at; }
      else if (res.error && /not found/i.test(res.error)) s.status = 'inactive';
      s.checked = Date.now();
      store.set('bf.pro', s);
      document.dispatchEvent(new CustomEvent('bf:pro'));
    } catch (e) { /* offline: keep the cached state */ }
  };
  Pro.require = function (what, fn) {
    if (Pro.active()) return fn();
    U.upgrade(what);
  };

  /* ---------- buying: Lemon Squeezy (worldwide, USD), Razorpay (India, INR), or an enquiry ---------- */
  const PLAN_NAME = { monthly: 'Pro monthly', yearly: 'Pro yearly', lab: 'Lab plan' };
  U.payOptions = function (plan) {
    const o = [], P = CFG.prices;
    if (CFG.checkout && CFG.checkout[plan]) o.push({ id: 'ls', name: 'Card, PayPal or Apple Pay', sub: 'Worldwide, in US dollars · secure checkout by Lemon Squeezy', price: '$' + P[plan] });
    if (CFG.razorpay && CFG.razorpay[plan]) o.push({ id: 'rzp', name: 'UPI, cards or net banking', sub: 'India, in rupees · secure checkout by Razorpay', price: '₹' + P.inr[plan].toLocaleString('en-IN') });
    return o;
  };
  U.paymentsLive = () => ['monthly', 'yearly', 'lab'].some(p => U.payOptions(p).length);
  function goPay(plan, id) {
    if (id === 'ls') {
      /* with accounts on, sign in first so the plan is attached to the account */
      if (CFG.supabase && CFG.supabase.url) location.href = U.root + 'account/?buy=' + plan;
      else location.href = CFG.checkout[plan];
    } else location.href = CFG.razorpay[plan];
  }
  U.buy = function (plan) {
    const opts = U.payOptions(plan), name = PLAN_NAME[plan] || 'Pro';
    if (opts.length === 1) return goPay(plan, opts[0].id);
    if (!opts.length) {
      const k = Pro.kind();
      U.modal(`<p class="m-kicker">${U.esc(name)}</p><h2>Online checkout opens shortly</h2>
        <p>We are finishing the payment set-up. Tell us what you need and we will send you a secure payment link or an invoice for your institution, usually within a day.</p>
        <div class="m-actions"><a class="btn primary" href="${U.root}contact/?topic=${plan === 'lab' ? 'lab' : 'sales'}&plan=${plan}">Request a payment link or invoice</a>
        ${k === 'free' ? '<button class="btn" data-trial>Try Pro free for 7 days</button>' : ''}</div>`);
      const t = $('[data-trial]'); if (t) t.onclick = () => { if (Pro.startTrial()) U.closeModal(); };
      return;
    }
    const m = U.modal(`<p class="m-kicker">${U.esc(name)}</p><h2>How would you like to pay?</h2>
      <div class="pay-opts">${opts.map(o => `<button class="pay-opt" data-pay="${o.id}"><span><b>${o.name}</b><small>${o.sub}</small></span><i>${o.price}</i></button>`).join('')}</div>
      <p class="m-note">Card details go only to the payment provider, never to Lattent. Use the same email as your Lattent account so your plan activates automatically.</p>`);
    m.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => goPay(plan, b.dataset.pay));
  };
  U.upgrade = function (what) {
    const k = Pro.kind();
    const p = CFG.prices;
    const plan = (id, label, price, per, best) => `<button class="plan-btn${best ? ' best' : ''}" data-plan="${id}"><b>${label}</b><span>$${price}<small>/${per}</small></span></button>`;
    const m = U.modal(`
      <p class="m-kicker">Lattent Pro${CFG.earlyAccess ? ' · early-access price' : ''}</p>
      <h2>${what ? U.esc(what) + ' is a Pro feature' : 'Publication-ready output, in one click'}</h2>
      <ul class="m-list">
        <li>Figures at each journal's exact size (ACS, RSC, Elsevier, Nature, Wiley) as TIFF, PNG or SVG, without the watermark</li>
        <li>Batch runs: one analysis on any number of files, collected in one summary table</li>
        <li>Auto-written methods, results and figure legend, ready to paste into a paper</li>
        <li>Results as CSV, reports and project files</li>
        <li>Facet, the AI lab partner, with your own Claude or GPT key</li>
      </ul>
      <div class="m-plans">${plan('yearly', 'Yearly', p.yearly, 'year', true)}${plan('monthly', 'Monthly', p.monthly, 'month')}${plan('lab', 'Lab, 10 people', p.lab, 'year')}</div>
      <div class="m-actions">
        ${k === 'free' ? '<button class="btn" data-trial>Try free for 7 days</button>' : k === 'trial-ended' ? '<span class="m-note">Your trial has ended.</span>' : ''}
        <a class="btn ghost" href="${U.root}pricing/">Compare plans</a>
      </div>`);
    m.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => U.buy(b.dataset.plan));
    const t = $('[data-trial]');
    if (t) t.onclick = () => { if (Pro.startTrial()) U.closeModal(); };
  };

  U.modal = function (html) {
    U.closeModal();
    const m = document.createElement('div');
    m.className = 'modal'; m.id = 'bf-modal';
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close">×</button>${html}</div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('.modal-x')) U.closeModal(); });
    document.body.appendChild(m);
    document.addEventListener('keydown', U._esc = e => { if (e.key === 'Escape') U.closeModal(); });
    setTimeout(() => { const f = m.querySelector('button.btn, a.plan-btn, input, textarea'); if (f) f.focus(); }, 30);
    return m;
  };
  U.closeModal = function () {
    const m = $('#bf-modal'); if (m) m.remove();
    if (U._esc) document.removeEventListener('keydown', U._esc);
  };

  /* ---------- "Cite Lattent": software citation plus the data sources behind Discover ---------- */
  U.CITE = {
    version: '2026.10',
    bibtex: () => `@software{panigrahy_lattent_2026,
  author  = {Panigrahy, Sibasankar},
  title   = {Lattent: browser-based data analysis for materials and chemistry},
  year    = {2026},
  version = {2026.10},
  url     = {https://siba-p.github.io/lattent/},
  urldate = {${(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date())}}
}`,
    apa: () => 'Panigrahy, S. (2026). Lattent: Browser-based data analysis for materials and chemistry (Version 2026.10) [Computer software]. https://siba-p.github.io/lattent/',
    sources: [
      ['Alexandria database (structure search, phase identification, hull estimates)', 'J. Schmidt, H.-C. Wang, T. F. T. Cerqueira, S. Botti and M. A. L. Marques, Adv. Mater. 35, 2210788 (2023).'],
      ['OPTIMADE API', 'C. W. Andersen et al., Sci. Data 8, 217 (2021).'],
      ['Training data for the generator and property models', 'A. Dunn, Q. Wang, A. Ganose, D. Dopp and A. Jain, npj Comput. Mater. 6, 138 (2020) (Matbench); A. Jain et al., APL Mater. 1, 011002 (2013) (Materials Project).']
    ]
  };
  U.cite = function () {
    const C = U.CITE;
    const m = U.modal(`<h2>Cite Lattent</h2><p class="m-sub">If Lattent helped with work you publish, please cite it. Citations keep the free tier free.</p>
      <div class="cite-blk"><div class="cite-h"><b>BibTeX</b><button type="button" class="btn small" data-copy="bib">Copy</button></div><pre id="cite-bib" tabindex="0">${U.esc(C.bibtex())}</pre></div>
      <div class="cite-blk"><div class="cite-h"><b>APA</b><button type="button" class="btn small" data-copy="apa">Copy</button></div><p id="cite-apa" class="cite-apa">${U.esc(C.apa())}</p></div>
      <details class="cite-more"><summary>Used Discover? Also cite the data</summary><ul>${C.sources.map(([w, r]) => `<li><b>${U.esc(w)}:</b> ${U.esc(r)}</li>`).join('')}</ul></details>
      <p class="hint">A suggested methods sentence: “Curve fitting and statistics were performed in Lattent (version ${C.version}), which runs entirely in the browser.” The repository also carries a <a href="https://github.com/siba-p/lattent/blob/main/CITATION.cff" target="_blank" rel="noopener">CITATION.cff</a> file.</p>`);
    m.querySelector('.modal-box').classList.add('cite-box');
    m.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      const el = m.querySelector(b.dataset.copy === 'bib' ? '#cite-bib' : '#cite-apa');
      try { await navigator.clipboard.writeText(el.textContent); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }
      catch (e) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); U.toast('Selected. Press Ctrl+C or ⌘C to copy.'); }
    });
  };
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('[data-cite]'); if (c) { e.preventDefault(); U.cite(); } });

  /* ---------- figure export ---------- */
  /* build(theme, W, H) → {svg}; name: file stem */
  U.exportFigure = function (build, name, fmt, opts) {
    if (fmt === 'journal') return U.journalFigure(build, name);
    const [W, H] = (opts && BF.plot.ASPECTS[opts.aspect]) || [720, 500];
    const fig = build(BF.plot.print, W, H);
    if (fmt === 'png-free') {
      return U.svgToPng(fig.svg, W, H, 2, 'Made with Lattent (free)').then(b => U.download(name + '.png', 'image/png', b));
    }
    Pro.require('High-resolution and vector export', () => {
      if (fmt === 'svg') U.download(name + '.svg', 'image/svg+xml', fig.svg);
      else U.svgToPng(fig.svg, W, H, 5, null).then(b => U.download(name + "-600dpi.png", "image/png", b));
    });
  };

  /* Customise a figure: title, axis labels and ranges, palette or per-series colours, marker,
     line and text sizes, legend, grid and export shape, with a live preview. `build` is the raw
     chart builder; the options are applied by setting BF.plot.fig around each draw, so Studio
     stores them with the analysis and they reach every export and the report. */
  U.figureDialog = function (build, fig, onApply) {
    const P = BF.plot; let f = Object.assign({}, fig || {});
    const esc = U.esc, opt = (list, v) => list.map(([val, lab]) => `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`).join('');
    const m = U.modal(`<p class="m-kicker">Figure</p><h2>Customise the figure</h2>
      <div class="fig-wrap"><div class="fig-prev" id="fg-prev"></div>
      <form class="fig-form" id="fg-form" autocomplete="off">
        <label>Title <input type="text" data-k="title" value="${esc(f.title || '')}" placeholder="none" maxlength="120"></label>
        <div class="fig-row"><label>X-axis label <input type="text" data-k="xl" value="${esc(f.xl || '')}" placeholder="from the data" maxlength="120"></label><label>Y-axis label <input type="text" data-k="yl" value="${esc(f.yl || '')}" placeholder="from the data" maxlength="120"></label></div>
        <div class="fig-row"><label>X from <input type="number" step="any" data-k="x0" value="${f.x0 ?? ''}" placeholder="auto"></label><label>X to <input type="number" step="any" data-k="x1" value="${f.x1 ?? ''}" placeholder="auto"></label><label>Y from <input type="number" step="any" data-k="y0" value="${f.y0 ?? ''}" placeholder="auto"></label><label>Y to <input type="number" step="any" data-k="y1" value="${f.y1 ?? ''}" placeholder="auto"></label></div>
        <div class="fig-row"><label>Colours <select data-k="pal">${opt(P.PALETTE_NAMES, f.pal || 'lattent')}</select></label><label>Text size <select data-k="fs">${opt([['', 'Normal'], ['11', 'Small'], ['15', 'Large'], ['17', 'Larger']], f.fs || '')}</select></label></div>
        <div id="fg-colors" class="fig-colors"></div>
        <div class="fig-row"><label>Markers <select data-k="ms">${opt([['', 'Normal'], ['3.2', 'Small'], ['6', 'Large'], ['7.5', 'Very large']], f.ms || '')}</select></label><label>Lines <select data-k="lw">${opt([['', 'Normal'], ['1.2', 'Thin'], ['3', 'Thick'], ['4', 'Very thick']], f.lw || '')}</select></label><label>Export shape <select data-k="aspect">${opt([['', 'Default'], ['4:3', '4 : 3'], ['3:2', '3 : 2'], ['16:9', '16 : 9'], ['1:1', 'Square']], f.aspect || '')}</select></label></div>
        <div class="fig-row"><label class="check"><input type="checkbox" data-k="legend"${f.legend === false ? '' : ' checked'}> Legend</label><label class="check"><input type="checkbox" data-k="grid"${f.grid === false ? '' : ' checked'}> Grid lines</label></div>
      </form></div>
      <div class="m-actions"><button class="btn primary" id="fg-apply" type="button">Apply</button><button class="btn ghost" id="fg-reset" type="button">Reset to defaults</button></div>`);
    m.querySelector('.modal-box').classList.add('xwide');
    const $m = s => m.querySelector(s);
    const read = () => {
      const g = {}; m.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (el.type === 'checkbox') { if (!el.checked) g[k] = false; } else if (el.value !== '') g[k] = el.type === 'number' ? +el.value : el.value; });
      if (g.pal === 'lattent') delete g.pal;
      const cols = [...m.querySelectorAll('[data-c]')].map(el => (el.dataset.on === '1' ? el.value : '')); if (cols.some(Boolean)) g.colors = cols;
      f = g;
    };
    const draw = () => {
      const [W, H] = P.ASPECTS[f.aspect] || [720, 500], w = 560, h = Math.round(w * H / W);
      P.fig = f; let out; try { out = build(P.screen(), w, h); } catch (e) { out = { svg: '' }; } P.fig = null;
      $m('#fg-prev').innerHTML = out.svg || '';
    };
    const colours = () => {
      const ser = (P.last && P.last.series) || [];
      $m('#fg-colors').innerHTML = ser.length ? '<span class="fig-colors-h">Series colours</span>' + ser.map((s, i) => `<label class="fig-col"><input type="color" data-c="${i}" value="${(f.colors && f.colors[i]) || s.color}" data-on="${f.colors && f.colors[i] ? 1 : 0}"> ${esc(s.name || 'Series ' + (i + 1))}</label>`).join('') : '';
      $m('#fg-colors').querySelectorAll('[data-c]').forEach(el => { el.oninput = () => { el.dataset.on = '1'; read(); draw(); }; });
    };
    draw(); colours();
    m.querySelector('#fg-form').addEventListener('input', e => { if (e.target.dataset.k) { const pal = e.target.dataset.k === 'pal'; if (pal) m.querySelectorAll('[data-c]').forEach(el => { el.dataset.on = '0'; }); read(); draw(); if (pal) colours(); } });
    $m('#fg-apply').onclick = () => { read(); U.closeModal(); onApply(Object.keys(f).length ? f : null); };
    $m('#fg-reset').onclick = () => { U.closeModal(); onApply(null); };
  };

  /* Journal-ready figure: the publisher's column width, text in points, a TIFF, PNG or SVG that
     opens at its printed size. The preview shows the figure at that size on screen. */
  const MAX_PX = 60e6;
  U.journalFigure = function (build, name) {
    const P = BF.plot, J = P.JOURNALS;
    const st = Object.assign({ j: 'acs', w: 0, h: '', pt: '', fmt: '', dpi: '' }, store.get('bf.jfig', {}));
    const opt = (v, label, on) => `<option value="${U.esc(v)}"${String(v) === String(on) ? ' selected' : ''}>${U.esc(label)}</option>`;
    const m = U.modal(`<p class="m-kicker">Figure for a journal</p><h2>Export at the printed size</h2>
      <div class="jf-grid"><div class="jf-form">
        <div class="field"><label class="lbl" for="jf-j">Journal</label><select id="jf-j">${J.map(j => opt(j.id, j.name, st.j)).join('')}</select></div>
        <div class="field"><label class="lbl" for="jf-w">Width</label><select id="jf-w"></select><input type="number" id="jf-wmm" min="30" max="400" step="0.5" aria-label="Width in mm" hidden></div>
        <div class="jf-two"><div class="field"><label class="lbl" for="jf-h">Height (mm)</label><input type="number" id="jf-h" min="20" max="300" step="0.5"></div>
        <div class="field"><label class="lbl" for="jf-pt">Text size (pt)</label><input type="number" id="jf-pt" min="5" max="14" step="0.5"></div></div>
        <div class="jf-two"><div class="field"><label class="lbl" for="jf-fmt">Format</label><select id="jf-fmt">${opt('tiff', 'TIFF')}${opt('png', 'PNG')}${opt('svg', 'SVG (vector)')}</select></div>
        <div class="field" id="jf-dpi-f"><label class="lbl" for="jf-dpi">Resolution</label><select id="jf-dpi">${[300, 600, 1000, 1200].map(d => opt(d, d + ' dpi')).join('')}</select></div></div>
      </div><div class="jf-prev"><div class="jf-paper" id="jf-paper"></div><p class="hint" id="jf-info"></p></div></div>
      <div class="m-actions"><button class="btn primary" id="jf-go">Download <span class="lock">PRO</span></button></div>
      <p class="hint">Widths and text sizes follow each publisher's artwork guidelines. Check your journal's instructions too: some ask for EPS or PDF, which you can make from the SVG in Illustrator or Inkscape.</p>`);
    m.querySelector('.modal-box').classList.add('jf-box');
    const $m = s => m.querySelector(s);
    const jour = () => J.find(j => j.id === $m('#jf-j').value) || J[0];
    const fillWidths = keep => {
      const j = jour(), on = keep ? st.w : 0;
      $m('#jf-w').innerHTML = j.id === 'custom' ? opt('c', 'Width in mm', 'c') : j.widths.map(([l, mm], i) => opt(i, `${l}, ${mm} mm`, on)).join('') + opt('c', 'Custom width…', on);
      if (!keep) { $m('#jf-pt').value = j.pt; $m('#jf-fmt').value = j.fmt; $m('#jf-dpi').value = j.dpi; $m('#jf-h').value = ''; }
    };
    const wmm = () => { const v = $m('#jf-w').value; return v === 'c' ? Math.min(400, Math.max(30, +$m('#jf-wmm').value || 85)) : jour().widths[+v][1]; };
    let fig = null;
    const draw = () => {
      const j = jour(), w = wmm(), pt = Math.min(14, Math.max(5, +$m('#jf-pt').value || j.pt));
      $m('#jf-wmm').hidden = $m('#jf-w').value !== 'c';
      if (!$m('#jf-wmm').value) $m('#jf-wmm').value = w;
      let h = +$m('#jf-h').value;
      if (!h) { h = Math.round(w * (w > 120 ? 0.5 : 0.72)); if (j.maxH) h = Math.min(h, j.maxH); $m('#jf-h').value = h; }
      const u = P.journalUnits(w, h, pt), out = build(P.print, u.W, u.H);
      fig = Object.assign(P.svgPhysical(out.svg, u.s), { pt, dpi: +$m('#jf-dpi').value, fmt: $m('#jf-fmt').value });
      const px = [Math.round(fig.wmm / 25.4 * fig.dpi), Math.round(fig.hmm / 25.4 * fig.dpi)];
      fig.px = px;
      $m('#jf-paper').innerHTML = fig.svg.replace(/width="([\d.]+)mm" height="([\d.]+)mm"/, (s, a, b) => `width="${(+a * 3.7795).toFixed(0)}" height="${(+b * 3.7795).toFixed(0)}"`);
      const tooBig = fig.fmt !== 'svg' && px[0] * px[1] > MAX_PX;
      $m('#jf-dpi-f').hidden = fig.fmt === 'svg';
      $m('#jf-info').innerHTML = `${fig.wmm.toFixed(1)} × ${fig.hmm.toFixed(1)} mm · text ${(pt * 12 / 13).toFixed(1)}–${pt} pt` + (fig.fmt === 'svg' ? ' · vector' : ` · ${px[0]} × ${px[1]} px at ${fig.dpi} dpi`) + (j.maxH && fig.hmm > j.maxH ? `<br><b>Taller than ${j.maxH} mm, the most this journal allows.</b>` : '') + (tooBig ? '<br><b>Too many pixels for a browser to draw: choose a lower resolution or a smaller size.</b>' : '') + '<br>Shown here at its printed size on a typical screen.';
      $m('#jf-go').disabled = tooBig;
      store.set('bf.jfig', { j: j.id, w: $m('#jf-w').value === 'c' ? 'c' : +$m('#jf-w').value, h: $m('#jf-h').value, pt, fmt: fig.fmt, dpi: fig.dpi, wmm: $m('#jf-wmm').value });
    };
    fillWidths(true);
    if (st.pt) { $m('#jf-pt').value = st.pt; $m('#jf-fmt').value = st.fmt; $m('#jf-dpi').value = st.dpi; $m('#jf-h').value = st.h; $m('#jf-wmm').value = st.wmm || ''; } else fillWidths(false);
    $m('#jf-j').onchange = () => { fillWidths(false); draw(); };
    $m('#jf-w').onchange = () => { $m('#jf-h').value = ''; draw(); };
    ['#jf-wmm', '#jf-h', '#jf-pt'].forEach(s => $m(s).oninput = draw);
    ['#jf-fmt', '#jf-dpi'].forEach(s => $m(s).onchange = draw);
    draw();
    $m('#jf-go').onclick = () => Pro.require('Journal-ready figures', async () => {
      const f = fig, stem = `${name}-${jour().id}-${+f.wmm.toFixed(1)}mm`, b = $m('#jf-go');
      if (f.fmt === 'svg') return U.download(stem + '.svg', 'image/svg+xml', f.svg);
      b.disabled = true; b.textContent = 'Rendering…';
      try {
        const c = await U.svgToCanvas(f.svg, f.W, f.H, f.px[0] / f.W, null);
        if (f.fmt === 'tiff') U.download(`${stem}-${f.dpi}dpi.tif`, 'image/tiff', P.tiff(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height, f.dpi));
        else {
          const blob = await new Promise((res, rej) => c.toBlob(x => (x ? res(x) : rej(new Error('PNG export failed; choose a lower resolution.'))), 'image/png'));
          U.download(`${stem}-${f.dpi}dpi.png`, 'image/png', P.pngDpi(new Uint8Array(await blob.arrayBuffer()), f.dpi));
        }
      } catch (e) { U.toast(e.message || 'Export failed; choose a lower resolution.'); }
      b.disabled = false; b.innerHTML = 'Download <span class="lock">PRO</span>';
    });
  };

  /* ---------- report panel ---------- */
  /* sections: [{title, html}] */
  U.renderReport = function (el, sections, opts) {
    opts = opts || {};
    const pro = Pro.active();
    el.innerHTML = `
      <div class="rep-head"><h3>Write-up</h3>
        <div class="rep-actions">
          <button class="btn small" data-rep="copy">Copy text</button>
          <button class="btn small ghost" data-rep="html">Download report</button>
        </div></div>
      <div class="rep-body${pro ? '' : ' locked'}">${sections.map(s => `<section><h4>${U.esc(s.title)}</h4>${s.html}</section>`).join('')}</div>
      ${pro ? '' : '<div class="rep-lock"><p><b>Auto-written methods, results and figure legend</b> with your numbers, in journal style.</p><button class="btn primary small" data-rep="unlock">Unlock with Pro</button></div>'}`;
    const text = () => sections.map(s => s.title + '\n' + s.html.replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()).join('\n\n');
    el.querySelector('[data-rep=copy]').onclick = () => Pro.require('The auto-written report', async () => {
      try {
        const html = sections.map(s => `<h4>${U.esc(s.title)}</h4>${s.html}`).join('');
        if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text()], { type: 'text/plain' }) })]);
        else await navigator.clipboard.writeText(text());
        U.toast('Copied. Paste into Word or Google Docs.', 'ok');
      } catch (e) { U.toast('Copy was blocked by the browser; use Download instead.'); }
    });
    el.querySelector('[data-rep=html]').onclick = () => Pro.require('The analysis report', () => {
      const fig = opts.figure ? opts.figure() : '';
      const tables = opts.tables ? opts.tables() : '';
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${U.esc(opts.title || 'Lattent report')}</title>
<style>body{font:15px/1.6 Georgia,serif;color:#111;max-width:760px;margin:40px auto;padding:0 20px}h1{font:600 22px Arial,sans-serif}h4{font:600 14px Arial,sans-serif;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#444}table{border-collapse:collapse;font:13px Arial,sans-serif;margin:10px 0;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px 8px;text-align:right}td:first-child,th:first-child{text-align:left}figure{margin:20px 0}svg{max-width:100%;height:auto}.meta{font:12px Arial,sans-serif;color:#666}</style></head><body>
<h1>${U.esc(opts.title || 'Analysis report')}</h1><p class="meta">Generated by Lattent on ${new Date().toISOString().slice(0, 10)}. Analysis ran locally in the browser.</p>
${fig ? `<figure>${fig}</figure>` : ''}${sections.map(s => `<h4>${U.esc(s.title)}</h4>${s.html}`).join('')}${tables}</body></html>`;
      U.download((opts.file || 'lattent-report') + '.html', 'text/html', doc);
    });
    const u = el.querySelector('[data-rep=unlock]');
    if (u) u.onclick = () => U.upgrade('The auto-written report');
  };

  /* ---------- project files and local drafts ---------- */
  U.collectState = function (root) {
    const s = {};
    $$('[data-state]', root).forEach(el => { s[el.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value; });
    return s;
  };
  U.applyState = function (root, s) {
    Object.entries(s || {}).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (!el || !el.hasAttribute('data-state')) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v; else el.value = v;
    });
  };
  U.projectButtons = function (tool, root, onLoad) {
    const save = $('[data-project=save]'), open = $('[data-project=open]');
    if (save) save.onclick = () => Pro.require('Project files', () => {
      U.download(tool + '-' + new Date().toISOString().slice(0, 10) + '.lattent.json', 'application/json',
        JSON.stringify({ app: 'lattent', tool, version: 1, saved: new Date().toISOString(), state: U.collectState(root) }, null, 1));
    });
    if (open) open.onclick = () => Pro.require('Project files', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        f.text().then(t => {
          let j; try { j = JSON.parse(t); } catch (e) { U.toast('That file is not a Lattent project.'); return; }
          if (!j || !['lattent', 'benchfit'].includes(j.app) || j.tool !== tool) { U.toast('That project belongs to a different tool.'); return; }
          U.applyState(root, j.state); onLoad(); U.toast('Project opened.', 'ok');
        });
      };
      inp.click();
    });
  };
  U.autosave = function (tool, root) {
    const key = 'bf.draft.' + tool;
    let h;
    root.addEventListener('input', () => { clearTimeout(h); h = setTimeout(() => store.set(key, U.collectState(root)), 400); });
    root.addEventListener('change', () => store.set(key, U.collectState(root)));
    const d = store.get(key, null);
    if (d) U.applyState(root, d);
    return !!d;
  };

  /* drag-and-drop or choose a text file into a textarea */
  /* Load a file into a paste box. Lab formats (JCAMP-DX, XRDML, RAS, UXD, SPC, CIF…) are
     converted to columns when assets/js/formats.js is on the page. */
  U.fileToText = function (f) {
    const Fm = BF.formats;
    if (!Fm) return f.text();
    return Fm.read(f).then(r => {
      if (r.kind === 'structure') {
        const pat = BF.xtal.xrd(r.structure, { tmin: 10, tmax: 90 }), prof = BF.xtal.profile(pat, 10, 90, 0.1);
        return '2θ (°)\tIntensity (simulated)\n' + prof.map(([x, y]) => x.toFixed(3) + '\t' + y.toFixed(3)).join('\n');
      }
      return [r.cols].concat(r.rows).map(row => row.join('\t')).join('\n');
    });
  };
  U.fileInto = function (textarea, button) {
    const read = f => U.fileToText(f).then(t => { textarea.value = t; textarea.dispatchEvent(new Event('input', { bubbles: true })); U.toast('Loaded ' + f.name); }).catch(e => U.toast(e.message));
    textarea.addEventListener('dragover', e => { e.preventDefault(); textarea.classList.add('drag'); });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('drag'));
    textarea.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); textarea.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) read(f); });
    if (button) button.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = BF.formats ? BF.formats.accept : '.csv,.tsv,.txt';
      inp.onchange = () => inp.files[0] && read(inp.files[0]); inp.click();
    };
  };

  /* tooltip for chart points */
  U.tooltip = function (host, getText) {
    let tip = host.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
    host.onmousemove = e => {
      const pt = e.target.closest('.pt');
      if (!pt) { tip.hidden = true; return; }
      const txt = getText(pt);
      if (!txt) { tip.hidden = true; return; }
      tip.innerHTML = txt; tip.hidden = false;
      const r = host.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 10;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    host.onmouseleave = () => { tip.hidden = true; };
  };

  /* ---------- colour theme: system, light or dark ---------- */
  const ICON = {
    system: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 16.5h6M10 13.5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 12.6A6.8 6.8 0 0 1 7.4 3.8a6.8 6.8 0 1 0 8.8 8.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };
  const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const themeGet = () => { try { const t = localStorage.getItem('bf.theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch (e) { return 'system'; } };
  const isDark = () => { const t = themeGet(); return t === 'dark' || (t === 'system' && mq.matches); };
  function syncThemeColor() {
    $$('meta[name="theme-color"][media]').forEach(m => {
      if (!m.dataset.orig) m.dataset.orig = m.content;
      const t = themeGet();
      m.content = t === 'system' ? m.dataset.orig : (t === 'dark' ? '#090c1b' : '#f6f7fb');
    });
  }
  const themeEvent = () => document.dispatchEvent(new CustomEvent('bf:theme', { detail: { theme: themeGet(), dark: isDark() } }));
  function themeSet(t) {
    try { if (t === 'system') localStorage.removeItem('bf.theme'); else localStorage.setItem('bf.theme', t); } catch (e) { /* storage blocked: applies to this page only */ }
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    syncThemeColor(); paintThemes(); themeEvent();
  }
  mq.addEventListener('change', () => { if (themeGet() === 'system') { paintThemes(); themeEvent(); } });
  U.theme = { get: themeGet, set: themeSet, dark: isDark };
  function paintThemes() {
    const t = themeGet();
    $$('.theme-btn').forEach(b => { b.innerHTML = ICON[t]; b.title = 'Theme: ' + t[0].toUpperCase() + t.slice(1); });
    $$('[data-theme-opt]').forEach(o => o.setAttribute('aria-checked', o.dataset.themeOpt === t));
  }
  const closePops = except => $$('.pop-menu').forEach(m => { if (m !== except) { m.hidden = true; const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', false); } });
  document.addEventListener('click', e => { if (!e.target.closest('.pop-wrap')) closePops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(); });
  function popWrap(cls, button, menu) {
    const w = document.createElement('div');
    w.className = 'pop-wrap ' + cls;
    w.innerHTML = button + menu;
    const b = w.firstElementChild, m = w.lastElementChild;
    b.onclick = e => { e.stopPropagation(); const open = m.hidden; closePops(m); m.hidden = !open; b.setAttribute('aria-expanded', open); };
    return w;
  }
  U.themeControl = function () {
    const w = popWrap('theme-wrap', '<button class="theme-btn" aria-haspopup="true" aria-expanded="false" aria-label="Colour theme"></button>',
      `<div class="pop-menu theme-menu" role="menu" hidden>${THEMES.map(([k, n]) => `<button role="menuitemradio" data-theme-opt="${k}">${ICON[k]}<span>${n}</span></button>`).join('')}</div>`);
    w.querySelector('.theme-menu').onclick = e => { const o = e.target.closest('[data-theme-opt]'); if (o) { themeSet(o.dataset.themeOpt); closePops(); } };
    setTimeout(paintThemes);
    return w;
  };

  /* ---------- account: read the stored session without loading the Supabase client ---------- */
  U.session = function () {
    if (!(CFG.supabase && CFG.supabase.url)) return null;
    try {
      const s = JSON.parse(localStorage.getItem('bf.auth') || 'null');
      const u = s && (s.user || (s.currentSession && s.currentSession.user));
      return u && u.email ? { email: u.email, id: u.id } : null;
    } catch (e) { return null; }
  };
  const planLabel = () => {
    const k = Pro.kind();
    return k === 'lab' || k === 'lab-member' ? ['Lab plan', 'pro'] : k === 'account' || k === 'licence' ? ['Pro', 'pro'] : k === 'trial' ? ['Pro trial · ' + Math.ceil(Pro.trialLeft()) + ' days left', 'trial'] : ['Free plan', 'free'];
  };
  U.accountControl = function () {
    const s = U.session();
    if (!s) { const a = document.createElement('a'); a.className = 'signin'; a.href = U.root + 'account/'; a.textContent = 'Sign in'; return a; }
    const ini = (s.email.split('@')[0].split(/[._+-]/).filter(Boolean).slice(0, 2).map(x => x[0]).join('') || s.email[0]).toUpperCase();
    const [plan, pk] = planLabel(), free = pk === 'free';
    return popWrap('acct-wrap', `<button class="avatar" aria-haspopup="true" aria-expanded="false" aria-label="Your account (${U.esc(s.email)})">${U.esc(ini)}</button>`,
      `<div class="pop-menu acct-menu" role="menu" hidden>
        <div class="am-head"><span class="avatar lg" aria-hidden="true">${U.esc(ini)}</span><div><b>${U.esc(s.email)}</b><span class="am-plan ${pk}">${plan}</span></div></div>
        <a role="menuitem" href="${U.root}account/">Account and billing</a>
        <a role="menuitem" href="${U.root}studio/?cloud=1">Cloud projects</a>
        ${free ? `<a role="menuitem" class="am-up" href="${U.root}pricing/">Upgrade to Pro</a>` : ''}
        <a role="menuitem" class="am-out" href="${U.root}account/?signout=1">Sign out</a></div>`);
  };

  /* ---------- chrome ---------- */
  const here = document.currentScript && document.currentScript.src;
  U.root = here ? here.replace(/assets\/js\/shell\.js.*$/, '') : '/';
  /* installable app whose Studio works offline (sw.js); browsers allow plain http only on localhost */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register(U.root + 'sw.js').catch(() => { /* offline support is optional */ }));
  }
  /* Install as an app. Chrome and Edge fire beforeinstallprompt once the site qualifies and
     then U.install() shows their prompt; every other browser installs from its own menu, so
     U.install() explains the steps for the device instead. Any [data-install] link opens it. */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e; document.documentElement.classList.add('can-install');
    if (!U.store.get('bf.install.hint', false) && /\/studio\//.test(location.pathname)) { U.store.set('bf.install.hint', true); setTimeout(() => U.toast('Lattent can be installed as an app: see “Install app” at the foot of the page.'), 2500); }
  });
  window.addEventListener('appinstalled', () => { installEvt = null; document.documentElement.classList.remove('can-install'); U.toast('Lattent is installed. Find it with your other apps.', 'ok'); });
  U.installed = () => (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  U.install = async function () {
    if (installEvt && !U.installed()) { const e = installEvt; installEvt = null; e.prompt(); const r = await e.userChoice.catch(() => null); if (!r || r.outcome !== 'accepted') installEvt = e; return; }
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), android = /Android/.test(ua), firefox = /Firefox/.test(ua), safari = /Safari/.test(ua) && !/Chrome|CriOS|Edg/.test(ua);
    const steps = U.installed() ? ['Lattent is already installed on this device: open it from your home screen or app list.']
      : ios ? ['Open this page in Safari; other iPhone browsers cannot install apps.', 'Tap the Share button, the square with an arrow at the bottom of the screen.', 'Scroll down and tap “Add to Home Screen”, then “Add”.']
      : android ? ['Tap the browser menu, the three dots at the top right.', firefox ? 'Tap “Add to Home screen” (Firefox may call it “Install”).' : 'Tap “Add to Home screen” or “Install app”.', 'Confirm. Lattent appears with your other apps and works offline.']
      : safari ? ['In Safari on a Mac, open the File menu and choose “Add to Dock”.']
      : firefox ? ['Firefox on a computer does not install web apps. Use Chrome or Edge for the app, or bookmark this page.']
      : ['In Chrome or Edge, click the install icon at the right end of the address bar (a small screen with an arrow), or open the browser menu and choose “Install Lattent” or “Apps › Install this site as an app”.'];
    U.modal(`<p class="m-kicker">Lattent</p><h2>${U.installed() ? 'Already installed' : 'Install Lattent as an app'}</h2><p>The app opens full screen, sits with your other apps, and Studio keeps working without an internet connection. Nothing comes from a store: it is this site, kept on your device, and it updates itself.</p><ol class="install-steps">${steps.map(s => `<li>${U.esc(s)}</li>`).join('')}</ol>`);
  };
  document.addEventListener('click', e => { const a = e.target.closest('[data-install]'); if (a) { e.preventDefault(); U.install(); } });
  const tools = [
    ['tools/xrd-crystallite-size/', 'XRD crystallite size'], ['tools/band-gap-tauc/', 'Band gap (Tauc)'],
    ['tools/activation-energy-arrhenius/', 'Activation energy'], ['tools/adsorption-isotherms/', 'Adsorption isotherms'],
    ['tools/adsorption-kinetics/', 'Adsorption kinetics'], ['tools/tafel-slope/', 'Tafel slope'],
    ['tools/avrami-crystallization/', 'Avrami kinetics'], ['tools/tensile-test/', 'Tensile test'],
    ['tools/peak-fitting/', 'Peak fitting'], ['standard-curve/', 'Calibration curves']
  ];
  /* Site navigation: three mega menus in the manner of scientific-software sites, plus Pricing.
     Item: [href (relative to the site root, or absolute), title, one-line description]. */
  const FIELDS = [
    ['solutions/nanomaterials/', 'Nanomaterials', 'Crystallite size, phases, band gaps'],
    ['solutions/catalysis/', 'Catalysis', 'Kinetics, isotherms, batch statistics'],
    ['solutions/batteries-energy/', 'Batteries and energy', 'Conductivity, cathodes, phase purity'],
    ['solutions/polymers/', 'Polymers', 'Tensile tests, Tg, rheology, blends'],
    ['solutions/semiconductors/', 'Semiconductors and optics', 'Band gaps, PL decay, new absorbers'],
    ['solutions/electrochemistry/', 'Electrochemistry', 'Tafel, conductivity, calibration'],
    ['solutions/ceramics-alloys/', 'Ceramics and alloys', 'Hall–Petch, JMAK, alloy datasets'],
    ['solutions/analytical-chemistry/', 'Analytical chemistry', 'Calibration, LOD/LOQ, chromatography']
  ];
  const MENU = [
    { id: 'platform', label: 'Platform',
      feature: { kicker: 'Lattent Studio', title: 'One workspace, from raw data to the next material', text: 'Data tables, validated analyses, publication figures and generative discovery in your browser.', href: 'studio/', cta: 'Open Studio' },
      cols: [
        { h: 'Analyse', items: [['#characterise', 'Spectra and diffraction', 'Peak fits, XRD sizes, band gaps'], ['#fit', 'Curve fitting', '35 equations, ranked by AICc'], ['#compare', 'Statistics', 'Tests with the checks built in'], ['tools/tensile-test/', 'Mechanical tests', 'Modulus, yield, toughness']] },
        { h: 'Discover', items: [['studio/?discover=search', 'Materials database', '5.8 million computed crystals'], ['studio/?discover=phase', 'Phase identification', 'Match XRD peaks to structures'], ['studio/?discover=gen', 'Generative design', 'Propose new compositions'], ['#optimise', 'Bayesian optimisation', 'Choose the next experiments']] },
        { h: 'Work together', items: [['#publish', 'Figures and write-ups', '600-dpi figures and methods text'], ['account/', 'Cloud and Lab teams', 'Sync and share with your group'], ['#organise', 'Data tables', 'XY, column and multi-variable']] }
      ] },
    { id: 'solutions', label: 'Solutions',
      feature: { kicker: 'Worked example', title: 'Identify the phases in your XRD', text: 'Fit the peaks of a gold-nanoparticle pattern, then match them against every computed gold structure.', href: 'studio/?example=xrd', cta: 'Open the example' },
      cols: [
        { h: 'By field', wide: true, items: FIELDS },
        { h: 'By team', items: [['pricing/', 'Students and researchers', 'Free, in the browser'], ['pricing/', 'Research groups', 'Shared projects on the Lab plan'], ['#examples', 'Teaching labs', 'Ready-made class examples'], ['life-science/', 'Life-science labs', 'IC50, kinetics, qPCR']] }
      ] },
    { id: 'facet', label: 'Facet AI', compact: true, items: [
      ['ai/', 'Facet AI overview', 'Sixteen models, with a demo you can run'],
      ['studio/?example=anova&facet=report', 'Autonomous reports', 'An agent that analyses, checks and writes up'],
      ['studio/?facet=graph', 'Graph reader', 'Turn a figure image into data'],
      ['studio/?facet=check', 'Project check', 'Find errors before reviewers do'],
      ['studio/?example=floryfox&run=symreg', 'Equation discovery', 'Symbolic regression finds the formula'],
      ['studio/?example=perovskite', 'AutoML predictions', 'Best model, importance, intervals']] },
    { id: 'resources', label: 'Resources', compact: true, items: [
      ['#examples', 'Worked examples', 'Ten ready-made projects'], ['tools/', 'Quick tools', 'One-step calculators'],
      ['validation/', 'Validation', 'How the numbers are checked'], ['changelog/', 'What’s new', 'Release notes'], ['legal/security.html', 'Security and privacy', 'How your data is protected']] },
    { id: 'support', label: 'Support', href: 'support/' },
    { id: 'pricing', label: 'Pricing', href: 'pricing/' }
  ];
  const href = h => (h === '@contact' ? U.root + 'contact/' : /^https?:/.test(h) ? h : U.root + h);
  const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lt-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#252d6b"/><stop offset="1" stop-color="#0c1031"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#lt-g)"/><circle cx="32" cy="32" r="2.6" fill="#3f4789"/><circle cx="46" cy="32" r="2.6" fill="#3f4789"/><circle cx="32" cy="18" r="2.6" fill="#3f4789"/><circle cx="18" cy="18" r="5" fill="#e3e7ff"/><circle cx="18" cy="32" r="5" fill="#e3e7ff"/><circle cx="18" cy="46" r="5" fill="#e3e7ff"/><circle cx="32" cy="46" r="5" fill="#e3e7ff"/><circle cx="46" cy="46" r="5" fill="#e3e7ff"/><circle cx="46" cy="18" r="10" fill="none" stroke="#f08c3e" stroke-opacity=".5" stroke-width="2"/><circle cx="46" cy="18" r="5.6" fill="#f08c3e"/></svg>';
  function chrome() {
    const h = $('header[data-bf]');
    const path = location.pathname;
    U.contact = { href: U.root + 'contact/', ext: false };
    if (h) {
      h.className = 'top';
      const item = ([u, t, d]) => `<a class="mm-item" href="${href(u)}"${u === '@contact' && U.contact.ext ? ' target="_blank" rel="noopener"' : ''}><b>${t}</b><span>${d}</span></a>`;
      const panel = m => m.compact ? `<div class="mm-panel compact" id="mm-${m.id}" role="region" aria-label="${m.label}" hidden><div class="mm-in"><div class="mm-list">${m.items.map(item).join('')}</div></div></div>` : `<div class="mm-panel" id="mm-${m.id}" role="region" aria-label="${m.label}" hidden><div class="mm-in">
          <a class="mm-feat" href="${href(m.feature.href)}"><span class="mm-k">${m.feature.kicker}</span><b>${m.feature.title}</b><span>${m.feature.text}</span><i>${m.feature.cta} →</i></a>
          ${m.cols.map(c => `<div class="mm-col${c.wide ? ' wide' : ''}"><h6>${c.h}</h6><div class="mm-list">${c.items.map(item).join('')}</div></div>`).join('')}
        </div></div>`;
      h.innerHTML = `<div class="top-in">
        <a class="logo" href="${U.root}" aria-label="Lattent home">${LOGO}<span>Lattent</span></a>
        <nav class="nav" aria-label="Site">${MENU.map(m => m.href
          ? `<a class="nav-top${path.includes('/' + m.href) ? ' cur' : ''}" href="${href(m.href)}"${path.includes('/' + m.href) ? ' aria-current="page"' : ''}>${m.label}</a>`
          : `<div class="nav-group${m.compact ? ' compact' : ''}"><button class="nav-top" aria-expanded="false" aria-controls="mm-${m.id}">${m.label}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${panel(m)}</div>`).join('')}
          <div class="nav-m-theme"><span>Theme</span><div class="seg-t">${THEMES.map(([k, n]) => `<button data-theme-opt="${k}" role="menuitemradio">${ICON[k]}<span>${n}</span></button>`).join('')}</div></div>
          <div class="nav-m-acts">${U.session() ? `<a class="btn" href="${U.root}account/">Your account</a>` : `<a class="btn" href="${U.root}account/">Sign in</a>`}<a class="btn primary" href="${U.root}studio/">Open Studio</a></div></nav>
        <div class="top-r"><a class="pro-chip" href="${U.root}account/" id="pro-chip" hidden></a><span class="slot-theme"></span><span class="slot-acct"></span><a class="btn primary small open-studio" href="${U.root}studio/">Open Studio</a>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false"><span></span><span></span></button></div></div>`;
      $('.slot-theme', h).replaceWith(U.themeControl());
      $('.slot-acct', h).replaceWith(U.accountControl());
      $$('.nav-m-theme [data-theme-opt]', h).forEach(b => b.onclick = () => themeSet(b.dataset.themeOpt));
      paintThemes();
      const mb = $('.menu-btn', h), groups = [...h.querySelectorAll('.nav-group')];
      const mobile = () => window.matchMedia('(max-width: 960px)').matches;
      const setOpen = (g, open) => {
        const b = g.querySelector('.nav-top'), pnl = g.querySelector('.mm-panel');
        b.setAttribute('aria-expanded', open); pnl.hidden = !open; g.classList.toggle('open', open);
      };
      const closeAll = except => groups.forEach(g => { if (g !== except) setOpen(g, false); });
      let timer = null;
      groups.forEach(g => {
        const b = g.querySelector('.nav-top');
        b.onclick = () => { const open = b.getAttribute('aria-expanded') !== 'true'; closeAll(g); setOpen(g, open); };
        g.onmouseenter = () => { if (mobile()) return; clearTimeout(timer); timer = setTimeout(() => { closeAll(g); setOpen(g, true); }, 90); };
        g.onmouseleave = () => { if (mobile()) return; clearTimeout(timer); timer = setTimeout(() => setOpen(g, false), 160); };
        g.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(g, false); b.focus(); } });
      });
      document.addEventListener('click', e => { if (!h.contains(e.target)) closeAll(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); if (h.classList.contains('open')) { h.classList.remove('open'); mb.setAttribute('aria-expanded', false); } } });
      h.querySelectorAll('.mm-panel a, .nav > a').forEach(a => a.addEventListener('click', () => { closeAll(); h.classList.remove('open'); mb.setAttribute('aria-expanded', false); }));
      mb.onclick = () => { const o = h.classList.toggle('open'); mb.setAttribute('aria-expanded', o); if (!o) closeAll(); };
      if (path.includes('/solutions/')) { const sb = h.querySelector('[aria-controls="mm-solutions"]'); if (sb) sb.classList.add('cur'); }
    }
    const st = $('#st-theme'); if (st) st.replaceWith(U.themeControl());
    const sa = $('#st-acct'); if (sa) sa.replaceWith(U.accountControl());
    syncThemeColor();
    if (!document.body.classList.contains('studio') && !/\/404/.test(path) && !document.querySelector('script[data-guide]')) {
      const g = document.createElement('script'); g.src = U.root + 'assets/js/guide.js'; g.defer = true; g.dataset.guide = '1'; document.body.appendChild(g);
    }
    const f = $('footer[data-bf]');
    const founders = () => {
      const fs = (CFG.founders || []).map(p => (p.url ? `<a href="${U.esc(p.url)}">${U.esc(p.name)}</a>` : U.esc(p.name)));
      if (!fs.length) return '';
      return 'Founded by ' + (fs.length > 1 ? fs.slice(0, -1).join(', ') + ' and ' + fs[fs.length - 1] : fs[0]) + (CFG.foundersNote ? ', ' + U.esc(CFG.foundersNote) : '') + '. ';
    };
    if (f) {
      f.className = 'foot';
      f.innerHTML = `<div class="foot-in">
        <div><a class="logo" href="${U.root}"><svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lt-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#252d6b"/><stop offset="1" stop-color="#0c1031"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#lt-g)"/><circle cx="32" cy="32" r="2.6" fill="#3f4789"/><circle cx="46" cy="32" r="2.6" fill="#3f4789"/><circle cx="32" cy="18" r="2.6" fill="#3f4789"/><circle cx="18" cy="18" r="5" fill="#e3e7ff"/><circle cx="18" cy="32" r="5" fill="#e3e7ff"/><circle cx="18" cy="46" r="5" fill="#e3e7ff"/><circle cx="32" cy="46" r="5" fill="#e3e7ff"/><circle cx="46" cy="46" r="5" fill="#e3e7ff"/><circle cx="46" cy="18" r="10" fill="none" stroke="#f08c3e" stroke-opacity=".5" stroke-width="2"/><circle cx="46" cy="18" r="5.6" fill="#f08c3e"/></svg><span>Lattent</span></a><p>Data analysis and materials discovery for the lab bench. It runs in your browser, and your data stays on your computer unless you save it to the cloud.</p></div>
        <div><h5>Platform</h5><a href="${U.root}studio/">Lattent Studio</a><a href="${U.root}studio/?discover=gen">Discover</a><a href="${U.root}ai/">Facet AI</a><a href="${U.root}#features">Features</a><a href="${U.root}tools/">Quick tools</a><a href="${U.root}pricing/">Pricing</a></div>
        <div><h5>Solutions</h5>${FIELDS.map(([p, n]) => `<a href="${U.root}${p}">${n}</a>`).join('')}<a href="${U.root}life-science/">Life sciences</a></div>
        <div><h5>Resources</h5><a href="${U.root}#examples">Worked examples</a><a href="${U.root}validation/">Validation</a><a href="${U.root}changelog/">What’s new</a><a href="${U.root}support/">Support</a><a href="${U.root}contact/">Contact</a><a href="#install" data-install>Install app</a><a href="#cite" data-cite>Cite Lattent</a></div>
        <div><h5>Company</h5><a href="${U.root}account/">Account</a><a href="${U.root}legal/terms.html">Terms</a><a href="${U.root}legal/privacy.html">Privacy</a><a href="${U.root}legal/refunds.html">Refunds</a><a href="${U.root}legal/security.html">Security</a></div>
      </div><p class="foot-note">${founders()}© ${new Date().getFullYear()} Lattent.</p>`;
    }
    proChip();
  }
  function proChip() {
    const c = $('#pro-chip');
    if (!c) return;
    /* signed in: the account menu shows the plan, so the chip is only needed inside Studio */
    if (U.session && U.session() && !document.body.classList.contains('studio')) { c.hidden = true; return; }
    const k = Pro.kind();
    if (k === 'licence' || k === 'account') { c.textContent = 'Pro'; c.className = 'pro-chip on'; c.hidden = false; }
    else if (k === 'lab' || k === 'lab-member') { c.textContent = 'Lab'; c.className = 'pro-chip on'; c.hidden = false; }
    else if (k === 'trial') { c.textContent = 'Pro trial · ' + Math.ceil(Pro.trialLeft()) + 'd'; c.className = 'pro-chip on'; c.hidden = false; }
    else { c.textContent = 'Get Pro'; c.className = 'pro-chip'; c.onclick = e => { if (!location.pathname.includes('/account')) { e.preventDefault(); U.upgrade(); } }; c.hidden = !document.body.classList.contains('studio'); }
  }
  document.addEventListener('bf:pro', proChip);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chrome); else chrome();
  Pro.revalidate();
})();
