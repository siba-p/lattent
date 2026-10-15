/* Lattent's generative materials models, in the browser:
   - property networks: composition → formation energy and band gap (trained on Materials Project data)
   - masked discrete diffusion: proposes chemical formulas within a chemical system, steered by
     number of elements and target band gap (classifier-free guidance).
   Weights: assets/models/props-v1.js and assets/models/mdiff-v1.js (window.BF_GEN_MODELS). */
(function (root) {
  'use strict';
  const BF = root.BF;
  const C = BF.chem;
  const G = {};
  BF.gen = G;

  /* ---------- weight decoding ---------- */
  function b64bytes(s) {
    if (typeof atob === 'function') { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  const f32 = s => new Float32Array(b64bytes(s).buffer);
  function f16(s) {
    const u = b64bytes(s), n = u.length / 2, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const h = u[2 * i] | (u[2 * i + 1] << 8);
      const sgn = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
      out[i] = e === 0 ? sgn * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : sgn * Infinity) : sgn * Math.pow(2, e - 15) * (1 + m / 1024);
    }
    return out;
  }
  const lin16 = l => ({ n: l.in, m: l.out, W: f16(l.W), b: f16(l.b) });
  const lin32 = l => ({ n: l.in, m: l.out, W: f32(l.W), b: f32(l.b) });
  /* y = x·W + b for a batch (rows of length n) */
  function dense(L, X, rows) {
    const Y = new Float32Array(rows * L.m);
    for (let r = 0; r < rows; r++) {
      const xo = r * L.n, yo = r * L.m;
      for (let j = 0; j < L.m; j++) Y[yo + j] = L.b[j];
      for (let i = 0; i < L.n; i++) {
        const xv = X[xo + i];
        if (xv === 0) continue;
        const wo = i * L.m;
        for (let j = 0; j < L.m; j++) Y[yo + j] += xv * L.W[wo + j];
      }
    }
    return Y;
  }
  const silu = v => v / (1 + Math.exp(-v));

  let P = null, D = null;
  function loadProps() {
    if (P) return P;
    const M = root.BF_GEN_MODELS && root.BF_GEN_MODELS.props;
    if (!M) return null;
    const mk = m => ({ mean: f32(m.mean), std: f32(m.std), positive: m.positive, layers: m.layers.map(lin32), metrics: m.metrics });
    P = { eform: mk(M.eform), gap: mk(M.gap), interval: { eform: M.eform.interval, gap: M.gap.interval } };
    return P;
  }
  function loadDiff() {
    if (D) return D;
    const M = root.BF_GEN_MODELS && root.BF_GEN_MODELS.mdiff;
    if (!M) return null;
    D = Object.assign({}, M, { ee: f16(M.ee), ce: f16(M.ce), l1: lin16(M.l1), l2: lin16(M.l2), l3: lin16(M.l3), oe: lin16(M.oe), oc: lin16(M.oc) });
    return D;
  }
  G.ready = () => !!(root.BF_GEN_MODELS && root.BF_GEN_MODELS.props && root.BF_GEN_MODELS.mdiff);
  G.metrics = () => { const p = loadProps(); return p ? { eform: p.eform.metrics, gap: p.gap.metrics, interval: p.interval } : null; };

  /* ---------- property prediction ---------- */
  function mlp(net, feats) {
    const rows = feats.length, n = net.mean.length;
    let X = new Float32Array(rows * n);
    feats.forEach((f, r) => { for (let i = 0; i < n; i++) X[r * n + i] = (f[i] - net.mean[i]) / net.std[i]; });
    net.layers.forEach((L, li) => {
      X = dense(L, X, rows);
      if (li < net.layers.length - 1) for (let i = 0; i < X.length; i++) X[i] = silu(X[i]);
    });
    return Array.from(X, v => (net.positive ? Math.log1p(Math.exp(v)) : v));
  }
  /* comps: [{El: amount}] → [{eform, gap}] */
  G.predict = function (comps) {
    const p = loadProps();
    const feats = comps.map(c => C.features(c));
    const e = mlp(p.eform, feats), g = mlp(p.gap, feats);
    return comps.map((_, i) => ({ eform: e[i], gap: g[i], eformPm: G.halfWidth('eform', e[i]), gapPm: G.halfWidth('gap', g[i]) }));
  };
  G.predictFeatures = (which, feats) => mlp(loadProps()[which], feats);
  /* 90% split-conformal half-width from held-out errors (band gap: per predicted-gap range) */
  G.halfWidth = function (which, v) {
    const iv = loadProps().interval[which];
    if (!iv) return null;
    if (iv.q != null) return iv.q;
    const b = iv.bins.find(x => v >= x.lo && v < x.hi) || iv.bins[iv.bins.length - 1];
    return b.q;
  };

  /* ---------- masked discrete diffusion ---------- */
  function forward(d, E, Cn, cond, r, rows) {
    const S = d.slots, DE = d.DE, DC = d.DC, inDim = S * (DE + DC) + d.cdim + 1;
    const X = new Float32Array(rows * inDim);
    for (let b = 0; b < rows; b++) {
      let o = b * inDim;
      for (let s = 0; s < S; s++) { const t = E[b * S + s]; for (let k = 0; k < DE; k++) X[o++] = d.ee[t * DE + k]; }
      for (let s = 0; s < S; s++) { const t = Cn[b * S + s]; for (let k = 0; k < DC; k++) X[o++] = d.ce[t * DC + k]; }
      for (let k = 0; k < d.cdim; k++) X[o++] = cond[b * d.cdim + k];
      X[o++] = r[b];
    }
    let h = dense(d.l1, X, rows); for (let i = 0; i < h.length; i++) h[i] = silu(h[i]);
    let h2 = dense(d.l2, h, rows); for (let i = 0; i < h2.length; i++) h2[i] = h[i] + silu(h2[i]);
    let h3 = dense(d.l3, h2, rows); for (let i = 0; i < h3.length; i++) h3[i] = h2[i] + silu(h3[i]);
    return { le: dense(d.oe, h3, rows), lc: dense(d.oc, h3, rows) };
  }
  G.forwardProbe = function () {
    const d = loadDiff(), pr = d.probe;
    const out = forward(d, Int32Array.from(pr.e.flat()), Int32Array.from(pr.c.flat()), Float32Array.from(pr.cond.flat()), Float32Array.from(pr.r), 2);
    return { le: [0, 1].map(b => Array.from(out.le.slice(b * d.slots * d.VE + 2 * d.VE, b * d.slots * d.VE + 2 * d.VE + 6))), lc: [0, 1].map(b => Array.from(out.lc.slice(b * d.slots * d.VC + 1 * d.VC, b * d.slots * d.VC + 1 * d.VC + 6))), ref: pr };
  };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* opts: {n, allowed: [symbols] | null, nel: 2..5 | null, gap: eV | null, steps, w, temp, seed} */
  G.sample = function (opts) {
    const d = loadDiff();
    const o = Object.assign({ n: 300, allowed: null, nel: null, gap: null, steps: 10, w: 1.5, temp: 1, seed: 1 }, opts);
    const S = d.slots, K = d.K, VE = d.VE, VC = d.VC, PAD_E = K, MASK_E = K + 1, PAD_C = 0, MASK_C = d.maxc + 1;
    const n = o.n, rand = rng(o.seed);
    const allowedZ = o.allowed ? o.allowed.map(s => C.BY[s].z - 1) : null;
    const mkCond = (useGap, useNel) => {
      const c = new Float32Array(n * d.cdim);
      for (let b = 0; b < n; b++) {
        const off = b * d.cdim;
        if (allowedZ) allowedZ.forEach(z => { c[off + z] = 1; }); else for (let z = 0; z < K; z++) c[off + z] = 1;
        if (useGap && o.gap != null) { c[off + K] = o.gap / 4; c[off + K + 1] = 1; }
        if (useNel && o.nel) { c[off + K + 2 + o.nel - 1] = 1; c[off + K + 2 + 5] = 1; }
      }
      return c;
    };
    const cond = mkCond(true, true), nul = mkCond(false, false);
    const guided = o.gap != null || !!o.nel;
    const E = new Int32Array(n * S).fill(MASK_E), Cn = new Int32Array(n * S).fill(MASK_C);
    const allowMask = new Uint8Array(VE); allowMask.fill(1); allowMask[MASK_E] = 0;
    if (allowedZ) { for (let z = 0; z < K; z++) allowMask[z] = 0; allowedZ.forEach(z => { allowMask[z] = 1; }); }
    const pickFrom = (logits, off, size, temp) => {
      let mx = -Infinity; for (let k = 0; k < size; k++) mx = Math.max(mx, logits[off + k] / temp);
      let sum = 0; const p = new Float64Array(size);
      for (let k = 0; k < size; k++) { p[k] = Math.exp(logits[off + k] / temp - mx); sum += p[k]; }
      let u = rand() * sum, k = 0;
      while (k < size - 1 && u > p[k]) { u -= p[k]; k++; }
      return [k, p[k] / sum];
    };
    for (let s = 0; s < o.steps; s++) {
      const r = new Float32Array(n).fill(1 - s / o.steps);
      let { le, lc } = forward(d, E, Cn, nul, r, n);
      if (guided) {
        const g = forward(d, E, Cn, cond, r, n);
        for (let i = 0; i < le.length; i++) le[i] += o.w * (g.le[i] - le[i]);
        for (let i = 0; i < lc.length; i++) lc[i] += o.w * (g.lc[i] - lc[i]);
      }
      const targetMasked = Math.round(S * (1 - (s + 1) / o.steps));
      for (let b = 0; b < n; b++) {
        const se = [], sc = [];
        for (let i = 0; i < S; i++) {
          const oe = (b * S + i) * VE, oc = (b * S + i) * VC;
          for (let k = 0; k < VE; k++) if (!allowMask[k]) le[oe + k] = -1e9;
          lc[oc + MASK_C] = -1e9;
          if (o.nel) {
            if (i < o.nel) { le[oe + PAD_E] = -1e9; lc[oc + PAD_C] = -1e9; }
            else { for (let k = 0; k < VE; k++) le[oe + k] = -1e9; le[oe + PAD_E] = 0; for (let k = 0; k < VC; k++) lc[oc + k] = -1e9; lc[oc + PAD_C] = 0; }
          }
          for (let j = 0; j < S; j++) if (j !== i && E[b * S + j] < K) le[oe + E[b * S + j]] = -1e9;
          se.push(pickFrom(le, oe, VE, o.temp)); sc.push(pickFrom(lc, oc, VC, o.temp));
        }
        for (const [tok, smp, MASKV] of [[E, se, MASK_E], [Cn, sc, MASK_C]]) {
          const masked = []; for (let i = 0; i < S; i++) if (tok[b * S + i] === MASKV) masked.push(i);
          const k = Math.max(0, masked.length - targetMasked);
          masked.sort((x, y) => smp[y][1] - smp[x][1]).slice(0, k).forEach(i => { tok[b * S + i] = smp[i][0]; });
        }
      }
    }
    const out = [];
    for (let b = 0; b < n; b++) {
      const comp = {}; let ok = true;
      for (let i = 0; i < S; i++) {
        const z = E[b * S + i], c = Cn[b * S + i];
        if (z === PAD_E) continue;
        if (z > PAD_E || c === PAD_C || c > d.maxc) { ok = false; break; }
        const sym = C.SYM[z]; comp[sym] = (comp[sym] || 0) + c;
      }
      if (ok && Object.keys(comp).length) out.push(C.reduce(comp));
    }
    return out;
  };

  /* Full pipeline: sample, de-duplicate, check charge balance, predict, rank. */
  G.design = function (o) {
    const t0 = Date.now();
    const raw = o.raw || G.sample(o);   // o.raw: compositions already sampled (e.g. in batches)
    const seen = new Map();
    raw.forEach(c => { const k = C.key(c); seen.set(k, { comp: c, count: (seen.has(k) ? seen.get(k).count : 0) + 1 }); });
    let cands = [...seen.values()];
    if (o.requireAll && o.allowed) cands = cands.filter(x => o.allowed.every(e => x.comp[e]));
    cands.forEach(x => { x.cb = C.chargeBalance(x.comp); x.formula = C.format(x.comp); x.nel = Object.keys(x.comp).length; });
    if (!o.allowIntermetallic) cands = cands.filter(x => x.cb.balanced);
    else cands = cands.filter(x => x.cb.balanced || x.cb.intermetallic);
    const pred = cands.length ? G.predict(cands.map(x => x.comp)) : [];
    cands.forEach((x, i) => { Object.assign(x, pred[i]); });
    cands = cands.filter(x => x.eform < (o.maxEform != null ? o.maxEform : 0));
    const target = o.gap;
    cands.forEach(x => { x.score = x.eform + (target != null ? 0.35 * Math.abs(x.gap - target) : 0) - 0.02 * Math.log(x.count); });
    cands.sort((a, b) => a.score - b.score);
    return { candidates: cands, sampled: raw.length, unique: seen.size, ms: Date.now() - t0 };
  };

  root.BF.gen = G;
})(typeof window !== 'undefined' ? window : globalThis);
