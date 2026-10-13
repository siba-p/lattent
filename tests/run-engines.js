/* Fits reference datasets with the Benchfit engines and writes the results as JSON
   for tests/check_scipy.py to compare against SciPy. Usage: node tests/run-engines.js out.json */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['stats.js', 'engines.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', f), 'utf8'), ctx);
const { stats: S, engines: E } = ctx.BF;

const rng = S.rng(7);
const out = { dose: [], std: [], kin: [], glob: [], tdist: [], welch: [], qpcr: null };

/* dose–response: inhibitor, 10 concentrations, triplicates */
for (const [seed, model, truth] of [[1, '4pl', [5, 98, -6.3, -1.1]], [2, '4pl', [0, 100, 0.5, 1.6]], [3, '5pl', [2, 95, -1, 1.2, 0.6]]]) {
  const r = S.rng(seed);
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const x = truth[2] - 2.25 + k * 0.5;
    const M = E.dose.models[model];
    for (let j = 0; j < 3; j++) pts.push({ conc: Math.pow(10, x), y: M.f(x, truth) + 3 * r.normal() });
  }
  const res = E.dose.fit(pts, { model, ecx: [0.8] });
  out.dose.push({ model, x: pts.map(p => Math.log10(p.conc)), y: pts.map(p => p.y), p: res.fit.p, se: res.fit.se, ec80: res.ecx[0].value, ec80ci: res.ecx[0].ci });
}

/* standard curves */
{
  const truth = [0.05, 1.3, 2.2, 2.6];
  const concs = [0, 15.6, 31.25, 62.5, 125, 250, 500, 1000, 2000];
  const pts = [];
  concs.forEach(c => { for (let j = 0; j < 2; j++) pts.push({ conc: c, y: E.std.models['4pl'].f(c, truth) * (1 + 0.03 * rng.normal()) + 0.005 * rng.normal() }); });
  for (const weight of ['none', '1/y2']) {
    const res = E.std.fit(pts, { model: '4pl', weight });
    const unk = E.std.interpolate(res, [{ name: 'S1', ys: [0.9, 0.95], dilution: 2 }]);
    out.std.push({ weight, x: pts.map(p => p.conc), y: pts.map(p => p.y), p: res.fit.p, se: res.fit.se, unk: unk[0].conc, lod: res.lod });
  }
  const lres = E.std.fit(pts.filter(p => p.conc <= 250), { model: 'linear' });
  out.std.push({ weight: 'linear', x: pts.filter(p => p.conc <= 250).map(p => p.conc), y: pts.filter(p => p.conc <= 250).map(p => p.y), p: lres.fit.p, se: lres.fit.se });
}

/* Michaelis–Menten */
{
  const pts = [];
  [0.5, 1, 2, 4, 8, 16, 32, 64, 128].forEach(s => { for (let j = 0; j < 3; j++) pts.push({ s, y: 120 * s / (9 + s) * (1 + 0.04 * rng.normal()) }); });
  const res = E.kin.fitSingle(pts);
  for (const r of res.ranked) out.kin.push({ key: r.key, x: pts.map(p => p.s), y: pts.map(p => p.y), p: r.fit.p, se: r.fit.se, aicc: r.fit.aicc });
}
/* competitive inhibition, global fit */
{
  const pts = [];
  [0, 5, 15, 40].forEach(i => [1, 2, 5, 10, 20, 50, 100].forEach(s => {
    for (let j = 0; j < 2; j++) pts.push({ s, i, y: 80 * s / (12 * (1 + i / 8) + s) * (1 + 0.03 * rng.normal()) });
  }));
  const res = E.kin.fitGlobal(pts);
  for (const r of res.ranked) out.glob.push({ key: r.key, s: pts.map(p => p.s), i: pts.map(p => p.i), y: pts.map(p => p.y), p: r.fit.p, se: r.fit.se });
}
/* distributions and t-test */
for (const [t, df] of [[2.1, 3], [-1.3, 7.5], [0.4, 40], [4.2, 12]]) out.tdist.push({ t, df, cdf: S.tcdf(t, df) });
for (const [p, df] of [[0.975, 2], [0.975, 9], [0.995, 4.3]]) out.tdist.push({ p, df, inv: S.tinv(p, df) });
{
  const a = [1.2, 1.9, 1.4, 2.2, 1.7], b = [0.4, 0.9, 0.2, 0.75];
  out.welch.push({ a, b, ...S.welch(a, b) });
}
/* qPCR: two groups, one target, one reference, efficiency 2 (Livak) */
{
  const rows = [];
  const data = { c1: [24.1, 18.0], c2: [24.4, 18.2], c3: [23.9, 17.9], t1: [22.0, 18.1], t2: [21.6, 17.8], t3: [22.3, 18.3] };
  for (const [s, [tgt, ref]] of Object.entries(data)) {
    const grp = s[0] === 'c' ? 'Control' : 'Treated';
    rows.push({ sample: s, group: grp, gene: 'IL6', ct: tgt }, { sample: s, group: grp, gene: 'GAPDH', ct: ref });
  }
  const res = E.qpcr.analyse(rows, { refs: ['GAPDH'], control: 'Control' });
  out.qpcr = { data, summary: res.summary };
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('engines ok');
