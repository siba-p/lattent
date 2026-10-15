/* Runs Lattent's generative models off the main thread. The 2.5 MB of weights load only here,
   the first time someone opens Generate materials. */
self.window = self;
importScripts('chem.js', '../models/gen-v1.js', 'generate.js');
const G = self.BF.gen, C = self.BF.chem;
self.onmessage = e => {
  const { id, op, o } = e.data;
  try {
    if (op === 'info') { self.postMessage({ id, ok: true, result: { metrics: G.metrics(), nTrain: self.BF_GEN_MODELS.mdiff.n_train } }); return; }
    if (op === 'predict') {
      const comps = o.formulas.map(f => { try { return { f, comp: C.reduce(C.parse(f)) }; } catch (err) { return { f, error: err.message }; } });
      const ok = comps.filter(c => c.comp && Object.keys(c.comp).every(el => C.BY[el].z <= C.K));
      const pred = ok.length ? G.predict(ok.map(c => c.comp)) : [];
      ok.forEach((c, i) => Object.assign(c, pred[i], { formula: C.format(c.comp), cb: C.chargeBalance(c.comp) }));
      self.postMessage({ id, ok: true, result: comps });
      return;
    }
    if (op === 'design') {
      /* sample in batches so the page can show progress */
      const batch = 100, total = o.n || 400, raw = [], t0 = Date.now();
      for (let i = 0; i * batch < total; i++) {
        raw.push(...G.sample(Object.assign({}, o, { n: Math.min(batch, total - i * batch), seed: (o.seed || 1) * 7919 + i })));
        self.postMessage({ id, progress: Math.min(1, (i + 1) * batch / total) });
      }
      const res = G.design(Object.assign({}, o, { raw }));
      res.ms = Date.now() - t0;
      self.postMessage({ id, ok: true, result: res });
    }
  } catch (err) { self.postMessage({ id, ok: false, error: err.message || String(err) }); }
};
