/* Checks the exported models: (1) the JavaScript inference reproduces scikit-learn's
   probabilities, (2) realistic datasets (Studio's examples and hand-built lab data) are
   classified as an expert would. Usage: node tests/ml/check.js [dir-with-parity.json] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const ctx = { console, Math, Float64Array };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['assets/js/stats.js', 'assets/js/ml-features.js', 'assets/models/shape-v1.js', 'assets/js/ml.js', 'assets/js/samples.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const { ml: ML, mlFeatures: F } = ctx.BF;
let fails = 0, passes = 0;
const ok = (c, n) => { if (c) { passes++; console.log('ok  ', n); } else { fails++; console.log('FAIL', n); } };

/* 1. parity with scikit-learn */
const par = JSON.parse(fs.readFileSync(path.join(process.argv[2] || __dirname, 'parity.json'), 'utf8'));
let maxd = 0;
par.X.forEach((x, i) => { const p = ML.probaFromFeatures(x); p.forEach((v, j) => { maxd = Math.max(maxd, Math.abs(v - par.P[i][j])); }); });
ok(maxd < 1e-4, `JS shape inference matches scikit-learn (max |Δp| = ${maxd.toExponential(1)})`);
let maxn = 0;
par.NX.forEach((x, i) => { maxn = Math.max(maxn, Math.abs(ML.noiseFromFeatures(x) - par.PN[i])); });
ok(maxn < 1e-4, `JS noise inference matches scikit-learn (max |Δp| = ${maxn.toExponential(1)})`);

