/* "Lattent in 40 seconds": the film in the home-page hero. One workflow in eight scenes, drawn on a
   canvas from real numbers. After the title: data arrives from instruments, simulations and
   spreadsheets (step 1); peaks are fitted with the checks built in (2); the wall of analyses (3);
   PCA, clustering and AutoML learn from the samples, then Facet, the AI lab partner, answers and
   writes the report (4); and the figure is exported at the journal's column width (5). A step rail
   along the bottom shows where we are. It plays only while on screen, pauses under the mouse, and
   the static screenshot stands in when the visitor prefers reduced motion. window.__film.seek(t)
   renders one moment, for checks and video capture. */
(function () {
  'use strict';
  const host = document.querySelector('.l-shot'), cv = host && host.querySelector('canvas.l-film');
  if (!cv || !cv.getContext || !('roundRect' in CanvasRenderingContext2D.prototype)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const W = 880, H = 640, LOOP = 40;
  const ctx = cv.getContext('2d');
  const P = { ink: '#eef0fb', ink2: '#c4c9e2', muted: '#8f96bb', grid: 'rgba(255,255,255,.07)', axis: 'rgba(255,255,255,.3)', brand: '#8a96ff', copper: '#f0954f', teal: '#2dd4bf', purple: '#b48cff', green: '#4ade80', rose: '#f472b6', gold: '#f2b84b', card: 'rgba(255,255,255,.055)', edge: 'rgba(255,255,255,.13)', night: '#0b0e24' };
  const FONT = { ui: 'Inter, system-ui, sans-serif', d: "'Space Grotesk', Inter, sans-serif", m: "'JetBrains Mono', ui-monospace, monospace" };

  /* ---------- helpers ---------- */
  let seed = 7;
  const rng = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const clamp = v => Math.max(0, Math.min(1, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const out = p => 1 - Math.pow(1 - p, 3);
  const pop = p => { p = clamp(p); return p < 0.6 ? out(p / 0.6) * 1.08 : 1.08 - 0.08 * (p - 0.6) / 0.4; };
  const env = (t, s, e) => span(t, s, s + 0.6) * (1 - span(t, e - 0.5, e));
  const font = (wt, px, f) => { ctx.font = `${wt} ${px}px ${FONT[f || 'ui']}`; };
  const text = (s, x, y, col, align) => { ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const card = (x, y, w, h, r, fill, edge) => { rr(x, y, w, h, r); ctx.fillStyle = fill || P.card; ctx.fill(); if (edge !== null) { ctx.strokeStyle = edge || P.edge; ctx.lineWidth = 1; ctx.stroke(); } };
  const glowDot = (x, y, r, col) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore(); };
  const wrap = (s, maxW) => { const words = s.split(' '), lines = []; let line = ''; words.forEach(w => { const tr = line ? line + ' ' + w : w; if (ctx.measureText(tr).width > maxW && line) { lines.push(line); line = w; } else line = tr; }); lines.push(line); return lines; };
  const line = (pts, col, width, dash) => { if (pts.length < 2) return; ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash || []); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]); };
  const glowLine = (pts, col, width) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12; line(pts, col, width); ctx.restore(); };
  const check = (x, y, col, w) => line([[x - 4, y], [x - 1, y + 3], [x + 4.5, y - 3.5]], col, w || 1.8);
  const tag = (x, y, s, label, col) => { rr(x, y, s, s, s * 0.23); ctx.fillStyle = col; ctx.fill(); font(700, s * 0.3, 'ui'); text(label, x + s / 2, y + s / 2 + 0.5, '#fff', 'center'); };

  /* ---------- the data, from the worked examples ---------- */
  const PEAKS = [[38.18, 1000, 0.95, '111'], [44.39, 470, 1.08, '200'], [64.58, 260, 1.34, '220'], [77.55, 280, 1.55, '311'], [81.72, 75, 1.62, '222']];
  const xBase = tt => 120 * Math.exp(-(tt - 30) / 40) + 40;
  const xModel = tt => { let y = xBase(tt); PEAKS.forEach(([c, h, w]) => { y += h * (0.55 / (1 + 4 * ((tt - c) / w) ** 2) + 0.45 * Math.exp(-4 * Math.LN2 * ((tt - c) / w) ** 2)); }); return y; };
  const XR = { x: [], y: [], f: [], b: [] };
  for (let tt = 30; tt <= 85.001; tt += 0.1) { const m = xModel(tt); XR.x.push(tt); XR.f.push(m); XR.b.push(xBase(tt)); XR.y.push(Math.max(0, m + Math.sqrt(m) * normal())); }
  /* an adsorption isotherm and three candidate models, for Facet's answer */
  const MODELS = [['Sips', P.copper, 0.89], ['Langmuir', P.brand, 0.09], ['Freundlich', P.purple, 0.02]];
  /* samples for the learning scene: three groups in PCA space and a held-out parity set */
  const CL = [[-1.6, 0.7, P.brand, 14, 'A', 'rgba(138,150,255,.22)'], [0.4, -1.2, P.copper, 10, 'B', 'rgba(240,149,79,.22)'], [1.6, 1.0, P.teal, 12, 'C', 'rgba(45,212,191,.22)']];
  const PCA = []; CL.forEach(([cx, cy, col, n, nm], k) => { for (let i = 0; i < n; i++) PCA.push({ x: cx + 0.42 * normal(), y: cy + 0.4 * normal(), k, col }); });
  const PAR = Array.from({ length: 22 }, () => { const m = 2.85 + rng() * 0.7; return [m, m + 0.07 * normal()]; });
  const pm = PAR.reduce((s, p) => s + p[0], 0) / PAR.length, ssr = PAR.reduce((s, p) => s + (p[1] - p[0]) ** 2, 0);
  const R2 = 1 - ssr / PAR.reduce((s, p) => s + (p[0] - pm) ** 2, 0), RMSE = Math.sqrt(ssr / PAR.length);
  const IMP = [['Zn fraction', 0.46], ['Anneal temperature', 0.31], ['Anneal time', 0.14], ['Dopant', 0.09]];
  /* small deterministic noise for the glyph wall and the journal page */
  const NZ = Array.from({ length: 48 }, () => normal()), PG = Array.from({ length: 64 }, () => 0.55 + rng() * 0.45);
  /* backdrop particles */
  const DOTS = Array.from({ length: 70 }, () => ({ x: rng() * W, y: rng() * H, r: 0.8 + rng() * 1.8, s: 4 + rng() * 10, p: rng() * 7, a: 0.15 + rng() * 0.35 }));
  const LAT = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 7; j++) LAT.push({ x: 160 + i * 62, y: 150 + j * 52, sx: rng() * W, sy: rng() * H });

  /* ---------- building blocks ---------- */
  function stage(t) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0d1130'); g.addColorStop(1, '#0a0d22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); };
    glow(W * 0.78 + Math.sin(t * 0.21) * 60, H * 0.18 + Math.cos(t * 0.17) * 40, 360, 'rgba(86,100,230,.32)');
    glow(W * 0.12 + Math.cos(t * 0.15) * 50, H * 0.95, 300, 'rgba(240,140,62,.14)');
    ctx.fillStyle = 'rgba(201,207,255,.09)';
    for (let x = 20; x < W; x += 30) for (let y = 20; y < H; y += 30) { ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }
    DOTS.forEach(d => { const y = ((d.y - t * d.s) % H + H) % H, x = d.x + Math.sin(t * 0.5 + d.p) * 8; ctx.fillStyle = `rgba(201,207,255,${d.a})`; ctx.beginPath(); ctx.arc(x, y, d.r, 0, 7); ctx.fill(); });
  }
  const STEPS = ['Data in', 'Analyse', 'Features', 'AI & ML', 'Publish'];
  function title(t, s, e, h, sub, step) {
    const dx = (1 - out(span(t, s, s + 0.7))) * -24;
    ctx.save(); ctx.translate(dx, 0);
    if (step) { font(600, 11, 'ui'); text('STEP ' + step + ' OF 5   ·   ' + STEPS[step - 1].toUpperCase(), 40, 30, P.copper); }
    font(700, 30, 'd'); text(h, 40, 60, P.ink);
    font(400, 14.5, 'ui'); text(sub, 40, 90, P.ink2);
    ctx.restore();
  }
  /* axes for any chart: r = plot rect, o = {x0,x1,y0,y1,xt,yt,xl,yl,print,small} */
  function axes(r, o) {
    const px = v => r.x + (v - o.x0) / (o.x1 - o.x0) * r.w, py = v => r.y + r.h - (v - o.y0) / (o.y1 - o.y0) * r.h;
    const ink = o.print ? '#111' : P.ink2, mut = o.print ? '#555' : P.muted, grid = o.print ? '#ececec' : P.grid, ax = o.print ? '#333' : P.axis, ts = o.small ? 10 : 11.5;
    (o.yt || []).forEach(v => { ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, py(v)); ctx.lineTo(r.x + r.w, py(v)); ctx.stroke(); font(400, ts, 'ui'); text(o.yf ? o.yf(v) : String(v), r.x - 8, py(v), mut, 'right'); });
    (o.xt || []).forEach(v => { font(400, ts, 'ui'); text(o.xf ? o.xf(v) : String(v), px(v), r.y + r.h + 13, mut, 'center'); });
    ctx.strokeStyle = ax; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.stroke();
    font(500, ts + 1, 'ui'); if (o.xl) text(o.xl, r.x + r.w / 2, r.y + r.h + (o.small ? 28 : 32), ink, 'center');
    if (o.yl) { ctx.save(); ctx.translate(r.x - (o.small ? 38 : 48), r.y + r.h / 2); ctx.rotate(-Math.PI / 2); text(o.yl, 0, 0, ink, 'center'); ctx.restore(); }
    return { px, py };
  }
  function xrd(r, o) {
    const m = axes(r, { x0: 30, x1: 85, y0: 0, y1: 1250, xt: [30, 40, 50, 60, 70, 80], yt: o.small ? [0, 400, 800, 1200] : [0, 200, 400, 600, 800, 1000, 1200], xl: '2θ (°)', yl: 'Intensity (counts)', print: o.print, small: o.small });
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y - 24, r.w + 2, r.h + 26); ctx.clip();
    const n = XR.x.length, cb = o.print ? '#8b4fc9' : P.purple, cd = o.print ? '#3e4ed8' : P.brand, cf = o.print ? '#e0712c' : P.copper;
    if (o.base > 0) line(XR.x.slice(0, Math.round(o.base * n)).map((x, i) => [m.px(x), m.py(XR.b[i])]), cb, o.small ? 1 : 1.3, [5, 4]);
    (o.marks || []).forEach((p, k) => {
      if (p <= 0) return; const [c, , , hkl] = PEAKS[k], x = m.px(c), apex = m.py(xModel(c)) - (o.small ? 10 : 18);
      ctx.save(); ctx.globalAlpha *= Math.min(1, p * 2);
      line([[x, apex + 8 + (1 - out(p)) * 30], [x, r.y + r.h]], cf, 1, [3, 4]);
      if (!o.small) { font(600, 11, 'm'); text('(' + hkl + ')', x, apex, cf, 'center'); }
      ctx.restore();
    });
    if (o.trace > 0) {
      const k = Math.max(2, Math.round(o.trace * n)), pts = XR.x.slice(0, k).map((x, i) => [m.px(x), m.py(XR.y[i])]);
      if (o.print) line(pts, cd, o.small ? 1 : 1.3); else glowLine(pts, cd, o.small ? 1 : 1.4);
      if (o.trace < 1) glowDot(pts[k - 1][0], pts[k - 1][1], 3.5, cd);
    }
    if (o.fit > 0) { const k = Math.max(2, Math.round(o.fit * n)), pts = XR.x.slice(0, k).map((x, i) => [m.px(x), m.py(XR.f[i])]); if (o.print) line(pts, cf, o.small ? 1.5 : 2.2); else glowLine(pts, cf, o.small ? 1.5 : 2.4); }
    ctx.restore();
    if (!o.small && o.trace > 0) {
      let lx = r.x + 6; const ly = r.y - 12;
      [['Data', cd, true], ['Baseline', cb, o.base > 0], ['Fit', cf, o.fit > 0]].forEach(([nm, col, on]) => { if (!on) return; line([[lx, ly], [lx + 16, ly]], col, 2); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 8, ly, 3, 0, 7); ctx.fill(); font(500, 12, 'ui'); text(nm, lx + 22, ly, o.print ? '#333' : P.ink2); lx += 22 + ctx.measureText(nm).width + 18; });
    }
  }
  function chip(x, y, label, value, col, p) {
    if (p <= 0) return; const s = pop(p);
    ctx.save(); ctx.globalAlpha *= Math.min(1, p * 3); ctx.translate(x, y); ctx.scale(s, s);
    font(700, 20, 'd'); const vw = ctx.measureText(value).width; font(400, 12, 'ui'); const lw = ctx.measureText(label).width; const w = Math.max(vw, lw) + 36;
    card(-w / 2, -30, w, 60, 12, 'rgba(11,14,36,.7)', col);
    font(400, 12, 'ui'); text(label, 0, -13, P.muted, 'center'); font(700, 20, 'd'); text(value, 0, 11, col, 'center');
    ctx.restore();
  }
  const pill = (x, y, label, col, p) => { if (p <= 0) return; const s = pop(p); ctx.save(); ctx.globalAlpha *= Math.min(1, p * 3); ctx.translate(x, y); ctx.scale(s, s); font(600, 13, 'ui'); const w = ctx.measureText(label).width + 40; card(-w / 2, -20, w, 40, 20, col, null); text(label, 0, 0, '#fff', 'center'); ctx.restore(); };
  const lock = (x, y, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y - 3, 4.5, Math.PI, 0); ctx.stroke(); rr(x - 7, y - 3, 14, 10, 2.5); ctx.fillStyle = col; ctx.fill(); };
  const cam = (t, s, e, k) => { const z = 1 + (k || 0.035) * span(t, s, e); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); };
  const sideCard = (x, y, w, h) => card(x, y, w, h, 14, 'rgba(11,14,36,.55)');
  const label = (s, x, y) => { font(500, 11, 'ui'); text(s, x, y, P.muted); };

  /* ---------- the scenes ---------- */
  const S = [[0, 3.4], [3.2, 9.2], [9.0, 15.4], [15.2, 20.4], [20.2, 26.0], [25.8, 31.6], [31.4, 36.6], [36.4, 40]];
  const STEP_OF = [0, 1, 2, 3, 4, 4, 5, 6];   // the workflow step each scene belongs to; 6 = all done

  function sTitle(t) {
    const [s, e] = S[0], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const p = ease(span(t, 0.2, 2.0));
    LAT.forEach(q => { const x = q.sx + (q.x - q.sx) * p, y = q.sy + (q.y - q.sy) * p; ctx.fillStyle = `rgba(138,150,255,${0.35 + 0.5 * p})`; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); });
    if (p > 0.75) { ctx.strokeStyle = `rgba(138,150,255,${0.25 * (p - 0.75) / 0.25})`; ctx.lineWidth = 1; LAT.forEach((q, i) => { if (i % 7 < 6) { ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y + 52); ctx.stroke(); } if (i < 63) { ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 62, q.y); ctx.stroke(); } }); }
    const w = ease(span(t, 1.0, 1.9));
    ctx.globalAlpha = a * w;
    rr(W / 2 - 230, H / 2 - 70, 460, 140, 22); ctx.fillStyle = 'rgba(11,14,36,.72)'; ctx.fill();
    [[-16, -14], [0, -14], [16, -14], [-16, 2], [0, 2], [16, 2], [-16, 18], [16, 18]].forEach(([dx, dy], i) => { ctx.fillStyle = i === 2 ? P.copper : P.ink; ctx.beginPath(); ctx.arc(W / 2 - 150 + dx, H / 2 - 12 + dy, i === 2 ? 5 : 4, 0, 7); ctx.fill(); });
    font(700, 56, 'd'); text('lattent', W / 2 - 110, H / 2 - 12, P.ink);
    ctx.globalAlpha = a * ease(span(t, 1.6, 2.4)); font(400, 15, 'ui'); text('Data analysis for materials and chemistry', W / 2, H / 2 + 42, P.ink2, 'center');
    ctx.restore();
  }

  /* step 1: files from the bench, the simulation and the notebook fly into one table */
  const SRC = [
    ['INSTRUMENT', 'XRD · UV–Vis · FTIR · Raman · tensile', P.brand, [['XRDML', '#b45309', 'scan.xrdml'], ['JDX', '#6d28d9', 'ftir.jdx']]],
    ['SIMULATION', 'DFT · MD · crystal structures', P.gold, [['CIF', '#0e7490', 'Au_Fm-3m.cif'], ['CSV', '#3b5bdb', 'dos.csv']]],
    ['NOTEBOOK', 'Excel · CSV · pasted tables', P.teal, [['XLSX', '#1d6f42', 'ZnO_300C.xlsx'], ['CSV', '#3b5bdb', 'series_02.csv']]]
  ];
  function srcIcon(k, x, y, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
    if (k === 0) { ctx.beginPath(); ctx.arc(x + 17, y + 24, 14, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 17, y + 24, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + 5, y + 18, 2.5, 0, 7); ctx.arc(x + 29, y + 18, 2.5, 0, 7); ctx.fill(); line([[x + 17, y + 24], [x + 29, y + 18]], col, 1); line([[x + 17, y + 24], [x + 5, y + 18]], col, 1); }
    else if (k === 1) { const q = [[x + 6, y + 12], [x + 22, y + 6], [x + 30, y + 14], [x + 14, y + 20], [x + 6, y + 28], [x + 22, y + 22], [x + 30, y + 30], [x + 14, y + 34]]; [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => line([q[i], q[j]], col, 1)); q.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 7); ctx.fill(); }); }
    else { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { rr(x + 4 + i * 10, y + 6 + j * 9.5, 8, 7.5, 1.5); ctx.globalAlpha *= (i + j) % 2 ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1; } }
    ctx.restore();
  }
  function sData(t) {
    const [s, e] = S[1], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'From the bench or the simulation', 'Instrument exports, Excel sheets and CIF structures. One file or a hundred, read in your browser.', 1);
    const tx = 360, ty = 118, tw = 480, th = 442;
    const tabAt = f => [tx + 10 + f * 77, ty + 10];
    const flights = [];
    SRC.forEach(([nm, desc, col, files], i) => {
      const p = out(span(t, s + 0.3 + i * 0.2, s + 1.0 + i * 0.2)), x = 40 + (1 - p) * -300, y = 118 + i * 126;
      ctx.save(); ctx.globalAlpha = a * p; card(x, y, 290, 108, 14);
      srcIcon(i, x + 16, y + 14, col); label(nm, x + 62, y + 28); font(500, 12.5, 'ui'); text(desc, x + 62, y + 48, P.ink);
      files.forEach(([ext, c2, name], j) => {
        const f = i * 2 + j, fp = span(t, s + 1.1 + f * 0.32, s + 1.85 + f * 0.32), ox = x + 16 + j * 134, oy = y + 72;
        ctx.save(); ctx.globalAlpha *= fp >= 1 ? 0.45 : 1; card(ox, oy, 126, 24, 7, 'rgba(255,255,255,.06)'); tag(ox + 4, oy + 4, 16, '', c2); font(500, 11, 'ui'); text(name, ox + 26, oy + 12.5, P.ink2); ctx.restore();
        if (fp > 0 && fp < 1) flights.push({ ox, oy, ext, c2, name, fp, f });
      });
      ctx.restore();
    });
    /* the table they land in */
    const tb = ease(span(t, s + 0.6, s + 1.4));
    if (tb > 0) {
      ctx.save(); ctx.globalAlpha = a * tb; ctx.translate((1 - tb) * 40, 0);
      card(tx, ty, tw, th, 14, 'rgba(11,14,36,.55)');
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(tx + 1, ty + 40, tw - 2, 28);
      font(600, 12, 'ui'); text('#', tx + 20, ty + 54, P.muted); text('2θ (°)', tx + 70, ty + 54, P.ink); text('Intensity (counts)', tx + 250, ty + 54, P.ink);
      SRC.flatMap(sr => sr[3]).forEach(([ext, c2, name], f) => {
        const lp = pop(span(t, s + 1.85 + f * 0.32, s + 2.15 + f * 0.32)); if (lp <= 0) return; const [ax, ay] = tabAt(f);
        ctx.save(); ctx.translate(ax + 36, ay + 10); ctx.scale(lp, lp); card(-36, -10, 72, 20, 6, f === 0 ? 'rgba(138,150,255,.18)' : 'rgba(255,255,255,.06)', f === 0 ? 'rgba(138,150,255,.5)' : P.edge);
        font(500, 10, 'ui'); text(name.length > 11 ? name.slice(0, 10) + '…' : name, 0, 0.5, f === 0 ? P.ink : P.ink2, 'center'); ctx.restore();
      });
      const rows = Math.floor(span(t, s + 2.0, s + 4.5) * 17);
      font(400, 12.5, 'm');
      for (let i = 0; i < rows; i++) { const y = ty + 86 + i * 20, k = i * 32; if (i === rows - 1 && rows < 17) { ctx.fillStyle = 'rgba(138,150,255,.16)'; ctx.fillRect(tx + 1, y - 10, tw - 2, 20); } text(String(i + 1), tx + 20, y, P.muted); text(XR.x[k].toFixed(2), tx + 70, y, P.ink2); text(XR.y[k].toFixed(1), tx + 250, y, P.ink2); }
      if (rows >= 17) { ctx.globalAlpha = a * tb * span(t, s + 4.5, s + 4.9); font(500, 12, 'ui'); text('6 files · 7,420 rows · read in 0.4 s', tx + tw - 20, ty + th - 18, P.green, 'right'); }
      ctx.restore();
    }
    /* files in flight, drawn last so they pass over everything */
    flights.forEach(fl => {
      const [ax, ay] = tabAt(fl.f), q = out(fl.fp), x = fl.ox + (ax - fl.ox) * q, y = fl.oy + (ay - fl.oy) * q - Math.sin(q * Math.PI) * 60, sc = 1 - 0.42 * q;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(sc, sc); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
      card(0, 0, 126, 24, 7, 'rgba(30,34,70,.95)', 'rgba(255,255,255,.3)'); ctx.shadowColor = 'transparent'; tag(4, 4, 16, '', fl.c2); font(500, 11, 'ui'); text(fl.name, 26, 12.5, P.ink); ctx.restore();
    });
    const lk = out(span(t, s + 3.2, s + 3.8));
    if (lk > 0) { ctx.save(); ctx.globalAlpha = a * lk; card(40, 500, 290, 44, 12, 'rgba(45,212,191,.08)', 'rgba(45,212,191,.35)'); lock(64, 522, P.teal); font(500, 12.5, 'ui'); text('Read on your computer. Nothing uploaded.', 82, 522, P.ink); ctx.restore(); }
    ctx.restore();
  }

  /* step 2: the XRD pattern is fitted */
  function sXrd(t) {
    const [s, e] = S[2], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Fit, with the checks built in', 'Pseudo-Voigt peaks on a fitted baseline. Size and strain from the widths, each with its uncertainty.', 2);
    const r = { x: 96, y: 140, w: 740, h: 296 };
    const marks = PEAKS.map((p, k) => span(t, s + 2.9 + k * 0.25, s + 3.4 + k * 0.25));
    xrd(r, { trace: ease(span(t, s + 0.4, s + 2.6)), base: out(span(t, s + 2.4, s + 3.2)), marks, fit: ease(span(t, s + 3.9, s + 5.0)) });
    [['Scherrer size', '11.3 ± 0.4 nm', P.copper], ['Microstrain', '0.21 ± 0.03 %', P.purple], ['Fit R²', '0.998', P.teal]].forEach(([l, v, c], i) => chip(200 + i * 240, 530, l, v, c, span(t, s + 4.5 + i * 0.25, s + 5.0 + i * 0.25)));
    ctx.restore();
  }

  /* step 3: the wall of analyses, each with a small glyph */
  const TILES = [
    ['Peak fitting', (b, p) => { curve(b, u => 0.1 + 0.85 * Math.exp(-Math.pow((u - 0.33) / 0.07, 2)) + 0.5 * Math.exp(-Math.pow((u - 0.68) / 0.06, 2)), P.brand, 1.5, p, null, true); if (p > 0.8) [0.33, 0.68].forEach(u => line([M(b, u, 0), M(b, u, u < 0.5 ? 0.9 : 0.55)], P.copper, 1, [2, 3])); }],
    ['Band gap (Tauc plot)', (b, p) => { curve(b, u => u < 0.42 ? 0.06 : 0.06 + 0.9 * Math.pow(clamp((u - 0.42) / 0.5), 1.5), P.brand, 1.5, p, null, true); if (p > 0.7) line([M(b, 0.46, 0), M(b, 0.92, 0.92)], P.copper, 1.4); }],
    ['Crystallite size and strain', (b, p) => { line([M(b, 0.05, 0.2), M(b, 0.05 + 0.9 * p, 0.2 + 0.6 * p)], P.brand, 1.3); [0.1, 0.3, 0.5, 0.7, 0.9].forEach((u, i) => { if (u <= 0.05 + 0.9 * p) { const q = M(b, u, 0.23 + 0.6 * (u - 0.05) / 0.9 + NZ[i] * 0.05); ctx.fillStyle = P.copper; ctx.beginPath(); ctx.arc(q[0], q[1], 2.6, 0, 7); ctx.fill(); } }); }],
    ['Phase identification', (b, p) => { [[.12, .9], [.3, .5], [.5, .3], [.62, .35], [.8, .2]].forEach(([u, h]) => { line([M(b, u, 0.5), M(b, u, 0.5 + 0.48 * h * p)], P.brand, 2); line([M(b, u, 0.46), M(b, u, 0.46 - 0.42 * h * p)], P.copper, 2); }); line([M(b, 0, 0.48), M(b, 1, 0.48)], P.axis, 1); }],
    ['Isotherms and kinetics', (b, p) => { curve(b, u => 0.95 * u / (0.15 + u), P.copper, 1.6, p, null, true); for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8; if (u <= p) { const q = M(b, u, 0.95 * u / (0.15 + u) + NZ[8 + i] * 0.04); ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, 7); ctx.fill(); } } }],
    ['Arrhenius and VFT', (b, p) => { line([M(b, 0.04, 0.9), M(b, 0.04 + 0.92 * p, 0.9 - 0.75 * p)], P.brand, 1.3); for (let i = 0; i < 6; i++) { const u = 0.1 + i * 0.16; if (u <= 0.04 + 0.92 * p) { const q = M(b, u, 0.9 - 0.75 * (u - 0.04) / 0.92 + NZ[16 + i] * 0.04); ctx.fillStyle = P.copper; ctx.beginPath(); ctx.arc(q[0], q[1], 2.6, 0, 7); ctx.fill(); } } }],
    ['Tensile tests', (b, p) => curve(b, u => u < 0.22 ? 0.72 * u / 0.22 : u < 0.88 ? 0.72 + 0.25 * (1 - Math.exp(-(u - 0.22) / 0.2)) : Math.max(0, 0.95 - 5 * (u - 0.88)), P.copper, 1.6, p, null, true)],
    ['DSC crystallisation', (b, p) => curve(b, u => 0.38 - 0.1 * u + 0.6 * Math.exp(-Math.pow((u - 0.58) / 0.07, 2)), P.brand, 1.5, p, null, true)],
    ['Tafel and electrochemistry', (b, p) => { curve(b, u => Math.min(0.95, 0.08 + 1.7 * Math.abs(u - 0.5)), P.copper, 1.6, p, null, true); if (p > 0.6) { line([M(b, 0.2, 0.08 + 0.5), M(b, 0.5, 0.08)], P.brand, 1, [3, 3]); line([M(b, 0.5, 0.08), M(b, 0.8, 0.58)], P.brand, 1, [3, 3]); } }],
    ['Dose–response and plate assays', (b, p) => { curve(b, u => 0.08 + 0.84 / (1 + Math.exp(-(u - 0.5) * 13)), P.brand, 1.5, p, null, true); for (let i = 0; i < 7; i++) { const u = 0.08 + i * 0.14; if (u <= p) { const q = M(b, u, 0.08 + 0.84 / (1 + Math.exp(-(u - 0.5) * 13)) + NZ[22 + i] * 0.04); ctx.fillStyle = P.copper; ctx.beginPath(); ctx.arc(q[0], q[1], 2.4, 0, 7); ctx.fill(); } } }],
    ['ANOVA, t tests and post tests', (b, p) => { [[0.18, 0.45, P.brand], [0.48, 0.7, P.copper], [0.78, 0.92, P.teal]].forEach(([u, h, c], i) => { const q = M(b, u, 0), top = M(b, u, h * p); rr(q[0] - 10, top[1], 20, q[1] - top[1], 2); ctx.fillStyle = c; ctx.fill(); const err = M(b, u, h * p + 0.06)[1]; line([[q[0], err], [q[0], top[1] + 3]], P.ink, 1); line([[q[0] - 4, err], [q[0] + 4, err]], P.ink, 1); }); if (p > 0.9) { font(700, 10, 'ui'); text('***', M(b, 0.48, 1)[0], M(b, 0, 0.98)[1], P.ink, 'center'); } }],
    ['Correlation and regression', (b, p) => { for (let i = 0; i < 14; i++) { const u = (i + 0.5) / 14; if (u <= p) { const q = M(b, u, clamp(0.15 + 0.7 * u + NZ[30 + i] * 0.09)); ctx.fillStyle = P.brand; ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, 7); ctx.fill(); } } if (p > 0.5) line([M(b, 0.02, 0.16), M(b, 0.02 + 0.96 * (p - 0.5) * 2, 0.16 + 0.67 * (p - 0.5) * 2)], P.copper, 1.4); }],
    ['Auto-fit · 35 built-in equations', (b, p) => { curve(b, u => 0.9 * Math.exp(-3 * u) + 0.05, P.purple, 1, p, [3, 3]); curve(b, u => 0.95 * Math.sqrt(u), P.brand, 1, p, [3, 3]); curve(b, u => 0.1 + 0.8 / (1 + Math.exp(-(u - 0.45) * 10)), P.copper, 1.6, p, null, true); }],
    ['Smooth, differentiate, integrate', (b, p) => { const f = u => 0.2 + 0.6 * Math.exp(-Math.pow((u - 0.5) / 0.2, 2)); if (p > 0.3) { const n = Math.round(40 * p); ctx.beginPath(); ctx.moveTo(...M(b, 0, 0)); for (let i = 0; i < n; i++) { const u = i / 39; ctx.lineTo(...M(b, u, f(u))); } ctx.lineTo(...M(b, (n - 1) / 39, 0)); ctx.fillStyle = 'rgba(240,149,79,.16)'; ctx.fill(); } curve(b, u => f(u) + NZ[Math.floor(u * 39) % 48] * 0.06, P.brand, 1, p); curve(b, f, P.copper, 1.6, p, null, true); }],
    ['Batch · a hundred files at once', (b, p) => { for (let i = 0; i < 3; i++) { const q = M(b, 0.04 + i * 0.07, 0.95 - i * 0.12); card(q[0], q[1], 34, 40 * clamp(p * 1.5), 3, 'rgba(255,255,255,.08)', P.edge); for (let k = 0; k < 4; k++) if (p > 0.6) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(q[0] + 6, q[1] + 8 + k * 7, 20 - k * 3, 2); } } if (p > 0.5) { line([M(b, 0.42, 0.5), M(b, 0.55, 0.5)], P.muted, 1.2); line([M(b, 0.52, 0.6), M(b, 0.55, 0.5), M(b, 0.52, 0.4)], P.muted, 1.2); [0.4, 0.65, 0.5, 0.85].forEach((h, i) => { const q = M(b, 0.64 + i * 0.1, 0), top = M(b, 0, h * clamp((p - 0.5) * 2))[1]; rr(q[0] - 7, top, 14, q[1] - top, 2); ctx.fillStyle = [P.brand, P.copper, P.teal, P.purple][i]; ctx.fill(); }); } }],
    ['Digitise a graph from an image', (b, p) => { const q = M(b, 0.05, 0.95), q2 = M(b, 0.95, 0.05); line([q, [q2[0], q[1]], q2, [q[0], q2[1]], q], P.muted, 1, [4, 3]); if (p > 0.3) [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].forEach(([u, v]) => { const c = M(b, u, v); ctx.strokeStyle = P.teal; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(c[0], c[1], 3.5, 0, 7); ctx.stroke(); }); curve(b, u => 0.15 + 0.65 * Math.exp(-Math.pow((u - 0.55) / 0.18, 2)), P.copper, 1.6, clamp((p - 0.3) / 0.7), null, true); }]
  ];
  const M = (b, u, v) => [b.x + u * b.w, b.y + (1 - v) * b.h];
  function curve(b, f, col, w, p, dash, glow) { const n = Math.max(2, Math.round(40 * p)); const pts = []; for (let i = 0; i < n; i++) { const u = i / 39; pts.push(M(b, u, clamp(f(u)))); } if (glow) glowLine(pts, col, w); else line(pts, col, w, dash); }
  function sWall(t) {
    const [s, e] = S[3], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Every measurement a materials lab makes', '35 equations, 30+ analyses, statistics with the assumptions checked, and a database of 5.8 million structures.', 3);
    const hi = Math.floor((t - (s + 2.4)) / 0.17);
    TILES.forEach(([nm, g], i) => {
      const c = i % 4, r = Math.floor(i / 4), x = 30 + c * 208, y = 112 + r * 96, p = out(span(t, s + 0.3 + i * 0.1, s + 0.9 + i * 0.1)); if (p <= 0) return;
      const on = hi >= 0 && hi % 16 === i && hi < 32;
      ctx.save(); ctx.globalAlpha *= p; ctx.translate(x + 98, y + 43); ctx.scale(0.9 + 0.1 * p, 0.9 + 0.1 * p); ctx.translate(-(x + 98), -(y + 43));
      if (on) { ctx.shadowColor = 'rgba(240,149,79,.45)'; ctx.shadowBlur = 24; }
      card(x, y, 196, 86, 12, on ? 'rgba(240,149,79,.1)' : P.card, on ? P.copper : P.edge); ctx.shadowColor = 'transparent';
      g({ x: x + 16, y: y + 12, w: 164, h: 36 }, ease(span(t, s + 0.6 + i * 0.1, s + 1.6 + i * 0.1)));
      font(600, 11.5, 'ui'); text(nm, x + 16, y + 68, on ? P.ink : P.ink2);
      ctx.restore();
    });
    const cp = ease(span(t, s + 2.0, s + 3.4));
    [[Math.round(35 * cp) + '', 'built-in equations'], [Math.round(30 * cp) + '+', 'analyses'], [(5.8 * cp).toFixed(1) + ' M', 'computed structures'], [Math.round(100 * cp) + '', 'files per batch']].forEach(([n, l], i) => { ctx.save(); ctx.globalAlpha = a * span(t, s + 1.8, s + 2.3); const x = 134 + i * 204; font(700, 26, 'd'); text(n, x, 530, i === 2 ? P.gold : P.copper, 'center'); font(400, 12, 'ui'); text(l, x, 554, P.muted, 'center'); ctx.restore(); });
    ctx.restore();
  }

  /* step 4a: the machine learning */
  function sML(t) {
    const [s, e] = S[4], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Learn from your samples', 'PCA and clustering find the structure; AutoML predicts the property and says which variables matter.', 4);
    const r = { x: 96, y: 150, w: 340, h: 300 };
    const m = axes(r, { x0: -3, x1: 3, y0: -2.6, y1: 2.6, xt: [-2, 0, 2], yt: [-2, 0, 2], xl: 'PC1 (62 % of variance)', yl: 'PC2 (21 %)' });
    const cp = ease(span(t, s + 1.9, s + 2.7));
    if (cp > 0) CL.forEach(([cx, cy, , , , soft]) => { const g = ctx.createRadialGradient(m.px(cx), m.py(cy), 0, m.px(cx), m.py(cy), 70); g.addColorStop(0, soft); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalAlpha *= cp; ctx.fillStyle = g; ctx.fillRect(m.px(cx) - 70, m.py(cy) - 70, 140, 140); ctx.restore(); });
    PCA.forEach((q, i) => { const p = pop(span(t, s + 0.4 + i * 0.03, s + 0.7 + i * 0.03)); if (p <= 0) return; const x = m.px(q.x), y = m.py(q.y); ctx.fillStyle = P.ink2; ctx.beginPath(); ctx.arc(x, y, 3.2 * p, 0, 7); ctx.fill(); if (cp > 0) { ctx.save(); ctx.globalAlpha *= cp; glowDot(x, y, 3.4, q.col); ctx.restore(); } });
    if (cp > 0) CL.forEach(([cx, cy, col, n, nm]) => { ctx.save(); ctx.globalAlpha *= cp; const x = m.px(cx), y = m.py(cy); line([[x - 5, y - 5], [x + 5, y + 5]], P.ink, 1.6); line([[x - 5, y + 5], [x + 5, y - 5]], P.ink, 1.6); font(600, 12, 'ui'); text('Cluster ' + nm + ' · ' + n + ' samples', x, y + (nm === 'B' ? 64 : -64), col, 'center'); ctx.restore(); });
    font(500, 12, 'ui'); ctx.save(); ctx.globalAlpha = a * span(t, s + 0.3, s + 0.8); text(cp > 0.5 ? 'k-means, k = 3 · silhouette 0.71' : 'Principal component analysis · 36 samples, 9 variables', r.x + 4, r.y - 12, P.ink2); ctx.restore();
    /* AutoML on the right */
    const side = out(span(t, s + 0.6, s + 1.3));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 470, y = 116, w = 374; sideCard(x, y, w, 444);
      label('AUTOML · PREDICT THE BAND GAP', x + 18, y + 26);
      const pr = { x: x + 70, y: y + 58, w: 210, h: 140 };
      const pm2 = axes(pr, { x0: 2.8, x1: 3.6, y0: 2.8, y1: 3.6, xt: [2.8, 3.2, 3.6], yt: [2.8, 3.2, 3.6], xl: 'Measured Eg (eV)', yl: 'Predicted (eV)', small: true, xf: v => v.toFixed(1), yf: v => v.toFixed(1) });
      line([[pm2.px(2.8), pm2.py(2.8)], [pm2.px(3.6), pm2.py(3.6)]], 'rgba(255,255,255,.25)', 1, [4, 4]);
      PAR.forEach(([mv, pv], i) => { const p = pop(span(t, s + 1.0 + i * 0.06, s + 1.3 + i * 0.06)); if (p > 0) glowDot(pm2.px(mv), pm2.py(pv), 3 * p, P.brand); });
      const rp = span(t, s + 2.5, s + 2.9);
      if (rp > 0) { ctx.save(); ctx.globalAlpha *= rp; font(600, 12, 'm'); text('R² ' + R2.toFixed(2) + ' · RMSE ' + RMSE.toFixed(2) + ' eV', pr.x + 10, pr.y + 8, P.green); ctx.restore(); }
      label('WHAT MATTERS', x + 18, y + 250);
      IMP.forEach(([nm, v], i) => { const bp = ease(span(t, s + 2.8 + i * 0.2, s + 3.8 + i * 0.2)); if (bp <= 0) return; const yy = y + 276 + i * 30; font(500, 12.5, 'ui'); text(nm, x + 18, yy, P.ink); font(600, 12, 'm'); text(Math.round(v * bp * 100) + ' %', x + w - 18, yy, i === 0 ? P.copper : P.ink2, 'right'); rr(x + 18, yy + 10, w - 36, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); rr(x + 18, yy + 10, (w - 36) * v * bp, 6, 3); ctx.fillStyle = i === 0 ? P.copper : P.brand; ctx.fill(); });
      ctx.save(); ctx.globalAlpha *= span(t, s + 4.2, s + 4.6); label('BAYESIAN OPTIMISATION SUGGESTS', x + 18, y + 398); ctx.restore();
      pill(x + w / 2, y + 424, 'Next experiment: Zn 0.62 · 420 °C · 2 h', P.copper, span(t, s + 4.3, s + 4.8));
      ctx.restore();
    }
    ctx.restore();
  }

  /* step 4b: Facet, the AI lab partner */
  function sFacet(t) {
    const [s, e] = S[5], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Ask Facet, your AI lab partner', 'It suggests the analysis, checks the project for mistakes, reads graphs and writes the report.', 4);
    const x = 50, y = 116, w = 500, h = 444; sideCard(x, y, w, h);
    glowDot(x + 26, y + 24, 6, P.purple); font(600, 13, 'ui'); text('Facet', x + 42, y + 24, P.ink); font(400, 11.5, 'ui'); text('Every number comes from the validated engine', x + 86, y + 24, P.muted);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x + 1, y + 44, w - 2, 1);
    const q = 'Which model fits my isotherm best?', qn = Math.floor(span(t, s + 0.5, s + 1.6) * q.length);
    if (qn > 0) { font(400, 13.5, 'ui'); const qw = ctx.measureText(q).width + 32, bx = x + w - 20 - qw, by = y + 62; card(bx, by, qw, 38, 12, 'rgba(138,150,255,.2)', 'rgba(138,150,255,.5)'); text(q.slice(0, qn) + (qn < q.length ? '▍' : ''), bx + 16, by + 19, P.ink); }
    const tp = span(t, s + 1.7, s + 2.3);
    if (tp > 0 && tp < 1) for (let i = 0; i < 3; i++) { ctx.fillStyle = P.muted; ctx.beginPath(); ctx.arc(x + 40 + i * 12, y + 132 + Math.sin(t * 9 + i) * 3, 3, 0, 7); ctx.fill(); }
    const ans = 'Sips fits best: AICc weight 89 %, R² 0.996. Langmuir is 4.6 AICc behind and Freundlich misses the plateau. The residuals show no trend, so the fit can go in the report.';
    font(400, 13.5, 'ui'); const lines = wrap(ans, 384), words = ans.split(' '), wn = Math.floor(span(t, s + 2.3, s + 3.9) * words.length), ap = span(t, s + 2.3, s + 2.6);
    if (ap > 0) {
      const bx = x + 20, by = y + 112, bw = 424, bh = 16 + lines.length * 19 + 14 + 3 * 24 + 10;
      ctx.save(); ctx.globalAlpha *= ap; card(bx, by, bw, bh, 12, 'rgba(255,255,255,.06)');
      font(400, 13.5, 'ui'); wrap(words.slice(0, wn).join(' '), 384).forEach((l, i) => text(l, bx + 16, by + 24 + i * 19, P.ink2));
      const ry = by + 16 + lines.length * 19 + 16;
      MODELS.forEach(([nm, col, wgt], i) => { const bp = ease(span(t, s + 3.5 + i * 0.25, s + 4.3 + i * 0.25)); if (bp <= 0) return; font(500, 12, 'ui'); text(nm, bx + 16, ry + i * 24 + 6, P.ink); rr(bx + 110, ry + i * 24 + 2, 240, 8, 4); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); rr(bx + 110, ry + i * 24 + 2, 240 * wgt * bp, 8, 4); ctx.fillStyle = col; ctx.fill(); font(600, 12, 'm'); text(Math.round(wgt * bp * 100) + '%', bx + bw - 16, ry + i * 24 + 6, col, 'right'); });
      ctx.restore();
      const cp = pop(span(t, s + 4.5, s + 5.0));
      if (cp > 0) { let cx = bx; ['Add to the report', 'Show residuals', 'Why not Langmuir?'].forEach(l => { font(500, 12, 'ui'); const cw = ctx.measureText(l).width + 26; ctx.save(); ctx.globalAlpha *= Math.min(1, cp); ctx.translate(cx + cw / 2, by + bh + 26); ctx.scale(cp, cp); card(-cw / 2, -14, cw, 28, 14, 'rgba(138,150,255,.12)', 'rgba(138,150,255,.45)'); text(l, 0, 0.5, P.ink, 'center'); ctx.restore(); cx += cw + 10; }); }
    }
    card(x + 20, y + h - 56, w - 40, 38, 19, 'rgba(255,255,255,.05)'); font(400, 12.5, 'ui'); text('Ask about your data, or attach a figure…', x + 38, y + h - 37, P.muted);
    ctx.fillStyle = P.brand; ctx.beginPath(); ctx.arc(x + w - 40, y + h - 37, 12, 0, 7); ctx.fill(); line([[x + w - 45, y + h - 37], [x + w - 35, y + h - 37]], '#fff', 1.6); line([[x + w - 39, y + h - 41], [x + w - 35, y + h - 37], [x + w - 39, y + h - 33]], '#fff', 1.6);
    /* project check and the report agent on the right */
    const side = out(span(t, s + 0.6, s + 1.3));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x2 = 580, w2 = 264;
      sideCard(x2, 116, w2, 196); label('PROJECT CHECK', x2 + 18, 142);
      [['Replicates found · n = 6', 1], ['Units missing on column 3 → fixed', 0], ['Baseline anchored off the peaks', 1], ['Fit converged · 5 peaks', 1]].forEach(([l, ok], i) => { const p = pop(span(t, s + 0.9 + i * 0.4, s + 1.3 + i * 0.4)); if (p <= 0) return; const yy = 172 + i * 32; ctx.save(); ctx.globalAlpha *= Math.min(1, p); ctx.beginPath(); ctx.arc(x2 + 28, yy, 8 * p, 0, 7); ctx.fillStyle = ok ? 'rgba(74,222,128,.18)' : 'rgba(240,149,79,.2)'; ctx.fill(); if (ok) check(x2 + 28, yy, P.green, 1.6); else { font(700, 10, 'ui'); text('!', x2 + 28, yy + 0.5, P.copper, 'center'); } font(400, 12, 'ui'); text(l, x2 + 46, yy, P.ink2); ctx.restore(); });
      sideCard(x2, 328, w2, 232); label('REPORT · WRITTEN BY THE AGENT', x2 + 18, 354);
      ['Plan the analyses', 'Run 4 analyses', 'Check for mistakes', 'Write methods and results'].forEach((l, i) => {
        const t0 = s + 1.4 + i * 0.7, done = t >= t0 + 0.7, active = t >= t0 && !done, yy = 384 + i * 32;
        if (done) { ctx.beginPath(); ctx.arc(x2 + 28, yy, 8, 0, 7); ctx.fillStyle = 'rgba(74,222,128,.18)'; ctx.fill(); check(x2 + 28, yy, P.green, 1.6); }
        else if (active) { ctx.strokeStyle = P.copper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x2 + 28, yy, 6, t * 7, t * 7 + 4.2); ctx.stroke(); }
        else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x2 + 28, yy, 6, 0, 7); ctx.stroke(); }
        font(done || active ? 500 : 400, 12.5, 'ui'); text(l, x2 + 46, yy, done ? P.ink : active ? P.ink : P.muted);
      });
      const rp = span(t, s + 4.3, s + 4.7);
      if (rp > 0) { ctx.save(); ctx.globalAlpha *= rp; font(600, 12.5, 'ui'); text('Report ready · 6 figures · 1,240 words', x2 + 18, 534, P.green); ctx.restore(); }
      ctx.restore();
    }
    ctx.restore();
  }

  /* step 5: the figure lands on the journal page and the files are exported */
  function sPublish(t) {
    const [s, e] = S[6], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Download for your journal', 'Figures at the exact column width as 600 dpi TIFF, PNG or SVG, with methods text written from your numbers.', 5);
    const px = 50, py = 112, pw = 340, ph = 448, pp = out(span(t, s + 0.2, s + 1.0));
    ctx.save(); ctx.globalAlpha = a * pp; ctx.translate(0, (1 - pp) * 30);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; rr(px, py, pw, ph, 6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(px + 22, py + 16, 120, 5); ctx.fillRect(px + 250, py + 16, 68, 5);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(px + 22, py + 32, 262, 7); ctx.fillRect(px + 22, py + 44, 190, 7);
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(px + 22, py + 60, 150, 4);
    /* the figure drops in at double-column width */
    const fp = out(span(t, s + 0.9, s + 1.8));
    if (fp > 0) {
      ctx.save(); ctx.globalAlpha *= fp; ctx.translate(0, (1 - fp) * -36);
      xrd({ x: px + 66, y: py + 96, w: 240, h: 136 }, { trace: 1, base: 1, fit: 1, marks: [1, 1, 1, 1, 1], print: true, small: true });
      font(400, 9.5, 'ui'); wrap('Figure 1. XRD pattern of the Au nanoparticles with pseudo-Voigt fits (orange) and the fitted baseline (dashed). Scherrer size 11.3 ± 0.4 nm.', 296).forEach((l, i) => text(l, px + 22, py + 276 + i * 13, '#333'));
      ctx.restore();
      const rp = span(t, s + 1.9, s + 2.4);
      if (rp > 0) { ctx.save(); ctx.globalAlpha *= rp; const y1 = py + 80; line([[px + 26, y1], [px + 26 + 288 * out(rp), y1]], P.copper, 1.2); line([[px + 26, y1 - 5], [px + 26, y1 + 5]], P.copper, 1.2); if (rp >= 1) line([[px + 314, y1 - 5], [px + 314, y1 + 5]], P.copper, 1.2); font(600, 10, 'ui'); text('177.8 mm · ACS double column', px + 170, y1 - 10, P.copper, 'center'); ctx.restore(); }
    }
    for (let c = 0; c < 2; c++) for (let i = 0; i < 16; i++) { const k = c * 16 + i; ctx.fillStyle = '#d0d0d0'; ctx.fillRect(px + 22 + c * 155, py + 310 + i * 8, (i === 15 && c === 1 ? 0.5 : PG[k]) * 141, 2.5); }
    ctx.restore();
    /* the export panel */
    const side = out(span(t, s + 0.5, s + 1.2));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 430, y = 116, w = 414; sideCard(x, y, w, 444);
      label('JOURNAL', x + 18, y + 26);
      let cx = x + 18; ['ACS', 'RSC', 'Elsevier', 'Nature', 'Wiley'].forEach((j, i) => { font(500, 12, 'ui'); const cw = ctx.measureText(j).width + 24; card(cx, y + 40, cw, 26, 13, i === 0 ? 'rgba(240,149,79,.18)' : 'rgba(255,255,255,.05)', i === 0 ? P.copper : P.edge); text(j, cx + cw / 2, y + 53.5, i === 0 ? P.ink : P.muted, 'center'); cx += cw + 8; });
      label('EXPORT', x + 18, y + 96);
      [['TIFF', P.copper, 'Figure1_ACS.tiff', '600 dpi · 4200 × 2835 px'], ['SVG', P.purple, 'Figure1_ACS.svg', 'vector, editable'], ['PNG', P.brand, 'Figure1.png', '600 dpi'], ['CSV', P.teal, 'results.csv', 'parameters ± SE, R², AICc'], ['TXT', P.green, 'methods.txt', 'from your numbers']].forEach(([ext, col, name, meta], i) => {
        const p = out(span(t, s + 0.8 + i * 0.3, s + 1.3 + i * 0.3)); if (p <= 0) return; const yy = y + 124 + i * 38, dp = span(t, s + 1.3 + i * 0.3, s + 2.0 + i * 0.3);
        ctx.save(); ctx.globalAlpha *= p; ctx.translate((1 - p) * 20, 0);
        tag(x + 18, yy - 13, 26, ext, col); font(500, 13, 'ui'); text(name, x + 54, yy - 4, P.ink); font(400, 11, 'ui'); text(meta, x + w - 18, yy - 4, P.muted, 'right');
        rr(x + 54, yy + 8, w - 72 - 22, 3, 1.5); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); rr(x + 54, yy + 8, (w - 94) * dp, 3, 1.5); ctx.fillStyle = dp >= 1 ? P.green : col; ctx.fill();
        if (dp >= 1) check(x + w - 26, yy + 9, P.green, 1.6);
        ctx.restore();
      });
      label('METHODS', x + 18, y + 326);
      const words = 'Peaks were located on the smoothed signal and fitted simultaneously with pseudo-Voigt profiles on a linear baseline. Crystallite size was estimated with the Scherrer equation (K = 0.9, λ = 1.5406 Å) and, with microstrain, by a Williamson–Hall analysis. Analyses were performed with Lattent.'.split(' ');
      font(400, 12.5, 'ui'); const n = Math.floor(span(t, s + 2.2, s + 4.6) * words.length);
      wrap(words.slice(0, n).join(' '), w - 36).forEach((l, i) => text(l, x + 18, y + 350 + i * 18, P.ink2));
      ctx.restore();
    }
    ctx.restore();
  }

  function sEnd(t) {
    const [s] = S[7], a = span(t, s, s + 0.7); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a * 0.35;
    LAT.forEach(q => { ctx.fillStyle = 'rgba(138,150,255,.6)'; ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill(); });
    ctx.globalAlpha = a; const p = out(span(t, s, s + 0.9)); ctx.translate(0, (1 - p) * 16);
    font(700, 40, 'd'); text('Free. In your browser.', W / 2, H / 2 - 50, P.ink, 'center');
    text('Your data stays with you.', W / 2, H / 2 - 2, P.copper, 'center');
    const bw = 230; rr(W / 2 - bw / 2, H / 2 + 36, bw, 48, 24); ctx.fillStyle = P.brand; ctx.fill(); font(600, 15, 'ui'); text('Open Lattent Studio', W / 2, H / 2 + 60, '#fff', 'center');
    ctx.restore();
  }

  /* the step rail along the bottom */
  function rail(t) {
    const a = span(t, 3.3, 4.0) * (1 - span(t, LOOP - 0.6, LOOP)); if (a <= 0) return;
    const cur = S.findIndex(([s], i) => t >= s && (i === S.length - 1 || t < S[i + 1][0])), k = STEP_OF[cur];
    const prog = k === 4 ? span(t, S[4][0], S[5][1]) : k >= 1 && k <= 5 ? span(t, S[cur][0], S[cur][1]) : 0;
    const y = 608, xs = STEPS.map((_, i) => 170 + i * 140);
    ctx.save(); ctx.globalAlpha = a;
    STEPS.forEach((nm, i) => {
      const x = xs[i], n = i + 1, st = k === 6 || n < k ? 'done' : n === k ? 'cur' : 'todo';
      font(600, 12, 'ui'); const lw = ctx.measureText(nm).width;
      if (i < 4) { const x1 = x + 18 + lw + 10, x2 = xs[i + 1] - 14; line([[x1, y], [x2, y]], 'rgba(255,255,255,.14)', 2); const f = st === 'done' ? 1 : st === 'cur' ? prog : 0; if (f > 0) line([[x1, y], [x1 + (x2 - x1) * f, y]], st === 'done' ? P.brand : P.copper, 2); }
      if (st === 'cur') { ctx.save(); ctx.globalAlpha *= 0.35 + 0.25 * Math.sin(t * 5); ctx.strokeStyle = P.copper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke(); ctx.restore(); }
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7);
      if (st === 'todo') { ctx.fillStyle = 'rgba(11,14,36,.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.2; ctx.stroke(); font(600, 10, 'ui'); text(String(n), x, y + 0.5, P.muted, 'center'); }
      else { ctx.fillStyle = st === 'cur' ? P.copper : P.brand; ctx.fill(); if (st === 'cur') { font(700, 10, 'ui'); text(String(n), x, y + 0.5, '#fff', 'center'); } else check(x, y, '#fff', 1.8); }
      font(600, 12, 'ui'); text(nm, x + 18, y, st === 'todo' ? P.muted : P.ink);
    });
    ctx.restore();
  }

  function draw(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;
    stage(t);
    [sTitle, sData, sXrd, sWall, sML, sFacet, sPublish, sEnd].forEach(f => f(t));
    rail(t);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, 0, W, 2); ctx.fillStyle = P.copper; ctx.fillRect(0, 0, W * (t / LOOP), 2);
    const fade = t < 0.4 ? span(t, 0, 0.4) : t > LOOP - 0.5 ? 1 - span(t, LOOP - 0.5, LOOP) : 1;
    if (fade < 1) { ctx.fillStyle = `rgba(11,14,36,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- play only while on screen ---------- */
  let t0 = null, paused = true, visible = false, raf = 0, held = 0, hover = false;
  function frame(now) { if (paused) return; if (t0 == null) t0 = now - held * 1000; draw(((now - t0) / 1000) % LOOP); raf = requestAnimationFrame(frame); }
  function play() { if (!paused) return; paused = false; t0 = null; raf = requestAnimationFrame(frame); }
  function pause() { if (paused) return; paused = true; cancelAnimationFrame(raf); if (t0 != null) held = ((performance.now() - t0) / 1000) % LOOP; }
  const update = () => { if (visible && !hover && document.visibilityState === 'visible') play(); else pause(); };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; update(); }, { threshold: 0.2 }).observe(cv);
  document.addEventListener('visibilitychange', update);
  cv.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hover = true; update(); } });
  cv.addEventListener('pointerleave', () => { hover = false; update(); });
  cv.style.cursor = 'pointer'; cv.title = 'Open Lattent Studio';
  cv.addEventListener('click', () => { const a = document.querySelector('.l-cta a'); if (a) location.href = a.href; });
  window.__film = { seek(t) { pause(); held = t; draw(t); }, play, pause, LOOP };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { host.classList.add('on'); draw(0); update(); });
})();
