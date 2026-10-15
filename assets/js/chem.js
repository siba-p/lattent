/* Element data, formula parsing, composition features and charge-balance checks, shared by
   the training scripts (Node) and the browser. Electronegativities are Pauling values;
   radii are covalent radii (Cordero et al. 2008, pm); oxidation states are the common ones. */
(function (root) {
  'use strict';
  const SYM = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
    'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu').split(' ');
  const EN = [2.20, null, 0.98, 1.57, 2.04, 2.55, 3.04, 3.44, 3.98, null, 0.93, 1.31, 1.61, 1.90, 2.19, 2.58, 3.16, null, 0.82, 1.00,
    1.36, 1.54, 1.63, 1.66, 1.55, 1.83, 1.88, 1.91, 1.90, 1.65, 1.81, 2.01, 2.18, 2.55, 2.96, 3.00, 0.82, 0.95, 1.22, 1.33,
    1.60, 2.16, 1.90, 2.20, 2.28, 2.20, 1.93, 1.69, 1.78, 1.96, 2.05, 2.10, 2.66, 2.60, 0.79, 0.89, 1.10, 1.12, 1.13, 1.14,
    1.13, 1.17, 1.20, 1.20, 1.10, 1.22, 1.23, 1.24, 1.25, 1.10, 1.27, 1.30, 1.50, 2.36, 1.90, 2.20, 2.20, 2.28, 2.54, 2.00,
    1.62, 2.33, 2.02, 2.00, 2.20, null, 0.70, 0.90, 1.10, 1.30, 1.50, 1.38, 1.36, 1.28];
  const RAD = [31, 28, 128, 96, 84, 76, 71, 66, 57, 58, 166, 141, 121, 111, 107, 105, 102, 106, 203, 176, 170, 160, 153, 139, 150,
    142, 138, 124, 132, 122, 122, 120, 119, 120, 120, 116, 220, 195, 190, 175, 164, 154, 147, 146, 142, 139, 145, 144, 142,
    139, 139, 138, 139, 140, 244, 215, 207, 204, 203, 201, 199, 198, 198, 196, 194, 192, 192, 189, 190, 187, 187, 175, 170,
    162, 151, 144, 141, 136, 136, 132, 145, 146, 148, 140, 150, 150, 260, 221, 215, 206, 200, 196, 190, 187];
  const OX = {
    H: [-1, 1], Li: [1], Be: [2], B: [3], C: [-4, 4], N: [-3, 3, 5], O: [-2], F: [-1], Na: [1], Mg: [2], Al: [3], Si: [-4, 4],
    P: [-3, 3, 5], S: [-2, 2, 4, 6], Cl: [-1, 1, 3, 5, 7], K: [1], Ca: [2], Sc: [3], Ti: [2, 3, 4], V: [2, 3, 4, 5], Cr: [2, 3, 6],
    Mn: [2, 3, 4, 7], Fe: [2, 3], Co: [2, 3], Ni: [2], Cu: [1, 2], Zn: [2], Ga: [3], Ge: [-4, 2, 4], As: [-3, 3, 5], Se: [-2, 2, 4, 6],
    Br: [-1, 1, 3, 5], Rb: [1], Sr: [2], Y: [3], Zr: [4], Nb: [5], Mo: [4, 6], Tc: [4, 7], Ru: [3, 4], Rh: [3], Pd: [2, 4], Ag: [1],
    Cd: [2], In: [3], Sn: [-4, 2, 4], Sb: [-3, 3, 5], Te: [-2, 2, 4, 6], I: [-1, 1, 3, 5, 7], Xe: [2, 4, 6], Cs: [1], Ba: [2], La: [3],
    Ce: [3, 4], Pr: [3], Nd: [3], Pm: [3], Sm: [3], Eu: [2, 3], Gd: [3], Tb: [3], Dy: [3], Ho: [3], Er: [3], Tm: [3], Yb: [3],
    Lu: [3], Hf: [4], Ta: [5], W: [4, 6], Re: [4], Os: [4], Ir: [3, 4], Pt: [2, 4], Au: [3], Hg: [1, 2], Tl: [1, 3], Pb: [2, 4],
    Bi: [3], Po: [-2, 2, 4], At: [-1, 1], Fr: [1], Ra: [2], Ac: [3], Th: [4], Pa: [5], U: [6], Np: [5], Pu: [4]
  };
  function place(z) {
    let period, group, block;
    if (z <= 2) { period = 1; group = z === 1 ? 1 : 18; }
    else if (z <= 18) { period = z <= 10 ? 2 : 3; const o = z - (period === 2 ? 3 : 11); group = o < 2 ? o + 1 : o + 11; }
    else if (z <= 54) { period = z <= 36 ? 4 : 5; group = z - (period === 4 ? 19 : 37) + 1; }
    else {
      period = z <= 86 ? 6 : 7; const s = period === 6 ? 55 : 87; const o = z - s;
      if (o < 2) group = o + 1;
      else if (o <= 16) group = 3;
      else group = o - 13;
    }
    const f = (z >= 58 && z <= 71) || (z >= 90 && z <= 103);
    if (f) block = 'f';
    else if (group <= 2 || z === 2) block = 's';
    else if (group >= 13) block = 'p';
    else block = 'd';
    const valence = block === 's' ? group === 18 ? 2 : group : block === 'p' ? group - 10 : block === 'd' ? group : 3;
    return { period, group, block, valence };
  }
  const EL = SYM.map((s, i) => Object.assign({ sym: s, z: i + 1, en: EN[i], rad: RAD[i], ox: OX[s] || [] }, place(i + 1)));
  const BY = Object.fromEntries(EL.map(e => [e.sym, e]));
  const C = { SYM, EL, BY, K: SYM.length };

  /* "Zn0.5Cd0.5S", "LiFePO4", "Ca(OH)2" → {Zn: .5, Cd: .5, S: 1} */
  C.parse = function (formula) {
    const s = String(formula || '').replace(/\s+/g, '');
    let i = 0;
    function group() {
      const out = {};
      while (i < s.length && s[i] !== ')') {
        let part;
        if (s[i] === '(') { i++; part = group(); if (s[i] !== ')') throw new Error('Unbalanced brackets'); i++; }
        else {
          const m = /^[A-Z][a-z]?/.exec(s.slice(i));
          if (!m || !BY[m[0]]) throw new Error('Unknown element at “' + s.slice(i, i + 2) + '”');
          i += m[0].length; part = { [m[0]]: 1 };
        }
        const n = /^\d*\.?\d+/.exec(s.slice(i));
        const k = n ? parseFloat(n[0]) : 1;
        if (n) i += n[0].length;
        for (const e in part) out[e] = (out[e] || 0) + part[e] * k;
      }
      return out;
    }
    const r = group();
    if (i !== s.length) throw new Error('Unexpected “' + s[i] + '”');
    if (!Object.keys(r).length) throw new Error('Empty formula');
    return r;
  };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  /* Smallest integer formula; non-integer amounts are scaled to integers first. */
  C.reduce = function (comp) {
    const els = Object.keys(comp);
    let mult = 1;
    for (const m of [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 50, 100]) { if (els.every(e => Math.abs(comp[e] * m - Math.round(comp[e] * m)) < 1e-6)) { mult = m; break; } mult = m; }
    const ints = Object.fromEntries(els.map(e => [e, Math.max(1, Math.round(comp[e] * mult))]));
    const g = Object.values(ints).reduce(gcd);
    return Object.fromEntries(els.map(e => [e, ints[e] / g]));
  };
  /* Hill-like ordering by electronegativity, as chemists write: cations first */
  C.format = function (comp) {
    const r = C.reduce(comp);
    return Object.keys(r).sort((a, b) => (BY[a].en || 4) - (BY[b].en || 4) || BY[a].z - BY[b].z).map(e => e + (r[e] === 1 ? '' : r[e])).join('');
  };
  C.key = comp => { const r = C.reduce(comp); return Object.keys(r).sort().map(e => e + r[e]).join(''); };
  C.fractions = function (comp) {
    const t = Object.values(comp).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.entries(comp).map(([e, v]) => [e, v / t]));
  };

  /* Fixed-length feature vector: element fractions plus fraction-weighted statistics. */
  const PROPS = ['z', 'group', 'period', 'en', 'rad', 'valence'];
  C.NFEAT = SYM.length + PROPS.length * 5 + 4 + 1;
  C.features = function (comp) {
    const fr = C.fractions(comp);
    const v = new Array(C.NFEAT).fill(0);
    const els = Object.keys(fr);
    els.forEach(e => { v[BY[e].z - 1] = fr[e]; });
    let k = SYM.length;
    for (const p of PROPS) {
      const vals = els.map(e => { const x = BY[e][p]; return x == null ? 3.2 : x; });
      const w = els.map(e => fr[e]);
      const mean = vals.reduce((s, x, i) => s + x * w[i], 0);
      const mad = vals.reduce((s, x, i) => s + Math.abs(x - mean) * w[i], 0);
      const mn = Math.min(...vals), mx = Math.max(...vals);
      v[k++] = mean; v[k++] = mad; v[k++] = mn; v[k++] = mx; v[k++] = mx - mn;
    }
    for (const b of ['s', 'p', 'd', 'f']) v[k++] = els.reduce((s, e) => s + (BY[e].block === b ? fr[e] : 0), 0);
    v[k++] = els.length;
    return v;
  };

  /* Can the formula be balanced with common oxidation states, cations less
     electronegative than anions? Returns {balanced, states} or {balanced: false}. */
  C.chargeBalance = function (comp) {
    const r = C.reduce(comp);
    const els = Object.keys(r);
    const metalsOnly = els.every(e => !BY[e].ox.some(q => q < 0));
    let best = null;
    const rec = (i, sum, st) => {
      if (best) return;
      if (i === els.length) {
        if (sum !== 0) return;
        const neg = els.filter(e => st[e] < 0), pos = els.filter(e => st[e] > 0);
        if (!neg.length || !pos.length) return;
        const enOk = Math.min(...neg.map(e => BY[e].en || 4)) >= Math.max(...pos.map(e => BY[e].en || 0)) - 1e-9;
        if (enOk) best = Object.assign({}, st);
        return;
      }
      for (const q of BY[els[i]].ox) { st[els[i]] = q; rec(i + 1, sum + q * r[els[i]], st); }
    };
    if (els.length <= 6) rec(0, 0, {});
    return best ? { balanced: true, states: best, intermetallic: false } : { balanced: false, intermetallic: metalsOnly };
  };

  root.BF = root.BF || {};
  root.BF.chem = C;
})(typeof window !== 'undefined' ? window : globalThis);
