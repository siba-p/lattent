/* "Lattent in 30 seconds": the animated film in the home-page hero. It is drawn on a canvas from
   the same numbers as the gold-nanoparticle example, so what it shows is what Studio does: data
   dropped in, the pattern drawn, peaks fitted, size and strain, the phase identified, the figure
   exported. It plays only while on screen, and the static screenshot stands in when the visitor
   prefers reduced motion. window.__film.seek(t) renders one moment, for tests and video capture. */
(function () {
  'use strict';
  const host = document.querySelector('.l-shot'), cv = host && host.querySelector('canvas.l-film');
  if (!cv || !cv.getContext || !('roundRect' in CanvasRenderingContext2D.prototype)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const W = 880, H = 640, LOOP = 32;
  const C = { ink: '#0e1330', ink2: '#3a4160', muted: '#656d8c', line: '#e2e5ef', grid: '#eceef5', panel: '#f6f7fb', brand: '#3e4ed8', brandSoft: '#eceefd', copper: '#e0712c', copperSoft: '#fdf1e7', purple: '#8b4fc9', green: '#157a3b', greenSoft: '#e7f5ec', night: '#0b0e24', gold: '#f2b84b' };
  const ctx = cv.getContext('2d');
  const FONT = { ui: 'Inter, system-ui, sans-serif', d: "'Space Grotesk', Inter, sans-serif", m: "'JetBrains Mono', ui-monospace, monospace" };

  /* ---------- the data: the Au nanoparticle diffractogram of the worked example ---------- */
  const PEAKS = [[38.18, 1000, 0.95, '111'], [44.39, 470, 1.08, '200'], [64.58, 260, 1.34, '220'], [77.55, 280, 1.55, '311'], [81.72, 75, 1.62, '222']];
  let seed = 9;
  const rng = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const base = tt => 120 * Math.exp(-(tt - 30) / 40) + 40;
  const model = tt => { let y = base(tt); PEAKS.forEach(([c, h, w]) => { y += h * (0.55 / (1 + 4 * ((tt - c) / w) ** 2) + 0.45 * Math.exp(-4 * Math.LN2 * ((tt - c) / w) ** 2)); }); return y; };
  const X = [], Y = [], F = [], B = [];
  for (let tt = 30; tt <= 85.001; tt += 0.1) { const m = model(tt); X.push(tt); F.push(m); B.push(base(tt)); Y.push(Math.max(0, m + Math.sqrt(m) * normal())); }
  const N = X.length;

  /* ---------- helpers ---------- */
  const clamp = v => Math.max(0, Math.min(1, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const out = p => 1 - Math.pow(1 - p, 3);
  const bounce = p => { p = clamp(p); return p < 0.7 ? 1 - Math.pow(1 - p / 0.7, 3) : 1 + 0.06 * Math.sin((p - 0.7) / 0.3 * Math.PI) * (1 - (p - 0.7) / 0.3); };
  const font = (wt, px, f) => { ctx.font = `${wt} ${px}px ${FONT[f || 'ui']}`; };
  const text = (s, x, y, col, align) => { ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const card = (x, y, w, h, r, fill, stroke, shadow) => {
    if (shadow) { ctx.save(); ctx.shadowColor = 'rgba(14,19,48,.14)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); }
    rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const num = (v, d) => v.toFixed(d);

  /* ---------- the chart, drawn at any size and any stage ---------- */
  function chart(r, o) {
    const x0 = 30, x1 = 85, y1 = 1250;
    const px = v => r.x + (v - x0) / (x1 - x0) * r.w, py = v => r.y + r.h - v / y1 * r.h;
    const small = r.w < 420, ts = small ? 10 : 12;
    ctx.save(); ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    /* grid and axes */
    const yt = small ? [0, 400, 800, 1200] : [0, 200, 400, 600, 800, 1000, 1200];
    yt.forEach(v => { ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, py(v)); ctx.lineTo(r.x + r.w, py(v)); ctx.stroke(); font(400, ts, 'ui'); text(String(v), r.x - 8, py(v), C.muted, 'right'); });
    for (let v = 30; v <= 80; v += 10) { font(400, ts, 'ui'); text(String(v), px(v), r.y + r.h + 14, C.muted, 'center'); }
    ctx.strokeStyle = '#9aa0b8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.stroke();
    font(500, ts + 1, 'ui'); text('2θ (°)', r.x + r.w / 2, r.y + r.h + (small ? 28 : 34), C.ink2, 'center');
    ctx.save(); ctx.translate(r.x - (small ? 40 : 46), r.y + r.h / 2); ctx.rotate(-Math.PI / 2); text('Intensity (counts)', 0, 0, C.ink2, 'center'); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y - 20, r.w + 2, r.h + 22); ctx.clip();
    /* baseline */
    if (o.base > 0) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = C.purple; ctx.lineWidth = small ? 1 : 1.4; ctx.beginPath();
      const n = Math.round(o.base * N); for (let i = 0; i < n; i++) { const x = px(X[i]), y = py(B[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    /* peak markers */
    (o.marks || []).forEach((p, k) => {
      if (p <= 0) return; const [c, , , hkl] = PEAKS[k], x = px(c), apex = py(model(c)) - (small ? 10 : 18), top = apex + 8 + (1 - out(p)) * 30;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = C.copper; ctx.lineWidth = 1; ctx.globalAlpha *= Math.min(1, p * 2); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
      if (!small) { font(600, 11, 'm'); text('(' + hkl + ')', x, apex, C.copper, 'center'); }
      ctx.globalAlpha /= Math.min(1, p * 2);
    });
    /* data */
    if (o.trace > 0) {
      const n = Math.max(2, Math.round(o.trace * N));
      ctx.strokeStyle = C.brand; ctx.lineWidth = small ? 1 : 1.3; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = px(X[i]), y = py(Y[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      if (o.trace < 1) { const i = n - 1; ctx.fillStyle = C.brand; ctx.shadowColor = C.brand; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(px(X[i]), py(Y[i]), 3.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    }
    /* fit */
    if (o.fit > 0) {
      const n = Math.max(2, Math.round(o.fit * N));
      ctx.strokeStyle = C.copper; ctx.lineWidth = small ? 1.6 : 2.4; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = px(X[i]), y = py(F[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
    /* legend */
    if (!small && o.trace > 0) {
      let lx = r.x + 10; const ly = r.y - 10;
      [['Data', C.brand, true], ['Baseline', C.purple, o.base > 0], ['Fit', C.copper, o.fit > 0]].forEach(([n, col, on]) => {
        if (!on) return; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 8, ly, 3, 0, 7); ctx.fill();
        font(500, 12, 'ui'); text(n, lx + 22, ly, C.ink2); lx += 22 + ctx.measureText(n).width + 18;
      });
    }
    ctx.restore();
  }

  /* ---------- the fcc unit cell of gold, turning ---------- */
  function cell(cx, cy, size, a, b) {
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push({ p: [(i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5], c: i });
    [[0, .5, .5], [1, .5, .5], [.5, 0, .5], [.5, 1, .5], [.5, .5, 0], [.5, .5, 1]].forEach(p => pts.push({ p: [p[0] - .5, p[1] - .5, p[2] - .5], c: -1 }));
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const v = pts.map(q => { const [x, y, z] = q.p; const x1 = x * ca - z * sa, z1 = x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb; const d = 3.2 / (3.2 - z2); return { c: q.c, x: cx + x1 * size * d, y: cy + y1 * size * d, z: z2, d }; });
    ctx.strokeStyle = 'rgba(14,19,48,.22)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const x = i ^ j; if (x === 1 || x === 2 || x === 4) { ctx.beginPath(); ctx.moveTo(v[i].x, v[i].y); ctx.lineTo(v[j].x, v[j].y); ctx.stroke(); } }
    v.slice().sort((p, q) => p.z - q.z).forEach(p => {
      const rad = size * 0.17 * p.d, g = ctx.createRadialGradient(p.x - rad * 0.35, p.y - rad * 0.4, rad * 0.1, p.x, p.y, rad);
      g.addColorStop(0, '#ffe4a3'); g.addColorStop(0.6, C.gold); g.addColorStop(1, '#b7791f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.fill();
    });
  }

  /* ---------- scenes ---------- */
  const CAPS = [[0, 'Drop a workbook or an instrument file. Nothing is uploaded.'], [5.2, 'Your diffractogram, drawn from the table.'], [10.2, 'Peaks found and fitted with pseudo-Voigt profiles.'], [16.6, 'Crystallite size and strain, with their uncertainties.'], [21.6, 'The phase, matched against 5.8 million computed structures.'], [27.6, 'Figure and methods text, ready for the paper.']];
  const CRUMB = [[0, 'Import'], [5, 'Peak analysis (XRD)'], [21.6, 'Identify phases'], [27.6, 'Export figure']];
  const METHODS = 'Peaks were located on the smoothed signal and fitted simultaneously with pseudo-Voigt profiles on a linear baseline. Crystallite size was estimated with the Scherrer equation (K = 0.9, λ = 1.5406 Å) and, with microstrain, by a Williamson–Hall analysis. Analyses were performed with Lattent.'.split(' ');

  function draw(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);

    /* top strip: breadcrumb and a step counter */
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 46); ctx.fillStyle = C.line; ctx.fillRect(0, 46, W, 1);
    const crumb = CRUMB.filter(c => t >= c[0]).pop()[1];
    font(500, 12.5, 'ui'); text('Au nanoparticles', 24, 23, C.brand); const cw = ctx.measureText('Au nanoparticles').width;
    text('›', 24 + cw + 8, 23, C.muted); font(600, 13.5, 'd'); text(crumb, 24 + cw + 22, 23, C.ink);
    const step = CAPS.filter(c => t >= c[0]).length;
    font(500, 11.5, 'm'); text(`${step} / 6`, W - 24, 23, C.muted, 'right');

    /* scene 1: the file and the table */
    const s1 = 1 - span(t, 4.6, 5.4);
    if (s1 > 0) {
      ctx.save(); ctx.globalAlpha = s1;
      const drop = bounce(span(t, 0.1, 1.0)), tuck = ease(span(t, 1.3, 2.0));
      const fx = 290 + tuck * (-230), fy = -110 + drop * 300 + tuck * (-130), fw = 300 - tuck * 90, fh = 92 - tuck * 46;
      card(fx, fy, fw, fh, 12, '#fff', C.line, true);
      rr(fx + 14, fy + (fh - 34) / 2, 34, 34, 8); ctx.fillStyle = '#1d6f42'; ctx.fill(); font(700, 9.5, 'ui'); text('XLSX', fx + 31, fy + fh / 2, '#fff', 'center');
      font(600, 14 - tuck * 2, 'ui'); text('Au_nanoparticles.xlsx', fx + 60, fy + fh / 2 - (tuck ? 0 : 9), C.ink);
      if (tuck < 0.5) { ctx.globalAlpha = s1 * (1 - tuck * 2); font(400, 12, 'ui'); text('1,101 rows · 2 columns · sheet “scan”', fx + 60, fy + fh / 2 + 11, C.muted); ctx.globalAlpha = s1; }
      const tb = ease(span(t, 1.6, 2.3));
      if (tb > 0) {
        ctx.globalAlpha = s1 * tb;
        const tx = 200, ty = 128 + (1 - tb) * 24, tw = 480, rowH = 20, rows = Math.floor(span(t, 2.2, 4.3) * 21);
        card(tx, ty, tw, 430, 12, '#fff', C.line, true);
        ctx.fillStyle = C.panel; ctx.fillRect(tx + 1, ty + 1, tw - 2, 30);
        font(600, 12, 'ui'); text('#', tx + 20, ty + 16, C.muted); text('2θ (°)', tx + 70, ty + 16, C.ink); text('Intensity (counts)', tx + 250, ty + 16, C.ink);
        font(400, 12.5, 'm');
        for (let i = 0; i < rows; i++) {
          const y = ty + 46 + i * rowH, k = i * 25;
          if (i === rows - 1 && t < 4.4) { ctx.fillStyle = C.brandSoft; ctx.fillRect(tx + 1, y - 10, tw - 2, rowH); }
          text(String(i + 1), tx + 20, y, C.muted); text(X[k].toFixed(2), tx + 70, y, C.ink2); text(Y[k].toFixed(1), tx + 250, y, C.ink2);
        }
        if (rows < 21 && t > 2.2) { font(400, 12, 'ui'); text('reading…', tx + tw - 20, ty + 46 + rows * rowH, C.muted, 'right'); }
      }
      ctx.restore();
    }

    /* scenes 2–5: the chart */
    const s2 = span(t, 4.9, 5.7) * (1 - span(t, 27.2, 28.0));
    if (s2 > 0) {
      const shrink = ease(span(t, 16.6, 17.4));
      const r = { x: 78, y: 92, w: 760, h: 380 - shrink * 90 };
      const dim = 1 - 0.55 * ease(span(t, 21.6, 22.4));
      const marks = PEAKS.map((p, k) => span(t, 11.0 + k * 0.45, 11.6 + k * 0.45));
      chart(r, { alpha: s2 * dim, trace: ease(span(t, 5.9, 9.4)), base: out(span(t, 10.2, 11.2)), marks, fit: ease(span(t, 13.0, 15.8)) });
      /* scene 4: results */
      const s4 = span(t, 16.8, 17.5) * (1 - span(t, 27.2, 28.0));
      if (s4 > 0) {
        ctx.save(); ctx.globalAlpha = s4 * dim;
        const ky = 436 + (1 - out(span(t, 16.8, 17.6))) * 30, kw = 236, gap = 26, kx0 = 78;
        const n1 = 11.3 * ease(span(t, 17.2, 19.0)), n2 = 0.21 * ease(span(t, 17.5, 19.3)), n3 = 0.998 * ease(span(t, 17.8, 19.6));
        [['Mean Scherrer size', num(n1, 1), 'nm', '± 0.4 nm'], ['Microstrain ε', num(n2, 2), '%', 'Williamson–Hall'], ['Fit R²', num(n3, 3), '', '5 peaks, all explained']].forEach(([k, v, u, s], i) => {
          const x = kx0 + i * (kw + gap);
          card(x, ky, kw, 100, 12, '#fff', C.line, true);
          font(500, 12, 'ui'); text(k, x + 18, ky + 24, C.muted);
          font(700, 30, 'd'); text(v, x + 18, ky + 54, C.ink); const vw = ctx.measureText(v).width;
          font(500, 14, 'ui'); text(u, x + 18 + vw + 6, ky + 58, C.muted);
          font(400, 11.5, 'ui'); text(s, x + 18, ky + 82, C.green);
        });
        ctx.restore();
      }
      /* scene 5: the phase */
      const s5 = span(t, 21.8, 22.6) * (1 - span(t, 27.2, 28.0));
      if (s5 > 0) {
        ctx.save(); ctx.globalAlpha = s5;
        const px = 470 + (1 - out(span(t, 21.8, 22.8))) * 60, py = 92;
        card(px, py, 372, 338, 14, '#fff', C.line, true);
        font(500, 11.5, 'ui'); text('PHASE IDENTIFIED', px + 22, py + 26, C.muted);
        font(700, 22, 'd'); text('Gold, Au', px + 22, py + 52, C.ink);
        font(500, 13, 'm'); text('Fm-3m (225) · fcc', px + 22, py + 76, C.ink2);
        const m = 0.98 * ease(span(t, 22.6, 24.4));
        font(500, 12, 'ui'); text('Match', px + 22, py + 104, C.muted); text(num(m, 2), px + 350, py + 104, C.ink, 'right');
        rr(px + 22, py + 116, 328, 8, 4); ctx.fillStyle = C.grid; ctx.fill(); rr(px + 22, py + 116, 328 * m, 8, 4); ctx.fillStyle = C.green; ctx.fill();
        font(400, 12, 'ui'); text('All 5 peaks explained · lattice −0.2% vs DFT', px + 22, py + 140, C.ink2);
        cell(px + 186, py + 236, 60, t * 0.7, 0.5 + Math.sin(t * 0.4) * 0.25);
        font(400, 11, 'ui'); text('Alexandria entry 1 of 9 Au structures', px + 186, py + 318, C.muted, 'center');
        ctx.restore();
      }
    }

    /* scene 6: the figure and the methods */
    const s6 = span(t, 27.6, 28.4) * (1 - span(t, 31.3, 32));
    if (s6 > 0) {
      ctx.save(); ctx.globalAlpha = s6;
      const fy = 92 + (1 - out(span(t, 27.6, 28.6))) * 30;
      card(60, fy, 440, 420, 12, '#fff', C.line, true);
      chart({ x: 118, y: fy + 30, w: 350, h: 250 }, { trace: 1, base: 1, fit: 1, marks: [1, 1, 1, 1, 1] });
      font(400, 11.5, 'ui'); text('Figure 1. XRD pattern of the Au nanoparticles with pseudo-Voigt fits', 80, fy + 340, C.ink2);
      text('(copper line) and the fitted baseline (dashed). Scherrer size 11.3 ± 0.4 nm.', 80, fy + 358, C.ink2);
      ctx.fillStyle = C.grid; ctx.fillRect(80, fy + 380, 300, 6); ctx.fillRect(80, fy + 394, 220, 6);
      /* the methods paragraph, typed */
      const mx = 530, my = fy;
      card(mx, my, 290, 420, 12, '#fff', C.line, true);
      font(500, 11.5, 'ui'); text('METHODS', mx + 20, my + 26, C.muted);
      font(400, 13, 'ui'); ctx.fillStyle = C.ink2; ctx.textAlign = 'left';
      const words = Math.floor(span(t, 28.2, 31.0) * METHODS.length);
      let line = '', ly = my + 54; const lines = [];
      for (let i = 0; i < words; i++) { const trial = line ? line + ' ' + METHODS[i] : METHODS[i]; if (ctx.measureText(trial).width > 250) { lines.push(line); line = METHODS[i]; } else line = trial; }
      lines.push(line); lines.forEach(l => { ctx.fillText(l, mx + 20, ly); ly += 19; });
      /* the export badge */
      const bp = bounce(span(t, 29.6, 30.4));
      if (bp > 0) {
        ctx.save(); ctx.translate(mx + 145, my + 372); ctx.scale(bp, bp);
        card(-120, -24, 240, 48, 24, C.night, null, true);
        font(600, 13, 'ui'); text('TIFF · 600 dpi · 82.5 mm wide', 0, 0, '#fff', 'center');
        ctx.restore();
      }
      ctx.restore();
    }

    /* caption and progress */
    const cap = CAPS.filter(c => t >= c[0]).pop();
    const capA = Math.min(span(t, cap[0], cap[0] + 0.5), 1);
    ctx.fillStyle = 'rgba(11,14,36,.94)'; ctx.fillRect(0, H - 50, W, 50);
    ctx.globalAlpha = capA; font(500, 15, 'ui'); text(cap[1], 24, H - 25, '#eef0fb'); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, H - 50, W, 2); ctx.fillStyle = C.copper; ctx.fillRect(0, H - 50, W * (t / LOOP), 2);
    /* the loop closes on white */
    const fade = t < 0.5 ? span(t, 0, 0.5) : t > LOOP - 0.5 ? 1 - span(t, LOOP - 0.5, LOOP) : 1;
    if (fade < 1) { ctx.fillStyle = `rgba(246,247,251,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- play only while on screen ---------- */
  let t0 = null, paused = true, visible = false, raf = 0, held = 0;
  function frame(now) {
    if (paused) return;
    if (t0 == null) t0 = now - held * 1000;
    draw(((now - t0) / 1000) % LOOP);
    raf = requestAnimationFrame(frame);
  }
  function play() { if (!paused) return; paused = false; t0 = null; raf = requestAnimationFrame(frame); }
  function pause() { if (paused) return; paused = true; cancelAnimationFrame(raf); if (t0 != null) held = ((performance.now() - t0) / 1000) % LOOP; }
  const update = () => { if (visible && document.visibilityState === 'visible') play(); else pause(); };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; update(); }, { threshold: 0.2 }).observe(cv);
  document.addEventListener('visibilitychange', update);
  let hover = false;
  cv.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hover = true; pause(); } });
  cv.addEventListener('pointerleave', () => { if (hover) { hover = false; update(); } });
  window.__film = { seek(t) { pause(); held = t; draw(t); }, play, pause, LOOP };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { host.classList.add('on'); draw(0); update(); });
})();
