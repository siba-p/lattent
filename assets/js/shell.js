/* Benchfit app shell: header/footer, data parsing, exports, reports and the Pro gate. */
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
  U.svgToPng = function (svg, W, H, scale, watermark) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        if (watermark) {
          x.font = `${11 * scale}px Arial`; x.fillStyle = 'rgba(0,0,0,0.38)'; x.textAlign = 'right';
          x.fillText(watermark, c.width - 10 * scale, c.height - 8 * scale);
        }
        c.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
      };
      img.onerror = () => reject(new Error('Could not render the figure'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
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
    const res = await lsPost('activate', { license_key: key, instance_name: 'Benchfit web · ' + (navigator.platform || 'browser') });
    if (!res.activated) {
      const e = String(res.error || '');
      if (/not found/i.test(e)) throw new Error('That licence key was not found. Check it against your purchase email.');
      if (/limit/i.test(e)) throw new Error('This key is already active on the maximum number of browsers. Deactivate it on one of them first.');
      if (/expired|disabled/i.test(e)) throw new Error('This licence has expired or been disabled.');
      throw new Error(e || 'This licence key could not be activated.');
    }
    if (CFG.storeId && res.meta && Number(res.meta.store_id) !== Number(CFG.storeId)) throw new Error('This key was not issued by Benchfit.');
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
  Pro.revalidate = async function () {
    const s = Pro.state();
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

  U.upgrade = function (what) {
    const k = Pro.kind();
    const p = CFG.prices;
    const plan = (id, label, price, per, best) => `<a class="plan-btn${best ? ' best' : ''}" href="${U.root}account/?buy=${id}"><b>${label}</b><span>$${price}<small>/${per}</small></span></a>`;
    const live = CFG.checkout && (CFG.checkout.monthly || CFG.checkout.yearly || CFG.checkout.lab);
    U.modal(`
      <p class="m-kicker">Benchfit Pro${CFG.earlyAccess ? ' · early-access price' : ''}</p>
      <h2>${what ? U.esc(what) + ' is a Pro feature' : 'Publication-ready output, in one click'}</h2>
      <ul class="m-list">
        <li>Figures as vector SVG and 600-dpi PNG, without the watermark</li>
        <li>Auto-written methods, results and figure legend, ready to paste into a paper</li>
        <li>Cloud storage for your projects, results as CSV and reports</li>
        <li>AI co-scientist chat with your own Claude or GPT key</li>
      </ul>
      ${live ? `<div class="m-plans">${plan('yearly', 'Yearly', p.yearly, 'year', true)}${plan('monthly', 'Monthly', p.monthly, 'month')}${plan('lab', 'Lab, 10 people', p.lab, 'year')}</div>` : '<p class="m-note">Paid plans open shortly. Meanwhile, try every Pro feature free.</p>'}
      <div class="m-actions">
        ${k === 'free' ? '<button class="btn primary" data-trial>Start free 7-day trial</button>' : k === 'trial-ended' ? '<span class="m-note">Your trial has ended.</span>' : ''}
        <a class="btn ghost" href="${U.root}account/">Sign in or manage plan</a>
      </div>`);
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

  /* ---------- figure export ---------- */
  /* build(theme, W, H) → {svg}; name: file stem */
  U.exportFigure = function (build, name, fmt) {
    const W = 720, H = 500;
    const fig = build(BF.plot.print, W, H);
    if (fmt === 'png-free') {
      return U.svgToPng(fig.svg, W, H, 2, 'Made with Benchfit (free)').then(b => U.download(name + '.png', 'image/png', b));
    }
    Pro.require('High-resolution and vector export', () => {
      if (fmt === 'svg') U.download(name + '.svg', 'image/svg+xml', fig.svg);
      else U.svgToPng(fig.svg, W, H, 5, null).then(b => U.download(name + "-600dpi.png", "image/png", b));
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
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${U.esc(opts.title || 'Benchfit report')}</title>
<style>body{font:15px/1.6 Georgia,serif;color:#111;max-width:760px;margin:40px auto;padding:0 20px}h1{font:600 22px Arial,sans-serif}h4{font:600 14px Arial,sans-serif;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#444}table{border-collapse:collapse;font:13px Arial,sans-serif;margin:10px 0;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px 8px;text-align:right}td:first-child,th:first-child{text-align:left}figure{margin:20px 0}svg{max-width:100%;height:auto}.meta{font:12px Arial,sans-serif;color:#666}</style></head><body>
<h1>${U.esc(opts.title || 'Analysis report')}</h1><p class="meta">Generated by Benchfit on ${new Date().toISOString().slice(0, 10)}. Analysis ran locally in the browser.</p>
${fig ? `<figure>${fig}</figure>` : ''}${sections.map(s => `<h4>${U.esc(s.title)}</h4>${s.html}`).join('')}${tables}</body></html>`;
      U.download((opts.file || 'benchfit-report') + '.html', 'text/html', doc);
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
      U.download(tool + '-' + new Date().toISOString().slice(0, 10) + '.benchfit.json', 'application/json',
        JSON.stringify({ app: 'benchfit', tool, version: 1, saved: new Date().toISOString(), state: U.collectState(root) }, null, 1));
    });
    if (open) open.onclick = () => Pro.require('Project files', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        f.text().then(t => {
          let j; try { j = JSON.parse(t); } catch (e) { U.toast('That file is not a Benchfit project.'); return; }
          if (!j || j.app !== 'benchfit' || j.tool !== tool) { U.toast('That project belongs to a different tool.'); return; }
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
  U.fileInto = function (textarea, button) {
    const read = f => f.text().then(t => { textarea.value = t; textarea.dispatchEvent(new Event('input', { bubbles: true })); U.toast('Loaded ' + f.name); });
    textarea.addEventListener('dragover', e => { e.preventDefault(); textarea.classList.add('drag'); });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('drag'));
    textarea.addEventListener('drop', e => { e.preventDefault(); textarea.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) read(f); });
    if (button) button.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.tsv,.txt';
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

  /* ---------- chrome ---------- */
  const here = document.currentScript && document.currentScript.src;
  U.root = here ? here.replace(/assets\/js\/shell\.js.*$/, '') : '/';
  const tools = [
    ['dose-response/', 'Dose–response'], ['standard-curve/', 'Standard curves'],
    ['enzyme-kinetics/', 'Enzyme kinetics'], ['qpcr/', 'qPCR']
  ];
  const nav = [['studio/', 'Studio'], ['#features', 'Features'], ['#examples', 'Examples'], ['#calculators', 'Calculators'], ['#pricing', 'Pricing']];
  function chrome() {
    const h = $('header[data-bf]');
    const path = location.pathname;
    if (h) {
      h.className = 'top';
      h.innerHTML = `<div class="top-in">
        <a class="logo" href="${U.root}"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--brand)"/><path d="M6 23c5 0 6-14 10-14s5 14 10 14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="9" r="2.4" fill="#fff"/></svg><span>Benchfit</span></a>
        <nav class="nav" aria-label="Site">${nav.map(([p, n]) => `<a href="${U.root}${p}"${p !== '#' && path.includes('/' + p) && p.endsWith('/') ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
        <div class="top-r"><a class="pro-chip" href="${U.root}account/" id="pro-chip"></a><a class="btn primary small open-studio" href="${U.root}studio/">Open Studio</a>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false"><span></span><span></span></button></div></div>`;
      const mb = $('.menu-btn', h);
      mb.onclick = () => { const o = h.classList.toggle('open'); mb.setAttribute('aria-expanded', o); };
    }
    const f = $('footer[data-bf]');
    if (f) {
      f.className = 'foot';
      f.innerHTML = `<div class="foot-in">
        <div><a class="logo" href="${U.root}"><span>Benchfit</span></a><p>Analyse, graph and explain scientific data, in your browser. Your data never leaves your computer.</p></div>
        <div><h5>Product</h5><a href="${U.root}studio/">Benchfit Studio</a><a href="${U.root}#features">Features</a><a href="${U.root}#examples">Examples</a><a href="${U.root}validation/">Validation</a></div>
        <div><h5>Calculators</h5>${tools.map(([p, n]) => `<a href="${U.root}${p}">${n}</a>`).join('')}</div>
        <div><h5>Company</h5><a href="${U.root}#pricing">Pricing</a><a href="${U.root}account/">Account</a><a href="${U.root}#faq">FAQ</a></div>
        <div><h5>Legal</h5><a href="${U.root}legal/terms.html">Terms</a><a href="${U.root}legal/privacy.html">Privacy</a><a href="${U.root}legal/refunds.html">Refunds</a><a href="${U.root}legal/security.html">Security</a></div>
      </div><p class="foot-note">Built by <a href="${CFG.author.url}">${CFG.author.name}</a>. © ${new Date().getFullYear()} Benchfit.</p>`;
    }
    proChip();
  }
  function proChip() {
    const c = $('#pro-chip');
    if (!c) return;
    const k = Pro.kind();
    if (k === 'licence' || k === 'account') { c.textContent = 'Pro'; c.className = 'pro-chip on'; }
    else if (k === 'lab' || k === 'lab-member') { c.textContent = 'Lab'; c.className = 'pro-chip on'; }
    else if (k === 'trial') { c.textContent = 'Pro trial · ' + Math.ceil(Pro.trialLeft()) + 'd'; c.className = 'pro-chip on'; }
    else { c.textContent = 'Get Pro'; c.className = 'pro-chip'; c.onclick = e => { if (!location.pathname.includes('/account')) { e.preventDefault(); U.upgrade(); } }; }
  }
  document.addEventListener('bf:pro', proChip);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chrome); else chrome();
  Pro.revalidate();
})();
