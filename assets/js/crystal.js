/* Materials databases (OPTIMADE, Alexandria), crystal structures, simulated powder XRD and
   phase identification. Works in the browser and in Node (tests). */
(function (root) {
  'use strict';
  const BF = root.BF;
  const X = {};
  BF.xtal = X;

  /* ---------- OPTIMADE client ---------- */
  X.providers = {
    pbe: { name: 'Alexandria (PBE)', short: 'PBE · 5.8 million structures', base: 'https://alexandria.icams.rub.de/pbe/v1', note: 'The largest set; PBE overestimates lattice constants by about 1–2% and underestimates band gaps.' },
    pbesol: { name: 'Alexandria (PBEsol)', short: 'PBEsol · 0.4 million structures', base: 'https://alexandria.icams.rub.de/pbesol/v1', note: 'Smaller, with lattice constants close to experiment.' }
  };
  const FIELDS = ['chemical_formula_reduced', 'chemical_formula_descriptive', 'nelements', 'nsites', 'elements', 'lattice_vectors', 'cartesian_site_positions', 'species_at_sites',
    '_alexandria_band_gap', '_alexandria_band_gap_direct', '_alexandria_formation_energy_per_atom', '_alexandria_hull_distance', '_alexandria_space_group', '_alexandria_magnetization'];
  /* OPTIMADE reduced formula: elements in alphabetical order, count omitted when 1 */
  X.optimadeFormula = comp => Object.keys(comp).sort().map(e => e + (comp[e] === 1 ? '' : comp[e])).join('');
  const q = s => '"' + String(s).replace(/"/g, '') + '"';
  X.filter = function (o) {
    const f = [];
    if (o.formula) f.push('chemical_formula_reduced=' + q(o.formula));
    if (o.formulas) f.push('(' + o.formulas.map(x => 'chemical_formula_reduced=' + q(x)).join(' OR ') + ')');
    if (o.elements && o.elements.length && o.only) {
      /* materials made only of these elements: every non-empty subset with its exact count */
      const els = o.elements.slice(0, 5), subs = [];
      for (let m = 1; m < (1 << els.length); m++) {
        const sub = els.filter((_, i) => m & (1 << i));
        subs.push('(elements HAS ALL ' + sub.map(q).join(',') + ' AND nelements=' + sub.length + ')');
      }
      f.push('(' + subs.join(' OR ') + ')');
    } else if (o.elements && o.elements.length) f.push('elements HAS ALL ' + o.elements.map(q).join(','));
    if (o.nelements) f.push('nelements=' + (+o.nelements));
    if (o.maxSites) f.push('nsites<=' + (+o.maxSites));
    if (o.maxHull != null) f.push('_alexandria_hull_distance<=' + (+o.maxHull));
    return f.join(' AND ');
  };
  X.search = async function (o, fetchImpl) {
    const P = X.providers[o.provider || 'pbe'];
    const fields = o.light ? ['chemical_formula_reduced', 'nsites', '_alexandria_space_group', '_alexandria_hull_distance', '_alexandria_band_gap', '_alexandria_formation_energy_per_atom'] : FIELDS;
    const url = P.base + '/structures?filter=' + encodeURIComponent(X.filter(o)) + '&page_limit=' + (o.limit || 50) + '&response_fields=' + fields.join(',');
    const j = await getJSON(url, fetchImpl);
    return { more: !!nextLink(j), next: nextLink(j), url, entries: (j.data || []).map(d => X.entry(d, P)) };
  };
  const nextLink = j => { const n = j.links && j.links.next; return !n ? null : typeof n === 'string' ? n : n.href || null; };
  async function getJSON(url, fetchImpl) {
    const r = await (fetchImpl || fetch)(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!r.ok) throw new Error('The database answered with an error (' + r.status + '). Try a simpler query.');
    return r.json();
  }
  /* Follow the database's pagination for up to maxPages pages. */
  X.searchAll = async function (o, maxPages, fetchImpl) {
    const P = X.providers[o.provider || 'pbe'];
    const r = await X.search(o, fetchImpl);
    let next = r.next, n = 1;
    while (next && n < (maxPages || 5)) {
      if (!/^https:\/\/alexandria\.icams\.rub\.de\//.test(next)) break;     // only follow links back to the same database
      const j = await getJSON(next, fetchImpl);
      r.entries.push(...(j.data || []).map(d => X.entry(d, P)));
      next = nextLink(j); n++;
    }
    return Object.assign(r, { more: !!next, next });
  };
  X.entry = function (d, P) {
    const a = d.attributes || {};
    return {
      id: d.id, provider: P.name, formula: a.chemical_formula_reduced, nelements: a.nelements, nsites: a.nsites,
      spacegroup: a._alexandria_space_group, gap: a._alexandria_band_gap, gapDirect: a._alexandria_band_gap_direct,
      eform: a._alexandria_formation_energy_per_atom, hull: a._alexandria_hull_distance, magnetization: a._alexandria_magnetization,
      structure: a.lattice_vectors && a.cartesian_site_positions ? { lattice: a.lattice_vectors, positions: a.cartesian_site_positions, species: a.species_at_sites } : null
    };
  };

  /* ---------- lattice algebra ---------- */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.sqrt(dot(a, a));
  X.cell = function (L) {
    const [a, b, c] = L, V = Math.abs(dot(a, cross(b, c)));
    const rec = [cross(b, c), cross(c, a), cross(a, b)].map(v => v.map(x => x / V));   // without 2π
    const ang = (u, v) => Math.acos(dot(u, v) / (norm(u) * norm(v))) * 180 / Math.PI;
    return { V, rec, a: norm(a), b: norm(b), c: norm(c), alpha: ang(b, c), beta: ang(a, c), gamma: ang(a, b) };
  };
  X.fractional = function (L, cart) {
    const [a, b, c] = L, V = dot(a, cross(b, c));
    const inv = [cross(b, c), cross(c, a), cross(a, b)].map(v => v.map(x => x / V));
    return cart.map(p => inv.map(r => { let f = dot(r, p); f -= Math.floor(f); return f; }));
  };

  /* Hermann–Mauguin short symbols; '_1' is a screw subscript, '-4' a rotoinversion bar */
  const SG = 'P1 P-1 P2 P2_1 C2 Pm Pc Cm Cc P2/m P2_1/m C2/m P2/c P2_1/c C2/c P222 P222_1 P2_12_12 P2_12_12_1 C222_1 C222 F222 I222 I2_12_12_1 Pmm2 Pmc2_1 Pcc2 Pma2 Pca2_1 Pnc2 Pmn2_1 Pba2 Pna2_1 Pnn2 Cmm2 Cmc2_1 Ccc2 Amm2 Aem2 Ama2 Aea2 Fmm2 Fdd2 Imm2 Iba2 Ima2 Pmmm Pnnn Pccm Pban Pmma Pnna Pmna Pcca Pbam Pccn Pbcm Pnnm Pmmn Pbcn Pbca Pnma Cmcm Cmce Cmmm Cccm Cmme Ccce Fmmm Fddd Immm Ibam Ibca Imma P4 P4_1 P4_2 P4_3 I4 I4_1 P-4 I-4 P4/m P4_2/m P4/n P4_2/n I4/m I4_1/a P422 P42_12 P4_122 P4_12_12 P4_222 P4_22_12 P4_322 P4_32_12 I422 I4_122 P4mm P4bm P4_2cm P4_2nm P4cc P4nc P4_2mc P4_2bc I4mm I4cm I4_1md I4_1cd P-42m P-42c P-42_1m P-42_1c P-4m2 P-4c2 P-4b2 P-4n2 I-4m2 I-4c2 I-42m I-42d P4/mmm P4/mcc P4/nbm P4/nnc P4/mbm P4/mnc P4/nmm P4/ncc P4_2/mmc P4_2/mcm P4_2/nbc P4_2/nnm P4_2/mbc P4_2/mnm P4_2/nmc P4_2/ncm I4/mmm I4/mcm I4_1/amd I4_1/acd P3 P3_1 P3_2 R3 P-3 R-3 P312 P321 P3_112 P3_121 P3_212 P3_221 R32 P3m1 P31m P3c1 P31c R3m R3c P-31m P-31c P-3m1 P-3c1 R-3m R-3c P6 P6_1 P6_5 P6_2 P6_4 P6_3 P-6 P6/m P6_3/m P622 P6_122 P6_522 P6_222 P6_422 P6_322 P6mm P6cc P6_3cm P6_3mc P-6m2 P-6c2 P-62m P-62c P6/mmm P6/mcc P6_3/mcm P6_3/mmc P23 F23 I23 P2_13 I2_13 Pm-3 Pn-3 Fm-3 Fd-3 Im-3 Pa-3 Ia-3 P432 P4_232 F432 F4_132 I432 P4_332 P4_132 I4_132 P-43m F-43m I-43m P-43n F-43c I-43d Pm-3m Pn-3n Pm-3n Pn-3m Fm-3m Fm-3c Fd-3m Fd-3c Im-3m Ia-3d'.split(' ');
  X.sgSymbol = n => SG[n - 1] || '';
  X.sgHTML = n => (SG[n - 1] || '?').replace(/_(\d)/g, '<sub>$1</sub>').replace(/-(\d)/g, '<span class="ob">$1</span>');
  X.sgText = n => (SG[n - 1] || '?').replace(/_(\d)/g, (m, d) => '₀₁₂₃₄₅₆₇₈₉'[d]).replace(/-(\d)/g, '$1\u0305');

  /* DFT cells relaxed without symmetry constraints are often slightly distorted (e.g. fcc Au
     stored with 2.92/2.96/2.96 Å primitive vectors), which splits peaks that are single in
     experiment. Find the conventional cell of the reported crystal system, replace its metric
     by the ideal one at the same volume and keep the fractional coordinates. Monoclinic and
     triclinic cells, or cells where no conventional setting is found, are returned unchanged. */
  X.crystalSystem = sg => !sg ? null : sg <= 2 ? 'triclinic' : sg <= 15 ? 'monoclinic' : sg <= 74 ? 'orthorhombic' : sg <= 142 ? 'tetragonal' : sg <= 167 ? 'trigonal' : sg <= 194 ? 'hexagonal' : 'cubic';
  const det3 = m => dot(m[0], cross(m[1], m[2]));
  X.idealCell = function (L, sg) {
    const sys = X.crystalSystem(sg);
    if (!sys || sys === 'triclinic' || sys === 'monoclinic') return null;
    const V = Math.abs(det3(L)), vec = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
      const n = [i, j, k], f = n.find(x => x);
      if (!f || f < 0) continue;                                     // one of ±v
      const v = [0, 1, 2].map(c => i * L[0][c] + j * L[1][c] + k * L[2][c]);
      vec.push({ n, v, len: norm(v) });
    }
    vec.sort((a, b) => a.len - b.len);
    const cos = (a, b) => dot(a.v, b.v) / (a.len * b.len), TL = 0.05, TC = 0.05;
    const hexa = sys === 'hexagonal' || sys === 'trigonal';
    const mults = sys === 'cubic' ? [1, 2, 4] : sys === 'tetragonal' ? [1, 2] : hexa ? [1, 3] : [1, 2, 4];
    for (const m of mults) {
      let best = null;
      const Vc = V * m, t = Math.cbrt(Vc);
      const pool = sys === 'cubic' ? vec.filter(x => Math.abs(x.len / t - 1) < TL && Math.max(...x.n.map(Math.abs)) <= 2) : vec.filter(x => x.len < 2.5 * t && Math.max(...x.n.map(Math.abs)) <= 2);
      const wpool = sys === 'cubic' ? pool : vec;
      for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
        const u = pool[a], v = pool[b], cuv = cos(u, v);
        if (hexa ? Math.abs(Math.abs(cuv) - 0.5) > TC : Math.abs(cuv) > TC) continue;
        if (sys !== 'orthorhombic' && Math.abs(u.len / v.len - 1) > TL) continue;
        for (const w of wpool) {
          if (w === u || w === v) continue;
          if (Math.abs(cos(u, w)) > TC || Math.abs(cos(v, w)) > TC) continue;
          if (sys === 'cubic' && Math.abs(w.len / u.len - 1) > TL) continue;
          const P = [u.n, v.n, w.n], d = det3(P);
          if (Math.abs(Math.abs(d) - m) > 1e-9) continue;
          const err = Math.abs(cuv) + Math.abs(cos(u, w)) + Math.abs(cos(v, w)) + (u.len + v.len + w.len) / (3 * t) * 1e-3;
          /* standard hexagonal setting has γ = 120°: replace b by b − a when the pair is at 60° */
          const vb = hexa && cuv > 0 ? v.n.map((x, i) => x - u.n[i]) : v.n;
          if (!best || err < best.err) best = { err, P: d < 0 ? [u.n, vb, w.n.map(x => -x)] : [u.n, vb, w.n], len: [u.len, v.len, w.len] };
        }
      }
      if (!best) continue;
      let C;
      const [la, lb] = best.len;
      if (sys === 'cubic') C = [[t, 0, 0], [0, t, 0], [0, 0, t]];
      else if (sys === 'tetragonal') { const a = (la + lb) / 2; C = [[a, 0, 0], [0, a, 0], [0, 0, Vc / (a * a)]]; }
      else if (hexa) {
        const a = (la + lb) / 2;
        C = [[a, 0, 0], [-a / 2, a * Math.sqrt(3) / 2, 0], [0, 0, Vc / (a * a * Math.sqrt(3) / 2)]];
      } else { const s = Math.cbrt(Vc / (best.len[0] * best.len[1] * best.len[2])); C = best.len.map((l, i) => [0, 1, 2].map(j => i === j ? l * s : 0)); }
      /* L' = P⁻¹ C, so that P L' = C */
      const P = best.P, dP = det3(P);
      const inv = [[P[1][1] * P[2][2] - P[1][2] * P[2][1], P[0][2] * P[2][1] - P[0][1] * P[2][2], P[0][1] * P[1][2] - P[0][2] * P[1][1]],
        [P[1][2] * P[2][0] - P[1][0] * P[2][2], P[0][0] * P[2][2] - P[0][2] * P[2][0], P[0][2] * P[1][0] - P[0][0] * P[1][2]],
        [P[1][0] * P[2][1] - P[1][1] * P[2][0], P[0][1] * P[2][0] - P[0][0] * P[2][1], P[0][0] * P[1][1] - P[0][1] * P[1][0]]].map(r => r.map(x => x / dP));
      return { L: inv.map(r => [0, 1, 2].map(j => r[0] * C[0][j] + r[1] * C[1][j] + r[2] * C[2][j])), P, Pinv: inv, C, system: sys };
    }
    return null;
  };
  X.idealize = (L, sg) => { const r = X.idealCell(L, sg); return r ? r.L : null; };
  const toCart = (L, f) => [0, 1, 2].map(j => f[0] * L[0][j] + f[1] * L[1][j] + f[2] * L[2][j]);
  X.symmetrized = function (st, sg) {
    const r = X.idealCell(st.lattice, sg);
    if (!r) return st;
    const fr = X.fractional(st.lattice, st.positions);
    return { lattice: r.L, positions: fr.map(f => toCart(r.L, f)), species: st.species, idealized: true };
  };
  /* The symmetrized structure in its conventional cell (e.g. the fcc cube with four atoms
     instead of the one-atom rhombohedral primitive cell). Fractional coordinates in the
     conventional basis are u = (f + n)·P⁻¹ for lattice translations n. */
  X.conventional = function (st, sg) {
    const r = X.idealCell(st.lattice, sg);
    if (!r) return Object.assign({}, st, { conventional: false });
    const fr = X.fractional(st.lattice, st.positions), m = Math.max(...r.P.flat().map(Math.abs));
    const pos = [], sp = [], eps = 1e-6;
    fr.forEach((f, i) => {
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (let c = -m; c <= m; c++) {
        const g = [f[0] + a, f[1] + b, f[2] + c];
        const u = [0, 1, 2].map(j => g[0] * r.Pinv[0][j] + g[1] * r.Pinv[1][j] + g[2] * r.Pinv[2][j]);
        if (u.every(x => x > -eps && x < 1 - eps)) { pos.push(toCart(r.C, u)); sp.push(st.species[i]); }
      }
    });
    return { lattice: r.C, positions: pos, species: sp, conventional: true, system: r.system };
  };

  /* Approximate atomic scattering factor: Z·exp(−κ s²), κ falling with Z, so heavy atoms
     dominate correctly. Peak positions are exact; intensities are approximate. */
  const scat = (Z, s) => Z * Math.exp(-Math.max(3, 7 - 0.045 * Z) * s * s);

  /* Powder pattern for 2θ in [tmin, tmax] (degrees), Cu Kα1 by default. With opts.sg the cell
     is first symmetrized to that space group's crystal system. */
  X.xrd = function (st, opts) {
    const o = Object.assign({ lambda: 1.5406, tmin: 10, tmax: 90, B: 0.5, minRel: 0.5 }, opts);
    if (o.sg) st = X.conventional(st, o.sg);
    const L = st.lattice, cell = X.cell(L), fr = X.fractional(L, st.positions);
    const Z = st.species.map(s => (BF.chem.BY[String(s).replace(/[^A-Za-z].*$/, '')] || { z: 6 }).z);
    const smax = 2 * Math.sin(o.tmax / 2 * Math.PI / 180) / o.lambda;            // 1/d max
    const hmax = Math.ceil(smax / Math.min(...cell.rec.map(norm))) + 1;
    const peaks = new Map();
    for (let h = -hmax; h <= hmax; h++) for (let k = -hmax; k <= hmax; k++) for (let l = -hmax; l <= hmax; l++) {
      if (!h && !k && !l) continue;
      const g = [0, 1, 2].map(i => h * cell.rec[0][i] + k * cell.rec[1][i] + l * cell.rec[2][i]);
      const inv_d = norm(g);
      if (inv_d > smax) continue;
      const sinT = inv_d * o.lambda / 2;
      const th = Math.asin(sinT), tt = 2 * th * 180 / Math.PI;
      if (tt < o.tmin) continue;
      const s = inv_d / 2;
      let re = 0, im = 0;
      for (let j = 0; j < fr.length; j++) {
        const ph = 2 * Math.PI * (h * fr[j][0] + k * fr[j][1] + l * fr[j][2]);
        const f = scat(Z[j], s) * Math.exp(-o.B * s * s);
        re += f * Math.cos(ph); im += f * Math.sin(ph);
      }
      const F2 = re * re + im * im;
      if (F2 < 1e-6) continue;
      const lp = (1 + Math.cos(2 * th) ** 2) / (Math.sin(th) ** 2 * Math.cos(th));
      const key = tt.toFixed(2);
      const pk = peaks.get(key) || { tt, d: 1 / inv_d, I: 0, hkl: [h, k, l] };
      pk.I += F2 * lp;
      /* label with the most readable member of the family: non-negative, largest first */
      if (h >= 0 && k >= 0 && l >= 0 && (pk.hkl.some(v => v < 0) || h > pk.hkl[0] || (h === pk.hkl[0] && (k > pk.hkl[1] || (k === pk.hkl[1] && l > pk.hkl[2]))))) pk.hkl = [h, k, l];
      peaks.set(key, pk);
    }
    let list = [...peaks.values()].sort((a, b) => a.tt - b.tt);
    const merged = [];
    list.forEach(p => { const last = merged[merged.length - 1]; if (last && p.tt - last.tt < 0.05) { last.I += p.I; } else merged.push(Object.assign({}, p)); });
    const mx = Math.max(...merged.map(p => p.I), 1e-12);
    merged.forEach(p => { p.rel = 100 * p.I / mx; });
    return merged.filter(p => p.rel >= o.minRel);
  };
  /* Broadened profile for plotting */
  X.profile = function (peaks, tmin, tmax, fwhm) {
    const n = 1200, out = [];
    for (let i = 0; i <= n; i++) {
      const t = tmin + (tmax - tmin) * i / n;
      let y = 0;
      for (const p of peaks) { const d = (t - p.tt) / fwhm; if (Math.abs(d) < 8) y += p.rel / (1 + 4 * d * d); }
      out.push([t, y]);
    }
    return out;
  };

  /* Score a simulated pattern against measured peaks, allowing a uniform lattice scale
     (DFT lattices differ from experiment by about 1%). measured: [{tt, rel}] */
  X.match = function (measured, sim, opts) {
    const o = Object.assign({ tol: 0.3, lambda: 1.5406 }, opts);
    const strong = sim.filter(p => p.rel >= 8);
    if (!strong.length || !measured.length) return { score: 0 };
    const rad = Math.PI / 180;
    const evalScale = sc => {
      /* scaling every lattice length by sc scales d by sc */
      const shifted = strong.map(p => { const d = p.d * sc; const s = o.lambda / (2 * d); return s < 1 ? Object.assign({}, p, { tt2: 2 * Math.asin(s) / rad }) : null; }).filter(Boolean);
      let matchedI = 0, totI = 0, err = 0; const used = new Set();
      shifted.forEach(p => {
        totI += p.rel;
        let bi = -1, bd = o.tol;
        measured.forEach((m, i) => { const dd = Math.abs(m.tt - p.tt2); if (dd <= bd) { bd = dd; bi = i; } });
        if (bi >= 0) { matchedI += p.rel * (1 - 0.5 * bd / o.tol); used.add(bi); err += bd; }
      });
      const explained = measured.reduce((s, m, i) => s + (used.has(i) ? m.rel : 0), 0) / measured.reduce((s, m) => s + m.rel, 0);
      const covered = totI ? matchedI / totI : 0;
      return { score: Math.sqrt(covered * explained), scale: sc, covered, explained, nMatched: used.size, meanError: used.size ? err / used.size : NaN };
    };
    let best = { score: -1 };
    for (let sc = 0.96; sc <= 1.0401; sc += 0.002) { const r = evalScale(sc); if (r.score > best.score + 1e-9) best = r; }
    for (let sc = best.scale - 0.002; sc <= best.scale + 0.002; sc += 0.0002) { const r = evalScale(sc); if (r.score > best.score + 1e-9) best = r; }
    return best;
  };

  /* Which simulated reflection explains each measured peak, at lattice scale sc. */
  X.assign = function (measured, sim, sc, opts) {
    const o = Object.assign({ tol: 0.3, lambda: 1.5406 }, opts), rad = Math.PI / 180;
    const sh = sim.map(p => { const s = o.lambda / (2 * p.d * sc); return s < 1 ? Object.assign({}, p, { tt2: 2 * Math.asin(s) / rad }) : null; }).filter(Boolean);
    return measured.map(m => {
      let best = null;
      sh.forEach(p => { const dd = Math.abs(p.tt2 - m.tt); if (dd <= o.tol && p.rel >= 1 && (!best || dd - 0.002 * p.rel < best.dd - 0.002 * best.p.rel)) best = { p, dd }; });
      return { m, ref: best ? best.p : null, delta: best ? m.tt - best.p.tt2 : null };
    });
  };
  /* Peaks the best phase leaves unexplained, matched against the other candidates. */
  X.secondPhase = function (measured, rows, opts) {
    if (rows.length < 2) return null;
    const first = rows[0], a = X.assign(measured, first.sim, first.fit.scale, opts);
    const rest = a.filter(x => !x.ref).map(x => x.m);
    const share = rest.reduce((s, m) => s + m.rel, 0) / measured.reduce((s, m) => s + m.rel, 0);
    if (rest.length < 2 || share < 0.1) return null;
    let best = null;
    rows.slice(1).forEach(r => { if (r.formula === first.formula && r.spacegroup === first.spacegroup) return; const f = X.match(rest, r.sim, opts); if (f.score > 0.45 && (!best || f.score > best.fit.score)) best = { row: r, fit: f }; });
    return { unexplained: rest, share, best };
  };

  /* Search a chemical system, simulate every candidate and rank by match. */
  X.identify = async function (measured, elements, opts, fetchImpl) {
    const o = Object.assign({ maxHull: 0.08, maxSites: 80, limit: 100, provider: 'pbe', lambda: 1.5406 }, opts);
    const res = await X.searchAll({ elements, only: true, maxHull: o.maxHull, maxSites: o.maxSites, limit: o.limit, provider: o.provider }, o.pages || 4, fetchImpl);
    const rows = res.entries.filter(e => e.structure).map(e => {
      const sim = X.xrd(e.structure, { sg: e.spacegroup, lambda: o.lambda, tmin: Math.max(5, Math.min(...measured.map(m => m.tt)) - 3), tmax: Math.max(...measured.map(m => m.tt)) + 3 });
      return Object.assign(e, { sim, fit: X.match(measured, sim, { lambda: o.lambda }) });
    }).filter(r => r.fit.score > 0).sort((a, b) => b.fit.score - a.fit.score || a.hull - b.hull);
    /* one row per phase (formula + space group); duplicates are DFT copies of the same phase */
    const seen = new Map(), out = [];
    rows.forEach(r => { const k = r.formula + '|' + r.spacegroup; if (seen.has(k)) seen.get(k).copies++; else { r.copies = 1; seen.set(k, r); out.push(r); } });
    return { rows: out, more: res.more, searched: res.entries.length };
  };

  /* CIF text for a structure (P1) */
  X.cif = function (e, st) {
    st = st || e.structure;
    const c = X.cell(st.lattice), fr = X.fractional(st.lattice, st.positions);
    const lines = ['data_' + (e.formula || 'structure'), `_cell_length_a ${c.a.toFixed(5)}`, `_cell_length_b ${c.b.toFixed(5)}`, `_cell_length_c ${c.c.toFixed(5)}`,
      `_cell_angle_alpha ${c.alpha.toFixed(4)}`, `_cell_angle_beta ${c.beta.toFixed(4)}`, `_cell_angle_gamma ${c.gamma.toFixed(4)}`, "_symmetry_space_group_name_H-M 'P 1'",
      'loop_', '_atom_site_label', '_atom_site_type_symbol', '_atom_site_fract_x', '_atom_site_fract_y', '_atom_site_fract_z'];
    fr.forEach((f, i) => lines.push(`${st.species[i]}${i + 1} ${st.species[i]} ${f.map(v => v.toFixed(6)).join(' ')}`));
    lines.push(`# Source: ${e.provider} entry ${e.id}${e.spacegroup ? `, space group ${X.sgSymbol(e.spacegroup)} (${e.spacegroup}); atoms listed in P1` : ''}. Data CC BY 4.0.`);
    return lines.join('\n') + '\n';
  };

  root.BF.xtal = X;
})(typeof window !== 'undefined' ? window : globalThis);
