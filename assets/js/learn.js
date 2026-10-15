/* Lattent's advanced machine learning, all in the browser:
   - L.symreg: equation discovery by sparse symbolic regression. A library of terms (powers,
     1/x, logarithms, exponentials and saturation terms at several scales) is combined in every
     way up to three terms, also on log(y); candidates are ranked by AICc, the complexity–error
     Pareto front is kept, and the best structures are refined by nonlinear least squares.
   - L.automl: regression AutoML. Linear, ridge, k-nearest-neighbour, random-forest,
     gradient-boosting and Gaussian-process models compared by cross-validation, with
     permutation importance, partial dependence and split-conformal prediction intervals. */
(function (root) {
  'use strict';
  const BF = root.BF;
  const L = {};
  BF.learn = L;
  const M = () => BF.models, A = () => BF.analysis;
  const sum = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const mean = a => sum(a) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(sum(a.map(v => (v - m) ** 2)) / Math.max(1, a.length - 1)); };
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /* Solve the symmetric system A b = y by Gaussian elimination with partial pivoting. */
  function solve(Am, b) {
    const n = b.length, a = Am.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) < 1e-14) return null;
      [a[c], a[piv]] = [a[piv], a[c]];
      for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; if (f) for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k]; x[r] = s / a[r][r]; }
    return x;
  }
  /* Least squares with columns given as arrays; lam adds ridge (not on the intercept, column 0). */
  function lstsq(cols, y, lam) {
    const p = cols.length, n = y.length;
    const G = Array.from({ length: p }, () => new Array(p).fill(0)), r = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) { let s = 0; const a = cols[i], b = cols[j]; for (let k = 0; k < n; k++) s += a[k] * b[k]; G[i][j] = G[j][i] = s; }
      let s = 0; const a = cols[i]; for (let k = 0; k < n; k++) s += a[k] * y[k]; r[i] = s;
    }
    const tr = G.reduce((s, row, i) => s + row[i], 0) / p;
    for (let i = 1; i < p; i++) G[i][i] += (lam || 0) + 1e-12 * tr;
    return solve(G, r);
  }

  /* =================== equation discovery =================== */
  const sup = s => String(s).replace(/[-−0-9.]/g, c => ({ '-': '⁻', '−': '⁻', '.': '·', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }[c]));
  const fmt = v => {
    if (!isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) { const [m, e] = v.toExponential(3).split('e'); return (+m).toString().replace(/^-/, '−') + '×10' + sup(String(+e)); }
    return String(+v.toPrecision(4)).replace(/^-/, '−');
  };
  const fmtE = v => { const a = Math.abs(v); return a !== 0 && (a < 1e-3 || a >= 1e5) ? v.toExponential(4) : String(+v.toPrecision(6)); };

  L.symreg = function (xs, ys, opts) {
    const o = Object.assign({ maxTerms: 3, logy: true, polish: 10, errors: 'auto' }, opts);
    const N = xs.length;
    if (N < 6) return { error: 'Equation discovery needs at least 6 points.' };
    let idx = xs.map((_, i) => i);
    if (N > 400) { const st = N / 400; idx = Array.from({ length: 400 }, (_, k) => Math.floor(k * st)); }
    const X = idx.map(i => xs[i]), Y = idx.map(i => ys[i]), m = X.length;
    const xmin = Math.min(...xs), xmax = Math.max(...xs), span = (xmax - xmin) || 1;
    const xpos = xs.every(x => x > 0), xnn = xs.every(x => x >= 0), xnz = xs.every(x => x !== 0), ypos = ys.every(y => y > 0);
    const pos = xs.filter(x => x > 0).sort((a, b) => a - b), med = pos.length ? pos[Math.floor(pos.length / 2)] : 1;
    /* data spanning decades usually carry relative (multiplicative) noise: judge errors in log space */
    const rel = o.errors === 'relative' || (o.errors !== 'absolute' && ypos && Math.max(...ys) / Math.min(...ys) > 20);
    const lnY = rel ? Y.map(Math.log) : null;
    /* term library: ex(name) gives the expression with its scale parameter named `name` */
    const F = [];
    const add = (id, fam, cx, f, ex, nl) => {
      const v = X.map(f);
      if (!v.every(isFinite) || sd(v) < 1e-12 * (Math.abs(mean(v)) + 1e-300)) return;
      F.push({ id, fam, cx, f, ex, nl, v });
    };
    add('x', 'x', 1, x => x, () => 'x');
    add('x2', 'x2', 2, x => x * x, () => 'x^2');
    add('x3', 'x3', 3, x => x * x * x, () => 'x^3');
    if (xnn) add('sqrt', 'sqrt', 2, Math.sqrt, () => 'sqrt(x)');
    if (xpos) add('isqrt', 'isqrt', 3, x => 1 / Math.sqrt(x), () => 'x^(-0.5)');
    if (xnz) { add('inv', 'inv', 2, x => 1 / x, () => '1/x'); add('inv2', 'inv2', 3, x => 1 / (x * x), () => 'x^(-2)'); }
    if (xpos) { add('ln', 'ln', 2, Math.log, () => 'ln(x)'); add('xln', 'xln', 3, x => x * Math.log(x), () => 'x*ln(x)'); }
    /* exponentials are referenced to the first x so that large x do not underflow */
    for (const f of [0.02, 0.04, 0.07, 0.12, 0.2, 0.33, 0.55, 0.9, 1.5, 2.5]) { const tau = span * f; add('expd' + f, 'expd', 3, x => Math.exp(-(x - xmin) / tau), n => `exp(-(x-(${fmtE(xmin)}))/${n})`, { sym: 'τ', v: tau }); }
    for (const f of [0.2, 0.4, 0.8, 1.6, 3]) { const tau = span * f; add('expg' + f, 'expg', 3, x => Math.exp((x - xmax) / tau), n => `exp((x-(${fmtE(xmax)}))/${n})`, { sym: 'τ', v: tau }); }
    if (xpos) for (const f of [0.03, 0.06, 0.12, 0.25, 0.5, 1, 2, 4, 8, 16]) { const K = med * f; add('sat' + f, 'sat', 4, x => x / (K + x), n => `x/(${n}+x)`, { sym: 'K', v: K }); }
    const targets = [{ id: 'y', t: Y, back: v => v }];
    if (o.logy && ypos) targets.push({ id: 'lny', t: Y.map(Math.log), back: Math.exp });
    const one = new Array(m).fill(1);
    const best = new Map();
    let tried = 0;
    const consider = (T, sub) => {
      /* physics prior: equations for ln(y) use power-type and 1/x-type terms only
         (power law, Arrhenius, modified Arrhenius), never nested exponentials */
      if (T.id === 'lny' && sub.some(f => f.nl)) return;
      const fams = sub.map(f => f.fam);
      for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) if (fams[i] === fams[j] && !sub[i].nl) return;
      const beta = lstsq([one].concat(sub.map(f => f.v)), T.t);
      tried++;
      if (!beta || !beta.every(isFinite)) return;
      let rss = 0;
      for (let k = 0; k < m; k++) {
        let s = beta[0]; for (let j = 0; j < sub.length; j++) s += beta[j + 1] * sub[j].v[k];
        const yh = T.back(s);
        if (rel) { if (!(yh > 0)) return; rss += (lnY[k] - Math.log(yh)) ** 2; } else rss += (Y[k] - yh) ** 2;
      }
      if (!isFinite(rss)) return;
      const nk = 1 + sub.length + sub.filter(f => f.nl).length;
      if (m - nk - 2 <= 0) return;
      const kk = nk + 1, aicc = m * Math.log(Math.max(rss, 1e-300) / m) + 2 * kk + 2 * kk * (kk + 1) / (m - kk - 1);
      const key = T.id + '|' + fams.slice().sort().join('+');
      const prev = best.get(key);
      if (!prev || aicc < prev.aicc) best.set(key, { T, sub, beta, rss, aicc, key, cx: 1 + sum(sub.map(f => f.cx + 1)) + (T.id === 'lny' ? 2 : 0) });
    };
    for (const T of targets) {
      const n = F.length;
      for (let a = 0; a < n; a++) {
        consider(T, [F[a]]);
        if (o.maxTerms < 2) continue;
        for (let b = a + 1; b < n; b++) {
          consider(T, [F[a], F[b]]);
          if (o.maxTerms < 3) continue;
          for (let c = b + 1; c < n; c++) consider(T, [F[a], F[b], F[c]]);
        }
      }
    }
    const ranked = [...best.values()].sort((a, b) => a.aicc - b.aicc);
    /* refine the most promising structures, plus the simplest few so the Pareto front is complete */
    const pick = ranked.slice(0, o.polish);
    const byCx = ranked.slice().sort((a, b) => a.cx - b.cx || a.aicc - b.aicc);
    for (const c of byCx) { if (pick.length >= o.polish + 4) break; if (!pick.includes(c) && !pick.some(p => p.cx === c.cx)) pick.push(c); }
    /* every one-term law gets refined: its scale may sit between grid points */
    ranked.filter(c => c.sub.length === 1).slice(0, 8).forEach(c => { if (!pick.includes(c)) pick.push(c); });
    const out = [];
    for (const c of pick) {
      const r = refine(c, xs, ys, xmin, rel);
      if (r) out.push(r);
    }
    if (!out.length) return { error: 'No equation could be fitted to these data.' };
    out.sort((a, b) => a.aicc - b.aicc);
    const minA = out[0].aicc;
    out.forEach(r => { r.dAICc = r.aicc - minA; });
    /* Prefer a recognised physical law (exponential decay, power law, Arrhenius, Langmuir…) unless
       the data clearly reject it. The best generic form is the winner of thousands of searched
       candidates, so its AICc is optimistically biased (look-elsewhere effect); a margin of about
       2·ln(generic/named candidates), 14 units here, corrects for that. Otherwise take the simplest
       equation within 4 units. Generic forms stay listed as alternatives. */
    const GENERIC = /Combined|Log-linear|Cubic/;
    const named = out.filter(r => !GENERIC.test(r.law) && r.dAICc < 14).sort((a, b) => a.cx - b.cx || a.aicc - b.aicc)[0];
    const chosen = named || out.filter(r => r.dAICc < 4).sort((a, b) => a.cx - b.cx || a.aicc - b.aicc)[0];
    chosen.preferred = !!named && named.dAICc > 0.5;
    const pareto = []; let bestErr = Infinity;
    out.slice().sort((a, b) => a.cx - b.cx || a.rmse - b.rmse).forEach(r => { if (r.rmse < bestErr * 0.999) { pareto.push(r); bestErr = r.rmse; } });
    return { best: chosen, results: out, pareto, tried, structures: best.size, n: N, searchedOn: m, library: F.length, errors: rel ? 'relative' : 'absolute' };
  };

  /* Turn a linear-in-coefficients candidate into a parameterised equation and fit it fully. */
  function refine(c, xs, ys, xmin, rel) {
    const sub = c.sub, b = c.beta, ln = c.T.id === 'lny';
    const coefNames = ['a', 'b', 'c', 'd'];
    const start = {}, terms = [];
    let nlk = 0;
    sub.forEach((f, j) => {
      let ex;
      if (f.nl) { const nm = (f.nl.sym === 'τ' ? 'tau' : 'K') + (nlk ? nlk + 1 : ''); nlk++; ex = f.ex(nm); start[nm] = f.nl.v; }
      else ex = f.ex();
      terms.push({ coef: coefNames[j + 1], ex, f });
      start[coefNames[j + 1]] = b[j + 1];
    });
    start.a = b[0];
    let expr, shape = null;
    const fams = sub.map(f => f.fam);
    if (ln && sub.length === 1 && fams[0] === 'ln') { expr = 'a*x^b'; start.a = Math.exp(b[0]); start.b = b[1]; shape = 'power'; }
    else if (ln && sub.length === 1 && fams[0] === 'inv') { expr = 'a*exp(b/x)'; start.a = Math.exp(b[0]); start.b = b[1]; shape = 'arrhenius'; }
    else if (ln && sub.length === 1 && fams[0] === 'x') { expr = 'a*exp(b*x)'; start.a = Math.exp(b[0]); start.b = b[1]; shape = 'exponential'; }
    else {
      const lin = 'a' + terms.map(t => ` + ${t.coef}*${t.ex}`).join('');
      expr = ln ? `exp(${lin})` : lin;
    }
    let model, fit;
    try { model = M().custom(expr, start); fit = M().fit(model, xs, ys, rel ? { weight: '1/y2' } : {}); } catch (e) { return null; }
    if (!fit || fit.error || !isFinite(fit.fit.aicc)) return null;
    const p = fit.fit.p, names = model.params;
    const val = nm => p[names.indexOf(nm)];
    /* error on the scale used for ranking: absolute, or relative (fraction of y) */
    const rmse = rel ? Math.sqrt(fit.fit.ssr / xs.length) : Math.sqrt(fit.fit.ssrUnweighted / xs.length);
    const pretty = prettyEq(expr, names, p, shape, sub, ln, xmin, Math.max(...xs));
    return { expr, params: names, p, se: fit.fit.se, start: Object.fromEntries(names.map((n, i) => [n, p[i]])), aicc: fit.fit.aicc, r2: fit.fit.r2, rmse, cx: c.cx,
      law: lawName(fams, ln, shape), pretty, f: x => model.f(x, p), fit, val, terms: sub.length, logTarget: ln };
  }
  function lawName(fams, ln, shape) {
    const k = fams.slice().sort().join('+');
    if (shape === 'power') return 'Power law';
    if (shape === 'arrhenius') return 'Arrhenius-type (exponential in 1/x)';
    if (shape === 'exponential') return 'Exponential';
    if (ln) return 'Log-linear model';
    return ({ x: 'Straight line', x2: 'Quadratic (x²)', 'x+x2': 'Quadratic', 'x+x2+x3': 'Cubic', expd: 'Exponential decay', 'expd+expd': 'Two-phase exponential decay', expg: 'Exponential growth',
      sat: 'Saturation (Langmuir-type)', ln: 'Logarithmic', inv: 'Inverse (1/x)', isqrt: 'Inverse square root (Hall–Petch-type)', sqrt: 'Square-root law', 'expd+x': 'Exponential decay on a linear background',
      'sat+x': 'Saturation plus linear term', 'sat+sat': 'Two-site saturation' })[k] || 'Combined model';
  }
  function prettyEq(expr, names, p, shape, sub, ln, xmin, xmax) {
    const v = n => p[names.indexOf(n)];
    const s = (c, first) => (first ? (c < 0 ? '−' : '') : (c < 0 ? ' − ' : ' + ')) + fmt(Math.abs(c));
    if (shape === 'power') return `y = ${fmt(v('a'))}·x${sup(fmt(v('b')))}`;
    if (shape === 'arrhenius') return `y = ${fmt(v('a'))}·exp(${fmt(v('b'))} / x)`;
    if (shape === 'exponential') return `y = ${fmt(v('a'))}·exp(${fmt(v('b'))}·x)`;
    let nlk = 0;
    const parts = sub.map((f, j) => {
      const c = v(['b', 'c', 'd'][j]);
      let t;
      if (f.nl) {
        const nm = (f.nl.sym === 'τ' ? 'tau' : 'K') + (nlk ? nlk + 1 : ''); nlk++;
        const q = v(nm);
        const shift = (x0, sign) => (x0 === 0 ? `${sign}x/${fmt(q)}` : `${sign}(x − ${fmt(x0)})/${fmt(q)}`);
        t = f.fam === 'expd' ? `e^(${shift(xmin, '−')})` : f.fam === 'expg' ? `e^(${shift(xmax, '')})` : `x/(${fmt(q)} + x)`;
      } else t = ({ x: 'x', x2: 'x²', x3: 'x³', sqrt: '√x', isqrt: '/√x', inv: '/x', inv2: '/x²', ln: 'ln x', xln: 'x·ln x' })[f.fam];
      return { c, t };
    });
    const body = s(v('a'), true) + parts.map(q => (q.t[0] === '/' ? `${s(q.c)}${q.t}` : `${s(q.c)}·${q.t}`)).join('');
    return ln ? `y = exp(${body})` : `y = ${body}`;
  }

  /* =================== AutoML regression =================== */
  /* Regression tree on rows `ids` (CART, squared error). */
  function tree(X, y, ids, o, r, depth) {
    const n = ids.length;
    let s = 0; for (const i of ids) s += y[i];
    const mu = s / n;
    if (n < 2 * o.minLeaf || depth >= o.maxDepth) return { v: mu };
    const p = X[0].length, feats = [];
    const all = Array.from({ length: p }, (_, j) => j);
    if (o.mtry < p) { shuffle(all, r); for (let k = 0; k < o.mtry; k++) feats.push(all[k]); } else feats.push(...all);
    let bestGain = 1e-12, bf = -1, bt = 0;
    let sst = 0; for (const i of ids) sst += (y[i] - mu) ** 2;
    for (const j of feats) {
      const ord = ids.slice().sort((a, b) => X[a][j] - X[b][j]);
      let sl = 0, sl2 = 0;
      let tot = 0, tot2 = 0; for (const i of ord) { tot += y[i]; tot2 += y[i] * y[i]; }
      for (let k = 0; k < n - 1; k++) {
        const yi = y[ord[k]]; sl += yi; sl2 += yi * yi;
        const nl = k + 1, nr = n - nl;
        if (nl < o.minLeaf || nr < o.minLeaf) continue;
        if (X[ord[k]][j] === X[ord[k + 1]][j]) continue;
        const sr = tot - sl, sr2 = tot2 - sl2;
        const sse = (sl2 - sl * sl / nl) + (sr2 - sr * sr / nr);
        const gain = sst - sse;
        if (gain > bestGain) { bestGain = gain; bf = j; bt = (X[ord[k]][j] + X[ord[k + 1]][j]) / 2; }
      }
    }
    if (bf < 0) return { v: mu };
    const L2 = [], R2 = [];
    for (const i of ids) (X[i][bf] <= bt ? L2 : R2).push(i);
    return { f: bf, t: bt, l: tree(X, y, L2, o, r, depth + 1), r: tree(X, y, R2, o, r, depth + 1) };
  }
  const predTree = (nd, x) => { while (nd.f != null) nd = x[nd.f] <= nd.t ? nd.l : nd.r; return nd.v; };
  const standardiser = X => {
    const p = X[0].length, mu = [], s = [];
    for (let j = 0; j < p; j++) { const c = X.map(r => r[j]); mu.push(mean(c)); s.push(sd(c) || 1); }
    return r => r.map((v, j) => (v - mu[j]) / s[j]);
  };
  /* Gaussian process with one length-scale per input (ARD), fitted by maximising the marginal
     likelihood with Nelder–Mead from a single standardised start; typed arrays keep it fast. */
  function nelder(f, x0, iters) {
    const n = x0.length;
    let P = [x0.slice()].concat(x0.map((_, i) => { const v = x0.slice(); v[i] += 0.6; return v; }));
    let F = P.map(f);
    for (let it = 0; it < iters; it++) {
      const ord = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); P = ord.map(i => P[i]); F = ord.map(i => F[i]);
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
      const pt = (t) => c.map((v, j) => v + t * (P[n][j] - v));
      const r = pt(-1), fr = f(r);
      if (fr < F[0]) { const e = pt(-2), fe = f(e); if (fe < fr) { P[n] = e; F[n] = fe; } else { P[n] = r; F[n] = fr; } }
      else if (fr < F[n - 1]) { P[n] = r; F[n] = fr; }
      else { const k = pt(0.5), fk = f(k); if (fk < F[n]) { P[n] = k; F[n] = fk; } else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); F[i] = f(P[i]); } } }
      if (Math.abs(F[n] - F[0]) < 1e-7) break;
    }
    return P[F.indexOf(Math.min(...F))];
  }
  function leanGP(X, y) {
    const n = X.length, d = X[0].length, z = standardiser(X), Z = X.map(z);
    const my = mean(y), sy = sd(y) || 1, t = y.map(v => (v - my) / sy);
    const K = new Float64Array(n * n), al = new Float64Array(n);
    const chol = () => { for (let j = 0; j < n; j++) { let s = K[j * n + j]; for (let k = 0; k < j; k++) s -= K[j * n + k] ** 2; if (s <= 0) return false; const l = Math.sqrt(s); K[j * n + j] = l; for (let i = j + 1; i < n; i++) { let q = K[i * n + j]; for (let k = 0; k < j; k++) q -= K[i * n + k] * K[j * n + k]; K[i * n + j] = q / l; } } return true; };
    const csolve = b => { const v = Float64Array.from(b); for (let i = 0; i < n; i++) { let s = v[i]; for (let k = 0; k < i; k++) s -= K[i * n + k] * v[k]; v[i] = s / K[i * n + i]; } for (let i = n - 1; i >= 0; i--) { let s = v[i]; for (let k = i + 1; k < n; k++) s -= K[k * n + i] * v[k]; v[i] = s / K[i * n + i]; } return v; };
    let hp = null;
    const build = th => {
      const il = th.slice(0, d).map(v => Math.exp(-2 * v)), sf2 = Math.exp(th[d]), sn2 = Math.exp(th[d + 1]) + 1e-6;
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = 0; const a = Z[i], b = Z[j]; for (let k = 0; k < d; k++) s += (a[k] - b[k]) ** 2 * il[k]; const v = sf2 * Math.exp(-0.5 * s) + (i === j ? sn2 : 0); K[i * n + j] = v; K[j * n + i] = v; }
      return { il, sf2, sn2 };
    };
    const nlml = th => {
      if (th.some(v => !isFinite(v) || Math.abs(v) > 8)) return 1e10;
      build(th); if (!chol()) return 1e10;
      const a = csolve(t); let q = 0, ld = 0; for (let i = 0; i < n; i++) { q += t[i] * a[i]; ld += Math.log(K[i * n + i]); }
      let pri = 0; for (let j = 0; j < d; j++) pri += 0.5 * ((th[j] - Math.log(1.5)) / 1.5) ** 2;
      return 0.5 * q + ld + pri + 0.5 * ((th[d + 1] - Math.log(0.05)) / 2) ** 2;
    };
    const th = nelder(nlml, new Array(d).fill(Math.log(1.5)).concat([0, Math.log(0.05)]), Math.min(500, 40 * (d + 2)));
    hp = build(th); chol(); al.set(csolve(t));
    return x => { const q = z(x); let s = 0; for (let i = 0; i < n; i++) { let e = 0; for (let k = 0; k < d; k++) e += (Z[i][k] - q[k]) ** 2 * hp.il[k]; s += hp.sf2 * Math.exp(-0.5 * e) * al[i]; } return s * sy + my; };
  }
  const MODELS = {
    linear: { name: 'Linear regression', fit(X, y) {
      const z = standardiser(X), Z = X.map(z), p = X[0].length;
      const b = lstsq([Z.map(() => 1)].concat(Array.from({ length: p }, (_, j) => Z.map(r => r[j]))), y, 1e-6 * X.length) || [mean(y)].concat(new Array(p).fill(0));
      return x => { const q = z(x); let s = b[0]; for (let j = 0; j < p; j++) s += b[j + 1] * q[j]; return s; };
    } },
    ridge: { name: 'Ridge regression', fit(X, y) {
      const z = standardiser(X), Z = X.map(z), p = X[0].length, n = X.length;
      const cols = [Z.map(() => 1)].concat(Array.from({ length: p }, (_, j) => Z.map(r => r[j])));
      /* choose the penalty by leave-one-out error, computed exactly from the hat matrix */
      let best = null;
      for (const lam of [1e-3, 1e-2, 0.1, 0.3, 1, 3, 10, 30, 100].map(v => v * Math.max(1, n / 10))) {
        const b = lstsq(cols, y, lam); if (!b) continue;
        const G = Array.from({ length: p + 1 }, (_, i) => Array.from({ length: p + 1 }, (_, j) => sum(cols[i].map((v, k) => v * cols[j][k])) + (i === j && i > 0 ? lam : 0)));
        let err = 0;
        for (let k = 0; k < n; k++) {
          const row = cols.map(c => c[k]), w = solve(G, row); if (!w) { err = Infinity; break; }
          const h = sum(row.map((v, i) => v * w[i])), yh = sum(row.map((v, i) => v * b[i]));
          err += ((y[k] - yh) / Math.max(1e-6, 1 - h)) ** 2;
        }
        if (!best || err < best.err) best = { err, b, lam };
      }
      const b = best.b;
      return x => { const q = z(x); let s = b[0]; for (let j = 0; j < p; j++) s += b[j + 1] * q[j]; return s; };
    } },
    knn: { name: 'k-nearest neighbours', fit(X, y) {
      const z = standardiser(X), Z = X.map(z), n = X.length;
      const dist = (a, b) => Math.sqrt(sum(a.map((v, j) => (v - b[j]) ** 2)));
      const predK = (q, k, skip) => {
        const d = Z.map((r, i) => [i === skip ? Infinity : dist(r, q), i]).sort((a, b) => a[0] - b[0]).slice(0, k);
        let ws = 0, s = 0; for (const [dd, i] of d) { const w = 1 / (dd + 1e-9); ws += w; s += w * y[i]; } return s / ws;
      };
      const nb = Z.map((r, i) => Z.map((q, j) => [i === j ? Infinity : dist(r, q), j]).sort((a, b) => a[0] - b[0]).slice(0, 15));
      let bk = 3, be = Infinity;
      for (let k = 1; k <= Math.min(15, n - 1); k++) {
        let e = 0;
        for (let i = 0; i < n; i++) { let ws = 0, s2 = 0; for (const [dd, j] of nb[i].slice(0, k)) { const w = 1 / (dd + 1e-9); ws += w; s2 += w * y[j]; } e += (y[i] - s2 / ws) ** 2; }
        if (e < be) { be = e; bk = k; }
      }
      return x => predK(z(x), bk, -1);
    } },
    forest: { name: 'Random forest', fit(X, y, seed) {
      const r = rng(seed || 7), n = X.length, p = X[0].length, trees = [];
      const o = { minLeaf: 2, maxDepth: 12, mtry: Math.max(1, Math.round(p / 3)) };
      for (let t = 0; t < 150; t++) { const ids = Array.from({ length: n }, () => Math.floor(r() * n)); trees.push(tree(X, y, ids, o, r, 0)); }
      const f = x => mean(trees.map(tr => predTree(tr, x)));
      f.spread = x => sd(trees.map(tr => predTree(tr, x)));
      return f;
    } },
    boost: { name: 'Gradient boosting', fit(X, y, seed) {
      const r = rng(seed || 11), n = X.length, p = X[0].length, y0 = mean(y), lr = 0.08, trees = [];
      const o = { minLeaf: 2, maxDepth: 3, mtry: p };
      const F = new Array(n).fill(y0);
      for (let t = 0; t < 160; t++) {
        const res = y.map((v, i) => v - F[i]);
        const ids = shuffle(Array.from({ length: n }, (_, i) => i), r).slice(0, Math.max(4, Math.round(0.8 * n)));
        const tr = tree(X, res, ids, o, r, 0); trees.push(tr);
        for (let i = 0; i < n; i++) F[i] += lr * predTree(tr, X[i]);
      }
      return x => { let s = y0; for (const tr of trees) s += lr * predTree(tr, x); return s; };
    } },
    gp: { name: 'Gaussian process', maxN: 220, fit(X, y) { return leanGP(X, y); } }
  };
  L.modelNames = Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, v.name]));

  /* X: rows of numbers; y: numbers; Xnew: rows to predict. */
  L.automl = function (X0, y, names0, opts) {
    const o = Object.assign({ models: Object.keys(MODELS), level: 0.9, seed: 1 }, opts);
    if (X0.length < 8) return { error: 'AutoML needs at least 8 complete samples.' };
    /* drop inputs that are constant, nearly constant or exact duplicates: they carry no
       information and make linear models extrapolate wildly */
    const keep = [], dropped = [];
    (X0[0] || []).forEach((_, j) => {
      const c = X0.map(r => r[j]), s = sd(c), m = Math.abs(mean(c));
      if (!(s > 1e-4 * (m + 1e-12))) { dropped.push(names0[j]); return; }
      const dup = keep.find(k => { const d = X0.map(r => r[k]); const md = mean(d), mc = mean(c); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < c.length; i++) { sxy += (c[i] - mc) * (d[i] - md); sxx += (c[i] - mc) ** 2; syy += (d[i] - md) ** 2; } return Math.abs(sxy / Math.sqrt(sxx * syy)) > 0.99999; });
      if (dup != null) { dropped.push(names0[j]); return; }
      keep.push(j);
    });
    const X = X0.map(r => keep.map(j => r[j])), names = keep.map(j => names0[j]);
    const n = X.length, p = keep.length;
    if (!p) return { error: 'None of the inputs varies across the samples.' };
    const r = rng(o.seed);
    const order = shuffle(Array.from({ length: n }, (_, i) => i), r);
    const K = n <= 20 ? n : Math.min(5, n);
    const fold = new Array(n); order.forEach((i, k) => { fold[i] = k % K; });
    const t0all = Date.now();
    const board = [];
    for (const key of o.models) {
      const md = MODELS[key];
      if (!md || (md.maxN && n > md.maxN)) continue;
      const t0 = Date.now(), oof = new Array(n), fits = [];
      try {
        for (let k = 0; k < K; k++) {
          const tr = [], te = [];
          for (let i = 0; i < n; i++) (fold[i] === k ? te : tr).push(i);
          const f = md.fit(tr.map(i => X[i]), tr.map(i => y[i]), o.seed + k);
          fits.push({ f, te });
          for (const i of te) oof[i] = f(X[i]);
        }
      } catch (e) { continue; }
      if (!oof.every(isFinite)) continue;
      const res = y.map((v, i) => v - oof[i]);
      const ym = mean(y), sst = sum(y.map(v => (v - ym) ** 2));
      board.push({ key, name: md.name, oof, fits, res, r2: 1 - sum(res.map(v => v * v)) / sst, mae: mean(res.map(Math.abs)), rmse: Math.sqrt(mean(res.map(v => v * v))), ms: Date.now() - t0 });
    }
    if (!board.length) return { error: 'No model could be trained on these data.' };
    board.sort((a, b) => a.rmse - b.rmse);
    const best = board[0];
    /* permutation importance on held-out folds of the best model */
    const base = best.rmse, imp = [];
    for (let j = 0; j < p; j++) {
      let acc = 0;
      for (let rep = 0; rep < 3; rep++) {
        const rr = rng(o.seed * 31 + j * 7 + rep);
        let se = 0;
        for (const { f, te } of best.fits) {
          const col = shuffle(te.map(i => X[i][j]), rr);
          te.forEach((i, k) => { const x = X[i].slice(); x[j] = col[k]; se += (y[i] - f(x)) ** 2; });
        }
        acc += Math.sqrt(se / n) - base;
      }
      imp.push({ name: names[j], j, v: acc / 3 });
    }
    imp.sort((a, b) => b.v - a.v);
    /* final model on all data; partial dependence for the two most important inputs */
    const final = MODELS[best.key].fit(X, y, o.seed);
    const pdp = imp.slice(0, 2).filter(q => q.v > 0).map(q => {
      const c = X.map(rw => rw[q.j]), lo = Math.min(...c), hi = Math.max(...c);
      const grid = Array.from({ length: 24 }, (_, k) => lo + (hi - lo) * k / 23);
      const rows = n > 120 ? X.filter((_, i) => i % Math.ceil(n / 120) === 0) : X;
      return { name: q.name, pts: grid.map(g => [g, mean(rows.map(rw => { const x = rw.slice(); x[q.j] = g; return final(x); }))]) };
    });
    /* split-conformal half-width from held-out residuals: covers new samples at the stated level */
    const absr = best.res.map(Math.abs).sort((a, b) => a - b);
    const kq = Math.min(n - 1, Math.ceil((n + 1) * o.level) - 1);
    const q = absr[kq];
    const ranges = Array.from({ length: p }, (_, j) => { const c = X.map(rw => rw[j]); return [Math.min(...c), Math.max(...c)]; });
    const predict = x0 => { const x = keep.map(j => x0[j]), v = final(x); return { y: v, lo: v - q, hi: v + q, extrapolating: x.some((u, j) => u < ranges[j][0] || u > ranges[j][1]) }; };
    return { board, best, importance: imp, pdp, q, level: o.level, predict, n, p, folds: K, names, dropped, ms: Date.now() - t0all };
  };
})(typeof window !== 'undefined' ? window : globalThis);
