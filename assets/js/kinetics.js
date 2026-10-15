/* Enzyme kinetics tool */
(function () {
  'use strict';
  const { stats: S, engines: E, plot: P, ui: U, pro: Pro } = BF;
  const $ = U.$;
  const root = $('#tool');
  const state = {};
  const CONC = { pM: 1e-12, nM: 1e-9, 'µM': 1e-6, mM: 1e-3, M: 1 };
  const TIME = { s: 1, min: 60, h: 3600 };

  const EXAMPLES = {
    mm: {
      label: 'Michaelis–Menten', mode: 'single',
      data: () => {
        const r = S.rng(4); const lines = ['[S] (µM)\tv\tv\tv'];
        [1, 2.5, 5, 10, 20, 40, 80, 160, 320].forEach(s => lines.push([s, ...[0, 1, 2].map(() => (42 * s / (18 + s) * (1 + 0.045 * r.normal())).toFixed(2))].join('\t')));
        return lines.join('\n');
      }
    },
    subinh: {
      label: 'Substrate inhibition', mode: 'single',
      data: () => {
        const r = S.rng(9); const lines = ['[S] (µM)\tv\tv'];
        [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2000].forEach(s => lines.push([s, ...[0, 1].map(() => (60 * s / (22 + s * (1 + s / 450)) * (1 + 0.04 * r.normal())).toFixed(2))].join('\t')));
        return lines.join('\n');
      }
    },
    comp: {
      label: 'Competitive inhibitor', mode: 'global',
      data: () => {
        const r = S.rng(21); const I = [0, 0, 2, 2, 6, 6, 18, 18];
        const lines = ['[S] \\ [I] (µM)\t' + I.join('\t')];
        [2, 5, 10, 20, 40, 80, 160].forEach(s => lines.push([s, ...I.map(i => (35 * s / (15 * (1 + i / 3.2) + s) * (1 + 0.04 * r.normal())).toFixed(2))].join('\t')));
        return lines.join('\n');
      }
    },
    mixed: {
      label: 'Mixed inhibitor', mode: 'global',
      data: () => {
        const r = S.rng(55); const I = [0, 0, 5, 5, 15, 15, 40, 40];
        const lines = ['[S] \\ [I] (µM)\t' + I.join('\t')];
        [2, 5, 10, 20, 40, 80, 160].forEach(s => lines.push([s, ...I.map(i => (50 * s / (12 * (1 + i / 6) + s * (1 + i / (4 * 6))) * (1 + 0.035 * r.normal())).toFixed(2))].join('\t')));
        return lines.join('\n');
      }
    }
  };

  const mode = () => $('input[name=ek-mode]:checked').value;

  function parse() {
    const g = U.parseGrid($('#ek-data').value);
    const excl = new Set(($('#ek-excl').value || '').split(',').filter(Boolean));
    const pts = [];
    const glob = mode() === 'global';
    let headerI = [];
    if (glob) {
      if (!g.header) return { pts, error: 'Inhibition mode needs a header row with the inhibitor concentration of each column (0 for the uninhibited series).' };
      headerI = g.header.map(h => parseFloat(String(h).replace(',', '.')));
    }
    g.rows.forEach((r, ri) => {
      if (!isFinite(r[0])) return;
      for (let c = 1; c < r.length; c++) {
        if (!isFinite(r[c])) continue;
        const i = glob ? headerI[c] : 0;
        if (glob && !isFinite(i)) continue;
        const key = ri + ':' + c;
        pts.push({ s: r[0], i, y: r[c], key, excluded: excl.has(key) });
      }
    });
    return { pts };
  }

  function run() {
    const p = parse();
    state.pts = p.pts; state.parseError = p.error;
    state.mode = mode();
    state.res = p.pts.length ? (state.mode === 'global' ? E.kin.fitGlobal(p.pts) : E.kin.fitSingle(p.pts)) : null;
    if (state.res && !state.res.error) {
      const pick = $('#ek-model').value;
      const found = state.res.ranked.find(r => r.key === pick);
      state.sel = found || state.res.best;
      fillModelSelect();
    }
    render();
  }
  function fillModelSelect() {
    const sel = $('#ek-model');
    const cur = sel.value;
    const opts = '<option value="">Best by AICc</option>' + state.res.ranked.map(r => `<option value="${r.key}">${r.M.label}</option>`).join('');
    if (sel.dataset.sig !== state.mode + state.res.ranked.map(r => r.key).join()) {
      sel.innerHTML = opts; sel.dataset.sig = state.mode + state.res.ranked.map(r => r.key).join();
      sel.value = state.res.ranked.some(r => r.key === cur) ? cur : '';
    }
  }

  function chartSpec() {
    const view = $('#ek-view').value;
    const su = $('#ek-sunit').value, vu = $('#ek-vunit').value + '/' + $('#ek-tunit').value;
    const sel = state.sel;
    const levels = state.mode === 'global' ? [...new Set(state.pts.map(p => p.i))].sort((a, b) => a - b) : [0];
    const smax = Math.max(...state.pts.map(p => p.s));
    const spos = state.pts.filter(p => p.s > 0).map(p => p.s);
    const smin = Math.min(...spos);
    const series = levels.map((lev, li) => {
      const pts = state.pts.filter(p => p.i === lev);
      const live = pts.filter(p => !p.excluded);
      const name = state.mode === 'global' ? '[I] = ' + lev + ' ' + su : 'Data';
      let points;
      if ($('#ek-show').value === 'all') points = pts.map(p => ({ x: p.s, y: p.y, excl: p.excluded, key: p.key }));
      else {
        points = E.groupMeans(live.map(p => ({ x: p.s, y: p.y }))).map(m => ({ x: m.x, y: m.y, err: m.n > 1 ? m.sd : 0 }));
        pts.filter(p => p.excluded).forEach(p => points.push({ x: p.s, y: p.y, excl: true, key: p.key }));
      }
      const s = { name, ci: li, points };
      if (sel) {
        const f = sel.fit;
        const xs = Array.from({ length: 200 }, (_, k) => smax * 1.05 * (k + 0.5) / 200);
        s.curve = xs.map(x => [x, f.f(state.mode === 'global' ? { s: x, i: lev } : x, f.p)]);
      }
      if (view === 'lb') {
        s.points = s.points.filter(p => p.x > 0 && p.y > 0).map(p => ({ x: 1 / p.x, y: 1 / p.y, excl: p.excl, key: p.key }));
        if (s.curve) {
          const xs = Array.from({ length: 120 }, (_, k) => smin * 0.6 * Math.pow(smax * 1.2 / (smin * 0.6), k / 119));
          s.curve = xs.map(x => [1 / x, 1 / sel.fit.f(state.mode === 'global' ? { s: x, i: lev } : x, sel.fit.p)]).reverse();
        }
      }
      return s;
    });
    if (view === 'lb') return { x: { label: '1/[S] (1/' + su + ')' }, y: { label: '1/v (' + $('#ek-tunit').value + '·' + $('#ek-vunit').value + '⁻¹)', zero: true }, series };
    return { x: { label: '[S] (' + su + ')' }, y: { label: 'v (' + vu + ')', zero: true }, series };
  }
  function drawChart() {
    const host = $('#ek-chart');
    const W = Math.max(320, Math.round(host.clientWidth || 720));
    const H = Math.round(Math.min(500, Math.max(290, W * 0.6)));
    const spec = chartSpec();
    host.innerHTML = P.xy(spec, P.screen(), W, H).svg;
    const lb = $('#ek-view').value === 'lb';
    U.tooltip(host, el => {
      const s = spec.series[+el.dataset.s], p = s && s.points[+el.dataset.p];
      if (!p) return '';
      const sx = lb ? 1 / p.x : p.x, vy = lb ? 1 / p.y : p.y;
      return `<b>${U.esc(s.name)}</b><br>[S] ${U.fmt(sx, 4)} → v ${U.fmt(vy, 4)}${p.key ? `<br><span style="opacity:.75">Click to ${p.excl ? 'restore' : 'exclude'}</span>` : ''}`;
    });
    host.onclick = e => {
      const el = e.target.closest('.pt'); if (!el) return;
      const p = spec.series[+el.dataset.s].points[+el.dataset.p];
      if (!p || !p.key) { U.toast('Show every replicate to exclude single points.'); return; }
      const ex = new Set(($('#ek-excl').value || '').split(',').filter(Boolean));
      if (ex.has(p.key)) ex.delete(p.key); else ex.add(p.key);
      $('#ek-excl').value = [...ex].join(',');
      $('#ek-excl').dispatchEvent(new Event('change', { bubbles: true }));
    };
  }

  function derived(sel) {
    const f = sel.fit, p = f.p;
    const su = $('#ek-sunit').value, vc = $('#ek-vunit').value, tu = $('#ek-tunit').value;
    const eConc = parseFloat($('#ek-e').value), eu = $('#ek-eunit').value;
    const out = { vmax: p[0], vmaxCI: f.ci[0], km: p[1], kmCI: f.ci[1] };
    if (eConc > 0) {
      const k = q => q[0] * CONC[vc] / (eConc * CONC[eu]) / TIME[tu];
      out.kcat = k(p);
      const se = S.deltaSE(k, f);
      out.kcatCI = [out.kcat - f.tq * se, out.kcat + f.tq * se];
      if (sel.key !== 'hill') {
        const ke = q => k(q) / (q[1] * CONC[su]);
        out.eff = ke(p);
        const se2 = S.deltaSE(ke, f);
        out.effCI = [out.eff - f.tq * se2, out.eff + f.tq * se2];
      }
    }
    return out;
  }

  function render() {
    const out = $('#ek-results');
    if (state.parseError) { out.innerHTML = `<div class="card res"><div class="err">${U.esc(state.parseError)}</div></div>`; $('#ek-chart').innerHTML = ''; $('#ek-report').innerHTML = ''; return; }
    if (!state.pts.length) { out.innerHTML = '<div class="card empty">Paste rates or load an example.</div>'; $('#ek-chart').innerHTML = ''; $('#ek-report').innerHTML = ''; return; }
    const res = state.res;
    if (res.error) { drawChartSafe(); out.innerHTML = `<div class="card res"><div class="err">${U.esc(res.error)}</div></div>`; $('#ek-report').innerHTML = ''; return; }
    drawChart();
    const nEx = ($('#ek-excl').value || '').split(',').filter(Boolean).length;
    $('#ek-chartnote').textContent = (nEx ? nEx + ' point' + (nEx > 1 ? 's' : '') + ' excluded · ' : '') + ($('#ek-view').value === 'lb' ? 'Double-reciprocal view of the nonlinear fit, for diagnosis only.' : 'Click a point to exclude it.');
    const sel = state.sel, f = sel.fit, d = derived(sel);
    const su = $('#ek-sunit').value, vu = $('#ek-vunit').value + '/' + $('#ek-tunit').value;
    const kpi = (k, v, ci) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${ci ? `<div class="ci">${ci}</div>` : ''}</div>`;
    const ci = c => `95% CI ${U.fmt(c[0], 3)} – ${U.fmt(c[1], 3)}`;
    const k = [kpi('V<sub>max</sub>', `${U.fmt(d.vmax, 4)} <small>${U.esc(vu)}</small>`, ci(d.vmaxCI))];
    k.push(kpi(sel.key === 'hill' ? 'K<sub>½</sub>' : 'K<sub>m</sub>', `${U.fmt(d.km, 4)} <small>${U.esc(su)}</small>`, ci(d.kmCI)));
    if (state.mode === 'global') {
      k.push(kpi('K<sub>i</sub>', `${U.fmt(f.p[2], 4)} <small>${U.esc(su)}</small>`, ci(f.ci[2])));
      if (sel.key === 'mixed') k.push(kpi('α', f.p[3] > 1e3 ? '→ ∞' : U.fmt(f.p[3], 3), f.p[3] > 1e3 ? 'competitive limit' : ci(f.ci[3])));
    } else if (sel.key === 'subinh') k.push(kpi('K<sub>si</sub>', `${U.fmt(f.p[2], 4)} <small>${U.esc(su)}</small>`, ci(f.ci[2])));
    else if (sel.key === 'hill') k.push(kpi('Hill coefficient h', U.fmt(f.p[2], 3), ci(f.ci[2])));
    if (d.kcat != null) k.push(kpi('k<sub>cat</sub>', `${U.fmt(d.kcat, 4)} <small>s⁻¹</small>`, ci(d.kcatCI)));
    if (d.eff != null) k.push(kpi('k<sub>cat</sub>/K<sub>m</sub>', `${U.fmt(d.eff, 3)} <small>M⁻¹ s⁻¹</small>`, ci(d.effCI)));
    const rows = res.ranked.map(r => `<tr${r === sel ? '' : ' class="dim"'}><td>${r.M.label}${r === res.best ? ' <span class="flag ok">preferred</span>' : ''}</td><td>${(100 * r.weight).toFixed(1)}%</td><td>${isFinite(r.fit.aicc) ? (r.fit.aicc - res.best.fit.aicc).toFixed(2) : '–'}</td><td>${r.fit.r2.toFixed(4)}</td><td class="l">${r.fit.p.map((v, j) => `${r.M.names[j]} ${r.key === 'mixed' && j === 3 && v > 1e3 ? '→ ∞' : U.fmt(v, 3)}`).join(', ')}</td></tr>`).join('');
    const notes = [];
    if (res.best.weight < 0.7 && res.ranked.length > 1) notes.push(`<li class="info">The data do not clearly favour one model (best Akaike weight ${(100 * res.best.weight).toFixed(0)}%). Consider reporting the simpler model, or collecting more points where the models differ.</li>`);
    if (state.mode === 'single') {
      const smax = Math.max(...state.pts.map(p => p.s));
      if (sel.key !== 'hill' && smax < 2 * d.km) notes.push(`<li>The highest substrate concentration is below 2 × K<sub>m</sub>, so V<sub>max</sub> is an extrapolation. Extend the series to about 5–10 × K<sub>m</sub>.</li>`);
      const smin = Math.min(...state.pts.filter(p => p.s > 0).map(p => p.s));
      if (smin > d.km) notes.push('<li>No substrate concentration lies below K<sub>m</sub>, which leaves K<sub>m</sub> poorly defined.</li>');
    }
    out.innerHTML = `<div class="card res"><div class="kpis">${k.join('')}</div>
      <div class="chart-bar" style="margin-bottom:8px"><h3>${state.mode === 'global' ? 'Mechanism' : 'Model'} comparison</h3><button class="btn small ghost" id="ek-csv">Export CSV <span class="lock">PRO</span></button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>${state.mode === 'global' ? 'Mechanism' : 'Model'}</th><th>Akaike weight</th><th>ΔAICc</th><th>R²</th><th class="l">Parameters</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${notes.length ? `<ul class="notes">${notes.join('')}</ul>` : ''}</div>`;
    $('#ek-csv').onclick = () => Pro.require('CSV export', () => U.download('kinetics-results.csv', 'text/csv', U.csv(csvRows())));
    report();
  }
  function drawChartSafe() { try { state.sel = null; drawChart(); } catch (e) { $('#ek-chart').innerHTML = ''; } }
  function csvRows() {
    const rows = [['Model', 'Akaike weight', 'AICc', 'R2', 'Parameter', 'Estimate', 'SE', 'CI low', 'CI high']];
    state.res.ranked.forEach(r => r.fit.p.forEach((v, j) => rows.push([r.M.label, r.weight, r.fit.aicc, r.fit.r2, r.M.names[j], v, r.fit.se[j], r.fit.ci[j][0], r.fit.ci[j][1]])));
    return rows;
  }
  function report() {
    const res = state.res, sel = state.sel, f = sel.fit, d = derived(sel);
    const su = $('#ek-sunit').value, vu = $('#ek-vunit').value + ' ' + $('#ek-tunit').value + '⁻¹';
    const ci = c => `95% CI ${U.fmt(c[0], 3)}–${U.fmt(c[1], 3)}`;
    const eqs = {
      mm: '<i>v</i> = <i>V</i><sub>max</sub>[S]/(<i>K</i><sub>m</sub> + [S])',
      subinh: '<i>v</i> = <i>V</i><sub>max</sub>[S]/(<i>K</i><sub>m</sub> + [S](1 + [S]/<i>K</i><sub>si</sub>))',
      hill: '<i>v</i> = <i>V</i><sub>max</sub>[S]<sup><i>h</i></sup>/(<i>K</i><sub>½</sub><sup><i>h</i></sup> + [S]<sup><i>h</i></sup>)'
    };
    const reps = Math.round(state.pts.filter(p => !p.excluded).length / new Set(state.pts.map(p => p.s + ':' + p.i)).size);
    let methods;
    if (state.mode === 'global') {
      methods = `<p>Initial rates were measured at ${new Set(state.pts.map(p => p.s)).size} substrate and ${res.iLevels.length} inhibitor concentrations${reps > 1 ? ' (n = ' + reps + ')' : ''}. Competitive, non-competitive, uncompetitive and mixed inhibition models were fitted globally to all data by nonlinear least squares, sharing <i>V</i><sub>max</sub>, <i>K</i><sub>m</sub> and <i>K</i><sub>i</sub> across inhibitor concentrations. Models were compared by the corrected Akaike information criterion (AICc) and Akaike weights. 95% confidence intervals were derived from the asymptotic standard errors. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>`;
    } else {
      methods = `<p>Initial rates at ${new Set(state.pts.map(p => p.s)).size} substrate concentrations${reps > 1 ? ' (n = ' + reps + ' replicates)' : ''} were fitted by nonlinear least squares to the Michaelis–Menten equation${res.ranked.length > 1 ? ', and to substrate-inhibition and allosteric (Hill) models; models were compared by the corrected Akaike information criterion (AICc)' : ''}. The ${sel.M.label.toLowerCase()} model, ${eqs[sel.key]}, is reported. 95% confidence intervals were derived from the asymptotic standard errors${d.kcat != null ? `; <i>k</i><sub>cat</sub> was calculated as <i>V</i><sub>max</sub>/[E]<sub>T</sub> with [E]<sub>T</sub> = ${$('#ek-e').value} ${$('#ek-eunit').value}` : ''}. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>`;
    }
    let results = `<p>`;
    if (state.mode === 'global') {
      results += `The data were best described by ${sel === res.best ? '' : 'the selected '}${sel.M.label.toLowerCase()} inhibition (Akaike weight ${(100 * sel.weight).toFixed(0)}%), with <i>K</i><sub>i</sub> = ${U.fmt(f.p[2], 3)} ${su} (${ci(f.ci[2])}), <i>K</i><sub>m</sub> = ${U.fmt(f.p[1], 3)} ${su} (${ci(f.ci[1])}) and <i>V</i><sub>max</sub> = ${U.fmt(f.p[0], 3)} ${vu} (${ci(f.ci[0])})${sel.key === 'mixed' && f.p[3] < 1e3 ? `; α = ${U.fmt(f.p[3], 3)}` : ''}.`;
    } else {
      results += `The enzyme followed ${sel.key === 'mm' ? 'Michaelis–Menten kinetics' : sel.key === 'subinh' ? 'substrate-inhibition kinetics' : 'sigmoidal kinetics'} with <i>V</i><sub>max</sub> = ${U.fmt(d.vmax, 3)} ${vu} (${ci(d.vmaxCI)}) and ${sel.key === 'hill' ? '<i>K</i><sub>½</sub>' : '<i>K</i><sub>m</sub>'} = ${U.fmt(d.km, 3)} ${su} (${ci(d.kmCI)})${sel.key === 'subinh' ? `; substrate inhibition occurred with <i>K</i><sub>si</sub> = ${U.fmt(f.p[2], 3)} ${su}` : sel.key === 'hill' ? `; the Hill coefficient was ${U.fmt(f.p[2], 3)} (${ci(f.ci[2])})` : ''}.${d.kcat != null ? ` This corresponds to <i>k</i><sub>cat</sub> = ${U.fmt(d.kcat, 3)} s⁻¹${d.eff != null ? ` and <i>k</i><sub>cat</sub>/<i>K</i><sub>m</sub> = ${U.fmt(d.eff, 3)} M⁻¹ s⁻¹` : ''}.` : ''}`;
      if (res.ranked.length > 1) results += ` The ${res.best.M.label.toLowerCase()} model was preferred by AICc (Akaike weight ${(100 * res.best.weight).toFixed(0)}%).`;
    }
    results += '</p>';
    const legend = `<p><b>${state.mode === 'global' ? 'Inhibition kinetics.' : 'Substrate saturation curve.'}</b> ${$('#ek-show').value === 'all' ? 'Symbols are individual measurements' : 'Symbols show mean ± SD'}${state.mode === 'global' ? ' at each inhibitor concentration' : ''}; lines show the global ${sel.M.label.toLowerCase()} fit.</p>`;
    U.renderReport($('#ek-report'), [{ title: 'Methods', html: methods }, { title: 'Results', html: results }, { title: 'Figure legend', html: legend }], {
      title: 'Enzyme kinetics', file: 'enzyme-kinetics-report',
      figure: () => P.xy(chartSpec(), P.print, 720, 500).svg,
      tables: () => '<h4>Parameters</h4><table>' + csvRows().map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${typeof v === 'number' ? U.fmt(v, 4) : U.esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'
    });
  }

  function syncUI() {
    const g = mode() === 'global';
    $('#ek-hint').innerHTML = g
      ? 'Header row: the inhibitor concentration of each column (repeat a value for replicates, 0 for no inhibitor).'
      : 'Substrate concentration, then replicate rate columns.';
  }
  function loadExample(k) {
    const ex = EXAMPLES[k];
    $('#ek-data').value = ex.data();
    $(`input[name=ek-mode][value=${ex.mode}]`).checked = true;
    $('#ek-model').value = ''; $('#ek-excl').value = ''; $('#ek-view').value = 'mm';
    syncUI(); run(); root.dispatchEvent(new Event('change'));
  }
  $('#ek-examples').innerHTML = Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" data-ex="${k}">${e.label}</button>`).join('');
  $('#ek-examples').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) loadExample(b.dataset.ex); };
  U.fileInto($('#ek-data'), $('#ek-file'));
  let h;
  root.addEventListener('input', e => { if (e.target.id === 'ek-data') $('#ek-excl').value = ''; clearTimeout(h); h = setTimeout(run, 250); });
  root.addEventListener('change', e => { if (e.target.name === 'ek-mode') { $('#ek-model').value = ''; syncUI(); } clearTimeout(h); h = setTimeout(run, 40); });
  [...document.querySelectorAll('[data-fig]')].forEach(b => b.onclick = () => U.exportFigure((T, W, H) => P.xy(chartSpec(), T, W, H), 'enzyme-kinetics', b.dataset.fig));
  U.projectButtons('enzyme-kinetics', root, () => { syncUI(); run(); });
  let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => state.sel && drawChart(), 150); });
  document.addEventListener('bf:pro', () => state.sel && report());
  const had = U.autosave('enzyme-kinetics', root);
  syncUI();
  if (!had || !$('#ek-data').value.trim()) loadExample('mm'); else run();
})();
