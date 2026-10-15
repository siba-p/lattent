/* Lattent Studio: data tables → analyses → graphs → write-up, with Facet, the AI lab partner. */
(function () {
  'use strict';
  const { stats: S, models: M, analysis: A, plot: P, ui: U, pro: Pro } = BF;
  const $ = U.$, esc = U.esc, fmt = (v, s) => U.fmt(v, s || 4);
  const pEq = p => (p < 0.0001 ? 'p < 0.0001' : 'p = ' + U.pfmt(p));
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const KEY = 'bf.studio.v1';
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const TYPES = {
    xy: { label: 'XY', tag: 'XY', title: 'XY table', desc: 'One X column and one or more Y columns, e.g. temperature vs conductivity, 2θ vs intensity, dose vs response. Columns with the same title are replicates.' },
    col: { label: 'Column', tag: 'COL', title: 'Column table', desc: 'Each column is a group of measurements, e.g. four catalyst batches or treatment groups. For t tests, ANOVA and descriptive statistics.' },
    mv: { label: 'Multiple variables', tag: 'MV', title: 'Multiple-variables table', desc: 'Each row is a sample or experiment, each column a variable (composition, process, property). For correlation, regression, PCA, clustering and Bayesian optimisation.' }
  };

  /* ================= project state ================= */
  let proj = null, cur = null, cache = {};
  const blankTable = (type, name) => ({ id: uid('t'), name: name || 'Data ' + ((proj ? proj.tables.length : 0) + 1), type, cols: type === 'xy' ? ['X', 'Y'] : type === 'col' ? ['Group A', 'Group B', 'Group C'] : ['Sample', 'Var 1', 'Var 2', 'Var 3'], rows: [], ylabel: '', v: 1 });
  function save() { try { localStorage.setItem(KEY, JSON.stringify(proj)); } catch (e) { /* quota or disabled */ } scheduleCloud(); }
  function load() { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return null; } }
  /* Projects can come from files or shared cloud storage: keep only well-formed data. */
  function sanitize(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.tables)) return null;
    const str = (v, n) => String(v == null ? '' : v).slice(0, n || 500);
    const prim = v => (v === null || ['string', 'number', 'boolean'].includes(typeof v) ? (typeof v === 'string' ? v.slice(0, 2000) : v) : null);
    const cleanOpts = o => {
      const out = {};
      Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 40).forEach(([k, v]) => {
        if (!/^[A-Za-z]\w{0,30}$/.test(k)) return;
        if (Array.isArray(v)) out[k] = v.slice(0, 200).map(prim).filter(x => x !== null);
        else if (v && typeof v === 'object') { const f = {}; Object.entries(v).slice(0, 20).forEach(([a, b]) => { if (/^\d{1,2}$/.test(a) && isFinite(b)) f[a] = +b; }); out[k] = f; }
        else out[k] = prim(v);
      });
      return out;
    };
    const tables = p.tables.slice(0, 50).filter(t => t && TYPES[t.type]).map(t => ({
      id: /^t\w{1,20}$/.test(t.id) ? t.id : uid('t'), name: str(t.name, 200) || 'Data', type: t.type,
      cols: (Array.isArray(t.cols) ? t.cols : []).slice(0, 200).map(c => str(c, 200)),
      rows: (Array.isArray(t.rows) ? t.rows : []).slice(0, 100000).map(r => (Array.isArray(r) ? r.slice(0, 200).map(c => str(c, 100)) : [])),
      ylabel: str(t.ylabel, 200), v: 1
    }));
    const ids = new Set(tables.map(t => t.id));
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, 500).filter(i => i && K[i.kind] && ids.has(i.tableId)).map(i => ({
      id: /^a\w{1,20}$/.test(i.id) ? i.id : uid('a'), tableId: i.tableId, kind: i.kind, opts: cleanOpts(i.opts), name: i.name ? str(i.name, 200) : undefined
    }));
    const out = { name: str(p.name, 200) || 'Untitled project', tables, items };
    if (p.cloud && typeof p.cloud === 'object' && /^[0-9a-f-]{36}$/i.test(p.cloud.id || '')) out.cloud = { id: p.cloud.id, version: +p.cloud.version || 1, teamId: /^[0-9a-f-]{36}$/i.test(p.cloud.teamId || '') ? p.cloud.teamId : null, savedAt: +p.cloud.savedAt || 0 };
    return out;
  }
  const table = id => proj.tables.find(t => t.id === id);
  const item = id => proj.items.find(i => i.id === id);

  /* ================= table → numbers ================= */
  const num = s => { if (s == null) return NaN; const t = String(s).trim().replace(/^(\d+),(\d+)$/, '$1.$2'); return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? parseFloat(t) : NaN; };
  function xyData(t) {
    const names = [], colOf = [];
    for (let c = 1; c < t.cols.length; c++) {
      const nm = (t.cols[c] || '').trim() || 'Y' + c;
      if (!t.rows.some(r => isFinite(num(r[c])))) continue;
      let i = names.indexOf(nm); if (i < 0) { names.push(nm); i = names.length - 1; } colOf[c] = i;
    }
    const series = names.map(n => ({ name: n, pts: [] }));
    t.rows.forEach(r => {
      const x = num(r[0]); if (!isFinite(x)) return;
      for (let c = 1; c < r.length; c++) if (colOf[c] != null && isFinite(num(r[c]))) series[colOf[c]].pts.push({ x, y: num(r[c]) });
    });
    series.forEach(s => {
      s.xs = s.pts.map(p => p.x); s.ys = s.pts.map(p => p.y);
      const m = new Map(); s.pts.forEach(p => { if (!m.has(p.x)) m.set(p.x, []); m.get(p.x).push(p.y); });
      s.means = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([x, v]) => ({ x, y: S.mean(v), sd: v.length > 1 ? S.sd(v) : 0, n: v.length }));
      s.reps = Math.max(...s.means.map(q => q.n), 1);
    });
    return { xlabel: t.cols[0] || 'X', ylabel: t.ylabel || names[0] || 'Y', series: series.filter(s => s.pts.length) };
  }
  function colData(t) {
    return t.cols.map((name, j) => ({ name: (name || '').trim() || 'Group ' + (j + 1), v: t.rows.map(r => num(r[j])).filter(isFinite) })).filter(g => g.v.length);
  }
  function mvData(t) {
    const cols = t.cols.map((name, j) => {
      const vals = t.rows.map(r => r[j]).filter(v => v != null && String(v).trim() !== '');
      const numeric = vals.length > 0 && vals.filter(v => isFinite(num(v))).length >= 0.8 * vals.length;
      return { j, name: (name || '').trim() || 'Var ' + (j + 1), numeric };
    });
    const label = cols.find(c => !c.numeric);
    return { cols, numeric: cols.filter(c => c.numeric), label };
  }
  function mvMatrix(t, idx) {
    const rows = [], labels = [], keep = [];
    const d = mvData(t);
    t.rows.forEach((r, i) => {
      const v = idx.map(j => num(r[j]));
      if (v.every(isFinite)) { rows.push(v); labels.push(d.label ? String(r[d.label.j] || '') : 'Row ' + (i + 1)); keep.push(i); }
    });
    return { rows, labels, keep, names: idx.map(j => d.cols[j].name) };
  }
  const tableVersion = t => t.v || 0;

  /* ================= catalogue ================= */
  const fieldOpts = () => M.fields.map(fl => `<optgroup label="${esc(fl)}">${M.library.filter(m => m.field === fl).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('') + '<optgroup label="Custom"><option value="custom">User-defined equation…</option></optgroup>';
  const colOptions = (t, sel, filter) => mvData(t).cols.filter(c => (filter ? filter(c) : c.numeric)).map(c => `<option value="${c.j}"${String(sel) === String(c.j) ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const colChecks = (t, key, sel) => mvData(t).numeric.map(c => `<label class="check"><input type="checkbox" data-o="${key}" value="${c.j}"${!sel || sel.includes(c.j) ? ' checked' : ''}> ${esc(c.name)}</label>`).join('');
  const sel = (key, options, v) => `<select data-o="${key}">${options.map(([val, lab]) => `<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;

  const K = {};
  /* ---------- XY ---------- */
  K.nlfit = {
    label: 'Nonlinear regression (curve fit)', types: ['xy'], group: 'Fit a model',
    desc: 'Fit any of 35 equations from materials science, polymers, nanomaterials, chemistry and biology, or type your own.',
    defaults: () => ({ model: 'line', weight: 'none', fixed: {} }),
    form(o) {
      const m = o.model === 'custom' ? null : M.byId(o.model);
      let params = [];
      try { params = o.model === 'custom' ? M.compile(o.expr || 'A*exp(-k*x)+c').params : m.params; } catch (e) { params = []; }
      return `<div class="fg"><label>Equation</label><select data-o="model">${fieldOpts().replace(`value="${esc(o.model)}"`, `value="${esc(o.model)}" selected`)}</select>
        ${m ? `<small class="eqn">${esc(m.eq)}</small>${m.note ? `<small>${esc(m.note)}</small>` : ''}` : ''}</div>
        <div class="fg" ${o.model === 'custom' ? '' : 'hidden'}><label>Y =</label><input type="text" data-o="expr" value="${esc(o.expr || 'A*exp(-k*x) + c')}" spellcheck="false"><small>Use x, parameters of any name, + − * / ^, exp, ln, log10, sqrt, sin, cos, pi, R, kB.</small></div>
        <div class="fg"><label>Constrain parameters</label><div class="fixgrid">${params.map((p, j) => `<label class="check"><input type="checkbox" data-fix="${j}"${o.fixed && o.fixed[j] != null ? ' checked' : ''}> ${esc(p)} =</label><input type="number" step="any" data-fixv="${j}" value="${o.fixed && o.fixed[j] != null ? o.fixed[j] : ''}">`).join('')}</div></div>
        <div class="fg two"><div><label>Weighting</label>${sel('weight', [['none', 'None (least squares)'], ['1/y', '1/Y'], ['1/y2', '1/Y² (relative)']], o.weight)}</div>
        <div><label>Axes</label><label class="check"><input type="checkbox" data-o="logx"${o.logx ? ' checked' : ''}> log X</label><label class="check"><input type="checkbox" data-o="logy"${o.logy ? ' checked' : ''}> log Y</label></div></div>`;
    },
    run(t, o) {
      const d = xyData(t);
      const model = o.model === 'custom' ? M.custom(o.expr || 'A*exp(-k*x) + c', o.start) : M.byId(o.model);
      const fixed = {}; Object.entries(o.fixed || {}).forEach(([j, v]) => { if (isFinite(v)) fixed[j] = +v; });
      return { d, model, fits: d.series.map(s => ({ s, r: M.fit(model, s.xs, s.ys, { fixed, weight: o.weight }) })) };
    },
    render(res, o) {
      const ok = res.fits.filter(f => !f.r.error);
      const m = res.model;
      const head = `<tr><th>Parameter</th>${res.fits.map((f, i) => `<th><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${esc(f.s.name)}</th>`).join('')}</tr>`;
      const cell = (f, j) => { if (f.r.error) return '<td>–</td>'; const fr = f.r.fit; return `<td>${fmt(fr.p[j], 5)}${fr.fixed[j] ? ' <small>(fixed)</small>' : `<small> ± ${fmt(fr.se[j], 3)}</small><br><small class="ci">${fmt(fr.ci[j][0], 4)} to ${fmt(fr.ci[j][1], 4)}</small>`}</td>`; };
      let rows = m.params.map((p, j) => `<tr><td>${esc(p)}</td>${res.fits.map(f => cell(f, j)).join('')}</tr>`).join('');
      const dn = ok.length ? ok[0].r.derived.map(d => d.name) : [];
      rows += dn.map((nm, k) => `<tr class="derived"><td>${esc(nm)}</td>${res.fits.map(f => f.r.error ? '<td>–</td>' : `<td>${fmt(f.r.derived[k].value, 5)}<small> ± ${fmt(f.r.derived[k].se, 3)}</small></td>`).join('')}</tr>`).join('');
      const gof = [['R²', f => f.r.fit.r2.toFixed(5)], ['Sy.x', f => fmt(Math.sqrt(f.r.fit.ssrUnweighted / f.r.fit.dof), 4)], ['Points / df', f => f.r.fit.n + ' / ' + f.r.fit.dof], ['AICc', f => f.r.fit.aicc.toFixed(2)], ['Runs test p', f => isFinite(f.r.runsP) ? f.r.runsP.toFixed(3) : '–']];
      rows += gof.map(([nm, g], i) => `<tr class="gof${i ? '' : ' first'}"><td>${nm}</td>${res.fits.map(f => `<td>${f.r.error ? esc(f.r.error) : g(f)}</td>`).join('')}</tr>`).join('');
      const warns = [].concat(...res.fits.map(f => (f.r.error ? [f.s.name + ': ' + f.r.error] : f.r.warn.map(w => f.s.name + ': ' + w))));
      if (BF.ml && BF.ml.ready() && m.id !== 'custom' && res.fits[0]) {
        const sh = BF.ml.classify(res.fits[0].s.xs, res.fits[0].s.ys);
        if (sh && sh[0].p > 0.9 && sh[0].models && !BF.ml.candidates(sh, 0.97).includes(m.id)) {
          const alt = sh[0].models.map(id => M.byId(id)).filter(Boolean).slice(0, 3).map(x => x.name).join(', ');
          warns.push(`The data look like “${sh[0].label}” (${(100 * sh[0].p).toFixed(0)}% confidence), which ${m.name} does not usually describe. Consider ${alt}, or run Find the best model.`);
        }
        const nz = BF.ml.noise(res.fits[0].s.xs, res.fits[0].s.ys);
        if (nz && nz.recommend === '1/y2' && o.weight === 'none') warns.push(`Scatter appears to grow with the signal (${(100 * nz.proportional).toFixed(0)}% likely) over a ${Math.pow(10, nz.dynamicRange).toFixed(0)}-fold range; weighting by 1/Y² usually gives more reliable parameters.`);
      }
      return {
        html: `<p class="eqline"><b>${esc(m.name)}</b> · <span class="eqn">${esc(m.eq)}</span></p>
          ${chartBox(0, 'Fit')}
          <div class="tbl-wrap"><table class="t rt">${head}${rows}</table></div>
          ${notes(warns)}
          ${chartBox(1, 'Residuals', true)}`,
        charts: [(T, W, H) => P.xy(fitSpec(res, o, true), T, W, H), (T, W, H) => P.xy(residSpec(res, o), T, W, H)],
        csv: () => [['Parameter'].concat(res.fits.map(f => f.s.name), res.fits.map(f => f.s.name + ' SE'))].concat(m.params.map((p, j) => [p].concat(res.fits.map(f => (f.r.error ? '' : f.r.fit.p[j])), res.fits.map(f => (f.r.error ? '' : f.r.fit.se[j])))))
      };
    },
    text(res, o) {
      const ok = res.fits.filter(f => !f.r.error); if (!ok.length) return null;
      const m = res.model;
      const reps = ok[0].s.reps;
      const methods = `Data (${ok.map(f => f.s.means.length + ' X values').join(', ')}${reps > 1 ? ', ' + reps + ' replicates' : ''}) were fitted by nonlinear least squares (Levenberg–Marquardt) to the ${m.name.toLowerCase()} model, ${esc(m.eq)}${o.weight !== 'none' ? `, weighted by ${o.weight === '1/y2' ? '1/Y²' : '1/Y'}` : ''}. Parameter uncertainties are asymptotic standard errors with 95% confidence intervals from the t distribution; derived quantities were propagated by the delta method. Analyses were performed with Lattent (${BF_CONFIG.site}).`;
      const results = ok.map(f => `For ${esc(f.s.name)}, ${m.params.map((p, j) => `${esc(p)} = ${fmt(f.r.fit.p[j], 4)}${f.r.fit.fixed[j] ? ' (fixed)' : ` (95% CI ${fmt(f.r.fit.ci[j][0], 3)} to ${fmt(f.r.fit.ci[j][1], 3)})`}`).join(', ')}${f.r.derived.length ? '; ' + f.r.derived.map(d => `${esc(d.name)} = ${fmt(d.value, 4)} ± ${fmt(d.se, 2)}`).join(', ') : ''} (R² = ${f.r.fit.r2.toFixed(4)}).`).join(' ');
      return [{ title: 'Methods', html: `<p>${methods}</p>` }, { title: 'Results', html: `<p>${results}</p>` }];
    }
  };
  function shapeLine(ranked) {
    const top = ranked.filter((r, i) => i < 3 && r.p >= 0.03);
    return `<div class="shape"><span class="shape-k">Shape model</span>${top.map(r => `<span class="shape-c"><b>${esc(r.label)}</b> ${(100 * r.p).toFixed(0)}%<i style="width:${Math.max(2, 100 * r.p).toFixed(0)}%"></i></span>`).join('')}<span class="shape-why">${esc(top[0].why)}</span></div>`;
  }
  function logOK(d, axis) { return d.series.every(s => s.pts.every(p => p[axis] > 0)); }
  function fitSpec(res, o, band) {
    const d = res.d;
    const logx = o.logx && logOK(d, 'x'), logy = o.logy && logOK(d, 'y');
    const tx = v => (logx ? Math.log10(v) : v), ty = v => (logy ? Math.log10(v) : v);
    const allx = [].concat(...d.series.map(s => s.xs));
    const x0 = Math.min(...allx), x1 = Math.max(...allx);
    const grid = Array.from({ length: 200 }, (_, k) => (logx ? Math.pow(10, Math.log10(x0) + (Math.log10(x1) - Math.log10(x0)) * k / 199) : x0 + (x1 - x0) * k / 199));
    const series = (res.fits || d.series.map(s => ({ s }))).map((f, i) => {
      const s = f.s;
      const pts = s.reps > 1 ? s.means.map(q => ({ x: tx(q.x), y: ty(q.y), err: logy ? 0 : q.sd })) : s.pts.map(p => ({ x: tx(p.x), y: ty(p.y) }));
      const out = { name: s.name, ci: i, points: pts };
      if (f.r && !f.r.error) {
        const fr = f.r.fit;
        out.curve = grid.map(x => [tx(x), ty(fr.f(x, fr.p))]).filter(q => isFinite(q[1]));
        if (band && fr.cov && !logy) out.band = S.band(fr, grid.filter((_, k) => k % 5 === 0)).map(b => [tx(b[0]), b[1], b[2]]);
      }
      return out;
    });
    return { x: { label: d.xlabel, log: logx }, y: { label: d.ylabel, log: logy }, series, legend: series.length > 1 };
  }
  function residSpec(res, o) {
    const logx = o.logx && logOK(res.d, 'x');
    return {
      x: { label: res.d.xlabel, log: logx }, y: { label: 'Residual' },
      series: res.fits.filter(f => !f.r.error).map((f, i) => ({ name: f.s.name, ci: i, points: f.s.xs.map((x, k) => ({ x: logx ? Math.log10(x) : x, y: f.r.residuals[k] })) })),
      hguides: [{ y: 0 }]
    };
  }
  /* log-y support in P.xy: values are already log10; label ticks as plain numbers of the log */

  K.autofit = {
    label: 'Find the best model (auto-fit)', types: ['xy'], group: 'Fit a model',
    desc: 'Fits every applicable equation in a field, ranks them by AICc and tells you how strongly the data favour each.',
    defaults: () => ({ field: BF.ml && BF.ml.ready() ? 'shape' : 'all', series: 0 }),
    form(o, t) {
      const d = xyData(t);
      return `<div class="fg two"><div><label>Search equations from</label>${sel('field', (BF.ml && BF.ml.ready() ? [['shape', 'Models matching the data shape (AI)']] : []).concat([['all', 'All fields']], M.fields.map(f => [f, f])), o.field)}</div>
        <div><label>Data set</label>${sel('series', d.series.map((s, i) => [i, s.name]), o.series)}</div></div>
        <div class="fg"><label class="check"><input type="checkbox" data-o="logx"${o.logx ? ' checked' : ''}> log X axis</label></div>`;
    },
    run(t, o) {
      const d = xyData(t);
      const s = d.series[+o.series || 0] || d.series[0];
      if (!s) return { error: 'No numeric data.' };
      let shape = null, only = null, fields = null;
      if (o.field === 'shape' && BF.ml && BF.ml.ready()) { shape = BF.ml.classify(s.xs, s.ys); if (shape) only = BF.ml.candidates(shape, 0.97); }
      else if (o.field !== 'all' && o.field !== 'shape') fields = [o.field, 'General'];
      let list = M.autofit(s.xs, s.ys, { fields, only });
      if (only && !list.length) list = M.autofit(s.xs, s.ys, {});
      return { d, s, list, shape };
    },
    render(res, o) {
      if (!res.list.length) return { html: notes(['No model could be fitted. Check the data.']) };
      const top = res.list.slice(0, 12);
      const rows = top.map((r, i) => `<tr${i ? '' : ' class="best"'}><td>${i + 1}</td><td class="l"><b>${esc(r.model.name)}</b>${r.equivalent ? `<br><small>same curve as: ${esc(r.equivalent.join(', '))}</small>` : ''}<br><small class="eqn">${esc(r.model.eq)}</small></td><td class="l"><small>${esc(r.model.field)}</small></td><td>${r.fit.r2.toFixed(4)}</td><td>${r.dAICc.toFixed(2)}</td><td><div class="wbar"><i style="width:${(100 * r.weight).toFixed(1)}%"></i></div>${(100 * r.weight).toFixed(1)}%</td><td><button class="btn small ghost" data-use="${r.model.id}">Use</button></td></tr>`).join('');
      const b = res.list[0];
      const verdict = b.weight > 0.9 ? `The data clearly favour the <b>${esc(b.model.name)}</b> model.` : b.weight > 0.6 ? `The <b>${esc(b.model.name)}</b> model is preferred, but alternatives are not ruled out.` : `Several models describe the data almost equally well. Choose on physical grounds, or collect data where the models differ.`;
      return {
        html: `${res.shape ? shapeLine(res.shape) : ''}<div class="verdict">${verdict}</div>${chartBox(0, 'Top three models')}
          <div class="tbl-wrap"><table class="t rt"><tr><th>#</th><th class="l">Model</th><th class="l">Field</th><th>R²</th><th>ΔAICc</th><th>Akaike weight</th><th></th></tr>${rows}</table></div>
          <p class="hint">ΔAICc &lt; 2: comparable support. ΔAICc &gt; 10: essentially no support. Akaike weights are the probability that each model is the best of those tested, given the data.</p>`,
        charts: [(T, W, H) => {
          const logx = o.logx && res.s.xs.every(x => x > 0);
          const tx = v => (logx ? Math.log10(v) : v);
          const x0 = Math.min(...res.s.xs), x1 = Math.max(...res.s.xs);
          const grid = Array.from({ length: 200 }, (_, k) => (logx ? Math.pow(10, Math.log10(x0) + (Math.log10(x1) - Math.log10(x0)) * k / 199) : x0 + (x1 - x0) * k / 199));
          const series = [{ name: res.s.name, ci: 0, points: (res.s.reps > 1 ? res.s.means.map(q => ({ x: tx(q.x), y: q.y, err: q.sd })) : res.s.pts.map(p => ({ x: tx(p.x), y: p.y }))) }];
          res.list.slice(0, 3).forEach((r, i) => series.push({ name: r.model.name, ci: i + 1, points: [], curve: grid.map(x => [tx(x), r.fit.f(x, r.fit.p)]), dash: i > 0 }));
          return P.xy({ x: { label: res.d.xlabel, log: logx }, y: { label: res.d.ylabel }, series, legend: true }, T, W, H);
        }],
        wire(el, it) { $$('[data-use]', el).forEach(bn => bn.onclick = () => addItem(it.tableId, 'nlfit', { model: bn.dataset.use, weight: 'none', fixed: {}, logx: o.logx })); },
        csv: () => [['Model', 'Field', 'R2', 'AICc', 'dAICc', 'Akaike weight']].concat(res.list.map(r => [r.model.name, r.model.field, r.fit.r2, r.fit.aicc, r.dAICc, r.weight]))
      };
    },
    text(res) {
      if (!res.list || !res.list.length) return null;
      const b = res.list[0];
      return [{ title: 'Methods', html: `<p>${res.list.length} candidate models were fitted to ${esc(res.s.name)} by nonlinear least squares and compared with the corrected Akaike information criterion (AICc); Akaike weights give the relative support for each model. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The ${esc(b.model.name.toLowerCase())} model was preferred (Akaike weight ${(100 * b.weight).toFixed(0)}%, R² = ${b.fit.r2.toFixed(4)})${res.list[1] ? `, ahead of the ${esc(res.list[1].model.name.toLowerCase())} model (ΔAICc = ${res.list[1].dAICc.toFixed(1)})` : ''}.</p>` }];
    }
  };

  K.linreg = {
    label: 'Linear regression and correlation', types: ['xy'], group: 'Fit a model',
    desc: 'Slope, intercept and X-intercept with confidence intervals, r and R², and a test of whether the slopes differ between data sets.',
    defaults: () => ({}),
    form: () => '<p class="hint">Fits a straight line to each data set. With two or more data sets, also tests whether one common slope fits all of them.</p>',
    run(t) {
      const d = xyData(t);
      const line = (x, p) => p[0] + p[1] * x;
      const fits = d.series.map(s => {
        const f = S.lm(line, s.xs, s.ys, [S.mean(s.ys), 0]);
        const pr = A.pearson(s.xs, s.ys);
        const xint = f ? -f.p[0] / f.p[1] : NaN;
        return { s, f, pr, xint, xintSE: f ? S.deltaSE(p => -p[0] / p[1], f) : NaN, pSlope: f ? 2 * (1 - S.tcdf(Math.abs(f.p[1] / f.se[1]), f.dof)) : NaN };
      });
      let cmp = null;
      if (fits.length >= 2 && fits.every(f => f.f)) {
        const xs = [], ys = [];
        fits.forEach((f, k) => f.s.xs.forEach((x, i) => { xs.push({ k, x }); ys.push(f.s.ys[i]); }));
        const n = fits.length;
        const g = S.lm((o, p) => p[o.k] + p[n] * o.x, xs, ys, fits.map(f => f.f.p[0]).concat([S.mean(fits.map(f => f.f.p[1]))]));
        const ssSep = fits.reduce((a, f) => a + f.f.ssr, 0), dfSep = fits.reduce((a, f) => a + f.f.dof, 0);
        const F = ((g.ssr - ssSep) / (g.dof - dfSep)) / (ssSep / dfSep);
        cmp = { F, df1: g.dof - dfSep, df2: dfSep, p: S.fsf(F, g.dof - dfSep, dfSep), common: g.p[n] };
      }
      return { d, fits, cmp };
    },
    render(res) {
      const rows = res.fits.map((f, i) => f.f ? `<tr><td><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${esc(f.s.name)}</td><td>${fmt(f.f.p[1])}<small> ± ${fmt(f.f.se[1], 3)}</small></td><td>${fmt(f.f.ci[1][0], 4)} to ${fmt(f.f.ci[1][1], 4)}</td><td>${fmt(f.f.p[0])}<small> ± ${fmt(f.f.se[0], 3)}</small></td><td>${fmt(f.xint)}</td><td>${f.f.r2.toFixed(4)}</td><td>${f.pr.r.toFixed(4)}</td><td>${U.pfmt(f.pSlope)}</td><td>${f.f.n}</td></tr>` : '').join('');
      return {
        html: `${chartBox(0, 'Linear fits')}<div class="tbl-wrap"><table class="t rt"><tr><th>Data set</th><th>Slope</th><th>95% CI of slope</th><th>Intercept</th><th>X-intercept</th><th>R²</th><th>r</th><th>p (slope ≠ 0)</th><th>n</th></tr>${rows}</table></div>
          ${res.cmp ? `<div class="verdict">Are the slopes equal? F(${res.cmp.df1}, ${res.cmp.df2}) = ${res.cmp.F.toFixed(2)}, ${pEq(res.cmp.p)}: ${res.cmp.p < 0.05 ? 'the slopes differ significantly.' : `no evidence that they differ (common slope ${fmt(res.cmp.common)}).`}</div>` : ''}`,
        charts: [(T, W, H) => P.xy(fitSpec({ d: res.d, fits: res.fits.map(f => ({ s: f.s, r: f.f ? { fit: f.f } : { error: 'x' } })) }, {}, true), T, W, H)],
        csv: () => [['Data set', 'Slope', 'SE', 'Intercept', 'SE', 'X-intercept', 'R2', 'r', 'p']].concat(res.fits.filter(f => f.f).map(f => [f.s.name, f.f.p[1], f.f.se[1], f.f.p[0], f.f.se[0], f.xint, f.f.r2, f.pr.r, f.pSlope]))
      };
    },
    text(res) {
      const ok = res.fits.filter(f => f.f); if (!ok.length) return null;
      return [{ title: 'Methods', html: `<p>Straight lines were fitted by ordinary least squares; 95% confidence intervals use the t distribution.${res.cmp ? ' Slopes were compared with an extra-sum-of-squares F test against a model with one common slope.' : ''} Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>${ok.map(f => `${esc(f.s.name)}: slope ${fmt(f.f.p[1])} (95% CI ${fmt(f.f.ci[1][0], 3)} to ${fmt(f.f.ci[1][1], 3)}), R² = ${f.f.r2.toFixed(3)}`).join('; ')}.${res.cmp ? ` The slopes ${res.cmp.p < 0.05 ? 'differed' : 'did not differ'} significantly (F(${res.cmp.df1}, ${res.cmp.df2}) = ${res.cmp.F.toFixed(2)}, ${pEq(res.cmp.p)}).` : ''}</p>` }];
    }
  };

  K.peaks = {
    label: 'Peak analysis (spectra, XRD, chromatograms)', types: ['xy'], group: 'Spectra and materials',
    desc: 'Baseline removal, peak detection and simultaneous Gaussian, Lorentzian or pseudo-Voigt fitting. For XRD: d-spacing, Scherrer size and Williamson–Hall strain.',
    defaults: () => ({ baseline: '1', prominence: 5, shape: 'pv', smooth: 3, xrd: false, lambda: '1.5406', K: 0.9, inst: 0 }),
    form: o => `<div class="fg two"><div><label>Baseline</label>${sel('baseline', [['none', 'None'], ['0', 'Constant'], ['1', 'Linear'], ['2', 'Quadratic'], ['3', 'Cubic']], o.baseline)}</div>
      <div><label>Peak shape</label>${sel('shape', [['gauss', 'Gaussian'], ['lorentz', 'Lorentzian'], ['pv', 'Pseudo-Voigt']], o.shape)}</div></div>
      <div class="fg two"><div><label>Minimum prominence (% of max)</label><input type="number" data-o="prominence" value="${esc(o.prominence)}" min="0.5" max="80" step="0.5"></div>
      <div><label>Smoothing half-window (points)</label><input type="number" data-o="smooth" value="${esc(o.smooth)}" min="0" max="25"></div></div>
      <div class="fg"><label class="check"><input type="checkbox" data-o="xrd"${o.xrd ? ' checked' : ''}> X is 2θ (XRD): report d-spacing and crystallite size</label></div>
      <div class="fg three" ${o.xrd ? '' : 'hidden'}><div><label>Wavelength (Å)</label>${sel('lambda', [['1.5406', 'Cu Kα 1.5406'], ['1.7890', 'Co Kα 1.7890'], ['0.7107', 'Mo Kα 0.7107'], ['1.9373', 'Fe Kα 1.9373']], o.lambda)}</div>
      <div><label>Scherrer K</label><input type="number" data-o="K" value="${esc(o.K)}" step="0.01"></div><div><label>Instrument FWHM (°)</label><input type="number" data-o="inst" value="${esc(o.inst)}" step="0.01" min="0"></div></div>`,
    run(t, o) {
      const d = xyData(t);
      const s = d.series[0]; if (!s) return { error: 'No numeric data.' };
      const x = s.means.map(q => q.x), y = s.means.map(q => q.y);
      const base = o.baseline === 'none' ? x.map(() => 0) : A.baseline(x, y, +o.baseline);
      const yc = y.map((v, i) => v - base[i]);
      const found = A.findPeaks(x, yc, { prominence: (+o.prominence || 5) / 100, smooth: +o.smooth || 0 }).slice(0, 25);
      const pf = A.fitPeaks(x, yc, found, o.shape);
      if (pf.error) return { error: pf.error };
      const xr = o.xrd ? A.xrd(pf.peaks, +o.lambda, +o.K || 0.9, +o.inst || 0) : null;
      return { d, s, x, y, base, yc, pf, xr };
    },
    render(res, o) {
      const maxA = Math.max(...res.pf.peaks.map(p => p.height));
      const rows = (res.xr ? res.xr.rows : res.pf.peaks).map((p, i) => `<tr><td>${i + 1}</td><td>${fmt(p.center, 5)}<small> ± ${fmt(p.centerSE, 2)}</small></td><td>${fmt(p.height)}</td><td>${(100 * p.height / maxA).toFixed(1)}</td><td>${fmt(p.fwhm)}</td><td>${fmt(p.area)}</td>${o.shape === 'pv' ? `<td>${p.eta.toFixed(2)}</td>` : ''}${res.xr ? `<td>${fmt(p.d, 5)}</td><td>${fmt(p.size, 3)}</td>` : ''}</tr>`).join('');
      const wh = res.xr && res.xr.wh;
      return {
        html: `${chartBox(0, 'Fitted spectrum')}
          ${res.xr ? `<div class="kpis"><div class="kpi"><div class="k">Mean Scherrer size</div><div class="v">${fmt(res.xr.meanSize, 3)} <small>nm</small></div></div>${wh ? `<div class="kpi"><div class="k">Williamson–Hall size</div><div class="v">${isFinite(wh.size) ? fmt(wh.size, 3) + ' <small>nm</small>' : '–'}</div><div class="ci">R² ${wh.r2.toFixed(3)}</div></div><div class="kpi"><div class="k">Microstrain ε</div><div class="v">${fmt(wh.strain * 100, 3)} <small>%</small></div></div>` : ''}</div>` : ''}
          <div class="tbl-wrap"><table class="t rt"><tr><th>#</th><th>Centre</th><th>Height</th><th>Rel. int. %</th><th>FWHM</th><th>Area</th>${o.shape === 'pv' ? '<th>η (Lorentz fraction)</th>' : ''}${res.xr ? '<th>d (Å)</th><th>Size (nm)</th>' : ''}</tr>${rows}</table></div>
          <p class="hint">Fit R² = ${res.pf.r2.toFixed(4)} across ${res.pf.peaks.length} peaks.${res.xr ? ' Crystallite size D = Kλ/(β cos θ) with β the instrument-corrected FWHM in radians; it is a lower bound because strain also broadens peaks.' : ''}</p>
          ${res.xr ? '<div class="ds-cta"><div><b>Which phase is this?</b><span>Match these peaks against every computed crystal structure of your elements in the Alexandria database (5.8 million structures).</span></div><button class="btn small primary" data-identify>Identify phases</button></div>' : ''}
          ${wh ? chartBox(1, 'Williamson–Hall plot', true) : ''}`,
        wire: (out, it) => { const b = out.querySelector('[data-identify]'); if (b) b.onclick = () => BF.discover.open('phase', { source: 'item:' + it.id }); },
        charts: [(T, W, H) => P.xy({
          x: { label: res.d.xlabel }, y: { label: res.d.ylabel }, legend: true,
          series: [
            { name: 'Data', ci: 0, asLine: true, width: 1.2, points: res.x.map((x, i) => ({ x, y: res.y[i] })) },
            { name: 'Baseline', ci: 3, asLine: true, dash: true, points: res.x.map((x, i) => ({ x, y: res.base[i] })) },
            { name: 'Fit', ci: 1, asLine: true, width: 1.8, points: res.x.map((x, i) => ({ x, y: res.base[i] + res.pf.f(x, res.pf.fit.p) })) }
          ],
          vguides: res.pf.peaks.map(p => ({ x: p.center, ci: 1 }))
        }, T, W, H), wh ? (T, W, H) => P.xy({ x: { label: '4 sin θ' }, y: { label: 'β cos θ (rad)' }, series: [{ name: 'Peaks', ci: 0, points: wh.xs.map((x, i) => ({ x, y: wh.ys[i] })), curve: [[Math.min(...wh.xs) * 0.95, wh.fit.p[0] + wh.fit.p[1] * Math.min(...wh.xs) * 0.95], [Math.max(...wh.xs) * 1.05, wh.fit.p[0] + wh.fit.p[1] * Math.max(...wh.xs) * 1.05]] }] }, T, W, H) : null],
        csv: () => [['Centre', 'Centre SE', 'Height', 'FWHM', 'Area', 'eta'].concat(res.xr ? ['d (A)', 'Size (nm)'] : [])].concat((res.xr ? res.xr.rows : res.pf.peaks).map(p => [p.center, p.centerSE, p.height, p.fwhm, p.area, p.eta].concat(res.xr ? [p.d, p.size] : [])))
      };
    },
    text(res, o) {
      const shape = { gauss: 'Gaussian', lorentz: 'Lorentzian', pv: 'pseudo-Voigt' }[o.shape];
      let m = `${o.baseline !== 'none' ? `A ${['constant', 'linear', 'quadratic', 'cubic'][+o.baseline]} baseline was removed by iterative polynomial fitting. ` : ''}Peaks were located on the Savitzky–Golay-smoothed signal and fitted simultaneously with ${shape} profiles by nonlinear least squares.`;
      if (res.xr) m += ` Crystallite sizes were estimated with the Scherrer equation (K = ${o.K}, λ = ${o.lambda} Å${+o.inst ? `, instrumental broadening of ${o.inst}° removed in quadrature` : ''})${res.xr.wh ? ' and with a Williamson–Hall analysis' : ''}.`;
      m += ` Analyses were performed with Lattent (${BF_CONFIG.site}).`;
      let r = `${res.pf.peaks.length} peaks were resolved (R² = ${res.pf.r2.toFixed(3)}), at ${res.pf.peaks.map(p => fmt(p.center, 4)).join(', ')}.`;
      if (res.xr) r += ` The mean Scherrer crystallite size was ${fmt(res.xr.meanSize, 3)} nm${res.xr.wh && isFinite(res.xr.wh.size) ? `; the Williamson–Hall analysis gave ${fmt(res.xr.wh.size, 3)} nm with a microstrain of ${fmt(res.xr.wh.strain * 100, 2)}%` : ''}.`;
      return [{ title: 'Methods', html: `<p>${m}</p>` }, { title: 'Results', html: `<p>${r}</p>` }];
    }
  };

  K.tauc = {
    label: 'Optical band gap (Tauc plot)', types: ['xy'], group: 'Spectra and materials',
    desc: 'From a UV–Vis absorbance spectrum (wavelength or photon energy) to the band gap, with the linear region found automatically.',
    defaults: () => ({ transition: 'direct', emin: '', emax: '' }),
    form: o => `<div class="fg"><label>Transition</label>${sel('transition', [['direct', 'Direct allowed, (αhν)²'], ['indirect', 'Indirect allowed, (αhν)^½'], ['direct-forbidden', 'Direct forbidden, (αhν)^⅔'], ['indirect-forbidden', 'Indirect forbidden, (αhν)^⅓']], o.transition)}</div>
      <div class="fg two"><div><label>Linear region from (eV)</label><input type="number" data-o="emin" value="${esc(o.emin)}" step="any" placeholder="auto"></div><div><label>to (eV)</label><input type="number" data-o="emax" value="${esc(o.emax)}" step="any" placeholder="auto"></div></div>`,
    run(t, o) {
      const d = xyData(t); const s = d.series[0]; if (!s) return { error: 'No numeric data.' };
      const r = A.tauc(s.means.map(q => q.x), s.means.map(q => q.y), { transition: o.transition, range: o.emin !== '' && o.emax !== '' ? [+o.emin, +o.emax] : null });
      return r.error ? r : { d, r };
    },
    render(res, o, t) {
      const r = res.r;
      const guess = BF.discover.guessFormula(t && t.name);
      const lab = { direct: '(αhν)²', indirect: '(αhν)^½', 'direct-forbidden': '(αhν)^⅔', 'indirect-forbidden': '(αhν)^⅓' }[o.transition];
      return {
        html: `<div class="kpis"><div class="kpi"><div class="k">Band gap E<sub>g</sub></div><div class="v">${r.Eg.toFixed(3)} <small>eV</small></div><div class="ci">95% CI ${r.ci[0].toFixed(3)} to ${r.ci[1].toFixed(3)}</div></div>
          <div class="kpi"><div class="k">Absorption edge</div><div class="v">${(1239.84 / r.Eg).toFixed(0)} <small>nm</small></div></div>
          <div class="kpi"><div class="k">Linear region</div><div class="v">${r.region[0].toFixed(2)}–${r.region[1].toFixed(2)} <small>eV</small></div><div class="ci">R² ${r.r2.toFixed(4)}</div></div></div>
          ${chartBox(0, 'Tauc plot')}<p class="hint">${r.isNm ? 'X was read as wavelength in nm and converted with E = 1239.84/λ. ' : ''}Absorbance is used as a proxy for α, which shifts the plot vertically but not the intercept. Set the region manually to override the automatic choice.</p>
          <div class="ds-cta"><div><b>Compare with computed band gaps</b><span>Look up ${guess ? esc(guess) : 'your material'} in the Alexandria DFT database. DFT (PBE) gaps are typically 30–50% below measured ones.</span></div><button class="btn small primary" data-dft>Look up DFT gaps</button></div>`,
        wire: out => { const b = out.querySelector('[data-dft]'); if (b) b.onclick = () => BF.discover.open('search', guess ? { q: guess, mode: 'formula', hull: 'any', res: null, autorun: true } : {}); },
        charts: [(T, W, H) => {
          const e0 = r.Eg - 0.05, e1 = r.region[1] + 0.15;
          return P.xy({ x: { label: 'Photon energy hν (eV)' }, y: { label: lab + ' (a.u.)', zero: true }, legend: true,
            series: [{ name: 'Tauc transform', ci: 0, asLine: true, points: r.pts.map(p => ({ x: p.e, y: p.t })) },
              { name: 'Linear extrapolation', ci: 1, points: [], curve: [[e0, r.fit.p[0] + r.fit.p[1] * e0], [e1, r.fit.p[0] + r.fit.p[1] * e1]] }],
            vguides: [{ x: r.Eg, ci: 1, label: 'E_g = ' + r.Eg.toFixed(2) + ' eV' }] }, T, W, H);
        }],
        csv: () => [['Eg (eV)', 'CI low', 'CI high', 'Region from', 'Region to', 'R2'], [r.Eg, r.ci[0], r.ci[1], r.region[0], r.region[1], r.r2]]
      };
    },
    text(res, o) {
      const r = res.r;
      return [{ title: 'Methods', html: `<p>Optical band gaps were determined from Tauc plots of (αhν)<sup>${{ direct: 2, indirect: '1/2', 'direct-forbidden': '2/3', 'indirect-forbidden': '1/3' }[o.transition]}</sup> against photon energy, by linear extrapolation of the absorption edge (${r.region[0].toFixed(2)}–${r.region[1].toFixed(2)} eV) to zero. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The ${o.transition.replace('-', ' ')} optical band gap was ${r.Eg.toFixed(2)} eV (95% CI ${r.ci[0].toFixed(2)}–${r.ci[1].toFixed(2)} eV), corresponding to an absorption edge near ${(1239.84 / r.Eg).toFixed(0)} nm.</p>` }];
    }
  };

  K.tensile = {
    label: 'Tensile test (stress–strain)', types: ['xy'], group: 'Spectra and materials',
    desc: "Young's modulus, 0.2% offset yield strength, ultimate tensile strength, elongation at break and toughness.",
    defaults: () => ({ offset: 0.2 }),
    form: o => `<div class="fg"><label>Offset for yield (% strain)</label><input type="number" data-o="offset" value="${esc(o.offset)}" step="0.05" min="0"></div><p class="hint">X: strain (% or fraction, detected automatically). Y: stress.</p>`,
    run(t, o) {
      const d = xyData(t); const s = d.series[0]; if (!s) return { error: 'No numeric data.' };
      const pts = s.pts.slice().sort((a, b) => a.x - b.x);
      return { d, r: A.tensile(pts.map(p => p.x), pts.map(p => p.y), { offset: (+o.offset || 0.2) / 100 }), pts };
    },
    render(res, o) {
      const r = res.r, unit = (res.d.ylabel.match(/\(([^)]+)\)/) || [])[1] || '';
      const sx = v => (r.pct ? v * 100 : v);
      const kp = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="ci">${sub}</div>` : ''}</div>`;
      return {
        html: `<div class="kpis">${kp("Young's modulus E", fmt(r.E, 4) + ` <small>${esc(unit)}</small>`, unit === 'MPa' ? fmt(r.E / 1000, 3) + ' GPa' : '± ' + fmt(r.Ese, 2))}${kp('Yield strength (' + o.offset + '% offset)', fmt(r.yieldS, 4) + ` <small>${esc(unit)}</small>`)}${kp('Ultimate tensile strength', fmt(r.uts, 4) + ` <small>${esc(unit)}</small>`, 'at ' + fmt(sx(r.eUTS), 3) + (r.pct ? '% strain' : ''))}${kp('Elongation at break', fmt(sx(r.elong), 3) + (r.pct ? ' <small>%</small>' : ''))}${kp('Toughness', fmt(r.toughness, 4) + (unit === 'MPa' ? ' <small>MJ/m³</small>' : ''))}</div>
          ${chartBox(0, 'Stress–strain curve')}<p class="hint">Modulus from the steepest straight segment of the initial loading (${fmt(sx(r.region[0]), 3)}–${fmt(sx(r.region[1]), 3)}${r.pct ? '%' : ''} strain). The offset line runs parallel to it.</p>`,
        charts: [(T, W, H) => {
          const e2 = Math.min(isFinite(r.yieldE) ? r.yieldE * 1.4 : r.elong, r.elong);
          return P.xy({ x: { label: res.d.xlabel }, y: { label: res.d.ylabel, zero: true }, legend: true,
            series: [{ name: 'Test', ci: 0, asLine: true, width: 1.8, points: res.pts.map(p => ({ x: p.x, y: p.y })) },
              { name: 'Modulus', ci: 1, points: [], curve: [[sx(r.toe), 0], [sx(r.toe + r.uts / r.E), r.uts]], dash: true },
              { name: 'Offset line', ci: 3, points: [], curve: [[sx(r.toe + (+o.offset || 0.2) / 100), 0], [sx(e2), r.E * (e2 - r.toe - (+o.offset || 0.2) / 100)]], dash: true },
              { name: 'Yield and UTS', ci: 1, points: [isFinite(r.yieldS) ? { x: sx(r.yieldE), y: r.yieldS } : null, { x: sx(r.eUTS), y: r.uts }].filter(Boolean) }] }, T, W, H);
        }],
        csv: () => [['E', 'Yield', 'UTS', 'Strain at UTS', 'Elongation', 'Toughness'], [r.E, r.yieldS, r.uts, sx(r.eUTS), sx(r.elong), r.toughness]]
      };
    },
    text(res, o) {
      const r = res.r, unit = (res.d.ylabel.match(/\(([^)]+)\)/) || [])[1] || '';
      return [{ title: 'Methods', html: `<p>Young's modulus was obtained by linear regression over the steepest linear segment of the initial loading curve; the yield strength was determined by the ${o.offset}% offset method, and toughness by trapezoidal integration of the stress–strain curve to failure. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The specimen showed a modulus of ${fmt(r.E, 3)} ${unit}, a yield strength of ${fmt(r.yieldS, 3)} ${unit}, an ultimate tensile strength of ${fmt(r.uts, 3)} ${unit} and an elongation at break of ${fmt(r.pct ? r.elong * 100 : r.elong, 3)}${r.pct ? '%' : ''}.</p>` }];
    }
  };

  K.auc = {
    label: 'Area under the curve', types: ['xy'], group: 'Spectra and materials',
    desc: 'Trapezoidal integration above zero or above a straight baseline: peak areas, DSC enthalpies, cumulative release.',
    defaults: () => ({ base: '0' }),
    form: o => `<div class="fg"><label>Baseline</label>${sel('base', [['0', 'Y = 0'], ['line', 'Straight line from first to last point']], o.base)}</div>`,
    run(t, o) { const d = xyData(t); return { d, list: d.series.map(s => ({ s, r: A.auc(s.means.map(q => q.x), s.means.map(q => q.y), o.base) })) }; },
    render(res, o) {
      return {
        html: `${chartBox(0, 'Integrated area')}<div class="tbl-wrap"><table class="t rt"><tr><th>Data set</th><th>Total area</th><th>Positive</th><th>Negative</th><th>Peak X</th><th>Peak Y</th></tr>${res.list.map((l, i) => `<tr><td><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${esc(l.s.name)}</td><td><b>${fmt(l.r.total)}</b></td><td>${fmt(l.r.positive)}</td><td>${fmt(l.r.negative)}</td><td>${fmt(l.r.peakX)}</td><td>${fmt(l.r.peakY)}</td></tr>`).join('')}</table></div>`,
        charts: [(T, W, H) => P.xy({ x: { label: res.d.xlabel }, y: { label: res.d.ylabel }, legend: res.list.length > 1, series: res.list.map((l, i) => {
          const m = l.s.means, b0 = m[0].y, b1 = m[m.length - 1].y, x0 = m[0].x, x1 = m[m.length - 1].x;
          const b = x => (o.base === 'line' ? b0 + (b1 - b0) * (x - x0) / ((x1 - x0) || 1) : 0);
          return { name: l.s.name, ci: i, asLine: m.length > 40, points: m.map(q => ({ x: q.x, y: q.y })), band: m.map(q => [q.x, Math.min(b(q.x), q.y), Math.max(b(q.x), q.y)]) };
        }) }, T, W, H)],
        csv: () => [['Data set', 'Total', 'Positive', 'Negative', 'Peak X', 'Peak Y']].concat(res.list.map(l => [l.s.name, l.r.total, l.r.positive, l.r.negative, l.r.peakX, l.r.peakY]))
      };
    },
    text: res => [{ title: 'Methods', html: `<p>Areas under the curve were computed by the trapezoidal rule. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` }, { title: 'Results', html: `<p>${res.list.map(l => `${esc(l.s.name)}: ${fmt(l.r.total)}`).join('; ')}.</p>` }]
  };

  K.smooth = {
    label: 'Smooth and differentiate', types: ['xy'], group: 'Spectra and materials',
    desc: 'Savitzky–Golay smoothing or first derivative (e.g. DTG from TGA, inflection points), with a copy to a new table.',
    defaults: () => ({ half: 5, order: 2, deriv: '0' }),
    form: o => `<div class="fg three"><div><label>Half-window (points)</label><input type="number" data-o="half" value="${esc(o.half)}" min="1" max="50"></div><div><label>Polynomial order</label>${sel('order', [[2, '2'], [3, '3'], [4, '4']], o.order)}</div><div><label>Output</label>${sel('deriv', [['0', 'Smoothed'], ['1', 'First derivative']], o.deriv)}</div></div>`,
    run(t, o) {
      const d = xyData(t); const s = d.series[0]; if (!s) return { error: 'No numeric data.' };
      const x = s.means.map(q => q.x), y = s.means.map(q => q.y);
      const dx = (x[x.length - 1] - x[0]) / (x.length - 1);
      const out = A.smooth(y, +o.half || 5, +o.order || 2, +o.deriv, dx);
      return { d, s, x, y, out };
    },
    render(res, o) {
      const der = o.deriv === '1';
      let ext = '';
      if (der) { let i = 0; res.out.forEach((v, k) => { if (Math.abs(v) > Math.abs(res.out[i])) i = k; }); ext = `<div class="verdict">Largest rate of change at X = ${fmt(res.x[i])} (dY/dX = ${fmt(res.out[i])}).</div>`; }
      return {
        html: `${ext}${chartBox(0, der ? 'First derivative' : 'Smoothed')}<button class="btn small" data-copyout>Copy result to a new table</button>`,
        charts: [(T, W, H) => P.xy({ x: { label: res.d.xlabel }, y: { label: der ? 'dY/dX' : res.d.ylabel }, legend: !der, series: der ? [{ name: 'Derivative', ci: 1, asLine: true, width: 1.8, points: res.x.map((x, i) => ({ x, y: res.out[i] })) }] : [{ name: 'Data', ci: 3, asLine: true, points: res.x.map((x, i) => ({ x, y: res.y[i] })) }, { name: 'Smoothed', ci: 0, asLine: true, width: 2, points: res.x.map((x, i) => ({ x, y: res.out[i] })) }] }, T, W, H)],
        wire(el, it) {
          $('[data-copyout]', el).onclick = () => {
            const t = table(it.tableId);
            const nt = blankTable('xy', t.name + (der ? ' (derivative)' : ' (smoothed)'));
            nt.cols = [t.cols[0], der ? 'dY/dX' : (t.cols[1] || 'Y')]; nt.rows = res.x.map((x, i) => [String(x), String(Number(res.out[i].toPrecision(7)))]);
            proj.tables.push(nt); save(); select('table', nt.id); U.toast('New table created.');
          };
        },
        csv: () => [['X', der ? 'dY/dX' : 'Smoothed']].concat(res.x.map((x, i) => [x, res.out[i]]))
      };
    },
    text: (res, o) => [{ title: 'Methods', html: `<p>Data were ${o.deriv === '1' ? 'differentiated' : 'smoothed'} with a Savitzky–Golay filter (window ${2 * o.half + 1} points, polynomial order ${o.order}). Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` }]
  };

  /* ---------- Column ---------- */
  const errSel = o => `<div><label>Error bars</label>${sel('err', [['sd', 'Mean ± SD'], ['sem', 'Mean ± SEM'], ['ci', 'Mean ± 95% CI']], o.err)}</div>`;
  K.describe = {
    label: 'Descriptive statistics and normality', types: ['col'], group: 'Statistics',
    desc: 'Mean, SD, SEM, 95% CI, median, quartiles and CV, with a normality test and Grubbs outlier check for each group.',
    defaults: () => ({ err: 'sd' }),
    form: o => `<div class="fg two">${errSel(o)}<div><label>Graph style</label>${sel('style', [['dot', 'Scatter dot plot'], ['bar', 'Bar with points']], o.style)}</div></div>`,
    run(t) { const g = colData(t); return { g, ds: g.map(x => ({ name: x.name, d: A.describe(x.v), n: A.normality(x.v), gr: A.grubbs(x.v) })), ylabel: t.ylabel || 'Value' }; },
    render(res, o) {
      const rows = [['n', d => d.n], ['Mean', d => fmt(d.mean)], ['SD', d => fmt(d.sd)], ['SEM', d => fmt(d.sem)], ['95% CI of mean', d => fmt(d.ci[0]) + ' to ' + fmt(d.ci[1])], ['Median', d => fmt(d.median)], ['25th–75th percentile', d => fmt(d.q1) + ' to ' + fmt(d.q3)], ['Min to max', d => fmt(d.min) + ' to ' + fmt(d.max)], ['CV', d => d.cv.toFixed(1) + '%'], ['Geometric mean', d => fmt(d.geomean)]];
      const body = rows.map(([k, f]) => `<tr><td>${k}</td>${res.ds.map(x => `<td>${f(x.d)}</td>`).join('')}</tr>`).join('')
        + `<tr class="gof first"><td>Normality (D'Agostino–Pearson)</td>${res.ds.map(x => `<td>${x.n.error ? '<small>n &lt; 8</small>' : `${pEq(x.n.p)} ${x.n.p < 0.05 ? '<span class="flag">not normal</span>' : ''}`}</td>`).join('')}</tr>`
        + `<tr class="gof"><td>Grubbs outlier (α = 0.05)</td>${res.ds.map(x => `<td>${x.gr ? (x.gr.outlier ? `<span class="flag bad">${fmt(x.gr.value)}</span>` : 'none') : '–'}</td>`).join('')}</tr>`;
      return {
        html: `${chartBox(0, 'Groups')}<div class="tbl-wrap"><table class="t rt"><tr><th></th>${res.ds.map((x, i) => `<th><span class="sw" style="background:var(--s${i % 5 + 1})"></span>${esc(x.name)}</th>`).join('')}</tr>${body}</table></div>`,
        charts: [(T, W, H) => P.col({ groups: res.g, y: { label: res.ylabel }, err: o.err, style: o.style }, T, W, H)],
        csv: () => [['Statistic'].concat(res.ds.map(x => x.name))].concat(rows.map(([k, f]) => [k].concat(res.ds.map(x => f(x.d)))))
      };
    },
    text: res => [{ title: 'Results', html: `<p>${res.ds.map(x => `${esc(x.name)}: ${fmt(x.d.mean)} ± ${fmt(x.d.sd, 3)} (mean ± SD, n = ${x.d.n})`).join('; ')}.</p>` }]
  };

  K.ttest = {
    label: 't test or Mann–Whitney (two groups)', types: ['col'], group: 'Statistics',
    desc: "Compare two groups: Welch's or Student's unpaired t test, paired t test, or the non-parametric Mann–Whitney test.",
    defaults: t => ({ a: 0, b: 1, test: 'welch', err: 'sd' }),
    form(o, t) {
      const g = colData(t).map((x, i) => [i, x.name]);
      return `<div class="fg two"><div><label>Group 1</label>${sel('a', g, o.a)}</div><div><label>Group 2</label>${sel('b', g, o.b)}</div></div>
        <div class="fg two"><div><label>Test</label>${sel('test', [['welch', "Welch's t test (unequal SD)"], ['student', "Student's t test (equal SD)"], ['paired', 'Paired t test'], ['mw', 'Mann–Whitney (non-parametric)']], o.test)}</div>${errSel(o)}</div>`;
    },
    run(t, o) {
      const g = colData(t); const a = g[+o.a], b = g[+o.b];
      if (!a || !b || a === b) return { error: 'Choose two different groups.' };
      const r = o.test === 'mw' ? A.mannWhitney(a.v, b.v) : A.ttest(a.v, b.v, { paired: o.test === 'paired', welch: o.test !== 'student' });
      return r.error ? r : { a, b, r, ylabel: t.ylabel || 'Value' };
    },
    render(res, o) {
      const r = res.r, mw = o.test === 'mw';
      const name = { welch: "Welch's unpaired t test", student: "Student's unpaired t test", paired: 'Paired t test', mw: 'Mann–Whitney test' }[o.test];
      const rows = mw ? [['U', fmt(r.U)], ['Medians', fmt(r.medA) + ' vs ' + fmt(r.medB)], ['P value', U.pfmt(r.p) + (r.exact ? ' (exact)' : ' (normal approximation)')]]
        : [['t, df', r.t.toFixed(3) + ', ' + fmt(r.df, 4)], ['Difference (1 − 2)', fmt(r.diff)], ['95% CI of difference', fmt(r.lo) + ' to ' + fmt(r.hi)], ['Effect size (Cohen’s d)', fmt(r.d != null ? r.d : r.dz, 3)], ['P value (two-tailed)', U.pfmt(r.p)]];
      return {
        html: `<div class="verdict">${name}: <b>${pEq(r.p)}</b>, ${r.p < 0.05 ? 'the groups differ significantly' : 'no significant difference'} (α = 0.05).</div>${chartBox(0, 'Comparison')}
          <div class="tbl-wrap"><table class="t rt">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></div>`,
        charts: [(T, W, H) => P.col({ groups: [res.a, res.b], y: { label: res.ylabel }, err: o.err, brackets: [{ i: 0, j: 1, text: U.stars(r.p) + ' (' + pEq(r.p) + ')' }] }, T, W, H)],
        csv: () => [['Test', 'Statistic', 'p']].concat([[name, mw ? r.U : r.t, r.p]])
      };
    },
    text(res, o) {
      const r = res.r;
      const name = { welch: "Welch's unpaired t test", student: "Student's unpaired t test", paired: 'a paired t test', mw: 'the two-sided Mann–Whitney U test' }[o.test];
      return [{ title: 'Methods', html: `<p>${esc(res.a.name)} and ${esc(res.b.name)} were compared with ${name} (two-tailed, α = 0.05). Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>${o.test === 'mw' ? `Medians were ${fmt(r.medA)} and ${fmt(r.medB)} (U = ${fmt(r.U)}, ${pEq(r.p)}).` : `The mean difference was ${fmt(r.diff)} (95% CI ${fmt(r.lo)} to ${fmt(r.hi)}; t(${fmt(r.df, 3)}) = ${r.t.toFixed(2)}, ${pEq(r.p)}).`}</p>` }];
    }
  };

  K.anova = {
    label: 'One-way ANOVA with post tests', types: ['col'], group: 'Statistics',
    desc: 'Ordinary or Welch ANOVA, or Kruskal–Wallis; Tukey, Holm–Šidák or comparisons with a control; assumption checks and stars on the graph.',
    defaults: () => ({ post: 'tukey', control: 0, err: 'sd', test: 'ordinary' }),
    form(o, t) {
      const g = colData(t).map((x, i) => [i, x.name]);
      return `<div class="fg two"><div><label>Test</label>${sel('test', [['ordinary', 'Ordinary one-way ANOVA'], ['welch', "Welch's ANOVA (unequal SD)"], ['kw', 'Kruskal–Wallis (non-parametric)']], o.test)}</div>
        <div><label>Post tests</label>${sel('post', [['tukey', 'Tukey: all pairs'], ['holm', 'Holm–Šidák: all pairs'], ['control', 'Holm–Šidák: each vs control']], o.post)}</div></div>
        <div class="fg two"><div ${o.post === 'control' ? '' : 'hidden'}><label>Control group</label>${sel('control', g, o.control)}</div>${errSel(o)}</div>`;
    },
    run(t, o) {
      const g = colData(t);
      const r = A.anova(g, { control: o.post === 'control' ? +o.control : null });
      return r.error ? r : { g, r, ylabel: t.ylabel || 'Value' };
    },
    render(res, o) {
      const r = res.r;
      const main = o.test === 'welch' ? { stat: `F(${r.welch.df1}, ${fmt(r.welch.df2, 4)}) = ${r.welch.F.toFixed(3)}`, p: r.welch.p, name: "Welch's ANOVA" }
        : o.test === 'kw' ? { stat: `H(${r.kw.df}) = ${r.kw.H.toFixed(3)}`, p: r.kw.p, name: 'Kruskal–Wallis test' } : { stat: `F(${r.dfb}, ${r.dfw}) = ${r.F.toFixed(3)}`, p: r.p, name: 'One-way ANOVA' };
      const pk = o.post === 'tukey' ? 'pTukey' : 'pHolm';
      const prs = r.pairs.map(p => `<tr><td class="l">${esc(p.a)} vs ${esc(p.b)}</td><td>${fmt(p.diff)}</td><td>${o.post === 'tukey' ? fmt(p.lo) + ' to ' + fmt(p.hi) : '–'}</td><td>${U.pfmt(p[pk])}</td><td>${U.stars(p[pk])}</td></tr>`).join('');
      const brackets = r.pairs.filter(p => p[pk] < 0.05).sort((a, b) => (a.j - a.i) - (b.j - b.i)).map(p => ({ i: p.i, j: p.j, text: U.stars(p[pk]) }));
      const norm = r.groups.map(g => A.normality(res.g.find(x => x.name === g.name).v)).filter(n => !n.error);
      return {
        html: `<div class="verdict">${main.name}: <b>${main.stat}, ${pEq(main.p)}</b>. ${main.p < 0.05 ? 'At least one group mean differs.' : 'No evidence that the group means differ.'}${o.test === 'ordinary' ? ` η² = ${r.eta2.toFixed(3)}.` : ''}</div>
          ${chartBox(0, 'Groups with significance')}
          <div class="tbl-wrap"><table class="t rt"><tr><th class="l">Comparison</th><th>Mean difference</th><th>95% CI (Tukey)</th><th>Adjusted p</th><th></th></tr>${prs}</table></div>
          <h4 class="sub">Assumptions</h4>
          <ul class="checks"><li class="${r.bf.p < 0.05 ? 'bad' : 'ok'}">Equal spread (Brown–Forsythe): ${pEq(r.bf.p)}${r.bf.p < 0.05 ? ". The SDs differ, so prefer Welch's ANOVA." : ''}</li>
          <li class="${norm.some(n => n.p < 0.05) ? 'bad' : 'ok'}">${norm.length ? `Normality of each group: ${norm.some(n => n.p < 0.05) ? 'at least one group departs from normality; consider Kruskal–Wallis.' : 'no group departs significantly.'}` : 'Groups are too small (n < 8) to test normality; with small n, look at the dot plot.'}</li></ul>`,
        charts: [(T, W, H) => P.col({ groups: res.g, y: { label: res.ylabel }, err: o.err, brackets }, T, W, H)],
        csv: () => [['Comparison', 'Mean difference', 'CI low', 'CI high', 'Adjusted p']].concat(r.pairs.map(p => [p.a + ' vs ' + p.b, p.diff, p.lo, p.hi, p[pk]]))
      };
    },
    text(res, o) {
      const r = res.r;
      const name = { ordinary: 'one-way ANOVA', welch: "Welch's ANOVA", kw: 'the Kruskal–Wallis test' }[o.test];
      const post = { tukey: "Tukey's multiple-comparison test", holm: 'the Holm–Šidák multiple-comparison test', control: 'Holm–Šidák comparisons with the control group' }[o.post];
      const p = o.test === 'welch' ? r.welch.p : o.test === 'kw' ? r.kw.p : r.p;
      const pk = o.post === 'tukey' ? 'pTukey' : 'pHolm';
      const sig = r.pairs.filter(x => x[pk] < 0.05);
      return [{ title: 'Methods', html: `<p>Groups were compared by ${name} followed by ${post}; homogeneity of variance was assessed with the Brown–Forsythe test. Data are shown as ${o.err === 'sem' ? 'mean ± SEM' : o.err === 'ci' ? 'mean ± 95% CI' : 'mean ± SD'} with individual values. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>Group means ${p < 0.05 ? 'differed significantly' : 'did not differ significantly'} (${pEq(p)}).${sig.length ? ' Post tests showed significant differences for ' + sig.map(x => `${esc(x.a)} vs ${esc(x.b)} (${pEq(x[pk])})`).join(', ') + '.' : ''}</p>` },
        { title: 'Figure legend', html: `<p>Individual values with ${o.err === 'sem' ? 'mean ± SEM' : o.err === 'ci' ? 'mean ± 95% CI' : 'mean ± SD'}. * p < 0.05, ** p < 0.01, *** p < 0.001 (${post}).</p>` }];
    }
  };

  /* ---------- Multiple variables ---------- */
  K.corr = {
    label: 'Correlation matrix', types: ['mv'], group: 'Multivariate and machine learning',
    desc: 'Pearson or Spearman correlation between every pair of variables, as a heatmap with p-values.',
    defaults: () => ({ method: 'pearson' }),
    form: (o, t) => `<div class="fg"><label>Method</label>${sel('method', [['pearson', 'Pearson (linear)'], ['spearman', 'Spearman (rank, monotonic)']], o.method)}</div><div class="fg"><label>Variables</label><div class="checkcols">${colChecks(t, 'vars', o.vars)}</div></div>`,
    run(t, o) {
      const idx = o.vars && o.vars.length ? o.vars : mvData(t).numeric.map(c => c.j);
      if (idx.length < 2) return { error: 'Choose at least two numeric variables.' };
      const mx = mvMatrix(t, idx); if (mx.rows.length < 4) return { error: 'Needs at least four complete rows.' };
      const col = j => mx.rows.map(r => r[j]);
      const m = idx.map((_, i) => idx.map((_, j) => (i === j ? { r: 1, p: 0 } : o.method === 'spearman' ? (q => ({ r: q.rho, p: q.p }))(A.spearman(col(i), col(j))) : A.pearson(col(i), col(j)))));
      return { names: mx.names, m, n: mx.rows.length };
    },
    render(res, o) {
      const strong = [];
      res.m.forEach((row, i) => row.forEach((c, j) => { if (j > i && Math.abs(c.r) >= 0.7 && c.p < 0.05) strong.push(`${res.names[i]} and ${res.names[j]} (${o.method === 'spearman' ? 'ρ' : 'r'} = ${c.r.toFixed(2)})`); }));
      return {
        html: `${strong.length ? `<div class="verdict">Strong correlations: ${esc(strong.join('; '))}.</div>` : ''}${chartBox(0, 'Correlation heatmap')}
          <div class="tbl-wrap"><table class="t rt"><tr><th></th>${res.names.map(n => `<th>${esc(n)}</th>`).join('')}</tr>${res.m.map((row, i) => `<tr><td>${esc(res.names[i])}</td>${row.map((c, j) => `<td>${i === j ? '–' : c.r.toFixed(3) + `<br><small>${pEq(c.p)}</small>`}</td>`).join('')}</tr>`).join('')}</table></div>`,
        charts: [(T, W) => P.heat({ names: res.names, m: res.m.map(r => r.map(c => c.r)) }, T, W)],
        heat: true,
        csv: () => [[''].concat(res.names)].concat(res.m.map((r, i) => [res.names[i]].concat(r.map(c => c.r))))
      };
    },
    text: (res, o) => [{ title: 'Methods', html: `<p>${o.method === 'spearman' ? 'Spearman rank' : 'Pearson'} correlation coefficients were computed between all pairs of variables (n = ${res.n}). Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` }]
  };

  K.mlr = {
    label: 'Multiple linear regression', types: ['mv'], group: 'Multivariate and machine learning',
    desc: 'Predict one variable from several: coefficients with CIs and p-values, standardised effects, R² and a parity plot.',
    defaults: t => { const n = mvData(t).numeric; return { y: n.length ? n[n.length - 1].j : 0, xs: n.slice(0, -1).map(c => c.j) }; },
    form: (o, t) => `<div class="fg"><label>Predict (Y)</label><select data-o="y">${colOptions(t, o.y)}</select></div><div class="fg"><label>From (X)</label><div class="checkcols">${colChecks(t, 'xs', o.xs)}</div></div>`,
    run(t, o) {
      const xs = (o.xs || []).map(Number).filter(j => j !== +o.y);
      if (!xs.length) return { error: 'Choose at least one predictor.' };
      const mx = mvMatrix(t, xs.concat([+o.y]));
      const r = A.ols(mx.rows.map(r => r.slice(0, -1)), mx.rows.map(r => r[r.length - 1]), mx.names.slice(0, -1));
      return r.error ? r : { r, names: mx.names, y: mx.rows.map(r => r[r.length - 1]), labels: mx.labels };
    },
    render(res) {
      const r = res.r, yn = res.names[res.names.length - 1];
      return {
        html: `<div class="kpis"><div class="kpi"><div class="k">R²</div><div class="v">${r.r2.toFixed(4)}</div><div class="ci">adjusted ${r.adj.toFixed(4)}</div></div><div class="kpi"><div class="k">Model F test</div><div class="v">${pEq(r.pF)}</div><div class="ci">F = ${r.F.toFixed(2)}, df = ${r.df}</div></div><div class="kpi"><div class="k">Residual SD</div><div class="v">${fmt(r.s)}</div></div></div>
          <div class="tbl-wrap"><table class="t rt"><tr><th class="l">Term</th><th>Coefficient</th><th>95% CI</th><th>Standardised β</th><th>p</th><th></th></tr>${r.coefs.map(c => `<tr><td class="l">${esc(c.name)}</td><td>${fmt(c.b)}<small> ± ${fmt(c.se, 3)}</small></td><td>${fmt(c.lo)} to ${fmt(c.hi)}</td><td>${c.beta != null ? c.beta.toFixed(3) : ''}</td><td>${U.pfmt(c.p)}</td><td>${U.stars(c.p)}</td></tr>`).join('')}</table></div>
          <div class="grid2">${chartBox(0, 'Observed vs predicted')}${chartBox(1, 'Standardised effects')}</div>`,
        charts: [(T, W, H) => { const lo = Math.min(...res.y, ...r.fit), hi = Math.max(...res.y, ...r.fit); return P.xy({ x: { label: 'Predicted ' + yn, zero: false }, y: { label: 'Observed ' + yn }, series: [{ name: 'Samples', ci: 0, points: r.fit.map((p, i) => ({ x: p, y: res.y[i] })), curve: [[lo, lo], [hi, hi]] }] }, T, W, H); },
          (T, W, H) => P.bars({ items: r.coefs.slice(1).map(c => ({ name: c.name, v: c.beta, ci: c.beta >= 0 ? 0 : 1 })), x: { label: 'Standardised coefficient β' } }, T, W, H)],
        csv: () => [['Term', 'Coefficient', 'SE', 'CI low', 'CI high', 'p']].concat(r.coefs.map(c => [c.name, c.b, c.se, c.lo, c.hi, c.p]))
      };
    },
    text: res => [{ title: 'Methods', html: `<p>${esc(res.names[res.names.length - 1])} was modelled by multiple linear regression on ${res.names.slice(0, -1).map(esc).join(', ')} (ordinary least squares, n = ${res.r.n}). Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
      { title: 'Results', html: `<p>The model explained ${(100 * res.r.r2).toFixed(1)}% of the variance (adjusted R² = ${res.r.adj.toFixed(3)}, F test ${pEq(res.r.pF)}). ${res.r.coefs.slice(1).filter(c => c.p < 0.05).map(c => `${esc(c.name)} had a significant effect (β = ${c.beta.toFixed(2)}, ${pEq(c.p)})`).join('; ')}.</p>` }]
  };

  K.pca = {
    label: 'Principal component analysis', types: ['mv'], group: 'Multivariate and machine learning',
    desc: 'Reduce many correlated variables to a few components: scree plot, loadings and a scores map of your samples.',
    defaults: () => ({}),
    form: (o, t) => `<div class="fg"><label>Variables</label><div class="checkcols">${colChecks(t, 'vars', o.vars)}</div></div>`,
    run(t, o) {
      const idx = o.vars && o.vars.length ? o.vars.map(Number) : mvData(t).numeric.map(c => c.j);
      if (idx.length < 2) return { error: 'Choose at least two variables.' };
      const mx = mvMatrix(t, idx);
      const r = A.pca(mx.rows, mx.names);
      return r.error ? r : { r, mx };
    },
    render(res) {
      const r = res.r, k = Math.min(r.values.length, 4);
      return {
        html: `<div class="verdict">PC1 and PC2 explain ${(100 * (r.explained[0] + (r.explained[1] || 0))).toFixed(1)}% of the variance. ${r.kaiser} component${r.kaiser === 1 ? ' has' : 's have'} an eigenvalue above 1 (Kaiser criterion).</div>
          <div class="grid2">${chartBox(0, 'Scores (samples)')}${chartBox(1, 'Explained variance')}</div>
          <div class="tbl-wrap"><table class="t rt"><tr><th class="l">Loadings</th>${Array.from({ length: k }, (_, i) => `<th>PC${i + 1} (${(100 * r.explained[i]).toFixed(1)}%)</th>`).join('')}</tr>${r.names.map((n, j) => `<tr><td class="l">${esc(n)}</td>${Array.from({ length: k }, (_, i) => `<td${Math.abs(r.loadings[i][j]) > 0.7 ? ' class="strong"' : ''}>${r.loadings[i][j].toFixed(3)}</td>`).join('')}</tr>`).join('')}</table></div>
          <p class="hint">Loadings are correlations between each variable and the component; |loading| > 0.7 is highlighted. Variables were standardised first.</p>`,
        charts: [(T, W, H) => P.xy({ x: { label: `PC1 (${(100 * r.explained[0]).toFixed(1)}%)`, zero: false }, y: { label: `PC2 (${(100 * (r.explained[1] || 0)).toFixed(1)}%)` }, series: [{ name: 'Samples', ci: 0, points: r.scores.map((s, i) => ({ x: s[0], y: s[1] || 0, label: res.mx.labels[i] })) }], hguides: [{ y: 0 }] }, T, W, H),
          (T, W, H) => P.bars({ items: r.explained.map((e, i) => ({ name: 'PC' + (i + 1), v: 100 * e, ci: i < 2 ? 0 : 3 })), x: { label: 'Variance explained (%)' } }, T, W, H)],
        labels: res.mx.labels,
        csv: () => [['Variable'].concat(r.values.map((_, i) => 'PC' + (i + 1)))].concat(r.names.map((n, j) => [n].concat(r.loadings.map(l => l[j]))))
      };
    },
    text: res => [{ title: 'Methods', html: `<p>Principal component analysis was performed on the standardised variables (${res.r.names.map(esc).join(', ')}; n = ${res.mx.rows.length}). Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
      { title: 'Results', html: `<p>The first two components explained ${(100 * res.r.explained[0]).toFixed(1)}% and ${(100 * (res.r.explained[1] || 0)).toFixed(1)}% of the variance.</p>` }]
  };

  K.kmeans = {
    label: 'Clustering (k-means)', types: ['mv'], group: 'Multivariate and machine learning',
    desc: 'Group samples into families on standardised variables; the number of clusters can be chosen by the silhouette score.',
    defaults: () => ({ k: 'auto' }),
    form: (o, t) => `<div class="fg"><label>Number of clusters</label>${sel('k', [['auto', 'Choose automatically (silhouette)']].concat([2, 3, 4, 5, 6, 7, 8].map(k => [k, k])), o.k)}</div><div class="fg"><label>Variables</label><div class="checkcols">${colChecks(t, 'vars', o.vars)}</div></div>`,
    run(t, o) {
      const idx = o.vars && o.vars.length ? o.vars.map(Number) : mvData(t).numeric.map(c => c.j);
      const mx = mvMatrix(t, idx);
      if (mx.rows.length < 6) return { error: 'Needs at least six complete rows.' };
      let tries = [];
      if (o.k === 'auto') for (let k = 2; k <= Math.min(7, mx.rows.length - 1); k++) tries.push(A.kmeans(mx.rows, k, 3));
      else tries = [A.kmeans(mx.rows, +o.k, 3)];
      const best = tries.reduce((a, b) => (b.silhouette > a.silhouette ? b : a));
      const pc = A.pca(mx.rows, mx.names);
      return { mx, best, tries, pc };
    },
    render(res) {
      const b = res.best, k = b.centres.length;
      return {
        html: `<div class="verdict">${k} clusters (silhouette ${b.silhouette.toFixed(2)}${b.silhouette > 0.5 ? ', well separated' : b.silhouette > 0.25 ? ', moderate structure' : ', weak structure'}).</div>
          ${chartBox(0, 'Clusters on the first two principal components')}
          <div class="tbl-wrap"><table class="t rt"><tr><th class="l">Cluster</th><th>Size</th>${res.mx.names.map(n => `<th>${esc(n)}</th>`).join('')}</tr>${b.centres.map((c, i) => `<tr><td class="l"><span class="sw" style="background:var(--s${i % 5 + 1})"></span>Cluster ${i + 1}</td><td>${b.sizes[i]}</td>${c.map(v => `<td>${fmt(v)}</td>`).join('')}</tr>`).join('')}</table></div>
          <div class="tbl-wrap" style="margin-top:12px"><table class="t rt"><tr><th class="l">Sample</th><th>Cluster</th></tr>${res.mx.labels.map((l, i) => `<tr><td class="l">${esc(l)}</td><td>${b.labels[i] + 1}</td></tr>`).join('')}</table></div>
          ${res.tries.length > 1 ? `<p class="hint">Silhouette by k: ${res.tries.map(t => `${t.centres.length}: ${t.silhouette.toFixed(2)}`).join(' · ')}</p>` : ''}`,
        charts: [(T, W, H) => P.xy({ x: { label: 'PC1', zero: false }, y: { label: 'PC2' }, legend: true, series: Array.from({ length: k }, (_, c) => ({ name: 'Cluster ' + (c + 1), ci: c, points: res.pc.scores.map((s, i) => ({ x: s[0], y: s[1], label: res.mx.labels[i], c: b.labels[i] })).filter(p => p.c === c) })) }, T, W, H)],
        csv: () => [['Sample', 'Cluster']].concat(res.mx.labels.map((l, i) => [l, b.labels[i] + 1]))
      };
    },
    text: res => [{ title: 'Methods', html: `<p>Samples were clustered by k-means (k-means++ initialisation, 12 restarts) on standardised variables; ${res.tries.length > 1 ? 'the number of clusters was chosen by the mean silhouette width' : 'k was set by the user'}. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` }]
  };

  K.bo = {
    label: 'Model and optimise (Bayesian optimisation)', types: ['mv'], group: 'Multivariate and machine learning',
    desc: 'Learn a Gaussian-process model of a property from your experiments, see which inputs matter, and get the next experiments most likely to improve it.',
    defaults: t => { const n = mvData(t).numeric; return { target: n.length ? n[n.length - 1].j : 0, inputs: n.slice(0, -1).map(c => c.j), goal: 'max', batch: 5, expand: 0, compo: false, compoCols: [], total: 100 }; },
    form: (o, t) => `<div class="fg two"><div><label>Property to optimise</label><select data-o="target">${colOptions(t, o.target)}</select></div><div><label>Goal</label>${sel('goal', [['max', 'Maximise'], ['min', 'Minimise']], o.goal)}</div></div>
      <div class="fg"><label>Inputs you control</label><div class="checkcols">${colChecks(t, 'inputs', o.inputs)}</div></div>
      <div class="fg two"><div><label>Experiments to suggest</label><input type="number" data-o="batch" value="${esc(o.batch)}" min="1" max="12"></div><div><label>Explore beyond tested range (%)</label><input type="number" data-o="expand" value="${esc(o.expand)}" min="0" max="50"></div></div>
      <div class="fg"><label class="check"><input type="checkbox" data-o="compo"${o.compo ? ' checked' : ''}> Some inputs are fractions of a mixture that must sum to</label><input type="number" data-o="total" value="${esc(o.total)}" style="width:90px"></div>
      <div class="fg" ${o.compo ? '' : 'hidden'}><label>Mixture components</label><div class="checkcols">${colChecks(t, 'compoCols', o.compoCols && o.compoCols.length ? o.compoCols : [])}</div></div>`,
    run(t, o) {
      const ins = (o.inputs || []).map(Number).filter(j => j !== +o.target);
      if (!ins.length) return { error: 'Choose at least one input.' };
      const mx = mvMatrix(t, ins.concat([+o.target]));
      if (mx.rows.length < 5) return { error: 'Needs at least five complete experiments.' };
      const X = mx.rows.map(r => r.slice(0, -1)), y = mx.rows.map(r => r[r.length - 1]);
      const ex = (+o.expand || 0) / 100;
      const bounds = ins.map((_, j) => { const v = X.map(r => r[j]); const a = Math.min(...v), b = Math.max(...v), w = b - a; return [a - ex * w, b + ex * w]; });
      const compo = o.compo && o.compoCols && o.compoCols.length >= 2 ? { cols: o.compoCols.map(Number).map(c => ins.indexOf(c)).filter(i => i >= 0), total: +o.total || 100 } : null;
      const s = A.suggest(X, y, { goal: o.goal, batch: Math.max(1, Math.min(12, +o.batch || 5)), bounds, sumTo: compo });
      return { mx, X, y, ins, s, names: mx.names };
    },
    render(res, o) {
      const g = res.s.gp, yn = res.names[res.names.length - 1];
      const best = o.goal === 'min' ? Math.min(...res.y) : Math.max(...res.y);
      const q = g.q2;
      return {
        html: `<div class="kpis"><div class="kpi"><div class="k">Model accuracy (leave-one-out Q²)</div><div class="v">${q.toFixed(2)}</div><div class="ci">${q > 0.7 ? 'reliable' : q > 0.4 ? 'useful but noisy' : 'weak: add more data'}</div></div>
          <div class="kpi"><div class="k">Best so far</div><div class="v">${fmt(best)}</div><div class="ci">${esc(yn)}</div></div>
          <div class="kpi"><div class="k">Most promising suggestion</div><div class="v">${fmt(res.s.picks[0].mean)}</div><div class="ci">± ${fmt(res.s.picks[0].sd, 2)} predicted</div></div></div>
          <h4 class="sub">Suggested next experiments</h4>
          <div class="tbl-wrap"><table class="t rt"><tr><th>#</th>${res.names.slice(0, -1).map(n => `<th>${esc(n)}</th>`).join('')}<th>Predicted ${esc(yn)}</th><th>Expected improvement</th></tr>${res.s.picks.map((p, i) => `<tr><td>${i + 1}</td>${p.x.map(v => `<td>${fmt(v, 3)}</td>`).join('')}<td>${fmt(p.mean)} <small>± ${fmt(p.sd, 2)}</small></td><td>${fmt(p.ei, 3)}</td></tr>`).join('')}</table></div>
          <button class="btn small primary" data-addsug>Add these runs to the table</button>
          <div class="grid2">${chartBox(0, 'Model check (leave-one-out)')}${chartBox(1, 'Which inputs matter')}</div>
          <p class="hint">Gaussian process with an automatic-relevance kernel; inputs scaled to the search range, hyperparameters by maximum marginal likelihood. Suggestions maximise expected improvement, chosen one at a time with the kriging-believer strategy so the batch spreads out. Run them, enter the results, and the model updates.</p>`,
        charts: [(T, W, H) => { const lo = Math.min(...res.y, ...g.loo), hi = Math.max(...res.y, ...g.loo); return P.xy({ x: { label: 'Predicted ' + yn + ' (left out)', zero: false }, y: { label: 'Measured ' + yn }, series: [{ name: 'Experiments', ci: 0, points: g.loo.map((p, i) => ({ x: p, y: res.y[i] })), curve: [[lo, lo], [hi, hi]] }] }, T, W, H); },
          (T, W, H) => P.bars({ items: res.names.slice(0, -1).map((n, j) => ({ name: n, v: 100 * g.relevance[j], ci: 0 })).sort((a, b) => b.v - a.v), x: { label: 'Relative relevance (%)' } }, T, W, H)],
        wire(el, it) {
          $('[data-addsug]', el).onclick = () => {
            const t = table(it.tableId); const d = mvData(t);
            res.s.picks.forEach((p, i) => {
              const row = t.cols.map(() => '');
              if (d.label) row[d.label.j] = 'Suggested ' + (i + 1);
              res.ins.forEach((j, k) => { row[j] = String(Number(p.x[k].toPrecision(4))); });
              t.rows.push(row);
            });
            t.v = (t.v || 0) + 1; save(); U.toast(res.s.picks.length + ' suggested runs added. Fill in the measured values when you have them.', 'ok');
            select('table', t.id);
          };
        },
        csv: () => [res.names.slice(0, -1).concat(['Predicted', 'SD', 'EI'])].concat(res.s.picks.map(p => p.x.concat([p.mean, p.sd, p.ei])))
      };
    },
    text(res, o) {
      const g = res.s.gp, yn = res.names[res.names.length - 1];
      return [{ title: 'Methods', html: `<p>${esc(yn)} was modelled as a function of ${res.names.slice(0, -1).map(esc).join(', ')} with Gaussian-process regression (squared-exponential kernel with automatic relevance determination; hyperparameters by maximum marginal likelihood; n = ${res.y.length}). Predictive accuracy was assessed by leave-one-out cross-validation. New experiments were proposed by Bayesian optimisation, maximising expected improvement${o.compo ? ` subject to the mixture constraint (components sum to ${o.total})` : ''}. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The surrogate model reached a leave-one-out Q² of ${g.q2.toFixed(2)}. ${res.names.slice(0, -1).map((n, j) => [n, g.relevance[j]]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, v]) => `${esc(n)} (${(100 * v).toFixed(0)}%)`).join(' and ')} were the most influential inputs. The top suggested experiment is predicted to give ${fmt(res.s.picks[0].mean, 3)} ± ${fmt(res.s.picks[0].sd, 2)}.</p>` }];
    }
  };

  /* ---------- AI: equation discovery and AutoML ---------- */
  const aiTag = '<span class="ai-tag" title="Computed by Lattent’s own machine-learning code, in your browser">AI</span>';
  K.symreg = {
    label: 'Discover the equation (symbolic regression)', types: ['xy'], group: 'Fit a model',
    desc: 'Lattent searches thousands of candidate equations built from powers, logarithms, exponentials and saturation terms, and returns the simplest ones that explain your data, ranked by AICc.',
    defaults: () => ({ maxTerms: '3', logy: true, errors: 'auto' }),
    form: o => `<div class="fg three"><div><label>Terms per equation</label>${sel('maxTerms', [['1', 'Up to 1'], ['2', 'Up to 2'], ['3', 'Up to 3']], o.maxTerms)}</div>
      <div><label>Error scale</label>${sel('errors', [['auto', 'Automatic'], ['absolute', 'Absolute'], ['relative', 'Relative (data span decades)']], o.errors)}</div>
      <div><label>&nbsp;</label><label class="check" style="margin:8px 0 0"><input type="checkbox" data-o="logy"${o.logy !== false ? ' checked' : ''}> Also search equations for ln(y)</label></div></div>`,
    run(t, o) {
      const d = xyData(t); const s = d.series[0]; if (!s) return { error: 'No numeric data.' };
      const x = s.means.map(q => q.x), y = s.means.map(q => q.y);
      const r = BF.learn.symreg(x, y, { maxTerms: +o.maxTerms || 3, logy: o.logy !== false, errors: o.errors || 'auto' });
      return r.error ? r : { d, x, y, r };
    },
    render(res, o) {
      const r = res.r, b = r.best, rel = r.errors === 'relative';
      const top = r.results.slice(0, 8);
      const err = v => (rel ? (100 * v).toFixed(2) + '%' : fmt(v, 3));
      const xs0 = Math.min(...res.x), xs1 = Math.max(...res.x);
      const grid = Array.from({ length: 200 }, (_, i) => xs0 + (xs1 - xs0) * i / 199);
      const alts = top.filter(q => q !== b).slice(0, 2);
      return {
        html: `<div class="verdict">${aiTag} <b>Discovered:</b> <span class="eqn big">${esc(b.pretty)}</span><br><span class="sub-v">${esc(b.law)} · R² ${b.r2.toFixed(4)} · from ${r.tried.toLocaleString()} candidate equations. ${b.preferred ? `A generic equation fits slightly better (ΔAICc ${b.dAICc.toFixed(1)}); this recognised law is preferred because the data do not clearly reject it.` : 'It is also the best-supported equation by AICc.'}</span></div>
          ${chartBox(0, 'Data and discovered equation')}
          <div class="tbl-wrap"><table class="t rt"><tr><th>#</th><th class="l">Equation</th><th class="l">Recognised as</th><th>R²</th><th>${rel ? 'Relative error' : 'RMSE'}</th><th>ΔAICc</th><th></th></tr>
          ${top.map((q, i) => `<tr${q === b ? ' class="best"' : ''}><td>${i + 1}</td><td class="l eqn">${esc(q.pretty)}</td><td class="l">${esc(q.law)}</td><td>${q.r2.toFixed(4)}</td><td>${err(q.rmse)}</td><td>${q.dAICc.toFixed(1)}</td><td><button class="btn small ghost" data-full="${r.results.indexOf(q)}">Fit with statistics</button></td></tr>`).join('')}</table></div>
          ${chartBox(1, 'Accuracy against complexity (Pareto front)', true)}
          <p class="hint">Equation discovery searches combinations of up to ${+o.maxTerms || 3} terms from a library of ${r.library} (powers, 1/x, √x, logarithms, exponentials and saturation terms at several scales)${r.errors === 'relative' ? '; because your data span decades, errors are judged on a relative scale' : ''}. It finds a compact formula that fits, which is a hypothesis, not proof of mechanism: check that the form makes physical sense and do not extrapolate beyond the data. “Fit with statistics” opens the equation in nonlinear regression with standard errors and confidence bands.</p>`,
        charts: [(T, W, H) => P.xy({ x: { label: res.d.xlabel }, y: { label: res.d.ylabel }, legend: true, series: [
            { name: 'Data', ci: 0, points: res.x.map((x, i) => ({ x, y: res.y[i] })) },
            { name: b.pretty.replace(/^y = /, ''), ci: 1, points: [], curve: grid.map(x => [x, b.f(x)]) }
          ].concat(alts.map((q, k) => ({ name: q.law, ci: 3 + k, dash: true, points: [], curve: grid.map(x => [x, q.f(x)]) }))) }, T, W, H),
          (T, W, H) => P.xy({ x: { label: 'Complexity (terms and operations)', zero: false }, y: { label: rel ? 'Relative error' : 'RMSE', log: false }, legend: true, series: [
            { name: 'Candidates', ci: 3, points: r.results.map(q => ({ x: q.cx, y: q.rmse, label: q.pretty })) },
            { name: 'Pareto front', ci: 0, points: r.pareto.map(q => ({ x: q.cx, y: q.rmse, label: q.pretty })), curve: r.pareto.map(q => [q.cx, q.rmse]) },
            { name: 'Chosen', ci: 1, points: [{ x: b.cx, y: b.rmse, label: b.pretty }] }] }, T, W, H)],
        csv: () => [['Equation', 'Law', 'R2', 'RMSE', 'dAICc', 'Expression']].concat(r.results.map(q => [q.pretty, q.law, q.r2, q.rmse, q.dAICc, q.expr])),
        wire(el, it) { $$('[data-full]', el).forEach(btn => btn.onclick = () => { const q = r.results[+btn.dataset.full]; addItem(it.tableId, 'nlfit', { model: 'custom', expr: q.expr, start: q.start, weight: rel ? '1/y2' : 'none' }); }); }
      };
    },
    text(res) {
      const r = res.r, b = r.best;
      return [{ title: 'Methods', html: `<p>Candidate equations were generated by sparse symbolic regression: up to three terms from a library of ${r.library} functions of x (powers, reciprocals, square roots, logarithms, and exponential and saturation terms on grids of scale parameters) were combined linearly${r.results.some(q => q.logTarget) ? ', for y and for ln(y)' : ''}, and ${r.tried.toLocaleString()} candidates were ranked by AICc on ${r.errors} errors. The most promising structures were refined by Levenberg–Marquardt least squares. A recognised physical law was selected when within 14 AICc units of the best equation (correcting for the many generic forms searched), otherwise the simplest equation within 4 units. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The selected equation was ${esc(b.pretty)} (${esc(b.law.toLowerCase())}), with R² = ${b.r2.toFixed(4)}.</p>` }];
    }
  };

  /* A text column whose values are chemical formulas, for composition descriptors */
  function formulaCol(t) {
    const d = mvData(t);
    for (const c of d.cols.filter(c => !c.numeric)) {
      const vals = t.rows.map(r => String(r[c.j] || '').trim()).filter(Boolean);
      if (vals.length < 3) continue;
      const okv = vals.filter(v => { if (!/^[A-Z][A-Za-z0-9().·]*$/.test(v) || !/[a-z0-9]/.test(v)) return false; try { return Object.keys(BF.chem.parse(v)).length > 0; } catch (e) { return false; } });
      if (okv.length >= 0.8 * vals.length) return c.j;
    }
    return null;
  }
  const DESC = (() => { const P2 = [['Z', 'atomic number'], ['group', 'group'], ['period', 'period'], ['EN', 'electronegativity'], ['r', 'covalent radius'], ['valence', 'valence']]; const out = []; P2.forEach(([s2], k) => { out.push(['mean ' + s2, 94 + 5 * k], ['range ' + s2, 94 + 5 * k + 4]); }); out.push(['number of elements', 128]); return out; })();
  const TARGET_RE = /strength|toughness|yield|efficien|activity|capacity|conductiv|selectiv|modulus|hardness|response|output|target|score|band ?gap|tg\b|energy|density/i;
  K.automl = {
    label: 'AutoML: predict a property', types: ['mv'], group: 'Multivariate and machine learning', async: true,
    desc: 'Trains six kinds of model, from linear regression to random forests and Gaussian processes, picks the best by cross-validation, explains which inputs matter and predicts new samples with calibrated intervals.',
    defaults: t => { const n = mvData(t).numeric; const tg = n.find(c => TARGET_RE.test(c.name)) || n[n.length - 1]; return { target: tg ? tg.j : 0, inputs: n.filter(c => c !== tg).map(c => c.j), level: '0.9', compo: formulaCol(t) != null }; },
    form: (o, t) => { const fc = formulaCol(t); return `<div class="fg two"><div><label>Property to predict</label><select data-o="target">${colOptions(t, o.target)}</select></div><div><label>Prediction interval</label>${sel('level', [['0.8', '80%'], ['0.9', '90%'], ['0.95', '95%']], o.level)}</div></div>
      <div class="fg"><label>Inputs</label><div class="checkcols">${colChecks(t, 'inputs', o.inputs)}</div></div>
      ${fc != null ? `<div class="fg"><label class="check"><input type="checkbox" data-o="compo"${o.compo ? ' checked' : ''}> Add composition descriptors from “${esc(mvData(t).cols[fc].name)}” (electronegativity, radius, valence and more)</label></div>` : ''}
      <p class="hint" style="margin:0">Rows with inputs but no measured value are predicted.</p>`; },
    run(t, o) {
      const target = +o.target, ins = (o.inputs || []).map(Number).filter(j => j !== target);
      const fc = o.compo ? formulaCol(t) : null;
      if (!ins.length && fc == null) return { error: 'Choose at least one input.' };
      const d = mvData(t), names = ins.map(j => d.cols[j].name).concat(fc != null ? DESC.map(q => q[0]) : []);
      const X = [], y = [], Xnew = [], labels = [], newLabels = [], newRows = [];
      t.rows.forEach((r, i) => {
        const v = ins.map(j => num(r[j]));
        if (!v.every(isFinite)) return;
        if (fc != null) { let f; try { f = BF.chem.features(BF.chem.parse(String(r[fc]).trim())); } catch (e) { return; } DESC.forEach(q => v.push(f[q[1]])); }
        const lab = d.label ? String(r[d.label.j] || '') : 'Row ' + (i + 1);
        const tv = num(r[target]);
        if (isFinite(tv)) { X.push(v); y.push(tv); labels.push(lab); } else if (String(r[target] == null ? '' : r[target]).trim() === '') { Xnew.push(v); newLabels.push(lab); newRows.push(i); }
      });
      if (y.length < 8) return { error: 'AutoML needs at least 8 rows with the inputs and the measured property.' };
      return { async: { X, y, names, Xnew, opts: { level: +o.level || 0.9 } }, X, y, names, labels, Xnew, newLabels, newRows, yname: d.cols[target].name, target };
    },
    render(res, o) {
      const b = res.best, lv = Math.round(100 * res.level), yn = res.yname;
      const verdictQ = b.r2 > 0.8 ? 'a strong model' : b.r2 > 0.5 ? 'a useful but noisy model' : 'a weak model: more data or better inputs are needed';
      const imp = res.importance.filter(q => isFinite(q.v));
      const lo = Math.min(...res.y, ...b.oof), hi = Math.max(...res.y, ...b.oof);
      return {
        html: `<div class="verdict">${aiTag} <b>${esc(b.name)}</b> predicts ${esc(yn)} best: cross-validated R² ${b.r2.toFixed(2)}, ${verdictQ}. Most influential input: <b>${esc(imp[0] ? imp[0].name : '–')}</b>.</div>
          <div class="kpis"><div class="kpi"><div class="k">Cross-validated R²</div><div class="v">${b.r2.toFixed(3)}</div><div class="ci">${res.folds === res.n ? 'leave-one-out' : res.folds + '-fold'}, ${res.n} samples</div></div>
            <div class="kpi"><div class="k">Mean absolute error</div><div class="v">${fmt(b.mae, 3)}</div><div class="ci">${esc(yn)}</div></div>
            <div class="kpi"><div class="k">${lv}% prediction interval</div><div class="v">± ${fmt(res.q, 3)}</div><div class="ci">conformal, from held-out errors</div></div></div>
          <h4 class="sub">Model comparison</h4>
          <div class="tbl-wrap"><table class="t rt"><tr><th>#</th><th class="l">Model</th><th class="l">Cross-validated R²</th><th>MAE</th><th>RMSE</th><th>Time</th></tr>
          ${res.board.map((m, i) => `<tr${i === 0 ? ' class="best"' : ''}><td>${i + 1}</td><td class="l">${esc(m.name)}</td><td class="l"><span class="wbar"><i style="width:${Math.max(0, Math.min(100, 100 * m.r2)).toFixed(0)}%"></i></span>${m.r2.toFixed(3)}</td><td>${fmt(m.mae, 3)}</td><td>${fmt(m.rmse, 3)}</td><td>${m.ms < 1000 ? m.ms + ' ms' : (m.ms / 1000).toFixed(1) + ' s'}</td></tr>`).join('')}</table></div>
          <div class="grid2">${chartBox(0, 'Predicted against measured (held out)')}${chartBox(1, 'Which inputs matter')}</div>
          ${res.pdp.length ? `<div class="grid2">${res.pdp.map((q, k) => chartBox(2 + k, 'Effect of ' + q.name, true)).join('')}</div>` : ''}
          ${res.Xnew.length ? `<h4 class="sub">Predictions for ${res.Xnew.length} new sample${res.Xnew.length > 1 ? 's' : ''}</h4>
          <div class="tbl-wrap"><table class="t rt"><tr><th class="l">Sample</th><th>Predicted ${esc(yn)}</th><th>${lv}% interval</th><th class="l">Note</th></tr>${res.preds.map((p2, i) => `<tr><td class="l">${esc(res.newLabels[i])}</td><td><b>${fmt(p2.y, 4)}</b></td><td>${fmt(p2.lo, 3)} to ${fmt(p2.hi, 3)}</td><td class="l">${p2.extrapolating ? '<span class="flag bad">outside the training range</span>' : ''}</td></tr>`).join('')}</table></div>
          <button class="btn small primary" data-fill>Write predictions into the table</button>` : '<p class="hint">Add rows with the inputs but an empty ' + esc(yn) + ' cell, and AutoML will predict them.</p>'}
          ${res.dropped && res.dropped.length ? `<p class="hint">Left out because they do not vary or duplicate another input: ${res.dropped.map(esc).join(', ')}.</p>` : ''}
          <p class="hint">Every model is scored only on samples it did not see during training. Importance is the rise in held-out error when an input is shuffled, so it reflects what the best model actually uses. The interval is split-conformal: it covers about ${lv}% of new samples like these, and it is not valid far outside the training range.</p>`,
        charts: [(T, W, H) => P.xy({ x: { label: 'Predicted ' + yn + ' (held out)', zero: false }, y: { label: 'Measured ' + yn }, series: [{ name: 'Samples', ci: 0, points: b.oof.map((p2, i) => ({ x: p2, y: res.y[i], label: res.labels[i] })), curve: [[lo, lo], [hi, hi]] }] }, T, W, H),
          (T, W, H) => P.bars({ items: imp.slice(0, 12).map(q => ({ name: q.name, v: Math.max(0, q.v), ci: 0 })), x: { label: 'Increase in error when shuffled' } }, T, W, H),
          ].concat(res.pdp.map((q, k) => (T, W, H) => P.xy({ x: { label: q.name, zero: false }, y: { label: 'Predicted ' + yn, zero: false }, series: [{ name: q.name, ci: k + 1, points: [], curve: q.pts, hideLegend: true }] }, T, W, H))),
        csv: () => [['Model', 'CV R2', 'MAE', 'RMSE']].concat(res.board.map(m => [m.name, m.r2, m.mae, m.rmse])).concat([[], ['Sample', 'Predicted', 'Low', 'High']]).concat(res.preds.map((p2, i) => [res.newLabels[i], p2.y, p2.lo, p2.hi])),
        wire(el, it) {
          const f = $('[data-fill]', el); if (!f) return;
          f.onclick = () => {
            const t = table(it.tableId), nm = 'Predicted ' + yn;
            let j = t.cols.indexOf(nm); if (j < 0) { t.cols.push(nm); j = t.cols.length - 1; }
            res.newRows.forEach((ri, k) => { while (t.rows[ri].length <= j) t.rows[ri].push(''); t.rows[ri][j] = String(Number(res.preds[k].y.toPrecision(4))); });
            t.v = (t.v || 0) + 1; save(); U.toast('Predictions written to “' + nm + '”.', 'ok');
          };
        }
      };
    },
    text(res) {
      if (res.pending || !res.best) return null;
      const b = res.best, lv = Math.round(100 * res.level);
      return [{ title: 'Methods', html: `<p>${res.board.length} regression models (${res.board.map(m => m.name.toLowerCase()).join(', ')}) were trained to predict ${esc(res.yname)} from ${res.p} inputs and compared by ${res.folds === res.n ? 'leave-one-out' : res.folds + '-fold'} cross-validation on ${res.n} samples. Input importance was measured by permutation of each input on held-out folds, and ${lv}% prediction intervals were obtained by split-conformal calibration on held-out residuals. Analyses were performed with Lattent (${BF_CONFIG.site}).</p>` },
        { title: 'Results', html: `<p>The best model was ${esc(b.name.toLowerCase())} (cross-validated R² = ${b.r2.toFixed(2)}, MAE = ${fmt(b.mae, 3)}). The most influential inputs were ${res.importance.slice(0, 3).map(q => esc(q.name)).join(', ')}.</p>` }];
    }
  };

  const GROUPS = ['Fit a model', 'Spectra and materials', 'Statistics', 'Multivariate and machine learning'];

  /* ================= results cache and execution ================= */
  let lw = null, lwSeq = 0;
  const lwJobs = new Map();
  function learnJob(payload) {
    if (!lw) {
      lw = new Worker(U.root + 'assets/js/learn-worker.js');
      lw.onmessage = e => { const j = lwJobs.get(e.data.id); if (!j) return; lwJobs.delete(e.data.id); if (e.data.ok) j.resolve(e.data.result); else j.reject(new Error(e.data.error)); };
      lw.onerror = e => { lwJobs.forEach(j => j.reject(new Error(e.message || 'The learning worker failed.'))); lwJobs.clear(); lw = null; };
    }
    const id = ++lwSeq;
    return new Promise((resolve, reject) => { lwJobs.set(id, { resolve, reject }); lw.postMessage(Object.assign({ id }, payload)); });
  }
  function compute(it) {
    const t = table(it.tableId);
    const key = it.id + '|' + tableVersion(t) + '|' + JSON.stringify(it.opts);
    if (cache[it.id] && cache[it.id].key === key) return cache[it.id].res;
    let res;
    try { res = K[it.kind].run(t, it.opts); } catch (e) { console.error(e); res = { error: 'This analysis could not run on the current data: ' + (e.message || e) }; }
    if (res && res.async) {
      /* heavy analyses train in a worker; show progress and re-render when done */
      const job = res.async, base = res; delete base.async;
      const entry = { key, res: Object.assign({ pending: true }, base) };
      cache[it.id] = entry;
      const done = r => { if (cache[it.id] !== entry) return; entry.res = r && r.error ? { error: r.error } : Object.assign(base, r); if (cur && cur.type === 'item' && cur.id === it.id) runItem(it); };
      learnJob(job).then(done, e => done({ error: e.message }));
      return entry.res;
    }
    cache[it.id] = { key, res };
    return res;
  }

  /* ================= rendering helpers ================= */
  const chartBox = (i, title, small) => `<div class="cbox${small ? ' small' : ''}"><div class="cbar"><h4>${esc(title)}</h4><div class="exp"><button class="btn small ghost" data-x="${i}" data-f="png-free">PNG</button><button class="btn small ghost" data-x="${i}" data-f="svg">SVG <span class="lock">PRO</span></button><button class="btn small ghost" data-x="${i}" data-f="png">600 dpi <span class="lock">PRO</span></button></div></div><div class="chart-host" data-chart="${i}"></div></div>`;
  const notes = list => (list && list.length ? `<ul class="notes">${list.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '');

  function drawCharts(el, charts, labels) {
    $$('[data-chart]', el).forEach(host => {
      const b = charts[+host.dataset.chart];
      if (!b) return;
      const W = Math.max(300, Math.round(host.clientWidth || 640));
      const H = Math.round(Math.min(480, Math.max(260, W * (host.closest('.small') ? 0.42 : 0.6))));
      const out = b(P.screen(), W, H);
      host.innerHTML = out.svg;
      U.tooltip(host, ptEl => {
        if (ptEl.dataset.g != null && ptEl.dataset.v != null) return fmt(+ptEl.dataset.v);
        if (ptEl.dataset.xy) {
          const [a, b] = ptEl.dataset.xy.split(',').map(Number);
          const xv = out.logx ? Math.pow(10, a) : a, yv = out.logy ? Math.pow(10, b) : b;
          return (ptEl.dataset.l ? '<b>' + esc(ptEl.dataset.l) + '</b><br>' : '') + fmt(xv) + ', ' + fmt(yv);
        }
        return '';
      });
    });
  }

  /* ================= views ================= */
  function render() {
    renderNav();
    const main = $('#st-main');
    if (cur && cur.type === 'discover') { BF.discover.render(main, cur.id, discoverApi); $('#st-name').value = proj.name || 'Untitled project'; save(); return; }
    if (!proj.tables.length) { main.innerHTML = '<div class="empty">Create a table or open an example to start.</div>'; return; }
    if (!cur || (cur.type === 'table' && !table(cur.id)) || (cur.type === 'item' && !item(cur.id))) cur = { type: 'table', id: proj.tables[0].id };
    if (cur.type === 'table') renderTable(table(cur.id)); else renderItem(item(cur.id));
    $('#st-name').value = proj.name || 'Untitled project';
    save();
  }
  function select(type, id) { cur = { type, id }; render(); window.scrollTo(0, 0); }

  function renderNav() {
    const nav = $('#st-nav');
    nav.innerHTML = proj.tables.map(t => `<div class="nv-t${cur && cur.type === 'table' && cur.id === t.id ? ' on' : ''}">
      <button class="nv-row" data-sel="table:${t.id}"><span class="tt">${TYPES[t.type].tag}</span><span class="nm">${esc(t.name)}</span></button>
      ${proj.items.filter(i => i.tableId === t.id).map(i => `<button class="nv-row sub${cur && cur.type === 'item' && cur.id === i.id ? ' on' : ''}" data-sel="item:${i.id}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13c3 0 4-9 6-9s3 9 6 9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="nm">${esc(i.name || K[i.kind].label)}</span></button>`).join('')}
    </div>`).join('');
    $$('[data-sel]', nav).forEach(b => b.onclick = () => { const [ty, id] = b.dataset.sel.split(':'); select(ty, id); document.body.classList.remove('nav-open'); });
    $$('[data-disc]').forEach(b => b.classList.toggle('on', !!cur && cur.type === 'discover' && cur.id === b.dataset.disc));
  }

  /* ---------- Discover (materials database, phase ID, generative design) ---------- */
  function peaksFrom(res) {
    if (!res || res.error || !res.pf) return { error: (res && res.error) || 'No peaks were found.' };
    const pk = res.pf.peaks.filter(p => p.height > 0);
    if (!pk.length) return { error: 'No peaks were found.' };
    /* integrated intensities are what a powder pattern compares; heights if areas are unusable */
    const val = p => (isFinite(p.area) && p.area > 0 ? p.area : p.height), mx = Math.max(...pk.map(val));
    return { peaks: pk.map(p => ({ tt: p.center, rel: 100 * val(p) / mx })).sort((a, b) => a.tt - b.tt), profile: { x: res.x, y: res.yc } };
  }
  function xrdSources() {
    const out = [];
    proj.items.filter(i => i.kind === 'peaks' && i.opts.xrd && table(i.tableId)).forEach(it => {
      const t = table(it.tableId);
      out.push({ key: 'item:' + it.id, label: 'Peak analysis of ' + t.name, name: t.name, lambda: +it.opts.lambda || 1.5406, get: () => peaksFrom(compute(it)) });
    });
    proj.tables.filter(t => t.type === 'xy').forEach(t => out.push({ key: 'table:' + t.id, label: 'Table: ' + t.name + ' (peaks found automatically)', name: t.name, lambda: 1.5406,
      get: () => { let r; try { r = K.peaks.run(t, Object.assign(K.peaks.defaults(t), { xrd: true, baseline: '2' })); } catch (e) { r = { error: e.message }; } return peaksFrom(r); } }));
    return out;
  }
  const discoverApi = {
    select, xrdSources,
    get project() { return proj; },
    findTable: name => proj.tables.find(t => t.name === name),
    newTable(spec) { const t = Object.assign(blankTable(spec.type, spec.name), spec, { id: uid('t'), v: 1 }); proj.tables.push(t); save(); renderNav(); return t; },
    touch(t) { t.v = (t.v || 0) + 1; delete cache[t.id]; save(); renderNav(); }
  };

  /* ---------- data table editor ---------- */
  function renderTable(t) {
    const main = $('#st-main');
    const ncol = t.cols.length;
    const nrow = Math.max(t.rows.length + 8, 24);
    const tag = j => (t.type === 'xy' ? (j === 0 ? '<span class="ax">X</span>' : '<span class="ax y">Y</span>') : t.type === 'col' ? '<span class="ax g">group</span>' : '');
    main.innerHTML = `<div class="view-head"><div><input class="ttl" id="tb-name" value="${esc(t.name)}" aria-label="Table name"><p class="sub">${esc(TYPES[t.type].desc)}</p></div>
      <div class="acts"><button class="btn primary" id="tb-analyze"><svg viewBox="0 0 16 16"><path d="M2 13c3 0 4-9 6-9s3 9 6 9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>Analyze</button>
      <button class="btn" id="tb-advise">Suggest an analysis</button><button class="btn ghost" id="tb-paste">Paste or import</button><button class="btn ghost" id="tb-more" aria-label="More">⋯</button></div></div>
      ${t.type !== 'mv' ? `<div class="tb-opts"><label>Y-axis title <input type="text" id="tb-ylabel" value="${esc(t.ylabel || '')}" placeholder="${t.type === 'xy' ? 'e.g. Conductivity (S/cm)' : 'e.g. Activity (U/mg)'}"></label></div>` : ''}
      <div class="grid-wrap"><table class="grid" id="grid"><thead><tr><th class="rn"></th>${t.cols.map((c, j) => `<th>${tag(j)}<input data-h="${j}" value="${esc(c)}" aria-label="Column ${j + 1} title"></th>`).join('')}<th class="addc"><button id="tb-addcol" title="Add column">+</button></th></tr></thead>
      <tbody>${Array.from({ length: nrow }, (_, i) => `<tr><td class="rn">${i + 1}</td>${Array.from({ length: ncol }, (_, j) => `<td><input data-r="${i}" data-c="${j}" value="${esc((t.rows[i] || [])[j] || '')}"></td>`).join('')}<td></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Paste straight from Excel into any cell. ${t.type === 'xy' ? 'Give replicate Y columns the same title.' : t.type === 'mv' ? 'A text column (sample names) is used for labels.' : ''}</p>`;
    $('#tb-name').oninput = e => { t.name = e.target.value; renderNav(); save(); };
    if ($('#tb-ylabel')) $('#tb-ylabel').oninput = e => { t.ylabel = e.target.value; t.v++; save(); };
    $('#tb-analyze').onclick = () => analyzeDialog(t);
    $('#tb-advise').onclick = () => openCoscientist(t);
    $('#tb-paste').onclick = () => pasteDialog(t);
    $('#tb-addcol').onclick = () => { t.cols.push(t.type === 'xy' ? 'Y' : t.type === 'col' ? 'Group ' + String.fromCharCode(65 + t.cols.length) : 'Var ' + t.cols.length); t.v++; renderTable(t); save(); };
    $('#tb-more').onclick = () => moreMenu(t);
    const grid = $('#grid');
    grid.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.h != null) { t.cols[+el.dataset.h] = el.value; }
      else if (el.dataset.r != null) { const r = +el.dataset.r, c = +el.dataset.c; while (t.rows.length <= r) t.rows.push([]); t.rows[r][c] = el.value; }
      t.v = (t.v || 0) + 1; trimRows(t); save();
    });
    grid.addEventListener('keydown', e => {
      const el = e.target; if (el.dataset.r == null) return;
      const r = +el.dataset.r, c = +el.dataset.c;
      const go = (rr, cc) => { const n = grid.querySelector(`[data-r="${rr}"][data-c="${cc}"]`); if (n) { n.focus(); n.select(); e.preventDefault(); } };
      if (e.key === 'Enter' || e.key === 'ArrowDown') go(r + 1, c);
      else if (e.key === 'ArrowUp') go(r - 1, c);
      else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length) go(r, c + 1);
      else if (e.key === 'ArrowLeft' && el.selectionStart === 0) go(r, c - 1);
    });
    grid.addEventListener('paste', e => {
      const el = e.target; if (el.dataset.r == null && el.dataset.h == null) return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(text)) return;
      e.preventDefault();
      const lines = text.replace(/\r/g, '').split('\n'); if (lines[lines.length - 1] === '') lines.pop();
      const r0 = el.dataset.h != null ? -1 : +el.dataset.r, c0 = el.dataset.h != null ? +el.dataset.h : +el.dataset.c;
      lines.forEach((ln, i) => ln.split('\t').forEach((v, j) => {
        const r = r0 + i, c = c0 + j;
        while (t.cols.length <= c) t.cols.push('');
        if (r < 0) t.cols[c] = v.trim(); else { while (t.rows.length <= r) t.rows.push([]); t.rows[r][c] = v.trim(); }
      }));
      t.v++; trimRows(t); save(); renderTable(t);
      U.toast('Pasted ' + lines.length + ' rows.');
    });
  }
  function trimRows(t) { while (t.rows.length && t.rows[t.rows.length - 1].every(v => v == null || String(v).trim() === '')) t.rows.pop(); }

  function moreMenu(t) {
    const m = U.modal(`<p class="m-kicker">Table</p><h2>${esc(t.name)}</h2><div class="menu-list">
      <button data-a="dup">Duplicate table</button><button data-a="transpose">Transpose rows and columns</button><button data-a="csv">Export as CSV</button><button data-a="clear">Clear all values</button><button data-a="del" class="danger">Delete table and its analyses</button></div>`);
    m.querySelector('.menu-list').onclick = e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'dup') { const c = JSON.parse(JSON.stringify(t)); c.id = uid('t'); c.name += ' (copy)'; proj.tables.push(c); U.closeModal(); select('table', c.id); }
      if (a === 'transpose') { const all = [t.cols].concat(t.rows); const w = Math.max(...all.map(r => r.length)); const tr = Array.from({ length: w }, (_, j) => all.map(r => r[j] || '')); t.cols = tr[0]; t.rows = tr.slice(1); t.v++; U.closeModal(); render(); }
      if (a === 'csv') { U.download(t.name.replace(/[^\w-]+/g, '_') + '.csv', 'text/csv', U.csv([t.cols].concat(t.rows))); U.closeModal(); }
      if (a === 'clear') { t.rows = []; t.v++; U.closeModal(); render(); }
      if (a === 'del') {
        if (e.target.dataset.sure) { proj.items = proj.items.filter(i => i.tableId !== t.id); proj.tables = proj.tables.filter(x => x !== t); U.closeModal(); cur = null; render(); }
        else { e.target.dataset.sure = '1'; e.target.textContent = 'Click again to delete permanently'; }
      }
    };
  }

  function pasteDialog(t) {
    const m = U.modal(`<p class="m-kicker">Import</p><h2>Paste or open a file</h2>
      <div class="field"><label class="lbl" for="pd-text">Paste a block from Excel, a CSV or an instrument export. The first row is used as column titles when it contains text.</label><textarea id="pd-text" style="min-height:220px"></textarea></div>
      <div class="m-actions"><button class="btn primary" id="pd-go">Replace table contents</button><button class="btn ghost" id="pd-file">Open a file…</button></div><p class="hint">Reads CSV, TXT, XY, JCAMP-DX, XRDML, RAS, UXD, SPC and CIF. You can also drop files anywhere on Studio.</p>`);
    const ta = $('#pd-text', m);
    U.fileInto(ta, $('#pd-file', m));
    $('#pd-go', m).onclick = () => {
      const g = U.parseGrid(ta.value);
      if (!g.rows.length) { U.toast('Nothing to import.'); return; }
      const ncol = Math.max(...g.raw.map(r => r.length), g.header ? g.header.length : 0);
      t.cols = g.header ? g.header.slice(0, ncol) : (t.type === 'xy' ? ['X'].concat(Array.from({ length: ncol - 1 }, () => 'Y')) : Array.from({ length: ncol }, (_, j) => 'Col ' + (j + 1)));
      while (t.cols.length < ncol) t.cols.push('');
      t.rows = g.raw.map(r => r.map(v => String(v)));
      t.v++; U.closeModal(); save(); render(); U.toast('Imported ' + t.rows.length + ' rows.', 'ok');
    };
  }

  /* ---------- analysis dialog ---------- */
  function analyzeDialog(t) {
    const avail = Object.entries(K).filter(([, k]) => k.types.includes(t.type));
    const m = U.modal(`<p class="m-kicker">Analyze ${esc(t.name)}</p><h2>Choose an analysis</h2>
      <div class="an-list">${GROUPS.map(g => { const ks = avail.filter(([, k]) => k.group === g); return ks.length ? `<h5>${g}</h5>` + ks.map(([id, k]) => `<button class="an-opt" data-k="${id}"><b>${esc(k.label)}</b><span>${esc(k.desc)}</span></button>`).join('') : ''; }).join('')}</div>
      ${t.type !== 'xy' ? '<p class="hint">Curve fitting and spectra analyses use XY tables; ANOVA and t tests use Column tables; PCA, regression and optimisation use Multiple-variables tables.</p>' : ''}`);
    m.querySelector('.modal-box').classList.add('wide');
    $$('[data-k]', m).forEach(b => b.onclick = () => { U.closeModal(); addItem(t.id, b.dataset.k); });
  }
  function addItem(tableId, kind, opts) {
    const t = table(tableId);
    const it = { id: uid('a'), tableId, kind, opts: Object.assign(K[kind].defaults(t), opts || {}) };
    proj.items.push(it); save(); select('item', it.id);
    return it;
  }

  /* ---------- analysis result view ---------- */
  function renderItem(it) {
    const t = table(it.tableId), k = K[it.kind];
    const main = $('#st-main');
    main.innerHTML = `<div class="view-head"><div><p class="crumb"><button data-back>${esc(t.name)}</button> ›</p><h2>${esc(k.label)}</h2></div>
      <div class="acts"><button class="btn ghost small" id="it-csv">Results CSV <span class="lock">PRO</span></button><button class="btn ghost small" id="it-del">Delete</button></div></div>
      <details class="opts" ${window.innerWidth > 900 ? 'open' : ''}><summary>Options</summary><div class="opts-body" id="it-form">${k.form(it.opts, t)}</div></details>
      <div id="it-out"></div><div class="card rep" id="it-rep"></div>`;
    $('[data-back]', main).onclick = () => select('table', t.id);
    $('#it-del').onclick = e => { if (e.target.dataset.sure) { proj.items = proj.items.filter(x => x !== it); delete cache[it.id]; select('table', t.id); } else { e.target.dataset.sure = 1; e.target.textContent = 'Confirm delete'; } };
    const form = $('#it-form');
    const readForm = () => {
      $$('[data-o]', form).forEach(el => {
        const key = el.dataset.o;
        if (el.type === 'checkbox' && el.value && el.value !== 'on') {
          const all = $$(`[data-o="${key}"]`, form).filter(x => x.checked).map(x => +x.value);
          it.opts[key] = all;
        } else if (el.type === 'checkbox') it.opts[key] = el.checked;
        else it.opts[key] = el.value;
      });
      if (it.kind === 'nlfit') {
        const fx = {};
        $$('[data-fix]', form).forEach(cb => { const j = cb.dataset.fix; const v = parseFloat($(`[data-fixv="${j}"]`, form).value); if (cb.checked && isFinite(v)) fx[j] = v; });
        it.opts.fixed = fx;
      }
    };
    let h;
    form.addEventListener('change', e => {
      readForm();
      if (['model', 'post', 'xrd', 'compo', 'expr'].includes(e.target.dataset.o)) { if (e.target.dataset.o === 'model') it.opts.fixed = {}; form.innerHTML = k.form(it.opts, t); }
      save(); runItem(it);
    });
    form.addEventListener('input', e => { if (e.target.type === 'number' || e.target.type === 'text') { clearTimeout(h); h = setTimeout(() => { readForm(); save(); runItem(it); }, 350); } });
    runItem(it);
  }
  function runItem(it) {
    const out = $('#it-out'), k = K[it.kind], t = table(it.tableId);
    const res = compute(it);
    if (res && res.pending) { out.innerHTML = `<div class="card res"><div class="ds-wait"><span class="spin"></span> Training ${Object.keys(BF.learn.modelNames).length} kinds of model with cross-validation on ${res.y ? res.y.length : ''} samples…</div></div>`; $('#it-rep').innerHTML = ''; return; }
    if (!res || res.error) { out.innerHTML = `<div class="card res"><div class="err">${esc(res ? res.error : 'No result')}</div></div>`; $('#it-rep').innerHTML = ''; return; }
    let r;
    try { r = k.render(res, it.opts, t); } catch (e) { console.error(e); out.innerHTML = `<div class="card res"><div class="err">Could not display this result: ${esc(e.message)}</div></div>`; return; }
    out.innerHTML = `<div class="card res">${r.html}</div>`;
    const charts = (r.charts || []).filter(Boolean);
    drawCharts(out, r.charts || [], r.labels);
    $$('[data-x]', out).forEach(b => b.onclick = () => {
      const build = r.charts[+b.dataset.x];
      U.exportFigure((T, W, H) => build(T, W, H), (t.name + '-' + it.kind).replace(/[^\w-]+/g, '_'), b.dataset.f);
    });
    if (r.wire) r.wire(out, it);
    $('#it-csv').onclick = () => Pro.require('CSV export', () => r.csv && U.download((t.name + '-' + it.kind).replace(/[^\w-]+/g, '_') + '.csv', 'text/csv', U.csv(r.csv())));
    const sections = k.text ? k.text(res, it.opts, t) : null;
    if (sections) U.renderReport($('#it-rep'), sections, { title: k.label + ': ' + t.name, file: 'lattent-' + it.kind, figure: () => charts[0] ? charts[0](P.print, 720, 500).svg : '' });
    else $('#it-rep').innerHTML = '';
    lastRendered = { it, res, r };
  }
  let lastRendered = null;

  /* ================= Facet: the AI lab partner ================= */
  function advise(t) {
    const out = [];
    if (t.type === 'xy') {
      const d = xyData(t); const s = d.series[0];
      if (!s) return [{ title: 'Add data first', why: 'The table has no numeric X–Y pairs yet.' }];
      const x = s.means.map(q => q.x), y = s.means.map(q => q.y), n = x.length;
      const xl = (d.xlabel || '').toLowerCase();
      const shape = BF.ml && BF.ml.ready() ? BF.ml.classify(s.xs, s.ys) : null;
      if (shape) {
        const top = shape[0];
        const nz = BF.ml.noise(s.xs, s.ys);
        const w = nz && nz.recommend === '1/y2' ? '1/y2' : 'none';
        const head = { shape, title: '', why: '' };
        out.push(head);
        if (top.analysis === 'peaks') {
          const xrdLike = /2θ|2theta|two.?theta|2 theta|°/.test(xl) && x[0] >= 3 && x[n - 1] <= 160;
          out.push({ title: xrdLike ? 'Fit the diffraction peaks' : 'Resolve and fit the peaks', why: top.why + (xrdLike ? ' The axis looks like 2θ, so d-spacings and Scherrer sizes are included.' : ''), kind: 'peaks', opts: xrdLike ? { xrd: true, baseline: '2', shape: 'pv' } : { baseline: '1', shape: 'pv' } });
          if (xrdLike) out.push({ title: 'Identify the crystalline phases', why: 'Matches the peaks against every computed structure of your elements in the Alexandria database and ranks the phases.', disc: 'phase', ctx: { source: 'table:' + t.id, res: null } });
        } else if (top.analysis === 'tauc') {
          out.push({ title: 'Determine the optical band gap', why: top.why, kind: 'tauc', opts: {} });
          const g = BF.discover.guessFormula(t.name);
          if (g) out.push({ title: 'Compare with computed band gaps of ' + g, why: 'Lists every computed polymorph of ' + g + ' in the Alexandria DFT database with its band gap.', disc: 'search', ctx: { q: g, mode: 'formula', hull: 'any', res: null, autorun: true } });
        }
        else if (top.analysis === 'tensile') out.push({ title: 'Analyse the tensile test', why: top.why, kind: 'tensile', opts: {} });
        else if (top.models) {
          const labels = (d.xlabel + ' ' + t.cols.join(' ') + ' ' + (t.ylabel || '')).toLowerCase();
          const hints = [[/overpot|current dens|η/, 'tafel'], [/\bmn\b|mₙ|molecular weight|molar mass/, 'floryfox'], [/grain|d\^-1\/2/, 'hallpetch'], [/susceptib|χ/, 'curieweiss'],
            [/diameter|radius|size \(nm\)|nanocrystal|dot size/, 'confine'], [/cₑ|\bce\b|equilib|isotherm|pressure|p\/p0/, 'langmuir'], [/\[s\]|substrate/, 'mm'], [/uptake|q_?t|time \(min|contact time/, 'pso'],
            [/vft|polymer electrolyte|peo/, 'vft'], [/crystallin|transformed|fraction/, 'avrami'], [/dose|conc.*(µm|nm)|inhibitor/, 'dr4'], [/mark|intrinsic visc|\[η\]/, 'markhouwink'], [/lifetime|decay|pl intensity|τ/, 'expdecay']];
          const hinted = hints.filter(([re, id]) => re.test(labels) && top.models.includes(id)).map(h => h[1]);
          const fit = hinted.concat(top.models).map(id => M.byId(id)).find(mm => mm && M.applicable(mm, s.xs, s.ys));
          if (fit) out.push({ title: 'Fit ' + fit.name, why: top.why + (w === '1/y2' ? ' Scatter grows with the signal, so 1/Y² weighting is applied.' : ''), kind: 'nlfit', opts: { model: fit.id, weight: w, logx: x.every(v => v > 0) && Math.log10(x[n - 1] / x[0]) > 2, logy: top.key === 'thermally_activated' } });
          if (n >= 6) out.push({ title: 'Let AI discover the equation', why: 'Symbolic regression searches thousands of candidate formulas, including ones not in the library, and returns the simplest that fits.', kind: 'symreg', opts: {} });
          out.push({ title: 'Compare every model for this shape', why: 'Fits all ' + BF.ml.candidates(shape, 0.97).length + ' candidate equations for the likely shapes and ranks them by AICc.', kind: 'autofit', opts: { field: 'shape', logx: x.every(v => v > 0) && Math.log10(x[n - 1] / x[0]) > 2 } });
        }
        if (d.series.length > 1 && n >= 3 && top.key === 'linear') out.push({ title: 'Compare the slopes of the data sets', why: 'Tests whether one common slope fits every data set.', kind: 'linreg', opts: {} });
        return out;
      }
      const peaks = n > 40 ? A.findPeaks(x, y.map((v, i) => v - Math.min(...y)), { prominence: 0.08, smooth: 3 }) : [];
      if (/2θ|2theta|two.?theta|2 theta/.test(xl) || (peaks.length >= 3 && x[0] > 5 && x[n - 1] < 160 && n > 200)) {
        out.push({ title: 'Fit the diffraction peaks', why: `${peaks.length} sharp peaks over a 2θ-like range. Peak fitting gives d-spacings and the Scherrer crystallite size.`, kind: 'peaks', opts: { xrd: true, baseline: '2', shape: 'pv', inst: 0.08 } });
        out.push({ title: 'Identify the crystalline phases', why: 'Matches the peaks against every computed structure of your elements in the Alexandria database and ranks the phases.', disc: 'phase', ctx: { source: 'table:' + t.id, res: null } });
      }
      else if (peaks.length >= 2 && n > 60) out.push({ title: 'Resolve the peaks', why: `${peaks.length} peaks detected; fit them to get positions, widths and areas.`, kind: 'peaks', opts: {} });
      if (/nm|wavelength|λ|ev|energy/.test(xl) && /abs|od|a\.u/.test((d.ylabel + ' ' + t.cols.join(' ')).toLowerCase())) out.push({ title: 'Determine the optical band gap', why: 'This looks like an absorbance spectrum; a Tauc plot extrapolates the band gap.', kind: 'tauc', opts: {} });
      if (/strain|elong/.test(xl)) out.push({ title: 'Analyse the tensile test', why: "X is strain: get Young's modulus, yield strength and toughness.", kind: 'tensile', opts: {} });
      if (/\bk\b|kelvin|temp/.test(xl) && x.every(v => v > 150) && y.every(v => v > 0)) out.push({ title: 'Fit Arrhenius and get the activation energy', why: 'Positive values against absolute temperature: thermally activated behaviour is the first model to test.', kind: 'nlfit', opts: { model: 'arrhenius', logy: true } });
      if (/conc|dose|µm|um|nm|mol/.test(xl) && x.every(v => v > 0) && Math.log10(Math.max(...x) / Math.min(...x)) > 2) out.push({ title: 'Fit a dose–response curve', why: 'Concentrations span more than two decades; a four-parameter logistic on a log axis gives the EC50/IC50.', kind: 'nlfit', opts: { model: 'dr4', logx: true } });
      if (/mn|mw|molecular/.test(xl)) out.push({ title: 'Fit Flory–Fox', why: 'Property vs molecular weight: Flory–Fox gives the infinite-chain limit.', kind: 'nlfit', opts: { model: 'floryfox', logx: true } });
      if (/shear|rate|γ/.test(xl)) out.push({ title: 'Fit a shear-thinning model', why: 'Viscosity vs shear rate: Carreau or Cross models give η₀ and the power-law index.', kind: 'autofit', opts: { field: 'Polymers', logx: true } });
      if (/cₑ|ce\b|equilib|isotherm|pressure/.test(xl + ' ' + t.cols.join(' ').toLowerCase())) out.push({ title: 'Compare adsorption isotherms', why: 'Langmuir, Freundlich and Sips ranked by AICc.', kind: 'autofit', opts: { field: 'Materials & chemistry' } });
      if (n >= 5 && !out.some(o => o.kind === 'autofit')) out.push({ title: 'Let Lattent find the best model', why: 'Tries every applicable equation and ranks them by AICc, so you can see what the data support before choosing.', kind: 'autofit', opts: { field: 'all' } });
      if (d.series.length > 1 && n >= 3) out.push({ title: 'Compare the data sets with linear regression', why: 'Tests whether the slopes differ between data sets.', kind: 'linreg', opts: {} });
    } else if (t.type === 'col') {
      const g = colData(t);
      if (g.length < 2) return [{ title: 'Add at least two groups', why: 'Each column is a group.' }];
      const nonNormal = g.some(x => { const n = A.normality(x.v); return !n.error && n.p < 0.05; });
      const sds = g.map(x => S.sd(x.v)); const ratio = Math.max(...sds) / Math.min(...sds);
      if (g.length === 2) out.push({ title: nonNormal ? 'Mann–Whitney test' : (ratio > 2 ? "Welch's t test" : 't test'), why: nonNormal ? 'A group departs from normality, so a rank-based test is safer.' : ratio > 2 ? 'The SDs differ by more than twofold; Welch’s test does not assume equal variances.' : 'Two roughly normal groups.', kind: 'ttest', opts: { test: nonNormal ? 'mw' : ratio > 2 ? 'welch' : 'welch' } });
      else out.push({ title: nonNormal ? 'Kruskal–Wallis test' : ratio > 2 ? "Welch's ANOVA" : 'One-way ANOVA with Tukey', why: nonNormal ? 'At least one group is not normally distributed.' : ratio > 2 ? `Group SDs differ ${ratio.toFixed(1)}-fold, so Welch's ANOVA is more reliable.` : `${g.length} groups with similar spread: compare all pairs with Tukey's test.`, kind: 'anova', opts: { test: nonNormal ? 'kw' : ratio > 2 ? 'welch' : 'ordinary', post: ratio > 2 ? 'holm' : 'tukey' } });
      out.push({ title: 'Describe each group', why: 'Mean, SD, CI, normality and outliers before testing.', kind: 'describe', opts: {} });
    } else {
      const d = mvData(t); const nn = d.numeric.length, rows = t.rows.length;
      if (nn < 2) return [{ title: 'Add numeric variables', why: 'Each column is a variable; each row a sample.' }];
      const tgt = d.numeric.find(c => /strength|toughness|yield|efficien|activity|capacity|conductiv|selectiv|modulus|hardness|response|output|target|score|band ?gap|tg\b/i.test(c.name));
      if (tgt && rows >= 6) out.push({ title: 'Suggest the next experiments for ' + tgt.name, why: 'A Gaussian-process model learns how your inputs drive this property and proposes the most informative next runs.', kind: 'bo', opts: { target: tgt.j, inputs: d.numeric.filter(c => c !== tgt).map(c => c.j) } });
      if (tgt && rows >= 8) out.push({ title: 'Train AutoML to predict ' + tgt.name, why: 'Six kinds of model compete under cross-validation; you get the best one, the inputs that matter and predictions with calibrated intervals.', kind: 'automl', opts: { target: tgt.j, inputs: d.numeric.filter(c => c !== tgt).map(c => c.j) } });
      if (tgt) out.push({ title: 'Regress ' + tgt.name + ' on the other variables', why: 'Linear effects with confidence intervals and standardised importance.', kind: 'mlr', opts: { y: tgt.j, xs: d.numeric.filter(c => c !== tgt).map(c => c.j) } });
      if (nn >= 3) out.push({ title: 'Principal component analysis', why: `${nn} variables: see which move together and how samples group.`, kind: 'pca', opts: {} });
      out.push({ title: 'Correlation matrix', why: 'Quick overview of pairwise relationships.', kind: 'corr', opts: {} });
      if (rows >= 8) out.push({ title: 'Cluster the samples', why: 'Find families of similar samples automatically.', kind: 'kmeans', opts: { k: 'auto' } });
    }
    return out;
  }

  function openCoscientist(t) {
    document.body.classList.add('co-open');
    $('#co-tab-advisor').click();
    if (t) renderAdvisor(t);
  }
  function renderAdvisor(t) {
    t = t || (cur && (cur.type === 'table' ? table(cur.id) : cur.type === 'item' && item(cur.id) ? table(item(cur.id).tableId) : null));
    const box = $('#co-advisor');
    if (!t) { box.innerHTML = cur && cur.type === 'discover' ? '<p class="hint">Suggestions follow your data tables. In Discover, ask Facet in the Ask tab, or open a table.</p>' : '<p class="hint">Open a table to get suggestions.</p>'; return; }
    const list = advise(t);
    box.innerHTML = `<p class="hint">Suggestions for <b>${esc(t.name)}</b>.</p>` + list.map((s, i) => (s.shape ? `<div class="sug ai">${shapeLine(s.shape)}<p class="hint" style="margin:6px 0 0">Lattent's shape model was trained on ${(BF.ml.metrics().train_samples / 1000).toFixed(0)},000 simulated lab datasets and runs in your browser.</p></div>` : `<div class="sug"><b>${esc(s.title)}</b><p>${esc(s.why)}</p>${s.kind || s.disc ? `<button class="btn small primary" data-run="${i}">${s.disc ? 'Open' : 'Run'}</button>` : ''}</div>`)).join('');
    $$('[data-run]', box).forEach(b => b.onclick = () => { const s = list[+b.dataset.run]; if (s.disc) BF.discover.open(s.disc, s.ctx); else addItem(t.id, s.kind, s.opts); });
  }

  /* LLM chat: the model plans; Lattent computes. */
  const AI = { get: () => U.store.get('bf.ai', { provider: 'anthropic', model: 'claude-sonnet-5-5', key: '' }), set: v => U.store.set('bf.ai', v) };
  let chat = [];
  function projectSummary() {
    return proj.tables.map(t => {
      const head = t.cols.join(' | ');
      const rows = t.rows.slice(0, 25).map(r => r.join(' | ')).join('\n');
      const its = proj.items.filter(i => i.tableId === t.id).map(i => { const r = cache[i.id] && cache[i.id].res; const txt = r && !r.error && K[i.kind].text ? (K[i.kind].text(r, i.opts, t) || []).map(s => s.html.replace(/<[^>]+>/g, '')).join(' ') : ''; return `  - analysis ${i.id}: ${K[i.kind].label} ${JSON.stringify(i.opts)} ${txt.slice(0, 600)}`; }).join('\n');
      return `TABLE ${t.id} "${t.name}" type=${t.type} (${t.rows.length} rows)\ncolumns: ${head}\n${rows}${t.rows.length > 25 ? '\n…' : ''}\n${its}`;
    }).join('\n\n');
  }
  function systemPrompt() {
    const cat = Object.entries(K).map(([id, k]) => `- ${id} (${k.types.join(',')} tables): ${k.label}. ${k.desc} Default options: ${JSON.stringify(k.defaults(proj.tables[0] || blankTable('xy')))}`).join('\n');
    const eqs = M.library.map(m => `${m.id}: ${m.name} [${m.field}] ${m.eq}`).join('\n');
    return `You are Facet, the AI lab partner inside Lattent Studio, a data-analysis workspace for materials, chemistry, polymers, nanomaterials, physics and biology. You help scientists choose and interpret analyses. You never compute fitted numbers yourself: every result must come from Lattent's validated engine.
When the user attaches a figure (a plot, spectrum, diffractogram, micrograph or screenshot): say what it shows (axes, units, scales, trends, features), then list concrete errors or weaknesses, such as missing or wrong units, unlabelled axes, truncated or misleading scales, missing error bars or sample sizes, overfitting, extrapolation, unphysical values, or peaks that are mis-assigned. If digitising helps, give approximate data in one fenced block \`\`\`csv with a header row (X first); the user can add it as a table and Lattent will analyse it properly. State that values read from an image are approximate.
To run an analysis, include one fenced block:
\`\`\`lattent
{"actions":[{"table":"<table id>","kind":"<analysis id>","opts":{...}}]}
\`\`\`
The user sees a Run button for each action. Only use table ids and analysis ids listed below. Explain your reasoning briefly, mention assumptions, and when results are in the project summary, interpret them in physical or biological terms and suggest the next experiment. Be concise.

ANALYSES:
${cat}

EQUATIONS for nlfit (opts.model):
${eqs}
custom: user-defined (opts.model="custom", opts.expr="A*exp(-k*x)+c")

PROJECT:
${projectSummary()}`;
  }
  let attached = null;   // {type, data (base64), name, url (data URL)}
  async function askLLM(q, img) {
    const cfg = AI.get();
    if (!cfg.key) throw new Error('Add your Anthropic or OpenAI API key in the fields above first.');
    chat.push({ role: 'user', content: q, image: img || null });
    /* only the latest image is sent, to keep requests small */
    const last = chat.map((m, i) => (m.image ? i : -1)).filter(i => i >= 0).pop();
    const msgs = chat.slice(-12).map(m => {
      const isImg = m.image && chat.indexOf(m) === last;
      if (cfg.provider === 'openai') return { role: m.role, content: isImg ? [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: m.image.url } }] : m.content };
      return { role: m.role, content: isImg ? [{ type: 'image', source: { type: 'base64', media_type: m.image.type, data: m.image.data } }, { type: 'text', text: m.content }] : m.content };
    });
    let text;
    if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ model: cfg.model || 'gpt-5', messages: [{ role: 'system', content: systemPrompt() }].concat(msgs) }) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'OpenAI request failed');
      text = j.choices[0].message.content;
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: cfg.model || 'claude-sonnet-5-5', max_tokens: 1500, system: systemPrompt(), messages: msgs }) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Anthropic request failed');
      text = j.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    }
    chat.push({ role: 'assistant', content: text });
    return text;
  }
  function renderChat() {
    const log = $('#co-log');
    log.innerHTML = chat.map((m, mi) => {
      if (m.role === 'user') return `<div class="msg u">${m.image ? `<img class="msg-img" src="${m.image.url}" alt="Attached figure">` : ''}${esc(m.content)}</div>`;
      const acts = [], csvs = [];
      let body = m.content.replace(/```(?:lattent|benchfit)\s*([\s\S]*?)```/g, (_, js) => { try { const j = JSON.parse(js); (j.actions || []).forEach(a => acts.push(a)); } catch (e) { /* ignore malformed */ } return ''; });
      body = body.replace(/```csv\s*([\s\S]*?)```/g, (_, c) => { csvs.push(c.trim()); return '\n[data table below]\n'; });
      return `<div class="msg a">${esc(body.trim()).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}${acts.map((a, i) => (K[a.kind] && table(a.table) ? `<div class="act"><span>${esc(K[a.kind].label)} on ${esc(table(a.table).name)}</span><button class="btn small primary" data-act="${mi}:${i}">Run</button></div>` : '')).join('')}${csvs.map((c, i) => `<div class="act"><span>Data read from the figure (${c.split('\n').length - 1} rows, approximate)</span><button class="btn small primary" data-csv="${mi}:${i}">Add as table</button></div>`).join('')}</div>`;
    }).join('') || '<p class="hint">Ask in plain language, for example: “Which isotherm fits best and what is the maximum capacity?”, or attach a figure and ask “What is wrong with this graph?”</p>';
    $$('[data-act]', log).forEach(b => b.onclick = () => {
      const [mi, i] = b.dataset.act.split(':').map(Number);
      const acts = []; chat[mi].content.replace(/```(?:lattent|benchfit)\s*([\s\S]*?)```/g, (_, js) => { try { (JSON.parse(js).actions || []).forEach(a => acts.push(a)); } catch (e) { /* ignore */ } });
      const a = acts[i]; if (a && K[a.kind] && table(a.table)) addItem(a.table, a.kind, a.opts || {});
    });
    $$('[data-csv]', log).forEach(b => b.onclick = () => {
      const [mi, i] = b.dataset.csv.split(':').map(Number);
      const csvs = []; chat[mi].content.replace(/```csv\s*([\s\S]*?)```/g, (_, c) => { csvs.push(c.trim()); });
      const g = U.parseGrid(csvs[i] || '');
      if (!g.rows.length) { U.toast('No usable data in that block.'); return; }
      addTableFromData('Data read by Facet', g.header || ['X', 'Y'], g.raw.map(r => r.map(String)));
    });
    log.scrollTop = log.scrollHeight;
  }
  function wireCoscientist() {
    $('#co-close').onclick = () => document.body.classList.remove('co-open');
    $('#st-co').onclick = () => { document.body.classList.toggle('co-open'); renderAdvisor(); };
    const PANES = { 'co-tab-advisor': '#co-advisor', 'co-tab-check': '#co-check', 'co-tab-graph': '#co-graph', 'co-tab-report': '#co-report', 'co-tab-chat': '#co-chat' };
    $$('.co-tabs button').forEach(b => b.onclick = () => {
      $$('.co-tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
      Object.entries(PANES).forEach(([id, sel2]) => { $(sel2).hidden = id !== b.id; });
      if (b.id === 'co-tab-advisor') renderAdvisor(); else if (b.id === 'co-tab-check') renderCheck(); else if (b.id === 'co-tab-graph') renderGraphTab(); else if (b.id === 'co-tab-report') renderReportTab(); else { renderChat(); syncAiCfg(); }
    });
    const showAtt = () => { const a = $('#co-att'); a.hidden = !attached; a.innerHTML = attached ? `<img src="${attached.url}" alt=""><span>${esc(attached.name)}</span><button type="button" aria-label="Remove figure">×</button>` : ''; if (attached) a.querySelector('button').onclick = () => { attached = null; showAtt(); }; };
    const takeImage = f => readImage(f).then(img => { attached = img; showAtt(); if (!$('#co-q').value.trim()) $('#co-q').value = 'What does this figure show, and is anything wrong with it?'; }).catch(e => U.toast(e.message));
    $('#co-attach').onclick = () => $('#co-img').click();
    $('#co-img').onchange = e => { if (e.target.files[0]) takeImage(e.target.files[0]); e.target.value = ''; };
    $('#co-q').addEventListener('paste', e => { const it = [...(e.clipboardData || {}).items || []].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); takeImage(it.getAsFile()); } });
    const cfg = AI.get();
    $('#ai-provider').value = cfg.provider; $('#ai-model').value = cfg.model; $('#ai-key').value = cfg.key ? '••••••••' + cfg.key.slice(-4) : '';
    const saveCfg = () => { const c = AI.get(); c.provider = $('#ai-provider').value; c.model = $('#ai-model').value.trim(); const k = $('#ai-key').value.trim(); if (k && !k.startsWith('••')) c.key = k; AI.set(c); syncAiCfg(); };
    $('#ai-provider').onchange = () => { $('#ai-model').value = $('#ai-provider').value === 'openai' ? 'gpt-5' : 'claude-sonnet-5-5'; saveCfg(); };
    $('#ai-model').onchange = saveCfg; $('#ai-key').onchange = saveCfg;
    $('#ai-forget').onclick = () => { const c = AI.get(); c.key = ''; AI.set(c); $('#ai-key').value = ''; syncAiCfg(); U.toast('Key removed from this browser.'); };
    $('#co-form').onsubmit = e => {
      e.preventDefault();
      const q = $('#co-q').value.trim(); if (!q) return;
      Pro.require('The Facet chat', async () => {
        const img = attached; attached = null; showAtt();
        $('#co-q').value = ''; renderChat();
        $('#co-log').insertAdjacentHTML('beforeend', `<div class="msg u">${img ? `<img class="msg-img" src="${img.url}" alt="">` : ''}${esc(q)}</div><div class="msg a thinking">${img ? 'Looking at your figure…' : 'Thinking…'}</div>`);
        try { await askLLM(q, img); } catch (err) { chat.push({ role: 'assistant', content: 'Error: ' + err.message }); }
        renderChat();
      });
    };
  }
  async function llmOnce(system, text, img, maxTokens) {
    const cfg = AI.get();
    if (!cfg.key) throw new Error('no key');
    if (cfg.provider === 'openai') {
      const content = img ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: img.url } }] : text;
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ model: cfg.model || 'gpt-5', messages: [{ role: 'system', content: system }, { role: 'user', content }] }) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'OpenAI request failed');
      return j.choices[0].message.content;
    }
    const content = img ? [{ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } }, { type: 'text', text }] : text;
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: cfg.model || 'claude-sonnet-5-5', max_tokens: maxTokens || 1500, system, messages: [{ role: 'user', content }] }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Anthropic request failed');
    return j.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  }

  /* =============== Report agent: plan → run → check → write, autonomously =============== */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const repFigs = [];       // supplied figures: {name, url, data, type}
  let lastReport = null;
  function planReport(scope) {
    const cur2 = cur && (cur.type === 'table' ? table(cur.id) : cur.type === 'item' && item(cur.id) ? table(item(cur.id).tableId) : null);
    const tables = scope === 'current' && cur2 ? [cur2] : proj.tables;
    const plan = [];
    tables.forEach(t => {
      const have = proj.items.filter(i => i.tableId === t.id);
      have.forEach(it => plan.push({ it, t, existing: true }));
      if (have.length) return;
      let sug = []; try { sug = advise(t).filter(x => x.kind && K[x.kind] && K[x.kind].types.includes(t.type)); } catch (e) { sug = []; }
      const seen = new Set();
      sug.forEach(x => { if (seen.size < 3 && !seen.has(x.kind)) { seen.add(x.kind); plan.push({ it: { id: uid('r'), tableId: t.id, kind: x.kind, opts: Object.assign(K[x.kind].defaults(t), x.opts || {}) }, t, why: x.why, existing: false }); } });
    });
    return { tables, plan };
  }
  async function runPlanItem(p) {
    let res = compute(p.it), n = 0;
    while (res && res.pending && n++ < 240) { await sleep(250); res = compute(p.it); }
    return res;
  }
  const fmtDate = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  function paras(text) { return esc(text).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join(''); }
  function assembleReport(d) {
    const css = `*{box-sizing:border-box}body{font:15px/1.65 Georgia,'Times New Roman',serif;color:#14182e;max-width:820px;margin:0 auto;padding:40px 28px 64px}h1,h2,h3,.k,table,figcaption,.meta{font-family:system-ui,-apple-system,'Segoe UI',sans-serif}h1{font-size:30px;line-height:1.15;margin:0 0 6px;letter-spacing:-.02em}h2{font-size:20px;margin:34px 0 8px;padding-bottom:6px;border-bottom:2px solid #e0712c}h3{font-size:16px;margin:22px 0 6px}.meta{color:#656d8c;font-size:13px;margin:0 0 22px}.k{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#a5501a;font-weight:600;margin:0 0 8px}figure{margin:14px 0;padding:10px;border:1px solid #e2e5ef;border-radius:8px}figure svg{max-width:100%;height:auto;display:block}figcaption{font-size:12.5px;color:#3a4160;margin-top:6px}table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0}th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #e2e5ef;vertical-align:top}th{background:#f6f7fb}.note{background:#fdf1e7;border-left:3px solid #e0712c;padding:8px 12px;font-size:13px;font-family:system-ui,sans-serif;margin:10px 0}.ai{background:#eceefd;border-left:3px solid #3e4ed8;padding:8px 14px;margin:10px 0}.ai small{display:block;font:600 11px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#2d3aad;margin-bottom:4px}.chk li{margin:4px 0}.foot{margin-top:40px;font:12px system-ui,sans-serif;color:#656d8c;border-top:1px solid #e2e5ef;padding-top:10px}@media print{body{padding:0;max-width:none}h2{break-after:avoid}figure,table{break-inside:avoid}}`;
    const toc = d.sections.map(s2 => s2.title);
    const body = [];
    body.push(`<p class="k">Analysis report</p><h1>${esc(d.title)}</h1><p class="meta">Generated by Lattent (${esc(BF_CONFIG.site)}) on ${fmtDate()}${d.author ? ' · ' + esc(d.author) : ''} · ${d.nTables} data table${d.nTables === 1 ? '' : 's'}, ${d.nAnalyses} analys${d.nAnalyses === 1 ? 'is' : 'es'}</p>`);
    body.push(`<h2>Summary</h2>${d.aiSummary ? `<div class="ai"><small>Drafted by ${esc(d.model)} from the results below; check before use</small>${paras(d.aiSummary)}</div>` : ''}<ul>${d.findings.map(f => `<li>${esc(f)}</li>`).join('') || '<li>No analyses could be completed.</li>'}</ul>`);
    d.sections.forEach((sec, i) => {
      body.push(`<h2>${i + 1}. ${esc(sec.title)}</h2><p>${esc(sec.data)}</p>`);
      sec.runs.forEach(r => {
        body.push(`<h3>${esc(r.label)}</h3>`);
        if (r.error) { body.push(`<div class="note">This analysis could not be completed: ${esc(r.error)}</div>`); return; }
        if (r.svg) body.push(`<figure>${r.svg}<figcaption><b>Figure ${r.fig}.</b> ${esc(r.label)}: ${esc(sec.title)}.</figcaption></figure>`);
        r.sections.forEach(x => body.push(`<h4 style="font:600 13px system-ui,sans-serif;margin:12px 0 2px;color:#3a4160">${esc(x.title)}</h4>${x.html}`));
      });
    });
    if (d.aiDiscussion) body.push(`<h2>Discussion</h2><div class="ai"><small>Drafted by ${esc(d.model)} from the results above; check before use</small>${paras(d.aiDiscussion)}</div>`);
    if (d.figReviews.length) body.push(`<h2>Supplied figures</h2>${d.figReviews.map(f => `<figure><img src="${f.url}" alt="${esc(f.name)}" style="max-width:100%;height:auto"><figcaption><b>${esc(f.name)}.</b></figcaption></figure>${f.text ? `<div class="ai"><small>Reviewed by ${esc(d.model)}; values read from images are approximate</small>${paras(f.text)}</div>` : '<p class="meta">No AI key was available, so this figure was included without review.</p>'}`).join('')}`);
    body.push(`<h2>Quality checks</h2>${d.checks.length ? `<ul class="chk">${d.checks.map(c => `<li><b>${c.sev === 'error' ? 'Error' : c.sev === 'warn' ? 'Warning' : 'Note'}:</b> ${plain(c.msg)} <span class="meta">(${esc(c.where)})</span></li>`).join('')}</ul>` : '<p>Facet found no problems with units, sample sizes, fit quality, model choice or test assumptions.</p>'}`);
    body.push(`<h2>Limitations and next steps</h2><ul>${d.next.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
    body.push(`<h2>Reproducibility</h2><table><tr><th>Analysis</th><th>Table</th><th>Options</th></tr>${d.repro.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.table)}</td><td style="font-family:ui-monospace,monospace;font-size:11.5px">${esc(r.opts)}</td></tr>`).join('')}</table>`);
    body.push(`<p class="foot">Results were computed by Lattent’s validated analysis engine (checked against SciPy and NumPy) in the author’s browser. ${d.aiSummary || d.aiDiscussion || d.figReviews.some(f => f.text) ? 'Passages marked as drafted by a language model are interpretation only and were not used to compute any number. ' : ''}Lattent is research software and is not validated for GLP or clinical use.</p>`);
    void toc;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}: analysis report</title><style>${css}</style></head><body>${body.join('\n')}</body></html>`;
  }
  async function runAgent() {
    const log = $('#rp-log'); log.innerHTML = '';
    const out = $('#rp-out'); out.innerHTML = '';
    const btn = $('#rp-go'); btn.disabled = true;
    const step = txt => { const li = document.createElement('li'); li.innerHTML = `<span class="spin"></span> ${esc(txt)}`; log.appendChild(li); log.scrollTop = log.scrollHeight; return { ok(m) { li.className = 'ok'; li.innerHTML = '<i>✓</i> ' + esc(m || txt); }, skip(m) { li.className = 'skip'; li.innerHTML = '<i>–</i> ' + esc(m); }, fail(m) { li.className = 'bad'; li.innerHTML = '<i>!</i> ' + esc(m); } }; };
    try {
      const scope = ($('input[name=rp-scope]:checked') || {}).value || 'all';
      const author = $('#rp-author').value.trim();
      const hasKey = !!AI.get().key, canAI = hasKey && Pro.active(), model = AI.get().model || (AI.get().provider === 'openai' ? 'gpt-5' : 'claude-sonnet-5-5');
      let st = step('Reading the project'); await sleep(250);
      const { tables, plan } = planReport(scope);
      if (!tables.length) { st.fail('There is no data to report on. Add a table first.'); btn.disabled = false; return; }
      st.ok(`Read ${tables.length} table${tables.length > 1 ? 's' : ''} (${tables.reduce((n, t) => n + t.rows.length, 0)} rows)`);
      st = step('Planning the analyses'); await sleep(300);
      st.ok(plan.length ? `Plan: ${plan.map(p => K[p.it.kind].label.split(' (')[0]).join(' · ')}` : 'No analyses to run; reporting the data only');
      const sections = [], findings = [], repro = [], allText = [];
      let fig = 0, nA = 0;
      for (const t of tables) {
        const sec = { title: t.name, data: `${TYPES[t.type].title}: ${t.rows.length} rows, columns ${t.cols.map(c => '“' + (c || '–') + '”').join(', ')}.`, runs: [] };
        for (const p of plan.filter(x => x.t === t)) {
          const k = K[p.it.kind], label = k.label.replace(/\s*\(.*\)$/, '');
          const s2 = step(`${p.existing ? 'Collecting' : 'Running'} ${label} on ${t.name}`);
          await sleep(60);
          const res = await runPlanItem(p);
          if (!res || res.error || res.pending) { s2.fail(`${label}: ${(res && res.error) || 'timed out'}`); sec.runs.push({ label, error: (res && res.error) || 'The analysis timed out.' }); continue; }
          let r, text;
          try { r = k.render(res, p.it.opts, t); text = k.text ? k.text(res, p.it.opts, t) : null; } catch (e) { s2.fail(`${label}: ${e.message}`); sec.runs.push({ label, error: e.message }); continue; }
          const build = (r.charts || []).filter(Boolean)[0];
          let svg = ''; try { svg = build ? build(P.print, 720, 460).svg : ''; } catch (e) { svg = ''; }
          const run = { label, svg, fig: svg ? ++fig : 0, sections: text || [] };
          sec.runs.push(run); nA++;
          (text || []).filter(x => /result/i.test(x.title)).forEach(x => { const f = plain(x.html); if (f) { findings.push(`${t.name}: ${f}`); } });
          (text || []).forEach(x => allText.push(`[${t.name} · ${label} · ${x.title}] ${plain(x.html)}`));
          repro.push({ label, table: t.name, opts: JSON.stringify(p.it.opts) });
          s2.ok(`${label} on ${t.name}${svg ? ' (figure ' + run.fig + ')' : ''}`);
        }
        sections.push(sec);
      }
      st = step('Checking the analyses for mistakes'); await sleep(250);
      let checks = []; try { checks = critique().filter(c => tables.some(t => c.where.includes(t.name)) || scope === 'all'); } catch (e) { checks = []; }
      st.ok(checks.length ? `${checks.length} point${checks.length > 1 ? 's' : ''} flagged for review` : 'No problems found');
      const next = [];
      tables.forEach(t => { const ran = new Set(plan.filter(p => p.t === t).map(p => p.it.kind)); try { advise(t).filter(x => x.kind && !ran.has(x.kind)).slice(0, 2).forEach(x => next.push(`${t.name}: ${x.title}. ${x.why}`)); advise(t).filter(x => x.disc).slice(0, 1).forEach(x => next.push(`${t.name}: ${x.title}. ${x.why}`)); } catch (e) { /* ignore */ } });
      plan.filter(p => p.it.kind === 'bo').forEach(p => { const r = compute(p.it); if (r && r.s && r.s.picks) next.push(`Run the suggested experiments for ${p.t.name}: ${r.s.picks.slice(0, 3).map(q => '(' + q.x.map(v => U.fmt(v, 3)).join(', ') + ')').join('; ')}, then add the measured values and re-run.`); });
      next.push('Treat fitted equations as descriptions of the data range, not as proof of mechanism, and do not extrapolate beyond it.');
      next.push('Replicate key measurements; confidence intervals here reflect the scatter in the data supplied, not systematic error.');
      const d = { title: proj.name || 'Untitled project', author, nTables: tables.length, nAnalyses: nA, sections, findings, checks, next, repro, figReviews: [], aiSummary: '', aiDiscussion: '', model };
      /* multimodal: review supplied figures */
      if (repFigs.length) {
        for (const f of repFigs) {
          const s3 = step(`Reading figure “${f.name}”`);
          if (!canAI) { d.figReviews.push({ name: f.name, url: f.url, text: '' }); s3.skip(hasKey ? 'AI features need Pro or a trial; figure included without review' : 'Add an AI key in Ask to have figures reviewed; included without review'); continue; }
          try {
            const text = await llmOnce('You are Facet reviewing a scientific figure for a lab report. First describe what the figure shows in 2 to 3 sentences (axes with units, trends, notable features). Then list concrete problems as lines starting with "- " (missing or wrong units, unlabeled axes, misleading scales, missing error bars or sample sizes, overfitting, extrapolation, mis-assigned peaks). Do not state numbers you cannot read; say any values are approximate. If nothing is wrong, say so briefly.', 'Review this figure for the report.', f, 900);
            d.figReviews.push({ name: f.name, url: f.url, text }); s3.ok(`Reviewed “${f.name}”`);
          } catch (e) { d.figReviews.push({ name: f.name, url: f.url, text: '' }); s3.fail(`Figure review failed: ${e.message}`); }
        }
      }
      if (canAI && allText.length) {
        const s4 = step(`Drafting the summary and discussion (${model})`);
        try {
          const txt = await llmOnce('You are Facet writing parts of a scientific report from verified results. Write exactly two sections headed SUMMARY and DISCUSSION. SUMMARY: at most 120 words of plain scientific prose on what was measured and found. DISCUSSION: at most 220 words interpreting the results physically or chemically, noting limitations, and recommending the next experiment. Use only numbers that appear in the RESULTS text; never introduce new numbers or claim anything the results do not support.', 'RESULTS:\n' + allText.join('\n').slice(0, 9000) + (checks.length ? '\n\nCHECKS FLAGGED:\n' + checks.map(c => plain(c.msg)).join('\n') : ''), null, 1200);
          const m = txt.match(/SUMMARY\s*:?\s*([\s\S]*?)(?:\n\s*#*\s*DISCUSSION\s*:?\s*([\s\S]*))?$/i);
          d.aiSummary = (m && m[1] ? m[1] : txt).trim(); d.aiDiscussion = (m && m[2] ? m[2] : '').trim();
          s4.ok('Drafted the summary and discussion');
        } catch (e) { s4.fail('Drafting failed: ' + e.message); }
      } else if (hasKey && !canAI) step('Drafting the summary and discussion').skip('Needs Pro or a trial; the report uses the computed findings instead');
      st = step('Assembling the report'); await sleep(250);
      const html = assembleReport(d);
      lastReport = { html, d, plan };
      st.ok(`Report ready: ${nA} analyses, ${fig} figure${fig === 1 ? '' : 's'}, ${checks.length} flagged point${checks.length === 1 ? '' : 's'}`);
      const fname = (d.title || 'report').replace(/[^\w-]+/g, '_') + '-report.html';
      out.innerHTML = `<div class="rp-done"><b>Your report is ready.</b><span>${nA} analyses · ${fig} figures · ${checks.length} checks flagged${d.aiSummary ? ' · AI-drafted summary' : ''}</span>
        <div class="rp-btns"><button class="btn primary small" data-rp="preview">Preview</button><button class="btn small" data-rp="download">Download HTML <span class="lock">PRO</span></button><button class="btn small" data-rp="print">Print or save PDF <span class="lock">PRO</span></button>${plan.some(p => !p.existing) ? '<button class="btn small ghost" data-rp="add">Add these analyses to the project</button>' : ''}</div></div>`;
      $$('[data-rp]', out).forEach(b => b.onclick = () => {
        const a = b.dataset.rp;
        if (a === 'preview') { const m = U.modal(`<p class="m-kicker">Facet · Report</p><h2>${esc(d.title)}</h2><iframe class="rp-frame" title="Report preview" sandbox="" srcdoc="${html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`); m.querySelector('.modal-box').classList.add('xwide'); }
        if (a === 'download') Pro.require('Report export', () => U.download(fname, 'text/html', html));
        if (a === 'print') Pro.require('Report export', () => { const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const w = window.open(url, '_blank'); if (w) w.addEventListener('load', () => { try { w.print(); } catch (e) { /* user prints manually */ } }); else U.toast('Allow pop-ups to print, or download the HTML and print it.'); });
        if (a === 'add') { plan.filter(p => !p.existing).forEach(p => { proj.items.push(p.it); }); save(); render(); U.toast('Analyses added to the project.', 'ok'); b.remove(); }
      });
    } catch (e) { console.error(e); const li = document.createElement('li'); li.className = 'bad'; li.innerHTML = '<i>!</i> The agent stopped: ' + esc(e.message); log.appendChild(li); }
    btn.disabled = false;
  }
  function renderReportTab() {
    const box = $('#co-report'); const hasKey = !!AI.get().key;
    box.innerHTML = `<div class="rp-intro"><b>Autonomous report</b><p>Facet plans the analyses your data call for, runs them, checks them for mistakes and writes a complete scientific report with methods, results, figures, checks and next steps. It works offline; with your AI key it also drafts the summary and discussion, and reviews figures you attach.</p></div>
      <div class="rp-opts">
        <div class="seg" role="radiogroup"><label><input type="radio" name="rp-scope" value="all" checked> Whole project</label><label><input type="radio" name="rp-scope" value="current"> Current table</label></div>
        <label class="rp-l">Author or group <span>optional</span><input type="text" id="rp-author" maxlength="120" placeholder="e.g. Panigrahy lab"></label>
        <div class="rp-figs"><div class="rp-fh"><span>Figures to review <small>optional · multimodal</small></span><button type="button" class="btn small ghost" id="rp-add">Add figure</button><input type="file" id="rp-file" accept="image/*" multiple hidden></div><div id="rp-fl"></div>
          <p class="hint">${hasKey ? 'A vision model reads each figure and lists problems, using your key.' : 'Add your Claude or GPT key in Ask to have the figures reviewed. Without it they are included as supplied.'}</p></div>
        <button class="btn primary" id="rp-go">Run the agent</button>
      </div>
      <ol class="rp-log" id="rp-log"></ol><div id="rp-out"></div>`;
    const paint = () => { $('#rp-fl', box).innerHTML = repFigs.map((f, i) => `<div class="rp-f"><img src="${f.url}" alt=""><span>${esc(f.name)}</span><button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join(''); $$('[data-rm]', box).forEach(b => b.onclick = () => { repFigs.splice(+b.dataset.rm, 1); paint(); }); };
    $('#rp-add', box).onclick = () => $('#rp-file', box).click();
    $('#rp-file', box).onchange = async e => { for (const f of [...e.target.files].slice(0, 6 - repFigs.length)) { try { repFigs.push(await readImage(f)); } catch (err) { U.toast(err.message); } } e.target.value = ''; paint(); };
    $('#rp-go', box).onclick = runAgent;
    paint();
  }

  /* read an image file, downscaled to at most 1600 px, as base64 for the vision models */
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose a PNG, JPEG or WebP image.'));
      if (file.size > 15e6) return reject(new Error('That image is larger than 15 MB.'));
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const sc = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/png');
          resolve({ type: 'image/png', data: url.split(',')[1], url, name: file.name || 'pasted image', canvas: c });
        };
        im.onerror = () => reject(new Error('That file could not be read as an image.'));
        im.src = fr.result;
      };
      fr.onerror = () => reject(new Error('That file could not be read.'));
      fr.readAsDataURL(file);
    });
  }
  function addTableFromData(name, cols, rows) {
    if (!proj) proj = { name: 'Untitled project', tables: [], items: [] };
    const t = Object.assign(blankTable('xy', name), { cols, rows, v: 1, id: uid('t') });
    proj.tables.push(t); save(); select('table', t.id);
    U.toast('Added “' + name + '” with ' + rows.length + ' rows.', 'ok');
    return t;
  }

  /* ---------- drop lab files anywhere on Studio ---------- */
  async function importFiles(files) {
    let n = 0;
    for (const f of [...files].slice(0, 12)) {
      if (/\.(lattent|benchfit)\.json$/i.test(f.name)) { U.toast('Use Open to load a project file.'); continue; }
      try {
        const r = await BF.formats.read(f);
        if (r.kind === 'structure') {
          const pat = BF.xtal.xrd(r.structure, { tmin: 10, tmax: 90 }), prof = BF.xtal.profile(pat, 10, 90, 0.1);
          const t = addTableFromData(`${r.meta.formula || r.name} simulated XRD (from CIF)`, ['2θ (°)', 'Intensity (simulated)'], prof.map(([x, y]) => [x.toFixed(3), y.toFixed(3)]));
          t.ylabel = 'Intensity (relative)';
        } else {
          const t = addTableFromData(r.name, r.cols, r.rows);
          if (r.ylabel) t.ylabel = r.ylabel;
          if (r.meta && r.meta.lambda) U.toast(`${f.name}: ${r.rows.length} points; wavelength ${r.meta.lambda} Å recorded in the file.`, 'ok');
        }
        n++;
      } catch (e) { U.toast(`${f.name}: ${e.message}`); }
    }
    if (n) { save(); if (document.querySelector('.modal')) U.closeModal(); }
  }
  (function dropZone() {
    let depth = 0;
    const veil = document.createElement('div'); veil.className = 'drop-veil'; veil.hidden = true;
    veil.innerHTML = '<div><b>Drop to import</b><span>CSV, TXT, XY, JCAMP-DX, XRDML, RAS, UXD, SPC or CIF. Each file becomes a table; nothing is uploaded.</span></div>';
    document.body.appendChild(veil);
    const files = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', e => { if (!files(e)) return; depth++; veil.hidden = false; });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
    window.addEventListener('dragover', e => { if (files(e)) e.preventDefault(); });
    window.addEventListener('drop', e => { if (!files(e)) return; e.preventDefault(); depth = 0; veil.hidden = true; if (e.target.closest && e.target.closest('textarea, #gr-drop, #co-graph, #co-report, #co-chat')) return; importFiles(e.dataTransfer.files); });
  })();

  /* ---------- Check: an offline reviewer of the whole project ---------- */
  const UNIT = /\(.+\)|\[.+\]|\/\s*\S+$|absorbance|\ba\.?\s?u\.?|counts|intensity|fraction|ratio|%|normali[sz]ed|relative|efficiency|coverage|transmittance|reflectance|\bod\b|cycle|\bph\b/i;
  function critique() {
    const out = [];
    const add = (sev, where, msg, go) => out.push({ sev, where, msg, go });
    proj.tables.forEach(t => {
      if (t.type === 'xy' && t.rows.length) {
        const nameX = t.cols[0] || '';
        if (!UNIT.test(nameX) && !/sample|run|index|id/i.test(nameX)) add('info', t.name, `The X column “${nameX || 'X'}” has no unit. Add one, for example “Temperature (K)”, so figures and methods text are complete.`, ['table', t.id]);
        if (!UNIT.test(t.ylabel || t.cols[1] || '')) add('info', t.name, 'The Y axis has no unit. Set the Y-axis title with its unit.', ['table', t.id]);
        const d = xyData(t), s0 = d.series[0];
        if (s0 && s0.means.length < 5) add('warn', t.name, `Only ${s0.means.length} distinct X values: fits with three or more parameters will be poorly determined.`, ['table', t.id]);
      }
    });
    proj.items.forEach(it => {
      const t = table(it.tableId); if (!t) return;
      const k = K[it.kind], where = `${k.label}: ${t.name}`, go = ['item', it.id];
      let res; try { res = compute(it); } catch (e) { res = { error: e.message }; }
      if (!res || res.pending) return;
      if (res.error) { add('error', where, 'This analysis does not run on the current data: ' + res.error, go); return; }
      if (it.kind === 'nlfit') res.fits.forEach(f => {
        if (f.r.error) { add('error', where, `${f.s.name}: ${f.r.error}`, go); return; }
        const fr = f.r.fit, np = fr.p.length - fr.fixed.filter(Boolean).length, n = f.s.xs.length;
        if (n < np + 3) add('warn', where, `${f.s.name}: ${n} points for ${np} free parameters leaves almost no degrees of freedom; confidence intervals will be very wide.`, go);
        (f.r.warn || []).forEach(w => add('warn', where, `${f.s.name}: ${w}`, go));
        if (fr.r2 < 0.9) add('warn', where, `${f.s.name}: R² = ${fr.r2.toFixed(3)}; the model misses much of the variation. Try Auto-fit or equation discovery.`, go);
        if (it.opts.weight !== '1/y2' && BF.ml && BF.ml.ready()) { const nz = BF.ml.noise(f.s.xs, f.s.ys); if (nz && nz.recommend === '1/y2') add('info', where, `${f.s.name}: scatter grows with the signal; 1/Y² weighting is likely more appropriate.`, go); }
      });
      if (it.kind === 'autofit' && res.list && res.list.length > 1) {
        const a0 = res.list[0], a1 = res.list[1], aic = x => (x.fit && x.fit.fit ? x.fit.fit.aicc : x.aicc);
        if (isFinite(aic(a0)) && isFinite(aic(a1)) && aic(a1) - aic(a0) < 2) add('info', where, `The two best models are within 2 AICc units: the data cannot distinguish ${esc((a0.model || a0.fit.model).name)} from ${esc((a1.model || a1.fit.model).name)}. Report both, or collect more points where they differ.`, go);
      }
      if (it.kind === 'ttest' || it.kind === 'anova') {
        const g = colData(t);
        const nonNormal = g.filter(x => { const q = A.normality(x.v); return !q.error && q.p < 0.05; }).map(x => x.name);
        const sds = g.map(x => S.sd(x.v)).filter(isFinite), ratio = Math.max(...sds) / Math.min(...sds);
        const parametric = it.kind === 'anova' ? it.opts.test !== 'kw' : !['mw'].includes(it.opts.test);
        if (parametric && nonNormal.length) add('warn', where, `${nonNormal.join(', ')} ${nonNormal.length > 1 ? 'depart' : 'departs'} from normality (p < 0.05); a rank-based test (${it.kind === 'anova' ? 'Kruskal–Wallis' : 'Mann–Whitney'}) is safer.`, go);
        if (ratio > 2 && (it.kind === 'anova' ? it.opts.test === 'ordinary' : it.opts.test === 'student')) add('warn', where, `Group SDs differ ${ratio.toFixed(1)}-fold; use Welch’s ${it.kind === 'anova' ? 'ANOVA' : 't test'}, which does not assume equal variances.`, go);
        if (g.some(x => x.v.length < 3)) add('warn', where, 'Some groups have fewer than three values; tests have very little power.', go);
      }
      if (it.kind === 'anova' && proj.items.filter(i => i.tableId === it.tableId && i.kind === 'ttest').length > 1) add('info', where, 'Several t tests on the same table inflate false positives; the ANOVA post tests already correct for multiple comparisons.', go);
      if (it.kind === 'peaks' && res.pf) {
        if (res.pf.r2 < 0.98) add('warn', where, `Peak fit R² = ${res.pf.r2.toFixed(3)}: try a higher baseline order, a pseudo-Voigt shape or a lower prominence threshold.`, go);
        if (res.xr && res.xr.rows.some(r => r.size > 100)) add('info', where, 'Some Scherrer sizes exceed 100 nm, where instrumental broadening dominates and the estimate is unreliable.', go);
      }
      if (it.kind === 'tauc' && res.r && res.r.r2 < 0.98) add('warn', where, `The linear region of the Tauc plot has R² = ${res.r.r2.toFixed(3)}; set the region by hand around the steepest part of the edge.`, go);
      if (it.kind === 'symreg' && res.r && res.r.best && res.r.best.preferred) add('info', where, 'A generic equation fits slightly better than the recognised law; check the physics before choosing.', go);
      if (it.kind === 'automl' && res.best) {
        if (res.n < 20) add('warn', where, `AutoML trained on ${res.n} samples; the cross-validated R² is itself uncertain. Add data before trusting predictions.`, go);
        if (res.best.r2 < 0.5) add('warn', where, `The best model explains ${Math.max(0, res.best.r2 * 100).toFixed(0)}% of held-out variation; predictions are rough.`, go);
        const ex = (res.preds || []).filter(q => q.extrapolating).length;
        if (ex) add('warn', where, `${ex} prediction${ex > 1 ? 's are' : ' is'} outside the training range; treat ${ex > 1 ? 'them' : 'it'} with caution.`, go);
      }
    });
    return out;
  }
  function renderCheck() {
    const box = $('#co-check');
    if (!proj || !proj.tables.length) { box.innerHTML = '<p class="hint">Add data and analyses, then Facet will review them.</p>'; return; }
    const list = critique(), n = { error: 0, warn: 0, info: 0 }; list.forEach(x => n[x.sev]++);
    const icon = { error: '!', warn: '!', info: 'i' };
    box.innerHTML = `<div class="chk-sum ${list.length ? '' : 'ok'}">${list.length ? `<b>${list.length} point${list.length > 1 ? 's' : ''} to review</b> · ${n.error} error${n.error === 1 ? '' : 's'}, ${n.warn} warning${n.warn === 1 ? '' : 's'}, ${n.info} suggestion${n.info === 1 ? '' : 's'}` : '<b>No problems found.</b> Facet checked units, sample sizes, fit quality, model choice and test assumptions across the project.'}</div>
      ${list.map((x, i) => `<div class="chk ${x.sev}"><span class="ic">${icon[x.sev]}</span><div><small>${esc(x.where)}</small><p>${x.msg}</p>${x.go ? `<button class="linkbtn" data-go="${i}">Open</button>` : ''}</div></div>`).join('')}
      <p class="hint">The review runs offline with Lattent’s own rules; for a figure from elsewhere, use Read a graph or Ask.</p>`;
    $$('[data-go]', box).forEach(b => b.onclick = () => { const g = list[+b.dataset.go].go; select(g[0], g[1]); });
  }

  /* ---------- Read a graph: digitise a plot image into a table ---------- */
  function renderGraphTab() {
    const box = $('#co-graph');
    box.innerHTML = `<div class="gr-drop" id="gr-drop" tabindex="0"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M5 20V9m4 11V5m4 15v-8m4 8V8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <b>Drop a picture of a graph</b><span>or click to choose, or paste a screenshot. A plot from a paper, a spectrum, an instrument screen.</span></div>
      <input type="file" id="gr-file" accept="image/*" hidden>
      <ol class="gr-steps"><li>Click two known points on the X axis and type their values.</li><li>Do the same on the Y axis.</li><li>Click the curve or the markers you want.</li><li>Facet traces them and adds the data as a table.</li></ol>
      <p class="hint">Runs entirely in your browser. To have the figure interpreted or checked for errors, attach it in the Ask tab.</p>`;
    const drop = $('#gr-drop', box), file = $('#gr-file', box);
    const take = f => readImage(f).then(digitizer).catch(e => U.toast(e.message));
    drop.onclick = () => file.click();
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    file.onchange = e => { if (e.target.files[0]) take(e.target.files[0]); e.target.value = ''; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) take(f); };
    drop.onpaste = e => { const it = [...(e.clipboardData || {}).items || []].find(x => x.type.startsWith('image/')); if (it) take(it.getAsFile()); };
  }
  function digitizer(img) {
    const m = U.modal(`<p class="m-kicker">Facet · Read a graph</p><h2 id="dg-title">Click the first point on the X axis</h2>
      <div class="dg-wrap"><canvas id="dg-c" aria-label="Graph image; click to place calibration points"></canvas></div>
      <div class="dg-bar" id="dg-bar"></div>`);
    m.querySelector('.modal-box').classList.add('xwide');
    const cv = $('#dg-c', m), g = cv.getContext('2d'), W = img.canvas.width, H = img.canvas.height;
    cv.width = W; cv.height = H;
    const base = img.canvas.getContext('2d').getImageData(0, 0, W, H);
    const st = { cal: [], vals: [], logx: false, logy: false, color: null, tol: 60, pts: [] };
    const STEPS = ['Click the first point on the X axis', 'Click a second point on the X axis, far from the first', 'Click the first point on the Y axis', 'Click a second point on the Y axis', 'Click on the curve or markers to trace'];
    const toPx = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    const draw = () => {
      g.putImageData(base, 0, 0);
      st.cal.forEach(([x, y], i) => { g.strokeStyle = i < 2 ? '#3e4ed8' : '#e0712c'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); g.fillStyle = g.strokeStyle; g.font = '600 13px Inter, sans-serif'; g.fillText((i < 2 ? 'x' : 'y') + (i % 2 + 1), x + 9, y - 9); });
      g.fillStyle = '#e0712c'; st.pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
    };
    const bar = $('#dg-bar', m);
    const askValue = i => {
      bar.innerHTML = `<label>${i < 2 ? 'X' : 'Y'} value at this point <input type="number" step="any" id="dg-v" autofocus></label><button class="btn primary small" id="dg-ok">Set</button>${i === 1 || i === 3 ? `<label class="check"><input type="checkbox" id="dg-log"> logarithmic ${i < 2 ? 'X' : 'Y'} axis</label>` : ''}`;
      const ok = () => { const v = parseFloat($('#dg-v', m).value); if (!isFinite(v)) { U.toast('Type the axis value at that point.'); return; } st.vals[i] = v; const lg = $('#dg-log', m); if (lg) st[i < 2 ? 'logx' : 'logy'] = lg.checked; step(); };
      $('#dg-ok', m).onclick = ok; $('#dg-v', m).onkeydown = e => { if (e.key === 'Enter') ok(); }; setTimeout(() => $('#dg-v', m).focus(), 30);
    };
    const step = () => { const i = st.cal.length; $('#dg-title', m).textContent = STEPS[Math.min(i, 4)]; bar.innerHTML = i < 4 ? '<span class="hint">Zoom in your browser for precision if needed.</span>' : '<span class="hint">Click a curve or its markers.</span>'; draw(); };
    const lin = (a, b, va, vb, log) => { const f = log ? Math.log10 : v => v; const A0 = f(va), B0 = f(vb); return p => { const v = A0 + (p - a) * (B0 - A0) / (b - a); return log ? Math.pow(10, v) : v; }; };
    const trace = () => {
      const [x1, x2, y1, y2] = st.cal, d = base.data, c = st.color, tol2 = st.tol * st.tol;
      const fx = lin(x1[0], x2[0], st.vals[0], st.vals[1], st.logx), fy = lin(y1[1], y2[1], st.vals[2], st.vals[3], st.logy);
      /* follow the curve from the clicked point: in each pixel column take the run of matching
         pixels nearest the previous one, so axes, text and other curves are not picked up */
      const runs = px => {
        const out = []; let start = -1;
        for (let py = 0; py <= H; py++) {
          let hit = false;
          if (py < H) { const o = (py * W + px) * 4; const dr = d[o] - c[0], dg2 = d[o + 1] - c[1], db = d[o + 2] - c[2]; hit = dr * dr + dg2 * dg2 + db * db < tol2; }
          if (hit && start < 0) start = py;
          if (!hit && start >= 0) { if (py - start < H * 0.25) out.push((start + py - 1) / 2); start = -1; }
        }
        return out;
      };
      const jump = H * 0.08, cols = [];
      const walk = (from, dir) => {
        let prev = st.seed[1], miss = 0;
        for (let px = from; px >= 0 && px < W; px += dir) {
          const r = runs(px);
          if (!r.length) { if (++miss > W * 0.04) break; continue; }
          const best = r.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a));
          if (Math.abs(best - prev) > jump) { if (++miss > W * 0.04) break; continue; }
          miss = 0; prev = best; cols.push([px, best]);
        }
      };
      walk(Math.round(st.seed[0]), 1); walk(Math.round(st.seed[0]) - 1, -1);
      cols.sort((a, b) => a[0] - b[0]);
      const want = Math.min(80, cols.length), stepN = cols.length / Math.max(1, want);
      st.pts = Array.from({ length: want }, (_, k) => cols[Math.floor(k * stepN)]);
      draw();
      const data = st.pts.map(([px, py]) => [fx(px), fy(py)]);
      bar.innerHTML = `<span><b>${data.length} points</b> traced${data.length ? `, X ${U.fmt(Math.min(...data.map(q => q[0])))} to ${U.fmt(Math.max(...data.map(q => q[0])))}` : ''}.</span>
        <label>Colour tolerance <input type="range" id="dg-tol" min="15" max="140" value="${st.tol}"></label>
        <button class="btn small" id="dg-again">Pick another colour</button><button class="btn primary small" id="dg-add"${data.length ? '' : ' disabled'}>Add as a table</button>`;
      $('#dg-tol', m).oninput = e => { st.tol = +e.target.value; trace(); };
      $('#dg-again', m).onclick = () => { st.color = null; st.pts = []; step(); };
      $('#dg-add', m).onclick = () => { U.closeModal(); addTableFromData('Read from ' + img.name.replace(/\.[a-z]+$/i, ''), ['X', 'Y'], data.sort((a, b) => a[0] - b[0]).map(r => r.map(v => String(Number(v.toPrecision(5)))))); };
    };
    cv.onclick = e => {
      const p = toPx(e);
      if (st.cal.length < 4) { st.cal.push(p); draw(); askValue(st.cal.length - 1); return; }
      const o = (Math.round(p[1]) * W + Math.round(p[0])) * 4;
      st.color = [base.data[o], base.data[o + 1], base.data[o + 2]]; st.seed = p;
      if (st.color[0] > 235 && st.color[1] > 235 && st.color[2] > 235) { U.toast('That is background; click on the curve itself.'); st.color = null; return; }
      trace();
    };
    step();
  }

  function syncAiCfg() { const c = AI.get(); $('#ai-state').textContent = c.key ? 'Connected with your ' + (c.provider === 'openai' ? 'OpenAI' : 'Anthropic') + ' key (stored only in this browser).' : 'Add your own API key; requests go straight from your browser to the provider.'; }

  /* ================= start screen ================= */
  function startScreen(closable) {
    const S0 = window.BF_SAMPLES;
    const m = U.modal(`<p class="m-kicker">Lattent Studio</p><h2>What would you like to analyse?</h2>
      <div class="start-cols"><div><h5>Start with an example</h5><div class="ex-grid">${S0.map(s => `<button class="ex" data-ex="${s.id}"><span class="fld">${esc(s.field)}</span><b>${esc(s.title)}</b><span>${esc(s.blurb)}</span></button>`).join('')}</div></div>
      <div><h5>Or a new, empty table</h5>${Object.entries(TYPES).map(([k, v]) => `<button class="newt" data-new="${k}"><b>${v.title}</b><span>${esc(v.desc)}</span></button>`).join('')}<p class="start-drop">Or drop instrument files anywhere on this page: CSV, TXT, XY, JCAMP-DX, XRDML, RAS, UXD, SPC or CIF.</p></div></div>`);
    m.querySelector('.modal-box').classList.add('xwide');
    if (!closable) m.querySelector('.modal-x').hidden = true;
    $$('[data-ex]', m).forEach(b => b.onclick = () => { loadSample(b.dataset.ex); U.closeModal(); });
    $$('[data-new]', m).forEach(b => b.onclick = () => {
      if (!proj) proj = { name: 'Untitled project', tables: [], items: [] };
      const t = blankTable(b.dataset.new); proj.tables.push(t); U.closeModal(); select('table', t.id);
    });
  }
  function loadSample(id) {
    const s = window.BF_SAMPLES.find(x => x.id === id).make();
    const keep = proj && proj.tables.length && !proj.sample ? proj : null;
    if (!keep) proj = { name: window.BF_SAMPLES.find(x => x.id === id).title, tables: [], items: [], sample: true };
    let firstItem = null;
    s.tables.forEach((t, ti) => {
      const nt = Object.assign(blankTable(t.type, t.name), t, { id: uid('t'), v: 1 });
      proj.tables.push(nt);
      s.items.forEach(i => { const it = { id: uid('a'), tableId: nt.id, kind: i.kind, opts: Object.assign(K[i.kind].defaults(nt), i.opts) }; proj.items.push(it); if (!firstItem) firstItem = it; });
    });
    cache = {};
    select(firstItem ? 'item' : 'table', firstItem ? firstItem.id : proj.tables[proj.tables.length - 1].id);
  }

  /* ================= toolbar ================= */
  function wireToolbar() {
    $('#st-name').oninput = e => { proj.name = e.target.value; proj.sample = false; save(); };
    $('#st-new').onclick = () => startScreen(true);
    $('#st-addtable').onclick = () => {
      const m = U.modal(`<p class="m-kicker">New table</p><h2>Choose the table type</h2>${Object.entries(TYPES).map(([k, v]) => `<button class="newt" data-new="${k}"><b>${v.title}</b><span>${esc(v.desc)}</span></button>`).join('')}`);
      $$('[data-new]', m).forEach(b => b.onclick = () => { const t = blankTable(b.dataset.new); proj.tables.push(t); proj.sample = false; U.closeModal(); select('table', t.id); });
    };
    $('#st-save').onclick = () => Pro.require('Project files', () => U.download((proj.name || 'project').replace(/[^\w-]+/g, '_') + '.lattent.json', 'application/json', JSON.stringify({ app: 'lattent-studio', version: 1, project: proj })));
    $('#st-open').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => inp.files[0] && inp.files[0].text().then(tx => {
        try { const j = JSON.parse(tx); if (!['lattent-studio', 'benchfit-studio'].includes(j.app)) throw new Error(); const pj = sanitize(j.project); if (!pj) throw new Error(); delete pj.cloud; proj = pj; cache = {}; cur = null; render(); U.toast('Project opened.', 'ok'); } catch (e) { U.toast('That is not a Lattent Studio project.'); }
      });
      inp.click();
    };
    $('#st-menu').onclick = () => document.body.classList.toggle('nav-open');
    $('#st-cloud').onclick = () => cloudDialog();
    let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => { if (cur && cur.type === 'item') runItem(item(cur.id)); }, 200); });
    document.addEventListener('bf:pro', () => { if (cur && cur.type === 'item') runItem(item(cur.id)); });
  }


  /* ================= cloud storage ================= */
  const CL = BF.cloud || { enabled: false };
  let cloudTimer = null, cloudBusy = false, lastPushed = '';
  const payload = () => ({ app: 'lattent-studio', version: 1, project: { name: proj.name, tables: proj.tables, items: proj.items } });
  function cloudStatus(text, kind) { const el = $('#st-cloud-state'); if (el) { el.textContent = text || ''; el.className = 'cs ' + (kind || ''); } }
  function scheduleCloud() {
    if (!CL.enabled || !CL.user || !proj || !proj.cloud) return;
    if (JSON.stringify(payload()) === lastPushed) return;
    cloudStatus('Unsaved changes', '');
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => pushCloud(false), 3500);
  }
  async function pushCloud(force) {
    if (cloudBusy || !proj.cloud) return;
    cloudBusy = true; cloudStatus('Saving…', '');
    const snapshot = JSON.stringify(payload());
    try {
      const r = await CL.save(proj.name || 'Untitled project', payload(), { id: proj.cloud.id, version: proj.cloud.version, teamId: proj.cloud.teamId, force });
      proj.cloud.version = r.version; proj.cloud.savedAt = Date.now(); lastPushed = snapshot;
      try { localStorage.setItem(KEY, JSON.stringify(proj)); } catch (e) { /* ignore */ }
      cloudStatus('Saved to cloud', 'ok');
    } catch (e) {
      if (e.conflict) conflictDialog(); else cloudStatus(e.message.length > 60 ? 'Cloud save failed' : e.message, 'bad'), U.toast(e.message);
    } finally { cloudBusy = false; }
  }
  function conflictDialog() {
    cloudStatus('Changed elsewhere', 'bad');
    const m = U.modal(`<p class="m-kicker">Cloud</p><h2>This project changed elsewhere</h2>
      <p>Someone (or you, in another browser) saved a newer version since you opened it.</p>
      <div class="menu-list"><button data-c="copy">Keep both: save my version as a copy</button><button data-c="theirs">Discard my changes and load the newer version</button><button data-c="mine" class="danger">Overwrite the newer version with mine</button></div>`);
    m.querySelector('.menu-list').onclick = async e => {
      const c = e.target.dataset.c; if (!c) return;
      U.closeModal();
      if (c === 'mine') pushCloud(true);
      if (c === 'theirs') openCloud(proj.cloud.id);
      if (c === 'copy') { proj.name = (proj.name || 'Project') + ' (my copy)'; delete proj.cloud; await saveToCloud(null); }
    };
  }
  async function saveToCloud(teamId) {
    try {
      const r = await CL.save(proj.name || 'Untitled project', payload(), { teamId });
      proj.cloud = { id: r.id, version: r.version, teamId: r.team_id, savedAt: Date.now() };
      lastPushed = JSON.stringify(payload());
      proj.sample = false; save(); render(); cloudStatus('Saved to cloud', 'ok');
      U.toast('Saved to the cloud. Changes now sync automatically.', 'ok');
      return true;
    } catch (e) { U.toast(e.message); if (/limit|full/.test(e.message)) U.upgrade('More cloud storage'); return false; }
  }
  async function openCloud(id) {
    try {
      const row = await CL.load(id);
      const pj = sanitize(row.data && row.data.project);
      if (!pj) throw new Error('This cloud project could not be read.');
      pj.cloud = { id: row.id, version: row.version, teamId: row.team_id, savedAt: Date.now() };
      proj = pj; cache = {}; cur = null; lastPushed = JSON.stringify(payload());
      try { localStorage.setItem(KEY, JSON.stringify(proj)); } catch (e) { /* ignore */ }
      render(); cloudStatus('Saved to cloud', 'ok'); U.closeModal();
      U.toast('Opened “' + pj.name + '” from the cloud.', 'ok');
    } catch (e) { U.toast(e.message); }
  }
  async function cloudDialog() {
    if (!CL.enabled) {
      U.modal(`<p class="m-kicker">Cloud</p><h2>Cloud storage is coming soon</h2><p>Your project is saved automatically in this browser. To keep a copy elsewhere, use <b>Save</b> to download a project file.</p>`);
      return;
    }
    await CL.ready;
    if (!CL.user) {
      const m = U.modal(`<p class="m-kicker">Cloud</p><h2>Sign in to save projects to the cloud</h2>
        <p>Open your projects on any computer and share them with your lab. Free accounts keep 3 projects; Pro and Lab keep as many as you need.</p>
        <form class="row" id="cl-si" style="display:flex;gap:8px;flex-wrap:wrap"><input type="email" id="cl-email" placeholder="you@university.edu" required style="flex:1;min-width:200px"><button class="btn primary" type="submit">Email me a sign-in link</button></form><p class="hint" id="cl-msg"></p>`);
      $('#cl-si', m).onsubmit = e => {
        e.preventDefault();
        CL.signIn($('#cl-email', m).value).then(() => { $('#cl-msg', m).innerHTML = '<b>Check your inbox.</b> The link brings you back here, signed in. Your current project stays in this browser.'; }).catch(err => { $('#cl-msg', m).textContent = err.message; });
      };
      return;
    }
    const m = U.modal(`<p class="m-kicker">Cloud</p><h2>Cloud projects</h2><div id="cl-body"><p class="hint">Loading…</p></div>`);
    m.querySelector('.modal-box').classList.add('wide');
    let list = [], team = null, ent = null;
    try { [list, team, ent] = await Promise.all([CL.list(), CL.team().catch(() => null), CL.entitlement()]); }
    catch (e) { $('#cl-body', m).innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const here = proj.cloud && list.find(x => x.id === proj.cloud.id);
    const fmtB = b => (b / 1048576).toFixed(b < 1048576 ? 2 : 1) + ' MB';
    $('#cl-body', m).innerHTML = `
      <p class="hint">Signed in as <b>${esc(CL.user.email)}</b> · ${ent ? `${fmtB(ent.used_bytes)} of ${fmtB(ent.quota_bytes)} · ${ent.projects}/${ent.quota_projects >= 2000 ? '∞' : ent.quota_projects} projects` : ''} · <a href="../account/">Account</a></p>
      <div class="cl-now">${here ? `<b>${esc(proj.name)}</b> is saved in the cloud and syncs automatically${here.team_id ? ' · shared with your lab' : ''}.`
        : `<b>${esc(proj.name || 'This project')}</b> is only in this browser.`}
        <div class="m-actions">${here ? '<button class="btn" data-copy>Save a copy</button>' : '<button class="btn primary" data-save>Save to cloud</button>'}
        ${team ? `<label class="check"><input type="checkbox" id="cl-share"${here && here.team_id ? ' checked' : ''}> Share with ${esc(team.name)}</label>` : ''}</div></div>
      <h5 class="cl-h">Your projects${team ? ' and your lab’s' : ''}</h5>
      <div class="cl-list">${list.map(x => `<div class="cl-row${proj.cloud && proj.cloud.id === x.id ? ' on' : ''}"><div><b>${esc(x.name)}</b><small>${new Date(x.updated_at).toLocaleString()} · ${fmtB(x.bytes)}${x.team_id ? ' · lab' : ''}${x.owner !== CL.user.id ? ' · shared by a colleague' : ''}</small></div>
        <div class="acts"><button class="btn small" data-open="${esc(x.id)}">Open</button>${x.owner === CL.user.id ? `<button class="btn small ghost" data-del="${esc(x.id)}">Delete</button>` : ''}</div></div>`).join('') || '<p class="hint">No cloud projects yet.</p>'}</div>`;
    const share = () => { const c = $('#cl-share', m); return c && c.checked && team ? team.id : null; };
    const sv = $('[data-save]', m); if (sv) sv.onclick = async () => { if (await saveToCloud(share())) U.closeModal(); };
    const cp = $('[data-copy]', m); if (cp) cp.onclick = async () => { proj.name = (proj.name || 'Project') + ' (copy)'; delete proj.cloud; if (await saveToCloud(share())) U.closeModal(); };
    const sh = $('#cl-share', m); if (sh && here) sh.onchange = async () => { proj.cloud.teamId = sh.checked ? team.id : null; await pushCloud(false); U.toast(sh.checked ? 'Shared with your lab.' : 'No longer shared.'); };
    m.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      if (!proj.cloud && proj.tables.length && !proj.sample && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Replace current?'; U.toast('Your current project is only in this browser. Click again to replace it, or save it first.'); return; }
      openCloud(b.dataset.open);
    });
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirm delete'; return; }
      try { await CL.remove(b.dataset.del); if (proj.cloud && proj.cloud.id === b.dataset.del) { delete proj.cloud; save(); cloudStatus('', ''); } U.toast('Deleted from the cloud.'); cloudDialog(); } catch (e) { U.toast(e.message); }
    });
  }
  document.addEventListener('bf:auth', () => { if (proj && proj.cloud && CL.user) cloudStatus('Saved to cloud', 'ok'); else if (!CL.user) cloudStatus(CL.enabled && proj && proj.cloud ? 'Signed out' : '', ''); });

  /* ================= boot ================= */
  wireToolbar(); wireCoscientist();
  BF.discover.init(discoverApi);
  $$('[data-disc]').forEach(b => b.onclick = () => { select('discover', b.dataset.disc); document.body.classList.remove('nav-open'); });
  proj = load();
  const q = new URLSearchParams(location.search);
  let imported = null;
  if (q.get('import')) { try { imported = JSON.parse(localStorage.getItem('bf.studio.import') || 'null'); localStorage.removeItem('bf.studio.import'); } catch (e) { imported = null; } }
  if (imported && imported.table && Date.now() - (imported.at || 0) < 10 * 60e3) {
    const clean = sanitize({ name: imported.name, tables: [Object.assign({ id: 'timport', type: 'xy' }, imported.table)], items: (imported.items || []).map((it, i) => ({ id: 'aimport' + i, tableId: 'timport', kind: it.kind, opts: it.opts })) });
    if (clean && clean.tables.length) {
      if (!proj || proj.sample || !proj.tables.length) proj = { name: clean.name, tables: [], items: [] };
      const t = Object.assign(clean.tables[0], { id: uid('t') });
      proj.tables.push(t);
      let first = null;
      clean.items.forEach(it => { const ni = { id: uid('a'), tableId: t.id, kind: it.kind, opts: Object.assign(K[it.kind].defaults(t), it.opts) }; proj.items.push(ni); if (!first) first = ni; });
      history.replaceState(null, '', location.pathname);
      select(first ? 'item' : 'table', first ? first.id : t.id);
    } else if (proj) render();
  } else if (q.get('example') && window.BF_SAMPLES.some(s => s.id === q.get('example'))) {
    proj = null; loadSample(q.get('example'));
    /* ?example=floryfox&run=symreg opens the example with that analysis already added */
    const run = q.get('run'), t0 = proj.tables[0];
    if (run && K[run] && t0 && K[run].types.includes(t0.type)) addItem(t0.id, run);
  }
  else if (BF.discover.views[q.get('discover')]) { if (!proj) proj = { name: 'Untitled project', tables: [], items: [] }; select('discover', q.get('discover')); }
  else if (proj) render();
  else { proj = { name: 'Untitled project', tables: [], items: [] }; render(); startScreen(false); }
  /* charts read the palette when drawn, so redraw the current view when the theme changes */
  document.addEventListener('bf:theme', () => { if (proj) render(); });
  if (q.get('cloud')) { history.replaceState(null, '', location.pathname); setTimeout(() => cloudDialog(), 300); }
  if (q.get('facet')) {
    const TABS = { suggest: 'co-tab-advisor', check: 'co-tab-check', graph: 'co-tab-graph', report: 'co-tab-report', ask: 'co-tab-chat' };
    const id = TABS[q.get('facet')];
    if (id) setTimeout(() => { document.body.classList.add('co-open'); $('#' + id).click(); }, 400);
  }
  window.BF_STUDIO = { get project() { return proj; }, compute, K, advise };
})();
