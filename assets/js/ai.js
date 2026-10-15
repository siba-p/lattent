/* The AI inside Lattent: a periodic table of the models, with a detail card for each and, on
   the AI page, a live lab where visitors run the shape model and equation discovery. */
(function () {
  'use strict';
  const U = BF.ui, esc = U.esc;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const CATS = {
    recognise: { name: 'Recognise', c: 1 },
    discover: { name: 'Fit and discover', c: 4 },
    predict: { name: 'Predict and explain', c: 3 },
    generate: { name: 'Generate and optimise', c: 2 },
    explore: { name: 'Explore and assist', c: 5 }
  };
  /* [symbol, name, category, headline metric, what it does, how it learns, how well it works, where to try it] */
  const T = [
    ['Sh', 'Shape recogniser', 'recognise', '98.4%', 'A neural network that reads any XY data set and recognises which of 13 families of behaviour it shows, from Arrhenius trends and saturating isotherms to absorption edges and stress–strain curves. It drives the co-scientist’s suggestions and narrows auto-fit to plausible equations.', 'Trained by Lattent on 67,600 simulated lab data sets with realistic ranges, spacings, replicates, outliers and noise. No user data, and no output from other AI models.', '98.4% correct first time on 7,800 held-out data sets, 99.8% within its top two, and all 25 realistic lab examples in the test suite.', ['#lab', 'Try it on this page']],
    ['Nz', 'Scatter model', 'recognise', 'AUC 0.82', 'Judges whether measurement error grows with the signal, so that 1/Y² weighting should be used in a fit.', 'Trained on simulated data with constant and proportional noise.', 'Held-out AUC 0.82. Lattent acts on it only when it is at least 80% confident.', ['studio/?example=arrhenius', 'Open an example']],
    ['Xp', 'Phase matcher', 'recognise', '0.98', 'Identifies crystalline phases from XRD peaks: it symmetrises every computed structure of your elements, simulates its powder pattern and matches your peaks with a refined lattice scale, flagging peaks that point to a second phase.', 'Physics, not training: reference structures come live from 5.8 million DFT calculations in the Alexandria database.', 'Gold nanoparticles: fcc Au scores 0.98 against 0.71 for the next phase. Experimental ZnO is identified as wurtzite.', ['studio/?example=xrd', 'Identify phases in an example']],
    ['Af', 'Auto-fit', 'discover', '35 eq.', 'Fits every applicable equation from a library of 35 laws across materials, polymers and chemistry, and ranks them by AICc so you see what the data support.', 'Levenberg–Marquardt least squares with several starting points, checked against SciPy.', 'Parameters agree with SciPy to better than 10⁻⁵ on the reference data sets.', ['studio/?example=isotherm', 'Open the isotherm example']],
    ['Sr', 'Equation discovery', 'discover', '6 of 6', 'Symbolic regression that finds a compact formula for your data, including forms that are not in any library. It combines powers, reciprocals, logarithms, exponentials and saturation terms, keeps the Pareto front of accuracy against complexity, and refines the winners.', 'No training data: it searches thousands of candidate equations per data set, ranks them by AICc (relative errors when data span decades) and prefers recognised physical laws unless the data clearly reject them.', 'Recovers quadratic, exponential-decay, power-law, Arrhenius, Langmuir and Hall–Petch laws from noisy data, and rediscovers Flory–Fox from glass-transition data.', ['studio/?example=floryfox&run=symreg', 'Rediscover Flory–Fox']],
    ['Am', 'AutoML', 'predict', '6 models', 'Trains linear, ridge, k-nearest-neighbour, random-forest, gradient-boosting and Gaussian-process models on your table, compares them under cross-validation and predicts new samples. With a formula column it adds composition descriptors such as electronegativity and radius.', 'Learns from your own measurements, in a background thread in your browser. Nothing is uploaded.', 'Picks a nonlinear model on the Friedman benchmark (cross-validated R² 0.93) and a linear one on linear data (R² 0.99).', ['studio/?example=perovskite', 'Predict perovskite band gaps']],
    ['Pi', 'Input importance', 'predict', 'held out', 'Explains a model by measuring how much its held-out error rises when each input is shuffled, and shows partial-dependence curves for the inputs that matter.', 'Computed on cross-validation folds, so it reflects what the model uses on unseen data.', 'Ranks all five informative inputs of the Friedman benchmark above the five pure-noise ones.', ['studio/?example=perovskite', 'See it on an example']],
    ['Cf', 'Conformal intervals', 'predict', '89% @ 90', 'Prediction intervals with measured coverage: every AutoML and property prediction carries a ± range that contains the true value about 9 times in 10.', 'Split-conformal calibration on held-out errors; band-gap intervals are calibrated separately for metals, semiconductors and insulators.', '90% intervals covered 89.3% of 400 new samples in testing; property intervals were calibrated on 9,511 unseen compositions.', ['studio/?discover=gen', 'See intervals on predictions']],
    ['Ef', 'Formation-energy network', 'predict', '0.092 eV', 'Predicts the formation energy of the most stable polymorph from a chemical formula alone.', 'Trained by Lattent on 85,607 compositions from the Materials Project (via Matbench, CC BY 4.0).', 'Mean absolute error 0.092 eV/atom on 9,511 compositions it never saw (R² 0.95).', ['studio/?discover=gen', 'Predict a formula']],
    ['Eg', 'Band-gap network', 'predict', '0.32 eV', 'Predicts the DFT (PBE) band gap from composition, used to screen and steer generated materials.', 'Trained by Lattent on 95,540 Materials Project entries (via Matbench, CC BY 4.0).', 'Mean absolute error 0.32 eV on unseen compositions (R² 0.84). PBE gaps run 30–50% below experiment.', ['studio/?discover=gen', 'Predict a formula']],
    ['Df', 'Diffusion generator', 'generate', '71% new', 'Masked discrete diffusion that writes new chemical formulas inside the elements you choose, steered towards a target band gap and number of elements, the idea MatterGen applies to atom types.', 'Trained by Lattent on 70,252 stable compositions from the Materials Project.', '97% of unconstrained samples are distinct and 71% are absent from the training set. It rediscovers kesterite Cu₂ZnSnS₄ and LiFePO₄.', ['studio/?discover=gen', 'Generate materials']],
    ['Gp', 'Gaussian process', 'generate', 'Q²', 'Learns a smooth model of a property over your inputs, with an uncertainty for every prediction and a relevance for every input.', 'Fitted to your experiments by maximising the marginal likelihood with automatic relevance determination.', 'Leave-one-out Q² is reported every time, so you know when to trust it.', ['studio/?example=discovery', 'Open the blend example']],
    ['Bo', 'Bayesian optimisation', 'generate', 'EI', 'Proposes the next experiments most likely to improve a property, in batches that spread out, respecting mixture constraints such as compositions that sum to 100%.', 'Expected improvement on the Gaussian-process model, chosen one at a time by the kriging-believer strategy.', 'Each suggestion comes with its predicted value and uncertainty; add the results and the model updates.', ['studio/?example=discovery', 'Suggest the next blends']],
    ['Pc', 'PCA and clustering', 'explore', 'k-means', 'Maps a multi-property data set: which samples form families and which properties move together.', 'Principal component analysis and k-means with the number of clusters chosen by silhouette.', 'Eigenvalues agree with NumPy to 10⁻⁸.', ['studio/?example=alloys', 'Explore the alloy data set']],
    ['Cs', 'Co-scientist chat', 'explore', 'your key', 'Claude or GPT reads your project, plans analyses and explains results in plain language. Lattent’s engine computes every number, so nothing is invented.', 'Uses your own API key, called directly from your browser; Lattent never sees your key or your questions.', 'Proposed analyses run only after you approve them.', ['studio/', 'Open Studio']]
  ];
  const AI = {};
  BF.ai = AI;
  AI.tiles = T;
  AI.cats = CATS;

  /* the table of tiles; onPick(index) or a link prefix for the teaser on the home page */
  AI.renderTable = function (host, opts) {
    const o = Object.assign({ link: null, onPick: null, selected: -1 }, opts);
    host.innerHTML = `<div class="ai-legend">${Object.entries(CATS).map(([k, c]) => `<span class="ai-cat" style="--cat:var(--s${c.c})">${esc(c.name)}</span>`).join('')}</div>
      <div class="ai-grid">${T.map((t, i) => {
        const tag = o.link ? 'a' : 'button';
        const attr = o.link ? `href="${o.link}#${t[0].toLowerCase()}"` : `type="button" data-i="${i}" aria-pressed="${i === o.selected}"`;
        return `<${tag} class="ai-tile" ${attr} style="--cat:var(--s${CATS[t[2]].c})"><span class="ai-z">${i + 1}</span><span class="ai-m">${esc(t[3])}</span><b class="ai-s">${esc(t[0])}</b><span class="ai-n">${esc(t[1])}</span></${tag}>`;
      }).join('')}</div>`;
    if (o.onPick) $$('[data-i]', host).forEach(b => b.onclick = () => o.onPick(+b.dataset.i));
  };
  AI.renderDetail = function (host, i) {
    const t = T[i], c = CATS[t[2]];
    const href = /^#/.test(t[7][0]) ? t[7][0] : U.root + t[7][0];
    host.innerHTML = `<article class="ai-detail" style="--cat:var(--s${c.c})" id="detail-${t[0].toLowerCase()}">
      <div class="ai-dh"><span class="ai-big"><span class="ai-z">${i + 1}</span><b>${esc(t[0])}</b></span><div><p class="ai-k">${esc(c.name)}</p><h3>${esc(t[1])}</h3></div></div>
      <p>${esc(t[4])}</p>
      <dl><dt>How it learns</dt><dd>${esc(t[5])}</dd><dt>How well it works</dt><dd>${esc(t[6])}</dd><dt>Where it runs</dt><dd>In your browser. Your data is not uploaded.</dd></dl>
      <a class="btn primary" href="${href}">${esc(t[7][1])} →</a></article>`;
  };

  /* ---------- AI page: table, detail card, live lab ---------- */
  function page() {
    const tableHost = $('#ai-table'), detail = $('#ai-detail');
    if (!tableHost) return;
    const fromHash = () => { const h = location.hash.slice(1).toLowerCase(); const i = T.findIndex(t => t[0].toLowerCase() === h); return i; };
    let sel = fromHash(); if (sel < 0) sel = 4;
    const pick = i => {
      sel = i;
      AI.renderTable(tableHost, { onPick: pick, selected: i });
      AI.renderDetail(detail, i);
      if (window.innerWidth < 900) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    AI.renderTable(tableHost, { onPick: pick, selected: sel });
    AI.renderDetail(detail, sel);
    window.addEventListener('hashchange', () => { const i = fromHash(); if (i >= 0) pick(i); });
    lab();
  }
  /* samples drawn from known laws with realistic noise: Arrhenius (Eₐ = 0.45 eV), Langmuir
     (q_max = 55, K = 0.15) and a single-exponential decay (τ = 6.2 ns) on a background */
  const SAMPLES = {
    arrhenius: 'T (K)\tσ (S/cm)\n298\t3.40e-7\n318\t8.99e-7\n338\t2.27e-6\n358\t5.55e-6\n378\t1.17e-5\n398\t2.35e-5\n418\t4.51e-5\n438\t7.85e-5\n458\t1.38e-4\n478\t2.09e-4',
    isotherm: 'Ce (mg/L)\tqe (mg/g)\n0.5\t3.9\n1\t5.9\n2\t12.6\n4\t20.1\n7\t28.4\n12\t34.9\n20\t41.1\n32\t45.2\n50\t48.3\n80\t50.6',
    decay: 't (ns)\tPL intensity\n0\t995\n2\t725\n4\t530\n6\t405\n8\t305\n10\t223\n14\t146\n18\t97\n24\t58\n30\t37\n40\t30'
  };
  function parse(text) {
    const rows = String(text).trim().split(/\n/).map(l => l.trim().split(/[\t,; ]+/).map(Number)).filter(r => r.length >= 2 && isFinite(r[0]) && isFinite(r[1]));
    return { xs: rows.map(r => r[0]), ys: rows.map(r => r[1]) };
  }
  function lab() {
    const box = $('#ai-lab'); if (!box) return;
    const ta = $('#lab-data', box), out = $('#lab-out', box);
    ta.value = SAMPLES.arrhenius;
    $$('[data-sample]', box).forEach(b => b.onclick = () => { ta.value = SAMPLES[b.dataset.sample]; run(); });
    $$('[data-mode]', box).forEach(b => b.onclick = () => { $$('[data-mode]', box).forEach(x => x.setAttribute('aria-selected', x === b)); run(); });
    $('#lab-run', box).onclick = run;
    function run() {
      const mode = $('[data-mode][aria-selected="true"]', box).dataset.mode;
      const { xs, ys } = parse(ta.value);
      if (xs.length < 6) { out.innerHTML = '<p class="err">Paste at least six X–Y pairs, one per line.</p>'; return; }
      if (mode === 'shape') {
        const r = BF.ml && BF.ml.ready() ? BF.ml.classify(xs, ys) : null;
        if (!r) { out.innerHTML = '<p class="err">The shape model did not load.</p>'; return; }
        out.innerHTML = `<p class="lab-v"><span class="ai-badge">Sh</span> Looks like <b>${esc(r[0].label)}</b>: ${esc(r[0].why)}</p>
          <div class="lab-bars">${r.slice(0, 4).map(q => `<div><span>${esc(q.label)}</span><i style="width:${(100 * q.p).toFixed(1)}%"></i><b>${(100 * q.p).toFixed(1)}%</b></div>`).join('')}</div>
          <p class="hint">${r[0].analysis ? 'Studio would suggest the dedicated analysis for this shape.' : 'Studio would fit ' + (r[0].models || []).length + ' equations for this shape and rank them by AICc.'}</p>`;
      } else {
        const t0 = performance.now(), r = BF.learn.symreg(xs, ys);
        if (r.error) { out.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
        const b = r.best, x0 = Math.min(...xs), x1 = Math.max(...xs);
        out.innerHTML = `<p class="lab-v"><span class="ai-badge">Sr</span> <span class="lab-eq">${esc(b.pretty)}</span></p>
          <p class="lab-meta">${esc(b.law)} · R² ${b.r2.toFixed(4)} · ${r.tried.toLocaleString()} candidate equations in ${Math.round(performance.now() - t0)} ms${b.preferred ? ' · a generic form fits marginally better, but the data do not reject this law' : ''}</p><div class="lab-chart"></div>`;
        const host = $('.lab-chart', out), W = Math.max(300, host.clientWidth || 520);
        host.innerHTML = BF.plot.xy({ x: { label: 'x', zero: false }, y: { label: 'y' }, legend: false, series: [{ name: 'Data', ci: 0, points: xs.map((x, i) => ({ x, y: ys[i] })) }, { name: 'Discovered', ci: 1, points: [], curve: Array.from({ length: 160 }, (_, i) => { const x = x0 + (x1 - x0) * i / 159; return [x, b.f(x)]; }) }] }, BF.plot.screen(), W, Math.round(Math.min(320, W * 0.55))).svg;
      }
    }
    run();
    document.addEventListener('bf:theme', () => run());
  }

  /* ---------- home page teaser ---------- */
  function teaser() {
    const h = $('#ai-teaser'); if (!h) return;
    AI.renderTable(h, { link: U.root + 'ai/' });
  }
  const boot = () => { page(); teaser(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
