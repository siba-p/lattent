/* The write-ups: every analysis kind produces Methods, Results, Figure legend and Interpretation
   from results built by the real engine, with no leaked "undefined" or "NaN" and enough substance
   to stand in a methods section. Run: node tests/writeup/check.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const ctx = { console, Math, Float64Array, Number, String, Array, Object, JSON, Date }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
for (const f of ['stats.js', 'models.js', 'analysis.js', 'report.js', 'writeup.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', f), 'utf8'), ctx);
const { stats: S, models: M, analysis: A, writeup: W } = ctx.BF;
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const plain = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const rng = S.rng(11), noise = s => s * rng.normal();
const series = (name, xs, ys, reps) => ({ name, xs, ys, reps: reps || 1, means: xs.map((x, i) => ({ x, y: ys[i] })) });
const check = (kind, res, o, t) => {
  let secs; try { secs = W.kinds[kind](res, o, t, { site: 'test', label: kind }); } catch (e) { fail++; console.log('FAIL', kind, 'threw', e.message); return; }
  ok(kind + ' returns sections', Array.isArray(secs) && secs.length >= 3);
  if (!secs) return;
  const titles = secs.map(s => s.title);
  ok(kind + ' has Methods, Results and a legend', titles.includes('Methods') && titles.includes('Results') && titles.includes('Figure legend'));
  ok(kind + ' has an interpretation', titles.includes('Interpretation'));
  const all = secs.map(s => plain(s.html)).join(' ');
  ok(kind + ' no leaks', !/undefined|NaN|\[object|null\b/.test(all)); if (/undefined|NaN|\[object|null\b/.test(all) && process.env.DEBUG) console.log('  LEAK near:', all.slice(Math.max(0, all.search(/undefined|NaN|\[object|null\b/) - 80), all.search(/undefined|NaN|\[object|null\b/) + 40));
  const m = plain(secs.find(s => s.title === 'Methods').html), r = plain(secs.find(s => s.title === 'Results').html);
  ok(kind + ' methods are substantial', m.length >= 300);
  ok(kind + ' results are substantial', r.length >= 110); if (process.env.DEBUG && (r.length < 110 || m.length < 300)) console.log('  TEXT', kind, 'M', m.length, 'R', r.length, '::', r.slice(0, 200));
  ok(kind + ' methods cite the software', /Lattent/.test(m));
  return secs;
};
const T = (name, cols, ylabel) => ({ name, cols, ylabel: ylabel || cols[1] });

/* nonlinear regression: Arrhenius conductivity */
const Tk = [298, 313, 323, 333, 343, 353, 363, 373, 383, 393], sig = Tk.map(T => Math.exp(9.2 - 38500 / (8.314 * T)) * (1 + noise(0.03)));
const arr = M.byId('arrhenius'), s1 = series('LLZO', Tk, sig, 3);
const nl = { d: {}, model: arr, fits: [{ s: s1, r: M.fit(arr, Tk, sig, { fixed: {}, weight: '1/y2' }) }] };
const secs = check('nlfit', nl, { model: 'arrhenius', weight: '1/y2', logy: true, fixed: {} }, T('LLZO conductivity', ['Temperature (K)', 'σ (S/cm)']));
ok('nlfit results carry Ea with CI and R²', /Eₐ \(kJ\/mol\) = [\d.]+ ± [\d.]+ \(95% CI/.test(plain(secs[1].html)) && /R² = 0\.9/.test(plain(secs[1].html)));
ok('nlfit methods state weighting and the estimator', /Levenberg–Marquardt/.test(plain(secs[0].html)) && /1\/Y²/.test(plain(secs[0].html)));
/* automatic model selection: three isotherm candidates */
const C = [2, 4, 8, 15, 25, 40, 60, 80, 100], q = C.map(c => 150 * Math.pow(0.06 * c, 0.8) / (1 + Math.pow(0.06 * c, 0.8)) + noise(3));
const cand = ['sips', 'langmuir', 'freundlich'].map(id => M.byId(id)).filter(Boolean).map(md => { const f = M.fit(md, C, q, { fixed: {}, weight: 'none' }); return { model: md, fit: f.fit }; }).filter(x => x.fit && isFinite(x.fit.aicc));
const minA = Math.min(...cand.map(x => x.fit.aicc)); cand.forEach(x => { x.dAICc = x.fit.aicc - minA; }); const wsum = cand.reduce((s, x) => s + Math.exp(-x.dAICc / 2), 0); cand.forEach(x => { x.weight = Math.exp(-x.dAICc / 2) / wsum; }); cand.sort((a, b) => a.dAICc - b.dAICc);
check('autofit', { s: series('qe', C, q), list: cand }, { field: 'shape' }, T('Isotherm', ['Ce (mg/L)', 'qe (mg/g)']));
/* linear regression */
const xl = [1, 2, 3, 4, 5, 6, 7, 8], yl = xl.map(x => 2 + 0.8 * x + noise(0.2));
{ const n = xl.length, mx = S.mean(xl), my = S.mean(yl), sxx = xl.reduce((a, x) => a + (x - mx) ** 2, 0), b1 = xl.reduce((a, x, i) => a + (x - mx) * (yl[i] - my), 0) / sxx, b0 = my - b1 * mx;
  const resid = yl.map((y, i) => y - b0 - b1 * xl[i]), s2 = resid.reduce((a, v) => a + v * v, 0) / (n - 2), se1 = Math.sqrt(s2 / sxx), se0 = Math.sqrt(s2 * (1 / n + mx * mx / sxx)), tq = S.tinv(0.975, n - 2);
  const sst = yl.reduce((a, y) => a + (y - my) ** 2, 0), f = { p: [b0, b1], se: [se0, se1], ci: [[b0 - tq * se0, b0 + tq * se0], [b1 - tq * se1, b1 + tq * se1]], r2: 1 - resid.reduce((a, v) => a + v * v, 0) / sst, dof: n - 2, n };
  const pr = A.pearson(xl, yl);
  check('linreg', { d: {}, fits: [{ s: series('S1', xl, yl), f, pr, xint: -b0 / b1, xintSE: 0.1, pSlope: 2 * (1 - S.tcdf(Math.abs(b1 / se1), n - 2)) }], cmp: null }, {}, T('Calibration', ['Concentration (µg/mL)', 'Area (mAU·s)'])); }
/* peaks with XRD */
const tt = []; for (let v = 30; v <= 85; v += 0.1) tt.push(+v.toFixed(2));
const PK = [[38.18, 1000, 0.95], [44.39, 470, 1.08], [64.58, 260, 1.34], [77.55, 280, 1.55]];
const yy = tt.map(x => 60 + PK.reduce((s, [c, h, w]) => s + h * (0.5 / (1 + 4 * ((x - c) / w) ** 2) + 0.5 * Math.exp(-4 * Math.LN2 * ((x - c) / w) ** 2)), 0) + noise(4));
const base = A.baseline(tt, yy, 2), yc = yy.map((v, i) => v - base[i]), found = A.findPeaks(tt, yc, { prominence: 0.05, smooth: 3 }), pf = A.fitPeaks(tt, yc, found, 'pv');
ok('engine fitted the peaks', !pf.error && pf.peaks.length >= 3);
if (!pf.error) { const xr = A.xrd(pf.peaks, 1.5406, 0.9, 0.08); const ps = check('peaks', { d: {}, s: series('XRD', tt, yy), x: tt, y: yy, base, yc, pf, xr }, { baseline: '2', shape: 'pv', prominence: 5, smooth: 3, xrd: true, lambda: '1.5406', K: 0.9, inst: 0.08 }, T('Au NP diffractogram', ['2θ (°)', 'Intensity (counts)'])); ok('peaks results list d-spacings and sizes', /d = [\d.]+ Å, D = [\d.]+ nm/.test(plain(ps[1].html)) && /Scherrer/.test(plain(ps[0].html)) && /Williamson–Hall/.test(plain(ps[1].html))); }
/* Tauc */
const lam = []; for (let l = 300; l <= 500; l += 2) lam.push(l); const ab = lam.map(l => 0.06 + 1.05 * 0.5 * (1 + Math.tanh((371 - l) / 8)) + noise(0.004));
const tr = A.tauc(lam, ab, { transition: 'direct', range: null }); ok('engine found a band gap', !tr.error && Math.abs(tr.Eg - 3.3) < 0.15);
if (!tr.error) { const ts = check('tauc', { d: {}, r: tr }, { transition: 'direct', emin: '', emax: '' }, T('ZnO absorbance', ['Wavelength (nm)', 'Absorbance'])); ok('tauc results give Eg ± SE and the edge', /E g = [\d.]+ ± [\d.]+ eV/.test(plain(ts[1].html)) && /nm/.test(plain(ts[1].html))); }
/* tensile */
const eps = [], st = []; for (let e = 0; e <= 0.2; e += 0.002) { eps.push(e); st.push(e < 0.002 ? 200000 * e : e < 0.004 ? 400 + 50000 * (e - 0.002) : Math.min(520, 500 + 600 * (e - 0.004) - 20000 * (e - 0.004) ** 2) + noise(1)); }
const te = A.tensile(eps, st, { offset: 0.002 }); ok('engine analysed the tensile curve', !te.error && isFinite(te.E));
if (!te.error) check('tensile', { d: { ylabel: 'Stress (MPa)' }, r: te, pts: [] }, { offset: 0.2 }, T('Alloy tensile', ['Strain (%)', 'Stress (MPa)']));
/* area under the curve and smoothing */
check('auc', { d: {}, list: [{ s: series('Peak', tt.slice(0, 200), yy.slice(0, 200)), r: A.auc(tt.slice(0, 200), yy.slice(0, 200), 'zero') }] }, { base: 'zero' }, T('Chromatogram', ['Time (min)', 'Signal (mAU)']));
const sm = A.smooth(yy, 5, 2, 1, 0.1); check('smooth', { d: {}, s: series('XRD', tt, yy), x: tt, y: yy, out: sm }, { half: 5, order: 2, deriv: 1 }, T('Spectrum', ['2θ (°)', 'Intensity (counts)']));
/* statistics */
const g1 = Array.from({ length: 9 }, () => 10 + noise(2)), g2 = Array.from({ length: 8 }, () => 12.5 + noise(2.2)), g3 = Array.from({ length: 10 }, () => 11 + noise(1.8)), g4 = Array.from({ length: 7 }, () => 15 + noise(2.5));
const groups = [{ name: 'A', v: g1 }, { name: 'B', v: g2 }, { name: 'C', v: g3 }, { name: 'D', v: g4 }];
check('describe', { g: groups, ds: groups.map(x => ({ name: x.name, d: A.describe(x.v), n: A.normality(x.v), gr: A.grubbs(x.v) })), ylabel: 'Activity (A/mg)' }, { err: 'sd' }, T('Batches', ['A', 'B', 'C', 'D'], 'Activity (A/mg)'));
check('ttest', { a: groups[0], b: groups[1], r: A.ttest(g1, g2, { welch: true }), ylabel: 'Activity (A/mg)' }, { test: 'welch' }, T('Two batches', ['A', 'B'], 'Activity (A/mg)'));
check('ttest', { a: groups[0], b: groups[1], r: A.mannWhitney(g1, g2), ylabel: 'Activity (A/mg)' }, { test: 'mw' }, T('Two batches', ['A', 'B'], 'Activity (A/mg)'));
const an = A.anova(groups, { control: null }); const as = check('anova', { g: groups, r: an, ylabel: 'Activity (A/mg)' }, { test: 'ordinary', post: 'tukey', err: 'sd' }, T('Batches', ['A', 'B', 'C', 'D'], 'Activity (A/mg)'));
if (process.env.DEBUG) console.log('  ANOVA:', plain(as[1].html).slice(0, 300));
ok('anova results give F, p, η² and group means', /F\(3, \d+\) = [\d.]+/.test(plain(as[1].html)) && /η² =/.test(plain(as[1].html)) && /Brown–Forsythe/.test(plain(as[1].html)));
/* multivariate */
const rows = Array.from({ length: 24 }, () => { const a = rng.normal(), b = rng.normal(); return [a, 0.8 * a + 0.3 * b, b, -0.6 * a + 0.5 * rng.normal()]; }), names = ['Zn', 'T', 'time', 'gap'];
const col = j => rows.map(r => r[j]);
check('corr', { names, n: rows.length, m: names.map((_, i) => names.map((_, j) => (i === j ? { r: 1, p: 0 } : A.pearson(col(i), col(j))))) }, { method: 'pearson' }, T('Alloys', names));
const ols = A.ols(rows.map(r => r.slice(0, 3)), col(3), names.slice(0, 3)); check('mlr', { r: ols, names, y: col(3), labels: [] }, {}, T('Alloys', names));
const pca = A.pca(rows, names); check('pca', { r: pca, mx: { rows, names } }, {}, T('Alloys', names));
const tries = [2, 3, 4].map(k => A.kmeans(rows, k, 3)), best = tries.reduce((a, b) => (b.silhouette > a.silhouette ? b : a));
check('kmeans', { mx: { rows, names }, best, tries, pc: pca }, { k: 'auto' }, T('Alloys', names));
/* models with constructed results (the engines run in workers) */
check('bo', { names: ['Zn', 'T', 'gap'], y: [1, 2, 3, 4, 5, 6, 7, 8], s: { gp: { q2: 0.74, relevance: [0.6, 0.4] }, picks: [{ x: [0.62, 420], mean: 3.4, sd: 0.1 }, { x: [0.55, 450], mean: 3.3, sd: 0.15 }] } }, { compo: false }, T('Alloys', ['Zn', 'T', 'gap']));
check('symreg', { r: { library: 42, tried: 6708, errors: 'relative', results: [{ logTarget: true }], best: { pretty: 'y = 10.13·exp(−5156 / x)', law: 'Arrhenius-type', r2: 0.9988, preferred: false } } }, {}, T('Conductivity', ['T (K)', 'σ (S/cm)']));
check('automl', { yname: 'band gap', n: 36, p: 3, folds: 5, level: 0.9, best: { name: 'Gradient boosting', r2: 0.93, mae: 0.05, rmse: 0.07 }, board: [{ name: 'Gradient boosting', r2: 0.93, mae: 0.05, rmse: 0.07 }, { name: 'Ridge regression', r2: 0.81, mae: 0.09, rmse: 0.11 }], importance: [{ name: 'Zn fraction', v: 0.21 }, { name: 'Anneal T', v: 0.12 }], preds: [{ extrapolating: true }] }, {}, T('Alloys', ['Zn', 'T', 'time', 'gap']));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
