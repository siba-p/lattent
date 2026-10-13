/* qPCR relative quantification tool */
(function () {
  'use strict';
  const { stats: S, engines: E, plot: P, ui: U, pro: Pro } = BF;
  const $ = U.$;
  const root = $('#tool');
  const state = {};
  const REF_RE = /^(gapdh|actb|b2m|18s|rn18s|rplp0|hprt1?|tbp|ppia|ubc|ywhaz|gusb|hmbs|sdha|eef1a1|rpl13a|tubb|b-?actin|beta-?actin|act|ef1a?)$/i;
  const CTRL_RE = /^(ctrl|control|vehicle|veh|untreated|mock|wt|wild ?type|dmso|pbs|naive|baseline|sham|nt|scr|scramble|sicontrol|sinc)/i;

  function example1() {
    const r = S.rng(3);
    const lines = ['Sample\tGroup\tGene\tCt'];
    const groups = { Control: { IL6: 0, TNF: 0 }, LPS: { IL6: 5.2, TNF: 3.4 }, 'LPS + drug': { IL6: 2.1, TNF: 1.1 } };
    const base = { GAPDH: 17.8, ACTB: 19.1, IL6: 29.5, TNF: 27.2 };
    Object.entries(groups).forEach(([g, eff]) => {
      for (let b = 1; b <= 3; b++) {
        const load = 0.35 * r.normal();
        const name = g.replace(/[^A-Za-z]+/g, '') + '_' + b;
        Object.keys(base).forEach(gene => {
          const bio = 0.3 * r.normal();
          const ct = base[gene] + load - (eff[gene] || 0) + (eff[gene] != null ? bio : 0.1 * r.normal());
          for (let t = 0; t < 2; t++) lines.push([name, g, gene, (ct + 0.08 * r.normal()).toFixed(2)].join('\t'));
        });
      }
    });
    return lines.join('\n');
  }
  function example2() {
    const r = S.rng(12);
    const lines = ['Sample Name,Target Name,CT'];
    const kd = { siControl: 0, siKRAS: 2.6 };
    Object.entries(kd).forEach(([g, d]) => {
      for (let b = 1; b <= 4; b++) {
        const load = 0.3 * r.normal();
        [['RPLP0', 18.4, 0], ['KRAS', 24.9, d], ['MYC', 26.1, d * 0.45]].forEach(([gene, c, shift]) => {
          const ct = c + load + shift + (shift ? 0.25 * r.normal() : 0.08 * r.normal());
          for (let t = 0; t < 3; t++) lines.push([g + '-' + b, gene, (t === 2 && gene === 'MYC' && b === 3) ? 'Undetermined' : (ct + 0.1 * r.normal()).toFixed(3)].join(','));
        });
      }
    });
    return lines.join('\n');
  }
  const EXAMPLES = {
    lps: { label: 'Cytokines after LPS (2 reference genes)', data: example1 },
    kd: { label: 'siRNA knockdown (instrument export)', data: example2 }
  };

  /* ---------- parse ---------- */
  function parse() {
    const g = U.parseGrid($('#qp-data').value);
    if (!g.header) return { error: g.rows.length ? 'Add a header row naming the Sample, Gene (or Target) and Ct (or Cq) columns.' : null, rows: [] };
    const H = g.header.map(h => String(h).trim().toLowerCase());
    const find = re => H.findIndex(h => re.test(h));
    const cs = find(/^(sample|sample ?name|biological|bio ?rep|well name|name)$/), cgr = find(/^(group|condition|treatment|biological group)$/);
    const cg = find(/^(gene|target|target ?name|detector|assay|primer)$/), cc = find(/^(ct|cq|c[tq] ?(mean)?|cт|crt|cp)$/);
    if (cs < 0 || cg < 0 || cc < 0) return { error: 'Could not find the columns. The header needs Sample, Gene (or Target) and Ct (or Cq); Group is optional.', rows: [] };
    let derived = false;
    const rows = g.raw.map((cells, i) => {
      const sample = (cells[cs] || '').trim();
      let group = cgr >= 0 ? (cells[cgr] || '').trim() : '';
      if (!group) { group = sample.replace(/[\s_\-.]*(rep)?\d+$/i, '').trim() || sample; derived = true; }
      const raw = cells[cc];
      const ct = g.rows[i][cc];
      return { sample, group, gene: (cells[cg] || '').trim(), ct: isFinite(ct) && ct > 0 && ct < 45 ? ct : NaN, raw };
    }).filter(r => r.sample && r.gene);
    return { rows, derived };
  }

  function syncPickers(rows) {
    const genes = [...new Set(rows.map(r => r.gene))];
    const groups = [...new Set(rows.map(r => r.group))];
    const sig = genes.join('|') + '#' + groups.join('|');
    if ($('#qp-refs').dataset.sig === sig) return;
    $('#qp-refs').dataset.sig = sig;
    let saved = {};
    try { saved = JSON.parse($('#qp-cfg').value || '{}'); } catch (e) { saved = {}; }
    const refs = saved.refs && saved.refs.some(x => genes.includes(x)) ? saved.refs : genes.filter(g => REF_RE.test(g));
    if (!refs.length && genes.length > 1) refs.push(genes[0]);
    $('#qp-refs').innerHTML = genes.map(g => `<label class="check"><input type="checkbox" value="${U.esc(g)}"${refs.includes(g) ? ' checked' : ''}> ${U.esc(g)}</label>`).join('');
    const ctrl = saved.control && groups.includes(saved.control) ? saved.control : (groups.find(g => CTRL_RE.test(g)) || groups[0]);
    $('#qp-ctrl').innerHTML = groups.map(g => `<option${g === ctrl ? ' selected' : ''}>${U.esc(g)}</option>`).join('');
    const eff = saved.eff || {};
    $('#qp-eff').innerHTML = genes.map(g => `<div class="inline" style="margin:4px 0"><span style="flex:1;font-size:13.5px">${U.esc(g)}</span><input type="number" data-gene="${U.esc(g)}" value="${eff[g] != null ? eff[g] : 100}" step="any" min="50" max="120" aria-label="Efficiency of ${U.esc(g)} in percent"><span class="hint" style="margin:0">%</span></div>`).join('');
  }
  function readCfg() {
    const refs = [...document.querySelectorAll('#qp-refs input:checked')].map(i => i.value);
    const eff = {};
    document.querySelectorAll('#qp-eff input').forEach(i => { const v = parseFloat(i.value); eff[i.dataset.gene] = isFinite(v) ? v : 100; });
    const cfg = { refs, control: $('#qp-ctrl').value, eff };
    $('#qp-cfg').value = JSON.stringify(cfg);
    return cfg;
  }

  function run() {
    const p = parse();
    state.parseError = p.error; state.rows = p.rows; state.derived = p.derived;
    if (p.rows.length) syncPickers(p.rows);
    if (!p.rows.length) { state.res = null; render(); return; }
    const cfg = readCfg();
    const eff = {}; Object.entries(cfg.eff).forEach(([g, v]) => { eff[g] = 1 + v / 100; });
    state.res = E.qpcr.analyse(p.rows, { refs: cfg.refs, control: cfg.control, eff });
    render();
  }

  function chartSpec() {
    const res = state.res;
    const groups = res.groups.filter(g => res.summary.some(s => s.group === g));
    return {
      groups,
      y: { label: 'Fold change vs ' + res.control + ' (log₂ scale)' },
      series: res.targets.map((g, i) => {
        const cells = {};
        res.summary.filter(s => s.gene === g).forEach(s => {
          cells[s.group] = {
            mean: s.fold, lo: s.lo, hi: s.hi,
            pts: res.per.filter(r => r.gene === g && r.group === s.group).map(r => r.fold),
            mark: $('#qp-stars').checked && !s.isControl && isFinite(s.pAdj) ? U.stars(s.pAdj) : ''
          };
        });
        return { name: g, ci: i, cells };
      })
    };
  }
  function drawChart() {
    const host = $('#qp-chart');
    const W = Math.max(320, Math.round(host.clientWidth || 720));
    const H = Math.round(Math.min(480, Math.max(290, W * 0.56)));
    const spec = chartSpec();
    host.innerHTML = P.cat(spec, P.screen(), W, H).svg;
    U.tooltip(host, el => {
      const s = spec.series[+el.dataset.s], g = spec.groups[+el.dataset.g];
      const row = state.res.summary.find(r => r.gene === s.name && r.group === g);
      return row ? `<b>${U.esc(s.name)} · ${U.esc(g)}</b><br>${U.fmt(row.fold, 3)}-fold (95% CI ${U.fmt(row.lo, 3)}–${U.fmt(row.hi, 3)})${isFinite(row.p) ? '<br>p = ' + U.pfmt(row.p) : ''}` : '';
    });
  }

  function render() {
    const out = $('#qp-results');
    if (state.parseError) { out.innerHTML = `<div class="card res"><div class="err">${U.esc(state.parseError)}</div></div>`; $('#qp-chart').innerHTML = ''; $('#qp-report').innerHTML = ''; return; }
    if (!state.res) { out.innerHTML = '<div class="card empty">Paste Ct values or load an example.</div>'; $('#qp-chart').innerHTML = ''; $('#qp-report').innerHTML = ''; return; }
    const res = state.res;
    if (res.error) { out.innerHTML = `<div class="card res"><div class="err">${U.esc(res.error)}</div></div>`; $('#qp-chart').innerHTML = ''; $('#qp-report').innerHTML = ''; return; }
    drawChart();
    $('#qp-chartnote').textContent = 'Lines: geometric mean with 95% CI; dots: biological replicates.' + ($('#qp-stars').checked ? ' Stars: Holm-adjusted Welch tests vs ' + res.control + '.' : '');
    const tab = out.dataset.tab || 'fold';
    const srows = res.summary.map(s => `<tr${s.isControl ? ' class="dim"' : ''}><td>${U.esc(s.gene)}</td><td class="l">${U.esc(s.group)}</td><td>${s.n}</td><td><b>${U.fmt(s.fold, 3)}</b></td><td>${s.n > 1 ? U.fmt(s.lo, 3) + ' – ' + U.fmt(s.hi, 3) : '–'}</td><td>${s.log2.toFixed(2)}</td><td>${s.isControl ? 'reference' : U.pfmt(s.p)}</td><td>${s.isControl ? '' : U.pfmt(s.pAdj)}</td><td>${s.isControl ? '' : U.stars(s.pAdj)}</td></tr>`).join('');
    const trows = res.techRows.slice().sort((a, b) => (b.sd || 0) - (a.sd || 0)).map(t => `<tr><td>${U.esc(t.sample)}</td><td class="l">${U.esc(t.group)}</td><td class="l">${U.esc(t.gene)}</td><td>${t.n}</td><td>${U.fmt(t.ct, 4)}</td><td>${isFinite(t.sd) ? t.sd.toFixed(3) : '–'}</td><td class="l">${t.n === 0 ? '<span class="flag bad">no Ct</span>' : t.sd > 0.5 ? '<span class="flag">SD > 0.5</span>' : '<span class="flag ok">ok</span>'}</td></tr>`).join('');
    const prows = res.per.map(r => `<tr><td>${U.esc(r.sample)}</td><td class="l">${U.esc(r.group)}</td><td class="l">${U.esc(r.gene)}</td><td>${r.dct.toFixed(3)}</td><td>${(-r.log2).toFixed(3)}</td><td>${U.fmt(r.fold, 4)}</td></tr>`).join('');
    const notes = res.warnings.map(w => `<li>${U.esc(w)}</li>`);
    if (state.derived) notes.push('<li class="info">No Group column was found, so groups were taken from the sample names with the trailing replicate number removed. Check the list of groups.</li>');
    const small = res.summary.filter(s => s.n < 3);
    if (small.length) notes.push('<li class="info">Some groups have fewer than three biological replicates, so their confidence intervals and p-values are unreliable.</li>');
    if (res.refs.length === 1) notes.push('<li class="info">One reference gene is used. MIQE guidelines recommend at least two validated reference genes.</li>');
    out.innerHTML = `<div class="card res">
      <div class="subtabs" role="tablist">
        <button role="tab" data-t="fold" aria-selected="${tab === 'fold'}">Fold change</button>
        <button role="tab" data-t="per" aria-selected="${tab === 'per'}">Per sample (ΔCt)</button>
        <button role="tab" data-t="tech" aria-selected="${tab === 'tech'}">Technical replicates</button>
        <span style="flex:1"></span><button class="btn small ghost" id="qp-csv" style="margin:2px 0 6px">Export CSV <span class="lock">PRO</span></button>
      </div>
      <div class="tbl-wrap" ${tab === 'fold' ? '' : 'hidden'}><table class="t"><thead><tr><th>Gene</th><th class="l">Group</th><th>n</th><th>Fold change</th><th>95% CI</th><th>log₂ FC</th><th>p</th><th>p (Holm)</th><th></th></tr></thead><tbody>${srows}</tbody></table></div>
      <div class="tbl-wrap" ${tab === 'per' ? '' : 'hidden'}><table class="t"><thead><tr><th>Sample</th><th class="l">Group</th><th class="l">Gene</th><th>ΔCt</th><th>ΔΔCt</th><th>Fold change</th></tr></thead><tbody>${prows}</tbody></table>
        <p class="hint">ΔCt = Ct(target) − mean Ct(reference genes). With efficiencies other than 100%, fold change uses the efficiency-corrected formula, so 2<sup>−ΔΔCt</sup> is only approximate.</p></div>
      <div class="tbl-wrap" ${tab === 'tech' ? '' : 'hidden'}><table class="t"><thead><tr><th>Sample</th><th class="l">Group</th><th class="l">Gene</th><th>Wells</th><th>Mean Ct</th><th>SD</th><th class="l">QC</th></tr></thead><tbody>${trows}</tbody></table></div>
      ${notes.length ? `<ul class="notes">${notes.join('')}</ul>` : ''}
    </div>`;
    out.querySelectorAll('.subtabs [data-t]').forEach(b => b.onclick = () => { out.dataset.tab = b.dataset.t; render(); });
    $('#qp-csv').onclick = () => Pro.require('CSV export', () => U.download('qpcr-results.csv', 'text/csv', U.csv(csvRows())));
    report();
  }
  function csvRows() {
    return [['Gene', 'Group', 'n', 'Fold change', 'CI low', 'CI high', 'log2 FC', 'SD log2', 'p (Welch)', 'p (Holm)']]
      .concat(state.res.summary.map(s => [s.gene, s.group, s.n, s.fold, s.lo, s.hi, s.log2, s.sd, s.p, s.pAdj]));
  }
  function report() {
    const res = state.res;
    const effs = res.genes.map(g => res.eff[g]);
    const all100 = effs.every(e => Math.abs(e - 2) < 1e-9);
    const nb = Math.round(S.mean(res.summary.map(s => s.n)));
    const tech = Math.round(S.mean(res.techRows.map(t => t.n).filter(n => n > 0)));
    const methods = `<p>Relative expression was quantified ${all100 ? 'by the comparative C<sub>t</sub> (2<sup>−ΔΔC<sub>t</sub></sup>) method' : 'by the efficiency-corrected method of Pfaffl'} using ${res.refs.length > 1 ? 'the geometric mean of ' + res.refs.length + ' reference genes (' + res.refs.join(', ') + ')' : res.refs[0] + ' as the reference gene'}. ${tech > 1 ? `Technical replicates (${tech} wells) were averaged, and ` : ''}${res.control} samples served as the calibrator. ${all100 ? 'Amplification efficiencies were assumed to be 100%.' : 'Amplification efficiencies were ' + res.genes.map(g => `${g} ${((res.eff[g] - 1) * 100).toFixed(0)}%`).join(', ') + '.'} Statistical comparisons with the control group used Welch's t-test on log<sub>2</sub>-transformed relative quantities (n = ${nb} biological replicates per group), with Holm correction for multiple comparisons; 95% confidence intervals were computed on the log scale and back-transformed. Analyses were performed with Benchfit (${BF_CONFIG.site}).</p>`;
    const parts = [];
    res.targets.forEach(g => {
      const rows = res.summary.filter(s => s.gene === g && !s.isControl);
      if (!rows.length) return;
      parts.push(`${g} ${rows.map(s => `${s.fold >= 1 ? 'increased' : 'decreased'} ${U.fmt(s.fold >= 1 ? s.fold : 1 / s.fold, 3)}-fold in ${s.group} (95% CI ${U.fmt(s.lo, 3)}–${U.fmt(s.hi, 3)}${s.fold < 1 ? ' of control' : ''}; adjusted p ${s.pAdj < 0.0001 ? '< 0.0001' : '= ' + (isFinite(s.pAdj) ? s.pAdj.toFixed(3) : 'n/a')})`).join(' and ')}`);
    });
    const results = `<p>Relative to ${res.control}, ${parts.join('; ')}.</p>`;
    const legend = `<p><b>Relative mRNA expression.</b> Fold change relative to ${res.control}, normalised to ${res.refs.join(' and ')}. Dots show biological replicates; horizontal lines show the geometric mean and vertical lines the 95% confidence interval. ${$('#qp-stars').checked ? '* p < 0.05, ** p < 0.01, *** p < 0.001 (Welch\'s t-test, Holm-adjusted); ns, not significant.' : ''}</p>`;
    U.renderReport($('#qp-report'), [{ title: 'Methods', html: methods }, { title: 'Results', html: results }, { title: 'Figure legend', html: legend }], {
      title: 'qPCR relative quantification', file: 'qpcr-report',
      figure: () => P.cat(chartSpec(), P.print, 720, 480).svg,
      tables: () => '<h4>Fold change</h4><table>' + csvRows().map((r, i) => '<tr>' + r.map(v => `<${i ? 'td' : 'th'}>${typeof v === 'number' ? U.fmt(v, 4) : U.esc(v)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'
    });
  }

  function effModal() {
    const m = U.modal(`<p class="m-kicker">Primer efficiency</p><h2>From a dilution series</h2>
      <div class="field"><label for="ef-data">Relative quantity (or dilution), Ct</label>
      <textarea id="ef-data" style="min-height:150px">1\t18.02\n0.2\t20.35\n0.04\t22.66\n0.008\t25.01\n0.0016\t27.38</textarea></div>
      <div id="ef-out" class="kpis"></div>
      <p class="m-note">An efficient assay has a slope near −3.32, i.e. 90–110% efficiency, with R² above 0.98.</p>`);
    const go = () => {
      const g = U.parseGrid($('#ef-data', m).value);
      const pts = g.rows.filter(r => r[0] > 0 && isFinite(r[1])).map(r => ({ q: r[0], ct: r[1] }));
      if (pts.length < 3) { $('#ef-out', m).innerHTML = '<p class="hint">At least three dilutions are needed.</p>'; return; }
      const e = E.qpcr.efficiency(pts);
      const good = e.pct >= 90 && e.pct <= 110 && e.r2 >= 0.98;
      $('#ef-out', m).innerHTML = `<div class="kpi"><div class="k">Efficiency</div><div class="v">${e.pct.toFixed(1)}%</div><div class="ci"><span class="flag ${good ? 'ok' : ''}">${good ? 'acceptable' : 'check the assay'}</span></div></div><div class="kpi"><div class="k">Slope</div><div class="v">${e.slope.toFixed(3)}</div></div><div class="kpi"><div class="k">R²</div><div class="v">${e.r2.toFixed(4)}</div></div>`;
    };
    $('#ef-data', m).addEventListener('input', go); go();
  }

  function loadExample(k) {
    $('#qp-data').value = EXAMPLES[k].data();
    $('#qp-cfg').value = ''; $('#qp-refs').dataset.sig = '';
    run(); root.dispatchEvent(new Event('change'));
  }
  $('#qp-examples').innerHTML = Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" data-ex="${k}">${e.label}</button>`).join('');
  $('#qp-examples').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) loadExample(b.dataset.ex); };
  $('#qp-effcalc').onclick = effModal;
  U.fileInto($('#qp-data'), $('#qp-file'));
  let h;
  root.addEventListener('input', e => { if (e.target.id === 'qp-data') $('#qp-refs').dataset.sig = ''; clearTimeout(h); h = setTimeout(run, 250); });
  root.addEventListener('change', () => { clearTimeout(h); h = setTimeout(run, 40); });
  [...document.querySelectorAll('[data-fig]')].forEach(b => b.onclick = () => U.exportFigure((T, W, H) => P.cat(chartSpec(), T, W, H), 'qpcr-fold-change', b.dataset.fig));
  U.projectButtons('qpcr', root, () => { $('#qp-refs').dataset.sig = ''; run(); });
  let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => state.res && !state.res.error && drawChart(), 150); });
  document.addEventListener('bf:pro', () => state.res && !state.res.error && report());
  const had = U.autosave('qpcr', root);
  if (!had || !$('#qp-data').value.trim()) loadExample('lps'); else run();
})();
