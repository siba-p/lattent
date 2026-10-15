/* Lattent Discover: materials databases, XRD phase identification and generative design.
   Rendered inside Studio; the database is Alexandria (OPTIMADE), the generative and property
   models are Lattent's own and run in a Web Worker (assets/js/gen-worker.js). */
(function () {
  'use strict';
  const { ui: U, xtal: X, chem: C, plot: P } = BF;
  const esc = U.esc;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const D = {};
  BF.discover = D;
  let api = null;

  const LAMBDA = { '1.5406': 'Cu Kα', '1.7890': 'Co Kα', '0.7107': 'Mo Kα', '1.9373': 'Fe Kα' };
  const st = {
    search: { q: '', mode: 'only', hull: '0.05', provider: 'pbe', lambda: '1.5406', res: null, sel: null, busy: false },
    phase: { source: '', paste: '', els: '', lambda: '', provider: 'pbe', res: null, sel: 0, busy: false },
    gen: { els: [], nel: '', gap: '', requireAll: true, inter: false, n: '400', temp: '1', res: null, busy: false, progress: 0, predText: '', pred: null }
  };
  const VIEWS = {
    search: { title: 'Materials database', sub: 'Search 5.8 million DFT-computed crystal structures in the Alexandria database, view them in 3D and simulate their X-ray diffraction patterns.' },
    phase: { title: 'Identify XRD phases', sub: 'Match measured diffraction peaks against every computed structure in your chemical system and rank the phases.' },
    gen: { title: 'Generate materials', sub: 'Lattent’s own diffusion model proposes new chemical formulas in your chemical system; its property networks predict stability and band gap, and the database shows which are already known.' }
  };

  /* ---------- small helpers ---------- */
  const num = (v, d) => (v == null || !isFinite(v) ? '–' : (+v).toFixed(d));
  const pretty = f => { try { return C.format(C.parse(f)); } catch (e) { return String(f || ''); } };
  const fhtml = f => esc(pretty(f)).replace(/(\d+)/g, '<sub>$1</sub>');
  const sym = s => String(s).replace(/[^A-Za-z].*$/, '');
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const sgFull = n => (n ? `${X.sgHTML(n)} <span class="sgn">(${n})</span>` : '–');
  const pmv = v => (v == null ? '' : ` <small class="pm">± ${num(v, 2)}</small>`);
  const ox = states => Object.keys(states).map(e => { const q = states[e]; return `${esc(e)}<sup>${Math.abs(q) > 1 ? Math.abs(q) : ''}${q > 0 ? '+' : '−'}</sup>`; }).join(' ');
  const oxText = states => Object.keys(states).map(e => e + (states[e] > 0 ? '+' : '') + states[e]).join(' ');
  const seg = (name, opts, v) => `<div class="seg" role="radiogroup">${opts.map(([val, lab]) => `<label><input type="radio" name="${name}" value="${val}"${String(v) === val ? ' checked' : ''}> ${esc(lab)}</label>`).join('')}</div>`;
  const options = (opts, v) => opts.map(([val, lab]) => `<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`).join('');
  const parseElements = text => {
    const toks = String(text).split(/[\s,;–—/|-]+/).filter(Boolean), out = [];
    for (const t of toks) {
      let comp;
      try { comp = C.parse(t); } catch (e) { throw new Error(`“${t}” is not an element or formula.`); }
      Object.keys(comp).forEach(el => { if (!out.includes(el)) out.push(el); });
    }
    return out;
  };
  /* A formula in free text such as a table name ("ZnO absorbance", "Au NP diffractogram") */
  D.guessFormula = function (text) {
    for (const t of String(text || '').split(/[\s,;:()_]+/)) {
      if (!/^[A-Z]/.test(t) || (!/[a-z]/.test(t) && !/\d/.test(t))) continue;          // skips acronyms such as NP, XRD, UV
      if (/^(In|As|At|Be|He|No|Am|Ho|Es|Cm|Pa)$/.test(t)) continue;                     // English words that are element symbols
      try { const c = C.parse(t); if (Object.keys(c).length <= 5) return t; } catch (e) { /* not a formula */ }
    }
    return '';
  };
  function drawChart(host, build, name) {
    const W = Math.max(300, Math.round(host.clientWidth || 640)), H = Math.round(Math.min(420, Math.max(240, W * 0.5)));
    host.innerHTML = build(P.screen(), W, H).svg;
    const bar = host.previousElementSibling;
    if (bar) $$('[data-f]', bar).forEach(b => b.onclick = () => U.exportFigure(build, name, b.dataset.f));
  }
  const chartBox = title => `<div class="cbox"><div class="cbar"><h4>${esc(title)}</h4><div class="exp"><button class="btn small ghost" data-f="png-free">PNG</button><button class="btn small ghost" data-f="svg">SVG <span class="lock">PRO</span></button><button class="btn small ghost" data-f="png">600 dpi <span class="lock">PRO</span></button></div></div><div class="chart-host"></div></div>`;

  /* ================= entry points ================= */
  D.views = VIEWS;
  D.init = a => { api = a; };
  D.open = function (view, ctx) {
    Object.assign(st[view], ctx || {});
    if (view === 'phase' && ctx && ctx.source) st.phase.res = null;
    api.select('discover', view);
  };
  D.render = function (main, view, a) {
    api = a;
    const v = VIEWS[view] || VIEWS.search;
    main.innerHTML = `<div class="view-head"><div><p class="crumb">Discover</p><h2>${esc(v.title)}</h2><p class="sub">${esc(v.sub)}</p></div></div><div id="dsc"></div>`;
    const host = $('#dsc', main);
    if (view === 'phase') renderPhase(host);
    else if (view === 'gen') renderGen(host);
    else renderSearch(host);
  };

  /* ================= 3D structure viewer ================= */
  const JMOL = { H: 'FFFFFF', He: 'D9FFFF', Li: 'CC80FF', Be: 'C2FF00', B: 'FFB5B5', C: '909090', N: '3050F8', O: 'FF0D0D', F: '90E050', Ne: 'B3E3F5', Na: 'AB5CF2', Mg: '8AFF00', Al: 'BFA6A6', Si: 'F0C8A0', P: 'FF8000', S: 'FFFF30', Cl: '1FF01F', Ar: '80D1E3', K: '8F40D4', Ca: '3DFF00', Sc: 'E6E6E6', Ti: 'BFC2C7', V: 'A6A6AB', Cr: '8A99C7', Mn: '9C7AC7', Fe: 'E06633', Co: 'F090A0', Ni: '50D050', Cu: 'C88033', Zn: '7D80B0', Ga: 'C28F8F', Ge: '668F8F', As: 'BD80E3', Se: 'FFA100', Br: 'A62929', Kr: '5CB8D1', Rb: '702EB0', Sr: '00FF00', Y: '94FFFF', Zr: '94E0E0', Nb: '73C2C9', Mo: '54B5B5', Tc: '3B9E9E', Ru: '248F8F', Rh: '0A7D8C', Pd: '006985', Ag: 'C0C0C0', Cd: 'FFD98F', In: 'A67573', Sn: '668080', Sb: '9E63B5', Te: 'D47A00', I: '940094', Xe: '429EB0', Cs: '57178F', Ba: '00C900', La: '70D4FF', Ce: 'FFFFC7', Pr: 'D9FFC7', Nd: 'C7FFC7', Pm: 'A3FFC7', Sm: '8FFFC7', Eu: '61FFC7', Gd: '45FFC7', Tb: '30FFC7', Dy: '1FFFC7', Ho: '00FF9C', Er: '00E675', Tm: '00D452', Yb: '00BF38', Lu: '00AB24', Hf: '4DC2FF', Ta: '4DA6FF', W: '2194D6', Re: '267DAB', Os: '266696', Ir: '175487', Pt: 'D0D0E0', Au: 'FFD123', Hg: 'B8B8D0', Tl: 'A6544D', Pb: '575961', Bi: '9E4FB5', Po: 'AB5C00', At: '754F45', Rn: '428296', Fr: '420066', Ra: '007D00', Ac: '70ABFA', Th: '00BAFF', Pa: '00A1FF', U: '008FFF', Np: '0080FF', Pu: '006BFF' };
  const atomColor = el => '#' + (JMOL[el] || '9AA1AE');
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  const anionLike = el => C.BY[el] && C.BY[el].ox.some(q => q < 0);

  D.viewer = function (canvas, s) {
    const L = s.lattice, fr = X.fractional(L, s.positions), cart = f => [0, 1, 2].map(j => f[0] * L[0][j] + f[1] * L[1][j] + f[2] * L[2][j]);
    const atoms = [];
    fr.forEach((f0, i) => {
      const f = f0.map(v => (v > 0.985 ? v - 1 : v)), el = sym(s.species[i]);
      const sh = f.map(v => (Math.abs(v) < 0.015 ? [0, 1] : [0]));
      for (const a of sh[0]) for (const b of sh[1]) for (const c of sh[2]) atoms.push({ el, p: cart([f[0] + a, f[1] + b, f[2] + c]) });
    });
    const rad = el => ((C.BY[el] && C.BY[el].rad) || 140) / 100;
    const metallic = !atoms.some(a => anionLike(a.el));
    atoms.forEach(a => { a.r = metallic ? 0.42 * rad(a.el) : 0.2 + 0.24 * rad(a.el); });
    const bonds = [];
    if (atoms.length <= 900) for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j];
      if (!anionLike(A.el) && !anionLike(B.el)) continue;
      const d = Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
      if (d > 0.4 && d < 1.15 * (rad(A.el) + rad(B.el))) bonds.push([i, j]);
    }
    const corners = [];
    for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) corners.push({ f: [a, b, c], p: cart([a, b, c]) });
    const edges = [];
    corners.forEach((u, i) => corners.forEach((v, j) => { if (j > i && u.f.reduce((s2, x, k) => s2 + Math.abs(x - v.f[k]), 0) === 1) edges.push([i, j]); }));
    const ctr = cart([0.5, 0.5, 0.5]);
    const Rmax = Math.max(...corners.map(c => Math.hypot(c.p[0] - ctr[0], c.p[1] - ctr[1], c.p[2] - ctr[2])), ...atoms.map(a => Math.hypot(a.p[0] - ctr[0], a.p[1] - ctr[1], a.p[2] - ctr[2]) + a.r));
    const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
    const rotX = t => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
    const rotY = t => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
    const home = () => mul(rotX(0.32), rotY(-0.62));
    let R = home();
    const proj = (p, cx, cy, sc) => { const q = [0, 1, 2].map(i => R[i][0] * (p[0] - ctr[0]) + R[i][1] * (p[1] - ctr[1]) + R[i][2] * (p[2] - ctr[2])); return [cx + sc * q[0], cy - sc * q[1], q[2]]; };
    function draw() {
      const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const css = getComputedStyle(canvas), edgeC = css.getPropertyValue('--axis').trim() || '#9aa1ae', bondC = css.getPropertyValue('--ink-3').trim() || '#6b7385', ink = css.getPropertyValue('--ink-2').trim() || '#3c4559';
      const sc = 0.44 * Math.min(W, H) / Rmax, cx = W / 2, cy = H / 2;
      const P2 = atoms.map(a => proj(a.p, cx, cy, sc)), K2 = corners.map(c => proj(c.p, cx, cy, sc));
      g.lineWidth = 1.1; g.strokeStyle = edgeC;
      edges.forEach(([i, j]) => { g.beginPath(); g.moveTo(K2[i][0], K2[i][1]); g.lineTo(K2[j][0], K2[j][1]); g.stroke(); });
      const items = atoms.map((a, i) => ({ z: P2[i][2], i, atom: true })).concat(bonds.map(([i, j]) => ({ z: (P2[i][2] + P2[j][2]) / 2 - 0.01, i, j })));
      items.sort((a, b) => a.z - b.z);
      g.lineCap = 'round';
      for (const it of items) {
        if (!it.atom) { const A = P2[it.i], B = P2[it.j]; g.strokeStyle = bondC; g.lineWidth = Math.max(1.5, 0.13 * sc); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); continue; }
        const a = atoms[it.i], [x, y] = P2[it.i], r = Math.max(2.5, a.r * sc), col = atomColor(a.el);
        const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        grd.addColorStop(0, shade(col, 0.55)); grd.addColorStop(0.55, col); grd.addColorStop(1, shade(col, -0.35));
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.8; g.stroke();
      }
      /* axis triad: a red, b green, c blue */
      const ox0 = 30, oy0 = H - 30;
      ['a', 'b', 'c'].forEach((lab, k) => {
        const v = L[k], n = Math.hypot(...v), q = [0, 1, 2].map(i => (R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]) / n);
        const c2 = ['#d64545', '#2f9e44', '#3b6fd8'][k];
        g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = 2; g.beginPath(); g.moveTo(ox0, oy0); g.lineTo(ox0 + 20 * q[0], oy0 - 20 * q[1]); g.stroke();
        g.font = '600 11px Inter, sans-serif'; g.fillText(lab, ox0 + 25 * q[0] - 3, oy0 - 25 * q[1] + 4);
      });
      g.fillStyle = ink;
    }
    let drag = null;
    canvas.style.touchAction = 'none';
    canvas.onpointerdown = e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = e => { if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; R = mul(rotX(dy * 0.01), mul(rotY(dx * 0.01), R)); draw(); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    canvas.onkeydown = e => { const k = { ArrowLeft: [0, -0.15], ArrowRight: [0, 0.15], ArrowUp: [-0.15, 0], ArrowDown: [0.15, 0] }[e.key]; if (k) { e.preventDefault(); R = mul(rotX(k[0]), mul(rotY(k[1]), R)); draw(); } };
    const onTheme = () => { if (canvas.isConnected) draw(); else document.removeEventListener('bf:theme', onTheme); };
    document.addEventListener('bf:theme', onTheme);
    const ro = window.ResizeObserver ? new ResizeObserver(draw) : null;
    if (ro) ro.observe(canvas);
    draw();
    return {
      draw,
      reset() { R = home(); draw(); },
      /* look down lattice vector k with the next one pointing up */
      along(k) {
        const v = L[k], u0 = L[(k + 1) % 3], n = Math.hypot(...v), z = v.map(x => x / n);
        const d = u0[0] * z[0] + u0[1] * z[1] + u0[2] * z[2], up = u0.map((x, i) => x - d * z[i]), un = Math.hypot(...up), y = up.map(x => x / un);
        const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
        R = [x, y, z]; draw();
      },
      elements: [...new Set(atoms.map(a => a.el))],
      count: s.positions.length
    };
  };

  /* ================= materials database ================= */
  function renderSearch(host) {
    const s = st.search;
    host.innerHTML = `<form class="card dsc-form" id="ds-form" autocomplete="off">
        <div class="fg two"><div><label for="ds-q">Elements or formula</label><input type="text" id="ds-q" value="${esc(s.q)}" placeholder="e.g. Zn O   or   Cu2ZnSnS4" spellcheck="false"></div>
        <div><span class="lbl2">Match</span>${seg('ds-mode', [['only', 'Only these elements'], ['all', 'Contains these'], ['formula', 'Exact formula']], s.mode)}</div></div>
        <div class="fg three"><div><label for="ds-hull">Stability (energy above the convex hull)</label><select id="ds-hull">${options([['0', 'Stable only (0 eV/atom)'], ['0.025', '≤ 0.025 eV/atom'], ['0.05', '≤ 0.05 eV/atom (typical synthesisable)'], ['0.1', '≤ 0.1 eV/atom'], ['any', 'Any']], s.hull)}</select></div>
        <div><label for="ds-prov">Database</label><select id="ds-prov">${options(Object.entries(X.providers).map(([k, p]) => [k, 'Alexandria ' + p.short]), s.provider)}</select></div>
        <div class="ds-go"><button class="btn primary" type="submit"${s.busy ? ' disabled' : ''}>${s.busy ? 'Searching…' : 'Search'}</button></div></div>
        <div class="examples">Try <button type="button" data-ex="Zn O|only">Zn–O</button><button type="button" data-ex="Ti O|only">Ti–O</button><button type="button" data-ex="Li Fe P O|only">Li–Fe–P–O</button><button type="button" data-ex="Cs Pb I|only">Cs–Pb–I</button><button type="button" data-ex="GaN|formula">GaN</button><button type="button" data-ex="Cu2ZnSnS4|formula">Cu₂ZnSnS₄</button></div>
      </form><div id="ds-out"></div>`;
    const form = $('#ds-form', host);
    const read = () => { s.q = $('#ds-q', form).value.trim(); s.mode = ($('input[name=ds-mode]:checked', form) || {}).value || 'only'; s.hull = $('#ds-hull', form).value; s.provider = $('#ds-prov', form).value; };
    form.onsubmit = e => { e.preventDefault(); read(); doSearch(host); };
    $$('[data-ex]', form).forEach(b => b.onclick = () => { const [q, m] = b.dataset.ex.split('|'); $('#ds-q', form).value = q; $(`input[name=ds-mode][value=${m}]`, form).checked = true; read(); doSearch(host); });
    if (s.res) renderResults(host); else if (s.q && s.autorun) { s.autorun = false; doSearch(host); }
    else $('#ds-out', host).innerHTML = `<div class="card ds-intro"><p><b>What you get for every material:</b> its crystal structure in 3D, the conventional cell, the DFT formation energy, distance to the convex hull and band gap, a simulated powder XRD pattern with Miller indices, and a CIF file.</p><p class="hint">Data from the <a href="https://alexandria.icams.rub.de/" target="_blank" rel="noopener">Alexandria database</a> (Schmidt, Marques and co-workers, Ruhr University Bochum; CC BY 4.0), queried live from your browser over OPTIMADE. Nothing you type is sent anywhere else.</p></div>`;
  }
  async function doSearch(host) {
    const s = st.search, out = $('#ds-out', host);
    let o;
    try {
      if (!s.q) throw new Error('Type elements (e.g. Zn O) or a formula.');
      if (s.mode === 'formula') o = { formula: X.optimadeFormula(C.reduce(C.parse(s.q.replace(/\s+/g, '')))) };
      else {
        const els = parseElements(s.q);
        if (!els.length) throw new Error('Type at least one element.');
        if (s.mode === 'only' && els.length > 5) throw new Error('Use up to five elements for a chemical-system search.');
        o = { elements: els, only: s.mode === 'only' };
      }
    } catch (e) { out.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; return; }
    Object.assign(o, { maxHull: s.hull === 'any' ? null : +s.hull, provider: s.provider, limit: 100 });
    s.busy = true; const btn = $('#ds-form button[type=submit]', host); if (btn) { btn.disabled = true; btn.textContent = 'Searching…'; }
    out.innerHTML = `<div class="card ds-wait"><span class="spin"></span> Searching ${esc(X.providers[s.provider].name)}…</div>`;
    try {
      const r = await X.searchAll(o, 3);
      const full = o.elements ? o.elements.length : 0;
      /* compounds of the whole system first (ZnO before O₂ and Zn), then by stability */
      r.entries.sort((a, b) => ((b.nelements === full) - (a.nelements === full)) || (b.nelements - a.nelements) || (a.hull - b.hull) || (a.nsites - b.nsites));
      s.res = Object.assign(r, { provider: s.provider, label: s.q });
      s.sel = r.entries.length ? r.entries[0].id : null;
    } catch (e) {
      s.res = null;
      out.innerHTML = `<div class="card"><div class="err">${esc(/fetch|network|load failed/i.test(e.message) ? 'Could not reach the Alexandria database. Check your connection and try again.' : e.message)}</div></div>`;
    }
    s.busy = false; if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
    if (s.res) renderResults(host);
  }
  function renderResults(host) {
    const s = st.search, r = s.res, out = $('#ds-out', host);
    if (!r.entries.length) { out.innerHTML = `<div class="card"><p><b>No materials found</b> for ${esc(r.label)} at this stability cut-off.</p><p class="hint">Allow less stable entries, switch to the larger PBE database, or <button class="linkbtn" data-gen>generate candidates in this chemical system</button>.</p></div>`; const g = $('[data-gen]', out); if (g) g.onclick = () => { try { st.gen.els = parseElements(r.label).slice(0, 8); } catch (e) { /* keep */ } D.open('gen'); }; return; }
    out.innerHTML = `<div class="card ds-list"><div class="ds-meta"><b>${r.entries.length}${r.more ? '+' : ''} materials</b> <span>in ${esc(X.providers[r.provider].name)}${r.more ? ' · showing the first 300; tighten the stability cut-off to see the most relevant' : ''}</span></div>
      <div class="tbl-wrap"><table class="t ds-tab"><thead><tr><th class="l">Formula</th><th class="l">Space group</th><th class="l hide-sm">Crystal system</th><th>Atoms</th><th title="Energy above the convex hull">E<sub>hull</sub> <small>eV/atom</small></th><th class="hide-sm">E<sub>f</sub> <small>eV/atom</small></th><th>Gap <small>eV</small></th></tr></thead>
      <tbody>${r.entries.map(e => `<tr data-id="${esc(e.id)}" tabindex="0"${e.id === s.sel ? ' class="on"' : ''}><td class="l">${fhtml(e.formula)}</td><td class="l">${sgFull(e.spacegroup)}</td><td class="l hide-sm">${esc(cap(X.crystalSystem(e.spacegroup) || ''))}</td><td>${e.nsites}</td><td>${num(e.hull, 3)}</td><td class="hide-sm">${num(e.eform, 3)}</td><td>${num(e.gap, 2)}</td></tr>`).join('')}</tbody></table></div></div>
      <div id="ds-detail"></div>`;
    const pick = id => { s.sel = id; $$('tr[data-id]', out).forEach(tr => tr.classList.toggle('on', tr.dataset.id === id)); renderDetail($('#ds-detail', out)); };
    $$('tr[data-id]', out).forEach(tr => { tr.onclick = () => { pick(tr.dataset.id); $('#ds-detail', out).scrollIntoView({ behavior: 'smooth', block: 'start' }); }; tr.onkeydown = e => { if (e.key === 'Enter') tr.onclick(); }; });
    renderDetail($('#ds-detail', out));
  }
  function renderDetail(host) {
    const s = st.search, e = s.res && s.res.entries.find(x => x.id === s.sel);
    if (!e || !e.structure) { host.innerHTML = ''; return; }
    const conv = X.conventional(e.structure, e.spacegroup), cell = X.cell(conv.lattice);
    const lam = +s.lambda, tmax = lam < 1 ? 50 : 90, tmin = lam < 1 ? 4 : 10;
    const sim = X.xrd(e.structure, { sg: e.spacegroup, lambda: lam, tmin, tmax });
    const sys = X.crystalSystem(e.spacegroup);
    host.innerHTML = `<div class="card ds-det">
      <div class="ds-dh"><div><h3>${fhtml(e.formula)} <span class="sg">${sgFull(e.spacegroup)}</span></h3><p class="hint">${esc(cap(sys || ''))} · ${conv.positions.length} atoms in the ${conv.conventional ? 'conventional' : 'stored'} cell · ${esc(e.provider)} <span class="mono">${esc(e.id)}</span></p></div>
        <div class="acts"><button class="btn small" data-a="cif">Download CIF</button><button class="btn small" data-a="xrd">Add XRD pattern to project</button><button class="btn small" data-a="row">Add to comparison table</button></div></div>
      <div class="ds-grid"><div class="ds-view"><canvas tabindex="0" aria-label="Crystal structure of ${esc(pretty(e.formula))}; drag or use the arrow keys to rotate"></canvas>
          <div class="ds-vbar"><span class="els"></span><span class="axes"><span class="hint">View along</span><button data-ax="0">a</button><button data-ax="1">b</button><button data-ax="2">c</button><button data-ax="r" title="Reset view">↺</button></span></div></div>
        <div class="ds-props"><table class="t kv"><tbody>
          <tr><th class="l">a, b, c</th><td>${num(cell.a, 3)}, ${num(cell.b, 3)}, ${num(cell.c, 3)} Å</td></tr>
          <tr><th class="l">α, β, γ</th><td>${num(cell.alpha, 2)}°, ${num(cell.beta, 2)}°, ${num(cell.gamma, 2)}°</td></tr>
          <tr><th class="l">Volume</th><td>${num(cell.V, 2)} Å³</td></tr>
          <tr><th class="l">Formation energy</th><td>${num(e.eform, 3)} eV/atom</td></tr>
          <tr><th class="l">Above convex hull</th><td>${num(e.hull, 3)} eV/atom ${e.hull != null && e.hull <= 1e-4 ? '<span class="tag ok">stable</span>' : e.hull <= 0.05 ? '<span class="tag">metastable</span>' : ''}</td></tr>
          <tr><th class="l">Band gap (DFT)</th><td>${e.gap == null ? '–' : num(e.gap, 3) + ' eV' + (e.gap > 0 ? (e.gapDirect != null ? ` (direct gap ${num(e.gapDirect, 3)} eV)` : '') : ' (metallic)')}</td></tr>
          ${e.magnetization ? `<tr><th class="l">Magnetisation</th><td>${num(e.magnetization, 2)} μ<sub>B</sub>/cell</td></tr>` : ''}
        </tbody></table>
        <p class="hint">${esc(X.providers[s.res.provider].note)} ${conv.conventional ? 'Cell symmetrised to its crystal system before the XRD simulation.' : ''}</p></div></div>
      <div class="ds-xrd">${chartBox('Simulated powder pattern')}<div class="ds-xrdbar"><label>Radiation <select data-lam>${options(Object.entries(LAMBDA).map(([k, v]) => [k, `${v} (${k} Å)`]), s.lambda)}</select></label></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>2θ (°)</th><th>d (Å)</th><th>hkl</th><th>I (rel.)</th></tr></thead><tbody>${sim.filter(p => p.rel >= 2).slice(0, 14).map(p => `<tr><td>${num(p.tt, 2)}</td><td>${num(p.d, 4)}</td><td class="mono">${p.hkl.map(v => (v < 0 ? `<span class="ob">${-v}</span>` : v)).join(' ')}</td><td>${num(p.rel, 1)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Peak positions are exact for this DFT cell; intensities use approximate scattering factors and an isotropic Debye–Waller factor, so treat them as a guide.</p></div></div>`;
    const v = D.viewer($('canvas', host), conv);
    $('.els', host).innerHTML = v.elements.map(el => `<span class="chip"><i style="background:${atomColor(el)}"></i>${esc(el)}</span>`).join('');
    $$('[data-ax]', host).forEach(b => b.onclick = () => (b.dataset.ax === 'r' ? v.reset() : v.along(+b.dataset.ax)));
    const name = (pretty(e.formula) + '-' + e.spacegroup).replace(/[^\w-]+/g, '_');
    drawChart($('.ds-xrd .chart-host', host), (T, W, H) => P.xy({ x: { label: `2θ (°), ${LAMBDA[s.lambda]}`, min: tmin, max: tmax, zero: false }, y: { label: 'Intensity (relative)', min: 0 }, series: [{ name: pretty(e.formula), ci: 0, asLine: true, width: 1.3, points: X.profile(sim, tmin, tmax, 0.12).map(([x, y]) => ({ x, y })) }] }, T, W, H), name + '-xrd');
    $('[data-lam]', host).onchange = ev => { s.lambda = ev.target.value; renderDetail(host); };
    $('[data-a=cif]', host).onclick = () => U.download(name + '.cif', 'chemical/x-cif', X.cif(e, conv));
    $('[data-a=xrd]', host).onclick = () => {
      const prof = X.profile(sim, tmin, tmax, 0.1);
      const t = api.newTable({ type: 'xy', name: `${pretty(e.formula)} ${X.sgText(e.spacegroup)} simulated XRD`, cols: ['2θ (°)', 'Intensity (simulated)'], rows: prof.map(([x, y]) => [x.toFixed(3), y.toFixed(3)]), ylabel: 'Intensity (relative)' });
      U.toast('Added “' + t.name + '” to your project.', 'ok');
    };
    $('[data-a=row]', host).onclick = () => {
      const nm = 'Materials from Alexandria';
      let t = api.findTable(nm);
      if (!t) t = api.newTable({ type: 'mv', name: nm, cols: ['Material', 'Space group', 'E hull (eV/atom)', 'E form (eV/atom)', 'Band gap (eV)', 'Atoms per cell', 'Entry'], rows: [] });
      t.rows.push([pretty(e.formula) + ' ' + X.sgSymbol(e.spacegroup), String(e.spacegroup), num(e.hull, 4), num(e.eform, 4), num(e.gap, 3), String(e.nsites), e.id]);
      api.touch(t);
      U.toast(`Added ${pretty(e.formula)} to “${nm}”.`, 'ok');
    };
  }

  /* ================= phase identification ================= */
  function parsePeaks(text) {
    const pk = [];
    String(text).split(/\n/).forEach(line => { const v = line.trim().split(/[\s,;\t]+/).map(Number); if (v.length >= 1 && isFinite(v[0]) && v[0] > 2 && v[0] < 170) pk.push({ tt: v[0], rel: isFinite(v[1]) && v[1] > 0 ? v[1] : 100 }); });
    const mx = Math.max(...pk.map(p => p.rel), 1);
    return pk.map(p => ({ tt: p.tt, rel: 100 * p.rel / mx })).sort((a, b) => a.tt - b.tt);
  }
  function renderPhase(host) {
    const s = st.phase, srcs = api.xrdSources();
    if (!s.source || (s.source !== 'paste' && !srcs.some(x => x.key === s.source))) s.source = srcs.length ? srcs[0].key : 'paste';
    const src = srcs.find(x => x.key === s.source);
    if (!s.els && src) s.els = D.guessFormula(src.name);
    if (!s.lambda) s.lambda = src && LAMBDA[String(src.lambda)] ? String(src.lambda) : '1.5406';
    host.innerHTML = `<form class="card dsc-form" id="ph-form" autocomplete="off">
      <div class="fg two"><div><label for="ph-src">Measured pattern</label><select id="ph-src">${srcs.map(x => `<option value="${esc(x.key)}"${x.key === s.source ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}<option value="paste"${s.source === 'paste' ? ' selected' : ''}>Paste a peak list…</option></select>
        <small>${srcs.length ? 'Peaks come from your peak analysis, or are found automatically in an XY table.' : 'Add an XRD table to your project, or paste the peak list.'}</small></div>
        <div><label for="ph-els">Elements that may be present</label><input type="text" id="ph-els" value="${esc(s.els)}" placeholder="e.g. Au   or   Zn O" spellcheck="false"><small>Up to five. Every compound of these elements in the database is considered.</small></div></div>
      <div class="fg" ${s.source === 'paste' ? '' : 'hidden'} id="ph-paste-row"><label for="ph-paste">Peaks: 2θ and relative intensity, one per line</label><textarea id="ph-paste" placeholder="38.18  100&#10;44.39  47&#10;64.58  26&#10;77.55  28">${esc(s.paste)}</textarea></div>
      <div class="fg three"><div><label for="ph-lam">Radiation</label><select id="ph-lam">${options(Object.entries(LAMBDA).map(([k, v]) => [k, `${v} (${k} Å)`]), s.lambda)}</select></div>
        <div><label for="ph-prov">Database</label><select id="ph-prov">${options(Object.entries(X.providers).map(([k, p]) => [k, 'Alexandria ' + p.short]), s.provider)}</select></div>
        <div class="ds-go"><button class="btn primary" type="submit"${s.busy ? ' disabled' : ''}>${s.busy ? 'Matching…' : 'Identify phases'}</button></div></div>
    </form><div id="ph-out"></div>`;
    const form = $('#ph-form', host);
    const read = () => { s.source = $('#ph-src', form).value; s.els = $('#ph-els', form).value.trim(); s.lambda = $('#ph-lam', form).value; s.provider = $('#ph-prov', form).value; s.paste = $('#ph-paste', form).value; };
    $('#ph-src', form).onchange = () => { read(); const x = srcs.find(y => y.key === s.source); $('#ph-paste-row', form).hidden = s.source !== 'paste'; if (x) { const g = D.guessFormula(x.name); if (g && !$('#ph-els', form).value) $('#ph-els', form).value = g; if (LAMBDA[String(x.lambda)]) $('#ph-lam', form).value = String(x.lambda); } };
    form.onsubmit = e => { e.preventDefault(); read(); runPhase(host, srcs); };
    if (s.res) renderPhaseResults(host);
    else $('#ph-out', host).innerHTML = `<div class="card ds-intro"><p><b>How it works.</b> Lattent fetches every computed structure of your elements from Alexandria, symmetrises each cell, simulates its powder pattern and scores the match to your peaks: how much of the reference intensity your peaks cover, and how much of your intensity the reference explains. Each candidate gets a uniform lattice scale (±4%), because DFT lattices differ from experiment by 1–2%.</p><p class="hint">This screens the database; it is not a Rietveld refinement. A phase that is missing from the database cannot be found, and strong texture or overlapping nanocrystalline peaks lower the scores.</p></div>`;
  }
  async function runPhase(host, srcs) {
    const s = st.phase, out = $('#ph-out', host);
    let meas, els;
    try {
      if (s.source === 'paste') { meas = { peaks: parsePeaks(s.paste), profile: null, name: 'Pasted peaks' }; }
      else { const x = srcs.find(y => y.key === s.source); const r = x.get(); if (r.error) throw new Error(r.error); meas = Object.assign(r, { name: x.name }); }
      if (meas.peaks.length < 2) throw new Error('At least two peaks are needed.');
      els = parseElements(s.els);
      if (!els.length) throw new Error('List the elements that may be present (e.g. Zn O).');
      if (els.length > 5) throw new Error('Use up to five elements.');
    } catch (e) { out.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; return; }
    s.busy = true; const btn = $('#ph-form button[type=submit]', host); if (btn) { btn.disabled = true; btn.textContent = 'Matching…'; }
    out.innerHTML = `<div class="card ds-wait"><span class="spin"></span> Fetching ${esc(els.join('–'))} structures and simulating their patterns…</div>`;
    try {
      const lam = +s.lambda;
      const r = await X.identify(meas.peaks, els, { provider: s.provider, lambda: lam });
      s.res = { rows: r.rows.slice(0, 30), searched: r.searched, more: r.more, meas, els, lambda: lam, provider: s.provider, second: X.secondPhase(meas.peaks, r.rows, { lambda: lam }) };
      s.sel = 0;
    } catch (e) { s.res = null; out.innerHTML = `<div class="card"><div class="err">${esc(/fetch|network|load failed/i.test(e.message) ? 'Could not reach the Alexandria database. Check your connection and try again.' : e.message)}</div></div>`; }
    s.busy = false; if (btn) { btn.disabled = false; btn.textContent = 'Identify phases'; }
    if (s.res) renderPhaseResults(host);
  }
  function renderPhaseResults(host) {
    const s = st.phase, r = s.res, out = $('#ph-out', host);
    if (!r.rows.length) { out.innerHTML = `<div class="card"><p><b>No match.</b> None of the ${r.searched} ${esc(r.els.join('–'))} structures explains these peaks.</p><p class="hint">Check the elements and the radiation, or try the other database.</p></div>`; return; }
    r.rows.forEach(x => { if (x.nExpl == null) x.nExpl = X.assign(r.meas.peaks, x.sim, x.fit.scale, { lambda: r.lambda }).filter(a => a.ref).length; });
    const top = r.rows[0], shift = sc => `${sc < 1 ? '−' : '+'}${Math.abs((sc - 1) * 100).toFixed(1)}%`;
    const verdict = top.fit.score >= 0.85 ? 'Strong match' : top.fit.score >= 0.65 ? 'Plausible match' : 'Weak match';
    const sec = r.second;
    out.innerHTML = `<div class="card res"><div class="verdict"><b>${verdict}: ${fhtml(top.formula)}, ${X.sgHTML(top.spacegroup)}</b> (${esc(X.crystalSystem(top.spacegroup))}), score ${top.fit.score.toFixed(2)}. ${top.nExpl === r.meas.peaks.length ? 'All' : top.nExpl + ' of'} ${r.meas.peaks.length} measured peaks explained; your lattice is ${shift(top.fit.scale)} relative to the DFT cell${r.provider === 'pbe' && top.fit.scale < 1 ? ', as expected because PBE overestimates lattice constants' : ''}.
        ${sec ? (sec.best ? `<br>Peaks carrying ${(sec.share * 100).toFixed(0)}% of your intensity are not explained by it; they match <b>${fhtml(sec.best.row.formula)}, ${X.sgHTML(sec.best.row.spacegroup)}</b> (score ${sec.best.fit.score.toFixed(2)}), so a second phase is likely.` : `<br>${sec.unexplained.length} peaks (${(sec.share * 100).toFixed(0)}% of your intensity) are not explained; a second phase, an impurity or a structure missing from the database may be present.`) : ''}</div>
      <div class="tbl-wrap"><table class="t ph-tab"><thead><tr><th>#</th><th class="l">Phase</th><th class="l">Match</th><th>Peaks explained</th><th title="Your lattice relative to the DFT cell">Lattice vs DFT</th><th>E<sub>hull</sub> <small>eV/atom</small></th></tr></thead>
      <tbody>${r.rows.map((x, i) => `<tr data-i="${i}" tabindex="0"${i === s.sel ? ' class="on"' : ''}><td>${i + 1}</td><td class="l">${fhtml(x.formula)} <span class="sg">${sgFull(x.spacegroup)}</span>${x.copies > 1 ? ` <small class="hint">${x.copies} entries</small>` : ''}</td><td class="l"><span class="wbar"><i style="width:${(x.fit.score * 100).toFixed(0)}%"></i></span>${x.fit.score.toFixed(2)}</td><td>${x.nExpl} / ${r.meas.peaks.length}</td><td>${shift(x.fit.scale)}</td><td>${num(x.hull, 3)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">${r.searched} structures of ${esc(r.els.join(', '))} compared${r.more ? ' (the first 400 in the database’s order; use fewer elements to cover the whole system)' : ''}. Score = √(reference intensity covered × measured intensity explained).</p>
      <div id="ph-sel"></div></div>`;
    $$('tr[data-i]', out).forEach(tr => { tr.onclick = () => { s.sel = +tr.dataset.i; $$('tr[data-i]', out).forEach(t2 => t2.classList.toggle('on', t2 === tr)); renderPhaseSel($('#ph-sel', out)); }; tr.onkeydown = e => { if (e.key === 'Enter') tr.onclick(); }; });
    renderPhaseSel($('#ph-sel', out));
  }
  function renderPhaseSel(host) {
    const s = st.phase, r = s.res, x = r.rows[s.sel];
    if (!x) { host.innerHTML = ''; return; }
    const lam = r.lambda, rad = Math.PI / 180;
    const ref = x.sim.map(p => { const v = lam / (2 * p.d * x.fit.scale); return v < 1 ? Object.assign({}, p, { tt2: 2 * Math.asin(v) / rad }) : null; }).filter(Boolean);
    const as = X.assign(r.meas.peaks, x.sim, x.fit.scale, { lambda: lam });
    const t0 = Math.min(...r.meas.peaks.map(p => p.tt)) - 3, t1 = Math.max(...r.meas.peaks.map(p => p.tt)) + 3;
    const prof = r.meas.profile;
    let meas;
    if (prof) {
      const pts = prof.x.map((v, i) => ({ x: v, y: prof.y[i] })).filter(p => p.x >= t0 && p.x <= t1);
      const mx = Math.max(...pts.map(p => p.y), 1e-12);
      meas = pts.map(p => ({ x: p.x, y: 100 * p.y / mx }));
    } else meas = [].concat(...r.meas.peaks.map(p => [{ x: p.tt, y: 0 }, { x: p.tt, y: p.rel }, { x: p.tt, y: 0 }]));
    const sticks = [].concat(...ref.filter(p => p.tt2 >= t0 && p.tt2 <= t1 && p.rel >= 0.5).map(p => [{ x: p.tt2, y: 0 }, { x: p.tt2, y: -p.rel }, { x: p.tt2, y: 0 }]));
    host.innerHTML = `${chartBox(`Your pattern against ${pretty(x.formula)} ${X.sgText(x.spacegroup)}`)}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Measured 2θ (°)</th><th>I (rel.)</th><th>hkl</th><th>Reference 2θ (°)</th><th>Δ2θ (°)</th></tr></thead><tbody>${as.map(a => `<tr${a.ref ? '' : ' class="dim"'}><td>${num(a.m.tt, 2)}</td><td>${num(a.m.rel, 0)}</td><td class="mono">${a.ref ? a.ref.hkl.map(v => (v < 0 ? `<span class="ob">${-v}</span>` : v)).join(' ') : 'not explained'}</td><td>${a.ref ? num(a.ref.tt2, 2) : '–'}</td><td>${a.ref ? num(a.delta, 3).replace('-', '−') : '–'}</td></tr>`).join('')}</tbody></table></div>
      <div class="m-actions"><button class="btn small" data-open>Open in the materials database</button></div>`;
    drawChart($('.chart-host', host), (T, W, H) => P.xy({ x: { label: `2θ (°), ${LAMBDA[String(lam)] || lam + ' Å'}`, min: t0, max: t1, zero: false }, y: { label: 'Intensity (measured up, reference down)' }, legend: true,
      series: [{ name: r.meas.name || 'Measured', ci: 0, asLine: true, width: 1.3, points: meas }, { name: `${pretty(x.formula)} ${X.sgText(x.spacegroup)}, reference (lattice ${x.fit.scale < 1 ? '−' : '+'}${Math.abs((x.fit.scale - 1) * 100).toFixed(1)}%)`, ci: 1, asLine: true, width: 1.6, points: sticks }],
      hguides: [{ y: 0 }] }, T, W, H), 'phase-match');
    $('[data-open]', host).onclick = () => { Object.assign(st.search, { q: pretty(x.formula), mode: 'formula', hull: 'any', provider: r.provider, res: { entries: [x], more: false, provider: r.provider, label: pretty(x.formula) }, sel: x.id }); D.open('search'); };
  }

  /* ================= generative design ================= */
  let worker = null, seq = 0, info = null;
  const pending = new Map();
  function gen(op, o, onProgress) {
    if (!worker) {
      worker = new Worker(U.root + 'assets/js/gen-worker.js');
      worker.onmessage = e => { const m = e.data, p = pending.get(m.id); if (!p) return; if (m.progress != null) { if (p.onProgress) p.onProgress(m.progress); return; } pending.delete(m.id); if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error)); };
      worker.onerror = e => { pending.forEach(p => p.reject(new Error('The model could not load (' + (e.message || 'worker error') + ').'))); pending.clear(); worker = null; };
    }
    const id = ++seq;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, op, o }); });
  }
  const novelty = new Map();   // formula → entry | 'new' | 'error' | 'checking'
  function ptable(sel) {
    return `<div class="ptab" role="group" aria-label="Periodic table">${C.EL.map(e => {
      const f = e.block === 'f', row = f ? (e.period === 6 ? 9 : 10) : e.period, col = f ? e.z - (e.period === 6 ? 58 : 90) + 4 : e.group;
      return `<button type="button" data-el="${e.sym}" class="b-${e.block}" style="grid-row:${row};grid-column:${col}" aria-pressed="${sel.includes(e.sym)}" title="${e.sym} (Z = ${e.z})">${e.sym}</button>`;
    }).join('')}<span class="ptab-gap" style="grid-row:8;grid-column:1"></span></div>`;
  }
  function renderGen(host) {
    const s = st.gen, many = s.els.length > 5;
    host.innerHTML = `<form class="card dsc-form" id="gn-form" autocomplete="off">
      <div class="gn-pick"><div class="fg"><label for="gn-els">Chemical system</label><input type="text" id="gn-els" value="${esc(s.els.join(' '))}" placeholder="Click elements below, or type e.g. Cu Zn Sn S" spellcheck="false"><small>Generated formulas use only these elements. Leave empty to sample the whole periodic table.</small></div>
        <div class="ptab-wrap">${ptable(s.els)}</div></div>
      <div class="fg three"><div><label for="gn-nel">Elements per formula</label><select id="gn-nel"${s.requireAll && s.els.length && !many ? ' disabled' : ''}>${options([['', 'Any'], ['2', '2 (binary)'], ['3', '3 (ternary)'], ['4', '4 (quaternary)'], ['5', '5']], s.requireAll && s.els.length && !many ? String(s.els.length) : s.nel)}</select></div>
        <div><label for="gn-gap">Target band gap (DFT/PBE, eV)</label><input type="number" id="gn-gap" value="${esc(s.gap)}" min="0" max="8" step="0.1" placeholder="none"><small>PBE gaps run 30–50% below measured ones; for a 1.5 eV absorber aim near 0.8–1 eV.</small></div>
        <div><label for="gn-n">Samples</label><select id="gn-n">${options([['200', '200 (fast)'], ['400', '400'], ['800', '800 (thorough)']], s.n)}</select></div></div>
      <div class="fg three"><div><label for="gn-temp">Exploration</label><select id="gn-temp">${options([['0.8', 'Focused'], ['1', 'Balanced'], ['1.25', 'Exploratory']], s.temp)}</select></div>
        <div class="checkcol"><label class="check"><input type="checkbox" id="gn-all"${s.requireAll ? ' checked' : ''}${many ? ' disabled' : ''}> Every formula uses all selected elements</label><label class="check"><input type="checkbox" id="gn-inter"${s.inter ? ' checked' : ''}> Include intermetallics</label></div>
        <div class="ds-go"><button class="btn primary" type="submit"${s.busy ? ' disabled' : ''}>${s.busy ? 'Generating…' : 'Generate'}</button></div></div>
      <div class="examples">Try <button type="button" data-ex="Cu Zn Sn S|">Cu–Zn–Sn–S (kesterites)</button><button type="button" data-ex="Li Fe P O|">Li–Fe–P–O (cathodes)</button><button type="button" data-ex="Ba Ti O|">Ba–Ti–O</button><button type="button" data-ex="Cs Pb Br|2">Cs–Pb–Br, 2 eV</button><button type="button" data-ex="Zn Ga O|3">Zn–Ga–O, 3 eV</button></div>
      <div class="prog" ${s.busy ? '' : 'hidden'}><i style="width:${(s.progress * 100).toFixed(0)}%"></i></div>
    </form>
    <div id="gn-out"></div>
    <div class="card gn-pred"><h3>Predict properties of your own formulas</h3><p class="hint">One formula per line. Uses the same property networks as the generator.</p>
      <div class="gn-pred-row"><textarea id="gn-pt" placeholder="ZnO&#10;Cu2ZnSnS4&#10;CsPbBr3">${esc(s.predText)}</textarea><button class="btn" id="gn-pb">Predict</button></div><div id="gn-pout"></div></div>
    <details class="card gn-how"><summary>How the generator works, and its limits</summary><div id="gn-how"></div></details>`;
    const form = $('#gn-form', host);
    const syncEls = els => { s.els = els.slice(0, 12); renderGen(host); };
    $$('[data-el]', form).forEach(b => b.onclick = () => { const el = b.dataset.el; syncEls(s.els.includes(el) ? s.els.filter(x => x !== el) : s.els.concat(el)); });
    $('#gn-els', form).onchange = e => { try { syncEls(parseElements(e.target.value)); } catch (err) { U.toast(err.message); } };
    const read = () => { s.nel = $('#gn-nel', form).disabled ? s.nel : $('#gn-nel', form).value; s.gap = $('#gn-gap', form).value; s.n = $('#gn-n', form).value; s.temp = $('#gn-temp', form).value; s.requireAll = $('#gn-all', form).checked; s.inter = $('#gn-inter', form).checked; };
    $('#gn-all', form).onchange = () => { read(); renderGen(host); };
    $$('[data-ex]', form).forEach(b => b.onclick = () => { const [els, g] = b.dataset.ex.split('|'); s.els = els.split(' '); s.gap = g; s.requireAll = true; renderGen(host); runGen(host); });
    form.onsubmit = e => { e.preventDefault(); read(); runGen(host); };
    $('#gn-pb', host).onclick = () => { s.predText = $('#gn-pt', host).value; runPredict(host); };
    if (s.res) renderGenResults(host);
    if (s.pred) renderPred(host);
    $('.gn-how', host).ontoggle = e => { if (e.target.open) renderHow(host); };
  }
  async function renderHow(host) {
    const el = $('#gn-how', host);
    el.innerHTML = '<p class="hint"><span class="spin"></span> Loading the models (2.6 MB, once)…</p>';
    try { info = info || await gen('info'); } catch (e) { el.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const m = info.metrics;
    el.innerHTML = `<p><b>Generate.</b> A masked discrete-diffusion model writes a formula as five (element, count) slots. It starts fully masked and, over ten denoising steps, fills in the slots it is most confident about, the same idea that MatterGen uses for atom types. Classifier-free guidance steers it towards a band gap and a number of elements, and the chemical system is enforced exactly. It was trained on ${info.nTrain.toLocaleString()} compositions with negative formation energy from the Materials Project.</p>
      <p><b>Screen.</b> Two networks predict, from composition alone, the formation energy of the most stable polymorph (test MAE ${m.eform.mae.toFixed(3)} eV/atom on ${m.eform.n_test.toLocaleString()} unseen compositions, R² ${m.eform.r2.toFixed(2)}) and the DFT band gap (MAE ${m.gap.mae.toFixed(2)} eV, R² ${m.gap.r2.toFixed(2)}). Every prediction carries a 90% conformal interval (±${m.interval.eform.q.toFixed(2)} eV/atom for formation energy; ±${m.interval.gap.bins[0].q.toFixed(1)} to ±${m.interval.gap.bins[2].q.toFixed(1)} eV for the gap, wider for semiconductors and insulators). Candidates must be charge-balanced with common oxidation states and have negative predicted formation energy; they are ranked by predicted stability and distance from the target gap.</p>
      <p><b>Verify.</b> Each candidate is looked up in Alexandria (5.8 million DFT structures). “Not in Alexandria” means nobody has computed it there, so it is a lead for a DFT calculation, not a discovery.</p>
      <p class="hint">Limits: this works at the level of composition, not crystal structure. Predicted gaps are PBE-like and typically 30–50% below experiment. A negative formation energy does not mean the compound is stable against competing phases; only a convex-hull calculation can show that. Everything runs in your browser; nothing is uploaded. Data: Materials Project via Matbench (CC BY 4.0).</p>`;
  }
  async function runGen(host) {
    const s = st.gen, out = $('#gn-out', host);
    const many = s.els.length > 5, all = s.requireAll && s.els.length > 0 && !many;
    const o = { n: +s.n || 400, allowed: s.els.length ? s.els : null, nel: all ? s.els.length : (s.nel ? +s.nel : null), gap: s.gap === '' || !isFinite(+s.gap) ? null : Math.max(0, +s.gap), requireAll: all, allowIntermetallic: s.inter, temp: +s.temp || 1, seed: 1 + Math.floor(Math.random() * 1e6) };
    s.busy = true; s.progress = 0;
    const btn = $('#gn-form button[type=submit]', host), bar = $('#gn-form .prog', host);
    if (btn) { btn.disabled = true; btn.textContent = info ? 'Generating…' : 'Loading models…'; }
    if (bar) { bar.hidden = false; $('i', bar).style.width = '2%'; }
    try {
      const res = await gen('design', o, p => { s.progress = p; if (bar) $('i', bar).style.width = (p * 100).toFixed(0) + '%'; if (btn) btn.textContent = 'Generating… ' + (p * 100).toFixed(0) + '%'; });
      s.res = Object.assign(res, { o, at: Date.now() });
    } catch (e) { s.res = null; out.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; }
    s.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
    if (bar) bar.hidden = true;
    if (s.res) { renderGenResults(host); checkNovelty(host); }
  }
  function noveltyCell(c) {
    const n = novelty.get(c.formula);
    if (!n || n === 'checking') return '<span class="hint">checking…</span>';
    if (n === 'error') return '<span class="hint">could not check</span>';
    if (n === 'new') return '<span class="tag new">Not in Alexandria</span>';
    return `<button class="linkbtn" data-db="${esc(c.formula)}">Known</button> <small class="hint">${X.sgHTML(n.spacegroup)}, ${n.hull <= 1e-4 ? 'stable' : num(n.hull, 3) + ' eV above hull'}</small>`;
  }
  function renderGenResults(host) {
    const s = st.gen, r = s.res, out = $('#gn-out', host), o = r.o, list = r.candidates.slice(0, 40);
    if (!list.length) { out.innerHTML = `<div class="card"><p><b>No candidates passed the screen.</b> ${r.sampled} formulas were sampled (${r.unique} distinct), but none was both charge-balanced and predicted to have a negative formation energy.</p><p class="hint">Allow intermetallics, change the number of elements, or add an anion such as O, S or N.</p></div>`; return; }
    out.innerHTML = `<div class="card res"><div class="ds-meta"><b>${r.candidates.length} candidates</b> <span>from ${r.sampled} sampled formulas (${r.unique} distinct) in ${(r.ms / 1000).toFixed(1)} s, ranked by predicted stability${o.gap != null ? ` and closeness to ${o.gap} eV` : ''}${r.candidates.length > 40 ? '; top 40 shown' : ''}</span>
        <span class="sp"></span><button class="btn small" data-add>Add to project</button></div>
      <div class="tbl-wrap"><table class="t gn-tab"><thead><tr><th>#</th><th class="l">Formula</th><th title="Predicted formation energy of the most stable polymorph">E<sub>f</sub> <small>eV/atom</small></th><th>Gap <small>eV</small></th><th class="l hide-sm">Oxidation states</th><th class="hide-sm" title="How often the model proposed it">Seen</th><th class="l">Database</th></tr></thead>
      <tbody>${list.map((c, i) => `<tr data-f="${esc(c.formula)}"><td>${i + 1}</td><td class="l"><b>${fhtml(c.formula)}</b> <button type="button" class="linkbtn why-b" data-why="${i}" aria-expanded="false">Why?</button></td><td>${num(c.eform, 2)}${pmv(c.eformPm)}</td><td>${num(c.gap, 2)}${pmv(c.gapPm)}</td><td class="l hide-sm">${c.cb.balanced ? ox(c.cb.states) : '<span class="hint">intermetallic</span>'}</td><td class="hide-sm">${c.count}×</td><td class="l nov">${noveltyCell(c)}</td></tr><tr class="gn-why" data-wr="${i}" hidden><td colspan="7"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Predictions from composition alone. The ± values are 90% prediction intervals, calibrated on 9,511 compositions the networks never saw: about 9 in 10 true values fall inside. Use them to choose what to calculate or synthesise next, not as results.</p></div>`;
    wireNovelty(out);
    $$('[data-why]', out).forEach(b => b.onclick = () => {
      const i = +b.dataset.why, row = $(`tr[data-wr="${i}"]`, out), open = row.hidden;
      row.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Hide' : 'Why?';
      if (open) explain(list[i], i, r, $('td', row));
    });
    $('[data-add]', out).onclick = () => {
      const nm = 'Generated ' + (o.allowed ? o.allowed.join('–') : 'materials') + (o.gap != null ? ` (${o.gap} eV)` : '');
      const t = api.newTable({ type: 'mv', name: nm, cols: ['Formula', 'Pred. E form (eV/atom)', 'Pred. band gap (eV)', 'Oxidation states', 'Times sampled', 'Alexandria'], rows: r.candidates.map(c => { const n = novelty.get(c.formula); return [c.formula, c.eform.toFixed(3), c.gap.toFixed(3), c.cb.balanced ? oxText(c.cb.states) : 'intermetallic', String(c.count), !n || n === 'checking' || n === 'error' ? '' : n === 'new' ? 'not found' : `SG ${n.spacegroup}, ${num(n.hull, 3)} eV/atom above hull`]; }) });
      U.toast('Added “' + t.name + '” to your project.', 'ok');
    };
  }
  /* "Why this candidate?": the generator's evidence for one formula, plus an estimate of its
     distance from the known convex hull built from Alexandria's stable phases of the same system. */
  const hullPhases = new Map();   // chemical system → Promise<[{name, x, e}]>
  function stablePhases(els) {
    const k = els.slice().sort().join('-');
    if (!hullPhases.has(k)) hullPhases.set(k, X.searchAll({ elements: els, only: true, maxHull: 0.001, provider: 'pbe', limit: 100, light: true }, 4).then(r => {
      const m = new Map();
      r.entries.forEach(e => { if (!isFinite(e.eform)) return; let comp; try { comp = C.parse(e.formula); } catch (err) { return; } if (Object.keys(comp).length < 2) return; if (!m.has(e.formula) || e.eform < m.get(e.formula).e) m.set(e.formula, { name: e.formula, x: C.fractions(comp), e: e.eform }); });
      return { phases: [...m.values()], more: r.more };
    }).catch(err => { hullPhases.delete(k); throw err; }));
    return hullPhases.get(k);
  }
  async function explain(c, i, r, td) {
    const o = r.o, els = Object.keys(c.comp), share = c.count / r.sampled;
    const gapLine = o.gap == null ? `<li><b>Band gap.</b> No target was set; the predicted PBE gap is ${num(c.gap, 2)} ± ${num(c.gapPm, 2)} eV.</li>`
      : `<li><b>Band gap.</b> Predicted ${num(c.gap, 2)} ± ${num(c.gapPm, 2)} eV against your target of ${o.gap} eV: ${Math.abs(c.gap - o.gap) <= c.gapPm ? 'the target lies inside the 90% interval' : `${num(Math.abs(c.gap - o.gap), 2)} eV off, outside the 90% interval`}.</li>`;
    td.innerHTML = `<div class="gn-whyp"><h4>Why ${fhtml(c.formula)} is on the list</h4><ol>
      <li><b>Proposed by the generator.</b> The diffusion model wrote this formula ${c.count} time${c.count === 1 ? '' : 's'} in ${r.sampled} samples (${(share * 100).toFixed(1)}%)${o.allowed ? ` within ${esc(o.allowed.join('–'))}` : ''}. Frequent proposals are compositions the model finds typical of known chemistry.</li>
      <li><b>Chemically plausible.</b> ${c.cb.balanced ? `It balances with common oxidation states: ${ox(c.cb.states)}.` : 'It was allowed as an intermetallic, so no charge balance was required.'}</li>
      <li><b>Predicted to form.</b> Formation energy ${num(c.eform, 3)} ± ${num(c.eformPm, 2)} eV/atom${c.eform + c.eformPm < 0 ? ', negative across the whole 90% interval' : '; the interval reaches above zero, so even formation is uncertain'}.</li>
      ${gapLine}
      <li><b>Stability against competing phases.</b> <span class="why-hull"><span class="spin"></span> Building the convex hull of ${esc(els.join('–'))} from Alexandria…</span></li>
      <li><b>Rank ${i + 1}</b> by the score E<sub>f</sub>${o.gap != null ? ' + 0.35 × |gap − target|' : ''} − 0.02 ln(times sampled) = ${num(c.score, 3)}; lower is better.</li></ol>
      <p class="hint">The networks see composition only, not a crystal structure, and were trained on Materials Project data, while the hull uses Alexandria's PBE energies; the two use similar but not identical settings, so read the hull distance to about ±0.1 eV/atom. A DFT relaxation of candidate structures is the next step before synthesis.</p></div>`;
    const el = $('.why-hull', td);
    try {
      const { phases, more } = await stablePhases(els);
      const h = X.hullEnergy(phases, C.fractions(c.comp));
      if (!h) throw new Error('hull failed');
      const d = c.eform - h.e, pm = c.eformPm;
      const parts = h.parts.length ? h.parts.map(q => `${(q.w * 100).toFixed(0)}% ${fhtml(q.name)}`).join(' + ') : 'the elements';
      const verdict = d - pm > 0 ? `<span class="tag warn">likely above the hull</span> It would probably decompose; treat it as metastable at best.`
        : d + pm < 0 ? `<span class="tag ok">below the known hull</span> If confirmed by DFT it would be a new stable phase, which is rare: check it first.`
        : `<span class="tag">within uncertainty of the hull</span> Stability cannot be decided from composition alone; a DFT calculation would settle it.`;
      const known = novelty.get(c.formula), db = known && typeof known === 'object' ? ` <b>Alexandria has computed this composition:</b> its best polymorph (${X.sgHTML(known.spacegroup)}) lies ${known.hull <= 1e-4 ? 'on the hull' : num(known.hull, 3) + ' eV/atom above the hull'}. That DFT value supersedes this estimate.` : '';
      el.innerHTML = `The lowest-energy mix of known stable phases at this composition is ${parts}, at ${num(h.e, 3)} eV/atom (${phases.length} stable phase${phases.length === 1 ? '' : 's'} in the system${more ? ', first pages only' : ''}). The prediction sits <b>${Math.abs(d) < 5e-4 ? '' : d > 0 ? '+' : '−'}${num(Math.abs(d), 3)} ± ${num(pm, 2)} eV/atom</b> from that hull. ${verdict}${db}`;
    } catch (e) { el.innerHTML = '<span class="hint">The database could not be reached, so the hull distance is unavailable. Try again later.</span>'; }
  }
  function wireNovelty(root) {
    $$('[data-db]', root).forEach(b => b.onclick = () => { Object.assign(st.search, { q: b.dataset.db, mode: 'formula', hull: 'any', provider: 'pbe', res: null, autorun: true }); D.open('search'); });
  }
  /* Look the candidates up in Alexandria. The database cannot OR formula filters, so query
     each chemical system once (usually one request) and fall back to one query per formula
     when a system has more entries than we page through. */
  async function checkNovelty(host) {
    const s = st.gen, todo = s.res.candidates.slice(0, 40).filter(c => !novelty.has(c.formula) || novelty.get(c.formula) === 'error');
    todo.forEach(c => novelty.set(c.formula, 'checking'));
    const paint = () => { const out = $('#gn-out', host); if (!out) return; $$('tr[data-f]', out).forEach(tr => { const c = s.res.candidates.find(x => x.formula === tr.dataset.f); if (c) $('.nov', tr).innerHTML = noveltyCell(c); }); wireNovelty(out); };
    const bySys = new Map();
    todo.forEach(c => { const k = Object.keys(c.comp).sort().join('-'); if (!bySys.has(k)) bySys.set(k, []); bySys.get(k).push(c); });
    const best = (entries, fm) => { const m = new Map(); entries.forEach(e => { const f = fm.get(e.formula); if (f && (!m.has(f) || e.hull < m.get(f).hull)) m.set(f, e); }); return m; };
    for (const [k, list] of bySys) {
      const els = k.split('-'), fm = new Map(list.map(c => [X.optimadeFormula(c.comp), c.formula]));
      try {
        const r = await X.searchAll({ elements: els, nelements: els.length, provider: 'pbe', limit: 100, light: true }, 5);
        const m = best(r.entries, fm);
        for (const c of list) {
          if (m.has(c.formula)) novelty.set(c.formula, m.get(c.formula));
          else if (!r.more) novelty.set(c.formula, 'new');
          else { const r2 = await X.search({ formula: X.optimadeFormula(c.comp), provider: 'pbe', limit: 100, light: true }); novelty.set(c.formula, best(r2.entries, fm).get(c.formula) || 'new'); }
        }
      } catch (e) { list.forEach(c => { if (novelty.get(c.formula) === 'checking') novelty.set(c.formula, 'error'); }); }
      paint();
    }
  }
  async function runPredict(host) {
    const s = st.gen, out = $('#gn-pout', host);
    const formulas = s.predText.split(/[\n,;]+/).map(x => x.trim().replace(/\s+/g, '')).filter(Boolean).slice(0, 200);
    if (!formulas.length) { out.innerHTML = '<div class="err">Type at least one formula.</div>'; return; }
    out.innerHTML = `<p class="hint"><span class="spin"></span> ${info ? 'Predicting…' : 'Loading the models (2.6 MB, once)…'}</p>`;
    try { s.pred = await gen('predict', { formulas }); renderPred(host); } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  function renderPred(host) {
    const out = $('#gn-pout', host);
    out.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th class="l">Formula</th><th>E<sub>f</sub> <small>eV/atom</small></th><th>Gap <small>eV</small></th><th class="l">Charge balance</th></tr></thead><tbody>${st.gen.pred.map(p => p.error ? `<tr><td class="l">${esc(p.f)}</td><td colspan="3" class="l"><span class="hint">${esc(p.error)}</span></td></tr>` : `<tr><td class="l">${fhtml(p.formula)}</td><td>${num(p.eform, 2)}${pmv(p.eformPm)}</td><td>${num(p.gap, 2)}${pmv(p.gapPm)}</td><td class="l">${p.cb.balanced ? ox(p.cb.states) : p.cb.intermetallic ? 'intermetallic' : '<span class="hint">not balanced with common states</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }
})();
