/* The write-up under every analysis in Studio: Methods, Results, Figure legend and Interpretation,
   written from the engine's numbers in the register of a methods section. Each writer receives
   the analysis result, its options and the table, and returns sections for U.renderReport. The
   same text feeds the Facet report. Works in the browser and in Node (tests). */
(function (root) {
  'use strict';
  const W = { kinds: {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && isFinite(v);
  const nf = (v, s) => { if (!isNum(v)) return '–'; const a = Math.abs(v); if (Number.isInteger(v) && a < 1e6) return String(v); if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential((s || 4) - 1).replace(/\.?0+e/, 'e'); return String(Number(v.toPrecision(s || 4))); };
  const pf = p => (!isNum(p) ? 'p not available' : p < 0.0001 ? 'p &lt; 0.0001' : 'p = ' + p.toFixed(p < 0.001 ? 4 : 3));
  const join = a => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const unitOf = s => ((String(s || '').match(/\(([^)]+)\)\s*$/) || [])[1] || '').trim();
  const nameOf = s => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const u = (v, unit, s) => nf(v, s) + (unit ? ' ' + unit : '');
  const pm = (v, se, unit, s) => nf(v, s) + ' ± ' + nf(se, 2) + (unit ? ' ' + unit : '');
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const p = s => `<p>${s}</p>`;
  const axes = t => { const x = (t && t.cols && t.cols[0]) || 'X', y = (t && (t.ylabel || (t.cols && t.cols[1]))) || 'Y'; return { x: nameOf(x), y: nameOf(y), xu: unitOf(x), yu: unitOf(y), xl: x, yl: y }; };
  const site = ctx => (ctx && ctx.site) || 'siba-p.github.io/lattent';
  const software = ctx => `Analyses were performed with Lattent (${esc(site(ctx))}), whose engine is checked against SciPy and NumPy on every release.`;
  const interp = (kind, res, o, t, ctx) => { try { const R = root.BF && root.BF.report; if (!R || !R.interpret) return ''; const txt = R.interpret({ kind, res, opts: o, label: (ctx && ctx.label) || kind, t: { name: t.name, cols: t.cols } }); return txt ? p(esc(txt)) : ''; } catch (e) { return ''; } };
  const pack = (kind, res, o, t, ctx, methods, results, legend) => {
    const out = [{ title: 'Methods', html: methods }, { title: 'Results', html: results }];
    if (legend) out.push({ title: 'Figure legend', html: legend });
    const i = interp(kind, res, o, t, ctx); if (i) out.push({ title: 'Interpretation', html: i });
    return out;
  };
  const WEIGHT = { none: 'unweighted (constant absolute error)', '1/y': 'weighted by 1/Y (variance proportional to the signal)', '1/y2': 'weighted by 1/Y² (constant relative error)' };
  const r2word = r2 => (r2 >= 0.99 ? 'close' : r2 >= 0.95 ? 'good' : r2 >= 0.9 ? 'fair' : 'poor');

  /* ---------- nonlinear regression ---------- */
  W.kinds.nlfit = function (res, o, t, ctx) {
    const ok = res.fits.filter(f => !f.r.error); if (!ok.length) return null;
    const m = res.model, a = axes(t), reps = ok[0].s.reps || 1, fixed = m.params.filter((q, j) => o.fixed && o.fixed[j] != null && o.fixed[j] !== '');
    const methods = p(`${esc(a.y)} was measured as a function of ${esc(a.x)}${a.xu ? ' (' + esc(a.xu) + ')' : ''}${reps > 1 ? `; each point is the mean of ${reps} replicate columns` : ''}. The ${ok.length > 1 ? ok.length + ' data sets (' + join(ok.map(f => esc(f.s.name))) + ') were' : 'data were'} fitted by nonlinear least squares (Levenberg–Marquardt) to the ${esc(m.name)} model, ${esc(m.eq)}, with parameters ${join(m.params.map(esc))}${fixed.length ? `; ${join(fixed.map(esc))} ${fixed.length > 1 ? 'were' : 'was'} held fixed` : ''}. The fit was ${WEIGHT[o.weight] || WEIGHT.none}${o.logx ? ', with X on a logarithmic axis for display' : ''}. Starting values were chosen automatically from the data. Parameter uncertainties are asymptotic standard errors from the Jacobian at the solution; 95% confidence intervals use the t distribution with n − k degrees of freedom${ok[0].r.derived.length ? `, and derived quantities (${join(ok[0].r.derived.map(d => esc(d.name)))}) were propagated by the delta method` : ''}. Goodness of fit is reported as R², the standard error of the estimate S<sub>y·x</sub>, the corrected Akaike information criterion (AICc) and a runs test on the residuals. ${software(ctx)}`)
      + (m.note ? p(`Model note: ${esc(m.note)}`) : '');
    const results = ok.map(f => { const fit = f.r.fit, syx = Math.sqrt(fit.ssrUnweighted / fit.dof);
      const pars = m.params.map((q, j) => fit.fixed[j] ? `${esc(q)} = ${nf(fit.p[j])} (fixed)` : `${esc(q)} = ${nf(fit.p[j])} ± ${nf(fit.se[j], 2)} (95% CI ${nf(fit.ci[j][0], 3)} to ${nf(fit.ci[j][1], 3)})`);
      const der = f.r.derived.map(d => `${esc(d.name)} = ${nf(d.value)} ± ${nf(d.se, 2)}`);
      let s = `<b>${esc(f.s.name)}</b> (n = ${fit.n}, ${fit.dof} degrees of freedom): ${join(pars)}.${der.length ? ' Derived: ' + join(der) + '.' : ''} The fit is ${r2word(fit.r2)} (R² = ${fit.r2.toFixed(4)}, S<sub>y·x</sub> = ${nf(syx, 3)}${a.yu ? ' ' + esc(a.yu) : ''}, AICc = ${fit.aicc.toFixed(2)})${isNum(f.r.runsP) ? `; the runs test on the residuals gives ${pf(f.r.runsP)}, ${f.r.runsP < 0.05 ? 'so the residuals are not randomly distributed and the model misses some systematic structure' : 'consistent with randomly distributed residuals'}` : ''}.`;
      if (f.r.warn && f.r.warn.length) s += ' ' + f.r.warn.map(w => esc(w)).join(' ');
      return p(s); }).join('');
    const legend = p(`${esc(a.y)}${a.yu ? ' (' + esc(a.yu) + ')' : ''} against ${esc(a.x)}${a.xu ? ' (' + esc(a.xu) + ')' : ''} for ${join(ok.map(f => esc(f.s.name)))}. Symbols: measured values${reps > 1 ? ` (mean ± SD of ${reps} replicates)` : ''}; line: least-squares fit of the ${esc(m.name)} model; shaded band: 95% confidence band of the fitted curve.${o.logx || o.logy ? ` ${o.logx && o.logy ? 'Both axes are' : o.logx ? 'The X axis is' : 'The Y axis is'} logarithmic.` : ''}`);
    return pack('nlfit', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- automatic model selection ---------- */
  W.kinds.autofit = function (res, o, t, ctx) {
    const l = res.list; if (!l || !l.length) return null;
    const a = axes(t), b = l[0], n = (b.fit && b.fit.n) || '';
    const methods = p(`${l.length} candidate equations from Lattent’s library that apply to ${esc(res.s.name)}${o.field && o.field !== 'all' ? ` (${o.field === 'shape' ? 'those matching the recognised shape of the data' : 'the ' + esc(o.field) + ' set'})` : ''} were each fitted by nonlinear least squares and compared with the corrected Akaike information criterion, AICc = n ln(SS/n) + 2k + 2k(k + 1)/(n − k − 1), which rewards closeness to the data while penalising the number of parameters k. Differences Δ<sub>i</sub> = AICc<sub>i</sub> − AICc<sub>min</sub> were converted to Akaike weights w<sub>i</sub> = exp(−Δ<sub>i</sub>/2) / Σ exp(−Δ<sub>j</sub>/2), the relative likelihood of each model given the data. By convention Δ &lt; 2 indicates substantial support, 4–7 considerably less and &gt; 10 essentially none. ${software(ctx)}`);
    const top = l.slice(0, 5).map((x, i) => `${i + 1}. ${esc(x.model.name)}: R² = ${x.fit.r2.toFixed(4)}, AICc = ${x.fit.aicc.toFixed(2)}, Δ = ${x.dAICc.toFixed(2)}, w = ${(100 * x.weight).toFixed(1)}%`);
    const within = l.filter(x => x.dAICc < 2).length;
    const pars = b.fit && b.fit.p && b.model.params ? ' Its parameters are ' + join(b.model.params.map((q, j) => `${esc(q)} = ${nf(b.fit.p[j])}${b.fit.se ? ' ± ' + nf(b.fit.se[j], 2) : ''}`)) + '.' : '';
    const results = p(`The best-supported model for ${esc(res.s.name)}${n ? ` (n = ${n})` : ''} is the ${esc(b.model.name)} (Akaike weight ${(100 * b.weight).toFixed(0)}%, R² = ${b.fit.r2.toFixed(4)}).${pars} ${within > 1 ? `${within} models lie within 2 AICc units of the best, so the data do not single out one of them` : l[1] ? `The next model, the ${esc(l[1].model.name)}, is ${l[1].dAICc.toFixed(1)} AICc units behind (weight ${(100 * l[1].weight).toFixed(0)}%)` : 'No other model was applicable'}.`) + p('Ranking: ' + top.join('; ') + '.');
    const legend = p(`${esc(a.y)} against ${esc(a.x)} for ${esc(res.s.name)}: measured values (symbols) with the best-ranked model, the ${esc(b.model.name)} (line).`);
    return pack('autofit', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- linear regression ---------- */
  W.kinds.linreg = function (res, o, t, ctx) {
    const ok = res.fits.filter(f => f.f); if (!ok.length) return null;
    const a = axes(t);
    const methods = p(`${esc(a.y)} was regressed on ${esc(a.x)} by ordinary least squares for ${ok.length > 1 ? 'each data set' : 'the data'}. Slope and intercept are reported with standard errors and 95% confidence intervals from the t distribution; the X-intercept was obtained from the fitted line with its standard error by the delta method, and the Pearson correlation coefficient with a Fisher-z confidence interval. The slope was tested against zero with a two-sided t test.${res.cmp ? ' Slopes were compared with an extra-sum-of-squares F test against a model with one common slope.' : ''} ${software(ctx)}`);
    const results = ok.map(f => p(`<b>${esc(f.s.name)}</b> (n = ${f.f.n}): slope = ${nf(f.f.p[1])} ± ${nf(f.f.se[1], 2)}${a.yu && a.xu ? ' ' + esc(a.yu) + '/' + esc(a.xu) : ''} (95% CI ${nf(f.f.ci[1][0], 3)} to ${nf(f.f.ci[1][1], 3)}; ${pf(f.pSlope)} for slope ≠ 0), intercept = ${nf(f.f.p[0])} ± ${nf(f.f.se[0], 2)}${a.yu ? ' ' + esc(a.yu) : ''}, X-intercept = ${nf(f.xint)}${isNum(f.xintSE) ? ' ± ' + nf(f.xintSE, 2) : ''}; r = ${f.pr.r.toFixed(4)} (95% CI ${f.pr.lo.toFixed(3)} to ${f.pr.hi.toFixed(3)}), R² = ${f.f.r2.toFixed(4)}.`)).join('')
      + (res.cmp ? p(`The slopes ${res.cmp.p < 0.05 ? 'differ' : 'do not differ'} significantly (F(${res.cmp.df1}, ${res.cmp.df2}) = ${res.cmp.F.toFixed(2)}, ${pf(res.cmp.p)}).`) : '');
    const legend = p(`${esc(a.y)} against ${esc(a.x)}: measured values (symbols) with least-squares lines and their 95% confidence bands.`);
    return pack('linreg', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- peak fitting and XRD ---------- */
  W.kinds.peaks = function (res, o, t, ctx) {
    const a = axes(t), xu = a.xu, pk = res.pf.peaks, n = pk.length, shape = { gauss: 'Gaussian', lorentz: 'Lorentzian', pv: 'pseudo-Voigt' }[o.shape] || 'pseudo-Voigt';
    const base = o.baseline === 'none' ? 'No baseline was subtracted.' : `A ${['constant', 'linear', 'quadratic', 'cubic'][+o.baseline]} baseline was estimated by iterative polynomial fitting, in which points above the current baseline are progressively excluded so that the polynomial follows the background rather than the peaks, and subtracted.`;
    let methods = p(`${base} Peaks were located on the signal smoothed with a Savitzky–Golay filter (half-window ${o.smooth || 3} points) using a prominence threshold of ${o.prominence || 5}% of the maximum, and all ${n} were then fitted simultaneously by nonlinear least squares with ${shape} profiles${o.shape === 'pv' ? ', each with its own Lorentzian fraction η' : ''} and a linear local background. Each peak is characterised by its centre, height, full width at half maximum (FWHM) and integrated area${o.shape === 'pv' ? ' (from height, FWHM and η)' : ''}, with standard errors from the fit.`)
      + (res.xr ? p(`Treating X as 2θ, interplanar spacings were obtained from Bragg’s law, d = λ / (2 sin θ), with λ = ${o.lambda} Å. Crystallite sizes were estimated for each reflection with the Scherrer equation, D = Kλ / (β cos θ), where K = ${o.K} and β is the FWHM in radians after removing the instrumental broadening ${o.inst ? `of ${o.inst}° in quadrature (β² = FWHM² − β<sub>inst</sub>²)` : '(none specified)'}. ${res.xr.wh ? 'Size and microstrain were separated with a Williamson–Hall analysis, β cos θ = Kλ/D + 4ε sin θ, fitted by least squares across all reflections (uniform deformation model); its intercept gives D and its slope the microstrain ε.' : 'At least three reflections are needed for a Williamson–Hall analysis.'} Scherrer sizes are lower bounds because strain also broadens peaks, and values above about 100 nm are unreliable on a laboratory diffractometer.`) : '');
    methods += p(software(ctx));
    const maxH = Math.max(...pk.map(q => q.height));
    const rows = (res.xr ? res.xr.rows : pk).map((q, i) => `${i + 1}: ${res.xr ? '2θ = ' : ''}${nf(q.center, 5)}${xu ? (xu === '°' ? '°' : ' ' + esc(xu)) : ''} ± ${nf(q.centerSE, 2)}, FWHM ${nf(q.fwhm, 3)}${xu ? (xu === '°' ? '°' : ' ' + esc(xu)) : ''}, relative intensity ${(100 * q.height / maxH).toFixed(1)}%${o.shape === 'pv' ? ', η = ' + q.eta.toFixed(2) : ''}${res.xr ? `, d = ${nf(q.d, 4)} Å, D = ${nf(q.size, 3)} nm` : ''}`);
    let results = p(`${n} peak${n === 1 ? ' was' : 's were'} resolved with an overall fit of R² = ${res.pf.r2.toFixed(4)}. ${rows.join('; ')}.`);
    if (res.xr) { const wh = res.xr.wh; results += p(`The mean Scherrer crystallite size over ${res.xr.rows.length} reflection${res.xr.rows.length === 1 ? '' : 's'} is ${nf(res.xr.meanSize, 3)} nm (range ${nf(Math.min(...res.xr.rows.map(q => q.size)), 3)} to ${nf(Math.max(...res.xr.rows.map(q => q.size)), 3)} nm).${wh ? ` The Williamson–Hall plot (R² = ${wh.r2.toFixed(3)}) gives D = ${isNum(wh.size) ? nf(wh.size, 3) + ' nm' : 'not determined'} and a microstrain ε = ${nf(100 * wh.strain, 3)}%${wh.strain < 0 ? ' (a negative slope has no physical meaning and indicates that the broadening is dominated by size or that the instrumental correction is too small)' : ''}.` : ''}`); }
    const legend = p(`${res.xr ? 'X-ray diffraction pattern' : 'Spectrum'} of ${esc(t.name)}: measured intensity (symbols or thin line), the fitted sum of ${n} ${shape} profile${n === 1 ? '' : 's'} (solid line) and the fitted baseline (dashed). Vertical markers indicate the fitted peak centres.${res.xr && res.xr.wh ? ' The Williamson–Hall plot shows β cos θ against 4 sin θ with its least-squares line.' : ''}`);
    return pack('peaks', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- Tauc band gap ---------- */
  W.kinds.tauc = function (res, o, t, ctx) {
    const r = res.r, tr = String(o.transition || 'direct'), expo = { direct: '2', indirect: '1/2', 'direct-forbidden': '2/3', 'indirect-forbidden': '1/3' }[tr] || '2';
    const methods = p(`The ${res.r.isNm ? 'wavelength axis was converted to photon energy, hν = 1239.84 / λ (eV, nm), and the ' : ''}absorbance A was taken as proportional to the absorption coefficient α (the sample thickness and reflection losses cancel in the position of the intercept). A Tauc plot of (αhν)<sup>${expo}</sup> against hν was constructed for a ${tr.replace('-', ' ')} transition (Tauc exponent r = ${({ direct: '1/2', indirect: '2', 'direct-forbidden': '3/2', 'indirect-forbidden': '3' })[tr] || '1/2'}), and the band gap E<sub>g</sub> was obtained by extrapolating the linear part of the absorption edge, ${r.region[0].toFixed(2)} to ${r.region[1].toFixed(2)} eV, ${o.emin !== '' && o.emin != null ? 'set by hand' : 'chosen automatically as the steepest linear segment'} and fitted by least squares, to (αhν)<sup>${expo}</sup> = 0. The standard error of E<sub>g</sub> follows from the slope and intercept by the delta method and the 95% interval from the t distribution. ${software(ctx)}`);
    const results = p(`The ${tr.replace('-', ' ')} optical band gap is E<sub>g</sub> = ${r.Eg.toFixed(3)} ± ${r.se.toFixed(3)} eV (95% CI ${r.ci[0].toFixed(2)} to ${r.ci[1].toFixed(2)} eV), from a linear region of ${r.region[0].toFixed(2)} to ${r.region[1].toFixed(2)} eV with R² = ${r.r2.toFixed(4)}. The corresponding absorption edge is at ${(1239.84 / r.Eg).toFixed(0)} nm.`);
    const legend = p(`Tauc plot of ${esc(t.name)}: (αhν)<sup>${expo}</sup> against photon energy hν for a ${tr.replace('-', ' ')} transition. The highlighted points form the linear region; the straight line is its least-squares fit, extrapolated to the energy axis at E<sub>g</sub> = ${r.Eg.toFixed(2)} eV.`);
    return pack('tauc', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- tensile test ---------- */
  W.kinds.tensile = function (res, o, t, ctx) {
    const r = res.r, a = axes(t), su = a.yu || '', big = /MPa/i.test(su) && r.E > 2000, Eu = big ? 'GPa' : su, Ev = big ? r.E / 1000 : r.E, Ese = big ? r.Ese / 1000 : r.Ese;
    const methods = p(`Strain was taken ${r.pct ? 'in percent and converted to a fraction' : 'as a fraction'}. Young’s modulus E was obtained by linear regression over the steepest linear segment of the initial loading curve, chosen automatically${isNum(r.toe) && r.toe > 0 ? `; a toe region of ${nf(100 * r.toe, 2)}% strain before that segment was excluded` : ''}. The yield strength was determined by the ${o.offset || 0.2}% offset method as the stress at which the curve meets a line of slope E displaced by ${o.offset || 0.2}% strain; the ultimate tensile strength is the maximum stress; elongation at break is the strain at the last point; and toughness is the area under the stress–strain curve to failure by trapezoidal integration (in ${su ? esc(su) : 'stress units'}, numerically equal to energy per unit volume). ${software(ctx)}`);
    const results = p(`E = ${nf(Ev, 3)} ± ${nf(Ese, 2)} ${esc(Eu)} (from ${nf(100 * r.region[0], 2)} to ${nf(100 * r.region[1], 2)}% strain); yield strength (${o.offset || 0.2}% offset) = ${u(r.yieldS, su, 3)} at ${nf(100 * r.yieldE, 3)}% strain; ultimate tensile strength = ${u(r.uts, su, 3)} at ${nf(100 * r.eUTS, 3)}% strain; elongation at break = ${nf(100 * r.elong, 3)}%; toughness = ${u(r.toughness, su, 3)}.`);
    const legend = p(`Engineering stress–strain curve of ${esc(t.name)}. The straight line through the elastic region has slope E; the dashed line is the ${o.offset || 0.2}% offset construction, and its intersection with the curve marks the yield strength. The ultimate tensile strength is the maximum of the curve.`);
    return pack('tensile', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- area under the curve ---------- */
  W.kinds.auc = function (res, o, t, ctx) {
    const a = axes(t), unit = a.xu && a.yu ? `${esc(a.yu)}·${esc(a.xu)}` : '';
    const methods = p(`The area under each ${esc(a.y)} curve was computed by trapezoidal integration between successive X values${o.base === 'min' ? ', measured from the minimum Y value' : o.base === 'line' ? ', measured from the straight line joining the first and last points' : ', measured from Y = 0'}. Area above the baseline is counted as positive and area below as negative. ${software(ctx)}`);
    const results = res.list.map(l => p(`<b>${esc(l.s.name)}</b>: total area ${u(l.r.total, unit, 4)} (positive ${nf(l.r.positive, 4)}, negative ${nf(l.r.negative, 4)}); the maximum of ${nf(l.r.peakY, 4)}${a.yu ? ' ' + esc(a.yu) : ''} occurs at ${esc(a.x)} = ${nf(l.r.peakX, 4)}${a.xu ? ' ' + esc(a.xu) : ''}.`)).join('');
    const legend = p(`${esc(a.y)} against ${esc(a.x)} for ${join(res.list.map(l => esc(l.s.name)))}, with the integrated area shaded between the curve and the baseline.`);
    return pack('auc', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- smoothing and derivatives ---------- */
  W.kinds.smooth = function (res, o, t, ctx) {
    const a = axes(t), d = +o.deriv || 0, half = +o.half || 5, order = +o.order || 2;
    const methods = p(`The ${esc(a.y)} signal was smoothed with a Savitzky–Golay filter: within a moving window of ${2 * half + 1} points, a polynomial of order ${order} was fitted by least squares and ${d ? `its ${d === 1 ? 'first' : 'second'} derivative` : 'its value'} at the centre taken as the output${d ? ', divided by the sampling interval in X' : ''}. The filter preserves peak heights and widths better than a moving average. ${software(ctx)}`);
    const out = res.out || [], x = res.x || [], iMax = out.reduce((b, v, i) => (v > out[b] ? i : b), 0), iMin = out.reduce((b, v, i) => (v < out[b] ? i : b), 0);
    const results = p(`${out.length} points were processed. The ${d ? (d === 1 ? 'first derivative' : 'second derivative') : 'smoothed signal'} reaches its maximum, ${nf(out[iMax], 4)}, at ${esc(a.x)} = ${nf(x[iMax], 4)}${a.xu ? ' ' + esc(a.xu) : ''} and its minimum, ${nf(out[iMin], 4)}, at ${esc(a.x)} = ${nf(x[iMin], 4)}${a.xu ? ' ' + esc(a.xu) : ''}.${d === 1 ? ' Zero crossings of the first derivative mark the extrema of the original signal.' : d === 2 ? ' Minima of the second derivative mark the positions of peaks, including shoulders.' : ''}`);
    const legend = p(`${esc(t.name)}: the measured signal${d ? ' and its ' + (d === 1 ? 'first' : 'second') + ' derivative' : ' (thin) and the smoothed signal (bold)'} against ${esc(a.x)}.`);
    return pack('smooth', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- descriptive statistics ---------- */
  W.kinds.describe = function (res, o, t, ctx) {
    const ds = res.ds || []; if (!ds.length) return null;
    const yu = unitOf(res.ylabel), sym = o.err === 'sem' ? 'mean ± SEM' : o.err === 'ci' ? 'mean ± 95% CI' : 'mean ± SD';
    const methods = p(`For each group the arithmetic mean, standard deviation (SD, n − 1 denominator), standard error of the mean (SEM), 95% confidence interval of the mean (t distribution), median, quartiles, range, coefficient of variation and, where all values are positive, the geometric mean were computed. Normality was assessed with the D’Agostino–Pearson K² test (needs at least 8 values) and a single outlier was screened for with Grubbs’ test at α = 0.05. ${software(ctx)}`);
    const results = ds.map(x => { const d = x.d; return p(`<b>${esc(x.name)}</b> (n = ${d.n}): mean ${u(d.mean, yu, 4)}, SD ${nf(d.sd, 3)}, SEM ${nf(d.sem, 3)}, 95% CI ${nf(d.ci[0], 4)} to ${nf(d.ci[1], 4)}; median ${nf(d.median, 4)} (quartiles ${nf(d.q1, 4)} to ${nf(d.q3, 4)}), range ${nf(d.min, 4)} to ${nf(d.max, 4)}, CV ${d.cv.toFixed(1)}%. ${x.n && !x.n.error ? `Normality: K² = ${x.n.K2.toFixed(2)}, ${pf(x.n.p)}${x.n.p < 0.05 ? ' (departs from normality)' : ' (no evidence against normality)'}.` : 'Normality not tested (fewer than 8 values).'} ${x.gr ? (x.gr.outlier ? `Grubbs’ test flags ${nf(x.gr.value, 4)} as an outlier (G = ${x.gr.G.toFixed(2)} > ${x.gr.Gcrit.toFixed(2)}).` : 'No outlier by Grubbs’ test.') : ''}`); }).join('');
    const legend = p(`${esc(nameOf(res.ylabel))}${yu ? ' (' + esc(yu) + ')' : ''} for ${join(ds.map(x => esc(x.name)))}: individual values with ${sym}.`);
    return pack('describe', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- two groups ---------- */
  W.kinds.ttest = function (res, o, t, ctx) {
    const r = res.r, A = res.a, B = res.b, yu = unitOf(res.ylabel);
    const name = { welch: 'Welch’s unpaired t test, which does not assume equal variances', student: 'Student’s unpaired t test with pooled variance', paired: 'a paired t test on the within-pair differences', mw: 'the two-sided Mann–Whitney U test, a rank test that assumes no particular distribution' }[o.test] || 'Welch’s unpaired t test';
    const methods = p(`${esc(A.name)} (n = ${A.v.length}) and ${esc(B.name)} (n = ${B.v.length}) were compared with ${name} at α = 0.05, two-tailed.${o.test === 'mw' ? ` The p value is ${r.exact ? 'exact' : 'from the normal approximation with continuity correction'}.` : ' The difference of means is reported with its 95% confidence interval and the standardised effect size (Cohen’s d).'} ${software(ctx)}`);
    const summ = `${esc(A.name)}: ${u(mean(A.v), yu, 4)} ± ${nf(sd(A.v), 3)}; ${esc(B.name)}: ${u(mean(B.v), yu, 4)} ± ${nf(sd(B.v), 3)} (mean ± SD).`;
    const results = o.test === 'mw'
      ? p(`${summ} Medians are ${nf(r.medA, 4)} and ${nf(r.medB, 4)}. U = ${nf(r.U, 4)}, ${pf(r.p)}: the groups ${r.p < 0.05 ? 'differ' : 'do not differ'} significantly.`)
      : p(`${summ} The ${o.test === 'paired' ? 'mean paired difference' : 'difference of means'} is ${u(r.diff, yu, 4)} (95% CI ${nf(r.lo, 4)} to ${nf(r.hi, 4)}), t(${nf(r.df, 3)}) = ${r.t.toFixed(3)}, ${pf(r.p)}; the groups ${r.p < 0.05 ? 'differ' : 'do not differ'} significantly. Effect size ${o.test === 'paired' ? 'd<sub>z</sub>' : 'd'} = ${nf(o.test === 'paired' ? r.dz : r.d, 2)}${isNum(o.test === 'paired' ? r.dz : r.d) ? ` (${Math.abs(o.test === 'paired' ? r.dz : r.d) < 0.2 ? 'negligible' : Math.abs(o.test === 'paired' ? r.dz : r.d) < 0.5 ? 'small' : Math.abs(o.test === 'paired' ? r.dz : r.d) < 0.8 ? 'medium' : 'large'} by Cohen’s convention)` : ''}.`);
    const legend = p(`${esc(nameOf(res.ylabel))}${yu ? ' (' + esc(yu) + ')' : ''} for ${esc(A.name)} and ${esc(B.name)}: individual values with mean ± SD.`);
    return pack('ttest', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- several groups ---------- */
  W.kinds.anova = function (res, o, t, ctx) {
    const r = res.r, yu = unitOf(res.ylabel), g = r.groups || [];
    const test = { ordinary: 'one-way analysis of variance (ANOVA)', welch: 'Welch’s ANOVA, which does not assume equal variances', kw: 'the Kruskal–Wallis test, a rank-based alternative to ANOVA' }[o.test] || 'one-way ANOVA';
    const post = { tukey: 'Tukey’s honestly-significant-difference test for all pairs', holm: 'Holm–Šidák-corrected pairwise t tests', control: 'Holm–Šidák-corrected comparisons of each group with the control' }[o.post] || 'Tukey’s test';
    const pk = o.post === 'tukey' ? 'pTukey' : 'pHolm';
    const methods = p(`${g.length} groups (${join(g.map(x => esc(x.name) + ', n = ' + x.n))}) were compared with ${test}, followed by ${post}, which controls the family-wise error rate across the ${r.pairs ? r.pairs.length : ''} comparisons. Homogeneity of variance was assessed with the Brown–Forsythe test and normality within groups with the D’Agostino–Pearson test. The effect size is reported as η² (the fraction of total variance between groups). Data are shown as ${o.err === 'sem' ? 'mean ± SEM' : o.err === 'ci' ? 'mean ± 95% CI' : 'mean ± SD'} with individual values. ${software(ctx)}`);
    const pMain = o.test === 'welch' ? r.welch.p : o.test === 'kw' ? r.kw.p : r.p;
    const main = o.test === 'kw' ? `H = ${r.kw.H.toFixed(2)}, ${pf(r.kw.p)}` : o.test === 'welch' ? `Welch’s F(${nf(r.welch.df1 || r.dfb, 3)}, ${nf(r.welch.df2, 3)}) = ${r.welch.F.toFixed(2)}, ${pf(r.welch.p)}` : `F(${r.dfb}, ${r.dfw}) = ${r.F.toFixed(2)}, ${pf(r.p)}, η² = ${r.eta2.toFixed(3)}`;
    const means = g.map(x => `${esc(x.name)} ${u(x.mean, yu, 4)} ± ${nf(x.sd, 3)}`);
    const sig = (r.pairs || []).filter(x => x[pk] < 0.05), ns = (r.pairs || []).length - sig.length;
    let results = p(`Group means (± SD): ${join(means)}. The groups ${pMain < 0.05 ? 'differ' : 'do not differ'} significantly overall (${main}).`);
    const postTxt = sig.length ? `Post tests: ${join(sig.map(x => `${esc(x.a)} vs ${esc(x.b)} (${isNum(x.diff) ? 'difference ' + nf(x.diff, 3) + (isNum(x.lo) ? ', 95% CI ' + nf(x.lo, 3) + ' to ' + nf(x.hi, 3) : '') + ', ' : ''}${pf(x[pk])})`))} ${sig.length === 1 ? 'is' : 'are'} significant${ns ? `; the other ${ns} comparison${ns === 1 ? ' is' : 's are'} not` : ''}.` : 'No pairwise comparison is significant after correction.';
    const checks = ` Brown–Forsythe test for equal variances: F = ${r.bf.F.toFixed(2)}, ${pf(r.bf.p)}${r.bf.p < 0.05 ? ' (variances differ; Welch’s ANOVA or a rank test is preferable)' : ' (no evidence of unequal variances)'}.${o.test !== 'welch' && r.welch ? ` For comparison, Welch’s ANOVA gives ${pf(r.welch.p)}` : ''}${o.test !== 'kw' && r.kw ? `${o.test !== 'welch' ? ' and' : ' For comparison,'} the Kruskal–Wallis test gives ${pf(r.kw.p)}.` : '.'}`;
    results += p(postTxt + checks);
    const legend = p(`${esc(nameOf(res.ylabel))}${yu ? ' (' + esc(yu) + ')' : ''} by group: individual values with ${o.err === 'sem' ? 'mean ± SEM' : o.err === 'ci' ? 'mean ± 95% CI' : 'mean ± SD'}. Brackets mark comparisons significant by ${post.replace(/ for all pairs| of each group with the control/, '')}: * p &lt; 0.05, ** p &lt; 0.01, *** p &lt; 0.001.`);
    return pack('anova', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- correlation matrix ---------- */
  W.kinds.corr = function (res, o, t, ctx) {
    const names = res.names, m = res.m; if (!names || !m) return null;
    const sp = o.method === 'spearman';
    const methods = p(`${sp ? 'Spearman rank' : 'Pearson'} correlation coefficients were computed for every pair of the ${names.length} variables (${join(names.map(esc))}) over the ${res.n} samples with complete values. ${sp ? 'Spearman’s ρ is the Pearson correlation of the ranks and measures any monotonic association.' : 'Pearson’s r measures linear association; its 95% confidence interval uses the Fisher z transformation.'} Each coefficient was tested against zero with a two-sided t test on n − 2 degrees of freedom; no correction for multiple comparisons was applied, so with many pairs some small p values are expected by chance. ${software(ctx)}`);
    const pairs = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const c = m[i][j]; if (c && isNum(c.r)) pairs.push({ a: names[i], b: names[j], r: c.r, p: c.p }); }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    const sig = pairs.filter(q => q.p < 0.05);
    const results = p(`Of ${pairs.length} pairs, ${sig.length} ${sig.length === 1 ? 'is' : 'are'} significant at α = 0.05. Strongest: ${join(pairs.slice(0, 4).map(q => `${esc(q.a)} and ${esc(q.b)} (${sp ? 'ρ' : 'r'} = ${q.r.toFixed(3)}, ${pf(q.p)})`))}.${pairs.some(q => Math.abs(q.r) > 0.9) ? ' Pairs with |r| &gt; 0.9 carry nearly the same information and would make regression coefficients unstable if used together.' : ''}`);
    const legend = p(`${sp ? 'Spearman' : 'Pearson'} correlation matrix of ${join(names.map(esc))}; colour encodes the coefficient from −1 to +1.`);
    return pack('corr', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- multiple linear regression ---------- */
  W.kinds.mlr = function (res, o, t, ctx) {
    const r = res.r; if (!r) return null;
    const y = res.names[res.names.length - 1], xs = res.names.slice(0, -1);
    const methods = p(`${esc(y)} was modelled as a linear function of ${join(xs.map(esc))} by ordinary least squares on ${r.n} samples. Coefficients are reported with standard errors, t statistics, two-sided p values and 95% confidence intervals; the overall fit by R², adjusted R² (which penalises the number of predictors) and an F test against the intercept-only model; and the residual standard error s. ${software(ctx)}`);
    const co = r.coefs.map(c => `${esc(c.name)} = ${nf(c.b)} ± ${nf(c.se, 2)} (${pf(c.p)})`);
    const results = p(`${esc(y)} = ${r.coefs.map((c, i) => (i ? (c.b < 0 ? ' − ' : ' + ') + nf(Math.abs(c.b)) + '·' + esc(c.name) : nf(c.b))).join('')}. Coefficients: ${join(co)}. R² = ${r.r2.toFixed(4)}, adjusted R² = ${r.adj.toFixed(4)}, F(${r.coefs.length - 1}, ${r.df}) = ${r.F.toFixed(2)} (${pf(r.pF)}), s = ${nf(r.s, 3)}.`);
    const legend = p(`Predicted against observed ${esc(y)} from the multiple linear regression; the diagonal marks perfect agreement.`);
    return pack('mlr', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- principal component analysis ---------- */
  W.kinds.pca = function (res, o, t, ctx) {
    const r = res.r; if (!r) return null;
    const ex = r.explained, k = Math.min(3, ex.length);
    const methods = p(`The ${r.names.length} variables (${join(r.names.map(esc))}) were standardised to zero mean and unit variance over the ${res.mx.rows.length} samples, and the eigenvectors of their correlation matrix were extracted (Jacobi rotation). Components are ordered by eigenvalue; the loadings give the weight of each variable in a component, and the scores place each sample in the reduced space. The Kaiser criterion (eigenvalue > 1) counts components that carry more variance than one original variable. ${software(ctx)}`);
    const load = (pc, n) => (r.loadings && r.loadings[pc] ? r.loadings[pc].map((v, i) => [r.names[i], v]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n).map(([nm, v]) => `${esc(nm)} (${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)})`) : []);
    const results = p(`${join(ex.slice(0, k).map((v, i) => `PC${i + 1} explains ${(100 * v).toFixed(1)}%`))} of the variance, ${(100 * ex.slice(0, 2).reduce((s, v) => s + v, 0)).toFixed(1)}% for the first two together; ${r.kaiser} component${r.kaiser === 1 ? ' has' : 's have'} an eigenvalue above 1.${load(0, 3).length ? ` PC1 is dominated by ${join(load(0, 3))}${load(1, 3).length ? ` and PC2 by ${join(load(1, 3))}` : ''}.` : ''}`);
    const legend = p(`Principal component analysis of ${esc(t.name)}: scores of the samples on PC1 and PC2, and the variance explained by each component.`);
    return pack('pca', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- k-means ---------- */
  W.kinds.kmeans = function (res, o, t, ctx) {
    const b = res.best; if (!b) return null;
    const methods = p(`The ${res.mx.names.length} variables were standardised to zero mean and unit variance and the ${res.mx.rows.length} samples were partitioned by k-means (Euclidean distance, three random restarts, the lowest within-cluster sum of squares kept).${o.k === 'auto' ? ` The number of clusters was chosen between 2 and ${res.tries.length + 1} by the highest mean silhouette, which compares each sample’s distance to its own cluster with its distance to the nearest other cluster.` : ` The number of clusters, ${o.k}, was set by hand.`} Clusters are shown on the first two principal components. ${software(ctx)}`);
    const k = b.sizes.length, sil = b.silhouette, kOpt = b.k || k;
    const results = p(`${k} clusters of ${join(b.sizes.map(String))} samples were found, with a mean silhouette of ${sil.toFixed(3)} (${sil > 0.7 ? 'strong' : sil > 0.5 ? 'reasonable' : sil > 0.25 ? 'weak' : 'no substantial'} structure).${res.tries.length > 1 ? ' Silhouette by k: ' + res.tries.map(q => `${q.sizes.length}: ${q.silhouette.toFixed(2)}`).join(', ') + '.' : ''}`);
    const legend = p(`Samples of ${esc(t.name)} in the space of the first two principal components, coloured by k-means cluster (k = ${k}); crosses mark cluster centres.`);
    return pack('kmeans', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- Gaussian process and Bayesian optimisation ---------- */
  W.kinds.bo = function (res, o, t, ctx) {
    const g = res.s.gp, names = res.names, yn = names[names.length - 1], ins = names.slice(0, -1);
    const methods = p(`${esc(yn)} was modelled as a function of ${join(ins.map(esc))} with Gaussian-process regression using a squared-exponential kernel with automatic relevance determination (one length-scale per input) and a noise term; hyperparameters were set by maximising the marginal likelihood on the ${res.y.length} measured runs. Predictive accuracy was assessed by leave-one-out cross-validation (Q²). New experiments were proposed by Bayesian optimisation, choosing the inputs that maximise the expected improvement over the best measured value${o.compo ? `, subject to the mixture constraint that the components sum to ${o.total}` : ''}; several suggestions were taken in a batch by penalising points near earlier picks. Input relevance is the normalised inverse length-scale. ${software(ctx)}`);
    const rel = ins.map((n, j) => [n, g.relevance[j]]).sort((a, b) => b[1] - a[1]);
    const picks = (res.s.picks || []).slice(0, 3).map((q, i) => `${i + 1}: ${join(q.x.map((v, j) => `${esc(ins[j])} = ${nf(v, 3)}`))} (predicted ${nf(q.mean, 3)} ± ${nf(q.sd, 2)})`);
    const results = p(`The model reaches Q² = ${g.q2.toFixed(3)} under leave-one-out cross-validation. Relevance of the inputs: ${join(rel.map(([n, v]) => `${esc(n)} ${(100 * v).toFixed(0)}%`))}.${picks.length ? ` Suggested next experiments: ${picks.join('; ')}.` : ''}`);
    const legend = p(`Gaussian-process model of ${esc(yn)}: leave-one-out predictions against measured values with 95% intervals (left) and the relevance of each input (right); the proposed experiments are listed in the table.`);
    return pack('bo', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- symbolic regression ---------- */
  W.kinds.symreg = function (res, o, t, ctx) {
    const r = res.r, b = r.best; if (!b) return null;
    const a = axes(t);
    const methods = p(`Candidate equations were generated by sparse symbolic regression: up to three terms from a library of ${r.library} functions of x (powers, reciprocals, square roots, logarithms, and exponential and saturation terms on grids of scale parameters) were combined linearly${r.results.some(q => q.logTarget) ? ', for y and for ln y' : ''}, and ${Number(r.tried).toLocaleString('en-US')} candidates were ranked by AICc on ${r.errors} errors. The most promising structures were refined by Levenberg–Marquardt least squares. A recognised physical law was preferred when within 14 AICc units of the best generic equation, a margin that corrects for the many generic forms searched. ${software(ctx)}`);
    const results = p(`The selected equation for ${esc(a.y)} (y) against ${esc(a.x)} (x) is ${esc(b.pretty)}${b.law ? `, recognised as ${esc(b.law)}` : ', a generic form not matching a library law'}, with R² = ${b.r2.toFixed(4)}${isNum(b.aicc) ? ` and AICc = ${b.aicc.toFixed(2)}` : ''} on ${r.errors} errors, selected from ${Number(r.tried).toLocaleString('en-US')} candidates.${b.preferred ? ' A generic form fitted marginally better but the recognised law was retained for interpretability.' : ''} The parameters are those of the refined least-squares fit; their uncertainties are available by fitting the same equation with Nonlinear regression.`);
    const legend = p(`${esc(a.y)} against ${esc(a.x)}: measured values (symbols) and the discovered equation (line).`);
    return pack('symreg', res, o, t, ctx, methods, results, legend);
  };

  /* ---------- AutoML ---------- */
  W.kinds.automl = function (res, o, t, ctx) {
    if (res.pending || !res.best) return null;
    const b = res.best, lv = Math.round(100 * res.level), board = (res.board || []).slice().sort((x, y) => y.r2 - x.r2);
    const methods = p(`${board.length} kinds of regression model (${join(board.map(q => esc(q.name.toLowerCase())))}) were trained to predict ${esc(res.yname)} from ${res.p} inputs on ${res.n} samples and compared by ${res.folds === res.n ? 'leave-one-out' : res.folds + '-fold'} cross-validation on held-out predictions (R², mean absolute error and root-mean-square error). Input importance was measured by permutation: the increase in held-out error when each input is shuffled. ${lv}% prediction intervals were obtained by split-conformal calibration on held-out residuals, so their coverage holds without distributional assumptions. ${software(ctx)}`);
    const imp = (res.importance || []).filter(q => isNum(q.v)).slice(0, 4).map(q => `${esc(q.name)} (${nf(q.v, 3)})`);
    const results = p(`The best model is ${esc(b.name.toLowerCase())} with cross-validated R² = ${b.r2.toFixed(3)}, MAE = ${nf(b.mae, 3)} and RMSE = ${nf(b.rmse, 3)}. Ranking by cross-validated R²: ${board.slice(0, 4).map(q => `${esc(q.name.toLowerCase())} ${q.r2.toFixed(3)}`).join(', ')}.${imp.length ? ` Most influential inputs by permutation importance: ${join(imp)}.` : ''}${res.preds && res.preds.length ? ` ${res.preds.length} new sample${res.preds.length === 1 ? ' was' : 's were'} predicted with ${lv}% intervals${res.preds.some(q => q.extrapolating) ? ', some outside the training range' : ''}.` : ''}`);
    const legend = p(`Cross-validated predictions of ${esc(res.yname)} against measured values for the best model (${esc(b.name.toLowerCase())}), with ${lv}% conformal prediction intervals; the diagonal marks perfect prediction. The bar chart shows permutation importance of the inputs.`);
    return pack('automl', res, o, t, ctx, methods, results, legend);
  };

  root.BF = root.BF || {}; root.BF.writeup = W;
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
})(typeof window !== 'undefined' ? window : globalThis);
