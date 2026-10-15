/* Example projects for Lattent Studio, one per field. Each returns {tables, items}. */
(function () {
  'use strict';
  const S = BF.stats;
  const f = (v, d) => String(Number(v.toFixed(d)));
  const SAMPLES = [];

  SAMPLES.push({
    id: 'arrhenius', field: 'Materials', title: 'Ionic conductivity of a solid electrolyte',
    blurb: 'Fit Arrhenius behaviour and get the activation energy in kJ/mol and eV.',
    make() {
      const r = S.rng(3);
      const T = [298, 313, 323, 333, 343, 353, 363, 373, 383, 393];
      const rows = T.map(t => [String(t)].concat([0, 1, 2].map(() => f(Math.exp(9.2 - 38500 / (8.314 * t)) * (1 + 0.05 * r.normal()), 7))));
      return {
        tables: [{ name: 'LLZO conductivity', type: 'xy', cols: ['Temperature (K)', 'σ (S/cm)', 'σ (S/cm)', 'σ (S/cm)'], rows, ylabel: 'Conductivity σ (S/cm)' }],
        items: [{ kind: 'nlfit', opts: { model: 'arrhenius', logy: true, weight: '1/y2' } }, { kind: 'autofit', opts: { field: 'shape' } }]
      };
    }
  });

  SAMPLES.push({
    id: 'xrd', field: 'Nanomaterials', title: 'XRD of gold nanoparticles',
    blurb: 'Find and fit Bragg peaks, then get d-spacings, Scherrer crystallite size and Williamson–Hall strain.',
    make() {
      const r = S.rng(9);
      const peaks = [[38.18, 1000, 0.95], [44.39, 470, 1.08], [64.58, 260, 1.34], [77.55, 280, 1.55], [81.72, 75, 1.62]];
      const rows = [];
      for (let tt = 30; tt <= 85.001; tt += 0.05) {
        let y = 120 * Math.exp(-(tt - 30) / 40) + 40;
        peaks.forEach(([c, h, w]) => { y += h * (0.55 / (1 + 4 * ((tt - c) / w) ** 2) + 0.45 * Math.exp(-4 * Math.LN2 * ((tt - c) / w) ** 2)); });
        rows.push([f(tt, 2), f(Math.max(0, y + Math.sqrt(y) * r.normal()), 1)]);
      }
      return {
        tables: [{ name: 'Au NP diffractogram', type: 'xy', cols: ['2θ (°)', 'Intensity (counts)'], rows, ylabel: 'Intensity (counts)' }],
        items: [{ kind: 'peaks', opts: { baseline: '2', prominence: 4, shape: 'pv', xrd: true, lambda: '1.5406', K: 0.9, inst: 0.08 } }]
      };
    }
  });

  SAMPLES.push({
    id: 'tauc', field: 'Semiconductors', title: 'Optical band gap from UV–Vis',
    blurb: 'Convert absorbance to a Tauc plot and extrapolate the band gap of ZnO nanocrystals.',
    make() {
      const r = S.rng(5);
      const rows = [];
      for (let l = 300; l <= 500; l += 1) {
        const E = 1239.84 / l;
        const a = (E > 3.32 ? 1.6 * Math.sqrt(E - 3.32) / E : 0) + 0.012 * Math.exp((E - 3.32) / 0.06) * (E <= 3.32) + 0.03 + 0.003 * r.normal();
        rows.push([String(l), f(a, 4)]);
      }
      return {
        tables: [{ name: 'ZnO absorbance', type: 'xy', cols: ['Wavelength (nm)', 'Absorbance'], rows, ylabel: 'Absorbance' }],
        items: [{ kind: 'tauc', opts: { transition: 'direct' } }]
      };
    }
  });

  SAMPLES.push({
    id: 'tensile', field: 'Polymers', title: 'Tensile test of a polymer film',
    blurb: "Young's modulus, 0.2% offset yield, ultimate strength, elongation and toughness from one stress–strain curve.",
    make() {
      const r = S.rng(13);
      const rows = [];
      for (let i = 0; i <= 500; i++) {
        const e = i * 0.06;
        const ef = e / 100;
        const s = 2400 * ef / (1 + Math.pow(ef / 0.022, 2.2)) ** (1 / 2.2) * 1 + 160 * ef * (ef > 0.02) - 9000 * Math.max(ef - 0.27, 0) ** 2;
        rows.push([f(e, 2), f(Math.max(s + 0.25 * r.normal(), 0), 2)]);
      }
      return {
        tables: [{ name: 'PLA film', type: 'xy', cols: ['Strain (%)', 'Stress (MPa)'], rows, ylabel: 'Stress (MPa)' }],
        items: [{ kind: 'tensile', opts: {} }]
      };
    }
  });

  SAMPLES.push({
    id: 'isotherm', field: 'Adsorption', title: 'Dye adsorption on a MOF',
    blurb: 'Let Lattent compare Langmuir, Freundlich, Sips and others by AICc, and see which isotherm the data support.',
    make() {
      const r = S.rng(21);
      const C = [2, 5, 10, 20, 40, 60, 90, 130, 180, 250, 320];
      const rows = C.map(c => [String(c)].concat([0, 1].map(() => f(310 * Math.pow(0.035 * c, 0.75) / (1 + Math.pow(0.035 * c, 0.75)) * (1 + 0.035 * r.normal()), 1))));
      return {
        tables: [{ name: 'Methylene blue on UiO-66', type: 'xy', cols: ['Cₑ (mg/L)', 'qₑ (mg/g)', 'qₑ (mg/g)'], rows, ylabel: 'qₑ (mg/g)' }],
        items: [{ kind: 'autofit', opts: { field: 'shape' } }, { kind: 'nlfit', opts: { model: 'sips' } }]
      };
    }
  });

  SAMPLES.push({
    id: 'floryfox', field: 'Polymers', title: 'Glass transition vs molecular weight',
    blurb: 'Flory–Fox fit for polystyrene standards: T_g at infinite chain length and the end-group constant.',
    make() {
      const r = S.rng(2);
      const Mn = [1200, 2100, 3500, 5200, 9000, 17500, 35000, 68000, 120000, 250000];
      return {
        tables: [{ name: 'Polystyrene Tg', type: 'xy', cols: ['Mₙ (g/mol)', 'T_g (°C)'], rows: Mn.map(m => [String(m), f(100.5 - 1.1e5 / m + 0.8 * r.normal(), 1)]), ylabel: 'T_g (°C)' }],
        items: [{ kind: 'nlfit', opts: { model: 'floryfox', logx: true } }]
      };
    }
  });

  SAMPLES.push({
    id: 'anova', field: 'Statistics', title: 'Compare catalyst batches',
    blurb: 'One-way ANOVA with Tukey post tests, assumption checks and significance stars on the graph.',
    make() {
      const r = S.rng(8);
      const g = [['Pt/C (ref)', 62, 4], ['Pt₃Ni', 71, 4.5], ['PtCo', 69, 5], ['Pt₃Ni (annealed)', 80, 4.2]];
      const rows = Array.from({ length: 6 }, () => g.map(([, m, s]) => f(m + s * r.normal(), 1)));
      return {
        tables: [{ name: 'ORR mass activity', type: 'col', cols: g.map(x => x[0]), rows, ylabel: 'Mass activity (A/g Pt)' }],
        items: [{ kind: 'anova', opts: { post: 'tukey' } }]
      };
    }
  });

  SAMPLES.push({
    id: 'discovery', field: 'Materials discovery', title: 'Optimise a polymer blend formulation',
    blurb: 'A Gaussian-process model of toughness vs composition and processing suggests the next five experiments.',
    make() {
      const r = S.rng(31);
      const rows = [];
      const truth = (a, b, c, T) => 18 + 30 * Math.exp(-(((a - 55) / 18) ** 2) - ((b - 30) / 14) ** 2) + 6 * Math.sin(T / 30) - 0.002 * (T - 190) ** 2;
      for (let i = 0; i < 16; i++) {
        let a = 20 + r() * 60, b = 5 + r() * 45;
        if (a + b > 95) { const s = 95 / (a + b); a *= s; b *= s; }
        const c = 100 - a - b, T = 160 + r() * 60;
        rows.push(['Run ' + (i + 1), f(a, 1), f(b, 1), f(c, 1), f(T, 0), f(truth(a, b, c, T) + 1.2 * r.normal(), 1)]);
      }
      return {
        tables: [{ name: 'PLA/PBAT/additive blends', type: 'mv', cols: ['Sample', 'PLA (wt%)', 'PBAT (wt%)', 'Additive (wt%)', 'Processing T (°C)', 'Toughness (MJ/m³)'], rows }],
        items: [{ kind: 'bo', opts: { target: 5, inputs: [1, 2, 3, 4], goal: 'max', batch: 5, compo: true, compoCols: [1, 2, 3], total: 100 } }, { kind: 'corr', opts: {} }]
      };
    }
  });

  SAMPLES.push({
    id: 'alloys', field: 'Machine learning', title: 'Explore an alloy property dataset',
    blurb: 'PCA and clustering reveal families of alloys and which properties move together.',
    make() {
      const r = S.rng(17);
      const fam = [[7.9, 210, 450, 16, 25], [2.7, 70, 280, 23, 160], [4.5, 110, 900, 9, 7], [8.9, 125, 350, 17, 390]];
      const names = ['Steel', 'Al alloy', 'Ti alloy', 'Cu alloy'];
      const rows = [];
      fam.forEach((m, k) => { for (let i = 0; i < 9; i++) rows.push([names[k] + ' ' + (i + 1)].concat(m.map((v, j) => f(v * (1 + (j === 2 ? 0.18 : 0.06) * r.normal()), j === 0 ? 2 : 0)))); });
      return {
        tables: [{ name: 'Alloy properties', type: 'mv', cols: ['Alloy', 'Density (g/cm³)', 'Modulus (GPa)', 'Yield (MPa)', 'CTE (ppm/K)', 'Thermal cond. (W/mK)'], rows }],
        items: [{ kind: 'pca', opts: {} }, { kind: 'kmeans', opts: { k: 'auto' } }]
      };
    }
  });

  SAMPLES.push({
    id: 'dose', field: 'Biochemistry', title: 'Dose–response of three inhibitors',
    blurb: 'IC50 values with confidence intervals from a four-parameter logistic fit on a log axis.',
    make() {
      const r = S.rng(11);
      const sets = [[3, 99, -1.37, -1.05], [6, 101, -0.25, -0.9], [1, 100, -2.2, -1.3]];
      const conc = [0.0005, 0.0015, 0.0046, 0.014, 0.041, 0.12, 0.37, 1.1, 3.3, 10];
      const rows = conc.map(c => [String(c)].concat(...sets.map(p => [0, 1, 2].map(() => f(p[0] + (p[1] - p[0]) / (1 + Math.pow(10, (p[2] - Math.log10(c)) * p[3])) + 4 * r.normal(), 1)))));
      return {
        tables: [{ name: 'Kinase inhibition', type: 'xy', cols: ['Concentration (µM)', 'Cmpd A', 'Cmpd A', 'Cmpd A', 'Cmpd B', 'Cmpd B', 'Cmpd B', 'Staurosporine', 'Staurosporine', 'Staurosporine'], rows, ylabel: 'Activity (%)' }],
        items: [{ kind: 'nlfit', opts: { model: 'dr4', logx: true } }]
      };
    }
  });

  window.BF_SAMPLES = SAMPLES;
})();
