/* Simulates labelled XY datasets for training Benchfit's shape and noise models.
   Every dataset is turned into features by assets/js/ml-features.js, the same code the
   browser uses. Usage: node tests/ml/simulate.js <per-class> <seed> <out.json> */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'ml-features.js'), 'utf8'), ctx);
const F = ctx.BF.mlFeatures;

const CLASSES = ['linear', 'polynomial', 'exp_decay', 'saturating', 'sigmoid', 'exp_growth', 'power_law', 'logarithmic', 'thermally_activated', 'inverse', 'peaks', 'absorption_edge', 'stress_strain'];

let seed = +(process.argv[3] || 1) >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();
const LU = (a, b) => Math.exp(U(Math.log(a), Math.log(b)));
const I = (a, b) => Math.floor(U(a, b + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const normal = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

function grid(n, a, b, mode) {
  if (mode === 'log' && a > 0) return Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));
  if (mode === 'dilution' && a === 0) { const k = n - 1, base = b / Math.pow(2, k - 1); return [0].concat(Array.from({ length: k }, (_, i) => base * Math.pow(2, i))); }
  if (mode === 'irregular') { const v = Array.from({ length: n }, () => U(a, b)).sort((p, q) => p - q); v[0] = a; v[n - 1] = b; return v; }
  return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
}
/* where a measured range starts: often exactly zero, otherwise somewhere above it */
const start = x1 => (rnd() < 0.5 ? 0 : U(0.01, 0.3) * x1);
function smallSet(log) {
  const n = I(6, 30);
  /* dilution series are short */
  const r = rnd();
  return { n, mode: log && r < 0.45 ? 'log' : r < 0.6 ? 'irregular' : r < 0.75 ? 'dilution' : 'lin', reps: rnd() < 0.35 ? I(2, 3) : 1 };
}
/* add noise of either kind, replicates and occasional outliers */
function measure(x, f, reps, opt) {
  opt = opt || {};
  const yt = x.map(f);
  let lo = Infinity, hi = -Infinity;
  yt.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
  const range = (hi - lo) || 1;
  const kind = opt.kind || (rnd() < 0.5 ? 'const' : 'prop');
  const level = opt.level != null ? opt.level : LU(0.004, 0.08);
  const xs = [], ys = [];
  for (let r = 0; r < reps; r++) x.forEach((xx, i) => {
    let y = yt[i] + normal() * (kind === 'prop' ? level * Math.abs(yt[i]) : level * range);
    if (opt.positive && y <= 0) y = Math.abs(yt[i]) * 0.5 + 1e-12;
    xs.push(xx); ys.push(y);
  });
  if (rnd() < 0.05 && ys.length > 8) { const k = I(0, ys.length - 1); ys[k] += (rnd() < 0.5 ? -1 : 1) * range * U(0.1, 0.3); }
  const scale = LU(1e-3, 1e4) * (opt.allowNeg && rnd() < 0.1 ? -1 : 1), shift = opt.noShift ? 0 : (rnd() < 0.3 ? U(-0.5, 0.5) * range * scale : 0);
  return { xs, ys: ys.map(v => v * scale + shift), kind, level };
}

