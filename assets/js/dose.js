/* Dose–response tool */
(function () {
  'use strict';
  const { stats: S, engines: E, plot: P, ui: U, pro: Pro } = BF;
  const $ = U.$;
  const root = $('#tool');
  const state = { sets: [], results: [], shared: null };

  const UNITS = { pM: 1e-12, nM: 1e-9, 'µM': 1e-6, mM: 1e-3, M: 1 };

  /* ---------- example data ---------- */
  function synth(seed, units, sets, reps, noise, concs) {
    const r = S.rng(seed);
    const header = ['Conc (' + units + ')'];
    sets.forEach(s => { for (let k = 0; k < reps; k++) header.push(s.name); });
    const lines = [header.join('\t')];
    concs.forEach(c => {
      const row = [String(c)];
      sets.forEach(s => {
        for (let k = 0; k < reps; k++) row.push((E.dose.models['4pl'].f(Math.log10(c), s.p) + noise * r.normal()).toFixed(1));
      });
      lines.push(row.join('\t'));
    });
    return lines.join('\n');
  }
  const serial = (top, f, n) => Array.from({ length: n }, (_, i) => Number((top / Math.pow(f, i)).toPrecision(3))).reverse();
  const EXAMPLES = {
    inhib: {
      label: 'Kinase inhibitors', unit: 'µM', ylabel: 'Activity (%)', norm: false, fixb: false, fixt: false,
      data: () => synth(11, 'µM', [
        { name: 'Compound A', p: [3, 99, Math.log10(0.042), -1.05] },
        { name: 'Compound B', p: [6, 101, Math.log10(0.55), -0.9] },
        { name: 'Staurosporine', p: [1, 100, Math.log10(0.006), -1.3] }], 3, 4, serial(10, 3, 10))
    },
    agonist: {
      label: 'Receptor agonist', unit: 'nM', ylabel: 'cAMP (nM)', norm: false, fixb: false, fixt: false,
      data: () => synth(5, 'nM', [{ name: 'Agonist', p: [2.1, 38, Math.log10(4.2), 1.2] }, { name: 'Agonist + antagonist', p: [2.3, 37, Math.log10(46), 1.1] }], 3, 1.3, serial(3000, 3.16, 10))
    },
    viability: {
      label: 'Cell viability (normalised)', unit: 'µM', ylabel: 'Viability (%)', norm: false, fixb: true, fixt: true,
      data: () => synth(23, 'µM', [{ name: 'Doxorubicin', p: [0, 100, Math.log10(0.31), -1.4] }], 4, 5, serial(50, 2.5, 9))
    }
  };

  /* ---------- parse ---------- */
  function parse() {
    const g = U.parseGrid($('#dr-data').value);
    const islog = $('#dr-islog').checked;
    const names = [];
    const colSet = [];
    const ncol = Math.max(0, ...g.rows.map(r => r.length));
    for (let c = 1; c < ncol; c++) {
      const nm = g.header && g.header[c] ? g.header[c] : (g.header ? 'Data' : 'Data');
      let i = names.indexOf(nm);
      if (i < 0) { names.push(nm); i = names.length - 1; }
      colSet[c] = i;
    }
    const excl = new Set(($('#dr-excl').value || '').split(',').filter(Boolean));
    const sets = names.map(n => ({ name: n, pts: [] }));
    let skipped = 0;
    g.rows.forEach((r, ri) => {
      let x = r[0];
      if (!isFinite(x)) return;
      const conc = islog ? Math.pow(10, x) : x;
      if (!(conc > 0)) { skipped++; return; }
      for (let c = 1; c < r.length; c++) {
        if (!isFinite(r[c]) || colSet[c] == null) continue;
        const key = ri + ':' + c;
        sets[colSet[c]].pts.push({ conc, y: r[c], key, excluded: excl.has(key) });
      }
    });
    return { sets: sets.filter(s => s.pts.length), skipped };
  }

  function normalise(sets) {
    if (!$('#dr-norm').checked) return sets;
    const z = parseFloat($('#dr-n0').value), h = parseFloat($('#dr-n100').value);
    if (!isFinite(z) || !isFinite(h) || z === h) return sets;
    return sets.map(s => ({ ...s, pts: s.pts.map(p => ({ ...p, y: 100 * (p.y - z) / (h - z) })) }));
  }

  /* ---------- analyse ---------- */
  function run() {
    const model = $('input[name=dr-model]:checked').value;
    const parsed = parse();
    state.sets = normalise(parsed.sets);
    const ecx = $('#dr-ecx').value.split(/[ ,;]+/).map(Number).filter(v => v > 0 && v < 100 && v !== 50).slice(0, 4).map(v => v / 100);
    const opts = {
      model, ecx,
      bottom: $('#dr-fixb').checked ? parseFloat($('#dr-bval').value) : null,
      top: $('#dr-fixt').checked ? parseFloat($('#dr-tval').value) : null,
      normalised: $('#dr-norm').checked || ($('#dr-fixb').checked && $('#dr-fixt').checked)
    };
    if (!isFinite(opts.bottom)) opts.bottom = null;
    if (!isFinite(opts.top)) opts.top = null;
    state.opts = opts;
    state.results = state.sets.map(s => ({ name: s.name, res: E.dose.fit(s.pts, opts), pts: s.pts }));
    const ok = state.results.filter(r => !r.res.error);
    state.shared = ok.length >= 2 && ok.length === state.results.length ? E.dose.sharedTest(state.sets.map(s => s.pts), ok.map(r => r.res), opts) : null;
    state.skipped = parsed.skipped;
    render();
  }

  /* ---------- chart ---------- */
  function chartSpec() {
    const show = $('#dr-show').value;
    const unit = $('#dr-unit').value;
    const allX = [];
    state.results.forEach(r => r.pts.forEach(p => allX.push(Math.log10(p.conc))));
    const xmin = Math.min(...allX), xmax = Math.max(...allX);
    const series = state.results.map((r, i) => {
      let points;
      const live = r.pts.filter(p => !p.excluded);
      if (show === 'all') points = r.pts.map(p => ({ x: Math.log10(p.conc), y: p.y, excl: p.excluded, key: p.key }));
      else {
        const m = E.groupMeans(live.map(p => ({ x: Math.log10(p.conc), y: p.y })));
        points = m.map(q => ({ x: q.x, y: q.y, err: q.n > 1 ? (show === 'sem' ? q.sd / Math.sqrt(q.n) : q.sd) : 0 }));
        r.pts.filter(p => p.excluded).forEach(p => points.push({ x: Math.log10(p.conc), y: p.y, excl: true, key: p.key }));
      }
      const s = { name: r.name, ci: i, points };
      if (!r.res.error) {
        const f = r.res.fit;
        const xs = Array.from({ length: 160 }, (_, k) => xmin - 0.25 + (xmax - xmin + 0.5) * k / 159);
        s.curve = xs.map(x => [x, f.f(x, f.p)]);
        if ($('#dr-band').checked && f.cov) s.band = S.band(f, xs.filter((_, k) => k % 4 === 0));
      }
      return s;
    });
    const vguides = state.results.map((r, i) => (!r.res.error && r.res.logEC50 > xmin - 0.25 && r.res.logEC50 < xmax + 0.25 ? { x: r.res.logEC50, y: r.res.fit.f(r.res.logEC50, r.res.fit.p), ci: i } : null)).filter(Boolean);
    return {
      x: { label: 'Concentration (' + unit + ')', log: true, min: xmin - 0.25, max: xmax + 0.25 },
      y: { label: $('#dr-ylabel').value || 'Response' },
      series, vguides
    };
  }
  function drawChart() {
    const host = $('#dr-chart');
    const W = Math.max(320, Math.round(host.clientWidth || 720));
    const H = Math.round(Math.min(520, Math.max(300, W * 0.62)));
    const spec = chartSpec();
    host.innerHTML = P.xy(spec, P.screen(), W, H).svg;
    U.tooltip(host, el => {
      const s = spec.series[+el.dataset.s], p = s && s.points[+el.dataset.p];
      if (!p) return '';
      const c = Math.pow(10, p.x);
      return `<b>${U.esc(s.name)}</b><br>${U.fmt(c, 3)} ${$('#dr-unit').value} → ${U.fmt(p.y, 4)}${p.err ? ' ± ' + U.fmt(p.err, 2) : ''}${p.key ? `<br><span style="opacity:.75">Click to ${p.excl ? 'restore' : 'exclude'}</span>` : ''}`;
    });
    host.onclick = e => {
      const el = e.target.closest('.pt');
      if (!el) return;
      const p = spec.series[+el.dataset.s].points[+el.dataset.p];
      if (!p || !p.key) { if ($('#dr-show').value !== 'all') U.toast('Show individual replicates to exclude single points.'); return; }
      const ex = new Set(($('#dr-excl').value || '').split(',').filter(Boolean));
      if (ex.has(p.key)) ex.delete(p.key); else ex.add(p.key);
      $('#dr-excl').value = [...ex].join(',');
      $('#dr-excl').dispatchEvent(new Event('change', { bubbles: true }));
      run();
    };
  }

  /* ---------- results ---------- */
  function word(r) { return r.res.hill < 0 ? 'IC50' : 'EC50'; }
  function render() {
    const out = $('#dr-results');
    const unit = $('#dr-unit').value;
    if (!state.sets.length) {
      out.innerHTML = '<div class="card empty">Paste data or load an example to start.</div>';
      $('#dr-chart').innerHTML = ''; $('#dr-report').innerHTML = '';
      return;
    }
    drawChart();
    const nEx = ($('#dr-excl').value || '').split(',').filter(Boolean).length;
    $('#dr-chartnote').textContent = (nEx ? nEx + ' point' + (nEx > 1 ? 's' : '') + ' excluded · ' : '') + 'Click a point to exclude it as an outlier.';
    const good = state.results.filter(r => !r.res.error);
    const kpis = state.results.map((r, i) => r.res.error
      ? `<div class="kpi"><div class="k"><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${U.esc(r.name)}</div><div class="err" style="margin-top:6px;font-size:13px">${U.esc(r.res.error)}</div></div>`
      : `<div class="kpi"><div class="k"><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${U.esc(r.name)} · ${word(r)}</div>
         <div class="v">${U.fmt(r.res.ec50, 3)} <small>${unit}</small></div>
         <div class="ci">95% CI ${U.fmt(r.res.ec50ci[0], 3)} – ${U.fmt(r.res.ec50ci[1], 3)}</div></div>`).join('');
    const ecxCols = (state.opts.ecx || []).map(F => `<th>${good[0] && good[0].res.hill < 0 ? 'IC' : 'EC'}${Math.round(F * 100)}</th>`).join('');
    const rows = state.results.map(r => {
      if (r.res.error) return `<tr class="dim"><td>${U.esc(r.name)}</td><td colspan="9" class="l">${U.esc(r.res.error)}</td></tr>`;
      const f = r.res.fit, p = f.p, se = f.se;
      const pm = (j, d) => f.fixed[j] ? U.fmt(p[j], d) + ' <small>(fixed)</small>' : U.fmt(p[j], d) + ' ± ' + U.fmt(se[j], 2);
      return `<tr><td>${U.esc(r.name)}</td><td>${U.fmt(r.res.ec50, 3)}</td><td>${U.fmt(r.res.ec50ci[0], 3)} – ${U.fmt(r.res.ec50ci[1], 3)}</td><td>${p[2].toFixed(3)} ± ${U.fmt(se[2], 2)}</td><td>${pm(3, 3)}</td><td>${pm(0, 4)}</td><td>${pm(1, 4)}</td>${state.opts.model === '5pl' ? `<td>${pm(4, 3)}</td>` : ''}${r.res.ecx.map(e => `<td>${U.fmt(e.value, 3)}</td>`).join('')}${state.opts.normalised ? `<td>${U.fmt(r.res.abs50, 3)}</td>` : ''}<td>${f.r2.toFixed(4)}</td><td>${f.n}</td></tr>`;
    }).join('');
    const notes = [];
    state.results.forEach(r => (r.res.ambiguous || []).forEach(a => notes.push(`<li><b>${U.esc(r.name)}:</b> ${U.esc(a)}</li>`)));
    if (state.skipped) notes.push(`<li class="info">${state.skipped} row${state.skipped > 1 ? 's' : ''} at zero concentration ${state.skipped > 1 ? 'were' : 'was'} left out of the fit; use them as controls for normalisation instead.</li>`);
    let cmp = '';
    if (state.shared) {
      const s = state.shared;
      const ref = good[0];
      cmp = `<h3 style="margin-top:20px">Comparison</h3>
        <p style="margin:0 0 10px;color:var(--ink-2)">Do the ${word(ref)}s differ? Extra-sum-of-squares F test against one shared ${word(ref)}:
        <b>F(${s.df1}, ${s.df2}) = ${s.F.toFixed(2)}, p ${s.p < 0.0001 ? '< 0.0001' : '= ' + s.p.toFixed(4)}</b> ${s.p < 0.05 ? '(the values differ)' : '(no evidence they differ)'}.</p>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Dataset</th><th>${word(ref)} (${unit})</th><th>Ratio to ${U.esc(ref.name)}</th></tr></thead><tbody>
        ${good.map(r => `<tr><td>${U.esc(r.name)}</td><td>${U.fmt(r.res.ec50, 3)}</td><td>${U.fmt(r.res.ec50 / ref.res.ec50, 3)}×</td></tr>`).join('')}</tbody></table></div>`;
    }
    out.innerHTML = `<div class="card res">
      <div class="kpis">${kpis}</div>
      <div class="chart-bar" style="margin-bottom:8px"><h3>Fitted parameters</h3><button class="btn small ghost" id="dr-csv">Export CSV <span class="lock">PRO</span></button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Dataset</th><th>${good[0] ? word(good[0]) : 'EC50'} (${unit})</th><th>95% CI</th><th>log ${good[0] ? word(good[0]) : 'EC50'}</th><th>Hill slope</th><th>Bottom</th><th>Top</th>${state.opts.model === '5pl' ? '<th>Asymmetry</th>' : ''}${ecxCols}${state.opts.normalised ? '<th>Absolute 50%</th>' : ''}<th>R²</th><th>n</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${notes.length ? `<ul class="notes">${notes.join('')}</ul>` : ''}
      ${cmp}
    </div>`;
    $('#dr-csv').onclick = () => Pro.require('CSV export', () => U.download('dose-response-results.csv', 'text/csv', U.csv(csvRows())));
    report();
  }

  function csvRows() {
    const unit = $('#dr-unit').value;
    const head = ['Dataset', 'EC50 (' + unit + ')', 'CI low', 'CI high', 'logEC50', 'SE logEC50', 'Hill', 'SE Hill', 'Bottom', 'SE Bottom', 'Top', 'SE Top', 'R2', 'n'];
    return [head].concat(state.results.filter(r => !r.res.error).map(r => {
      const f = r.res.fit;
      return [r.name, r.res.ec50, r.res.ec50ci[0], r.res.ec50ci[1], f.p[2], f.se[2], f.p[3], f.se[3], f.p[0], f.se[0], f.p[1], f.se[1], f.r2, f.n];
    }));
  }

  function report() {
    const good = state.results.filter(r => !r.res.error);
    if (!good.length) { $('#dr-report').innerHTML = ''; return; }
    const unit = $('#dr-unit').value;
    const o = state.opts;
    const reps = Math.round(S.mean(good.map(r => r.res.fit.n / r.res.means.length)));
    const W = word(good[0]);
    const modelTxt = {
      '4pl': 'a four-parameter logistic model, <i>Y</i> = Bottom + (Top − Bottom)/(1 + 10<sup>(log' + W + ' − <i>X</i>)·<i>n</i><sub>H</sub></sup>)',
      '3pl': 'a three-parameter logistic model with the Hill slope fixed at ' + (good[0].res.hill < 0 ? '−1' : '1'),
      '5pl': 'a five-parameter asymmetric logistic model (Richards)'
    }[o.model];
    const cons = [];
    if (o.bottom != null) cons.push('the bottom plateau was constrained to ' + o.bottom);
    if (o.top != null) cons.push('the top plateau was constrained to ' + o.top);
    const norm = $('#dr-norm').checked ? ` Responses were normalised to the controls (${$('#dr-n100').value} = 100%, ${$('#dr-n0').value} = 0%).` : '';
    const excl = ($('#dr-excl').value || '').split(',').filter(Boolean).length;
    const methods = `<p>Concentration–response data (${reps > 1 ? 'n = ' + reps + ' replicates per concentration' : 'single measurements'}) were analysed by nonlinear least-squares regression against ${modelTxt}, where <i>X</i> is the log<sub>10</sub> concentration.${norm}${cons.length ? ' ' + cons.join(' and ').replace(/^./, c => c.toUpperCase()) + '.' : ''} Parameters were estimated with the Levenberg–Marquardt algorithm; 95% confidence intervals were derived from the asymptotic standard errors, and those of the ${W} were computed on the logarithmic scale.${excl ? ` ${excl} outlying value${excl > 1 ? 's were' : ' was'} excluded before fitting.` : ''}${state.shared ? ` ${W} values were compared with an extra-sum-of-squares F test against a model sharing one ${W} across datasets.` : ''} Analyses were performed with Benchfit (${BF_CONFIG.site}).</p>`;
    const res = good.map(r => `${U.esc(r.name)} gave ${a(W)} ${W} of ${U.fmt(r.res.ec50, 3)} ${unit} (95% CI ${U.fmt(r.res.ec50ci[0], 3)}–${U.fmt(r.res.ec50ci[1], 3)} ${unit}; Hill slope ${r.res.hill.toFixed(2)}, R² = ${r.res.fit.r2.toFixed(3)})`);
    let results = `<p>${res.join('; ')}.`;
    if (state.shared) {
      const s = state.shared;
      results += ` The ${W} values ${s.p < 0.05 ? 'differed significantly' : 'did not differ significantly'} between datasets (F(${s.df1}, ${s.df2}) = ${s.F.toFixed(2)}, p ${s.p < 0.0001 ? '< 0.0001' : '= ' + s.p.toFixed(3)}).`;
      if (good.length === 2) results += ` ${U.esc(good[1].name)} was ${U.fmt(Math.max(good[1].res.ec50 / good[0].res.ec50, good[0].res.ec50 / good[1].res.ec50), 3)}-fold ${good[1].res.ec50 > good[0].res.ec50 ? 'less' : 'more'} potent than ${U.esc(good[0].name)}.`;
    }
    results += '</p>';
    const show = $('#dr-show').value;
    const legend = `<p><b>Concentration–response curves${good.length > 1 ? ' of ' + good.map(r => U.esc(r.name)).join(', ') : ''}.</b> ${show === 'all' ? 'Symbols show individual replicates' : `Symbols show mean ± ${show === 'sem' ? 'SEM' : 'SD'} (n = ${reps})`}; lines are ${o.model === '5pl' ? 'five' : o.model === '3pl' ? 'three' : 'four'}-parameter logistic fits${$('#dr-band').checked ? ' with 95% confidence bands (shaded)' : ''}. Dashed lines mark the ${W}.</p>`;
    U.renderReport($('#dr-report'), [{ title: 'Methods', html: methods }, { title: 'Results', html: results }, { title: 'Figure legend', html: legend }], {
      title: 'Dose–response analysis', file: 'dose-response-report',
      figure: () => P.xy(chartSpec(), P.print, 720, 500).svg,
      tables: () => '<h4>Parameters</h4><table>' + csvRows().map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${typeof v === 'number' ? U.fmt(v, 4) : U.esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'
    });
  }
  const a = w => (/^[aeiouAEIOU]/.test(w) || /^[EF]/.test(w) ? 'an' : 'a');

  /* ---------- plate import ---------- */
  function plateImport() {
    const m = U.modal(`<p class="m-kicker">Import</p><h2>96-well plate</h2>
      <div class="field"><label for="pl-grid">Paste the 8 × 12 block of readings</label>
        <textarea id="pl-grid" style="min-height:150px" placeholder="Copy the plate block from the reader export (row and column labels are fine)"></textarea></div>
      <div class="row2">
        <div class="field"><label for="pl-names">Compounds, top to bottom</label><input type="text" id="pl-names" value="Compound A, Compound B"></div>
        <div class="field"><label for="pl-rows">Rows per compound</label><input type="number" id="pl-rows" value="3" min="1" max="8"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="pl-c1">Dilution columns</label><div class="inline"><input type="number" id="pl-c1" value="1" min="1" max="12"> to <input type="number" id="pl-c2" value="10" min="1" max="12"></div></div>
        <div class="field"><label for="pl-top">Highest concentration</label><input type="number" id="pl-top" value="10" step="any"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="pl-fold">Dilution factor</label><input type="number" id="pl-fold" value="3" step="any"></div>
        <div class="field"><label for="pl-dir">Highest concentration in</label><select id="pl-dir"><option value="first">the first dilution column</option><option value="last">the last dilution column</option></select></div>
      </div>
      <div class="row2">
        <div class="field"><label for="pl-hi">100% control column</label><input type="number" id="pl-hi" placeholder="e.g. 11" min="1" max="12"><small>No-inhibitor wells</small></div>
        <div class="field"><label for="pl-lo">0% control column</label><input type="number" id="pl-lo" placeholder="e.g. 12" min="1" max="12"><small>Full-inhibition or blank wells</small></div>
      </div>
      <div class="m-actions"><button class="btn primary" id="pl-go">Import plate</button><span class="m-note" id="pl-msg"></span></div>`);
    $('#pl-go', m).onclick = () => {
      const lines = $('#pl-grid', m).value.replace(/\r/g, '').split('\n').filter(l => l.trim());
      const grid = lines.map(l => (l.includes('\t') ? l.split('\t') : l.trim().split(/[\s,;]+/)).map(c => parseFloat(c.replace(',', '.')))).map(r => r.filter(v => isFinite(v))).filter(r => r.length >= 12).map(r => r.slice(-12)).slice(0, 8);
      if (grid.length < 1) { $('#pl-msg', m).textContent = 'Could not find rows with 12 numbers.'; return; }
      const names = $('#pl-names', m).value.split(',').map(s => s.trim()).filter(Boolean);
      const per = Math.max(1, parseInt($('#pl-rows', m).value, 10) || 1);
      const c1 = parseInt($('#pl-c1', m).value, 10) - 1, c2 = parseInt($('#pl-c2', m).value, 10) - 1;
      const top = parseFloat($('#pl-top', m).value), fold = parseFloat($('#pl-fold', m).value);
      if (!(c2 > c1) || !(top > 0) || !(fold > 1)) { $('#pl-msg', m).textContent = 'Check the columns, top concentration and dilution factor.'; return; }
      const cols = []; for (let c = c1; c <= c2; c++) cols.push(c);
      const conc = c => top / Math.pow(fold, $('#pl-dir', m).value === 'first' ? c - c1 : c2 - c);
      const groups = [];
      for (let g = 0; g * per < grid.length; g++) groups.push({ name: names[g] || 'Compound ' + (g + 1), rows: grid.slice(g * per, g * per + per) });
      const header = ['Conc'].concat(...groups.map(g => g.rows.map(() => g.name)));
      const out = [header.join('\t')];
      cols.slice().sort((a, b) => conc(a) - conc(b)).forEach(c => out.push([Number(conc(c).toPrecision(4))].concat(...groups.map(g => g.rows.map(r => r[c]))).join('\t')));
      $('#dr-data').value = out.join('\n');
      const hi = parseInt($('#pl-hi', m).value, 10) - 1, lo = parseInt($('#pl-lo', m).value, 10) - 1;
      if (hi >= 0 && lo >= 0) {
        $('#dr-norm').checked = true;
        $('#dr-n100').value = Number(S.mean(grid.map(r => r[hi])).toPrecision(5));
        $('#dr-n0').value = Number(S.mean(grid.map(r => r[lo])).toPrecision(5));
        $('#dr-ylabel').value = 'Response (%)';
      }
      $('#dr-excl').value = '';
      U.closeModal(); syncUI(); run();
      root.dispatchEvent(new Event('change'));
      U.toast('Imported ' + groups.length + ' compound' + (groups.length > 1 ? 's' : '') + ' from the plate.', 'ok');
    };
  }

  /* ---------- wiring ---------- */
  function syncUI() {
    $('#dr-normbox').hidden = !$('#dr-norm').checked;
    $('#dr-bval').disabled = !$('#dr-fixb').checked;
    $('#dr-tval').disabled = !$('#dr-fixt').checked;
  }
  function loadExample(k) {
    const ex = EXAMPLES[k];
    $('#dr-data').value = ex.data();
    $('#dr-unit').value = ex.unit; $('#dr-ylabel').value = ex.ylabel;
    $('#dr-norm').checked = ex.norm; $('#dr-fixb').checked = ex.fixb; $('#dr-fixt').checked = ex.fixt;
    $('#dr-bval').value = 0; $('#dr-tval').value = 100; $('#dr-excl').value = '';
    $('#dr-islog').checked = false;
    syncUI(); run();
    root.dispatchEvent(new Event('change'));
  }
  $('#dr-examples').innerHTML = Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" data-ex="${k}">${e.label}</button>`).join('');
  $('#dr-examples').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) loadExample(b.dataset.ex); };
  $('#dr-plate').onclick = plateImport;
  U.fileInto($('#dr-data'), $('#dr-file'));
  let h;
  root.addEventListener('input', e => {
    if (e.target.id === 'dr-data') $('#dr-excl').value = '';
    syncUI(); clearTimeout(h); h = setTimeout(run, 250);
  });
  root.addEventListener('change', () => { syncUI(); clearTimeout(h); h = setTimeout(run, 50); });
  $$('[data-fig]').forEach(b => b.onclick = () => U.exportFigure((T, W, H) => P.xy(chartSpec(), T, W, H), 'dose-response', b.dataset.fig));
  U.projectButtons('dose-response', root, () => { syncUI(); run(); });
  let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => state.sets.length && drawChart(), 150); });
  document.addEventListener('bf:pro', () => state.sets.length && report());
  function $$(s) { return [...document.querySelectorAll(s)]; }

  const had = U.autosave('dose-response', root);
  if (!had || !$('#dr-data').value.trim()) loadExample('inhib'); else { syncUI(); run(); }
})();