/* 2. realistic data */
const expect = {
  arrhenius: ['thermally_activated'], xrd: ['peaks'], tauc: ['absorption_edge'], tensile: ['stress_strain'],
  isotherm: ['saturating', 'sigmoid'], floryfox: ['inverse', 'saturating'], dose: ['sigmoid']
};
const col = (t, j) => t.rows.map(r => +r[j]);
for (const s of ctx.BF_SAMPLES) {
  if (!expect[s.id]) continue;
  const t = s.make().tables[0];
  const xs = [], ys = [];
  t.rows.forEach(r => { for (let c = 1; c < Math.min(r.length, 4); c++) { xs.push(+r[0]); ys.push(+r[c]); } });
  const top = ML.classify(xs, ys);
  ok(expect[s.id].includes(top[0].key), `example "${s.title}": ${top[0].key} (${(100 * top[0].p).toFixed(0)}%), then ${top[1].key}`);
}
/* hand-built lab data, written the way people record it */
const cases = [
  ['Michaelis–Menten rates', [0.5, 1, 2, 4, 8, 16, 32, 64], [10.9, 19.5, 31.8, 47.5, 62.1, 73.0, 80.4, 84.9], ['saturating']],
  ['photoluminescence decay (ns)', [0, 2, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 100], [1000, 820, 668, 545, 452, 370, 230, 145, 62, 30, 9, 4, 2], ['exp_decay']],
  ['Hall–Petch, grain size (µm)', [0.5, 1, 2, 5, 10, 20, 50, 100], [612, 452, 340, 252, 205, 172, 148, 135], ['inverse', 'power_law']],
  ['viscosity vs shear rate (log spaced)', [0.01, 0.1, 1, 10, 100, 1000], [5020, 4890, 3210, 820, 160, 31], ['sigmoid', 'power_law', 'saturating']],
  ['calibration line (HPLC)', [0, 5, 10, 20, 40, 80], [0.4, 51, 99, 203, 398, 805], ['linear']],
  ['Raman spectrum, 2 peaks', Array.from({ length: 400 }, (_, i) => 1200 + i), Array.from({ length: 400 }, (_, i) => 50 + 900 * Math.exp(-(((i - 150) / 8) ** 2)) + 300 * Math.exp(-(((i - 280) / 12) ** 2)) + 5 * Math.sin(i * 7)), ['peaks']],
  ['crystallisation fraction vs time', [0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 25, 30], [0, 0.01, 0.06, 0.18, 0.36, 0.55, 0.72, 0.84, 0.92, 0.98, 1, 1], ['sigmoid']],
  ['Tafel region', [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1], [0.152, 0.173, 0.201, 0.222, 0.243, 0.271, 0.292], ['logarithmic']],
  ['diffusion coefficient vs T', [600, 650, 700, 750, 800, 850, 900], [2.1e-14, 1.5e-13, 8.4e-13, 3.6e-12, 1.3e-11, 3.9e-11, 1.05e-10], ['thermally_activated']],
  ['bacterial growth (early)', [0, 1, 2, 3, 4, 5, 6], [100, 205, 390, 810, 1600, 3150, 6400], ['exp_growth']]
];
{
  let sd = 11; const rn = () => { sd = (sd * 16807) % 2147483647; return (sd / 2147483647 - 0.5) * 2; };
  const R = (n, a, b) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const more = [
    ['TGA mass-loss step', R(120, 30, 800), x => 100 - 62 / (1 + Math.exp(-(x - 420) / 25)) + 0.2 * rn(), ['sigmoid']],
    ['Arrhenius with five points', [300, 325, 350, 375, 400], T => Math.exp(-52000 / (8.314 * T)) * 1e6 * (1 + 0.03 * rn()), ['thermally_activated']],
    ['Freundlich isotherm', [1, 2, 5, 10, 20, 50, 100, 200], C => 3.1 * Math.pow(C, 0.42) * (1 + 0.03 * rn()), ['power_law', 'saturating']],
    ['first-order decay from t = 5', R(10, 5, 95), t => 0.8 * Math.exp(-0.035 * t) + 0.02 + 0.004 * rn(), ['exp_decay']],
    ['brittle ceramic stress–strain', R(300, 0, 0.6), e => (e < 0.55 ? 350 * e / 0.55 * (1 - 0.03 * (e / 0.55) ** 2) : 2 + rn()), ['stress_strain']],
    ['band gap on an energy axis', R(300, 2.0, 4.5), E => (E > 3.05 ? Math.sqrt(E - 3.05) / E * 2 : 0) + 0.04 * Math.exp((E - 3.05) / 0.05) * (E <= 3.05) + 0.03 + 0.004 * rn(), ['absorption_edge']],
    ['XPS C 1s with step background', R(400, 280, 295), x => 800 + 400 / (1 + Math.exp(-(x - 285.5) / 0.6)) + 5000 * Math.exp(-(((x - 284.8) / 0.55) ** 2)) + 1800 * Math.exp(-(((x - 286.4) / 0.7) ** 2)) + 40 * rn(), ['peaks']],
    ['Curie–Weiss susceptibility', R(15, 20, 300), T => 0.12 / (T + 8) * (1 + 0.02 * rn()), ['inverse']]
  ];
  more.forEach(([n, x, f, w]) => cases.push([n, x, x.map(f), w]));
}
for (const [name, x, y, want] of cases) {
  const top = ML.classify(x, y);
  ok(want.includes(top[0].key), `${name}: ${top[0].key} (${(100 * top[0].p).toFixed(0)}%)`);
}
/* noise model on clear-cut cases */
const xs = [], yp = [], yc = [];
let s = 3; const rn = () => { s = (s * 16807) % 2147483647; return (s / 2147483647 - 0.5) * 2; };
[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].forEach(c => { for (let r = 0; r < 3; r++) { xs.push(c); const t = 2.6 * c / (35 + c) + 0.05; yp.push(t * (1 + 0.08 * rn())); yc.push(t + 0.03 * rn()); } });
const np_ = ML.noise(xs, yp), nc = ML.noise(xs, yc);
ok(np_.proportional > nc.proportional, `noise model ranks proportional scatter above constant (${np_.proportional.toFixed(2)} vs ${nc.proportional.toFixed(2)})`);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
