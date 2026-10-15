/* NIST StRD nonlinear regression: fit every problem from both certified starting points with
   Lattent's fitting engine (the same code Studio runs) and report the log relative error (LRE,
   number of correct significant digits) of the worst parameter, and the time per fit.
   Usage: node tests/bench/nist.js [out.json] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Float64Array }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['stats.js', 'models.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', f), 'utf8'), ctx);
const { models: M } = ctx.BF;
const probs = JSON.parse(fs.readFileSync(path.join(__dirname, 'nist.json'), 'utf8'));
const lre = (est, cert) => (!isFinite(est) ? 0 : est === cert ? 11 : Math.max(0, Math.min(11, -Math.log10(Math.abs(est - cert) / Math.abs(cert)))));
const out = [];
for (const P of probs) {
  for (const s of ['start1', 'start2']) {
    const m = M.custom(P.eq, P[s]);
    let r = M.fit(m, P.x, P.y);
    const reps = Math.max(3, Math.min(50, Math.round(20000 / (P.x.length * m.params.length * 40))));
    const t0 = process.hrtime.bigint();
    for (let k = 0; k < reps; k++) M.fit(m, P.x, P.y);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps;
    const p = r.error ? null : Object.fromEntries(m.params.map((n, j) => [n, r.fit.p[j]]));
    const se = r.error ? null : Object.fromEntries(m.params.map((n, j) => [n, r.fit.se[j]]));
    const L = p ? Math.min(...Object.keys(P.cert).map(b => lre(p[b], P.cert[b]))) : 0;
    const Lse = se ? Math.min(...Object.keys(P.sd).map(b => lre(se[b], P.sd[b]))) : 0;
    out.push({ name: P.name, level: P.level, start: s, lre: L, lreSE: Lse, ms, p });
    console.log(`${P.name.padEnd(9)} ${s}  LRE params ${L.toFixed(1).padStart(4)}  SE ${Lse.toFixed(1).padStart(4)}  ${ms.toFixed(2).padStart(7)} ms`);
  }
}
const ok = out.filter(o => o.lre >= 4).length;
console.log(`\n${ok}/${out.length} fits with at least 4 correct significant digits in every parameter; median ${out.map(o => o.ms).sort((a, b) => a - b)[out.length >> 1].toFixed(2)} ms per fit`);
if (process.argv[2] && process.argv[2] !== '--check') fs.writeFileSync(process.argv[2], JSON.stringify(out));
if (ok < 50) { console.log('FAIL: fewer than 50 of 52 fits reached 4 significant digits'); process.exit(1); }
