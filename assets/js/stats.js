/* Benchfit numerical core: special functions, distributions, Levenberg–Marquardt
   least squares with covariance, delta-method intervals, model comparison. */
(function (root) {
  'use strict';
  const S = {};

  S.mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  S.sd = a => {
    if (a.length < 2) return NaN;
    const m = S.mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  };
  S.geomean = a => Math.exp(S.mean(a.map(Math.log)));

  S.gammaln = function (x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  };

  function betacf(x, a, b) {
    const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /* Regularised incomplete beta I_x(a, b). */
  S.ibeta = function (x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(S.gammaln(a + b) - S.gammaln(a) - S.gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
  };

  /* Student t cumulative distribution. */
  S.tcdf = function (t, df) {
    if (!isFinite(df) || df > 1e7) return 0.5 * (1 + erf(t / Math.SQRT2));
    const p = 0.5 * S.ibeta(df / (df + t * t), df / 2, 0.5);
    return t > 0 ? 1 - p : p;
  };

  /* Quantile of the t distribution, by bisection on the CDF. */
  S.tinv = function (p, df) {
    if (p === 0.5) return 0;
    if (p < 0.5) return -S.tinv(1 - p, df);
    let lo = 0, hi = 1;
    while (S.tcdf(hi, df) < p) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (S.tcdf(mid, df) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-12 * Math.max(1, hi)) break;
    }
    return 0.5 * (lo + hi);
  };

  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.5 * x);
    const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return s * y;
  }
  S.erf = erf;

  /* Welch two-sample t-test. Returns difference a−b with a 95% interval. */
  S.welch = function (a, b) {
    const na = a.length, nb = b.length;
    if (na < 2 || nb < 2) return null;
    const va = S.sd(a) ** 2 / na, vb = S.sd(b) ** 2 / nb;
    const se = Math.sqrt(va + vb);
    const diff = S.mean(a) - S.mean(b);
    if (se === 0) return { diff, t: Infinity, df: na + nb - 2, p: diff === 0 ? 1 : 0, lo: diff, hi: diff };
    const df = (va + vb) ** 2 / (va * va / (na - 1) + vb * vb / (nb - 1));
    const t = diff / se;
    const p = 2 * (1 - S.tcdf(Math.abs(t), df));
    const q = S.tinv(0.975, df);
    return { diff, t, df, p, lo: diff - q * se, hi: diff + q * se };
  };

  /* Inverse of a small symmetric positive matrix by Gauss–Jordan; null if singular. */
  S.inv = function (A) {
    const n = A.length;
    const M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-300) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f !== 0) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(r => r.slice(n));
  };

  function solve(A, b) {
    const Ai = S.inv(A);
    if (!Ai) return null;
    return Ai.map(r => r.reduce((s, v, j) => s + v * b[j], 0));
  }

  /* Weighted nonlinear least squares by Levenberg–Marquardt.
     f(x, p) → model value; xs, ys: data; p0: start; opts.fixed: boolean mask;
     opts.w: weights (1/σ²). Returns parameters, standard errors, covariance of
     the free parameters, residual statistics and information criteria. */
  S.lm = function (f, xs, ys, p0, opts) {
    opts = opts || {};
    const n = xs.length;
    const fixed = opts.fixed || p0.map(() => false);
    const w = opts.w || xs.map(() => 1);
    const free = p0.map((_, i) => i).filter(i => !fixed[i]);
    const k = free.length;
    let p = p0.slice();

    const ssr = q => {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const r = ys[i] - f(xs[i], q);
        s += w[i] * r * r;
      }
      return s;
    };
    const jac = q => {
      const J = Array.from({ length: n }, () => new Array(k));
      for (let a = 0; a < k; a++) {
        const j = free[a];
        const h = 1e-6 * Math.max(Math.abs(q[j]), 1e-3);
        const qp = q.slice(), qm = q.slice();
        qp[j] += h; qm[j] -= h;
        for (let i = 0; i < n; i++) J[i][a] = (f(xs[i], qp) - f(xs[i], qm)) / (2 * h);
      }
      return J;
    };

    let cur = ssr(p);
    if (!isFinite(cur)) return null;
    let lambda = 1e-3, iter = 0, converged = false;
    const maxIter = opts.maxIter || 400;
    while (iter++ < maxIter && k > 0) {
      const J = jac(p);
      const JTJ = Array.from({ length: k }, () => new Array(k).fill(0));
      const JTr = new Array(k).fill(0);
      for (let i = 0; i < n; i++) {
        const r = ys[i] - f(xs[i], p);
        for (let a = 0; a < k; a++) {
          JTr[a] += w[i] * J[i][a] * r;
          for (let b = a; b < k; b++) JTJ[a][b] += w[i] * J[i][a] * J[i][b];
        }
      }
      for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) JTJ[a][b] = JTJ[b][a];
      let improved = false;
      for (let tries = 0; tries < 30; tries++) {
        const A = JTJ.map((r, a) => r.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)));
        const d = solve(A, JTr);
        if (!d) { lambda *= 10; continue; }
        const q = p.slice();
        free.forEach((j, a) => { q[j] += d[a]; });
        const s = ssr(q);
        if (isFinite(s) && s <= cur) {
          const rel = (cur - s) / Math.max(cur, 1e-300);
          const step = Math.max(...free.map((j, a) => Math.abs(d[a]) / Math.max(Math.abs(p[j]), 1e-8)));
          p = q; cur = s; lambda = Math.max(lambda / 10, 1e-12); improved = true;
          if (rel < 1e-13 || step < 1e-10) converged = true;
          break;
        }
        lambda *= 10;
      }
      if (!improved) { converged = true; break; }
      if (converged) break;
    }

    const dof = n - k;
    const J = jac(p);
    const JTJ = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) JTJ[a][b] += w[i] * J[i][a] * J[i][b];
    const s2 = dof > 0 ? cur / dof : NaN;
    const Ji = S.inv(JTJ);
    const cov = Ji ? Ji.map(r => r.map(v => v * s2)) : null;
    const se = p.map(() => 0);
    if (cov) free.forEach((j, a) => { se[j] = Math.sqrt(Math.max(cov[a][a], 0)); });
    const tq = dof > 0 ? S.tinv(0.975, dof) : NaN;
    const ybar = S.mean(ys);
    let sst = 0, ssrU = 0;
    for (let i = 0; i < n; i++) {
      sst += (ys[i] - ybar) ** 2;
      ssrU += (ys[i] - f(xs[i], p)) ** 2;
    }
    const kk = k + 1;
    const aic = n * Math.log(cur / n) + 2 * kk;
    const aicc = n - kk - 1 > 0 ? aic + 2 * kk * (kk + 1) / (n - kk - 1) : Infinity;
    return {
      p, se, cov, free, fixed, n, k, dof, ssr: cur, ssrUnweighted: ssrU, s2, tq,
      sy: Math.sqrt(s2), r2: sst > 0 ? 1 - ssrU / sst : NaN,
      ci: p.map((v, j) => (fixed[j] || !cov ? [NaN, NaN] : [v - tq * se[j], v + tq * se[j]])),
      aicc, converged, f
    };
  };

  /* Several starts; keep the best finite fit. */
  S.multistart = function (f, xs, ys, starts, opts) {
    let best = null;
    for (const p0 of starts) {
      let r = null;
      try { r = S.lm(f, xs, ys, p0, opts); } catch (e) { r = null; }
      if (r && isFinite(r.ssr) && r.p.every(isFinite) && (!best || r.ssr < best.ssr - 1e-12 * best.ssr)) best = r;
    }
    return best;
  };

  /* Gradient of a scalar function of the parameters, over the free parameters. */
  S.gradFree = function (g, fit) {
    return fit.free.map(j => {
      const h = 1e-6 * Math.max(Math.abs(fit.p[j]), 1e-3);
      const qp = fit.p.slice(), qm = fit.p.slice();
      qp[j] += h; qm[j] -= h;
      return (g(qp) - g(qm)) / (2 * h);
    });
  };

  /* Delta-method standard error of g(p). */
  S.deltaSE = function (g, fit) {
    if (!fit.cov) return NaN;
    const gr = S.gradFree(g, fit);
    let v = 0;
    for (let a = 0; a < gr.length; a++) for (let b = 0; b < gr.length; b++) v += gr[a] * fit.cov[a][b] * gr[b];
    return Math.sqrt(Math.max(v, 0));
  };

  /* 95% confidence band of the fitted curve at the given x values. */
  S.band = function (fit, xs) {
    return xs.map(x => {
      const y = fit.f(x, fit.p);
      const h = fit.tq * S.deltaSE(q => fit.f(x, q), fit);
      return [x, y - h, y + h];
    });
  };

  /* Akaike weights from AICc values. */
  S.akaikeWeights = function (aics) {
    const m = Math.min(...aics.filter(isFinite));
    const e = aics.map(a => (isFinite(a) ? Math.exp(-0.5 * (a - m)) : 0));
    const s = e.reduce((x, y) => x + y, 0);
    return e.map(v => v / s);
  };

  /* Root of g on [a, b] by bisection; null if no sign change. */
  S.bisect = function (g, a, b) {
    let fa = g(a), fb = g(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    for (let i = 0; i < 200; i++) {
      const m = 0.5 * (a + b), fm = g(m);
      if (fm === 0) return m;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
      if (Math.abs(b - a) < 1e-12 * Math.max(1, Math.abs(m))) break;
    }
    return 0.5 * (a + b);
  };

  /* Seeded generator for reproducible example data. */
  S.rng = function (seed) {
    let s = seed >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    u.normal = () => { let a = 0; while (a === 0) a = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); };
    return u;
  };

  root.BF = root.BF || {};
  root.BF.stats = S;
})(typeof window !== 'undefined' ? window : globalThis);
