/* Equation library across fields, a safe parser for user equations, and nonlinear
   regression / automatic model selection built on BF.stats.lm. */
(function (root) {
  'use strict';
  const S = root.BF.stats;
  const M = {};
  const R = 8.314462618, LN2 = Math.LN2;

  /* ---------- helpers for initial guesses ---------- */
  function feat(xs, ys) {
    const idx = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
    const X = idx.map(i => xs[i]), Y = idx.map(i => ys[i]);
    const n = X.length;
    const ymin = Math.min(...Y), ymax = Math.max(...Y);
    const k = Math.max(1, Math.round(n * 0.15));
    const yFirst = S.mean(Y.slice(0, k)), yLast = S.mean(Y.slice(-k));
    const half = (a, b) => { const t = 0.5 * (a + b); let best = 0; for (let i = 1; i < n; i++) if (Math.abs(Y[i] - t) < Math.abs(Y[best] - t)) best = i; return X[best]; };
    let imax = 0; for (let i = 1; i < n; i++) if (Y[i] > Y[imax]) imax = i;
    return { X, Y, n, xmin: X[0], xmax: X[n - 1], ymin, ymax, yFirst, yLast, xHalf: half(yFirst, yLast), xPeak: X[imax], yPeak: Y[imax], rising: yLast > yFirst, half };
  }
  /* ordinary least squares line through transformed points */
  function line(xs, ys) {
    const ok = xs.map((x, i) => [x, ys[i]]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    const n = ok.length; if (n < 2) return { a: 0, b: 0 };
    const mx = S.mean(ok.map(p => p[0])), my = S.mean(ok.map(p => p[1]));
    let sxy = 0, sxx = 0; ok.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; });
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b };
  }
  const fwhmGuess = F => {
    const half = F.ymin + 0.5 * (F.yPeak - F.ymin);
    let l = F.xmin, r = F.xmax;
    for (let i = F.X.indexOf(F.xPeak); i >= 0; i--) if (F.Y[i] < half) { l = F.X[i]; break; }
    for (let i = F.X.indexOf(F.xPeak); i < F.n; i++) if (F.Y[i] < half) { r = F.X[i]; break; }
    return Math.max(r - l, (F.xmax - F.xmin) / 50);
  };

  /* ---------- the library ---------- */
  /* Each model: id, name, field, eq (display), params, f(x, p), guess(F, xs, ys) → p0 (or list),
     needs: 'x>0' | 'y>0', derived: [{name, unit, f(p)}], note */
  const L = [];
  const add = m => { L.push(m); return m; };

  /* General */
  add({ id: 'line', name: 'Straight line', field: 'General', eq: 'Y = a + b·X', params: ['a', 'b'], f: (x, p) => p[0] + p[1] * x,
    guess: (F, xs, ys) => { const l = line(xs, ys); return [l.a, l.b]; } });
  add({ id: 'quad', name: 'Second-order polynomial', field: 'General', eq: 'Y = a + b·X + c·X²', params: ['a', 'b', 'c'], f: (x, p) => p[0] + p[1] * x + p[2] * x * x,
    guess: (F, xs, ys) => { const l = line(xs, ys); return [l.a, l.b, 0]; } });
  add({ id: 'cubic', name: 'Third-order polynomial', field: 'General', eq: 'Y = a + b·X + c·X² + d·X³', params: ['a', 'b', 'c', 'd'], f: (x, p) => p[0] + p[1] * x + p[2] * x * x + p[3] * x * x * x,
    guess: (F, xs, ys) => { const l = line(xs, ys); return [l.a, l.b, 0, 0]; } });
  add({ id: 'power', name: 'Power law', field: 'General', eq: 'Y = A·X^b', params: ['A', 'b'], needs: 'x>0', f: (x, p) => p[0] * Math.pow(x, p[1]),
    guess: (F, xs, ys) => { const l = line(xs.map(Math.log), ys.map(y => Math.log(Math.abs(y) || 1e-12))); return [Math.sign(F.yLast || 1) * Math.exp(l.a), l.b]; } });
  add({ id: 'log', name: 'Logarithmic', field: 'General', eq: 'Y = a + b·ln X', params: ['a', 'b'], needs: 'x>0', f: (x, p) => p[0] + p[1] * Math.log(x),
    guess: (F, xs, ys) => { const l = line(xs.map(Math.log), ys); return [l.a, l.b]; } });
  add({ id: 'expdecay', name: 'One-phase exponential decay', field: 'General', eq: 'Y = (Y₀ − Plateau)·e^(−k·X) + Plateau', params: ['Y₀', 'Plateau', 'k'],
    f: (x, p) => (p[0] - p[1]) * Math.exp(-p[2] * x) + p[1],
    guess: F => [F.yFirst, F.yLast, LN2 / Math.max(F.xHalf - F.xmin, (F.xmax - F.xmin) / 10)],
    derived: [{ name: 'Half-life', f: p => LN2 / p[2] }, { name: 'Time constant τ', f: p => 1 / p[2] }] });
  add({ id: 'exp2', name: 'Two-phase exponential decay', field: 'General', eq: 'Y = Plateau + A₁e^(−k₁X) + A₂e^(−k₂X)', params: ['Plateau', 'A₁', 'k₁', 'A₂', 'k₂'],
    f: (x, p) => p[0] + p[1] * Math.exp(-p[2] * x) + p[3] * Math.exp(-p[4] * x),
    guess: F => { const k = LN2 / Math.max(F.xHalf - F.xmin, (F.xmax - F.xmin) / 10); const A = F.yFirst - F.yLast; return [[F.yLast, A * 0.6, k * 4, A * 0.4, k / 3], [F.yLast, A * 0.5, k * 10, A * 0.5, k / 2]]; },
    derived: [{ name: 'Fast half-life', f: p => LN2 / Math.max(p[2], p[4]) }, { name: 'Slow half-life', f: p => LN2 / Math.min(p[2], p[4]) }] });
  add({ id: 'assoc', name: 'One-phase association (rise to plateau)', field: 'General', eq: 'Y = Y₀ + (Plateau − Y₀)·(1 − e^(−k·X))', params: ['Y₀', 'Plateau', 'k'],
    f: (x, p) => p[0] + (p[1] - p[0]) * (1 - Math.exp(-p[2] * x)),
    guess: F => [F.yFirst, F.yLast, LN2 / Math.max(F.xHalf - F.xmin, (F.xmax - F.xmin) / 10)],
    derived: [{ name: 'Half-time', f: p => LN2 / p[2] }] });
  add({ id: 'expgrowth', name: 'Exponential growth', field: 'General', eq: 'Y = Y₀·e^(k·X)', params: ['Y₀', 'k'], f: (x, p) => p[0] * Math.exp(p[1] * x),
    guess: (F, xs, ys) => { const l = line(xs, ys.map(y => Math.log(Math.abs(y) || 1e-12))); return [Math.exp(l.a), l.b]; },
    derived: [{ name: 'Doubling time', f: p => LN2 / p[1] }] });
  add({ id: 'boltz', name: 'Sigmoid (Boltzmann)', field: 'General', eq: 'Y = Bottom + (Top − Bottom)/(1 + e^((X₅₀ − X)/s))', params: ['Bottom', 'Top', 'X₅₀', 's'],
    f: (x, p) => p[0] + (p[1] - p[0]) / (1 + Math.exp((p[2] - x) / p[3])),
    guess: F => [Math.min(F.yFirst, F.yLast), Math.max(F.yFirst, F.yLast), F.xHalf, (F.rising ? 1 : -1) * (F.xmax - F.xmin) / 10] });
  add({ id: 'gauss', name: 'Gaussian peak', field: 'General', eq: 'Y = c + A·e^(−(X − x₀)²/(2σ²))', params: ['A', 'x₀', 'σ', 'c'],
    f: (x, p) => p[3] + p[0] * Math.exp(-((x - p[1]) ** 2) / (2 * p[2] * p[2])),
    guess: F => [F.yPeak - F.ymin, F.xPeak, fwhmGuess(F) / 2.3548, F.ymin],
    derived: [{ name: 'FWHM', f: p => 2.35482 * Math.abs(p[2]) }, { name: 'Area', f: p => p[0] * Math.abs(p[2]) * Math.sqrt(2 * Math.PI) }] });
  add({ id: 'lorentz', name: 'Lorentzian peak', field: 'General', eq: 'Y = c + A/(1 + ((X − x₀)/γ)²)', params: ['A', 'x₀', 'γ', 'c'],
    f: (x, p) => p[3] + p[0] / (1 + ((x - p[1]) / p[2]) ** 2),
    guess: F => [F.yPeak - F.ymin, F.xPeak, fwhmGuess(F) / 2, F.ymin],
    derived: [{ name: 'FWHM', f: p => 2 * Math.abs(p[2]) }, { name: 'Area', f: p => Math.PI * p[0] * Math.abs(p[2]) }] });
  add({ id: 'logistic', name: 'Logistic growth', field: 'General', eq: 'Y = K/(1 + e^(−r(X − x₀)))', params: ['K', 'r', 'x₀'],
    f: (x, p) => p[0] / (1 + Math.exp(-p[1] * (x - p[2]))),
    guess: F => [F.ymax * 1.05, 4 / Math.max(F.xmax - F.xmin, 1e-9), F.xHalf] });
  add({ id: 'gompertz', name: 'Gompertz growth', field: 'General', eq: 'Y = A·e^(−b·e^(−c·X))', params: ['A', 'b', 'c'],
    f: (x, p) => p[0] * Math.exp(-p[1] * Math.exp(-p[2] * x)),
    guess: F => [F.ymax * 1.05, 5, 3 / Math.max(F.xmax - F.xmin, 1e-9)] });

  /* Materials and chemistry */
  add({ id: 'arrhenius', name: 'Arrhenius', field: 'Materials & chemistry', eq: 'Y = A·e^(−Eₐ/(R·T)),  X = T in K', params: ['ln A', 'Eₐ (kJ/mol)'], needs: 'x>0,y>0',
    f: (x, p) => Math.exp(p[0] - 1000 * p[1] / (R * x)),
    guess: (F, xs, ys) => { const l = line(xs.map(x => 1 / x), ys.map(Math.log)); return [l.a, -l.b * R / 1000]; },
    derived: [{ name: 'Eₐ (eV)', f: p => p[1] / 96.4853 }, { name: 'A (pre-exponential)', f: p => Math.exp(p[0]) }],
    note: 'Conductivity, diffusion coefficients and rate constants. X must be absolute temperature (K).' });
  add({ id: 'vft', name: 'Vogel–Fulcher–Tammann', field: 'Materials & chemistry', eq: 'Y = A·e^(−B/(T − T₀))', params: ['ln A', 'B (K)', 'T₀ (K)'], needs: 'x>0,y>0',
    f: (x, p) => Math.exp(p[0] - p[1] / (x - p[2])),
    guess: (F, xs, ys) => { const T0 = 0.7 * F.xmin; const l = line(xs.map(x => 1 / (x - T0)), ys.map(Math.log)); return [l.a, -l.b, T0]; },
    derived: [{ name: 'Pseudo-activation energy (kJ/mol)', f: p => p[1] * R / 1000 }],
    note: 'Ion transport in polymer and glassy electrolytes, viscosity of glass formers.' });
  add({ id: 'langmuir', name: 'Langmuir isotherm', field: 'Materials & chemistry', eq: 'q = q_max·K·C/(1 + K·C)', params: ['q_max', 'K'], needs: 'x>=0',
    f: (x, p) => p[0] * p[1] * x / (1 + p[1] * x),
    guess: F => [F.ymax * 1.2, 1 / Math.max(F.half(0, F.ymax * 1.2), 1e-12)] });
  add({ id: 'freundlich', name: 'Freundlich isotherm', field: 'Materials & chemistry', eq: 'q = K_F·C^(1/n)', params: ['K_F', 'n'], needs: 'x>0,y>0',
    f: (x, p) => p[0] * Math.pow(x, 1 / p[1]),
    guess: (F, xs, ys) => { const l = line(xs.map(Math.log), ys.map(Math.log)); return [Math.exp(l.a), 1 / (l.b || 0.5)]; } });
  add({ id: 'sips', name: 'Sips (Langmuir–Freundlich) isotherm', field: 'Materials & chemistry', eq: 'q = q_max·(K·C)ⁿ/(1 + (K·C)ⁿ)', params: ['q_max', 'K', 'n'], needs: 'x>=0',
    f: (x, p) => { const t = Math.pow(p[1] * x, p[2]); return p[0] * t / (1 + t); },
    guess: F => [F.ymax * 1.2, 1 / Math.max(F.half(0, F.ymax * 1.2), 1e-12), 1] });
  add({ id: 'pso', name: 'Pseudo-second-order kinetics', field: 'Materials & chemistry', eq: 'q_t = q_e²·k·t/(1 + q_e·k·t)', params: ['q_e', 'k'], needs: 'x>=0',
    f: (x, p) => p[0] * p[0] * p[1] * x / (1 + p[0] * p[1] * x),
    guess: F => { const qe = F.ymax * 1.1; return [qe, 1 / (qe * Math.max(F.half(0, qe), 1e-12))]; },
    derived: [{ name: 'Initial rate h = k·q_e²', f: p => p[1] * p[0] * p[0] }],
    note: 'Adsorption kinetics (Ho–McKay).' });
  add({ id: 'pfo', name: 'Pseudo-first-order kinetics', field: 'Materials & chemistry', eq: 'q_t = q_e·(1 − e^(−k·t))', params: ['q_e', 'k'], needs: 'x>=0',
    f: (x, p) => p[0] * (1 - Math.exp(-p[1] * x)),
    guess: F => [F.ymax * 1.05, LN2 / Math.max(F.half(0, F.ymax), 1e-12)] });
  add({ id: 'secondorder', name: 'Second-order decay', field: 'Materials & chemistry', eq: 'C = C₀/(1 + C₀·k·t)', params: ['C₀', 'k'], needs: 'x>=0',
    f: (x, p) => p[0] / (1 + p[0] * p[1] * x),
    guess: F => [F.yFirst, 1 / (F.yFirst * Math.max(F.xHalf - F.xmin, 1e-12))],
    derived: [{ name: 'First half-life 1/(k·C₀)', f: p => 1 / (p[1] * p[0]) }] });
  add({ id: 'avrami', name: 'Avrami (JMAK) crystallisation', field: 'Materials & chemistry', eq: 'X = X_∞·(1 − e^(−ln2·(t/t½)ⁿ))', params: ['X_∞', 't½', 'n'], needs: 'x>=0',
    f: (x, p) => p[0] * (1 - Math.exp(-LN2 * Math.pow(Math.max(x, 0) / p[1], p[2]))),
    guess: F => [F.ymax, Math.max(F.half(0, F.ymax), 1e-9), 2],
    derived: [{ name: 'Rate constant k = ln2/t½ⁿ', f: p => LN2 / Math.pow(p[1], p[2]) }],
    note: 'Phase transformation and crystallisation kinetics; n reflects nucleation and growth dimensionality.' });
  add({ id: 'kww', name: 'Stretched exponential (KWW)', field: 'Materials & chemistry', eq: 'Y = A·e^(−(t/τ)^β) + c', params: ['A', 'τ', 'β', 'c'], needs: 'x>=0',
    f: (x, p) => p[0] * Math.exp(-Math.pow(Math.max(x, 0) / p[1], p[2])) + p[3],
    guess: F => [F.yFirst - F.yLast, Math.max(F.xHalf - F.xmin, 1e-9) / LN2, 0.8, F.yLast],
    note: 'Photoluminescence decays, dielectric and stress relaxation.' });
  add({ id: 'tafel', name: 'Tafel', field: 'Materials & chemistry', eq: 'η = a + b·log₁₀(i)', params: ['a', 'b (Tafel slope)'], needs: 'x>0',
    f: (x, p) => p[0] + p[1] * Math.log10(x),
    guess: (F, xs, ys) => { const l = line(xs.map(Math.log10), ys); return [l.a, l.b]; },
    derived: [{ name: 'Exchange current i₀', f: p => Math.pow(10, -p[0] / p[1]) }],
    note: 'X: current density, Y: overpotential. Fit only the linear Tafel region.' });
  add({ id: 'curieweiss', name: 'Curie–Weiss', field: 'Materials & chemistry', eq: 'χ = C/(T − θ)', params: ['C', 'θ'],
    f: (x, p) => p[0] / (x - p[1]),
    guess: (F, xs, ys) => { const l = line(xs, ys.map(y => 1 / y)); return [1 / l.b, -l.a / l.b]; },
    derived: [{ name: 'μ_eff (μB, CGS, per formula unit)', f: p => Math.sqrt(Math.max(8 * p[0], 0)) }] });

  /* Polymers */
  add({ id: 'floryfox', name: 'Flory–Fox (Tg vs Mn)', field: 'Polymers', eq: 'T_g = T_g,∞ − K/M_n', params: ['T_g,∞', 'K'], needs: 'x>0',
    f: (x, p) => p[0] - p[1] / x,
    guess: (F, xs, ys) => { const l = line(xs.map(x => 1 / x), ys); return [l.a, -l.b]; } });
  add({ id: 'markhouwink', name: 'Mark–Houwink', field: 'Polymers', eq: '[η] = K·M^a', params: ['K', 'a'], needs: 'x>0,y>0',
    f: (x, p) => p[0] * Math.pow(x, p[1]),
    guess: (F, xs, ys) => { const l = line(xs.map(Math.log), ys.map(Math.log)); return [Math.exp(l.a), l.b]; },
    note: 'a ≈ 0.5 in a θ solvent, 0.6–0.8 in good solvents, up to 2 for rods.' });
  add({ id: 'wlf', name: 'Williams–Landel–Ferry', field: 'Polymers', eq: 'log a_T = −C₁(T − T_r)/(C₂ + T − T_r)', params: ['C₁', 'C₂', 'T_r'],
    f: (x, p) => -p[0] * (x - p[2]) / (p[1] + x - p[2]),
    guess: (F, xs, ys) => { let i0 = 0; ys.forEach((y, i) => { if (Math.abs(y) < Math.abs(ys[i0])) i0 = i; }); return [[17.4, 51.6, xs[i0]], [8.9, 101.6, xs[i0]]]; },
    note: 'Time–temperature superposition shift factors (Y = log₁₀ a_T).' });
  add({ id: 'carreau', name: 'Carreau viscosity', field: 'Polymers', eq: 'η = η_∞ + (η₀ − η_∞)(1 + (λγ̇)²)^((n−1)/2)', params: ['η₀', 'η_∞', 'λ', 'n'], needs: 'x>0',
    f: (x, p) => p[1] + (p[0] - p[1]) * Math.pow(1 + (p[2] * x) ** 2, (p[3] - 1) / 2),
    guess: F => [F.yFirst, Math.max(F.ymin * 0.1, 0), 1 / Math.max(F.half(F.yFirst, F.ymin), 1e-12), 0.4],
    note: 'Shear-thinning melts and solutions; X = shear rate.' });
  add({ id: 'crossmodel', name: 'Cross viscosity', field: 'Polymers', eq: 'η = η₀/(1 + (λγ̇)^m)', params: ['η₀', 'λ', 'm'], needs: 'x>0',
    f: (x, p) => p[0] / (1 + Math.pow(p[1] * x, p[2])),
    guess: F => [F.yFirst, 1 / Math.max(F.half(F.yFirst, 0), 1e-12), 0.8] });

  /* Nanomaterials and physics */
  add({ id: 'hallpetch', name: 'Hall–Petch', field: 'Nanomaterials & physics', eq: 'σ_y = σ₀ + k·d^(−1/2)', params: ['σ₀', 'k'], needs: 'x>0',
    f: (x, p) => p[0] + p[1] / Math.sqrt(x),
    guess: (F, xs, ys) => { const l = line(xs.map(x => 1 / Math.sqrt(x)), ys); return [l.a, l.b]; },
    note: 'Yield strength or hardness vs grain size d.' });
  add({ id: 'confine', name: 'Quantum confinement (Brus-type)', field: 'Nanomaterials & physics', eq: 'E = E_g + a/d²', params: ['E_g (bulk)', 'a'], needs: 'x>0',
    f: (x, p) => p[0] + p[1] / (x * x),
    guess: (F, xs, ys) => { const l = line(xs.map(x => 1 / (x * x)), ys); return [l.a, l.b]; },
    note: 'Band gap or emission energy vs nanocrystal size.' });
  add({ id: 'confine2', name: 'Quantum confinement with Coulomb term', field: 'Nanomaterials & physics', eq: 'E = E_g + a/d² − b/d', params: ['E_g (bulk)', 'a', 'b'], needs: 'x>0',
    f: (x, p) => p[0] + p[1] / (x * x) - p[2] / x,
    guess: (F, xs, ys) => { const l = line(xs.map(x => 1 / (x * x)), ys); return [l.a, l.b, 0]; } });
  add({ id: 'lspr', name: 'Drude plasmon shift (refractive-index sensing)', field: 'Nanomaterials & physics', eq: 'λ = λ₀ + m·n', params: ['λ₀', 'm (sensitivity)'],
    f: (x, p) => p[0] + p[1] * x, guess: (F, xs, ys) => { const l = line(xs, ys); return [l.a, l.b]; } });

  /* Biology and pharmacology */
  add({ id: 'dr4', name: 'Dose–response, four parameters', field: 'Biology & pharmacology', eq: 'Y = Bottom + (Top − Bottom)/(1 + 10^((log EC₅₀ − log X)·h))', params: ['Bottom', 'Top', 'log EC₅₀', 'Hill slope'], needs: 'x>0',
    f: (x, p) => p[0] + (p[1] - p[0]) / (1 + Math.pow(10, (p[2] - Math.log10(x)) * p[3])),
    guess: F => { const s = F.rising ? 1 : -1; return [[Math.min(F.yFirst, F.yLast), Math.max(F.yFirst, F.yLast), Math.log10(F.xHalf), s], [Math.min(F.yFirst, F.yLast), Math.max(F.yFirst, F.yLast), Math.log10(F.xHalf), 2 * s]]; },
    derived: [{ name: 'EC₅₀ / IC₅₀', f: p => Math.pow(10, p[2]) }] });
  add({ id: 'mm', name: 'Michaelis–Menten', field: 'Biology & pharmacology', eq: 'v = V_max·S/(K_m + S)', params: ['V_max', 'K_m'], needs: 'x>=0',
    f: (x, p) => p[0] * x / (p[1] + x), guess: F => [F.ymax * 1.2, Math.max(F.half(0, F.ymax * 1.2), 1e-12)] });
  add({ id: 'hill', name: 'Hill equation', field: 'Biology & pharmacology', eq: 'Y = Y_max·Xʰ/(K½ʰ + Xʰ)', params: ['Y_max', 'K½', 'h'], needs: 'x>=0',
    f: (x, p) => { const t = Math.pow(Math.max(x, 0), p[2]); return p[0] * t / (Math.pow(p[1], p[2]) + t); },
    guess: F => [F.ymax * 1.1, Math.max(F.half(0, F.ymax), 1e-12), 1.5] });
  add({ id: 'binding', name: 'One-site specific binding', field: 'Biology & pharmacology', eq: 'Y = B_max·X/(K_d + X)', params: ['B_max', 'K_d'], needs: 'x>=0',
    f: (x, p) => p[0] * x / (p[1] + x), guess: F => [F.ymax * 1.2, Math.max(F.half(0, F.ymax * 1.2), 1e-12)] });

  M.library = L;
  M.byId = id => L.find(m => m.id === id);
  M.fields = [...new Set(L.map(m => m.field))];

  /* ---------- safe expression parser for user equations ---------- */
  const FUN = { exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, tanh: Math.tanh, sinh: Math.sinh, cosh: Math.cosh, atan: Math.atan, erf: S.erf, pow: Math.pow, min: Math.min, max: Math.max };
  const CONST = { pi: Math.PI, e: Math.E, R: R, kB: 8.617333262e-5, NA: 6.02214076e23 };
  M.compile = function (src) {
    let s = String(src).replace(/^\s*y\s*=/i, '').trim();
    if (!s) throw new Error('Type an equation, for example A*exp(-k*x) + c');
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[-+*/^(),]))/y;
    let m;
    while (re.lastIndex < s.length) {
      const at = re.lastIndex;
      m = re.exec(s);
      if (!m) throw new Error('Unexpected character at position ' + (at + 1) + ': “' + s.slice(at, at + 1) + '”');
      if (m[1]) toks.push({ t: 'n', v: parseFloat(m[1]) });
      else if (m[2]) toks.push({ t: 'i', v: m[2] });
      else toks.push({ t: 'o', v: m[3] === '**' ? '^' : m[3] });
      if (re.lastIndex === at) break;
    }
    let i = 0;
    const params = [];
    const peek = () => toks[i], next = () => toks[i++];
    const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error('Expected “' + v + '”'); };
    function expr() {
      let a = term();
      while (peek() && (peek().v === '+' || peek().v === '-')) { const op = next().v, b = term(), l = a; a = op === '+' ? sc => l(sc) + b(sc) : sc => l(sc) - b(sc); }
      return a;
    }
    function term() {
      let a = unary();
      while (peek() && (peek().v === '*' || peek().v === '/')) { const op = next().v, b = unary(), l = a; a = op === '*' ? sc => l(sc) * b(sc) : sc => l(sc) / b(sc); }
      return a;
    }
    function unary() {
      if (peek() && peek().v === '-') { next(); const a = unary(); return sc => -a(sc); }
      if (peek() && peek().v === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const a = primary();
      if (peek() && peek().v === '^') { next(); const b = unary(); return sc => Math.pow(a(sc), b(sc)); }
      return a;
    }
    function primary() {
      const t = next();
      if (!t) throw new Error('The equation ends unexpectedly');
      if (t.t === 'n') return () => t.v;
      if (t.v === '(') { const a = expr(); expect(')'); return a; }
      if (t.t === 'i') {
        if (peek() && peek().v === '(') {
          const fn = FUN[t.v.toLowerCase()];
          if (!fn) throw new Error('Unknown function “' + t.v + '”');
          next();
          const args = [expr()];
          while (peek() && peek().v === ',') { next(); args.push(expr()); }
          expect(')');
          return sc => fn(...args.map(g => g(sc)));
        }
        if (/^x$/i.test(t.v)) return sc => sc.x;
        if (Object.prototype.hasOwnProperty.call(CONST, t.v)) { const c = CONST[t.v]; return () => c; }
        let k = params.indexOf(t.v);
        if (k < 0) { params.push(t.v); k = params.length - 1; }
        const kk = k;
        return sc => sc.p[kk];
      }
      throw new Error('Unexpected “' + t.v + '”');
    }
    const g = expr();
    if (i < toks.length) throw new Error('Unexpected “' + toks[i].v + '”');
    if (!params.length) throw new Error('The equation has no parameters to fit');
    return { params, f: (x, p) => g({ x, p }) };
  };
  M.custom = function (src, start) {
    const c = M.compile(src);
    return {
      id: 'custom', name: 'User-defined equation', field: 'Custom', eq: 'Y = ' + String(src).replace(/^\s*y\s*=/i, '').trim(), params: c.params, f: c.f,
      guess: F => c.params.map(n => (start && isFinite(start[n]) ? start[n] : 1))
    };
  };

  /* ---------- fitting ---------- */
  function okFor(m, xs, ys) {
    const need = m.needs || '';
    if (need.includes('x>0') && xs.some(x => x <= 0)) return false;
    if (need.includes('x>=0') && xs.some(x => x < 0)) return false;
    if (need.includes('y>0') && ys.some(y => y <= 0)) return false;
    return true;
  }
  M.applicable = okFor;

  /* opts: {fixed: {index: value}, weight: 'none'|'1/y2'|'1/y'} */
  M.fit = function (model, xs, ys, opts) {
    opts = opts || {};
    if (!okFor(model, xs, ys)) return { error: 'This model needs ' + model.needs.replace(/,/g, ' and ').replace('x>0', 'all X > 0').replace('x>=0', 'X ≥ 0').replace('y>0', 'all Y > 0') + '.' };
    if (xs.length <= model.params.length) return { error: 'More data points than parameters are needed (' + model.params.length + ' parameters).' };
    const F = feat(xs, ys);
    let starts = model.guess(F, xs, ys);
    if (!Array.isArray(starts[0])) starts = [starts];
    starts = starts.map(s => s.map(v => (isFinite(v) ? v : 1)));
    const fixed = model.params.map((_, j) => opts.fixed && opts.fixed[j] != null && isFinite(opts.fixed[j]));
    starts = starts.map(s => s.map((v, j) => (fixed[j] ? opts.fixed[j] : v)));
    /* also jitter each start a little to escape bad basins */
    const more = [];
    starts.forEach(s => { more.push(s.map((v, j) => (fixed[j] ? v : v * 1.5 || 0.5))); more.push(s.map((v, j) => (fixed[j] ? v : v * 0.6 || -0.5))); });
    const w = ys.map(y => (opts.weight === '1/y2' ? (y ? 1 / (y * y) : 1) : opts.weight === '1/y' ? (y ? 1 / Math.abs(y) : 1) : 1));
    const fit = S.multistart(model.f, xs, ys, starts.concat(more), { fixed, w });
    if (!fit || !fit.p.every(isFinite)) return { error: 'The fit did not converge. Try another model, fix a parameter, or check the data.' };
    const derived = (model.derived || []).map(d => {
      const v = d.f(fit.p);
      const se = S.deltaSE(d.f, fit);
      return { name: d.name, value: v, se, ci: [v - fit.tq * se, v + fit.tq * se] };
    });
    /* residual diagnostics: runs test */
    const res = xs.map((x, i) => ys[i] - model.f(x, fit.p));
    const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
    const signs = order.map(i => res[i] > 0).filter((_, i) => res[order[i]] !== 0);
    let runs = signs.length ? 1 : 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) runs++;
    const np = signs.filter(Boolean).length, nm = signs.length - np;
    let runsP = NaN;
    if (np > 0 && nm > 0) {
      const mu = 2 * np * nm / (np + nm) + 1;
      const v = 2 * np * nm * (2 * np * nm - np - nm) / ((np + nm) ** 2 * (np + nm - 1));
      runsP = v > 0 ? S.ncdf((runs - mu + 0.5) / Math.sqrt(v)) : NaN;
    }
    const warn = [];
    fit.free.forEach(j => {
      if (fit.se[j] > 0 && Math.abs(fit.p[j]) > 0 && fit.se[j] > 2 * Math.abs(fit.p[j])) warn.push('Parameter ' + model.params[j] + ' is poorly determined (standard error larger than twice its value).');
    });
    if (!fit.cov) warn.push('The covariance matrix could not be computed; parameters may be redundant.');
    if (isFinite(runsP) && runsP < 0.05) warn.push('Residuals show systematic deviation from the curve (runs test p = ' + runsP.toFixed(3) + '). The model may not describe the data.');
    return { model, fit, derived, residuals: res, runs, runsP, warn, xs, ys };
  };

  /* Fit every applicable library model and rank by AICc. */
  M.autofit = function (xs, ys, opts) {
    opts = opts || {};
    const out = [];
    for (const m of L) {
      if (opts.only && !opts.only.includes(m.id)) continue;
      if (opts.fields && !opts.fields.includes(m.field)) continue;
      if (!okFor(m, xs, ys) || xs.length < m.params.length + 2) continue;
      let r;
      try { r = M.fit(m, xs, ys, {}); } catch (e) { r = { error: String(e) }; }
      if (r.error) continue;
      if (!isFinite(r.fit.aicc) || !(r.fit.r2 > 0)) continue;
      out.push(r);
    }
    out.sort((a, b) => a.fit.aicc - b.fit.aicc);
    /* the same curve under different names (e.g. Langmuir and Michaelis–Menten) is listed once */
    const uniq = [];
    out.forEach(r => {
      const twin = uniq.find(u => u.fit.k === r.fit.k && Math.abs(u.fit.ssr - r.fit.ssr) <= 1e-7 * Math.max(u.fit.ssr, 1e-300));
      if (twin) (twin.equivalent = twin.equivalent || []).push(r.model.name); else uniq.push(r);
    });
    const w = S.akaikeWeights(uniq.map(r => r.fit.aicc));
    uniq.forEach((r, i) => { r.weight = w[i]; r.dAICc = r.fit.aicc - uniq[0].fit.aicc; });
    return uniq;
  };

  root.BF.models = M;
})(typeof window !== 'undefined' ? window : globalThis);
