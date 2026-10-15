/* Checks of equation discovery and AutoML on synthetic data with known answers.
   Usage: node tests/ml/check_learn.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..');
const ctx = { console, Math, Date, Float64Array, Array, Object, JSON }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['assets/js/stats.js', 'assets/js/models.js', 'assets/js/analysis.js', 'assets/js/learn.js']) vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx);
const { learn: L } = ctx.BF;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));

const cases = [
  ['quadratic y = 2 + 3x²', lin(0, 5, 30), x => 2 + 3 * x * x, 0.4, r => /Quadratic/.test(r.law) && near(r.val('b'), 3, 0.05)],
  ['exponential decay y = 1 + 5·e^(−x/2)', lin(0, 10, 40), x => 1 + 5 * Math.exp(-x / 2), 0.04, r => r.law === 'Exponential decay' && near(r.val('tau'), 2, 0.06)],
  ['power law y = 3·x^1.5 (5% noise)', lin(1, 20, 30), x => 3 * Math.pow(x, 1.5), 'rel', r => r.law === 'Power law' && near(r.val('b'), 1.5, 0.04)],
  ['Arrhenius k = 1e5·exp(−4000/T)', lin(300, 600, 16), T => 1e5 * Math.exp(-4000 / T), 'rel', r => /Arrhenius/.test(r.law) && near(r.val('b'), -4000, 0.05)],
  ['Langmuir q = 50·0.3c/(1 + 0.3c)', lin(0.5, 40, 25), c => 50 * 0.3 * c / (1 + 0.3 * c), 0.4, r => /Saturation/.test(r.law) && near(r.val('K'), 1 / 0.3, 0.12)],
  ['Hall–Petch σ = 100 + 300/√d', lin(1, 100, 20), d => 100 + 300 / Math.sqrt(d), 1.5, r => /Hall–Petch/.test(r.law) && near(r.val('b'), 300, 0.08)]
];
for (const [name, xs, f, noise, test] of cases) {
  const ys = xs.map(x => { const v = f(x); return noise === 'rel' ? v * (1 + 0.05 * gauss()) : v + noise * gauss(); });
  const t = Date.now(), r = L.symreg(xs, ys);
  const b = r.best;
  console.log(`     ${name}: ${b.pretty}  [${b.law}, R² ${b.r2.toFixed(4)}, ${r.structures} structures, ${Date.now() - t} ms]`);
  ok(test(b), 'equation discovery recovers ' + name);
}
/* AutoML: Friedman #1 benchmark with five pure-noise inputs */
const fr = n => Array.from({ length: n }, () => { const x = Array.from({ length: 10 }, rnd); return { x, y: 10 * Math.sin(Math.PI * x[0] * x[1]) + 20 * (x[2] - 0.5) ** 2 + 10 * x[3] + 5 * x[4] + gauss() }; });
const tr = fr(160), te = fr(400);
const names = Array.from({ length: 10 }, (_, j) => 'x' + (j + 1));
let t = Date.now();
const a = L.automl(tr.map(d => d.x), tr.map(d => d.y), names);
console.log('     leaderboard:', a.board.map(b => `${b.name} R² ${b.r2.toFixed(3)}`).join(' | '), `(${Date.now() - t} ms)`);
ok(a.best.key !== 'linear' && a.best.r2 > 0.75, 'a nonlinear model wins on the Friedman benchmark (CV R² ' + a.best.r2.toFixed(2) + ')');
const top5 = a.importance.slice(0, 5).map(q => q.name).sort().join(',');
console.log('     importance:', a.importance.map(q => `${q.name} ${q.v.toFixed(2)}`).join(', '));
ok(a.importance.slice(0, 4).every(q => ['x1', 'x2', 'x3', 'x4', 'x5'].includes(q.name)), 'the four most important inputs are informative ones, not noise');
const cover = te.filter(d => { const p = a.predict(d.x); return d.y >= p.lo && d.y <= p.hi; }).length / te.length;
console.log('     conformal 90% interval: ±' + a.q.toFixed(2) + ', coverage on 400 new samples ' + (cover * 100).toFixed(1) + '%');
ok(cover > 0.84 && cover < 0.97, '90% prediction intervals cover about 90% of new samples');
/* AutoML: a linear problem should be won by a linear model */
const lr = Array.from({ length: 40 }, () => { const x = [rnd(), rnd(), rnd()]; return { x, y: 2 * x[0] - x[1] + 0.05 * gauss() }; });
const b2 = L.automl(lr.map(d => d.x), lr.map(d => d.y), ['a', 'b', 'c']);
console.log('     linear problem:', b2.board.map(b => `${b.name} ${b.rmse.toFixed(3)}`).join(' | '));
ok(['linear', 'ridge', 'gp'].includes(b2.best.key) && b2.best.r2 > 0.97, 'a linear problem is solved by a linear or GP model (CV R² ' + b2.best.r2.toFixed(3) + ')');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
