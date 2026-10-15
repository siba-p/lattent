/* Lattent analysis engines: dose–response, standard curves, enzyme kinetics, qPCR.
   Pure functions with no DOM access, shared by the web tools and the test suite. */
(function (root) {
  'use strict';
  const S = root.BF.stats;
  const E = {};
  const sorted = a => a.slice().sort((x, y) => x - y);
  const uniq = a => [...new Set(a)];
  const median = a => { const s = sorted(a); const m = s.length >> 1; return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };

  /* Means by distinct x, for initial guesses and plotting. */
  E.groupMeans = function (pts, key) {
    key = key || (p => p.x);
    const m = new Map();
    pts.forEach(p => { const k = key(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p.y); });
    return [...m.entries()].map(([x, ys]) => ({ x, y: S.mean(ys), sd: S.sd(ys), n: ys.length, ys }))
      .sort((a, b) => a.x - b.x);
  };

  /* ---------------- Dose–response ---------------- */
  E.dose = {};
  E.dose.models = {
    '4pl': {
      label: 'Four-parameter logistic (variable slope)',
      names: ['Bottom', 'Top', 'logEC50', 'Hill slope'],
      f: (x, p) => p[0] + (p[1] - p[0]) / (1 + Math.pow(10, (p[2] - x) * p[3]))
    },
    '5pl': {
      label: 'Five-parameter logistic (asymmetric)',
      names: ['Bottom', 'Top', 'logEC50', 'Hill slope', 'Asymmetry'],
      f: (x, p) => {
        const lxb = p[2] + (1 / p[3]) * Math.log10(Math.pow(2, 1 / p[4]) - 1);
        return p[0] + (p[1] - p[0]) / Math.pow(1 + Math.pow(10, (lxb - x) * p[3]), p[4]);
      }
    },
    '3pl': {
      label: 'Three-parameter logistic (Hill slope = ±1)',
      names: ['Bottom', 'Top', 'logEC50', 'Hill slope'],
      f: (x, p) => p[0] + (p[1] - p[0]) / (1 + Math.pow(10, (p[2] - x) * p[3]))
    }
  };

  /* pts: [{conc, y}] with conc > 0 in the user's unit.
     opts: {model, bottom, top (numbers to fix, or null), ecx: [fractions]} */
  E.dose.fit = function (pts, opts) {
    opts = Object.assign({ model: '4pl', bottom: null, top: null, ecx: [] }, opts);
    const use = pts.filter(p => p.conc > 0 && isFinite(p.y) && !p.excluded);
    const xs = use.map(p => Math.log10(p.conc)), ys = use.map(p => p.y);
    const means = E.groupMeans(use.map((p, i) => ({ x: xs[i], y: p.y })));
    if (means.length < 4) return { error: 'At least four distinct concentrations are needed to fit a sigmoidal curve.' };
    const M = E.dose.models[opts.model];
    const ymin = Math.min(...means.map(m => m.y)), ymax = Math.max(...means.map(m => m.y));
    const xlo = means[0].x, xhi = means[means.length - 1].x;
    const rising = means[means.length - 1].y > means[0].y;
    const sgn = rising ? 1 : -1;
    const mid = 0.5 * (ymin + ymax);
    let xmid = means[0].x;
    for (let i = 1; i < means.length; i++) if (Math.abs(means[i].y - mid) < Math.abs(
      means.find(m => m.x === xmid).y - mid)) xmid = means[i].x;
    const b0 = opts.bottom != null ? opts.bottom : ymin;
    const t0 = opts.top != null ? opts.top : ymax;
    const fixed = [opts.bottom != null, opts.top != null, false, opts.model === '3pl'];
    if (opts.model === '5pl') fixed.push(false);
    const starts = [];
    const hills = opts.model === '3pl' ? [sgn] : [0.5, 1, 2, 4].map(h => h * sgn);
    const lxs = uniq([xmid, 0.5 * (xlo + xhi), xlo + 0.25 * (xhi - xlo), xlo + 0.75 * (xhi - xlo)]);
    for (const h of hills) for (const lx of lxs) {
      const p = [b0, t0, lx, h];
      if (opts.model === '5pl') { starts.push(p.concat([1])); starts.push(p.concat([0.5])); starts.push(p.concat([2])); }
      else starts.push(p);
    }
    let fit = S.multistart(M.f, xs, ys, starts, { fixed });
    if (!fit) return { error: 'The fit did not converge. Check the data or fix the plateaus.' };
    if (opts.model === '5pl' && fit.p[4] <= 0) return { error: 'The asymmetric model is not identifiable for these data. Use the 4PL model.' };

    const p = fit.p;
    const lo = p[3] > 0 ? p[0] : p[1], hi = p[3] > 0 ? p[1] : p[0];
    const res = { fit, model: opts.model, M, xs, ys, used: use.length, means, ambiguous: [] };
    res.logEC50 = p[2];
    res.ec50 = Math.pow(10, p[2]);
    res.ec50ci = fit.cov ? [Math.pow(10, fit.ci[2][0]), Math.pow(10, fit.ci[2][1])] : [NaN, NaN];
    res.hill = p[3];
    res.bottom = p[0]; res.top = p[1];

    /* Concentration giving a fraction F of the response change from the low-dose
       plateau toward the high-dose plateau. */
    const ecF = (F, q) => {
      const lowP = q[3] > 0 ? q[0] : q[1], highP = q[3] > 0 ? q[1] : q[0];
      const target = lowP + F * (highP - lowP);
      const span = 40 / Math.max(Math.abs(q[3]), 0.05);
      return S.bisect(x => M.f(x, q) - target, q[2] - span, q[2] + span);
    };
    res.ecx = (opts.ecx || []).map(F => {
      const lx = ecF(F, p);
      if (lx == null) return { F, value: NaN, ci: [NaN, NaN] };
      const se = S.deltaSE(q => { const v = ecF(F, q); return v == null ? lx : v; }, fit);
      return { F, value: Math.pow(10, lx), ci: [Math.pow(10, lx - fit.tq * se), Math.pow(10, lx + fit.tq * se)] };
    });
    /* Absolute IC50/EC50: where the curve crosses 50 on a normalised scale. */
    if (opts.normalised) {
      const target = 50;
      const span = 40 / Math.max(Math.abs(p[3]), 0.05);
      const lx = (target > Math.min(lo, hi) && target < Math.max(lo, hi)) ? S.bisect(x => M.f(x, p) - target, p[2] - span, p[2] + span) : null;
      res.abs50 = lx == null ? NaN : Math.pow(10, lx);
    }
    if (p[2] < xlo || p[2] > xhi) res.ambiguous.push('The EC50 lies outside the tested concentration range, so it is an extrapolation.');
    if (fit.cov && fit.se[2] > 0.5) res.ambiguous.push('The EC50 is poorly determined (wide interval). More concentrations around the midpoint would help.');
    if (Math.abs(p[3]) > 5 && !fixed[3]) res.ambiguous.push('The Hill slope is unusually steep; check for too few points in the transition.');
    const rangeY = Math.abs(hi - lo);
    if (!fixed[0] && !fixed[1] && rangeY > 0 && (fit.se[0] > rangeY || fit.se[1] > rangeY)) res.ambiguous.push('A plateau is not defined by the data. Consider fixing it (for normalised data, bottom 0 or top 100).');
    return res;
  };

  /* Extra-sum-of-squares F test: does one logEC50 describe every dataset?
     sets: [[{conc, y}]]; the other parameters stay separate per dataset. */
  E.dose.sharedTest = function (sets, fits, opts) {
    const model = E.dose.models[opts.model];
    if (opts.model === '5pl' || sets.length < 2) return null;
    const xs = [], ys = [];
    sets.forEach((pts, d) => pts.filter(p => p.conc > 0 && isFinite(p.y) && !p.excluded).forEach(p => { xs.push({ d, x: Math.log10(p.conc) }); ys.push(p.y); }));
    const per = 3;
    const f = (o, p) => model.f(o.x, [p[o.d * per], p[o.d * per + 1], p[p.length - 1], p[o.d * per + 2]]);
    const p0 = [], fixed = [];
    fits.forEach(r => {
      p0.push(r.fit.p[0], r.fit.p[1], r.fit.p[3]);
      fixed.push(opts.bottom != null, opts.top != null, opts.model === '3pl');
    });
    p0.push(S.mean(fits.map(r => r.fit.p[2]))); fixed.push(false);
    const shared = S.lm(f, xs, ys, p0, { fixed });
    if (!shared) return null;
    const ssSep = fits.reduce((s, r) => s + r.fit.ssr, 0);
    const dfSep = fits.reduce((s, r) => s + r.fit.dof, 0);
    const dn = shared.dof - dfSep;
    if (dn <= 0 || dfSep <= 0) return null;
    const F = ((shared.ssr - ssSep) / dn) / (ssSep / dfSep);
    const p = F <= 0 ? 1 : 1 - S.ibeta(dn * F / (dn * F + dfSep), dn / 2, dfSep / 2);
    return { F, df1: dn, df2: dfSep, p, sharedEC50: Math.pow(10, shared.p[shared.p.length - 1]) };
  };

  /* ---------------- Standard curves ---------------- */
  E.std = {};
  E.std.models = {
    linear: { label: 'Linear', names: ['Intercept', 'Slope'], f: (x, p) => p[0] + p[1] * x },
    quadratic: { label: 'Quadratic', names: ['a', 'b', 'c'], f: (x, p) => p[0] + p[1] * x + p[2] * x * x },
    '4pl': {
      label: 'Four-parameter logistic', names: ['A (zero dose)', 'B (slope)', 'log C (inflection)', 'D (infinite dose)'],
      f: (x, p) => p[3] + (p[0] - p[3]) / (1 + Math.pow(x / Math.pow(10, p[2]), p[1]))
    },
    '5pl': {
      label: 'Five-parameter logistic', names: ['A (zero dose)', 'B (slope)', 'log C', 'D (infinite dose)', 'G (asymmetry)'],
      f: (x, p) => p[3] + (p[0] - p[3]) / Math.pow(1 + Math.pow(x / Math.pow(10, p[2]), p[1]), p[4])
    }
  };

  E.std.inverse = function (model, p, y) {
    if (model === 'linear') return p[1] === 0 ? NaN : (y - p[0]) / p[1];
    if (model === 'quadratic') {
      const [a, b, c] = p;
      if (Math.abs(c) < 1e-300) return (y - a) / b;
      const disc = b * b - 4 * c * (a - y);
      if (disc < 0) return NaN;
      const r1 = (-b + Math.sqrt(disc)) / (2 * c), r2 = (-b - Math.sqrt(disc)) / (2 * c);
      const ok = [r1, r2].filter(r => r >= 0);
      if (!ok.length) return Math.max(r1, r2);
      /* the branch on the monotone side of the vertex */
      const vx = -b / (2 * c);
      const good = ok.filter(r => (vx <= 0 ? true : r <= vx));
      return (good.length ? Math.min(...good) : Math.min(...ok));
    }
    const A = p[0], B = p[1], C = Math.pow(10, p[2]), D = p[3], G = model === '5pl' ? p[4] : 1;
    const ratio = (A - D) / (y - D);
    if (!(ratio > 0)) return NaN;
    const r = Math.pow(ratio, 1 / G) - 1;
    if (!(r > 0)) return NaN;
    return C * Math.pow(r, 1 / B);
  };

  /* standards: [{conc, y}] (conc ≥ 0); opts: {model, weight: 'none'|'1/y'|'1/y2'} */
  E.std.fit = function (standards, opts) {
    opts = Object.assign({ model: '4pl', weight: 'none' }, opts);
    const use = standards.filter(p => isFinite(p.conc) && p.conc >= 0 && isFinite(p.y) && !p.excluded);
    const xs = use.map(p => p.conc), ys = use.map(p => p.y);
    const means = E.groupMeans(use.map(p => ({ x: p.conc, y: p.y })));
    const M = E.std.models[opts.model];
    const need = { linear: 2, quadratic: 3, '4pl': 4, '5pl': 5 }[opts.model];
    if (means.length < need + (opts.model === '4pl' || opts.model === '5pl' ? 1 : 0))
      return { error: 'Too few standard concentrations for this model (' + means.length + ').' };
    const w = ys.map(y => {
      if (opts.weight === '1/y2') return y !== 0 ? 1 / (y * y) : 1;
      if (opts.weight === '1/y') return y !== 0 ? 1 / Math.abs(y) : 1;
      return 1;
    });
    let fit;
    if (opts.model === 'linear' || opts.model === 'quadratic') {
      const slope = (means[means.length - 1].y - means[0].y) / (means[means.length - 1].x - means[0].x || 1);
      const p0 = opts.model === 'linear' ? [means[0].y, slope] : [means[0].y, slope, 0];
      fit = S.lm(M.f, xs, ys, p0, { w });
    } else {
      const pos = means.filter(m => m.x > 0);
      const lmid = S.mean(pos.map(m => Math.log10(m.x)));
      const A0 = means[0].y, D0 = means[means.length - 1].y + 0.2 * (means[means.length - 1].y - means[0].y);
      const starts = [];
      for (const B of [0.7, 1, 1.5, 2.5]) for (const dl of [-0.5, 0, 0.5, 1]) {
        const p = [A0, B, lmid + dl, D0];
        if (opts.model === '5pl') { starts.push(p.concat([1])); starts.push(p.concat([0.5])); } else starts.push(p);
      }
      fit = S.multistart(M.f, xs, ys, starts, { w });
      if (fit && fit.p[1] < 0) {
        /* flip to the canonical B > 0 orientation: swap A and D, negate B */
        const q = fit.p.slice(); q[0] = fit.p[3]; q[3] = fit.p[0]; q[1] = -fit.p[1];
        if (opts.model === '4pl') fit = S.lm(M.f, xs, ys, q, { w });
      }
    }
    if (!fit) return { error: 'The standard-curve fit did not converge.' };
    const res = { fit, model: opts.model, M, means, n: use.length, weight: opts.weight };
    const xmin = Math.min(...means.map(m => m.x)), xmax = Math.max(...means.map(m => m.x));
    const posMin = Math.min(...means.filter(m => m.x > 0).map(m => m.x));
    res.range = [xmin, xmax];
    res.lowestNonzero = posMin;
    res.recovery = means.filter(m => m.x > 0).map(m => {
      const back = E.std.inverse(opts.model, fit.p, m.y);
      return { conc: m.x, mean: m.y, cv: m.n > 1 ? 100 * m.sd / Math.abs(m.y) : NaN, back, recovery: 100 * back / m.x };
    });
    const blank = means.find(m => m.x === 0);
    const increasing = fit.f(xmax, fit.p) > fit.f(posMin, fit.p);
    if (blank && blank.n >= 2 && isFinite(blank.sd)) {
      const sig = k => blank.y + (increasing ? 1 : -1) * k * blank.sd;
      res.lod = E.std.inverse(opts.model, fit.p, sig(3));
      res.loq = E.std.inverse(opts.model, fit.p, sig(10));
      res.blank = blank;
    }
    res.increasing = increasing;
    return res;
  };

  /* Interpolate unknowns: [{name, ys:[...], dilution}] */
  E.std.interpolate = function (res, unknowns) {
    const { fit, model } = res;
    return unknowns.map(u => {
      const ys = u.ys.filter(isFinite);
      const n = ys.length;
      const y = S.mean(ys);
      const conc = E.std.inverse(model, fit.p, y);
      const dil = u.dilution > 0 ? u.dilution : 1;
      let lo = NaN, hi = NaN;
      if (isFinite(conc)) {
        const sePar = S.deltaSE(q => { const v = E.std.inverse(model, q, y); return isFinite(v) ? v : conc; }, fit);
        const h = 1e-6 * Math.max(Math.abs(y), 1e-6);
        const dxdy = (E.std.inverse(model, fit.p, y + h) - E.std.inverse(model, fit.p, y - h)) / (2 * h);
        const seY = n > 1 ? S.sd(ys) / Math.sqrt(n) : 0;
        const se = Math.sqrt(sePar * sePar + (isFinite(dxdy) ? dxdy * dxdy * seY * seY : 0));
        lo = Math.max(conc - fit.tq * se, 0); hi = conc + fit.tq * se;
      }
      let flag = '';
      if (!isFinite(conc)) flag = 'off curve';
      else if (conc > res.range[1] * 1.0000001) flag = 'above range';
      else if (conc < res.lowestNonzero * 0.9999999) flag = 'below range';
      else if (res.loq != null && isFinite(res.loq) && conc < res.loq) flag = 'below LOQ';
      return {
        name: u.name, n, y, cv: n > 1 ? 100 * S.sd(ys) / Math.abs(y) : NaN,
        conc, lo, hi, dilution: dil, final: conc * dil, finalLo: lo * dil, finalHi: hi * dil, flag
      };
    });
  };

  /* ---------------- Enzyme kinetics ---------------- */
  E.kin = {};
  E.kin.single = {
    mm: { label: 'Michaelis–Menten', names: ['Vmax', 'Km'], f: (s, p) => p[0] * s / (p[1] + s) },
    subinh: { label: 'Substrate inhibition', names: ['Vmax', 'Km', 'Ksi'], f: (s, p) => p[0] * s / (p[1] + s * (1 + s / p[2])) },
    hill: { label: 'Allosteric sigmoidal (Hill)', names: ['Vmax', 'K½', 'h'], f: (s, p) => p[0] * Math.pow(s, p[2]) / (Math.pow(p[1], p[2]) + Math.pow(s, p[2])) }
  };
  E.kin.global = {
    competitive: { label: 'Competitive', names: ['Vmax', 'Km', 'Ki'], f: (x, p) => p[0] * x.s / (p[1] * (1 + x.i / p[2]) + x.s) },
    noncompetitive: { label: 'Non-competitive', names: ['Vmax', 'Km', 'Ki'], f: (x, p) => p[0] * x.s / ((1 + x.i / p[2]) * (p[1] + x.s)) },
    uncompetitive: { label: 'Uncompetitive', names: ['Vmax', 'Km', 'Ki'], f: (x, p) => p[0] * x.s / (p[1] + x.s * (1 + x.i / p[2])) },
    mixed: { label: 'Mixed', names: ['Vmax', 'Km', 'Ki', 'α'], f: (x, p) => p[0] * x.s / (p[1] * (1 + x.i / p[2]) + x.s * (1 + x.i / (p[3] * p[2]))) }
  };

  function kmGuess(means) {
    const vmax = Math.max(...means.map(m => m.y));
    let best = means[0];
    for (const m of means) if (Math.abs(m.y - vmax / 2) < Math.abs(best.y - vmax / 2)) best = m;
    return Math.max(best.x, 1e-12);
  }

  /* pts: [{s, y}] → fits of every single-substrate model, ranked by AICc */
  E.kin.fitSingle = function (pts) {
    const use = pts.filter(p => p.s >= 0 && isFinite(p.y) && !p.excluded);
    const xs = use.map(p => p.s), ys = use.map(p => p.y);
    const means = E.groupMeans(use.map(p => ({ x: p.s, y: p.y })));
    if (means.length < 4) return { error: 'At least four substrate concentrations are needed.' };
    const vmax = Math.max(...means.map(m => m.y)), km = kmGuess(means);
    const smax = means[means.length - 1].x;
    const fits = {};
    fits.mm = S.multistart(E.kin.single.mm.f, xs, ys, [[vmax * 1.2, km], [vmax * 2, km * 3], [vmax, km / 3]]);
    if (means.length >= 5) {
      fits.subinh = S.multistart(E.kin.single.subinh.f, xs, ys, [[vmax * 1.5, km, smax * 2], [vmax * 2.5, km * 2, smax], [vmax * 1.2, km, smax * 10]]);
      fits.hill = S.multistart(E.kin.single.hill.f, xs, ys, [[vmax * 1.1, km, 1], [vmax * 1.1, km, 2], [vmax * 1.3, km * 1.5, 0.7]]);
    }
    const keys = Object.keys(fits).filter(k => fits[k] && fits[k].p.every(v => isFinite(v)) &&
      (k === 'mm' ? fits[k].p[1] > 0 : k === 'subinh' ? fits[k].p[1] > 0 && fits[k].p[2] > 0 : fits[k].p[1] > 0 && fits[k].p[2] > 0));
    if (!keys.length) return { error: 'The kinetic fits did not converge.' };
    const w = S.akaikeWeights(keys.map(k => fits[k].aicc));
    const ranked = keys.map((k, i) => ({ key: k, fit: fits[k], weight: w[i], M: E.kin.single[k] })).sort((a, b) => b.weight - a.weight);
    return { ranked, best: ranked[0], means, n: use.length };
  };

  /* pts: [{s, i, y}] → global fits of the four inhibition mechanisms */
  E.kin.fitGlobal = function (pts) {
    const use = pts.filter(p => p.s >= 0 && p.i >= 0 && isFinite(p.y) && !p.excluded);
    const xs = use.map(p => ({ s: p.s, i: p.i })), ys = use.map(p => p.y);
    const iLevels = uniq(use.map(p => p.i)).sort((a, b) => a - b);
    if (iLevels.length < 2) return { error: 'Inhibition analysis needs at least two inhibitor concentrations (including zero).' };
    const base = E.groupMeans(use.filter(p => p.i === iLevels[0]).map(p => ({ x: p.s, y: p.y })));
    if (base.length < 3) return { error: 'Too few substrate concentrations in the uninhibited series.' };
    const vmax = Math.max(...base.map(m => m.y)), km = kmGuess(base);
    const pos = iLevels.filter(v => v > 0);
    const ki = median(pos.length ? pos : [1]);
    const fits = {};
    for (const k of ['competitive', 'noncompetitive', 'uncompetitive']) {
      fits[k] = S.multistart(E.kin.global[k].f, xs, ys, [[vmax * 1.2, km, ki], [vmax * 1.5, km * 2, ki / 3], [vmax, km / 2, ki * 3]]);
    }
    fits.mixed = S.multistart(E.kin.global.mixed.f, xs, ys,
      [[vmax * 1.2, km, ki, 1], [vmax * 1.2, km, ki, 5], [vmax * 1.2, km, ki, 0.2], [vmax * 1.5, km * 2, ki / 2, 2]]);
    const keys = Object.keys(fits).filter(k => fits[k] && fits[k].p.every(isFinite) && fits[k].p[1] > 0 && fits[k].p[2] > 0 && (k !== 'mixed' || fits[k].p[3] > 0));
    if (!keys.length) return { error: 'The inhibition fits did not converge.' };
    const w = S.akaikeWeights(keys.map(k => fits[k].aicc));
    const ranked = keys.map((k, i) => ({ key: k, fit: fits[k], weight: w[i], M: E.kin.global[k] })).sort((a, b) => b.weight - a.weight);
    return { ranked, best: ranked[0], iLevels, n: use.length };
  };

  /* ---------------- qPCR relative quantification ---------------- */
  E.qpcr = {};
  /* rows: [{sample, group, gene, ct}] (ct may be NaN for undetermined)
     opts: {refs: [genes], control: group, eff: {gene: amplification factor}} */
  E.qpcr.analyse = function (rows, opts) {
    const eff = opts.eff || {};
    const Eg = g => (eff[g] > 1 && eff[g] <= 2.2 ? eff[g] : 2);
    const genes = uniq(rows.map(r => r.gene));
    const groups = uniq(rows.map(r => r.group));
    const refs = (opts.refs || []).filter(g => genes.includes(g));
    const targets = genes.filter(g => !refs.includes(g));
    const warnings = [];
    if (!refs.length) return { error: 'Choose at least one reference gene.' };
    if (!targets.length) return { error: 'There is no target gene left after choosing reference genes.' };
    if (!groups.includes(opts.control)) return { error: 'Choose the control group.' };

    /* technical replicates → per (sample, gene) mean Ct */
    const tech = new Map();
    let undetermined = 0;
    rows.forEach(r => {
      const k = r.sample + '\u0000' + r.gene;
      if (!tech.has(k)) tech.set(k, { sample: r.sample, group: r.group, gene: r.gene, cts: [] });
      if (isFinite(r.ct)) tech.get(k).cts.push(r.ct); else undetermined++;
    });
    const techRows = [...tech.values()].map(t => ({ ...t, n: t.cts.length, ct: t.cts.length ? S.mean(t.cts) : NaN, sd: S.sd(t.cts) }));
    const noisy = techRows.filter(t => t.n > 1 && t.sd > 0.5);
    if (undetermined) warnings.push(undetermined + ' well' + (undetermined > 1 ? 's were' : ' was') + ' undetermined and excluded.');
    if (noisy.length) warnings.push(noisy.length + ' sample–gene pair' + (noisy.length > 1 ? 's have' : ' has') + ' technical replicates more than 0.5 cycles apart.');

    const ctOf = new Map(techRows.map(t => [t.sample + '\u0000' + t.gene, t]));
    const samples = uniq(rows.map(r => r.sample));
    const groupOf = new Map(rows.map(r => [r.sample, r.group]));
    const ctrlSamples = samples.filter(s => groupOf.get(s) === opts.control);
    const ctrlMean = {};
    for (const g of genes) {
      const v = ctrlSamples.map(s => ctOf.get(s + '\u0000' + g)).filter(t => t && isFinite(t.ct)).map(t => t.ct);
      ctrlMean[g] = v.length ? S.mean(v) : NaN;
    }
    /* log2 normalised relative quantity per sample and target */
    const per = [];
    for (const s of samples) {
      const refL = refs.map(g => { const t = ctOf.get(s + '\u0000' + g); return t && isFinite(t.ct) ? (ctrlMean[g] - t.ct) * Math.log2(Eg(g)) : NaN; });
      if (refL.some(v => !isFinite(v))) { warnings.push('Sample ' + s + ' lacks a reference-gene value and was skipped.'); continue; }
      const refLog = S.mean(refL);
      for (const g of targets) {
        const t = ctOf.get(s + '\u0000' + g);
        if (!t || !isFinite(t.ct)) continue;
        const l2 = (ctrlMean[g] - t.ct) * Math.log2(Eg(g)) - refLog;
        const refCt = S.mean(refs.map(r => ctOf.get(s + '\u0000' + r).ct));
        per.push({ sample: s, group: groupOf.get(s), gene: g, log2: l2, fold: Math.pow(2, l2), dct: t.ct - refCt });
      }
    }
    const summary = [];
    for (const g of targets) {
      const ctrl = per.filter(r => r.gene === g && r.group === opts.control).map(r => r.log2);
      const rowsG = [];
      for (const grp of groups) {
        const v = per.filter(r => r.gene === g && r.group === grp).map(r => r.log2);
        if (!v.length) continue;
        const n = v.length, m = S.mean(v), sd = S.sd(v);
        const q = n > 1 ? S.tinv(0.975, n - 1) : NaN;
        const half = n > 1 ? q * sd / Math.sqrt(n) : NaN;
        const t = grp !== opts.control ? S.welch(v, ctrl) : null;
        rowsG.push({ gene: g, group: grp, n, log2: m, sd, fold: Math.pow(2, m), lo: Math.pow(2, m - half), hi: Math.pow(2, m + half), p: t ? t.p : NaN, isControl: grp === opts.control });
      }
      /* Holm adjustment over the comparisons with the control for this gene */
      const tests = rowsG.filter(r => isFinite(r.p)).sort((a, b) => a.p - b.p);
      let running = 0;
      tests.forEach((r, i) => { running = Math.max(running, Math.min(1, (tests.length - i) * r.p)); r.pAdj = running; });
      summary.push(...rowsG);
    }
    return { genes, groups, refs, targets, techRows, per, summary, warnings, control: opts.control, eff: Object.fromEntries(genes.map(g => [g, Eg(g)])) };
  };

  /* Amplification efficiency from a dilution series: Ct vs log10(quantity). */
  E.qpcr.efficiency = function (pts) {
    const xs = pts.map(p => Math.log10(p.q)), ys = pts.map(p => p.ct);
    const fit = S.lm((x, p) => p[0] + p[1] * x, xs, ys, [S.mean(ys), -3.3]);
    if (!fit) return null;
    const slope = fit.p[1];
    const E10 = Math.pow(10, -1 / slope);
    return { slope, intercept: fit.p[0], r2: fit.r2, amp: E10, pct: 100 * (E10 - 1), fit };
  };

  root.BF.engines = E;
})(typeof window !== 'undefined' ? window : globalThis);
