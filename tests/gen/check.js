/* Parity of the browser implementations with PyTorch, and generator behaviour checks.
   Usage: node tests/gen/check.js [props_parity.json] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..');
const ctx = { console, Math, Buffer, Float32Array, Float64Array, Int32Array, Uint8Array }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['assets/js/chem.js', 'assets/models/gen-v1.js', 'assets/js/generate.js']) vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx);
const { gen: G, chem: C } = ctx.BF;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
if (process.argv[2] && fs.existsSync(process.argv[2])) {
  const par = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (const w of ['eform', 'gap']) {
    const p = G.predictFeatures(w, par[w].X);
    const d = Math.max(...p.map((v, i) => Math.abs(v - par[w].p[i])));
    ok(d < 2e-3, `${w} network matches PyTorch (max |Δ| ${d.toExponential(1)})`);
  }
}
const pr = G.forwardProbe();
const dl = Math.max(...pr.le.flat().map((v, i) => Math.abs(v - pr.ref.le.flat()[i])), ...pr.lc.flat().map((v, i) => Math.abs(v - pr.ref.lc.flat()[i])));
ok(dl < 0.05, `diffusion network matches PyTorch within float16 rounding (max |Δ| ${dl.toFixed(4)})`);
const known = { ZnO: [-1.8, 0.7], GaN: [-0.8, 1.7], NaCl: [-2.1, 5.0], Si: [0, 0.6], CsPbI3: [-1.0, 1.5], Cu: [0, 0], TiO2: [-3.3, 2.0], Al2O3: [-3.4, 5.9], MoS2: [-0.9, 1.3] };
const pp = G.predict(Object.keys(known).map(f => C.parse(f)));
Object.keys(known).forEach((f, i) => console.log('    ', f.padEnd(7), 'Ef', pp[i].eform.toFixed(2), '(MP ~' + known[f][0] + ')', ' gap', pp[i].gap.toFixed(2), '(PBE ~' + known[f][1] + ')'));
ok(pp[0].eform < -1 && pp[3].eform > -0.3 && pp[7].gap > 3.5 && pp[5].gap < 0.3, 'property predictions sensible for well-known solids');
let t = Date.now();
const cz = G.design({ n: 400, allowed: ['Cu', 'Zn', 'Sn', 'S'], nel: 4, gap: 1.5, requireAll: true, seed: 3 });
const czf = cz.candidates.map(c => c.formula);
console.log('     Cu–Zn–Sn–S, 1.5 eV, top:', czf.slice(0, 8).join(', '), `(${Date.now() - t} ms)`);
ok(czf.slice(0, 10).includes('ZnCu2SnS4'), 'rediscovers kesterite Cu2ZnSnS4 among the top ten');
const lf = G.design({ n: 300, allowed: ['Li', 'Fe', 'P', 'O'], nel: 4, seed: 5 });
console.log('     Li–Fe–P–O top:', lf.candidates.slice(0, 8).map(c => c.formula).join(', '));
ok(lf.candidates.some(c => c.formula === 'LiFePO4'), 'proposes LiFePO4');
const gaps = {};
for (const g of [0.5, 3.5]) { const s = G.design({ n: 300, gap: g, seed: 9 }); gaps[g] = s.candidates.slice(0, 40).reduce((a, c) => a + c.gap, 0) / Math.min(40, s.candidates.length); }
console.log('     mean predicted gap of top candidates: target 0.5 eV →', gaps[0.5].toFixed(2), '; target 3.5 eV →', gaps[3.5].toFixed(2));
ok(gaps[3.5] > gaps[0.5] + 1, 'band-gap guidance steers the generator');
const u = G.sample({ n: 400, seed: 21 });
const bal = u.filter(c => C.chargeBalance(c).balanced).length / u.length;
console.log('     unconstrained: charge-balanced share', bal.toFixed(2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
