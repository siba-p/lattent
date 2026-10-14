/* In-browser inference for Benchfit's specialist models (weights in assets/models/shape-v1.js).
   A two-layer network reads the shape fingerprint of XY data and says which family of
   behaviour it shows; a second model judges whether scatter grows with the signal. */
(function (root) {
  'use strict';
  const BF = root.BF;
  const ML = {};
  BF.ml = ML;

  /* What each family means and what to do with it */
  ML.info = {
    linear: { label: 'Straight line', why: 'Y changes at a constant rate with X.', models: ['line'], fields: ['General'] },
    polynomial: { label: 'Curved, polynomial-like', why: 'Smooth curvature without a plateau or exponential character.', models: ['quad', 'cubic'], fields: ['General'] },
    exp_decay: { label: 'Decay', why: 'Falls quickly, then levels off towards a baseline, as in relaxation, luminescence or first-order kinetics.', models: ['expdecay', 'exp2', 'kww', 'secondorder'], fields: ['General', 'Materials & chemistry'] },
    saturating: { label: 'Rise to a plateau', why: 'Increases and saturates, as in adsorption isotherms, binding or uptake kinetics.', models: ['langmuir', 'sips', 'freundlich', 'assoc', 'pfo', 'pso', 'mm', 'hill'], fields: ['Materials & chemistry', 'Biology & pharmacology', 'General'] },
    sigmoid: { label: 'S-shaped (sigmoidal)', why: 'A transition between two plateaus, as in crystallisation (Avrami), dose–response or switching.', models: ['boltz', 'logistic', 'avrami', 'gompertz', 'dr4', 'hill', 'sips'], fields: ['General', 'Materials & chemistry', 'Biology & pharmacology'] },
    exp_growth: { label: 'Exponential growth', why: 'Increases ever faster, with a constant doubling interval.', models: ['expgrowth'], fields: ['General'] },
    power_law: { label: 'Power law', why: 'A straight line on log–log axes, as in scaling laws, Freundlich or Mark–Houwink.', models: ['power', 'freundlich', 'markhouwink'], fields: ['General', 'Polymers', 'Materials & chemistry'] },
    logarithmic: { label: 'Logarithmic', why: 'A straight line against log X, as in Tafel behaviour.', models: ['log', 'tafel'], fields: ['General', 'Materials & chemistry'] },
    thermally_activated: { label: 'Thermally activated', why: 'Grows exponentially with temperature, so ln Y is linear in 1/T. Arrhenius or VFT gives the activation energy.', models: ['arrhenius', 'vft'], fields: ['Materials & chemistry'] },
    inverse: { label: 'Inverse dependence', why: 'Varies as 1/X, 1/√X or 1/X², as in Flory–Fox, Hall–Petch, quantum confinement or Curie–Weiss.', models: ['floryfox', 'hallpetch', 'confine', 'confine2', 'curieweiss'], fields: ['Polymers', 'Nanomaterials & physics', 'Materials & chemistry'] },
    peaks: { label: 'Spectrum with peaks', why: 'Separate peaks on a baseline, as in XRD, Raman, FTIR, XPS or a chromatogram.', analysis: 'peaks' },
    absorption_edge: { label: 'Absorption edge', why: 'Flat, then rising steeply past a threshold energy: an optical band gap.', analysis: 'tauc' },
    stress_strain: { label: 'Stress–strain curve', why: 'Linear elastic loading, yielding, then failure.', analysis: 'tensile' }
  };

  function forward(net, x) {
    let h = x.map((v, i) => (v - net.mean[i]) / net.scale[i]);
    for (let l = 0; l < net.W.length; l++) {
      const W = net.W[l], b = net.b[l], out = new Array(b.length);
      for (let j = 0; j < b.length; j++) {
        let s = b[j];
        for (let i = 0; i < h.length; i++) s += h[i] * W[i][j];
        out[j] = l < net.W.length - 1 ? Math.max(0, s) : s;
      }
      h = out;
    }
    return h;
  }
  const softmax = z => { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };
  const sigmoid = z => 1 / (1 + Math.exp(-z));
  ML.ready = () => !!(root.BF_ML_MODELS && BF.mlFeatures);
  ML.version = () => (root.BF_ML_MODELS ? root.BF_ML_MODELS.version : null);
  ML.metrics = () => (root.BF_ML_MODELS ? root.BF_ML_MODELS.metrics : null);

  ML.probaFromFeatures = f => softmax(forward(root.BF_ML_MODELS.shape, f));
  ML.noiseFromFeatures = f => { const z = forward(root.BF_ML_MODELS.noise, f); return z.length === 1 ? sigmoid(z[0]) : softmax(z)[1]; };

  /* Ranked families for XY data: [{key, p, label, why, models, analysis}] */
  ML.classify = function (xs, ys) {
    if (!ML.ready()) return null;
    const ft = BF.mlFeatures.xy(xs, ys);
    if (!ft) return null;
    const p = ML.probaFromFeatures(ft.f);
    const cls = root.BF_ML_MODELS.shape.classes;
    return cls.map((k, i) => Object.assign({ key: k, p: p[i] }, ML.info[k])).sort((a, b) => b.p - a.p);
  };
  /* Candidate equations covering at least `mass` of the probability */
  ML.candidates = function (ranked, mass) {
    mass = mass || 0.97;
    const out = new Set(); let acc = 0;
    for (const r of ranked) { (r.models || []).forEach(m => out.add(m)); acc += r.p; if (acc >= mass) break; }
    return [...out];
  };
  /* Probability that measurement scatter is proportional to the signal (1/Y² weighting) */
  ML.noise = function (xs, ys) {
    if (!ML.ready()) return null;
    const nf = BF.mlFeatures.noise(xs, ys);
    if (!nf) return null;
    const p = ML.noiseFromFeatures(nf.f);
    return { proportional: p, dynamicRange: nf.dyn, recommend: p > 0.8 && nf.dyn > 0.7 ? '1/y2' : p < 0.2 ? 'none' : null };
  };
})(typeof window !== 'undefined' ? window : globalThis);