const GEN = {
  linear() {
    const xe = U(12, 200), s = smallSet(false), x = s.mode === 'dilution' ? grid(I(5, 9), 0, xe, 'dilution') : grid(s.n, start(xe) * 0.5, xe, s.mode), a = U(-5, 5), b = U(0.2, 5) * (rnd() < 0.5 ? -1 : 1);
    return measure(x, v => a + b * v, s.reps);
  },
  polynomial() {
    const xe = U(5, 50), s = smallSet(false), x = grid(Math.max(s.n, 8), start(xe), xe, s.mode === 'dilution' ? 'lin' : s.mode);
    const x1 = x[x.length - 1], c = U(0.4, 3) * (rnd() < 0.5 ? 1 : -1) / (x1 * x1), b = U(-2, 2) / x1, d = rnd() < 0.4 ? U(-1, 1) / (x1 * x1 * x1) * 2 : 0;
    const vertex = U(-0.2, 1.1) * x1;
    const fp = v => b * v + c * (v - vertex) ** 2 + d * v ** 3;
    const yv = x.map(fp), lo = Math.min(...yv), hi = Math.max(...yv);
    const dev = Math.max(...x.map((v, i) => Math.abs(yv[i] - (yv[0] + (yv[yv.length - 1] - yv[0]) * (v - x[0]) / (x1 - x[0])))));
    if (!(hi > lo) || dev < 0.12 * (hi - lo)) return GEN.polynomial();
    return measure(x, fp, s.reps);
  },
  exp_decay() {
    const s = smallSet(false), T = U(10, 500), x = grid(Math.max(s.n, 7), rnd() < 0.75 ? 0 : start(T), T, s.mode === 'log' || s.mode === 'dilution' ? 'lin' : s.mode), k = U(1, 6) / T, A = U(0.5, 5), c = U(0, 2);
    const kind = I(0, 3);
    if (kind === 0) return measure(x, v => A * Math.exp(-k * v) + c, s.reps);
    if (kind === 1) { const k2 = k * U(5, 20); return measure(x, v => A * Math.exp(-k * v) + A * U(0.5, 2) * Math.exp(-k2 * v) + c, s.reps); }
    if (kind === 2) { const b = U(0.35, 0.95); return measure(x, v => A * Math.exp(-Math.pow(k * v, b)) + c, s.reps); }
    return measure(x, v => A / (1 + A * k * 3 * v) + c, s.reps);
  },
  saturating() {
    const s = smallSet(true), log = s.mode === 'log', x = s.mode === 'dilution' ? grid(I(6, 10), 0, U(20, 500), 'dilution') : grid(Math.max(s.n, 6), log ? U(0.1, 2) : U(0, 2), U(20, 500), s.mode === 'dilution' ? 'lin' : s.mode), x1 = x[x.length - 1];
    const K = U(1.5, 15) / x1, qm = U(1, 100), kind = I(0, 3);
    if (kind === 0) return measure(x, v => qm * K * v / (1 + K * v), s.reps);
    if (kind === 1) return measure(x, v => qm * (1 - Math.exp(-K * v)), s.reps);
    if (kind === 2) { const n = U(0.6, 1.3); return measure(x, v => qm * Math.pow(K * v, n) / (1 + Math.pow(K * v, n)), s.reps); }
    const y0 = U(0, 0.5) * qm; return measure(x, v => y0 + (qm - y0) * (1 - Math.exp(-K * v)), s.reps);
  },
  sigmoid() {
    const kind = I(0, 3), s = smallSet(kind === 1);
    const n = Math.max(s.n, 8), dir = rnd() < 0.5 ? 1 : -1;
    if (kind === 1) { const x = grid(n, LU(1e-4, 1), 0, 'lin').map((_, i, a) => 0); const lo = LU(1e-4, 1), x2 = grid(n, lo, lo * LU(300, 1e5), 'log'), mid = Math.log10(lo) + U(0.3, 0.7) * Math.log10(x2[n - 1] / lo), h = U(0.7, 3) * dir; return measure(x2, v => 1 / (1 + Math.pow(10, (mid - Math.log10(v)) * h)), s.reps); }
    const x1 = U(5, 300), x = grid(n, start(x1) * 0.5, x1, s.mode === 'log' || s.mode === 'dilution' ? 'lin' : s.mode);
    if (kind === 0) { const m = U(0.25, 0.75) * x1, w = U(0.04, 0.15) * x1; return measure(x, v => 1 / (1 + Math.exp(-dir * (v - m) / w)), s.reps); }
    if (kind === 2) { const th = U(0.25, 0.6) * x1, p = U(2, 4); return measure(x, v => 1 - Math.exp(-Math.LN2 * Math.pow(v / th, p)), s.reps); }
    const b = U(3, 10), c = U(4, 12) / x1; return measure(x, v => Math.exp(-b * Math.exp(-c * v)), s.reps);
  },
  exp_growth() {
    const s = smallSet(false), x1 = U(5, 100), x0 = start(x1) * 0.6, x = grid(Math.max(s.n, 6), x0, x1, s.mode === 'log' || s.mode === 'dilution' ? 'lin' : s.mode), k = U(1.5, 6) / (x1 - x0);
    return measure(x, v => U(0.5, 2) * Math.exp(k * v), s.reps, { positive: true, noShift: true });
  },
  power_law() {
    const s = smallSet(true), a = LU(0.01, 10), x = grid(Math.max(s.n, 6), a, a * LU(10, 1e4), s.mode === 'lin' && rnd() < 0.5 ? 'log' : s.mode);
    const b = pick([U(0.15, 0.8), U(1.3, 3), U(-2.5, -0.2)]);
    return measure(x, v => Math.pow(v, b), s.reps, { positive: true, noShift: true });
  },
  logarithmic() {
    const s = smallSet(true), a = LU(0.01, 10), x = grid(Math.max(s.n, 6), a, a * LU(30, 1e4), s.mode);
    const b = U(0.5, 3) * (rnd() < 0.5 ? 1 : -1);
    const a0 = rnd() < 0.5 ? U(-1, 1) : U(2, 12) * Math.abs(b) * Math.sign(b) * -Math.log(x[0]) * (rnd() < 0.5 ? 1 : 0.6);
    return measure(x, v => a0 + b * Math.log(v), s.reps, { allowNeg: true });
  },
  thermally_activated() {
    const n = I(5, 22), T0 = U(180, 900), T1 = T0 * U(1.15, 2.2), x = grid(n, T0, T1, rnd() < 0.2 ? 'irregular' : 'lin');
    const reps = rnd() < 0.3 ? 2 : 1;
    if (rnd() < 0.75) { const Ea = U(15, 200) * 1000; const decades = Ea / (8.314 * Math.LN10) * (1 / T0 - 1 / T1); if (decades < 0.6) return GEN.thermally_activated(); return measure(x, v => Math.exp(-Ea / (8.314 * v)) * 1e8, reps, { kind: 'prop', positive: true, noShift: true }); }
    const Tz = T0 * U(0.5, 0.85), B = U(300, 2500);
    return measure(x, v => Math.exp(-B / (v - Tz)), reps, { kind: 'prop', positive: true, noShift: true });
  },
  inverse() {
    const s = smallSet(true), a = LU(0.5, 1000), x = grid(Math.max(s.n, 6), a, a * LU(8, 300), s.mode === 'lin' ? pick(['lin', 'log']) : s.mode);
    const kind = I(0, 3), c = U(-1, 1), b = U(0.5, 5) * a * (rnd() < 0.5 ? 1 : -1);
    if (kind === 0) return measure(x, v => c + b / v, s.reps);
    if (kind === 1) return measure(x, v => c + b / Math.sqrt(v), s.reps);
    if (kind === 2) return measure(x, v => c + b * a / (v * v), s.reps);
    const th = -U(0.05, 0.9) * a; return measure(x, v => 1 / (v - th), s.reps, { positive: true });
  },
  peaks() {
    const small = rnd() < 0.25;
    const n = small ? I(12, 45) : I(150, 3000);
    const x0 = pick([U(5, 20), U(100, 400), U(0, 10), U(250, 400)]), x1 = x0 + pick([U(40, 100), U(500, 3500), U(5, 50)]);
    const x = grid(n, x0, x1, 'lin'), span = x1 - x0;
    const k = small ? 1 : I(1, 9);
    const pk = Array.from({ length: k }, () => ({ c: U(x0 + 0.08 * span, x1 - 0.08 * span), h: LU(0.1, 1), w: span * (small ? U(0.08, 0.25) : LU(0.004, 0.05)), eta: rnd() }));
    const base = pick([() => 0, v => U(0, 0.3) * (v - x0) / span, v => 0.4 * Math.exp(-(v - x0) / (span * U(0.1, 0.5)))]);
    const b0 = base, bl = U(0, 0.3);
    return measure(x, v => bl + b0(v) + pk.reduce((s, p) => s + p.h * (p.eta / (1 + 4 * ((v - p.c) / p.w) ** 2) + (1 - p.eta) * Math.exp(-4 * Math.LN2 * ((v - p.c) / p.w) ** 2)), 0), 1, { level: LU(0.003, 0.05), kind: 'const', noShift: true });
  },
  absorption_edge() {
    const nm = rnd() < 0.6, Eg = U(1.2, 4.2), tail = U(0.02, 0.15), direct = rnd() < 0.6;
    const f = E => (E > Eg ? Math.pow(E - Eg, direct ? 0.5 : 2) / E * U(0.9, 1.1) : 0) + 0.15 * Math.exp((E - Eg) / tail) * (E <= Eg) + 0.02;
    if (nm) {
      const lgap = 1239.84 / Eg, l0 = Math.max(200, lgap - U(60, 250)), l1 = lgap + U(80, 400);
      const x = grid(I(80, 700), l0, l1, 'lin');
      return measure(x, l => f(1239.84 / l), 1, { level: LU(0.002, 0.03), kind: 'const', noShift: true });
    }
    const x = grid(I(80, 700), Math.max(0.8, Eg - U(0.5, 1.5)), Eg + U(0.4, 1.8), 'lin');
    return measure(x, f, 1, { level: LU(0.002, 0.03), kind: 'const', noShift: true });
  },
  stress_strain() {
    const n = I(80, 1200), eMax = pick([U(0.5, 4), U(5, 40), U(40, 300)]), x = grid(n, 0, eMax, 'lin');
    const E = 1, ey = U(0.05, 0.4) * eMax, sy = E * ey, kind = I(0, 2), brk = U(0.85, 0.99) * eMax;
    const h = U(0, 0.6) * sy / (eMax - ey);
    const f = e => {
      if (e > brk) return Math.max(0, sy * (kind === 0 ? 0.02 : 0.3) * (1 - (e - brk) / (eMax - brk)));
      if (kind === 0) return E * e * (1 - 0.2 * (e / brk) ** 3);
      const smooth = sy * Math.pow(Math.pow(e / ey, -4) + 1, -1 / 4) * (e > 0 ? 1 : 0);
      return kind === 1 ? smooth + h * Math.max(0, e - ey) : smooth * (1 + 0.15 * Math.exp(-(((e - ey * 1.3) / (0.2 * ey)) ** 2))) - 0.1 * sy * Math.max(0, (e - ey * 1.3) / eMax);
    };
    return measure(x, f, 1, { level: LU(0.002, 0.02), kind: 'const', noShift: true });
  }
};

const per = +(process.argv[2] || 200);
const rows = [], labels = [], noise = [], noiseLab = [];
for (let c = 0; c < CLASSES.length; c++) {
  let made = 0, guard = 0;
  while (made < per && guard++ < per * 5) {
    const d = GEN[CLASSES[c]]();
    const ft = F.xy(d.xs, d.ys);
    if (!ft || ft.f.some(v => !isFinite(v))) continue;
    rows.push(ft.f.map(v => Math.round(v * 1e5) / 1e5)); labels.push(c); made++;
    const nf = F.noise(d.xs, d.ys);
    if (nf && nf.f.every(isFinite) && nf.dyn > 0.3 && d.level > 0.006 && c < 10) { noise.push(nf.f.map(v => Math.round(v * 1e5) / 1e5)); noiseLab.push(d.kind === 'prop' ? 1 : 0); }
  }
}
fs.writeFileSync(process.argv[4] || 'sim.json', JSON.stringify({ classes: CLASSES, X: rows, y: labels, NX: noise, Ny: noiseLab }));
console.log('simulated', rows.length, 'shape samples,', noise.length, 'noise samples');
