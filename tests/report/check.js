/* The report writer: every analysis kind gets an aim, a legend and an interpretation; the
   assembled report has all its sections, numbered figures and tables, references, and no
   leaked "undefined" or "NaN". Run: node tests/report/check.js */
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'assets', 'js', 'report.js'));
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const ci = (v, w) => [v - w, v + w];
const fit = (p, r2, derived) => ({ fit: { p, se: p.map(v => Math.abs(v) * 0.05), ci: p.map(v => ci(v, Math.abs(v) * 0.1)), r2, fixed: p.map(() => false) }, derived: derived || [], warn: [] });
const T = (name, type, rows, cols, runs) => ({ name, type, typeTitle: { xy: 'XY table', col: 'Column table', mv: 'Multiple-variables table' }[type], nRows: rows, cols, ylabel: '', runs });
const sections = (m, r) => [{ title: 'Methods', html: `<p>${m}</p>` }, { title: 'Results', html: `<p>${r}</p>` }];
const runs = [
  { kind: 'peaks', label: 'Peak analysis', opts: { baseline: '2', shape: 'pv', xrd: true, K: 0.9, lambda: '1.5406', inst: 0.08 }, svg: '<svg></svg>', csv: [['Centre', 'FWHM', 'd (A)', 'Size (nm)'], [38.18, 0.95, 2.355, 9.1], [44.39, 1.08, 2.039, 8.4]],
    res: { pf: { r2: 0.991, peaks: [{ center: 38.18, height: 1000, fwhm: 0.95 }, { center: 44.39, height: 470, fwhm: 1.08 }] }, xr: { meanSize: 7.63, wh: { size: 11.1, strain: 0.0029 }, rows: [{ size: 9.1 }, { size: 8.4 }] } },
    sections: sections('Peaks were located on the Savitzky–Golay-smoothed signal and fitted with pseudo-Voigt profiles by nonlinear least squares. Crystallite sizes were estimated with the Scherrer equation and a Williamson–Hall analysis.', '2 peaks were resolved (R² = 0.991), at 38.18, 44.39. The mean Scherrer crystallite size was 7.63 nm.') },
  { kind: 'nlfit', label: 'Nonlinear regression', opts: { model: 'arrhenius', weight: '1/y2', logy: true }, svg: '<svg></svg>', csv: [['Parameter', 'LLZO'], ['A', 9900], ['Ea', 38.5]],
    res: { model: { id: 'arrhenius', name: 'Arrhenius', eq: 'A·exp(−Ea/RT)', params: ['A', 'Ea'] }, fits: [{ s: { name: 'LLZO', reps: 3, means: [1, 2, 3] }, r: fit([9900, 38.5], 0.996, [{ name: 'Ea (eV)', value: 0.399, se: 0.01 }]) }] },
    sections: sections('Data were fitted by nonlinear least squares (Levenberg–Marquardt) to the Arrhenius model.', 'For LLZO, A = 9900, Ea = 38.5 (R² = 0.9960).') },
  { kind: 'autofit', label: 'Find the best model', opts: { field: 'shape' }, svg: '<svg></svg>', csv: [['Model', 'AICc'], ['Sips', -40.2], ['Langmuir', -35.6]],
    res: { s: { name: 'isotherm' }, list: [{ model: { id: 'sips', name: 'Sips' }, fit: { r2: 0.996, aicc: -40.2 }, dAICc: 0, weight: 0.89 }, { model: { id: 'langmuir', name: 'Langmuir' }, fit: { r2: 0.99, aicc: -35.6 }, dAICc: 4.6, weight: 0.09 }, { model: { id: 'freundlich', name: 'Freundlich' }, fit: { r2: 0.95, aicc: -32 }, dAICc: 8.2, weight: 0.02 }] },
    sections: sections('3 candidate models were compared with the corrected Akaike information criterion (AICc).', 'The sips model was preferred (Akaike weight 89%).') },
  { kind: 'anova', label: 'One-way ANOVA with post tests', opts: { test: 'ordinary', post: 'tukey', err: 'sd' }, svg: '<svg></svg>', csv: [['Comparison', 'p'], ['A vs B', 0.0003]],
    res: { r: { p: 0.0001, pairs: [{ a: 'A', b: 'B', pTukey: 0.0003 }, { a: 'A', b: 'C', pTukey: 0.4 }], welch: { p: 0.0002 }, kw: { p: 0.001 }, bf: { p: 0.3 } } },
    sections: sections('Groups were compared by one-way ANOVA followed by Tukey\'s multiple-comparison test; homogeneity of variance was assessed with the Brown–Forsythe test.', 'Group means differed significantly (p < 0.0001).').concat([{ title: 'Figure legend', html: '<p>Individual values with mean ± SD.</p>' }]) },
  { kind: 'tauc', label: 'Optical band gap', opts: { transition: 'direct' }, svg: '<svg></svg>', csv: null, res: { r: { Eg: 3.3, ci: [3.28, 3.32], region: [3.32, 3.44], r2: 0.995 } }, sections: sections('Optical band gaps were determined from Tauc plots.', 'The direct optical band gap was 3.30 eV.') },
  { kind: 'tensile', label: 'Tensile test', opts: { offset: 0.2 }, svg: '<svg></svg>', csv: null, res: { r: { E: 200, yieldS: 350, uts: 480, elong: 0.22, pct: true }, d: { ylabel: 'Stress (MPa)' } }, sections: sections('Young\'s modulus was obtained by linear regression; the yield strength by the 0.2% offset method.', 'The specimen showed a modulus of 200 MPa.') },
  { kind: 'describe', label: 'Descriptive statistics', opts: { err: 'sd' }, svg: '<svg></svg>', csv: [['Statistic', 'A'], ['Mean', 10.2]], res: { ds: [{ name: 'A', d: { n: 6, mean: 10.2, sd: 1.1, cv: 10.8 }, n: { p: 0.3 }, gr: { outlier: false } }, { name: 'B', d: { n: 6, mean: 12, sd: 2, cv: 16.7 }, n: { p: 0.02 }, gr: { outlier: true, value: 19.5 } }] }, sections: [{ title: 'Results', html: '<p>A: 10.2 ± 1.1 (mean ± SD, n = 6).</p>' }] },
  { kind: 'ttest', label: 't test', opts: { test: 'welch' }, svg: '', csv: null, res: { a: { name: 'A' }, b: { name: 'B' }, r: { diff: 1.8, lo: 0.4, hi: 3.2, t: 2.9, df: 9.2, p: 0.017 } }, sections: sections('A and B were compared with Welch\'s unpaired t test.', 'The mean difference was 1.8.') },
  { kind: 'linreg', label: 'Linear regression', opts: {}, svg: '<svg></svg>', csv: null, res: { fits: [{ s: { name: 'S1' }, f: { p: [1, 0.8], ci: [[0.5, 1.5], [0.7, 0.9]], r2: 0.97 } }], cmp: null }, sections: sections('Straight lines were fitted by ordinary least squares.', 'S1: slope 0.8.') },
  { kind: 'corr', label: 'Correlation matrix', opts: {}, svg: '<svg></svg>', csv: null, res: { names: ['x', 'y', 'z'], n: 12, m: [[1, 0.9, -0.2], [0.9, 1, 0.1], [-0.2, 0.1, 1]] }, sections: null },
  { kind: 'mlr', label: 'Multiple linear regression', opts: {}, svg: '<svg></svg>', csv: null, res: { y: 'yield', names: ['T', 't'], r: { adj: 0.81, r: 0.85, pF: 0.001, n: 14, coefs: [{ name: 'Intercept', p: 0.5 }, { name: 'T', p: 0.002 }, { name: 't', p: 0.3 }] } }, sections: null },
  { kind: 'pca', label: 'Principal component analysis', opts: {}, svg: '<svg></svg>', csv: null, res: { r: { explained: [0.62, 0.21, 0.1], kaiser: 2, names: ['a', 'b', 'c', 'd'] } }, sections: null },
  { kind: 'kmeans', label: 'Clustering (k-means)', opts: { k: 'auto' }, svg: '<svg></svg>', csv: null, res: { best: { k: 3, silhouette: 0.71 } }, sections: null },
  { kind: 'bo', label: 'Model and optimise', opts: {}, svg: '<svg></svg>', csv: null, res: { names: ['Zn', 'T', 'gap'], y: [1, 2, 3, 4, 5, 6], s: { gp: { q2: 0.74, relevance: [0.6, 0.4] }, picks: [{ x: [0.62, 420], mean: 3.4, sd: 0.1 }] } }, sections: sections('gap was modelled with Gaussian-process regression; new experiments were proposed by Bayesian optimisation, maximising expected improvement.', 'The surrogate model reached a leave-one-out Q² of 0.74.') },
  { kind: 'symreg', label: 'Discover the equation', opts: {}, svg: '<svg></svg>', csv: null, res: { r: { best: { pretty: 'y = a·exp(−b/x)', law: 'Arrhenius', r2: 0.994, preferred: false } } }, sections: sections('Candidate equations were generated by sparse symbolic regression.', 'The selected equation was y = a·exp(−b/x).') },
  { kind: 'automl', label: 'AutoML', opts: {}, svg: '<svg></svg>', csv: null, res: { yname: 'band gap', n: 36, level: 0.9, best: { name: 'Gradient boosting', r2: 0.93, mae: 0.05 }, importance: [{ name: 'Zn fraction' }, { name: 'Anneal T' }], preds: [{ extrapolating: true }] }, sections: sections('6 regression models were compared by 5-fold cross-validation; input importance was measured by permutation; prediction intervals by split-conformal calibration.', 'The best model was gradient boosting (cross-validated R² = 0.93).') },
  { kind: 'nlfit', label: 'Nonlinear regression', opts: { model: 'x' }, error: 'The fit did not converge.' },
];
const d = { title: 'Test project', author: 'Panigrahy lab', date: '5 November 2026', site: 'siba-p.github.io/lattent',
  tables: [T('Au NP diffractogram', 'xy', 1101, ['2θ (°)', 'Intensity (counts)'], runs.slice(0, 1)), T('LLZO conductivity', 'xy', 10, ['Temperature (K)', 'σ (S/cm)', 'σ (S/cm)'], runs.slice(1, 3)), T('ORR mass activity', 'col', 6, ['A', 'B', 'C'], runs.slice(3, 4).concat(runs.slice(6, 8))), T('Mixed', 'xy', 50, ['x', 'y'], runs.slice(4, 6).concat(runs.slice(8, 9), runs.slice(16))), T('Alloys', 'mv', 36, ['Zn', 'T', 'gap'], runs.slice(9, 16))],
  checks: [{ sev: 'warn', where: 'Peak analysis: Au NP diffractogram', msg: 'Peak fit R² = 0.991: try a <b>higher</b> baseline order.' }], next: ['Au NP diffractogram: Identify the crystalline phases.'], figReviews: [] };
