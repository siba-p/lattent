/* "Lattent in 40 seconds": the film in the home-page hero. Eight scenes drawn on a canvas from
   real numbers (the worked examples' data and models): data arrives, XRD peaks are fitted, a band
   gap is read from a Tauc plot, catalyst batches are compared, the best isotherm model is chosen,
   the phase is identified against the database, and the figure is published. It plays only while
   on screen, pauses under the mouse, and the static screenshot stands in when the visitor prefers
   reduced motion. window.__film.seek(t) renders one moment, for checks and video capture. */
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
  const line = (pts, col, width, dash) => { if (pts.length < 2) return; ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.setLineDash(dash || []); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]); };
  const glowLine = (pts, col, width) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12; line(pts, col, width); ctx.restore(); };

  /* ---------- the data, from the worked examples ---------- */
  const PEAKS = [[38.18, 1000, 0.95, '111'], [44.39, 470, 1.08, '200'], [64.58, 260, 1.34, '220'], [77.55, 280, 1.55, '311'], [81.72, 75, 1.62, '222']];
  const xBase = tt => 120 * Math.exp(-(tt - 30) / 40) + 40;
  const xModel = tt => { let y = xBase(tt); PEAKS.forEach(([c, h, w]) => { y += h * (0.55 / (1 + 4 * ((tt - c) / w) ** 2) + 0.45 * Math.exp(-4 * Math.LN2 * ((tt - c) / w) ** 2)); }); return y; };
  const XR = { x: [], y: [], f: [], b: [] };
  for (let tt = 30; tt <= 85.001; tt += 0.1) { const m = xModel(tt); XR.x.push(tt); XR.f.push(m); XR.b.push(xBase(tt)); XR.y.push(Math.max(0, m + Math.sqrt(m) * normal())); }
  /* UV–Vis absorbance of ZnO and its Tauc transform */
  const UV = { l: [], a: [], e: [], t: [] };
  for (let l = 300; l <= 500.001; l += 2) { const a = 0.06 + 1.05 * 0.5 * (1 + Math.tanh((371 - l) / 8)) + 0.005 * normal(); UV.l.push(l); UV.a.push(a); const e = 1239.84 / l; UV.e.push(e); UV.t.push((a * e) ** 2); }
  const TM = Math.max(...UV.t); UV.t = UV.t.map(v => v / TM);
  const REG = [3.32, 3.44], reg = UV.e.map((e, i) => [e, UV.t[i]]).filter(([e]) => e >= REG[0] && e <= REG[1]);
  const mx = reg.reduce((s, p) => s + p[0], 0) / reg.length, my = reg.reduce((s, p) => s + p[1], 0) / reg.length;
  const slope = reg.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / reg.reduce((s, p) => s + (p[0] - mx) ** 2, 0), icpt = my - slope * mx, EG = -icpt / slope;
  /* mass activity of four catalyst batches */
  const BATCH = [['A', 42, 4], ['B', 55, 5], ['C', 61, 4.5], ['D', 48, 5]].map(([n, m, sd]) => ({ n, m, sd, pts: Array.from({ length: 6 }, () => m + sd * normal()) }));
  /* an adsorption isotherm and three candidate models */
  const ISO = Array.from({ length: 12 }, (_, i) => { const c = 2 * Math.pow(50, i / 11); const q = 150 * Math.pow(0.06 * c, 0.8) / (1 + Math.pow(0.06 * c, 0.8)); return [c, Math.max(0, q + 4 * normal())]; });
  const MODELS = [['Sips', P.copper, c => 150 * Math.pow(0.06 * c, 0.8) / (1 + Math.pow(0.06 * c, 0.8)), 0.89], ['Langmuir', P.brand, c => 148 * 0.045 * c / (1 + 0.045 * c), 0.09], ['Freundlich', P.purple, c => 30 * Math.pow(c, 0.33), 0.02]];
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
  function title(t, s, e, h, sub) {
    const dx = (1 - out(span(t, s, s + 0.7))) * -24;
    ctx.save(); ctx.translate(dx, 0);
    font(700, 32, 'd'); text(h, 40, 56, P.ink);
    font(400, 14.5, 'ui'); text(sub, 40, 86, P.ink2);
    ctx.restore();
  }
  /* axes for any chart: r = plot rect, o = {x0,x1,y0,y1,xt,yt,xl,yl,print} */
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
  function cell(cx, cy, size, a, b, glow) {
    const pts = []; for (let i = 0; i < 8; i++) pts.push([(i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5]);
    [[0, .5, .5], [1, .5, .5], [.5, 0, .5], [.5, 1, .5], [.5, .5, 0], [.5, .5, 1]].forEach(p => pts.push([p[0] - .5, p[1] - .5, p[2] - .5]));
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const v = pts.map(([x, y, z]) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, d = 3.2 / (3.2 - z2); return { x: cx + x1 * size * d, y: cy + y1 * size * d, z: z2, d }; });
    ctx.strokeStyle = 'rgba(201,207,255,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const x = i ^ j; if (x === 1 || x === 2 || x === 4) { ctx.beginPath(); ctx.moveTo(v[i].x, v[i].y); ctx.lineTo(v[j].x, v[j].y); ctx.stroke(); } }
    v.slice().sort((p, q) => p.z - q.z).forEach(p => {
      const rad = size * 0.17 * p.d, g = ctx.createRadialGradient(p.x - rad * 0.35, p.y - rad * 0.4, rad * 0.1, p.x, p.y, rad);
      g.addColorStop(0, '#ffe9b0'); g.addColorStop(0.6, P.gold); g.addColorStop(1, '#9a6a1a');
      ctx.save(); if (glow) { ctx.shadowColor = 'rgba(242,184,75,.7)'; ctx.shadowBlur = 18; } ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.fill(); ctx.restore();
    });
  }
  const lock = (x, y, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y - 3, 4.5, Math.PI, 0); ctx.stroke(); rr(x - 7, y - 3, 14, 10, 2.5); ctx.fillStyle = col; ctx.fill(); };
  const cam = (t, s, e, k) => { const z = 1 + (k || 0.035) * span(t, s, e); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); };

  /* ---------- the scenes ---------- */
  const S = [[0, 3.4], [3.2, 8.6], [8.4, 14.6], [14.4, 19.8], [19.6, 25.0], [24.8, 30.0], [29.8, 35.2], [35.0, 40]];

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
  function sData(t) {
    const [s, e] = S[1], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Bring your data', 'Excel, CSV and instrument files, one or a hundred at a time.');
    const FILES = [['XLSX', '#1d6f42', 'ZnO_300C.xlsx'], ['CSV', '#3b5bdb', 'series_02.csv'], ['XRDML', '#b45309', 'scan.xrdml'], ['JDX', '#6d28d9', 'ftir.jdx']];
    FILES.forEach(([tag, col, name], i) => {
      const p = out(span(t, s + 0.4 + i * 0.25, s + 1.2 + i * 0.25)), x = 40 + (1 - p) * -260, y = 128 + i * 64;
      ctx.save(); ctx.globalAlpha = a * p; card(x, y, 280, 50, 12); rr(x + 12, y + 10, 30, 30, 7); ctx.fillStyle = col; ctx.fill();
      font(700, 8.5, 'ui'); text(tag, x + 27, y + 25, '#fff', 'center'); font(600, 13.5, 'ui'); text(name, x + 54, y + 25, P.ink); ctx.restore();
    });
    const tb = ease(span(t, s + 1.4, s + 2.2));
    if (tb > 0) {
      ctx.save(); ctx.globalAlpha = a * tb;
      const tx = 360 + (1 - tb) * 40, ty = 120, tw = 480, rows = Math.floor(span(t, s + 2.0, s + 4.6) * 19);
      card(tx, ty, tw, 440, 14, 'rgba(11,14,36,.55)');
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(tx + 1, ty + 1, tw - 2, 34);
      font(600, 12, 'ui'); text('#', tx + 20, ty + 18, P.muted); text('2θ (°)', tx + 70, ty + 18, P.ink); text('Intensity (counts)', tx + 250, ty + 18, P.ink);
      font(400, 12.5, 'm');
      for (let i = 0; i < rows; i++) { const y = ty + 52 + i * 20, k = i * 28; if (i === rows - 1 && rows < 19) { ctx.fillStyle = 'rgba(138,150,255,.16)'; ctx.fillRect(tx + 1, y - 10, tw - 2, 20); } text(String(i + 1), tx + 20, y, P.muted); text(XR.x[k].toFixed(2), tx + 70, y, P.ink2); text(XR.y[k].toFixed(1), tx + 250, y, P.ink2); }
      if (rows >= 19) { ctx.globalAlpha = a * span(t, s + 4.6, s + 5.0); font(500, 12, 'ui'); text('1,101 rows · read in 0.2 s', tx + tw - 20, ty + 52 + 19 * 20, P.green, 'right'); }
      ctx.restore();
    }
    const lk = out(span(t, s + 3.0, s + 3.6));
    if (lk > 0) { ctx.save(); ctx.globalAlpha = a * lk; card(40, 500, 280, 44, 12, 'rgba(45,212,191,.08)', 'rgba(45,212,191,.35)'); lock(64, 522, P.teal); font(500, 13, 'ui'); text('Read in your browser. Nothing is uploaded.', 82, 522, P.ink); ctx.restore(); }
    ctx.restore();
  }
  function sXrd(t) {
    const [s, e] = S[2], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Fit the peaks', 'Pseudo-Voigt profiles on a fitted baseline. Size and strain from the widths.');
    const r = { x: 96, y: 136, w: 740, h: 300 };
    const marks = PEAKS.map((p, k) => span(t, s + 3.0 + k * 0.3, s + 3.5 + k * 0.3));
    xrd(r, { trace: ease(span(t, s + 0.4, s + 2.8)), base: out(span(t, s + 2.6, s + 3.4)), marks, fit: ease(span(t, s + 4.2, s + 5.4)) });
    [['Scherrer size', '11.3 ± 0.4 nm', P.copper], ['Microstrain', '0.21 %', P.purple], ['Fit R²', '0.998', P.teal]].forEach(([l, v, c], i) => chip(200 + i * 240, 540, l, v, c, span(t, s + 4.8 + i * 0.3, s + 5.4 + i * 0.3)));
    ctx.restore();
  }
  function sGap(t) {
    const [s, e] = S[3], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Read the band gap', 'UV–Vis absorbance becomes a Tauc plot; the linear region is found for you.');
    const r = { x: 110, y: 136, w: 520, h: 330 }, morph = ease(span(t, s + 1.8, s + 2.8));
    if (morph < 1) {
      ctx.save(); ctx.globalAlpha = a * (1 - morph);
      const m = axes(r, { x0: 300, x1: 500, y0: 0, y1: 1.3, xt: [300, 350, 400, 450, 500], yt: [0, 0.4, 0.8, 1.2], xl: 'Wavelength (nm)', yl: 'Absorbance' });
      const k = Math.max(2, Math.round(ease(span(t, s + 0.3, s + 1.8)) * UV.l.length));
      glowLine(UV.l.slice(0, k).map((l, i) => [m.px(l), m.py(UV.a[i])]), P.brand, 1.6);
      ctx.restore();
    }
    if (morph > 0) {
      ctx.save(); ctx.globalAlpha = a * morph;
      const m = axes(r, { x0: 2.6, x1: 4.0, y0: 0, y1: 1.1, xt: [2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0], yt: [0, 0.25, 0.5, 0.75, 1], xl: 'Photon energy hν (eV)', yl: '(αhν)²  (a.u.)', xf: v => v.toFixed(1) });
      glowLine(UV.e.map((e2, i) => [m.px(e2), m.py(UV.t[i])]).filter(p => p[0] >= r.x), P.brand, 1.6);
      const lp = ease(span(t, s + 3.0, s + 4.0));
      if (lp > 0) { const x1 = 3.6, x0 = x1 - (x1 - EG + 0.04) * lp; glowLine([[m.px(x1), m.py(icpt + slope * x1)], [m.px(x0), m.py(Math.max(-0.04, icpt + slope * x0))]], P.copper, 2.2); }
      const gp = span(t, s + 3.9, s + 4.4);
      if (gp > 0) { glowDot(m.px(EG), m.py(0), 5 * pop(gp), P.copper); chip(m.px(EG) + 10, r.y + 60, 'Band gap', 'Eg = ' + EG.toFixed(2) + ' eV', P.copper, gp); }
      ctx.restore();
    }
    const side = out(span(t, s + 0.8, s + 1.5));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 668, y = 150;
      card(x, y, 176, 300, 14, 'rgba(11,14,36,.55)');
      font(500, 11, 'ui'); text('TRANSITION', x + 18, y + 26, P.muted); font(600, 14, 'ui'); text('Direct, (αhν)²', x + 18, y + 48, P.ink);
      font(500, 11, 'ui'); text('LINEAR REGION', x + 18, y + 86, P.muted); font(600, 14, 'ui'); text(morph > 0.5 ? REG[0].toFixed(2) + '–' + REG[1].toFixed(2) + ' eV' : 'finding…', x + 18, y + 108, morph > 0.5 ? P.ink : P.muted);
      font(500, 11, 'ui'); text('ABSORPTION EDGE', x + 18, y + 146, P.muted); font(600, 14, 'ui'); text(morph > 0.5 ? Math.round(1239.84 / EG) + ' nm' : '—', x + 18, y + 168, P.ink);
      font(500, 11, 'ui'); text('95% CI', x + 18, y + 206, P.muted); font(600, 14, 'ui'); text(morph > 0.5 ? (EG - 0.02).toFixed(2) + ' to ' + (EG + 0.02).toFixed(2) + ' eV' : '—', x + 18, y + 228, P.ink);
      font(400, 11.5, 'ui'); wrap('Compare with DFT gaps in the database', 140).forEach((l, i) => text(l, x + 18, y + 266 + i * 16, P.brand));
      ctx.restore();
    }
    ctx.restore();
  }
  function sBatch(t) {
    const [s, e] = S[4], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Compare the batches', 'One-way ANOVA with Tukey post tests. Assumptions checked, stars on the graph.');
    const r = { x: 110, y: 136, w: 500, h: 340 };
    const m = axes(r, { x0: 0, x1: 4, y0: 0, y1: 80, yt: [0, 20, 40, 60, 80], yl: 'Mass activity (A/mg)' });
    const cols = [P.brand, P.copper, P.teal, P.purple];
    BATCH.forEach((b, i) => {
      const p = out(span(t, s + 0.5 + i * 0.25, s + 1.6 + i * 0.25)), cx = m.px(i + 0.5), bw = 70, top = m.py(b.m * p);
      rr(cx - bw / 2, top, bw, r.y + r.h - top, 6); const g = ctx.createLinearGradient(0, top, 0, r.y + r.h); g.addColorStop(0, cols[i]); g.addColorStop(1, 'rgba(255,255,255,.05)'); ctx.fillStyle = g; ctx.fill();
      if (p >= 1) {
        const ep = span(t, s + 1.9 + i * 0.15, s + 2.4 + i * 0.15);
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, m.py(b.m - b.sd * ep)); ctx.lineTo(cx, m.py(b.m + b.sd * ep)); ctx.moveTo(cx - 9, m.py(b.m + b.sd * ep)); ctx.lineTo(cx + 9, m.py(b.m + b.sd * ep)); ctx.moveTo(cx - 9, m.py(b.m - b.sd * ep)); ctx.lineTo(cx + 9, m.py(b.m - b.sd * ep)); ctx.stroke();
        b.pts.forEach((v, k) => { const dp = span(t, s + 2.2 + k * 0.08 + i * 0.1, s + 2.5 + k * 0.08 + i * 0.1); if (dp > 0) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(cx - 18 + k * 7.2, m.py(v), 3 * pop(dp), 0, 7); ctx.fill(); } });
      }
      font(600, 13, 'ui'); text('Batch ' + b.n, cx, r.y + r.h + 16, P.ink2, 'center');
    });
    const br = (i, j, y, label, p) => { if (p <= 0) return; ctx.save(); ctx.globalAlpha *= p; const x1 = m.px(i + 0.5), x2 = m.px(j + 0.5); line([[x1, y + 8], [x1, y], [x2, y], [x2, y + 8]], P.ink, 1.4); font(600, 13, 'ui'); text(label, (x1 + x2) / 2, y - 10, P.ink, 'center'); ctx.restore(); };
    br(0, 2, m.py(77), '***', span(t, s + 3.3, s + 3.8)); br(1, 2, m.py(69.5), 'ns', span(t, s + 3.7, s + 4.2));
    const side = out(span(t, s + 1.0, s + 1.7));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 650, y = 150;
      card(x, y, 194, 310, 14, 'rgba(11,14,36,.55)');
      font(500, 11, 'ui'); text('TEST', x + 18, y + 26, P.muted); font(600, 14, 'ui'); text("Welch's ANOVA", x + 18, y + 48, P.ink);
      font(500, 11, 'ui'); text('RESULT', x + 18, y + 86, P.muted); font(600, 14, 'ui'); text('F(3, 11) = 18.4', x + 18, y + 108, P.ink); text('p < 0.0001', x + 18, y + 128, P.copper);
      font(500, 11, 'ui'); text('CHECKS', x + 18, y + 166, P.muted);
      [['Normality', 'pass'], ['Equal variance', 'fail → Welch'], ['Outliers (Grubbs)', 'none']].forEach(([k, v], i) => { font(400, 12, 'ui'); text(k, x + 18, y + 190 + i * 22, P.ink2); font(600, 12, 'ui'); text(v, x + 176, y + 190 + i * 22, v === 'pass' || v === 'none' ? P.green : P.copper, 'right'); });
      font(400, 11.5, 'ui'); text('Tukey: C > A, B > A', x + 18, y + 276, P.ink2);
      ctx.restore();
    }
    ctx.restore();
  }
  function sFit(t) {
    const [s, e] = S[5], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Let the data choose the model', 'Every plausible equation is fitted and ranked by AICc.');
    const r = { x: 110, y: 136, w: 480, h: 330 };
    const m = axes(r, { x0: 0, x1: 105, y0: 0, y1: 170, xt: [0, 25, 50, 75, 100], yt: [0, 50, 100, 150], xl: 'Ce (mg/L)', yl: 'qe (mg/g)' });
    ISO.forEach(([c, q], i) => { const p = span(t, s + 0.4 + i * 0.08, s + 0.7 + i * 0.08); if (p > 0) glowDot(m.px(c), m.py(q), 4 * pop(p), P.ink); });
    const grid = Array.from({ length: 80 }, (_, i) => 1 + i * 1.3);
    MODELS.forEach(([nm, col, f, w], i) => {
      const p = ease(span(t, s + 1.6 + i * 0.7, s + 2.8 + i * 0.7)); if (p <= 0) return;
      const k = Math.max(2, Math.round(p * grid.length)), win = i === 0, dim = span(t, s + 4.4, s + 5.0);
      ctx.save(); ctx.globalAlpha *= win ? 1 : 1 - 0.6 * dim; (win ? glowLine : line)(grid.slice(0, k).map(c => [m.px(c), m.py(f(c))]), col, win ? 2.4 : 1.6, win ? null : [6, 4]); ctx.restore();
    });
    const side = out(span(t, s + 1.2, s + 1.9));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 630, y = 150;
      card(x, y, 214, 300, 14, 'rgba(11,14,36,.55)');
      font(500, 11, 'ui'); text('RANKED BY AICc', x + 18, y + 26, P.muted);
      [MODELS[0], MODELS[1], MODELS[2]].forEach(([nm, col, , w], i) => {
        const yy = y + 60 + i * 66, bp = ease(span(t, s + 3.0 + i * 0.3, s + 4.2 + i * 0.3));
        font(600, 14, 'ui'); text(nm, x + 18, yy, P.ink); font(600, 13, 'm'); text(Math.round(w * bp * 100) + '%', x + 196, yy, col, 'right');
        rr(x + 18, yy + 14, 178, 8, 4); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); rr(x + 18, yy + 14, 178 * w * bp, 8, 4); ctx.fillStyle = col; ctx.fill();
        font(400, 11, 'ui'); text(i === 0 ? 'ΔAICc 0 · R² 0.996' : i === 1 ? 'ΔAICc 4.6' : 'ΔAICc 7.8', x + 18, yy + 36, P.muted);
      });
      const vp = span(t, s + 4.4, s + 4.9);
      if (vp > 0) { ctx.globalAlpha = a * side * vp; font(500, 12, 'ui'); wrap('The data clearly favour the Sips isotherm.', 180).forEach((l, i) => text(l, x + 18, y + 262 + i * 16, P.copper)); }
      ctx.restore();
    }
    ctx.restore();
  }
  function sPhase(t) {
    const [s, e] = S[6], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    title(t, s, e, 'Identify the phase', 'Your peaks, matched against 5.8 million computed crystal structures.');
    const cx = 270, cy = 330, sp = out(span(t, s + 0.4, s + 1.4));
    for (let i = 0; i < 36; i++) { const ang = t * 0.6 + i * Math.PI / 18, rad = 150 + 22 * Math.sin(t * 1.3 + i), x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.55; ctx.fillStyle = `rgba(242,184,75,${0.15 + 0.25 * sp})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
    ctx.save(); ctx.globalAlpha = a * sp; cell(cx, cy, 78 * (0.6 + 0.4 * sp), t * 0.55, 0.45 + Math.sin(t * 0.35) * 0.3, true); ctx.restore();
    font(500, 12, 'ui'); text('Au, face-centred cubic', cx, cy + 150, P.ink2, 'center');
    const side = out(span(t, s + 0.8, s + 1.5));
    if (side > 0) {
      ctx.save(); ctx.globalAlpha = a * side; const x = 500, y = 136;
      card(x, y, 344, 340, 14, 'rgba(11,14,36,.55)');
      const cnt = Math.round(5812440 * ease(span(t, s + 1.0, s + 2.6)));
      font(500, 11, 'ui'); text('STRUCTURES SEARCHED', x + 18, y + 26, P.muted); font(700, 22, 'd'); text(cnt.toLocaleString('en-US'), x + 18, y + 52, P.ink);
      [['Au  Fm-3m (225)', 0.98, true], ['Au  P6₃/mmc (194)', 0.71, false], ['Au  Im-3m (229)', 0.54, false], ['Au  I4/mmm (139)', 0.43, false]].forEach(([nm, sc, win], i) => {
        const yy = y + 100 + i * 54, bp = ease(span(t, s + 2.4 + i * 0.25, s + 3.6 + i * 0.25));
        if (win && bp >= 1) { rr(x + 10, yy - 18, 324, 46, 10); ctx.fillStyle = 'rgba(74,222,128,.09)'; ctx.fill(); }
        font(600, 13.5, 'm'); text(nm, x + 18, yy, win ? P.ink : P.ink2); font(600, 13, 'm'); text((sc * bp).toFixed(2), x + 326, yy, win ? P.green : P.muted, 'right');
        rr(x + 18, yy + 12, 308, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); rr(x + 18, yy + 12, 308 * sc * bp, 6, 3); ctx.fillStyle = win ? P.green : 'rgba(201,207,255,.45)'; ctx.fill();
      });
      const vp = span(t, s + 4.0, s + 4.5);
      if (vp > 0) { ctx.globalAlpha = a * side * vp; font(500, 12, 'ui'); text('Strong match: all 5 peaks explained, lattice −0.2% vs DFT.', x + 18, y + 318, P.green); }
      ctx.restore();
    }
    ctx.restore();
  }
  function sPublish(t) {
    const [s, e] = S[7], a = env(t, s, e); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; cam(t, s, e);
    const endp = ease(span(t, s + 3.0, s + 3.6)), endA = clamp((endp - 0.08) / 0.92);   // faint text reads on a dark stage, so the end card waits
    ctx.save(); ctx.globalAlpha = a * (1 - endp);
    title(t, s, e, 'Publish', 'Journal-size figures and methods text, written from your numbers.');
    const fy = 120 + (1 - out(span(t, s + 0.2, s + 1.0))) * 40;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; rr(60, fy, 430, 400, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    xrd({ x: 118, y: fy + 30, w: 340, h: 230 }, { trace: 1, base: 1, fit: 1, marks: [1, 1, 1, 1, 1], print: true, small: true });
    font(400, 11, 'ui'); wrap('Figure 1. XRD pattern of the Au nanoparticles with pseudo-Voigt fits (copper) and the fitted baseline (dashed). Scherrer size 11.3 ± 0.4 nm.', 390).forEach((l, i) => text(l, 80, fy + 318 + i * 16, '#333'));
    ctx.fillStyle = '#ececec'; ctx.fillRect(80, fy + 358, 300, 6); ctx.fillRect(80, fy + 372, 220, 6);
    const mx = 520, my = fy; card(mx, my, 324, 400, 14, 'rgba(11,14,36,.55)');
    font(500, 11, 'ui'); text('METHODS', mx + 18, my + 26, P.muted);
    const words = 'Peaks were located on the smoothed signal and fitted simultaneously with pseudo-Voigt profiles on a linear baseline. Crystallite size was estimated with the Scherrer equation (K = 0.9, λ = 1.5406 Å) and, with microstrain, by a Williamson–Hall analysis. Analyses were performed with Lattent.'.split(' ');
    font(400, 13, 'ui'); const n = Math.floor(span(t, s + 0.8, s + 3.0) * words.length);
    wrap(words.slice(0, n).join(' '), 284).forEach((l, i) => text(l, mx + 18, my + 54 + i * 19, P.ink2));
    const bp = pop(span(t, s + 2.2, s + 2.8));
    if (bp > 0) { ctx.save(); ctx.translate(mx + 162, my + 352); ctx.scale(bp, bp); card(-130, -24, 260, 48, 24, P.copper, null); font(600, 13, 'ui'); text('TIFF · 600 dpi · 82.5 mm wide', 0, 0, '#fff', 'center'); ctx.restore(); }
    ctx.restore();
    if (endA > 0) {
      ctx.save(); ctx.globalAlpha = a * endA;
      font(700, 40, 'd'); text('Free. In your browser.', W / 2, H / 2 - 40, P.ink, 'center');
      font(700, 40, 'd'); text('Your data stays with you.', W / 2, H / 2 + 8, P.copper, 'center');
      const bw = 220; rr(W / 2 - bw / 2, H / 2 + 50, bw, 48, 24); ctx.fillStyle = P.brand; ctx.fill(); font(600, 15, 'ui'); text('Open Lattent Studio', W / 2, H / 2 + 74, '#fff', 'center');
      ctx.restore();
    }
    ctx.restore();
  }

  function draw(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;
    stage(t);
    [sTitle, sData, sXrd, sGap, sBatch, sFit, sPhase, sPublish].forEach(f => f(t));
    /* progress: a copper line and eight dots */
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, 0, W, 2); ctx.fillStyle = P.copper; ctx.fillRect(0, 0, W * (t / LOOP), 2);
    const cur = S.findIndex(([s, e], i) => t >= s && (i === S.length - 1 || t < S[i + 1][0]));
    S.forEach((_, i) => { ctx.fillStyle = i === cur ? P.copper : 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.arc(W - 150 + i * 16, H - 22, i === cur ? 3.5 : 2.5, 0, 7); ctx.fill(); });
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
