/* Statistics, multivariate / machine-learning and spectroscopy / materials analyses. */
(function (root) {
  'use strict';
  const S = root.BF.stats;
  const A = {};
  const sum = a => a.reduce((s, v) => s + v, 0);
  const sq = v => v * v;

  /* ================= column statistics ================= */
  A.describe = function (v) {
    const n = v.length;
    if (!n) return null;
    const m = S.mean(v), sd = S.sd(v);
    const s = v.slice().sort((a, b) => a - b);
    const t = n > 1 ? S.tinv(0.975, n - 1) : NaN;
    const pos = v.every(x => x > 0);
    return {
      n, mean: m, sd, sem: sd / Math.sqrt(n), ci: [m - t * sd / Math.sqrt(n), m + t * sd / Math.sqrt(n)],
      median: S.quantile(s, 0.5), q1: S.quantile(s, 0.25), q3: S.quantile(s, 0.75), min: s[0], max: s[n - 1],
      cv: 100 * sd / Math.abs(m), geomean: pos ? S.geomean(v) : NaN, sum: sum(v)
    };
  };

  /* D'Agostino–Pearson omnibus K² normality test (as scipy.stats.normaltest). */
  A.normality = function (v) {
    const n = v.length;
    if (n < 8) return { n, error: 'Needs at least 8 values.' };
    const m = S.mean(v);
    const m2 = sum(v.map(x => sq(x - m))) / n, m3 = sum(v.map(x => (x - m) ** 3)) / n, m4 = sum(v.map(x => (x - m) ** 4)) / n;
    const b2 = m3 / Math.pow(m2, 1.5), k = m4 / (m2 * m2);
    const y = b2 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
    const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
    const delta = 1 / Math.sqrt(0.5 * Math.log(W2));
    const alpha = Math.sqrt(2 / (W2 - 1));
    const yy = y === 0 ? 1 : y;
    const Zs = delta * Math.log(yy / alpha + Math.sqrt(sq(yy / alpha) + 1));
    const E = 3 * (n - 1) / (n + 1);
    const varb2 = 24 * n * (n - 2) * (n - 3) / ((n + 1) * (n + 1) * (n + 3) * (n + 5));
    const x = (k - E) / Math.sqrt(varb2);
    const sqrtbeta1 = 6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9)) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
    const Aa = 6 + 8 / sqrtbeta1 * (2 / sqrtbeta1 + Math.sqrt(1 + 4 / (sqrtbeta1 * sqrtbeta1)));
    const term1 = 1 - 2 / (9 * Aa);
    const denom = 1 + x * Math.sqrt(2 / (Aa - 4));
    const term2 = Math.sign(denom) * Math.pow((1 - 2 / Aa) / Math.abs(denom), 1 / 3);
    const Zk = (term1 - term2) / Math.sqrt(2 / (9 * Aa));
    const K2 = Zs * Zs + Zk * Zk;
    return { n, K2, p: S.chi2sf(K2, 2), skew: b2, kurt: k - 3 };
  };

  A.ttest = function (a, b, opts) {
    opts = opts || {};
    if (opts.paired) {
      if (a.length !== b.length) return { error: 'Paired test needs the same number of values in both columns.' };
      const d = a.map((x, i) => x - b[i]);
      const n = d.length; if (n < 2) return { error: 'Too few pairs.' };
      const m = S.mean(d), se = S.sd(d) / Math.sqrt(n), df = n - 1, t = m / se;
      const q = S.tinv(0.975, df);
      return { kind: 'paired', t, df, p: 2 * (1 - S.tcdf(Math.abs(t), df)), diff: m, lo: m - q * se, hi: m + q * se, dz: m / S.sd(d) };
    }
    if (a.length < 2 || b.length < 2) return { error: 'Each group needs at least two values.' };
    if (opts.welch === false) {
      const na = a.length, nb = b.length, df = na + nb - 2;
      const sp2 = ((na - 1) * sq(S.sd(a)) + (nb - 1) * sq(S.sd(b))) / df;
      const se = Math.sqrt(sp2 * (1 / na + 1 / nb)), diff = S.mean(a) - S.mean(b), t = diff / se, q = S.tinv(0.975, df);
      return { kind: 'student', t, df, p: 2 * (1 - S.tcdf(Math.abs(t), df)), diff, lo: diff - q * se, hi: diff + q * se, d: diff / Math.sqrt(sp2) };
    }
    const w = S.welch(a, b);
    const sp = Math.sqrt((sq(S.sd(a)) + sq(S.sd(b))) / 2);
    return Object.assign({ kind: 'welch', d: w.diff / sp }, w);
  };

  /* Mann–Whitney U: exact for small samples without ties, otherwise normal
     approximation with tie and continuity corrections (as SciPy). */
  A.mannWhitney = function (a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 1 || n2 < 1) return { error: 'Both groups need values.' };
    const all = a.concat(b), r = S.rank(all);
    const R1 = sum(r.slice(0, n1));
    const U1 = R1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1;
    const ties = all.length !== new Set(all).size;
    const U = Math.max(U1, U2);
    let p;
    if (!ties && n1 <= 8 && n2 <= 8) {
      /* exact null distribution by dynamic programming */
      const N = n1 * n2;
      let f = Array.from({ length: n1 + 1 }, () => Array.from({ length: n2 + 1 }, () => null));
      const cnt = (i, j) => {
        if (f[i][j]) return f[i][j];
        let out;
        if (i === 0 || j === 0) { out = new Array(N + 1).fill(0); out[0] = 1; }
        else {
          const x = cnt(i - 1, j), y = cnt(i, j - 1);
          out = new Array(N + 1).fill(0);
          for (let u = 0; u <= N; u++) out[u] = (u - j >= 0 ? x[u - j] : 0) + y[u];
        }
        return (f[i][j] = out);
      };
      const dist = cnt(n1, n2);
      const tot = sum(dist);
      let tail = 0; for (let u = Math.round(U); u <= N; u++) tail += dist[u];
      p = Math.min(1, 2 * tail / tot);
    } else {
      const n = n1 + n2;
      const tc = (() => { const m = new Map(); all.forEach(v => m.set(v, (m.get(v) || 0) + 1)); let s = 0; m.forEach(t => { s += t ** 3 - t; }); return s; })();
      const mu = n1 * n2 / 2;
      const sigma = Math.sqrt(n1 * n2 / 12 * ((n + 1) - tc / (n * (n - 1))));
      const z = (U - mu - 0.5) / sigma;
      p = Math.min(1, 2 * (1 - S.ncdf(z)));
    }
    return { U: U1, U2, p, medA: S.quantile(a, 0.5), medB: S.quantile(b, 0.5), exact: !ties && n1 <= 8 && n2 <= 8 };
  };

  /* One-way ANOVA with Tukey–Kramer, Holm–Šidák and Dunnett-style (Holm vs control) post tests,
     plus Welch's ANOVA and Kruskal–Wallis. groups: [{name, v:[...]}] */
  A.anova = function (groups, opts) {
    opts = opts || {};
    const g = groups.filter(x => x.v.length);
    const k = g.length;
    if (k < 2) return { error: 'Needs at least two groups.' };
    if (g.some(x => x.v.length < 2)) return { error: 'Every group needs at least two values.' };
    const all = [].concat(...g.map(x => x.v)), N = all.length, gm = S.mean(all);
    const ssb = sum(g.map(x => x.v.length * sq(S.mean(x.v) - gm)));
    const ssw = sum(g.map(x => sum(x.v.map(v => sq(v - S.mean(x.v))))));
    const dfb = k - 1, dfw = N - k, msb = ssb / dfb, msw = ssw / dfw, F = msb / msw;
    const p = S.fsf(F, dfb, dfw);
    const eta2 = ssb / (ssb + ssw);
    /* Welch ANOVA */
    const w = g.map(x => x.v.length / sq(S.sd(x.v)));
    const sw = sum(w), mw = sum(g.map((x, i) => w[i] * S.mean(x.v))) / sw;
    const tmp = sum(g.map((x, i) => sq(1 - w[i] / sw) / (x.v.length - 1)));
    const Fw = (sum(g.map((x, i) => w[i] * sq(S.mean(x.v) - mw))) / (k - 1)) / (1 + 2 * (k - 2) / (k * k - 1) * tmp);
    const df2w = (k * k - 1) / (3 * tmp);
    const welch = { F: Fw, df1: k - 1, df2: df2w, p: S.fsf(Fw, k - 1, df2w) };
    /* Bartlett-free spread check: Brown–Forsythe (Levene on medians) */
    const z = g.map(x => { const md = S.quantile(x.v, 0.5); return x.v.map(v => Math.abs(v - md)); });
    const zall = [].concat(...z), zm = S.mean(zall);
    const bfB = sum(z.map(zz => zz.length * sq(S.mean(zz) - zm))) / (k - 1);
    const bfW = sum(z.map(zz => sum(zz.map(v => sq(v - S.mean(zz)))))) / (N - k);
    const bf = { F: bfB / bfW, p: S.fsf(bfB / bfW, k - 1, N - k) };
    /* Kruskal–Wallis */
    const r = S.rank(all);
    let off = 0; const H0 = g.map(x => { const rs = r.slice(off, off + x.v.length); off += x.v.length; return sq(sum(rs)) / x.v.length; });
    let H = 12 / (N * (N + 1)) * sum(H0) - 3 * (N + 1);
    const tcounts = new Map(); all.forEach(v => tcounts.set(v, (tcounts.get(v) || 0) + 1));
    let tsum = 0; tcounts.forEach(t => { tsum += t ** 3 - t; });
    H /= 1 - tsum / (N ** 3 - N);
    const kw = { H, df: k - 1, p: S.chi2sf(H, k - 1) };
    /* post tests */
    const pairs = [];
    const ctrl = opts.control != null ? opts.control : null;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      if (ctrl != null && i !== ctrl && j !== ctrl) continue;
      const a = g[i], b = g[j];
      const diff = S.mean(a.v) - S.mean(b.v);
      const se = Math.sqrt(msw * (1 / a.v.length + 1 / b.v.length));
      const t = diff / se;
      const q = Math.abs(diff) / Math.sqrt(msw / 2 * (1 / a.v.length + 1 / b.v.length));
      pairs.push({ a: a.name, b: b.name, i, j, diff, se, t, q, pRaw: 2 * (1 - S.tcdf(Math.abs(t), dfw)), pTukey: S.ptukeySF(q, k, dfw) });
    }
    /* Tukey confidence interval via the critical q (bisection on ptukeySF) */
    let qcrit = 3;
    { let lo = 0.5, hi = 10; for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (S.ptukeySF(m, k, dfw) > 0.05) lo = m; else hi = m; } qcrit = 0.5 * (lo + hi); }
    pairs.forEach(pr => { const h = qcrit * pr.se / Math.SQRT2; pr.lo = pr.diff - h; pr.hi = pr.diff + h; });
    /* Holm–Šidák step-down */
    const ord = pairs.slice().sort((x, y) => x.pRaw - y.pRaw);
    let run = 0;
    ord.forEach((pr, idx) => { run = Math.max(run, 1 - Math.pow(1 - pr.pRaw, ord.length - idx)); pr.pHolm = Math.min(1, run); });
    return { k, N, ssb, ssw, dfb, dfw, msb, msw, F, p, eta2, welch, bf, kw, pairs, qcrit, groups: g.map(x => ({ name: x.name, ...A.describe(x.v) })) };
  };

  /* Grubbs outlier test (two-sided), one iteration. */
  A.grubbs = function (v, alpha) {
    alpha = alpha || 0.05;
    const n = v.length; if (n < 3) return null;
    const m = S.mean(v), sd = S.sd(v);
    let idx = 0; v.forEach((x, i) => { if (Math.abs(x - m) > Math.abs(v[idx] - m)) idx = i; });
    const G = Math.abs(v[idx] - m) / sd;
    const t = S.tinv(1 - alpha / (2 * n), n - 2);
    const Gc = (n - 1) / Math.sqrt(n) * Math.sqrt(t * t / (n - 2 + t * t));
    const tg = Math.sqrt(n * (n - 2) * G * G / Math.max((n - 1) ** 2 - n * G * G, 1e-300));
    const p = Math.min(1, 2 * n * (1 - S.tcdf(tg, n - 2)));
    return { G, Gcrit: Gc, value: v[idx], index: idx, outlier: G > Gc, p };
  };

  /* ================= correlation and regression ================= */
  A.pearson = function (x, y) {
    const n = x.length, mx = S.mean(x), my = S.mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += sq(x[i] - mx); syy += sq(y[i] - my); }
    const r = sxy / Math.sqrt(sxx * syy);
    const df = n - 2, t = r * Math.sqrt(df / Math.max(1 - r * r, 1e-300));
    const z = 0.5 * Math.log((1 + r) / (1 - r)), se = 1 / Math.sqrt(n - 3), q = S.ninv(0.975);
    return { r, n, p: 2 * (1 - S.tcdf(Math.abs(t), df)), lo: Math.tanh(z - q * se), hi: Math.tanh(z + q * se) };
  };
  A.spearman = function (x, y) { const r = A.pearson(S.rank(x), S.rank(y)); return { rho: r.r, p: r.p, n: r.n }; };

  /* Ordinary least squares with intercept. X: rows of predictors. */
  A.ols = function (X, y, names) {
    const n = y.length, k = X[0].length + 1;
    if (n <= k) return { error: 'More observations than predictors are needed.' };
    const D = X.map(r => [1].concat(r));
    const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => sum(D.map(r => r[i] * r[j]))));
    const Xty = Array.from({ length: k }, (_, i) => sum(D.map((r, t) => r[i] * y[t])));
    const inv = S.inv(XtX);
    if (!inv) return { error: 'Predictors are collinear; remove a redundant variable.' };
    const b = inv.map(r => sum(r.map((v, j) => v * Xty[j])));
    const fit = D.map(r => sum(r.map((v, j) => v * b[j])));
    const res = y.map((v, i) => v - fit[i]);
    const sse = sum(res.map(sq)), my = S.mean(y), sst = sum(y.map(v => sq(v - my)));
    const df = n - k, s2 = sse / df, q = S.tinv(0.975, df);
    const coefs = b.map((v, j) => {
      const se = Math.sqrt(s2 * inv[j][j]), t = v / se;
      return { name: j ? names[j - 1] : 'Intercept', b: v, se, t, p: 2 * (1 - S.tcdf(Math.abs(t), df)), lo: v - q * se, hi: v + q * se };
    });
    const sdy = S.sd(y);
    coefs.slice(1).forEach((c, j) => { c.beta = c.b * S.sd(X.map(r => r[j])) / sdy; });
    const r2 = 1 - sse / sst, adj = 1 - (1 - r2) * (n - 1) / df;
    const Fv = ((sst - sse) / (k - 1)) / s2;
    return { coefs, r2, adj, F: Fv, pF: S.fsf(Fv, k - 1, df), df, s: Math.sqrt(s2), fit, res, n };
  };

  /* ================= PCA (correlation matrix, Jacobi eigen-decomposition) ================= */
  function jacobi(Ain) {
    const n = Ain.length, A2 = Ain.map(r => r.slice());
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += sq(A2[i][j]);
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A2[p][q]) < 1e-300) continue;
        const th = 0.5 * Math.atan2(2 * A2[p][q], A2[q][q] - A2[p][p]);
        const c = Math.cos(th), s = Math.sin(th);
        for (let k = 0; k < n; k++) {
          const akp = A2[k][p], akq = A2[k][q];
          A2[k][p] = c * akp - s * akq; A2[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A2[p][k], aqk = A2[q][k];
          A2[p][k] = c * apk - s * aqk; A2[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    const vals = A2.map((r, i) => r[i]);
    const order = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    return { values: order.map(i => vals[i]), vectors: order.map(i => V.map(r => r[i])) };
  }
  A.eigen = jacobi;
  A.pca = function (X, names) {
    const n = X.length, p = X[0].length;
    if (n < 3) return { error: 'Needs at least three observations.' };
    const mu = Array.from({ length: p }, (_, j) => S.mean(X.map(r => r[j])));
    const sd = Array.from({ length: p }, (_, j) => S.sd(X.map(r => r[j])) || 1);
    const Z = X.map(r => r.map((v, j) => (v - mu[j]) / sd[j]));
    const C = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(Z.map(r => r[i] * r[j])) / (n - 1)));
    const e = jacobi(C);
    e.vectors.forEach(v => { let m = 0; v.forEach((x, i) => { if (Math.abs(x) > Math.abs(v[m])) m = i; }); if (v[m] < 0) v.forEach((x, i) => { v[i] = -x; }); });
    const tot = sum(e.values);
    const scores = Z.map(r => e.vectors.map(v => sum(v.map((x, j) => x * r[j]))));
    const loadings = e.vectors.map((v, k) => v.map(x => x * Math.sqrt(Math.max(e.values[k], 0))));
    return { values: e.values, explained: e.values.map(v => v / tot), vectors: e.vectors, loadings, scores, names, kaiser: e.values.filter(v => v > 1).length };
  };

  /* ================= k-means with k-means++ and silhouette ================= */
  A.kmeans = function (X, k, seed) {
    const rng = S.rng(seed || 1), n = X.length, p = X[0].length;
    const mu = Array.from({ length: p }, (_, j) => S.mean(X.map(r => r[j])));
    const sd = Array.from({ length: p }, (_, j) => S.sd(X.map(r => r[j])) || 1);
    const Z = X.map(r => r.map((v, j) => (v - mu[j]) / sd[j]));
    const d2 = (a, b) => sum(a.map((v, i) => sq(v - b[i])));
    let best = null;
    for (let rep = 0; rep < 12; rep++) {
      const C = [Z[Math.floor(rng() * n)].slice()];
      while (C.length < k) {
        const ds = Z.map(z => Math.min(...C.map(c => d2(z, c))));
        let t = rng() * sum(ds), i = 0;
        while (i < n - 1 && t > ds[i]) { t -= ds[i]; i++; }
        C.push(Z[i].slice());
      }
      let lab = new Array(n).fill(0);
      for (let it = 0; it < 200; it++) {
        const nl = Z.map(z => { let b = 0; C.forEach((c, j) => { if (d2(z, c) < d2(z, C[b])) b = j; }); return b; });
        const same = nl.every((v, i) => v === lab[i]) && it > 0;
        lab = nl;
        for (let j = 0; j < k; j++) { const m = Z.filter((_, i) => lab[i] === j); if (m.length) C[j] = Array.from({ length: p }, (_, q) => S.mean(m.map(r => r[q]))); }
        if (same) break;
      }
      const inertia = sum(Z.map((z, i) => d2(z, C[lab[i]])));
      if (!best || inertia < best.inertia) best = { lab, C, inertia };
    }
    /* silhouette */
    const dist = (a, b) => Math.sqrt(d2(a, b));
    const sil = Z.map((z, i) => {
      const own = Z.filter((_, j) => j !== i && best.lab[j] === best.lab[i]);
      if (!own.length) return 0;
      const a = S.mean(own.map(o => dist(z, o)));
      let b = Infinity;
      for (let c = 0; c < k; c++) { if (c === best.lab[i]) continue; const o = Z.filter((_, j) => best.lab[j] === c); if (o.length) b = Math.min(b, S.mean(o.map(q => dist(z, q)))); }
      return (b - a) / Math.max(a, b);
    });
    const centres = best.C.map(c => c.map((v, j) => v * sd[j] + mu[j]));
    return { labels: best.lab, centres, inertia: best.inertia, silhouette: S.mean(sil), sizes: Array.from({ length: k }, (_, c) => best.lab.filter(l => l === c).length) };
  };

  /* ================= Gaussian process regression and Bayesian optimisation ================= */
  function chol(K) {
    const n = K.length, L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = K[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  function cholSolve(L, b) {
    const n = L.length, y = new Float64Array(n), x = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  function nelderMead(f, x0, iters) {
    const n = x0.length;
    let P = [x0.slice()].concat(x0.map((_, i) => { const v = x0.slice(); v[i] += 0.6; return v; }));
    let F = P.map(f);
    for (let it = 0; it < (iters || 300); it++) {
      const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]);
      P = o.map(i => P[i]); F = o.map(i => F[i]);
      if (Math.abs(F[n] - F[0]) < 1e-9) break;
      const c = Array.from({ length: n }, (_, j) => S.mean(P.slice(0, n).map(p => p[j])));
      const xr = c.map((v, j) => v + (v - P[n][j])), fr = f(xr);
      if (fr < F[0]) { const xe = c.map((v, j) => v + 2 * (v - P[n][j])), fe = f(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
      else {
        const xc = c.map((v, j) => v + 0.5 * (P[n][j] - v)), fc = f(xc);
        if (fc < F[n]) { P[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); F[i] = f(P[i]); }
      }
    }
    return P[0];
  }
  /* X: rows (raw units), y: targets. Inputs scaled to [0,1] by bounds; output standardised. */
  A.gp = function (X, y, bounds) {
    const n = X.length, d = X[0].length;
    const lo = bounds ? bounds.map(b => b[0]) : Array.from({ length: d }, (_, j) => Math.min(...X.map(r => r[j])));
    const hi = bounds ? bounds.map(b => b[1]) : Array.from({ length: d }, (_, j) => Math.max(...X.map(r => r[j])));
    const sc = r => r.map((v, j) => (v - lo[j]) / ((hi[j] - lo[j]) || 1));
    const Z = X.map(sc);
    const my = S.mean(y), sy = S.sd(y) || 1;
    const t = y.map(v => (v - my) / sy);
    const kern = (a, b, ell, sf2) => { let s = 0; for (let j = 0; j < d; j++) s += sq((a[j] - b[j]) / ell[j]); return sf2 * Math.exp(-0.5 * s); };
    const build = th => {
      const ell = th.slice(0, d).map(Math.exp), sf2 = Math.exp(th[d]), sn2 = Math.exp(th[d + 1]) + 1e-8;
      const K = Z.map((a, i) => Z.map((b, j) => kern(a, b, ell, sf2) + (i === j ? sn2 : 0)));
      return { ell, sf2, sn2, K };
    };
    const nlml = th => {
      if (th.some(v => !isFinite(v) || Math.abs(v) > 12)) return 1e10;
      const { K } = build(th);
      const L = chol(K); if (!L) return 1e10;
      const al = cholSolve(L, t);
      let ld = 0; for (let i = 0; i < n; i++) ld += Math.log(L[i][i]);
      /* weak log-normal priors keep length-scales sensible with few points */
      let pri = 0; for (let j = 0; j < d; j++) pri += 0.5 * sq((th[j] - Math.log(0.5)) / 1.5);
      pri += 0.5 * sq((th[d + 1] - Math.log(0.05)) / 2);
      return 0.5 * sum(t.map((v, i) => v * al[i])) + ld + pri;
    };
    let best = null;
    for (const s of [[0.3, 1, 0.02], [0.8, 1, 0.05], [0.15, 1, 0.01], [1.5, 1, 0.2]]) {
      const th0 = Array.from({ length: d }, () => Math.log(s[0])).concat([Math.log(s[1]), Math.log(s[2])]);
      const th = nelderMead(nlml, th0, 400 + 60 * d);
      const v = nlml(th);
      if (!best || v < best.v) best = { th, v };
    }
    const hp = build(best.th);
    const L = chol(hp.K);
    const al = cholSolve(L, t);
    /* LOO predictions (Rasmussen & Williams eq. 5.12) */
    const Kinv = Array.from({ length: n }, (_, i) => { const e = new Float64Array(n); e[i] = 1; return cholSolve(L, e); });
    const loo = t.map((v, i) => (v - al[i] / Kinv[i][i]) * sy + my);
    const looSd = t.map((v, i) => Math.sqrt(1 / Kinv[i][i]) * sy);
    const ssr = sum(y.map((v, i) => sq(v - loo[i]))), sst = sum(y.map(v => sq(v - my)));
    const predict = x => {
      const z = sc(x);
      const ks = Z.map(a => kern(a, z, hp.ell, hp.sf2));
      const mu = sum(ks.map((v, i) => v * al[i]));
      const vv = cholSolve(L, ks);
      const v = Math.max(hp.sf2 - sum(ks.map((k, i) => k * vv[i])), 1e-12);
      return { mean: mu * sy + my, sd: Math.sqrt(v) * sy, sdNoisy: Math.sqrt(v + hp.sn2) * sy };
    };
    const rel = hp.ell.map(l => 1 / l), rs = sum(rel);
    return { predict, ell: hp.ell, sf2: hp.sf2, sn2: hp.sn2, loo, looSd, q2: 1 - ssr / sst, relevance: rel.map(v => v / rs), lo, hi, my, sy, n, d };
  };

  /* Expected improvement; goal 'max' or 'min'. Returns a batch of suggestions by the kriging believer. */
  A.suggest = function (X, y, opts) {
    opts = Object.assign({ goal: 'max', batch: 5, pool: 3000, seed: 7 }, opts);
    const d = X[0].length;
    const bounds = opts.bounds || Array.from({ length: d }, (_, j) => { const v = X.map(r => r[j]); const a = Math.min(...v), b = Math.max(...v); return [a, b]; });
    const rng = S.rng(opts.seed);
    const pool = [];
    for (let i = 0; i < opts.pool; i++) pool.push(bounds.map(b => b[0] + rng() * (b[1] - b[0])));
    if (opts.sumTo) pool.forEach(r => { const idx = opts.sumTo.cols; const s = sum(idx.map(j => r[j])); idx.forEach(j => { r[j] *= opts.sumTo.total / s; }); });
    const sign = opts.goal === 'min' ? -1 : 1;
    let Xc = X.map(r => r.slice()), yc = y.slice();
    const picks = [];
    let gp = A.gp(Xc, yc, bounds);
    const first = gp;
    for (let b = 0; b < opts.batch; b++) {
      const best = Math.max(...yc.map(v => sign * v));
      let top = null;
      for (const x of pool) {
        const pr = gp.predict(x);
        const m = sign * pr.mean, s = pr.sd;
        const z = (m - best - 0.01 * gp.sy) / s;
        const ei = s > 1e-12 ? (m - best - 0.01 * gp.sy) * S.ncdf(z) + s * S.npdf(z) : 0;
        if (!top || ei > top.ei) top = { x, ei, mean: pr.mean, sd: pr.sd };
      }
      picks.push(top);
      Xc.push(top.x); yc.push(top.mean);
      /* keep the batch diverse: drop candidates close to the one just chosen */
      const span = bounds.map(b => (b[1] - b[0]) || 1);
      for (let i = pool.length - 1; i >= 0; i--) {
        let d2 = 0; pool[i].forEach((v, j) => { d2 += ((v - top.x[j]) / span[j]) ** 2; });
        if (d2 < 0.01 * d) pool.splice(i, 1);
      }
      if (b < opts.batch - 1) gp = A.gp(Xc, yc, bounds);
    }
    return { gp: first, picks, bounds };
  };

  /* ================= spectra, peaks and materials characterisation ================= */
  /* Savitzky–Golay coefficients for smoothing (deriv 0) or first derivative. */
  A.sgCoeffs = function (half, order, deriv) {
    const m = 2 * half + 1, k = order + 1;
    const J = Array.from({ length: m }, (_, i) => Array.from({ length: k }, (_, j) => Math.pow(i - half, j)));
    const JtJ = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => sum(J.map(r => r[a] * r[b]))));
    const inv = S.inv(JtJ);
    const row = inv[deriv || 0];
    const fact = deriv ? 1 : 1;
    return Array.from({ length: m }, (_, i) => fact * sum(row.map((v, j) => v * J[i][j])));
  };
  A.smooth = function (y, half, order, deriv, dx) {
    const n = y.length;
    half = Math.min(half, Math.floor((n - 1) / 2));
    if (half < 1) return y.slice();
    const c = A.sgCoeffs(half, Math.min(order, 2 * half), deriv || 0);
    return y.map((_, i) => {
      let s = 0;
      for (let k = -half; k <= half; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); s += c[k + half] * y[j]; }
      return deriv ? s / (dx || 1) : s;
    });
  };
  /* Iterative polynomial baseline (modified polyfit). */
  A.baseline = function (x, y, degree, iters) {
    degree = degree == null ? 2 : degree;
    const x0 = S.mean(x), xs = Math.max(...x.map(v => Math.abs(v - x0))) || 1;
    const u = x.map(v => (v - x0) / xs);
    let z = y.slice(), fit = y.slice();
    for (let it = 0; it < (iters || 80); it++) {
      const k = degree + 1;
      const M = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => sum(u.map(v => Math.pow(v, a + b)))));
      const r = Array.from({ length: k }, (_, a) => sum(u.map((v, i) => Math.pow(v, a) * z[i])));
      const c = S.inv(M).map(row => sum(row.map((v, j) => v * r[j])));
      fit = u.map(v => sum(c.map((cc, j) => cc * Math.pow(v, j))));
      z = z.map((v, i) => Math.min(v, fit[i]));
    }
    return fit;
  };
  /* Peak detection on a baseline-corrected, smoothed signal. */
  A.findPeaks = function (x, y, opts) {
    opts = Object.assign({ prominence: 0.05, smooth: 3 }, opts);
    const ys = A.smooth(y, opts.smooth, 2, 0);
    const ymax = Math.max(...ys), ymin = Math.min(...ys), thr = opts.prominence * (ymax - ymin);
    const out = [];
    for (let i = 1; i < ys.length - 1; i++) {
      if (!(ys[i] > ys[i - 1] && ys[i] >= ys[i + 1])) continue;
      let l = i, r = i, lmin = ys[i], rmin = ys[i];
      while (l > 0 && ys[l - 1] <= ys[i]) { l--; lmin = Math.min(lmin, ys[l]); }
      while (r < ys.length - 1 && ys[r + 1] <= ys[i]) { r++; rmin = Math.min(rmin, ys[r]); }
      const prom = ys[i] - Math.max(lmin, rmin);
      if (prom >= thr) out.push({ i, x: x[i], y: ys[i], prom });
    }
    return out;
  };
  const pv = (x, c, h, w, eta) => {
    const g = Math.exp(-4 * Math.LN2 * sq((x - c) / w)), l = 1 / (1 + 4 * sq((x - c) / w));
    return h * (eta * l + (1 - eta) * g);
  };
  /* Fit N peaks simultaneously. shape: 'gauss' | 'lorentz' | 'pv'. */
  A.fitPeaks = function (x, y, peaks, shape) {
    const np = peaks.length;
    if (!np) return { error: 'No peaks found. Lower the prominence threshold.' };
    const per = shape === 'pv' ? 4 : 3;
    const dx = (Math.max(...x) - Math.min(...x)) / x.length;
    const p0 = [];
    peaks.forEach(pk => {
      const half = pk.y / 2; let l = pk.i, r = pk.i;
      while (l > 0 && y[l] > half) l--; while (r < y.length - 1 && y[r] > half) r++;
      p0.push(pk.x, pk.y, Math.max(x[r] - x[l], 3 * dx));
      if (shape === 'pv') p0.push(0);
    });
    const etaOf = u => 1 / (1 + Math.exp(-u));
    const xm = S.mean(x);
    p0.push(0, 0);
    const f = (xx, p) => {
      let s = p[np * per] + p[np * per + 1] * (xx - xm);
      for (let k = 0; k < np; k++) {
        const c = p[k * per], h = p[k * per + 1], w = Math.abs(p[k * per + 2]);
        const eta = shape === 'lorentz' ? 1 : shape === 'gauss' ? 0 : etaOf(p[k * per + 3]);
        s += pv(xx, c, h, w, eta);
      }
      return s;
    };
    let fit = S.lm(f, x, y, p0, { maxIter: 600 });
    if (!fit) return { error: 'Peak fit did not converge.' };
    if (!fit.cov && shape === 'pv') {
      /* a saturated mixing parameter makes the covariance singular: hold the shapes and refit */
      const fixed = fit.p.map((_, j) => j < np * per && j % per === 3);
      const again = S.lm(f, x, y, fit.p, { fixed, maxIter: 200 });
      if (again && again.cov) fit = again;
    }
    const list = [];
    for (let k = 0; k < np; k++) {
      const c = fit.p[k * per], h = fit.p[k * per + 1], w = Math.abs(fit.p[k * per + 2]);
      const eta = shape === 'lorentz' ? 1 : shape === 'gauss' ? 0 : etaOf(fit.p[k * per + 3]);
      const area = h * w * (eta * Math.PI / 2 + (1 - eta) * Math.sqrt(Math.PI / (4 * Math.LN2)));
      list.push({ center: c, centerSE: fit.se[k * per], height: h, fwhm: w, fwhmSE: fit.se[k * per + 2], eta, area });
    }
    list.sort((a, b) => a.center - b.center);
    return { fit, peaks: list, f, r2: fit.r2, background: [fit.p[np * per], fit.p[np * per + 1], xm] };
  };
  /* XRD: d-spacing, Scherrer size and Williamson–Hall from fitted peaks (2θ in degrees). */
  A.xrd = function (peaks, lambdaA, K, instDeg) {
    const rad = Math.PI / 180;
    const rows = peaks.map(pk => {
      const th = pk.center / 2 * rad;
      const beta = Math.sqrt(Math.max(sq(pk.fwhm) - sq(instDeg || 0), 1e-12)) * rad;
      return { ...pk, d: lambdaA / (2 * Math.sin(th)), size: K * lambdaA / (beta * Math.cos(th)) / 10, beta, th };
    });
    let wh = null;
    if (rows.length >= 3) {
      const xs = rows.map(r => 4 * Math.sin(r.th)), ys = rows.map(r => r.beta * Math.cos(r.th));
      const fit = S.lm((x, p) => p[0] + p[1] * x, xs, ys, [S.mean(ys), 0]);
      if (fit) wh = { size: fit.p[0] > 0 ? K * lambdaA / fit.p[0] / 10 : NaN, strain: fit.p[1], r2: fit.r2, xs, ys, fit };
    }
    return { rows, wh, meanSize: S.mean(rows.map(r => r.size)) };
  };
  /* Tauc analysis: X = wavelength (nm) or photon energy (eV), Y = absorbance (∝ α). */
  A.tauc = function (x, y, opts) {
    opts = Object.assign({ transition: 'direct', range: null }, opts);
    const isNm = S.mean(x) > 20;
    const E = x.map(v => (isNm ? 1239.84 / v : v));
    const pw = { direct: 2, indirect: 0.5, 'direct-forbidden': 2 / 3, 'indirect-forbidden': 1 / 3 }[opts.transition] || 2;
    const pts = E.map((e, i) => ({ e, t: Math.pow(Math.max(y[i] * e, 0), pw) })).filter(p => isFinite(p.e) && isFinite(p.t)).sort((a, b) => a.e - b.e);
    const tmax = Math.max(...pts.map(p => p.t));
    let region;
    if (opts.range && opts.range[0] < opts.range[1]) region = pts.filter(p => p.e >= opts.range[0] && p.e <= opts.range[1]);
    else {
      /* the steepest straight segment on the rising edge (10–85% of the maximum) */
      const edge = pts.filter(p => p.t >= 0.1 * tmax && p.t <= 0.85 * tmax);
      const w = Math.max(5, Math.round(edge.length * 0.25));
      let best = null;
      for (let i = 0; i + w <= edge.length; i++) {
        const seg = edge.slice(i, i + w);
        const f = S.lm((e, p) => p[0] + p[1] * e, seg.map(p => p.e), seg.map(p => p.t), [0, 1]);
        if (!f || f.p[1] <= 0) continue;
        const score = f.r2 >= 0.99 ? f.p[1] : f.p[1] * Math.pow(f.r2, 20);
        if (!best || score > best.score) best = { seg, score };
      }
      region = best ? best.seg : edge;
    }
    if (region.length < 3) return { error: 'The linear region needs at least three points.' };
    const fit = S.lm((e, p) => p[0] + p[1] * e, region.map(p => p.e), region.map(p => p.t), [0, 1]);
    const Eg = -fit.p[0] / fit.p[1];
    const se = S.deltaSE(p => -p[0] / p[1], fit);
    return { Eg, se, ci: [Eg - fit.tq * se, Eg + fit.tq * se], fit, region: [region[0].e, region[region.length - 1].e], pts, pw, isNm, r2: fit.r2 };
  };
  /* Tensile test: modulus (steepest initial linear region), 0.2% offset yield, UTS, elongation, toughness. */
  A.tensile = function (strain, stress, opts) {
    opts = Object.assign({ percent: null, offset: 0.002 }, opts);
    const pct = opts.percent != null ? opts.percent : Math.max(...strain) > 2;
    const e = strain.map(v => (pct ? v / 100 : v));
    const n = e.length;
    let iUTS = 0; stress.forEach((s, i) => { if (s > stress[iUTS]) iUTS = i; });
    const upto = Math.max(6, Math.min(iUTS, Math.round(n * 0.6)));
    const sizes = [...new Set([Math.max(5, Math.round(n * 0.02)), Math.max(5, Math.round(n * 0.04)), Math.max(6, Math.round(n * 0.08))])];
    let best = null, w = sizes[0];
    for (const ww of sizes) for (let i = 0; i + ww <= upto; i++) {
      const xs = e.slice(i, i + ww), ys = stress.slice(i, i + ww);
      const f = S.lm((x, p) => p[0] + p[1] * x, xs, ys, [0, (ys[ww - 1] - ys[0]) / ((xs[ww - 1] - xs[0]) || 1)]);
      if (!f || f.r2 < 0.995) continue;
      if (!best || f.p[1] > best.fit.p[1] * 1.03 || (f.p[1] > best.fit.p[1] * 0.97 && ww > best.w)) { best = { fit: f, i, w: ww }; w = ww; }
    }
    if (!best) for (let i = 0; i + w <= upto; i++) {
      const xs = e.slice(i, i + w), ys = stress.slice(i, i + w);
      const f = S.lm((x, p) => p[0] + p[1] * x, xs, ys, [0, 1]);
      if (f && (!best || f.r2 > best.fit.r2)) best = { fit: f, i, w };
    }
    const E = best.fit.p[1], b0 = best.fit.p[0];
    const toe = -b0 / E;
    const g = i => stress[i] - E * (e[i] - toe - opts.offset);
    let yieldS = NaN, yieldE = NaN;
    for (let i = best.i + 1; i < n; i++) if (g(i - 1) > 0 && g(i) <= 0) {
      const t = g(i - 1) / (g(i - 1) - g(i));
      yieldE = e[i - 1] + t * (e[i] - e[i - 1]); yieldS = stress[i - 1] + t * (stress[i] - stress[i - 1]); break;
    }
    let tough = 0; for (let i = 1; i < n; i++) tough += 0.5 * (stress[i] + stress[i - 1]) * (e[i] - e[i - 1]);
    return { E, Ese: best.fit.se[1], toe, region: [e[best.i], e[best.i + best.w - 1]], yieldS, yieldE, uts: stress[iUTS], eUTS: e[iUTS], elong: e[n - 1], toughness: tough, pct, e };
  };
  /* Area under the curve by the trapezoid rule, above a baseline. */
  A.auc = function (x, y, base) {
    const idx = x.map((v, i) => i).sort((a, b) => x[a] - x[b]);
    const X = idx.map(i => x[i]), Y = idx.map(i => y[i]);
    const b = base === 'line' ? (xx => Y[0] + (Y[Y.length - 1] - Y[0]) * (xx - X[0]) / ((X[X.length - 1] - X[0]) || 1)) : (() => +base || 0);
    let tot = 0, pos = 0, neg = 0;
    for (let i = 1; i < X.length; i++) {
      const a = 0.5 * ((Y[i] - b(X[i])) + (Y[i - 1] - b(X[i - 1]))) * (X[i] - X[i - 1]);
      tot += a; if (a > 0) pos += a; else neg += a;
    }
    let ip = 0; Y.forEach((v, i) => { if (v > Y[ip]) ip = i; });
    return { total: tot, positive: pos, negative: neg, peakX: X[ip], peakY: Y[ip] };
  };

  root.BF.analysis = A;
})(typeof window !== 'undefined' ? window : globalThis);
