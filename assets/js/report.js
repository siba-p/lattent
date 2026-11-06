/* Facet's report writer. Turns the engine's verified results into a complete scientific report:
   abstract, introduction, data, methods with references, results with figures and parameter
   tables, a discussion that interprets every analysis, conclusions, next steps, limitations,
   references and an appendix of settings. Every number comes from the engine; the prose is
   written here by rules, and a language model may redraft the narrative sections when a key
   is present (studio.js marks those passages). Works in the browser and in Node (tests). */
(function (root) {
  'use strict';
  const R = {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const isNum = v => typeof v === 'number' && isFinite(v);
  const nf = (v, s) => { if (!isNum(v)) return v == null ? '' : String(v); const a = Math.abs(v); if (Number.isInteger(v) && a < 1e6) return String(v); if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential((s || 4) - 1).replace(/\.?0+e/, 'e'); return String(Number(v.toPrecision(s || 4))); };
  const pf = p => (!isNum(p) ? '' : p < 0.0001 ? 'p < 0.0001' : 'p = ' + p.toFixed(p < 0.001 ? 4 : 3));
  const dot = s => { s = String(s || '').trim(); return s ? (/[.!?]$/.test(s) ? s : s + '.') : ''; };
  const firstSentence = h => { const t = plain(h); const m = t.match(/^.*?[.!?](?=\s|$)/); return (m ? m[0] : t).trim(); };
  const twoSentences = h => { const t = plain(h); const m = t.match(/^.*?[.!?](?=\s|$)(\s+.*?[.!?](?=\s|$))?/); return (m ? m[0] : t).trim(); };
  const lower1 = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const join = a => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const unitOf = s => ((String(s || '').match(/\(([^)]+)\)\s*$/) || [])[1] || '');
  const sec = (run, re) => (run.sections || []).find(s => re.test(s.title));
  const mname = n => (/isotherm|model|law|equation|kinetic|decay|growth|function|order/i.test(n || '') ? n : n + ' model');
  const noteFor = m => (MODEL_NOTES.find(([re]) => re.test(m.id || '')) || MODEL_NOTES.find(([re]) => re.test(m.name || '')));

  /* ---------- reference library: matched against the methods text ---------- */
  R.REFS = [
    [/Scherrer/i, 'Patterson, A. L. (1939). The Scherrer formula for X-ray particle size determination. Phys. Rev. 56, 978–982.'],
    [/Williamson.Hall/i, 'Williamson, G. K. & Hall, W. H. (1953). X-ray line broadening from filed aluminium and wolfram. Acta Metall. 1, 22–31.'],
    [/Savitzky.Golay/i, 'Savitzky, A. & Golay, M. J. E. (1964). Smoothing and differentiation of data by simplified least squares procedures. Anal. Chem. 36, 1627–1639.'],
    [/pseudo-Voigt/i, 'Thompson, P., Cox, D. E. & Hastings, J. B. (1987). Rietveld refinement of Debye–Scherrer synchrotron X-ray data from Al₂O₃. J. Appl. Cryst. 20, 79–83.'],
    [/Levenberg.Marquardt|nonlinear least squares/i, 'Marquardt, D. W. (1963). An algorithm for least-squares estimation of nonlinear parameters. J. Soc. Ind. Appl. Math. 11, 431–441.'],
    [/AICc|Akaike/i, 'Burnham, K. P. & Anderson, D. R. (2002). Model Selection and Multimodel Inference, 2nd ed. Springer.'],
    [/Tauc/i, 'Makuła, P., Pacia, M. & Macyk, W. (2018). How to correctly determine the band gap energy of modified semiconductor photocatalysts based on UV–Vis spectra. J. Phys. Chem. Lett. 9, 6814–6817.'],
    [/Tukey/i, 'Tukey, J. W. (1949). Comparing individual means in the analysis of variance. Biometrics 5, 99–114.'],
    [/Welch/i, 'Welch, B. L. (1947). The generalization of “Student’s” problem when several different population variances are involved. Biometrika 34, 28–35.'],
    [/Holm/i, 'Holm, S. (1979). A simple sequentially rejective multiple test procedure. Scand. J. Stat. 6, 65–70.'],
    [/Brown.Forsythe/i, 'Brown, M. B. & Forsythe, A. B. (1974). Robust tests for the equality of variances. J. Am. Stat. Assoc. 69, 364–367.'],
    [/Kruskal.Wallis/i, 'Kruskal, W. H. & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. J. Am. Stat. Assoc. 47, 583–621.'],
    [/Mann.Whitney/i, 'Mann, H. B. & Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. Ann. Math. Stat. 18, 50–60.'],
    [/D.Agostino/i, 'D’Agostino, R. B., Belanger, A. & D’Agostino, R. B. Jr (1990). A suggestion for using powerful and informative tests of normality. Am. Stat. 44, 316–321.'],
    [/Grubbs/i, 'Grubbs, F. E. (1969). Procedures for detecting outlying observations in samples. Technometrics 11, 1–21.'],
    [/Gaussian.process|Bayesian optimi[sz]ation|expected improvement/i, 'Rasmussen, C. E. & Williams, C. K. I. (2006). Gaussian Processes for Machine Learning. MIT Press.'],
    [/expected improvement/i, 'Jones, D. R., Schonlau, M. & Welch, W. J. (1998). Efficient global optimization of expensive black-box functions. J. Glob. Optim. 13, 455–492.'],
    [/conformal/i, 'Vovk, V., Gammerman, A. & Shafer, G. (2005). Algorithmic Learning in a Random World. Springer.'],
    [/permutation/i, 'Breiman, L. (2001). Random forests. Mach. Learn. 45, 5–32.'],
    [/principal component/i, 'Jolliffe, I. T. (2002). Principal Component Analysis, 2nd ed. Springer.'],
    [/k-means|silhouette/i, 'Rousseeuw, P. J. (1987). Silhouettes: a graphical aid to the interpretation and validation of cluster analysis. J. Comput. Appl. Math. 20, 53–65.'],
    [/symbolic regression|sparse/i, 'Brunton, S. L., Proctor, J. L. & Kutz, J. N. (2016). Discovering governing equations from data by sparse identification of nonlinear dynamical systems. Proc. Natl Acad. Sci. USA 113, 3932–3937.'],
    [/offset method|Young.s modulus/i, 'ASTM E8/E8M-22 (2022). Standard Test Methods for Tension Testing of Metallic Materials. ASTM International.'],
    [/Langmuir/i, 'Langmuir, I. (1918). The adsorption of gases on plane surfaces of glass, mica and platinum. J. Am. Chem. Soc. 40, 1361–1403.'],
    [/Freundlich/i, 'Freundlich, H. (1907). Über die Adsorption in Lösungen. Z. Phys. Chem. 57, 385–470.'],
    [/Sips/i, 'Sips, R. (1948). On the structure of a catalyst surface. J. Chem. Phys. 16, 490–495.'],
    [/Arrhenius/i, 'Laidler, K. J. (1984). The development of the Arrhenius equation. J. Chem. Educ. 61, 494–498.'],
    [/Avrami/i, 'Avrami, M. (1939). Kinetics of phase change. I. General theory. J. Chem. Phys. 7, 1103–1112.'],
    [/VFT|Vogel/i, 'Angell, C. A. (1995). Formation of glasses from liquids and biopolymers. Science 267, 1924–1935.'],
    [/Tafel/i, 'Bard, A. J. & Faulkner, L. R. (2001). Electrochemical Methods: Fundamentals and Applications, 2nd ed. Wiley.'],
    [/Flory.Fox/i, 'Fox, T. G. & Flory, P. J. (1950). Second-order transition temperatures and related properties of polystyrene. J. Appl. Phys. 21, 581–591.'],
    [/Hall.Petch/i, 'Hall, E. O. (1951). The deformation and ageing of mild steel: III. Proc. Phys. Soc. B 64, 747–753.'],
    [/Michaelis/i, 'Johnson, K. A. & Goody, R. S. (2011). The original Michaelis constant: translation of the 1913 Michaelis–Menten paper. Biochemistry 50, 8264–8269.'],
    [/dose.response|logistic|Hill/i, 'Motulsky, H. & Christopoulos, A. (2004). Fitting Models to Biological Data Using Linear and Nonlinear Regression. Oxford University Press.'],
    [/pseudo-second|pseudo-first/i, 'Ho, Y. S. & McKay, G. (1999). Pseudo-second order model for sorption processes. Process Biochem. 34, 451–465.'],
    [/Williamson|Scherrer|diffraction|2θ/i, 'Cullity, B. D. & Stock, S. R. (2014). Elements of X-Ray Diffraction, 3rd ed. Pearson.'],
  ];

  /* ---------- what each analysis set out to do (introduction) ---------- */
  const AIM = {
    nlfit: r => `fit the ${r.res.model.name.toLowerCase()} model to ${r.t.name} and obtain its parameters with confidence intervals`,
    autofit: r => `find which of ${r.res.list ? r.res.list.length : 'the candidate'} equations best describes ${r.t.name}`,
    linreg: r => `quantify the linear relationship in ${r.t.name}${r.res.cmp ? ' and test whether the slopes differ between data sets' : ''}`,
    peaks: r => (r.res.xr ? `resolve the diffraction peaks of ${r.t.name} and estimate the crystallite size and microstrain` : `resolve and quantify the peaks in ${r.t.name}`),
    tauc: r => `determine the optical band gap of ${r.t.name} from a Tauc plot`,
    tensile: r => `extract the modulus, yield strength, tensile strength and elongation from the ${r.t.name} test`,
    auc: r => `integrate the area under the curves in ${r.t.name}`,
    smooth: r => `smooth and differentiate ${r.t.name}`,
    describe: r => `summarise each group in ${r.t.name} and check normality and outliers`,
    ttest: r => `test whether ${r.res.a.name} and ${r.res.b.name} differ`,
    anova: r => `test whether the groups in ${r.t.name} differ and which pairs account for the difference`,
    corr: r => `map the pairwise correlations among the ${r.res.names.length} variables of ${r.t.name}`,
    mlr: r => `model ${r.res.y} in ${r.t.name} as a linear function of the other variables`,
    pca: r => `reduce the ${r.res.r.names.length} variables of ${r.t.name} to their principal components and see how the samples group`,
    kmeans: r => `find families of similar samples in ${r.t.name}`,
    bo: r => `learn how the inputs in ${r.t.name} drive ${r.res.names[r.res.names.length - 1]} and propose the most informative next experiments`,
    symreg: r => `discover an equation that describes ${r.t.name}`,
    automl: r => `train a predictive model for ${r.res.yname} from ${r.t.name} and rank the inputs by importance`,
  };

  /* ---------- figure legends ---------- */
  const LEGEND = {
    peaks: r => `${r.res.xr ? 'Diffraction pattern' : 'Signal'} of ${r.t.name}: measured data (points), fitted ${({ gauss: 'Gaussian', lorentz: 'Lorentzian', pv: 'pseudo-Voigt' })[r.opts.shape] || ''} profiles (line) and the fitted baseline (dashed). Vertical markers show the fitted peak centres.`,
    nlfit: r => `${r.t.name}: data (points) with the fitted ${r.res.model.name.toLowerCase()} model (line) and its 95% confidence band.`,
    autofit: r => `${r.t.name}: data with the best-ranked model, ${r.res.list && r.res.list[0] ? 'the ' + r.res.list[0].model.name.toLowerCase() : ''} (line).`,
    linreg: r => `${r.t.name}: data with fitted straight lines and 95% confidence bands.`,
    tauc: r => `Tauc plot of ${r.t.name}: (αhν)ⁿ against photon energy, the linear region used (highlighted) and its extrapolation to the band gap.`,
    tensile: r => `Stress–strain curve of ${r.t.name} with the modulus line and the ${r.opts.offset}% offset construction for the yield strength.`,
    describe: r => `${r.t.name}: individual values with mean ± ${({ sem: 'SEM', ci: '95% CI' })[r.opts.err] || 'SD'} for each group.`,
    ttest: r => `${r.t.name}: individual values with mean ± SD for the two groups.`,
    automl: r => `Predicted versus measured ${r.res.yname} under cross-validation, with ${Math.round(100 * r.res.level)}% prediction intervals; the diagonal marks perfect prediction.`,
    pca: r => `Scores of the ${r.t.name} samples on the first two principal components.`,
    kmeans: r => `${r.t.name} samples in principal-component space, coloured by cluster (k = ${r.res.best.k || (r.res.best.sizes || []).length}).`,
    bo: r => `Gaussian-process model of ${r.res.names[r.res.names.length - 1]}: measured versus predicted values and the proposed experiments.`,
    corr: r => `Correlation matrix of ${r.t.name}.`,
    mlr: r => `Predicted versus observed ${r.res.y} from the multiple linear regression.`,
    smooth: r => `${r.t.name}: smoothed signal and its derivative.`,
    auc: r => `${r.t.name}: curves with the integrated area shaded.`,
  };

  /* ---------- interpretation (discussion) ---------- */
  const MODEL_NOTES = [
    [/arrhenius/i, 'A single straight line in Arrhenius coordinates implies one rate-limiting process over the temperature range measured; a change of slope would indicate a change of mechanism.'],
    [/langmuir/i, 'Langmuir behaviour implies monolayer coverage of energetically equivalent sites; the plateau parameter is the monolayer capacity and the affinity constant reflects the strength of binding.'],
    [/freundlich/i, 'The Freundlich isotherm is empirical and describes heterogeneous surfaces; it has no saturation limit, so extrapolation to high concentration is unsafe.'],
    [/sips/i, 'The Sips isotherm combines Langmuir saturation with a heterogeneity exponent; an exponent near 1 reduces it to the Langmuir form.'],
    [/dr4|logistic|dose/i, 'The half-maximal concentration is the mid-point of the sigmoid and the Hill slope its steepness; slopes far from 1 can indicate cooperativity or a mixed population.'],
    [/expdecay|exponential/i, 'The characteristic time or lifetime is the reciprocal of the rate constant; a poor fit by a single exponential often means more than one process is present.'],
    [/vft/i, 'Vogel–Fulcher–Tammann behaviour is the signature of a glass-forming system; the Vogel temperature lies below the glass transition.'],
    [/pso|pseudo-second/i, 'A pseudo-second-order fit is consistent with rate control by the availability of surface sites, although fit quality alone does not prove the mechanism.'],
    [/avrami/i, 'The Avrami exponent reflects the nucleation and growth geometry: values near 1 suggest one-dimensional growth or site-saturated nucleation, values near 3 to 4 three-dimensional growth.'],
    [/tafel/i, 'The Tafel slope characterises the rate-determining electron-transfer step; values near 120 mV per decade indicate a first electron transfer limits the rate.'],
    [/floryfox/i, 'The Flory–Fox relation gives the infinite-molecular-weight limit of the property and the chain-end contribution.'],
    [/hallpetch/i, 'A Hall–Petch slope quantifies grain-boundary strengthening; the intercept is the friction stress of a single crystal.'],
    [/curieweiss/i, 'The Curie–Weiss temperature indicates the sign and strength of the magnetic interactions; its departure from zero measures the exchange coupling.'],
    [/mm|michaelis/i, 'The Michaelis constant is the substrate concentration at half-maximal rate and reflects the affinity of the enzyme for its substrate.'],
    [/confine/i, 'Quantum-confinement models link the optical gap to particle size; the fitted radius should be compared with microscopy.'],
    [/markhouwink/i, 'The Mark–Houwink exponent indicates chain conformation: about 0.5 for a theta solvent, up to about 0.8 for a good solvent.'],
  ];
  const INTERPRET = {
    nlfit(r) {
      const res = r.res, m = res.model, ok = res.fits.filter(f => !f.r.error); if (!ok.length) return '';
      const out = ok.map(f => {
        const fit = f.r.fit;
        const q = fit.r2 >= 0.99 ? 'describes the data closely' : fit.r2 >= 0.95 ? 'describes the data well' : fit.r2 >= 0.9 ? 'captures the main trend but leaves structure in the residuals' : 'leaves much of the variation unexplained';
        const wide = m.params.filter((p, j) => !fit.fixed[j] && isNum(fit.ci[j][0]) && Math.abs(fit.ci[j][1] - fit.ci[j][0]) / 2 > 0.5 * Math.abs(fit.p[j]));
        let s = `For ${f.s.name}, the ${mname(m.name)} ${q} (R² = ${fit.r2.toFixed(3)}).`;
        if (wide.length) s += ` ${join(wide)} ${wide.length > 1 ? 'are' : 'is'} poorly determined (the 95% interval spans more than half the estimate), so more points, a wider range or a simpler model would tighten ${wide.length > 1 ? 'them' : 'it'}.`;
        if (f.r.derived && f.r.derived.length) s += ` The derived ${join(f.r.derived.map(x => `${x.name} = ${nf(x.value)} ± ${nf(x.se, 2)}`))} ${f.r.derived.length > 1 ? 'carry' : 'carries'} the uncertainty propagated from the fitted parameters.`;
        if (f.r.warn && f.r.warn.length) s += ' ' + f.r.warn.map(dot).join(' ');
        return s;
      });
      const note = noteFor(m); if (note) out.push(note[1]);
      if (ok.length > 1) { const j = 0; const vals = ok.map(f => f.r.fit.p[j]); const spread = Math.max(...vals) - Math.min(...vals); const ses = ok.map(f => f.r.fit.se[j]).filter(isNum); if (ses.length && spread > 3 * Math.max(...ses)) out.push(`${m.params[j]} differs between the data sets by more than three standard errors, so the sets are not interchangeable.`); }
      return out.join(' ');
    },
    autofit(r) {
      const l = r.res.list; if (!l || !l.length) return ''; const b = l[0], s2 = l[1], n2 = l.filter(x => x.dAICc < 2).length;
      let s = `Among ${l.length} candidate equations, the ${mname(b.model.name)} is best supported (Akaike weight ${(100 * b.weight).toFixed(0)}%, R² = ${b.fit.r2.toFixed(3)}).`;
      if (s2) s += s2.dAICc < 2 ? ` The ${mname(s2.model.name)} is within 2 AICc units (ΔAICc = ${s2.dAICc.toFixed(1)}), so the data cannot separate the two; report both, or measure where their predictions diverge.` : s2.dAICc < 7 ? ` The ${mname(s2.model.name)} retains some support (ΔAICc = ${s2.dAICc.toFixed(1)}) and should not be dismissed without further data.` : ` The next candidate, the ${mname(s2.model.name)}, is ${s2.dAICc.toFixed(1)} AICc units behind and has essentially no support.`;
      if (n2 > 2) s += ` In all, ${n2} models fall within 2 AICc units of the best.`;
      s += ' AICc rewards closeness to the data while penalising extra parameters, so the ranking reflects parsimony; it does not by itself establish a mechanism.';
      const note = noteFor(b.model); if (note) s += ' ' + note[1];
      return s;
    },
    linreg(r) {
      const ok = r.res.fits.filter(f => f.f); if (!ok.length) return '';
      const parts = ok.map(f => { const sl = f.f.p[1], ci = f.f.ci[1], crosses = ci[0] < 0 && ci[1] > 0; return `${f.s.name} ${crosses ? 'shows no significant linear trend (the slope interval includes zero)' : `${sl > 0 ? 'increases' : 'decreases'} linearly, with ${f.f.r2 >= 0.95 ? 'very little' : f.f.r2 >= 0.8 ? 'moderate' : 'considerable'} scatter about the line (R² = ${f.f.r2.toFixed(3)})`}`; });
      let s = dot(join(parts));
      if (r.res.cmp) s += r.res.cmp.p < 0.05 ? ` The slopes differ significantly (${pf(r.res.cmp.p)}), so one common line does not describe all data sets.` : ` A single common slope is consistent with all data sets (${pf(r.res.cmp.p)}).`;
      return s;
    },
    peaks(r) {
      const res = r.res, pk = res.pf.peaks || [], n = pk.length, u = unitOf(r.t.cols && r.t.cols[0]);
      let s = `${n} peak${n === 1 ? ' was' : 's were'} resolved with a profile fit of R² = ${res.pf.r2.toFixed(3)}${res.pf.r2 < 0.98 ? ', which leaves systematic residuals: a different baseline order, profile shape or prominence threshold may improve it' : ''}.`;
      if (n) { const top = pk.reduce((a, b) => (b.height > a.height ? b : a)); s += ` The strongest peak lies at ${nf(top.center, 4)}${u ? ' ' + u : ''}${isNum(top.fwhm) ? ` with a full width at half maximum of ${nf(top.fwhm, 3)}${u ? ' ' + u : ''}` : ''}.`; }
      if (res.xr) {
        const sz = res.xr.meanSize, wh = res.xr.wh;
        if (isNum(sz)) s += ` The mean Scherrer size of ${nf(sz, 3)} nm indicates ${sz < 5 ? 'very small' : sz < 20 ? 'nanocrystalline' : sz < 100 ? 'sub-micron' : 'large'} crystallites${sz > 100 ? '; above about 100 nm the estimate is dominated by instrumental broadening and is unreliable' : ''}.`;
        if (wh && isNum(wh.size) && isNum(sz) && sz > 0) { const ratio = wh.size / sz; s += ` The Williamson–Hall size of ${nf(wh.size, 3)} nm with a microstrain of ${nf(wh.strain * 100, 2)}% ${ratio > 1.2 ? 'exceeds the Scherrer value, as expected when strain contributes to the broadening: the Scherrer equation attributes all broadening to size and therefore underestimates it' : ratio < 0.8 ? 'is below the Scherrer value, which suggests the strain term is poorly constrained; check the linearity of the Williamson–Hall plot' : 'agrees with the Scherrer value, so strain broadening is minor'}.`; }
        const sizes = (res.xr.rows || []).map(x => x.size).filter(isNum);
        if (sizes.length > 2) { const mn = Math.min(...sizes), mx = Math.max(...sizes); if (mx / mn > 2) s += ` Sizes from individual reflections range from ${nf(mn, 3)} to ${nf(mx, 3)} nm, a spread that can indicate anisotropic crystallites or overlapping peaks.`; }
      }
      return s;
    },
    tauc(r) {
      const q = r.res.r, o = r.opts, w = 1239.84 / q.Eg;
      let s = `The ${String(o.transition || 'direct').replace('-', ' ')} band gap of ${q.Eg.toFixed(2)} eV (95% CI ${q.ci[0].toFixed(2)}–${q.ci[1].toFixed(2)} eV) places the absorption edge near ${w.toFixed(0)} nm, in the ${w < 400 ? 'ultraviolet' : w < 700 ? 'visible' : 'near-infrared'}.`;
      s += isNum(q.r2) && q.r2 < 0.99 ? ` The linear region has R² = ${q.r2.toFixed(3)}; setting it by hand around the steepest part of the edge may sharpen the estimate.` : ' The linear region is well defined.';
      s += ' The Tauc construction assumes a parabolic band edge and negligible sub-gap absorption, and the value depends on the transition exponent chosen, which should be stated alongside the result.';
      return s;
    },
    tensile(r) {
      const q = r.res.r, u = unitOf(r.res.d && r.res.d.ylabel), el = q.pct ? q.elong * 100 : q.elong;
      let s = `With an elongation at break of ${nf(el, 3)}${q.pct ? '%' : ''}, the specimen is ${el < 2 ? 'brittle' : el < 10 ? 'of limited ductility' : 'ductile'}.`;
      if (isNum(q.uts) && isNum(q.yieldS) && q.yieldS > 0) { const ratio = q.uts / q.yieldS; s += ` The ratio of tensile to yield strength, ${ratio.toFixed(2)}, indicates ${ratio < 1.1 ? 'little strain hardening after yield' : ratio < 1.4 ? 'moderate strain hardening' : 'pronounced strain hardening'}.`; }
      if (isNum(q.E)) s += ` The modulus of ${nf(q.E, 3)}${u ? ' ' + u : ''} was taken from the steepest linear part of the loading curve; compliance of the test frame, if not corrected, lowers this value.`;
      return s;
    },
    describe(r) {
      const ds = r.res.ds || []; if (!ds.length) return '';
      const cv = ds.map(x => `${x.name} (CV ${x.d.cv.toFixed(1)}%)`);
      const nn = ds.filter(x => x.n && !x.n.error && x.n.p < 0.05).map(x => x.name), out = ds.filter(x => x.gr && x.gr.outlier).map(x => `${x.name} (${nf(x.gr.value)})`);
      let s = `Relative scatter is ${join(cv)}.`;
      s += nn.length ? ` ${join(nn)} depart${nn.length > 1 ? '' : 's'} from normality (p < 0.05), so rank-based comparisons are safer for ${nn.length > 1 ? 'these groups' : 'this group'}.` : ' No group departs significantly from normality.';
      s += out.length ? ` Grubbs’ test flags a possible outlier in ${join(out)}; it should be kept unless a recording or procedural error is documented.` : ' No outliers were flagged.';
      return s;
    },
    ttest(r) {
      const q = r.res.r, o = r.opts, a = r.res.a.name, b = r.res.b.name;
      if (o.test === 'mw') return `The medians of ${a} and ${b} ${q.p < 0.05 ? 'differ' : 'do not differ'} significantly by the Mann–Whitney test (${pf(q.p)}); as a rank test it makes no assumption about the distribution.`;
      const sig = q.p < 0.05;
      let s = `${a} and ${b} ${sig ? 'differ' : 'do not differ'} significantly (${pf(q.p)}): the mean difference of ${nf(q.diff)} has a 95% interval from ${nf(q.lo)} to ${nf(q.hi)}${sig ? '' : ', which includes zero'}.`;
      s += sig ? ' Whether a difference of this size matters is a scientific judgement, not a statistical one.' : ' A non-significant result is not evidence of equivalence; the interval shows how large a difference the data cannot rule out.';
      return s;
    },
    anova(r) {
      const q = r.res.r, o = r.opts, p = o.test === 'welch' ? q.welch.p : o.test === 'kw' ? q.kw.p : q.p, pk = o.post === 'tukey' ? 'pTukey' : 'pHolm';
      const pairs = q.pairs || [], sig = pairs.filter(x => x[pk] < 0.05), ns = pairs.length - sig.length;
      let s = p < 0.05 ? `The groups differ overall (${pf(p)}).` : `There is no overall difference between the groups (${pf(p)}).`;
      if (sig.length) s += ` ${sig.length} of ${pairs.length} pairwise comparisons ${sig.length === 1 ? 'is' : 'are'} significant after correction for multiple comparisons${ns ? `; the remaining ${ns} ${ns === 1 ? 'pair is' : 'pairs are'} not distinguishable with this sample size` : ''}.`;
      else if (p < 0.05) s += ' No single pair reaches significance after correction, which can happen when the overall effect is spread across several small differences.';
      if (q.bf && isNum(q.bf.p)) s += q.bf.p < 0.05 ? ` The Brown–Forsythe test indicates unequal variances (${pf(q.bf.p)}); Welch’s ANOVA is the safer choice.` : ' Variances are homogeneous by the Brown–Forsythe test.';
      return s;
    },
    corr(r) {
      const m = r.res.m, names = r.res.names; if (!m || !names) return '';
      const val = (i, j) => { const v = m[i] && m[i][j]; return isNum(v) ? v : v && isNum(v.r) ? v.r : NaN; };
      const pairs = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const v = val(i, j); if (isNum(v)) pairs.push({ a: names[i], b: names[j], r: v }); }
      if (!pairs.length) return '';
      pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
      const top = pairs.slice(0, 3).map(x => `${x.a} and ${x.b} (r = ${x.r.toFixed(2)})`);
      return `The strongest correlations are between ${join(top)}. Correlation measures linear association only and does not establish cause; strongly correlated inputs also make regression coefficients unstable.`;
    },
    mlr(r) {
      const q = r.res.r; if (!q) return '';
      const sig = (q.coefs || []).filter(c => isNum(c.p) && c.p < 0.05 && !/intercept|const/i.test(c.name || '')).map(c => c.name);
      let s = `The model explains ${(100 * (isNum(q.adj) ? q.adj : q.r)).toFixed(0)}% of the variation in ${r.res.y} (adjusted R²)${isNum(q.pF) ? `, ${q.pF < 0.05 ? 'significantly better than the mean alone' : 'not significantly better than the mean alone'} (${pf(q.pF)})` : ''}.`;
      s += sig.length ? ` ${join(sig)} ${sig.length > 1 ? 'have' : 'has'} coefficients that differ significantly from zero.` : ' No individual coefficient differs significantly from zero.';
      s += ` With ${q.n} samples and ${(q.coefs || []).length - 1} predictors, the fit should be read as descriptive unless validated on new data.`;
      return s;
    },
    pca(r) {
      const q = r.res.r, e = q.explained || [], two = 100 * ((e[0] || 0) + (e[1] || 0));
      let s = `The first two components carry ${two.toFixed(0)}% of the variance, ${two >= 80 ? 'so the scores plot is a faithful two-dimensional picture of the samples' : two >= 60 ? 'so the scores plot captures most but not all of the structure' : 'so the two-dimensional scores plot omits a substantial part of the structure'}.`;
      if (isNum(q.kaiser)) s += ` ${q.kaiser} component${q.kaiser === 1 ? ' has' : 's have'} an eigenvalue above 1, suggesting ${q.kaiser} underlying dimension${q.kaiser === 1 ? '' : 's'} by the Kaiser criterion.`;
      s += ' Loadings show which measured variables move together; samples that lie apart along a component differ in those variables.';
      return s;
    },
    kmeans(r) {
      const b = r.res.best; if (!b) return '';
      const sil = b.silhouette;
      let s = `${b.k || (b.sizes || []).length} clusters ${r.opts.k === 'auto' ? 'gave the highest silhouette score' : 'were requested'}; the silhouette of ${nf(sil, 2)} indicates ${sil > 0.7 ? 'a strong, well-separated structure' : sil > 0.5 ? 'a reasonable structure' : sil > 0.25 ? 'a weak structure that may be artificial' : 'no substantial clustering'}.`;
      s += ' k-means assumes compact, similarly sized clusters; sample membership near the boundaries is uncertain and should be confirmed with an independent variable.';
      return s;
    },
    bo(r) {
      const g = r.res.s.gp, names = r.res.names.slice(0, -1), picks = r.res.s.picks || [];
      let s = `The surrogate model’s leave-one-out Q² of ${g.q2.toFixed(2)} means it ${g.q2 >= 0.7 ? 'predicts held-out samples well' : g.q2 >= 0.4 ? 'predicts held-out samples only moderately, so suggestions are exploratory' : 'predicts held-out samples poorly, so the suggestions mainly explore unmeasured regions'}.`;
      const rel = names.map((n, j) => [n, g.relevance[j]]).sort((a, b) => b[1] - a[1]);
      if (rel.length) s += ` ${rel[0][0]} has the largest influence (${(100 * rel[0][1]).toFixed(0)}%)${rel[1] ? `, followed by ${rel[1][0]} (${(100 * rel[1][1]).toFixed(0)}%)` : ''}.`;
      if (picks.length) s += ` The ${picks.length} proposed experiment${picks.length > 1 ? 's balance' : ' balances'} expected improvement against uncertainty; measuring ${picks.length > 1 ? 'them' : 'it'} and re-running the model is the fastest way to converge.`;
      return s;
    },
    symreg(r) {
      const b = r.res.r && r.res.r.best; if (!b) return '';
      let s = `The discovered equation, ${b.pretty}, ${b.law && !/generic/i.test(b.law) ? `matches the ${b.law.toLowerCase()}` : 'is a generic form not in the library'} and reproduces the data with R² = ${b.r2.toFixed(3)}.`;
      s += b.preferred ? ' A generic equation fitted slightly better than the recognised law, so the physical form was preferred for interpretability; check that its assumptions hold.' : ' An equation found by search describes the data within its range and should be tested on new measurements before it is treated as a law.';
      return s;
    },
    automl(r) {
      const b = r.res.best; if (!b) return '';
      const imp = (r.res.importance || []).slice(0, 3).map(q => q.name);
      let s = `The best model, ${b.name.toLowerCase()}, reaches a cross-validated R² of ${b.r2.toFixed(2)}${isNum(b.mae) ? ` with a mean absolute error of ${nf(b.mae, 3)}` : ''}, so it ${b.r2 >= 0.8 ? 'predicts held-out samples well' : b.r2 >= 0.5 ? 'captures the main trends but leaves useful variation unexplained' : 'predicts held-out samples poorly'}.`;
      if (imp.length) s += ` Permutation importance ranks ${join(imp)} as the inputs that matter most; importance measures dependence, not causation.`;
      if (isNum(r.res.n) && r.res.n < 20) s += ` With only ${r.res.n} samples the cross-validated score is itself uncertain.`;
      const ex = (r.res.preds || []).filter(q => q.extrapolating).length; if (ex) s += ` ${ex} prediction${ex > 1 ? 's lie' : ' lies'} outside the training range and should be treated with caution.`;
      return s;
    },
  };
  INTERPRET.auc = function (r) {
    const l = r.res.list || []; if (!l.length) return '';
    const parts = l.map(x => `${x.s.name} has a total area of ${nf(x.r.total, 4)}${x.r.negative < 0 && Math.abs(x.r.negative) > 0.05 * Math.abs(x.r.total) ? `, of which ${nf(Math.abs(x.r.negative), 3)} lies below the baseline` : ''}, peaking at ${nf(x.r.peakX, 4)}`);
    return `${join(parts)}. The area depends on the baseline chosen${r.opts && r.opts.base === 'line' ? ' (here the line through the first and last points)' : r.opts && r.opts.base === 'min' ? ' (here the minimum value)' : ' (here zero)'}, so the same convention must be used when areas are compared, and the trapezoidal rule underestimates sharp peaks that are sampled coarsely.`;
  };
  INTERPRET.smooth = function (r) {
    const d = +(r.opts && r.opts.deriv) || 0, half = +(r.opts && r.opts.half) || 5;
    return `${d ? `The ${d === 1 ? 'first' : 'second'} derivative amplifies noise, so the window (${2 * half + 1} points) sets a compromise between noise and resolution` : `A ${2 * half + 1}-point window smooths features narrower than about half the window`}; features of that width or less should be interpreted with caution, and the smoothed values should not be used for quantitative fitting, which belongs on the raw data.`;
  };
  R.interpret = function (run) { try { const f = INTERPRET[run.kind]; return f ? f(run) : ''; } catch (e) { return ''; } };
  R.aim = function (run) { try { const f = AIM[run.kind]; return f ? f(run) : `analyse ${run.t.name} with ${lower1(run.label)}`; } catch (e) { return `analyse ${run.t.name}`; } };
  R.legend = function (run) { const s = sec(run, /legend/i); if (s) return plain(s.html); try { const f = LEGEND[run.kind]; return f ? f(run) : `${run.label} of ${run.t.name}.`; } catch (e) { return `${run.label} of ${run.t.name}.`; } };
  /* one sentence per analysis for the abstract and the conclusions */
  R.finding = function (run) {
    const s = sec(run, /result/i); if (s) return dot(twoSentences(s.html));
    try {
      const res = run.res;
      if (run.kind === 'pca') return `PC1 and PC2 explain ${(100 * (res.r.explained[0] + (res.r.explained[1] || 0))).toFixed(0)}% of the variance in ${run.t.name}.`;
      if (run.kind === 'kmeans') return `${run.t.name} separates into ${res.best.k || (res.best.sizes || []).length} clusters (silhouette ${nf(res.best.silhouette, 2)}).`;
      if (run.kind === 'mlr') return `A linear model explains ${(100 * (isNum(res.r.adj) ? res.r.adj : res.r.r)).toFixed(0)}% of ${res.y} (adjusted R²).`;
      if (run.kind === 'corr') { const t = INTERPRET.corr(run); return t ? firstSentence(t) : ''; }
    } catch (e) { /* no finding */ }
    return '';
  };

  /* ---------- tables of numbers from the analysis CSV ---------- */
  R.table = function (rows, max) {
    if (!rows || rows.length < 2) return '';
    const head = rows[0], body = rows.slice(1, 1 + (max || 40)), more = rows.length - 1 - body.length;
    const cols = Math.min(head.length, 10);
    const cell = (v, i) => `<td${isNum(v) || (typeof v === 'string' && /^-?[\d.]+(e[-+]?\d+)?$/i.test(v)) ? ' class="n"' : ''}>${esc(isNum(v) ? nf(v) : v)}</td>`;
    return `<table><thead><tr>${head.slice(0, cols).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.slice(0, cols).map(cell).join('')}</tr>`).join('')}</tbody></table>${more > 0 ? `<p class="meta">${more} more row${more === 1 ? '' : 's'} in the CSV export.</p>` : ''}${head.length > cols ? `<p class="meta">${head.length - cols} further column${head.length - cols === 1 ? '' : 's'} in the CSV export.</p>` : ''}`;
  };
  const settings = o => Object.entries(o || {}).filter(([k, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ');

  /* ---------- the report ---------- */
  const CSS = `*{box-sizing:border-box}body{font:15px/1.65 Georgia,'Times New Roman',serif;color:#14182e;max-width:840px;margin:0 auto;padding:44px 32px 72px;background:#fff}h1,h2,h3,h4,.k,table,figcaption,.meta,.toc,.ai small,.foot{font-family:system-ui,-apple-system,'Segoe UI',Inter,sans-serif}h1{font-size:31px;line-height:1.15;margin:0 0 8px;letter-spacing:-.02em}h2{font-size:20px;margin:40px 0 10px;padding-bottom:6px;border-bottom:2px solid #e0712c}h3{font-size:16.5px;margin:26px 0 6px}h4{font-size:13px;margin:16px 0 4px;color:#3a4160;text-transform:uppercase;letter-spacing:.06em}p{margin:0 0 12px}.meta{color:#656d8c;font-size:13px;margin:0 0 6px}.k{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#a5501a;font-weight:600;margin:0 0 6px}.abstract{background:#f6f7fb;border-left:3px solid #e0712c;padding:14px 18px;margin:18px 0 8px}.abstract p:last-child{margin:0}.toc{columns:2;font-size:13.5px;color:#3a4160;margin:0 0 8px;padding-left:18px}.toc li{margin:2px 0}figure{margin:14px 0 18px;page-break-inside:avoid}figure svg{max-width:100%;height:auto;display:block;border:1px solid #e9ebf3;border-radius:6px}figcaption{font-size:13px;color:#3a4160;margin-top:6px;line-height:1.5}table{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0 14px;page-break-inside:avoid}th,td{border-bottom:1px solid #e2e5ef;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f6f7fb;font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ai{background:#f3f0ff;border-left:3px solid #5a3fc6;padding:10px 14px;margin:8px 0 12px}.ai small{display:block;color:#5a3fc6;font-size:11.5px;font-weight:600;margin-bottom:4px}.chk li{margin:4px 0}.note{background:#fff6ec;border-left:3px solid #e0712c;padding:8px 12px;margin:8px 0;font-size:14px}ul,ol{padding-left:22px}li{margin:4px 0}.refs{font-size:13.5px}.refs li{margin:5px 0}.foot{font-size:12.5px;color:#656d8c;margin-top:40px;padding-top:12px;border-top:1px solid #e2e5ef}@media print{body{padding:0;max-width:none}h2{page-break-after:avoid}}`;
  const para = t => String(t || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join('');
  const bullets = t => { const items = String(t || '').split(/\n/).map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean); return items.length ? `<ul>${items.map(x => `<li>${esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}</ul>` : ''; };
  const aiBox = (model, html) => `<div class="ai"><small>Drafted by ${esc(model)} from the verified results; check before use</small>${html}</div>`;

  /* d = { title, author, date, site, version, tables: [{ name, type, typeTitle, nRows, cols, ylabel, runs: [{ kind, label, opts, res, svg, fig, sections, csv, error }] }],
          checks: [{ sev, where, msg }], next: [], ai: { abstract, intro, discussion, conclusions, model }, figReviews: [{ name, url, text }] } */
  R.build = function (d) {
    const runs = []; d.tables.forEach(t => (t.runs || []).forEach(r => { r.t = t; runs.push(r); }));
    const good = runs.filter(r => !r.error && r.res);
    const refs = [], cite = text => { const ids = []; R.REFS.forEach(ref => { if (ref[0].test(text)) { let i = refs.indexOf(ref); if (i < 0) { refs.push(ref); i = refs.length - 1; } ids.push(i + 1); } }); return ids; };
    const refMark = ids => (ids.length ? ` <span class="cite">[${ids.join(', ')}]</span>` : '');
    const findings = good.map(r => R.finding(r)).filter(Boolean);
    const aims = good.map(r => R.aim(r)).filter(Boolean);
    const nRows = d.tables.reduce((n, t) => n + (t.nRows || 0), 0);
    const kinds = {}; good.forEach(r => { kinds[r.kind] = kinds[r.kind] || { label: r.label, tables: [], methods: sec(r, /method/i) }; kinds[r.kind].tables.push(r.t.name); });
    /* --- narrative sections (templates; a model may replace the prose) --- */
    const abstract = `This report presents the analysis of ${d.tables.length} data table${d.tables.length === 1 ? '' : 's'} (${nRows} rows) with ${good.length} analys${good.length === 1 ? 'is' : 'es'}. ${findings.join(' ')}${d.checks.length ? ` ${d.checks.length} point${d.checks.length === 1 ? '' : 's'} ${d.checks.length === 1 ? 'was' : 'were'} flagged for review by the automated checks.` : ' The automated checks found no problems with units, sample sizes, fit quality, model choice or test assumptions.'}`;
    const intro = `${d.tables.length === 1 ? `The data set “${d.tables[0].name}”` : `${d.tables.length} data sets (${join(d.tables.map(t => '“' + t.name + '”'))})`} ${d.tables.length === 1 ? 'was' : 'were'} analysed in Lattent Studio. The aim was to ${aims.length ? join(aims) : 'summarise the data'}. Each analysis was run with the validated engine; the results, figures and parameter tables below are reported with their uncertainties, and the discussion interprets them and states their limitations.`;
    const interpretations = good.map(r => ({ r, text: R.interpret(r) })).filter(x => x.text);
    const discussion = interpretations.map(x => `<h3>${esc(x.r.label)}: ${esc(x.r.t.name)}</h3><p>${esc(x.text)}</p>`).join('') || '<p>No analyses were completed, so there is nothing to interpret.</p>';
    const conclusions = findings.length ? `<ul>${findings.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>No analyses could be completed.</p>';
    const limits = [
      'Fitted equations describe the data within the range measured; they are not evidence of mechanism and should not be extrapolated.',
      'Confidence intervals reflect the scatter in the data supplied, not systematic error, calibration or sampling bias.',
      good.some(r => ['ttest', 'anova', 'describe'].includes(r.kind)) ? 'Statistical tests assume independent observations; replicates from the same specimen are not independent.' : '',
      good.some(r => ['automl', 'bo', 'kmeans', 'pca', 'mlr', 'symreg'].includes(r.kind)) ? 'Models learnt from these samples should be validated on new measurements before they guide decisions.' : '',
    ].filter(Boolean);
    const ai = d.ai || {};
    /* --- assemble --- */
    const h = [];
    h.push(`<p class="k">Analysis report</p><h1>${esc(d.title)}</h1><p class="meta">${d.author ? esc(d.author) + ' · ' : ''}${esc(d.date)} · prepared with Lattent${d.site ? ' (' + esc(d.site) + ')' : ''} · ${d.tables.length} data table${d.tables.length === 1 ? '' : 's'}, ${good.length} analys${good.length === 1 ? 'is' : 'es'}, ${good.filter(r => r.svg).length} figure${good.filter(r => r.svg).length === 1 ? '' : 's'}</p>`);
    h.push(`<div class="abstract"><p class="k">Abstract</p>${ai.abstract ? aiBox(ai.model, para(ai.abstract)) : `<p>${esc(abstract)}</p>`}</div>`);
    h.push(`<h2>1. Introduction</h2>${ai.intro ? aiBox(ai.model, para(ai.intro)) : `<p>${esc(intro)}</p>`}`);
    h.push(`<h2>2. Data</h2>${d.tables.map(t => `<p><b>${esc(t.name)}</b>: ${esc(t.typeTitle || t.type)} with ${t.nRows} row${t.nRows === 1 ? '' : 's'} and ${t.cols.length} column${t.cols.length === 1 ? '' : 's'} (${t.cols.map(c => '“' + esc(c || '–') + '”').join(', ')})${t.ylabel ? `; Y axis “${esc(t.ylabel)}”` : ''}${t.type === 'xy' && t.cols.length > 2 && new Set(t.cols.slice(1)).size < t.cols.length - 1 ? '; columns with the same title were treated as replicates' : ''}.</p>`).join('')}`);
    const methodHtml = Object.values(kinds).map(k => { const txt = k.methods ? k.methods.html : `<p>${esc(k.label)} was applied with Lattent’s standard procedure.</p>`; const ids = cite(plain(txt) + ' ' + k.label); return `<h3>${esc(k.label)}</h3>${txt.replace(/<\/p>\s*$/, refMark(ids) + '</p>')}${k.tables.length > 1 ? `<p class="meta">Applied to ${join(k.tables)}.</p>` : ''}`; }).join('');
    h.push(`<h2>3. Methods</h2>${methodHtml || '<p>No analyses were run.</p>'}<h3>Software</h3><p>All numbers were computed by Lattent’s analysis engine (checked against SciPy and NumPy in continuous integration) in the author’s browser; no data left the computer. ${ai.model ? 'Passages marked as drafted by a language model are narrative only and were not used to compute any number. ' : ''}Settings for every analysis are listed in Appendix A so the work can be repeated.</p>`);
    let fig = 0, tab = 0;
    h.push(`<h2>4. Results</h2>` + d.tables.map((t, ti) => `<h3>4.${ti + 1}. ${esc(t.name)}</h3>` + (t.runs || []).map(r => {
      if (r.error) return `<h4>${esc(r.label)}</h4><div class="note">This analysis could not be completed: ${esc(r.error)}</div>`;
      const results = sec(r, /result/i), tbl = R.table(r.csv);
      let s = `<h4>${esc(r.label)}</h4>`;
      if (r.svg) { fig++; s += `<figure>${r.svg}<figcaption><b>Figure ${fig}.</b> ${esc(R.legend(r))}</figcaption></figure>`; }
      if (results) s += results.html;
      if (tbl) { tab++; s += `<p class="meta"><b>Table ${tab}.</b> ${esc(r.label)} of ${esc(t.name)}: fitted values and statistics.</p>${tbl}`; }
      return s;
    }).join('')).join(''));
    h.push(`<h2>5. Discussion</h2>${ai.discussion ? aiBox(ai.model, para(ai.discussion)) + `<h3>Analysis by analysis</h3>` : ''}${discussion}`);
    h.push(`<h3>Quality checks</h3>${d.checks.length ? `<ul class="chk">${d.checks.map(c => `<li><b>${c.sev === 'error' ? 'Error' : c.sev === 'warn' ? 'Warning' : 'Note'}:</b> ${esc(plain(c.msg))} <span class="meta">(${esc(c.where)})</span></li>`).join('')}</ul>` : '<p>The automated checks found no problems with units, sample sizes, fit quality, model choice or test assumptions.</p>'}`);
    h.push(`<h2>6. Conclusions</h2>${ai.conclusions ? aiBox(ai.model, bullets(ai.conclusions) || para(ai.conclusions)) : conclusions}`);
    h.push(`<h2>7. Recommended next steps</h2>${d.next.length ? `<ol>${d.next.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : '<p>None beyond replicating the measurements.</p>'}`);
    h.push(`<h2>8. Limitations</h2><ul>${limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`);
    const lattentRef = `Panigrahy, S. & Rajput, S. (${String(d.date || '').match(/\d{4}/) ? d.date.match(/\d{4}/)[0] : new Date().getFullYear()}). Lattent: data analysis for materials and chemistry in the browser${d.version ? ', version ' + esc(d.version) : ''}. ${esc(d.site || 'siba-p.github.io/lattent')}.`;
    h.push(`<h2>References</h2><ol class="refs">${refs.map(r => `<li>${esc(r[1])}</li>`).join('')}<li>${lattentRef}</li></ol>`);
    h.push(`<h2>Appendix A. Analysis settings</h2><table><thead><tr><th>Analysis</th><th>Table</th><th>Settings</th></tr></thead><tbody>${runs.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.t.name)}</td><td style="font-size:12px">${esc(settings(r.opts)) || '–'}</td></tr>`).join('')}</tbody></table>`);
    if (d.figReviews && d.figReviews.length) h.push(`<h2>Appendix B. Supplied figures</h2>${d.figReviews.map(f => `<figure><img src="${f.url}" alt="${esc(f.name)}" style="max-width:100%;height:auto"><figcaption><b>${esc(f.name)}.</b></figcaption></figure>${f.text ? aiBox(ai.model || 'the model', para(f.text)) : '<p class="meta">Included without review (no AI key).</p>'}`).join('')}`);
    h.push(`<p class="foot">Generated by Lattent on ${esc(d.date)}. Lattent is research software and is not validated for GLP or clinical use.</p>`);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}: analysis report</title><style>${CSS}</style></head><body>${h.join('\n')}</body></html>`;
    /* the plain-text outline a language model can redraft from */
    const outline = ['TITLE: ' + d.title, 'ABSTRACT (draft): ' + abstract, 'INTRODUCTION (draft): ' + intro, 'DATA: ' + d.tables.map(t => `${t.name}: ${t.typeTitle || t.type}, ${t.nRows} rows, columns ${t.cols.join(' | ')}`).join('; '),
      'METHODS: ' + Object.values(kinds).map(k => `${k.label}: ${k.methods ? plain(k.methods.html) : 'standard procedure'}`).join('\n'),
      'RESULTS: ' + good.map(r => `${r.t.name} · ${r.label}: ${(r.sections || []).filter(s => /result/i.test(s.title)).map(s => plain(s.html)).join(' ') || R.finding(r)}`).join('\n'),
      'INTERPRETATION (draft): ' + interpretations.map(x => `${x.r.label} (${x.r.t.name}): ${x.text}`).join('\n'),
      'CHECKS: ' + (d.checks.length ? d.checks.map(c => `${c.sev}: ${plain(c.msg)} (${c.where})`).join('\n') : 'none'),
      'NEXT STEPS: ' + d.next.join('\n'), 'LIMITATIONS: ' + limits.join('\n')].join('\n\n');
    return { html, outline, findings, nFigures: fig, nTables: tab, nRefs: refs.length + 1 };
  };
  /* parse a model's redraft: sections headed ABSTRACT, INTRODUCTION, DISCUSSION, CONCLUSIONS */
  R.parseDraft = function (txt) {
    const out = {}, re = /^\s*(?:#+\s*|\*\*)?(ABSTRACT|INTRODUCTION|DISCUSSION|CONCLUSIONS)\b[:*\s]*/gim;
    const marks = []; let m; while ((m = re.exec(txt))) marks.push({ key: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
    marks.forEach((k, i) => { out[k.key === 'introduction' ? 'intro' : k.key] = txt.slice(k.end, i + 1 < marks.length ? marks[i + 1].start : txt.length).trim(); });
    return out;
  };
  R.PROMPT = 'You are Facet, writing the narrative of a scientific report from verified results. You will receive an outline with drafts. Rewrite four sections, headed exactly "ABSTRACT", "INTRODUCTION", "DISCUSSION" and "CONCLUSIONS" on their own lines. ABSTRACT: one paragraph, at most 150 words: what was measured, how, what was found, with the key numbers. INTRODUCTION: at most 150 words: the material or system, the aim of each analysis and why it matters. DISCUSSION: at most 400 words, in paragraphs: interpret every result physically or chemically, compare analyses with each other, weigh the flagged checks, and state what the data cannot support. CONCLUSIONS: three to six bullet lines starting with "- ", each a concrete finding with its number and uncertainty. Rules: use only numbers that appear in the outline, with their units and uncertainties; never introduce new values or claim anything the results do not show; write in plain British scientific English, no headings other than the four, no preamble.';

  root.BF = root.BF || {}; root.BF.report = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