runs.filter(r => !r.error).forEach(r => { r.t = d.tables.find(t => t.runs.includes(r)); });
/* 1. every kind has an aim, a legend and an interpretation that mention real numbers or names */
runs.filter(r => !r.error).forEach(r => {
  const a = R.aim(r), l = R.legend(r), i = R.interpret(r);
  ok('aim ' + r.kind, a && a.length > 15 && !/undefined|NaN/.test(a));
  ok('legend ' + r.kind, l && l.length > 10 && !/undefined|NaN/.test(l));
  ok('interpretation ' + r.kind, i && i.length > 60 && !/undefined|NaN/.test(i));
});
ok('peaks interpretation reads strain broadening', /exceeds the Scherrer value/.test(R.interpret(runs[0])));
ok('arrhenius note present', /rate-limiting process/.test(R.interpret(runs[1])));
ok('autofit explains ΔAICc', /retains some support/.test(R.interpret(runs[2])));
ok('anova counts significant pairs', /1 of 2 pairwise/.test(R.interpret(runs[3])));
ok('tauc names the region', /visible|ultraviolet|near-infrared/.test(R.interpret(runs[4])));
ok('tensile judges ductility', /ductile/.test(R.interpret(runs[5])));
ok('describe flags outlier and normality', /outlier/.test(R.interpret(runs[6])) && /normality/.test(R.interpret(runs[6])));
ok('corr names strongest pair', /x and y \(r = 0.90\)/.test(R.interpret(runs[9])));
ok('finding from results text', R.finding(runs[0]).startsWith('2 peaks were resolved'));
ok('finding for pca', /83% of the variance/.test(R.finding(runs[11])));
/* 2. the assembled report */
const b = R.build(d), h = b.html;
['Abstract', '1. Introduction', '2. Data', '3. Methods', '4. Results', '5. Discussion', '6. Conclusions', '7. Recommended next steps', '8. Limitations', 'References', 'Appendix A. Analysis settings'].forEach(t => ok('section ' + t, h.includes('>' + t + '<')));
ok('no leaked undefined/NaN', !/undefined|NaN|\[object/.test(h.replace(/<style>[\s\S]*?<\/style>/, '')));
ok('figures numbered', b.nFigures === runs.filter(r => !r.error && r.svg).length && h.includes('<b>Figure 1.</b>') && h.includes(`<b>Figure ${b.nFigures}.</b>`));
ok('tables from csv', b.nTables === runs.filter(r => r.csv).length && /<b>Table 1\.<\/b>/.test(h) && /<td class="n">38\.18<\/td>/.test(h));
ok('references cited and listed', b.nRefs > 8 && /\[\d+(, \d+)*\]<\/span><\/p>/.test(h) && /Patterson, A\. L\./.test(h) && /Burnham/.test(h) && /Lattent: data analysis/.test(h));
ok('methods de-duplicated per kind', (h.match(/<h3>Nonlinear regression<\/h3>/g) || []).length === 1);
ok('failed analysis noted', /could not be completed: The fit did not converge/.test(h));
ok('checks escaped not rendered', h.includes('try a higher baseline order') && !h.includes('<b>higher</b>'));
ok('appendix settings readable', /shape = pv; xrd = true/.test(h) && !/\{"baseline"/.test(h));
ok('outline for a model has sections', /RESULTS:/.test(b.outline) && /INTERPRETATION \(draft\)/.test(b.outline) && b.outline.includes('7.63'));
/* 3. a model redraft is parsed and shown with its marker */
const parts = R.parseDraft('## ABSTRACT\nGold nanoparticles were measured.\n\nINTRODUCTION:\nThe aim was clear.\n\n**DISCUSSION**\nThe 7.63 nm size is small.\n\nCONCLUSIONS\n- Size 7.63 nm\n- Strain 0.29%');
ok('draft parsed', parts.abstract === 'Gold nanoparticles were measured.' && parts.intro === 'The aim was clear.' && /7\.63/.test(parts.discussion) && /^- Size/.test(parts.conclusions));
const h2 = R.build(Object.assign({}, d, { ai: Object.assign({ model: 'claude-sonnet-5-5' }, parts) })).html;
ok('ai sections marked and bulleted', (h2.match(/Drafted by claude-sonnet-5-5/g) || []).length === 4 && /<li>Size 7\.63 nm<\/li>/.test(h2) && /Analysis by analysis/.test(h2));
/* 4. an empty project still builds */
const e = R.build({ title: 'Empty', date: '5 November 2026', tables: [T('t', 'xy', 0, ['x', 'y'], [])], checks: [], next: [], figReviews: [] });
ok('empty project builds', /No analyses were run/.test(e.html) && e.nFigures === 0);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
