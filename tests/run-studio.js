/* Runs the studio engines on reference data and writes JSON for tests/check_studio.py. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Float64Array };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['stats.js', 'models.js', 'analysis.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8'), ctx);
const { stats: S, models: M, analysis: A } = ctx.BF;
const r = S.rng(42);
const out = {};
const norm = (n, m, s) => Array.from({ length: n }, () => m + s * r.normal());

const g1 = norm(9, 10, 2), g2 = norm(8, 12.5, 2.2), g3 = norm(10, 11, 1.8), g4 = norm(7, 15, 2.5);
out.groups = [g1, g2, g3, g4];
out.normality = A.normality(g1.concat(g3));
out.student = A.ttest(g1, g2, { welch: false });
out.paired = A.ttest(g1.slice(0, 8), g2, { paired: true });
out.mwSmall = A.mannWhitney(g1.slice(0, 6), g2.slice(0, 7));
out.mwBig = A.mannWhitney(g1.concat(g3), g2.concat([12.5, 12.5]));
out.mwBigData = [g1.concat(g3), g2.concat([12.5, 12.5])];
const an = A.anova([{ name: 'A', v: g1 }, { name: 'B', v: g2 }, { name: 'C', v: g3 }, { name: 'D', v: g4 }]);
out.anova = { F: an.F, p: an.p, kwH: an.kw.H, kwP: an.kw.p, welchF: an.welch.F, welchP: an.welch.p, bfF: an.bf.F, bfP: an.bf.p, pairs: an.pairs.map(p => ({ i: p.i, j: p.j, pTukey: p.pTukey, lo: p.lo, hi: p.hi })) };
out.ptukey = [[3.5, 3, 20], [2.1, 5, 12], [4.8, 4, 60]].map(([q, k, df]) => ({ q, k, df, sf: S.ptukeySF(q, k, df) }));
out.grubbs = A.grubbs(g1.concat([22]));
const x = norm(25, 5, 2), y = x.map(v => 2 + 0.8 * v + r.normal());
out.corr = { x, y, pearson: A.pearson(x, y), spearman: A.spearman(x, y) };
const X = Array.from({ length: 30 }, () => [r() * 10, r() * 5, r() * 2]);
const yy = X.map(a => 3 + 1.5 * a[0] - 2 * a[1] + 0.3 * a[2] + 0.5 * r.normal());
const o = A.ols(X, yy, ['a', 'b', 'c']);
out.ols = { X, y: yy, b: o.coefs.map(c => c.b), se: o.coefs.map(c => c.se), p: o.coefs.map(c => c.p), r2: o.r2, F: o.F };
const Xp = Array.from({ length: 40 }, () => { const t = r.normal(), u = r.normal(); return [t + 0.1 * r.normal(), 2 * t + u, u - t, r.normal()]; });
const pc = A.pca(Xp, ['a', 'b', 'c', 'd']);
out.pca = { X: Xp, values: pc.values, explained: pc.explained, scores0: pc.scores[0] };
/* models vs curve_fit */
const T = [280, 300, 320, 340, 360, 380, 400, 420];
const sig = T.map(t => Math.exp(8 - 45000 / (8.314462618 * t)) * (1 + 0.04 * r.normal()));
const C = [0.5, 1, 2, 5, 10, 20, 40, 80, 150];
const q = C.map(c => 120 * 0.08 * c / (1 + 0.08 * c) * (1 + 0.03 * r.normal()));
const tk = [0, 2, 5, 10, 20, 40, 80, 150, 300, 500];
const kw = tk.map(t => 900 * Math.exp(-Math.pow(t / 60, 0.7)) + 20 + 8 * r.normal());
const sr = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];
const eta = sr.map(g => 1 + (5000 - 1) * Math.pow(1 + (2 * g) ** 2, (0.35 - 1) / 2) * (1 + 0.03 * r.normal()));
out.models = [['arrhenius', T, sig], ['langmuir', C, q], ['kww', tk, kw], ['carreau', sr, eta]].map(([id, xs, ys]) => {
  const res = M.fit(M.byId(id), xs, ys);
  return { id, x: xs, y: ys, p: res.fit.p, se: res.fit.se, derived: res.derived.map(d => d.value) };
});
const auto = M.autofit(C, q);
out.autoTop = auto.slice(0, 5).map(a => [a.model.id].concat(a.equivalent || []).join('|'));
const cm = M.custom('A*exp(-k*x) + c');
const cres = M.fit(cm, tk, kw);
out.custom = { params: cm.params, p: cres.fit.p, x: tk, y: kw };
/* peaks */
const tt = Array.from({ length: 600 }, (_, i) => 30 + i * 0.1);
const yx = tt.map(v => 50 + 0.2 * (v - 30) + 1000 * Math.exp(-4 * Math.LN2 * ((v - 38.2) / 0.9) ** 2) + 480 * Math.exp(-4 * Math.LN2 * ((v - 44.4) / 1.0) ** 2) + 300 * Math.exp(-4 * Math.LN2 * ((v - 64.6) / 1.3) ** 2) + 5 * r.normal());
const base = A.baseline(tt, yx, 1);
const yc = yx.map((v, i) => v - base[i]);
const pk = A.findPeaks(tt, yc, { prominence: 0.1 });
const pf = A.fitPeaks(tt, yc, pk, 'gauss');
out.peaks = { x: tt, y: yc, found: pk.map(p => p.x), centers: pf.peaks.map(p => p.center), fwhm: pf.peaks.map(p => p.fwhm), heights: pf.peaks.map(p => p.height), p: pf.fit.p };
const xr = A.xrd(pf.peaks, 1.5406, 0.9, 0);
out.xrd = xr.rows.map(rw => ({ d: rw.d, size: rw.size }));
out.sg = { y: yx.slice(0, 101), s: A.smooth(yx.slice(0, 101), 5, 3, 0) };
/* GP */
const Xg = Array.from({ length: 14 }, () => [r() * 10, r() * 4]);
const yg = Xg.map(a => Math.sin(a[0] / 2) * 3 + 0.5 * a[1] + 0.1 * r.normal());
const gp = A.gp(Xg, yg);
out.gp = { X: Xg, y: yg, ell: gp.ell, sf2: gp.sf2, sn2: gp.sn2, lo: gp.lo, hi: gp.hi, test: [[2, 1], [7.5, 3]], pred: [[2, 1], [7.5, 3]].map(p => gp.predict(p)), loo: gp.loo };
const sug = A.suggest(Xg, yg, { goal: 'max', batch: 3 });
out.suggest = sug.picks.map(p => p.x);
/* tauc / tensile */
const wl = Array.from({ length: 200 }, (_, i) => 300 + i * 2);
const ab = wl.map(l => { const E = 1239.84 / l; return (E > 3.2 ? Math.sqrt(E - 3.2) * 1.2 / E : 0) + 0.02 + 0.002 * r.normal(); });
out.tauc = A.tauc(wl, ab, { transition: 'direct' }).Eg;
const st = Array.from({ length: 400 }, (_, i) => i * 0.0375);
const ss = st.map(e => { const ef = e / 100; return ef < 0.004 ? 70000 * ef : 280 + 2500 * (ef - 0.004) - 9e4 * Math.max(ef - 0.12, 0) ** 2; });
const tn = A.tensile(st, ss);
out.tensile = { E: tn.E, yieldS: tn.yieldS, uts: tn.uts };
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('studio engines ok; auto-fit top:', out.autoTop.join(', '), '| tauc Eg', out.tauc.toFixed(3), '| tensile', JSON.stringify(out.tensile));
