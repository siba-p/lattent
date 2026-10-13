/* Standard-curve tool (ELISA, BCA/Bradford, any calibration) */
(function () {
  'use strict';
  const { stats: S, engines: E, plot: P, ui: U, pro: Pro } = BF;
  const $ = U.$;
  const root = $('#tool');
  const state = {};

  const EXAMPLES = {
    elisa: {
      label: 'Sandwich ELISA (4PL)', model: '4pl', weight: '1/y2', unit: 'pg/mL', ylabel: 'OD 450 nm',
      std: () => {
        const r = S.rng(31), p = [0.06, 1.35, 2.25, 2.85];
        const lines = ['Conc (pg/mL)\tOD\tOD'];
        [0, 15.6, 31.3, 62.5, 125, 250, 500, 1000].forEach(c => {
          const y = E.std.models['4pl'].f(c, p);
          lines.push([c, ...[0, 1].map(() => (y * (1 + 0.035 * r.normal()) + 0.004 * r.normal()).toFixed(3))].join('\t'));
        });
        return lines.join('\n');
      },
      unk: 'Sample\tDilution\tOD\tOD\nSerum 1\t2\t0.412\t0.398\nSerum 2\t2\t1.288\t1.341\nSerum 3\t2\t0.161\t0.170\nSerum 4\t10\t2.402\t2.371\nSerum 5\t2\t0.081\t0.077\nSupernatant\t1\t0.734\t0.712'
    },
    bca: {
      label: 'BCA protein (quadratic)', model: 'quadratic', weight: 'none', unit: 'µg/mL', ylabel: 'A 562 nm',
      std: () => {
        const r = S.rng(8);
        const lines = ['BSA (µg/mL)\tA562\tA562\tA562'];
        [0, 25, 125, 250, 500, 750, 1000, 1500, 2000].forEach(c => {
          const y = 0.095 + 1.25e-3 * c - 1.6e-7 * c * c;
          lines.push([c, ...[0, 1, 2].map(() => (y + 0.012 * r.normal()).toFixed(3))].join('\t'));
        });
        return lines.join('\n');
      },
      unk: 'Lysate\tDilution\tA562\tA562\nControl\t5\t0.512\t0.527\nKnockdown\t5\t0.488\t0.479\nTreated\t5\t0.633\t0.651\nFraction 4\t1\t1.98\t2.01'
    },
    bradford: {
      label: 'Bradford (linear)', model: 'linear', weight: 'none', unit: 'µg/mL', ylabel: 'A 595 nm',
      std: () => {
        const r = S.rng(77);
        const lines = ['BSA (µg/mL)\tA595\tA595'];
        [0, 2.5, 5, 10, 15, 20, 25].forEach(c => lines.push([c, ...[0, 1].map(() => (0.012 + 0.0285 * c + 0.01 * r.normal()).toFixed(3))].join('\t')));
        return lines.join('\n');
      },
      unk: 'Sample\tDilution\tA595\tA595\nExtract A\t20\t0.351\t0.362\nExtract B\t20\t0.522\t0.508\nExtract C\t50\t0.198\t0.207'
    }
  };

  function parseStd() {
    const g = U.parseGrid($('#sc-std').value);
    const excl = new Set(($('#sc-excl').value || '').split(',').filter(Boolean));
    const pts = [];
    g.rows.forEach((r, ri) => {
      if (!isFinite(r[0])) return;
      for (let c = 1; c < r.length; c++) if (isFinite(r[c])) { const key = ri + ':' + c; pts.push({ conc: r[0], y: r[c], key, excluded: excl.has(key) }); }
    });
    return pts;
  }
  function parseUnk() {
    const g = U.parseGrid($('#sc-unk').value);
    const raw = g.raw || [];
    let dilCol = -1;
    if (g.header) dilCol = g.header.findIndex(h => /dil/i.test(h));
    const out = [];
    raw.forEach((cells, i) => {
      const name = cells[0] || 'Sample ' + (i + 1);
      const nums = g.rows[i];
      const ys = []; let dil = 1;
      for (let c = 1; c < nums.length; c++) {
        if (c === dilCol) { if (nums[c] > 0) dil = nums[c]; continue; }
        if (isFinite(nums[c])) ys.push(nums[c]);
      }
      if (!g.header && isFinite(nums[0])) ys.unshift(nums[0]);
      if (ys.length) out.push({ name: isFinite(nums[0]) && !g.header ? 'Sample ' + (i + 1) : name, ys, dilution: dil });
    });
    return out;
  }

  function run() {
    const model = $('input[name=sc-model]:checked').value;
    const weight = $('#sc-weight').value;
    state.std = parseStd();
    state.unk = parseUnk();
    state.res = state.std.length ? E.std.fit(state.std, { model, weight }) : null;
    state.out = state.res && !state.res.error ? E.std.interpolate(state.res, state.unk) : [];
    render();
  }

  function chartSpec() {
    const res = state.res;
    const logx = $('#sc-logx').checked;
    const tx = c => (logx ? Math.log10(c) : c);
    const pos = state.std.filter(p => p.conc > 0);
    const pts = (logx ? pos : state.std);
    const xsAll = pts.map(p => tx(p.conc));
    let xmin = Math.min(...xsAll), xmax = Math.max(...xsAll);
    const series = [{
      name: 'Standards', ci: 0, legend: true,
      points: pts.map(p => ({ x: tx(p.conc), y: p.y, excl: p.excluded, key: p.key }))
    }];
    if (res && !res.error) {
      const f = res.fit;
      const xs = Array.from({ length: 160 }, (_, k) => {
        if (logx) return xmin - 0.15 + (xmax - xmin + 0.3) * k / 159;
        return xmin + (xmax * 1.04 - xmin) * k / 159;
      });
      const cx = x => (logx ? Math.pow(10, x) : x);
      series[0].curve = xs.map(x => [x, f.f(cx(x), f.p)]);
      if ($('#sc-band').checked && f.cov) series[0].band = xs.filter((_, k) => k % 4 === 0).map(x => S.band(f, [cx(x)])[0]).map((b, i) => [xs.filter((_, k) => k % 4 === 0)[i], b[1], b[2]]);
      const unkPts = state.out.filter(u => isFinite(u.conc) && u.conc > 0).map(u => ({ x: tx(u.conc), y: u.y, name: u.name }));
      if (unkPts.length) series.push({ name: 'Samples', ci: 1, shape: 2, points: unkPts });
    }
    return {
      x: { label: 'Concentration (' + $('#sc-unit').value + ')', log: logx, min: logx ? xmin - 0.15 : null, max: logx ? xmax + 0.15 : null },
      y: { label: $('#sc-ylabel').value || 'Signal' }, series, legend: true
    };
  }
  function drawChart() {
    const host = $('#sc-chart');
    const W = Math.max(320, Math.round(host.clientWidth || 720));
    const H = Math.round(Math.min(500, Math.max(290, W * 0.58)));
    const spec = chartSpec();
    host.innerHTML = P.xy(spec, P.screen(), W, H).svg;
    const logx = $('#sc-logx').checked;
    U.tooltip(host, el => {
      const s = spec.series[+el.dataset.s], p = s && s.points[+el.dataset.p];
      if (!p) return '';
      const c = logx ? Math.pow(10, p.x) : p.x;
      return `<b>${U.esc(p.name || s.name)}</b><br>${U.fmt(c, 4)} ${$('#sc-unit').value} · signal ${U.fmt(p.y, 4)}${p.key ? `<br><span style="opacity:.75">Click to ${p.excl ? 'restore' : 'exclude'}</span>` : ''}`;
    });
    host.onclick = e => {
      const el = e.target.closest('.pt');
      if (!el) return;
      const p = spec.series[+el.dataset.s].points[+el.dataset.p];
      if (!p || !p.key) return;
      const ex = new Set(($('#sc-excl').value || '').split(',').filter(Boolean));
      if (ex.has(p.key)) ex.delete(p.key); else ex.add(p.key);
      $('#sc-excl').value = [...ex].join(',');
      $('#sc-excl').dispatchEvent(new Event('change', { bubbles: true }));
    };
  }

  function render() {
    const out = $('#sc-results');
    const unit = $('#sc-unit').value;
    if (!state.std.length) { out.innerHTML = '<div class="card empty">Paste your standards to start.</div>'; $('#sc-chart').innerHTML = ''; $('#sc-report').innerHTML = ''; return; }
    drawChart();
    const res = state.res;
    if (res.error) { out.innerHTML = `<div class="card res"><div class="err">${U.esc(res.error)}</div></div>`; $('#sc-report').innerHTML = ''; return; }
    const f = res.fit;
    const nEx = ($('#sc-excl').value || '').split(',').filter(Boolean).length;
    $('#sc-chartnote').textContent = (nEx ? nEx + ' standard' + (nEx > 1 ? 's' : '') + ' excluded · ' : '') + 'Click a standard to exclude it.';
    const badRec = res.recovery.filter(r => Math.abs(r.recovery - 100) > 20);
    const inRange = state.out.filter(u => !u.flag).length;
    const kpi = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="ci">${sub}</div>` : ''}</div>`;
    const kp = [
      kpi('Fit quality', 'R² ' + f.r2.toFixed(4), 'S<sub>y·x</sub> = ' + U.fmt(Math.sqrt(f.ssrUnweighted / f.dof), 3)),
      kpi('Standards in 80–120%', `${res.recovery.length - badRec.length}<small> / ${res.recovery.length}</small>`, 'back-calculated recovery'),
      kpi('Samples in range', `${inRange}<small> / ${state.out.length}</small>`, 'within the standards'),
      res.lod != null ? kpi('LOD / LOQ', `${U.fmt(res.lod, 3)}<small> / ${U.fmt(res.loq, 3)} ${U.esc(unit)}</small>`, 'blank mean + 3 SD / 10 SD') : ''
    ].join('');
    const pnames = res.M.names;
    const prow = f.p.map((v, j) => `<tr><td>${pnames[j]}</td><td>${U.fmt(j === 2 && (res.model === '4pl' || res.model === '5pl') ? Math.pow(10, v) : v, 5)}${j === 2 && (res.model === '4pl' || res.model === '5pl') ? ' <small>(C)</small>' : ''}</td><td>${U.fmt(f.se[j], 3)}</td><td>${U.fmt(f.ci[j][0], 4)} – ${U.fmt(f.ci[j][1], 4)}</td></tr>`).join('');
    const urows = state.out.map(u => `<tr${u.flag ? ' class="dim"' : ''}><td>${U.esc(u.name)}</td><td>${U.fmt(u.y, 4)}</td><td>${isFinite(u.cv) ? u.cv.toFixed(1) + '%' : '–'}</td><td>${U.fmt(u.conc, 4)}</td><td>${u.dilution}</td><td><b>${U.fmt(u.final, 4)}</b></td><td>${isFinite(u.finalLo) ? U.fmt(u.finalLo, 3) + ' – ' + U.fmt(u.finalHi, 3) : '–'}</td><td class="l">${u.flag ? `<span class="flag${/off curve/.test(u.flag) ? ' bad' : ''}">${u.flag}</span>` : '<span class="flag ok">in range</span>'}${isFinite(u.cv) && u.cv > 15 ? ' <span class="flag">CV > 15%</span>' : ''}</td></tr>`).join('');
    const rrows = res.recovery.map(r => `<tr><td>${U.fmt(r.conc, 4)}</td><td>${U.fmt(r.mean, 4)}</td><td>${isFinite(r.cv) ? r.cv.toFixed(1) + '%' : '–'}</td><td>${U.fmt(r.back, 4)}</td><td>${isFinite(r.recovery) ? `<span class="flag ${Math.abs(r.recovery - 100) > 20 ? 'bad' : 'ok'}">${r.recovery.toFixed(1)}%</span>` : '–'}</td></tr>`).join('');
    const tab = $('#sc-results').dataset.tab || 'samples';
    out.innerHTML = `<div class="card res">
      <div class="kpis">${kp}</div>
      <div class="subtabs" role="tablist">
        <button role="tab" data-t="samples" aria-selected="${tab === 'samples'}">Samples</button>
        <button role="tab" data-t="standards" aria-selected="${tab === 'standards'}">Standards and recovery</button>
        <button role="tab" data-t="params" aria-selected="${tab === 'params'}">Curve parameters</button>
        <span style="flex:1"></span><button class="btn small ghost" id="sc-csv" style="margin:2px 0 6px">Export CSV <span class="lock">PRO</span></button>
      </div>
      <div class="tbl-wrap" ${tab === 'samples' ? '' : 'hidden'}>${state.out.length ? `<table class="t"><thead><tr><th>Sample</th><th>Mean signal</th><th>CV</th><th>Interpolated</th><th>Dilution</th><th>Concentration (${U.esc(unit)})</th><th>95% CI</th><th class="l">Status</th></tr></thead><tbody>${urows}</tbody></table>` : '<p class="hint">Add samples on the left to interpolate their concentrations.</p>'}</div>
      <div class="tbl-wrap" ${tab === 'standards' ? '' : 'hidden'}><table class="t"><thead><tr><th>Nominal (${U.esc(unit)})</th><th>Mean signal</th><th>CV</th><th>Back-calculated</th><th>Recovery</th></tr></thead><tbody>${rrows}</tbody></table></div>
      <div class="tbl-wrap" ${tab === 'params' ? '' : 'hidden'}><table class="t"><thead><tr><th>Parameter</th><th>Estimate</th><th>SE</th><th>95% CI</th></tr></thead><tbody>${prow}</tbody></table>
      <p class="hint">${res.M.label} fit, ${{ none: 'unweighted', '1/y': 'weighted 1/Y', '1/y2': 'weighted 1/Y²' }[res.weight]}, ${f.n} points, ${f.dof} degrees of freedom.</p></div>
      ${notes(res)}
    </div>`;
    $$('.subtabs [data-t]', out).forEach(b => b.onclick = () => { out.dataset.tab = b.dataset.t; render(); });
    $('#sc-csv').onclick = () => Pro.require('CSV export', () => U.download('standard-curve-results.csv', 'text/csv', U.csv(csvRows())));
    report();
  }
  function notes(res) {
    const n = [];
    const bad = res.recovery.filter(r => Math.abs(r.recovery - 100) > 20);
    if (bad.length) n.push(`<li>${bad.length} standard${bad.length > 1 ? 's' : ''} back-calculate${bad.length > 1 ? '' : 's'} outside 80–120% of nominal. Consider another model or weighting, or exclude a failed standard.</li>`);
    if ((res.model === '4pl' || res.model === '5pl') && res.weight === 'none') n.push('<li class="info">Immunoassay variance usually grows with the signal; 1/Y² weighting often improves accuracy at the low end.</li>');
    const out = state.out.filter(u => u.flag && !/LOQ/.test(u.flag));
    if (out.length) n.push(`<li>${out.length} sample${out.length > 1 ? 's fall' : ' falls'} outside the standard range. Re-assay ${out.length > 1 ? 'them' : 'it'} at another dilution rather than extrapolating.</li>`);
    if (res.model === 'linear' && res.recovery.length >= 5) {
      const top = res.recovery[res.recovery.length - 1];
      if (top.recovery < 92 || top.recovery > 108) n.push('<li class="info">The top standard deviates from the line; the response may be saturating. A quadratic or 4PL model may describe it better.</li>');
    }
    return n.length ? `<ul class="notes">${n.join('')}</ul>` : '';
  }
  function csvRows() {
    const unit = $('#sc-unit').value;
    return [['Sample', 'Mean signal', 'CV %', 'Interpolated (' + unit + ')', 'Dilution', 'Concentration (' + unit + ')', 'CI low', 'CI high', 'Flag']]
      .concat(state.out.map(u => [u.name, u.y, u.cv, u.conc, u.dilution, u.final, u.finalLo, u.finalHi, u.flag || 'in range']));
  }
  function report() {
    const res = state.res, f = res.fit, unit = $('#sc-unit').value;
    const mdl = {
      linear: 'a straight line', quadratic: 'a second-order polynomial',
      '4pl': 'a four-parameter logistic function, <i>Y</i> = <i>D</i> + (<i>A</i> − <i>D</i>)/(1 + (<i>X</i>/<i>C</i>)<sup><i>B</i></sup>)',
      '5pl': 'a five-parameter logistic function, <i>Y</i> = <i>D</i> + (<i>A</i> − <i>D</i>)/(1 + (<i>X</i>/<i>C</i>)<sup><i>B</i></sup>)<sup><i>G</i></sup>'
    }[res.model];
    const wt = { none: '', '1/y': ' with 1/<i>Y</i> weighting', '1/y2': ' with 1/<i>Y</i><sup>2</sup> weighting' }[res.weight];
    const reps = Math.round(f.n / res.means.length);
    const methods = `<p>Standards (${res.means.length} concentrations${reps > 1 ? ', ' + reps + ' replicates each' : ''}) were fitted to ${mdl} by nonlinear least squares${wt}. Sample concentrations were interpolated from the fitted curve and multiplied by their dilution factors; 95% confidence intervals combine the uncertainty of the curve parameters with the replicate variation of each sample. Back-calculated standard concentrations were accepted within 80–120% of nominal.${res.lod != null ? ' The limits of detection and quantification were defined as the blank mean plus 3 and 10 standard deviations, converted to concentration through the curve.' : ''} Analyses were performed with Benchfit (${BF_CONFIG.site}).</p>`;
    const good = res.recovery.filter(r => Math.abs(r.recovery - 100) <= 20).length;
    const ok = state.out.filter(u => !u.flag);
    let results = `<p>The standard curve had R² = ${f.r2.toFixed(4)}, and ${good} of ${res.recovery.length} standards back-calculated within 80–120% of nominal${res.lod != null ? `. The LOD was ${U.fmt(res.lod, 3)} ${unit} and the LOQ ${U.fmt(res.loq, 3)} ${unit}` : ''}.`;
    if (state.out.length) results += ` ${ok.length} of ${state.out.length} samples fell within the calibrated range` + (ok.length ? `; concentrations ranged from ${U.fmt(Math.min(...ok.map(u => u.final)), 3)} to ${U.fmt(Math.max(...ok.map(u => u.final)), 3)} ${unit}.` : '.');
    results += '</p>';
    const legend = `<p><b>Standard curve.</b> Circles show individual standard replicates; the line is the ${res.M.label.toLowerCase()} fit${$('#sc-band').checked ? ' with its 95% confidence band' : ''}. Triangles mark the mean signal of each sample at its interpolated concentration (before dilution correction).</p>`;
    U.renderReport($('#sc-report'), [{ title: 'Methods', html: methods }, { title: 'Results', html: results }, { title: 'Figure legend', html: legend }], {
      title: 'Standard curve and sample quantification', file: 'standard-curve-report',
      figure: () => P.xy(chartSpec(), P.print, 720, 500).svg,
      tables: () => '<h4>Samples</h4><table>' + csvRows().map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${typeof v === 'number' ? U.fmt(v, 4) : U.esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'
    });
  }

  function loadExample(k) {
    const ex = EXAMPLES[k];
    $('#sc-std').value = ex.std(); $('#sc-unk').value = ex.unk;
    $(`input[name=sc-model][value="${ex.model}"]`).checked = true;
    $('#sc-weight').value = ex.weight; $('#sc-unit').value = ex.unit; $('#sc-ylabel').value = ex.ylabel;
    $('#sc-logx').checked = ex.model === '4pl' || ex.model === '5pl';
    $('#sc-excl').value = '';
    run(); root.dispatchEvent(new Event('change'));
  }
  function $$(s, el) { return [...(el || document).querySelectorAll(s)]; }
  $('#sc-examples').innerHTML = Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" data-ex="${k}">${e.label}</button>`).join('');
  $('#sc-examples').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) loadExample(b.dataset.ex); };
  U.fileInto($('#sc-std'), $('#sc-file'));
  U.fileInto($('#sc-unk'), null);
  let h;
  root.addEventListener('input', e => { if (e.target.id === 'sc-std') $('#sc-excl').value = ''; clearTimeout(h); h = setTimeout(run, 250); });
  root.addEventListener('change', e => {
    if (e.target.name === 'sc-model') $('#sc-logx').checked = e.target.value === '4pl' || e.target.value === '5pl';
    clearTimeout(h); h = setTimeout(run, 40);
  });
  $$('[data-fig]').forEach(b => b.onclick = () => U.exportFigure((T, W, H) => P.xy(chartSpec(), T, W, H), 'standard-curve', b.dataset.fig));
  U.projectButtons('standard-curve', root, run);
  let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => state.res && drawChart(), 150); });
  document.addEventListener('bf:pro', () => state.res && !state.res.error && report());
  const had = U.autosave('standard-curve', root);
  if (!had || !$('#sc-std').value.trim()) loadExample('elisa'); else run();
})();
