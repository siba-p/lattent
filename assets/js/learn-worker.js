/* Runs AutoML off the main thread so Studio stays responsive while models train. */
self.window = self;

importScripts('stats.js', 'models.js', 'analysis.js', 'learn.js');
self.onmessage = e => {
  const { id, X, y, names, Xnew, opts } = e.data;
  try {
    const r = self.BF.learn.automl(X, y, names, opts);
    if (r.error) { self.postMessage({ id, ok: true, result: { error: r.error } }); return; }
    const strip = b => ({ key: b.key, name: b.name, r2: b.r2, mae: b.mae, rmse: b.rmse, ms: b.ms });
    self.postMessage({ id, ok: true, result: {
      board: r.board.map(strip), best: Object.assign(strip(r.best), { oof: r.best.oof }),
      importance: r.importance, pdp: r.pdp, q: r.q, level: r.level, n: r.n, p: r.p, folds: r.folds, ms: r.ms, dropped: r.dropped,
      preds: (Xnew || []).map(x => r.predict(x))
    } });
  } catch (err) { self.postMessage({ id, ok: false, error: err.message || String(err) }); }
};
