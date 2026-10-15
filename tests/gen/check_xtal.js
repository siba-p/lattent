/* Checks of the XRD simulation, cell symmetrization and (live, needs network) the database
   client and phase identification.
   Usage: node tests/gen/check_xtal.js [--offline] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..');
const ctx = { console, Math, fetch, encodeURIComponent, Promise }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['assets/js/chem.js', 'assets/js/crystal.js']) vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx);
const { xtal: X } = ctx.BF;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
(async () => {
  /* textbook check: fcc gold, a = 4.078 Å → (111) at 38.2°, (200) 44.4°, (220) 64.6°, (311) 77.5° */
  const a = 4.078, au = { lattice: [[a, 0, 0], [0, a, 0], [0, 0, a]], positions: [[0, 0, 0], [0, a / 2, a / 2], [a / 2, 0, a / 2], [a / 2, a / 2, 0]], species: ['Au', 'Au', 'Au', 'Au'] };
  const p = X.xrd(au, { tmin: 20, tmax: 90 });
  console.log('     simulated Au:', p.map(x => `${x.tt.toFixed(2)}° (${x.hkl.join('')}) ${x.rel.toFixed(0)}`).join(', '));
  ok(Math.abs(p[0].tt - 38.18) < 0.05 && Math.abs(p[1].tt - 44.39) < 0.05 && p.length === 5 && p[0].rel === 100, 'fcc Au: reflections, positions and extinctions are right');
  ok(p[1].rel > 35 && p[1].rel < 65, 'fcc Au: (200)/(111) intensity ratio is realistic (' + p[1].rel.toFixed(0) + '%)');
  /* the same gold as a distorted one-atom primitive cell, the way DFT databases often store it */
  const h = a / 2, prim = [[0, h, h], [h, 0, h], [h, h, 0]];
  const strain = [[1.012, 0.004, 0], [0, 0.993, -0.003], [0.002, 0, 1.006]];
  const bent = prim.map(v => [0, 1, 2].map(j => v[0] * strain[0][j] + v[1] * strain[1][j] + v[2] * strain[2][j]));
  const raw = X.xrd({ lattice: bent, positions: [[0, 0, 0]], species: ['Au'] }, { tmin: 20, tmax: 90 });
  const sym = X.xrd({ lattice: bent, positions: [[0, 0, 0]], species: ['Au'] }, { tmin: 20, tmax: 90, sg: 225 });
  console.log('     distorted fcc cell:', raw.length, 'reflections raw,', sym.length, 'after symmetrization:', sym.map(x => x.tt.toFixed(2)).join(', '));
  ok(raw.length > 5 && sym.length === 5 && sym.every((x, i) => Math.abs(x.d / p[i].d - sym[0].d / p[0].d) < 1e-6) && Math.abs(sym[1].rel - p[1].rel) < 1,
    'a distorted fcc cell is symmetrized back to the five fcc reflections with fcc intensities');
  const hcp = [[2.9, 0, 0], [-1.47, 2.52, 0.02], [0.03, 0, 4.8]];
  const L2 = X.idealize(hcp, 194), c2 = X.cell(L2);
  ok(Math.abs(c2.a - c2.b) < 1e-9 && Math.abs(c2.gamma - 120) < 1e-6 && Math.abs(c2.alpha - 90) < 1e-6 && Math.abs(c2.V - X.cell(hcp).V) < 1e-9, 'a distorted hexagonal cell becomes a = b, γ = 120°, same volume');
  ok(X.idealize(hcp, 12) === null, 'monoclinic cells are left as they are');
  if (process.argv.includes('--offline')) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
  const r = await X.search({ formula: 'OZn', provider: 'pbe', maxHull: 0.05 });
  const wz = r.entries.filter(e => e.spacegroup === 186).sort((a, b) => a.hull - b.hull)[0];   // 4H and 6H polytypes are also SG186
  console.log('     Alexandria ZnO:', r.entries.map(e => `${e.id} SG${e.spacegroup} gap ${e.gap} hull ${(+e.hull).toFixed(3)}`).join(' | '));
  ok(!!wz && wz.gap > 0.4 && wz.gap < 1.2, 'live search returns wurtzite ZnO with its PBE band gap');
  const sim = X.xrd(wz.structure, { tmin: 20, tmax: 80, sg: wz.spacegroup });
  console.log('     wurtzite ZnO peaks:', sim.filter(x => x.rel > 15).map(x => `${x.tt.toFixed(2)}° (${x.hkl.join('')})`).join(', '), '| experiment: 31.8 (100), 34.4 (002), 36.3 (101), 47.5 (102), 56.6 (110), 62.9 (103)');
  const lab = h => sim.find(x => x.hkl.join('') === h);
  ok(lab('101') && lab('101').rel === 100 && Math.abs(lab('101').tt - 36.2) < 0.6 && lab('100') && lab('002') && lab('110'), 'wurtzite ZnO: (101) is the strongest peak near 36° and reflections carry hexagonal indices');
  /* phase identification on gold-nanoparticle peaks from the Studio example */
  const meas = [[38.18, 100], [44.39, 47], [64.58, 26], [77.55, 28], [81.72, 7]].map(([tt, rel]) => ({ tt, rel }));
  const id = await X.identify(meas, ['Au']);
  console.log('     Au phase ID:', id.rows.slice(0, 3).map(r => `${r.formula} SG${r.spacegroup} score ${r.fit.score.toFixed(2)} scale ${r.fit.scale.toFixed(4)}`).join(' | '));
  ok(id.rows.length && id.rows[0].spacegroup === 225 && id.rows[0].fit.score > 0.9, 'gold XRD is identified as fcc Au (Fm-3m)');
  const zn = [[31.77, 57], [34.42, 44], [36.25, 100], [47.54, 23], [56.6, 32], [62.86, 29], [67.96, 23], [69.1, 11]].map(([tt, rel]) => ({ tt, rel }));
  const id2 = await X.identify(zn, ['Zn', 'O']);
  console.log('     ZnO phase ID:', id2.rows.slice(0, 3).map(r => `${r.formula} SG${r.spacegroup} score ${r.fit.score.toFixed(2)} scale ${r.fit.scale.toFixed(4)}`).join(' | '));
  ok(id2.rows.length && id2.rows[0].formula === 'OZn' && id2.rows[0].spacegroup === 186, 'experimental ZnO peaks are identified as wurtzite (P6₃mc)');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
