/* Shape fingerprints for XY data, shared by the training simulator (Node) and the
   in-browser models, so features are computed by identical code in both places. */
(function (root) {
  'use strict';
  const F = {};
  const RES = 32;
  F.RES = RES;

  function collapse(xs, ys) {
    const pts = [];
    for (let i = 0; i < xs.length; i++) if (isFinite(xs[i]) && isFinite(ys[i])) pts.push([+xs[i], +ys[i]]);
    pts.sort((a, b) => a[0] - b[0]);
    const ux = [], uy = [], reps = [];
    for (let i = 0; i < pts.length;) {
      let j = i, s = 0;
      const g = [];
      while (j < pts.length && pts[j][0] === pts[i][0]) { s += pts[j][1]; g.push(pts[j][1]); j++; }
      ux.push(pts[i][0]); uy.push(s / (j - i)); reps.push(g);
      i = j;
    }
    return { ux, uy, reps, n: pts.length };
  }
  function movavg(y, w) {
    if (w <= 1) return y.slice();
    const h = Math.floor(w / 2), out = new Array(y.length);
    let s = 0, c = 0;
    for (let i = 0; i < Math.min(h, y.length); i++) { s += y[i]; c++; }
    for (let i = 0; i < y.length; i++) {
      const add = i + h, rem = i - h - 1;
      if (add < y.length) { s += y[add]; c++; }
      if (rem >= 0) { s -= y[rem]; c--; }
      out[i] = s / c;
    }
    return out;
  }
  function resample(u, v, k) {
    const out = new Array(k);
    let j = 0;
    for (let i = 0; i < k; i++) {
      const t = i / (k - 1);
      while (j < u.length - 2 && u[j + 1] < t) j++;
      const a = u[j], b = u[j + 1];
      const w = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
      out[i] = v[j] + w * (v[j + 1] - v[j]);
    }
    return out;
  }
  /* R² of an ordinary least-squares line through transformed points */
  function r2(x, y) {
    const n = x.length;
    if (n < 3) return 0;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    if (sxx <= 0 || syy <= 0 || !isFinite(sxy)) return 0;
    return Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  }
  /* R² of a quadratic fit (for curvature) */
  function r2quad(x, y) {
    const n = x.length;
    if (n < 4) return 0;
    let S = [0, 0, 0, 0, 0], T = [0, 0, 0], my = 0;
    for (let i = 0; i < n; i++) { let p = 1; for (let k = 0; k < 5; k++) { S[k] += p; if (k < 3) T[k] += p * y[i]; p *= x[i]; } my += y[i]; }
    my /= n;
    const A = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A);
    if (!isFinite(D) || Math.abs(D) < 1e-300) return 0;
    const c = [0, 1, 2].map(k => det(A.map((row, r) => row.map((v, j) => (j === k ? T[r] : v)))) / D);
    let sse = 0, sst = 0;
    for (let i = 0; i < n; i++) { const f = c[0] + c[1] * x[i] + c[2] * x[i] * x[i]; sse += (y[i] - f) ** 2; sst += (y[i] - my) ** 2; }
    return sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : 0;
  }
  const lin = r => Math.min(1, -Math.log10(1 - r + 1e-6) / 6);
  const cv = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; if (!m) return 9; const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; return Math.sqrt(v) / Math.abs(m); };
  const clip = (v, a, b) => Math.max(a, Math.min(b, v));
  const slog = v => Math.sign(v) * Math.log10(1 + Math.abs(v));

  function peaksCount(y, prom) {
    let c = 0;
    for (let i = 1; i < y.length - 1; i++) {
      if (!(y[i] > y[i - 1] && y[i] >= y[i + 1])) continue;
      let l = i, r = i, lm = y[i], rm = y[i];
      while (l > 0 && y[l - 1] <= y[i]) { l--; lm = Math.min(lm, y[l]); }
      while (r < y.length - 1 && y[r + 1] <= y[i]) { r++; rm = Math.min(rm, y[r]); }
      if (y[i] - Math.max(lm, rm) >= prom) c++;
    }
    return c;
  }

  /* Returns {f: number[], meta} or null when there is too little data. */
  F.xy = function (xs, ys) {
    const c = collapse(xs, ys);
    const m = c.ux.length;
    if (m < 4) return null;
    const x = c.ux, y = c.uy;
    const x0 = x[0], x1 = x[m - 1];
    let y0 = Infinity, y1 = -Infinity;
    for (const v of y) { if (v < y0) y0 = v; if (v > y1) y1 = v; }
    if (!(x1 > x0) || !(y1 > y0)) return null;
    const xn = x.map(v => (v - x0) / (x1 - x0));
    const yn = y.map(v => (v - y0) / (y1 - y0));
    const ysm = movavg(yn, Math.max(1, Math.round(m / 48)));
    const Rlin = resample(xn, ysm, RES);
    const posX = x0 > 0, posY = y0 > 0;
    const dec = posX ? Math.log10(x1 / x0) : 0;
    const useLog = posX && dec > 0.7;
    let Rlog = Rlin;
    if (useLog) {
      const l0 = Math.log10(x0), l1 = Math.log10(x1);
      Rlog = resample(x.map(v => (Math.log10(v) - l0) / (l1 - l0)), ysm, RES);
    }
    const dx = [], dl = [];
    for (let i = 1; i < m; i++) { dx.push(x[i] - x[i - 1]); if (posX) dl.push(Math.log(x[i] / x[i - 1])); }
    const logSpaced = posX && m > 4 && cv(dl) < 0.5 * cv(dx) ? 1 : 0;

    const finite = (a, b) => { const X = [], Y = []; for (let i = 0; i < m; i++) { const p = a(x[i]), q = b(y[i]); if (isFinite(p) && isFinite(q)) { X.push(p); Y.push(q); } } return [X, Y]; };
    const id = v => v;
    const R = {};
    R.lin = r2(x, y);
    R.quad = r2quad(xn, yn);
    R.expx = posY ? r2(...finite(id, Math.log)) : 0;
    R.arr = posX && posY ? r2(...finite(v => 1 / v, Math.log)) : 0;
    R.pow = posX && posY ? r2(...finite(Math.log, Math.log)) : 0;
    R.logx = posX ? r2(...finite(Math.log, id)) : 0;
    R.inv = posX ? r2(...finite(v => 1 / v, id)) : 0;
    R.isq = posX ? r2(...finite(v => 1 / Math.sqrt(v), id)) : 0;
    R.lb = posX && posY ? r2(...finite(v => 1 / v, v => 1 / v)) : 0;
    const logit = v => { const t = 0.03 + 0.94 * (v - y0) / (y1 - y0); return Math.log(t / (1 - t)); };
    R.logitx = r2(...finite(id, logit));
    R.logitlx = posX ? r2(...finite(Math.log, logit)) : 0;
    const off = y.map(v => v - y0 + 0.02 * (y1 - y0));
    R.expoff = (() => { const X = [], Y = []; for (let i = 0; i < m; i++) { X.push(x[i]); Y.push(Math.log(off[i])); } return r2(X, Y); })();
    const offTop = y.map(v => y1 - v + 0.02 * (y1 - y0));
    R.satexp = (() => { const X = [], Y = []; for (let i = 0; i < m; i++) { X.push(x[i]); Y.push(Math.log(offTop[i])); } return r2(X, Y); })();

    const d1 = [], d2 = [];
    for (let i = 1; i < RES; i++) d1.push(Rlin[i] - Rlin[i - 1]);
    for (let i = 1; i < d1.length; i++) d2.push(d1[i] - d1[i - 1]);
    const up = d1.filter(v => v > 0.002).length / d1.length, down = d1.filter(v => v < -0.002).length / d1.length;
    const conc = d2.filter(v => v > 0.002).length / d2.length, conv = d2.filter(v => v < -0.002).length / d2.length;
    let iMax = 0, iMin = 0;
    for (let i = 1; i < m; i++) { if (ysm[i] > ysm[iMax]) iMax = i; if (ysm[i] < ysm[iMin]) iMin = i; }
    const sm = movavg(yn, 3);
    let noise = 0; for (let i = 0; i < m; i++) noise += (yn[i] - sm[i]) ** 2;
    noise = Math.sqrt(noise / m);
    const lowFrac = yn.filter(v => v < 0.1).length / m, highFrac = yn.filter(v => v > 0.9).length / m;
    const first = Rlin.slice(0, 4).reduce((s, v) => s + v, 0) / 4, last = Rlin.slice(-4).reduce((s, v) => s + v, 0) / 4;
    const tail = ysm.slice(Math.floor(m * 0.9)).reduce((s, v) => s + v, 0) / Math.max(1, m - Math.floor(m * 0.9));
    let early = 0; { const k = Math.max(3, Math.round(m * 0.08)); early = r2(xn.slice(0, k), yn.slice(0, k)); }

    const eng = [
      useLog ? 1 : 0, clip(dec / 5, 0, 1.2), logSpaced, posX ? 1 : 0, posY ? 1 : 0,
      posX ? x0 / x1 : -0.2, clip(Math.log10(m) / 3.5, 0, 1.2), clip(slog(x1) / 4, -1.5, 1.5), clip(slog(x0) / 4, -1.5, 1.5),
      lin(R.lin), lin(R.quad), lin(R.expx), lin(R.arr), lin(R.pow), lin(R.logx), lin(R.inv), lin(R.isq), lin(R.lb), lin(R.logitx), lin(R.logitlx), lin(R.expoff), lin(R.satexp),
      up, down, conc, conv, last - first, xn[iMax], xn[iMin],
      clip(peaksCount(ysm, 0.1) / 6, 0, 1.5), clip(peaksCount(ysm, 0.3) / 4, 0, 1.5),
      clip(noise * 5, 0, 1.5), lowFrac, highFrac, tail, early
    ];
    return { f: Rlin.concat(Rlog, eng), meta: { m, useLog, posX, posY, dec, reps: c.reps, ux: x, uy: y } };
  };

  /* Fingerprint for the measurement-error model: does scatter grow with the signal? */
  F.noise = function (xs, ys) {
    const c = collapse(xs, ys);
    const m = c.ux.length;
    if (m < 8) return null;
    const y = c.uy;
    const fit = movavg(y, 5);
    const res = y.map((v, i) => Math.abs(v - fit[i]));
    const mag = fit.map(Math.abs);
    const rk = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); o.forEach((p, k) => { r[p[1]] = k; }); return r; };
    const ra = rk(res), rb = rk(mag);
    const spear = r2(ra, rb) * Math.sign((() => { let s = 0; const ma = (m - 1) / 2; for (let i = 0; i < m; i++) s += (ra[i] - ma) * (rb[i] - ma); return s; })());
    const ord = mag.map((v, i) => i).sort((p, q) => mag[p] - mag[q]);
    const third = Math.max(2, Math.floor(m / 3));
    const med = a => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] + 1e-12; };
    const lo = med(ord.slice(0, third).map(i => res[i])), hi = med(ord.slice(-third).map(i => res[i]));
    const magLo = med(ord.slice(0, third).map(i => mag[i])), magHi = med(ord.slice(-third).map(i => mag[i]));
    const dyn = Math.log10(Math.max(...mag) / Math.max(Math.min(...mag.filter(v => v > 0)), 1e-12));
    let repSlope = 0, hasRep = 0;
    const g = c.reps.filter(r => r.length > 1).map(r => { const mm = r.reduce((s, v) => s + v, 0) / r.length; const sd = Math.sqrt(r.reduce((s, v) => s + (v - mm) ** 2, 0) / (r.length - 1)); return [Math.log10(Math.abs(mm) + 1e-12), Math.log10(sd + 1e-12)]; }).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (g.length >= 4) {
      hasRep = 1;
      const mx = g.reduce((s, p) => s + p[0], 0) / g.length, my = g.reduce((s, p) => s + p[1], 0) / g.length;
      let sxy = 0, sxx = 0; g.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; });
      repSlope = sxx > 0 ? clip(sxy / sxx, -1, 2) : 0;
    }
    const ratio = clip(Math.log10(hi / lo) / Math.max(Math.log10(magHi / magLo), 0.1), -2, 3);
    return { f: [spear, clip(Math.log10(hi / lo), -2, 3), ratio, clip(dyn / 4, 0, 1.5), clip(Math.log10(m) / 3, 0, 1.2), hasRep, repSlope], dyn };
  };

  root.BF = root.BF || {};
  root.BF.mlFeatures = F;
})(typeof window !== 'undefined' ? window : globalThis);
