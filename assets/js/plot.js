/* Benchfit charts: SVG strings with inline attributes, so the same markup serves the
   screen and the exported figure. */
(function (root) {
  'use strict';
  const P = {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

  P.print = {
    bg: '#ffffff', ink: '#111111', muted: '#555555', grid: '#ececec', axis: '#333333',
    series: ['#2a5bd6', '#eb6834', '#1baf7a', '#7a4fc9', '#d55181'], font: 'Arial, Helvetica, sans-serif', size: 13
  };
  P.screen = function () {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    return {
      bg: v('--card') || '#fff', ink: v('--ink'), muted: v('--ink-3'), grid: v('--grid'), axis: v('--axis'),
      series: [1, 2, 3, 4, 5].map(i => v('--s' + i)), font: 'Inter, system-ui, sans-serif', size: 12.5
    };
  };

  P.num = function (v, digits) {
    if (!isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
      const e = Math.floor(Math.log10(a));
      const m = v / Math.pow(10, e);
      return m.toFixed(digits == null ? 2 : Math.max(digits - 1, 0)) + '×10' + String(e).split('').map(c => SUP[c]).join('');
    }
    return Number(v.toPrecision(digits || 3)).toString();
  };

  function niceTicks(lo, hi, count) {
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    const span = hi - lo;
    const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = span / count / step0;
    const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
    const t = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: t, step };
  }
  function decadeLabel(k) {
    if (k >= -3 && k <= 4) return Number(Math.pow(10, k).toPrecision(1)).toString();
    return '10' + String(k).split('').map(c => SUP[c]).join('');
  }
  function logTicks(lo, hi) {
    const major = [], minor = [];
    for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
      if (k >= lo - 1e-9 && k <= hi + 1e-9) major.push({ v: k, label: decadeLabel(k) });
      for (const m of [2, 3, 4, 5, 6, 7, 8, 9]) {
        const v = k + Math.log10(m);
        if (v > lo && v < hi) minor.push(v);
      }
    }
    if (major.length < 2) {
      for (const m of [2, 5]) for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
        const v = k + Math.log10(m);
        if (v >= lo && v <= hi) major.push({ v, label: Number((m * Math.pow(10, k)).toPrecision(1)).toString() });
      }
      major.sort((a, b) => a.v - b.v);
    }
    return { major, minor };
  }

  function legendRow(items, T, x0, y, maxW) {
    let x = x0, row = y, out = '';
    for (const it of items) {
      const w = 26 + it.name.length * T.size * 0.56 + 18;
      if (x + w > x0 + maxW && x > x0) { x = x0; row += 20; }
      out += it.line ? `<line x1="${x}" x2="${x + 18}" y1="${row - 4}" y2="${row - 4}" stroke="${it.color}" stroke-width="2.2"/>` : '';
      out += `<circle cx="${x + 9}" cy="${row - 4}" r="4.2" fill="${it.color}" stroke="${T.bg}" stroke-width="1.5"/>`;
      out += `<text x="${x + 24}" y="${row}" fill="${T.ink}" font-size="${T.size}">${esc(it.name)}</text>`;
      x += w;
    }
    return { svg: out, height: row - y + 8 };
  }

  /* XY chart. spec: {x:{label, log, min, max}, y:{label, min, max}, series:[{name, ci (color index),
     points:[{x, y, err, excl, key}], curve:[[x,y]], band:[[x,lo,hi]]}], vguides:[{x, label, ci}], hguides:[{y, label}]}
     x values are in data units; with x.log the values are log10 already. */
  P.xy = function (spec, T, W, H) {
    const pad = { l: 66, r: 18, t: 14, b: 50 };
    const vis = spec.series.filter(s => !s.hideLegend);
    const items = vis.map(s => ({ name: s.name, color: s.color || T.series[s.ci % T.series.length], line: !!s.curve || !!s.asLine }));
    const leg = vis.length > 1 || (spec.legend && vis.length) ? legendRow(items, T, pad.l, pad.t + 12, W - pad.l - pad.r) : { svg: '', height: 0 };
    pad.t += leg.height + (leg.height ? 6 : 0);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

    let xs = [], ys = [];
    spec.series.forEach(s => {
      s.points.forEach(p => { xs.push(p.x); ys.push(p.y + (p.err || 0)); ys.push(p.y - (p.err || 0)); });
      (s.curve || []).forEach(c => { xs.push(c[0]); });
    });
    let x0 = spec.x.min != null ? spec.x.min : Math.min(...xs), x1 = spec.x.max != null ? spec.x.max : Math.max(...xs);
    if (!spec.x.log && (spec.x.zero === true || (spec.x.zero !== false && x0 >= 0 && x0 < 0.2 * (x1 - x0)))) x0 = Math.min(x0, 0);
    if (spec.x.log) { const m = 0.06 * (x1 - x0 || 1); x0 -= m; x1 += m; }
    else { x1 += 0.04 * (x1 - x0 || 1); }
    let y0 = spec.y.min != null ? spec.y.min : Math.min(...ys), y1 = spec.y.max != null ? spec.y.max : Math.max(...ys);
    spec.series.forEach(s => (s.curve || []).forEach(c => { if (c[1] > y1 && c[1] < y1 + 0.5 * (y1 - y0)) y1 = c[1]; if (c[1] < y0 && c[1] > y0 - 0.5 * (y1 - y0)) y0 = c[1]; }));
    if (spec.y.zero && y0 > 0 && !spec.y.log) y0 = 0;
    const yt = niceTicks(y0 - 0.04 * (y1 - y0), y1 + 0.06 * (y1 - y0), 6);
    if (spec.y.log) { const m = 0.06 * (y1 - y0 || 1); y0 -= m; y1 += m; }
    else { y0 = Math.min(y0, yt.ticks[0]); y1 = Math.max(y1, yt.ticks[yt.ticks.length - 1]); }
    const X = v => pad.l + (v - x0) / (x1 - x0) * iw;
    const Y = v => pad.t + ih - (v - y0) / (y1 - y0) * ih;
    let g = '';
    /* grid and axes */
    if (spec.y.log) {
      const lt = logTicks(y0, y1);
      lt.major.forEach(t => {
        g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="${T.grid}" stroke-width="1"/>`;
        g += `<text x="${pad.l - 9}" y="${Y(t.v) + 4}" text-anchor="end" fill="${T.muted}" font-size="${T.size - 1}">${t.label}</text>`;
      });
      lt.minor.forEach(v => { g += `<line x1="${pad.l - 4}" x2="${pad.l}" y1="${Y(v)}" y2="${Y(v)}" stroke="${T.axis}" stroke-width="1"/>`; });
    } else yt.ticks.forEach(v => {
      g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${T.grid}" stroke-width="1"/>`;
      g += `<text x="${pad.l - 9}" y="${Y(v) + 4}" text-anchor="end" fill="${T.muted}" font-size="${T.size - 1}">${P.num(v, 4)}</text>`;
    });
    if (spec.x.log) {
      const lt = logTicks(x0, x1);
      lt.minor.forEach(v => { g += `<line x1="${X(v)}" x2="${X(v)}" y1="${pad.t + ih}" y2="${pad.t + ih + 4}" stroke="${T.axis}" stroke-width="1"/>`; });
      lt.major.forEach(t => {
        g += `<line x1="${X(t.v)}" x2="${X(t.v)}" y1="${pad.t + ih}" y2="${pad.t + ih + 7}" stroke="${T.axis}" stroke-width="1"/>`;
        g += `<text x="${X(t.v)}" y="${pad.t + ih + 22}" text-anchor="middle" fill="${T.muted}" font-size="${T.size - 1}">${t.label}</text>`;
      });
    } else {
      const xt = niceTicks(x0, x1, 6);
      xt.ticks.filter(v => v >= x0 - 1e-12 && v <= x1 + 1e-12).forEach(v => {
        g += `<line x1="${X(v)}" x2="${X(v)}" y1="${pad.t + ih}" y2="${pad.t + ih + 6}" stroke="${T.axis}" stroke-width="1"/>`;
        g += `<text x="${X(v)}" y="${pad.t + ih + 21}" text-anchor="middle" fill="${T.muted}" font-size="${T.size - 1}">${P.num(v, 4)}</text>`;
      });
    }
    g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<text x="${pad.l + iw / 2}" y="${H - 9}" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(spec.x.label)}</text>`;
    g += `<text transform="translate(16 ${pad.t + ih / 2}) rotate(-90)" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(spec.y.label)}</text>`;

    let clipId = 'c' + Math.random().toString(36).slice(2, 8);
    let d = `<defs><clipPath id="${clipId}"><rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
    (spec.hguides || []).forEach(h => {
      d += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="${T.muted}" stroke-width="1" stroke-dasharray="4 4"/>`;
    });
    spec.series.forEach(s => {
      const c = s.color || T.series[s.ci % T.series.length];
      if (s.band && s.band.length) {
        const top = s.band.map(b => `${X(b[0]).toFixed(1)},${Y(b[2]).toFixed(1)}`);
        const bot = s.band.slice().reverse().map(b => `${X(b[0]).toFixed(1)},${Y(b[1]).toFixed(1)}`);
        d += `<polygon points="${top.concat(bot).join(' ')}" fill="${c}" fill-opacity="0.13" stroke="none"/>`;
      }
    });
    (spec.vguides || []).forEach(v => {
      const c = v.ci != null ? T.series[v.ci % T.series.length] : T.muted;
      d += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${v.y != null ? Y(v.y) : pad.t}" y2="${pad.t + ih}" stroke="${c}" stroke-width="1.1" stroke-dasharray="3 4"/>`;
    });
    spec.series.forEach(s => {
      const c = s.color || T.series[s.ci % T.series.length];
      if (s.curve && s.curve.length) {
        d += `<path d="M${s.curve.map(q => `${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join('L')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"${s.dash ? ' stroke-dasharray="6 5"' : ''}/>`;
      }
    });
    d += '</g>';
    spec.series.forEach((s, si) => {
      const c = s.color || T.series[s.ci % T.series.length];
      if (s.asLine) {
        if (s.points.length) d += `<path d="M${s.points.map(q => `${X(q.x).toFixed(1)} ${Y(q.y).toFixed(1)}`).join('L')}" fill="none" stroke="${c}" stroke-width="${s.width || 1.4}" stroke-linejoin="round"${s.dash ? ' stroke-dasharray="5 4"' : ''} clip-path="url(#${clipId})"/>`;
        return;
      }
      s.points.forEach((p, pi) => {
        const cx = X(p.x), cy = Y(p.y);
        if (p.err) d += `<line x1="${cx}" x2="${cx}" y1="${Y(p.y - p.err)}" y2="${Y(p.y + p.err)}" stroke="${c}" stroke-width="1.4"/><line x1="${cx - 4}" x2="${cx + 4}" y1="${Y(p.y - p.err)}" y2="${Y(p.y - p.err)}" stroke="${c}" stroke-width="1.4"/><line x1="${cx - 4}" x2="${cx + 4}" y1="${Y(p.y + p.err)}" y2="${Y(p.y + p.err)}" stroke="${c}" stroke-width="1.4"/>`;
        const shape = s.shape || si % 3;
        const r = 4.6;
        const fill = p.excl ? T.bg : c, stroke = p.excl ? T.muted : T.bg;
        const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${p.excl ? 1.4 : 1.5}" data-s="${si}" data-p="${pi}" data-xy="${p.x},${p.y}"${p.label ? ` data-l="${esc(p.label)}"` : ''} class="pt"`;
        if (shape === 1) d += `<rect x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" ${attrs}/>`;
        else if (shape === 2) d += `<path d="M${cx} ${cy - r * 1.15}L${cx + r * 1.05} ${cy + r * 0.75}L${cx - r * 1.05} ${cy + r * 0.75}Z" ${attrs}/>`;
        else d += `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`;
      });
    });
    (spec.vguides || []).forEach(v => {
      if (!v.label) return;
      const c = v.ci != null ? T.series[v.ci % T.series.length] : T.muted;
      d += `<text x="${X(v.x) + 5}" y="${pad.t + ih - 7}" fill="${c}" font-size="${T.size - 1.5}">${esc(v.label)}</text>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${T.font}"><rect width="${W}" height="${H}" fill="${T.bg}"/>${leg.svg}${g}${d}</svg>`;
    return { svg, X, Y, logx: !!spec.x.log, logy: !!spec.y.log, inv: { x: px => x0 + (px - pad.l) / iw * (x1 - x0), y: py => y0 + (pad.t + ih - py) / ih * (y1 - y0) } };
  };

  /* Categorical dot plot on a log2 axis (qPCR fold change).
     spec: {groups:[...], series:[{name, ci, cells:{group:{mean, lo, hi, pts:[...]}}}], y:{label}, ref: 1} */
  P.cat = function (spec, T, W, H) {
    const pad = { l: 66, r: 18, t: 14, b: 50 };
    const items = spec.series.map(s => ({ name: s.name, color: T.series[s.ci % T.series.length] }));
    const leg = legendRow(items, T, pad.l, pad.t + 12, W - pad.l - pad.r);
    pad.t += leg.height + 6;
    const longest = Math.max(...spec.groups.map(g => g.length));
    const rotate = longest * 7 * spec.groups.length > W - pad.l - pad.r;
    if (rotate) pad.b += Math.min(longest * 5, 70);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vals = [];
    spec.series.forEach(s => Object.values(s.cells).forEach(c => { vals.push(c.mean); if (isFinite(c.lo)) vals.push(c.lo, c.hi); c.pts.forEach(v => vals.push(v)); }));
    const L = vals.filter(v => v > 0).map(Math.log2);
    let y0 = Math.floor(Math.min(0, ...L) - 0.3), y1 = Math.ceil(Math.max(0, ...L) + 0.3);
    if (y1 - y0 < 2) { y0 -= 1; y1 += 1; }
    const X = (gi, si) => pad.l + (gi + 0.5) * iw / spec.groups.length + (si - (spec.series.length - 1) / 2) * Math.min(26, iw / spec.groups.length / (spec.series.length + 1));
    const Y = v => pad.t + ih - (Math.log2(v) - y0) / (y1 - y0) * ih;
    let g = '';
    const step = Math.max(1, Math.ceil((y1 - y0) / 8));
    for (let k = y0; k <= y1; k += step) {
      const v = Math.pow(2, k);
      g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${k === 0 ? T.muted : T.grid}" stroke-width="1"${k === 0 ? ' stroke-dasharray="4 4"' : ''}/>`;
      g += `<text x="${pad.l - 9}" y="${Y(v) + 4}" text-anchor="end" fill="${T.muted}" font-size="${T.size - 1}">${P.num(v, 3)}</text>`;
    }
    spec.groups.forEach((grp, gi) => {
      const x = X(gi, (spec.series.length - 1) / 2);
      if (rotate) g += `<text transform="translate(${x + 4} ${pad.t + ih + 14}) rotate(-35)" text-anchor="end" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(grp)}</text>`;
      else g += `<text x="${x}" y="${pad.t + ih + 21}" text-anchor="middle" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(grp)}</text>`;
    });
    g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<text transform="translate(16 ${pad.t + ih / 2}) rotate(-90)" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(spec.y.label)}</text>`;
    let d = '';
    spec.series.forEach((s, si) => {
      const c = T.series[s.ci % T.series.length];
      spec.groups.forEach((grp, gi) => {
        const cell = s.cells[grp];
        if (!cell) return;
        const x = X(gi, si);
        cell.pts.forEach((v, k) => {
          const jx = x + ((k % 3) - 1) * 3.2;
          d += `<circle cx="${jx}" cy="${Y(v)}" r="3" fill="${c}" fill-opacity="0.45" stroke="none"/>`;
        });
        if (isFinite(cell.lo) && isFinite(cell.hi)) d += `<line x1="${x}" x2="${x}" y1="${Y(cell.lo)}" y2="${Y(cell.hi)}" stroke="${c}" stroke-width="1.6"/>`;
        d += `<line x1="${x - 9}" x2="${x + 9}" y1="${Y(cell.mean)}" y2="${Y(cell.mean)}" stroke="${c}" stroke-width="3" stroke-linecap="round" class="pt" data-s="${si}" data-g="${gi}"/>`;
        if (cell.mark) d += `<text x="${x}" y="${Math.min(Y(cell.hi || cell.mean), Y(Math.max(...cell.pts, cell.mean))) - 8}" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(cell.mark)}</text>`;
      });
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${T.font}"><rect width="${W}" height="${H}" fill="${T.bg}"/>${leg.svg}${g}${d}</svg>`;
    return { svg, X, Y };
  };

  /* Column scatter (dot) plot with mean and error bar per group and significance brackets.
     spec: {groups:[{name, v:[...]}], y:{label}, err:'sd'|'sem'|'ci', brackets:[{i, j, text}]} */
  P.col = function (spec, T, W, H) {
    const pad = { l: 66, r: 16, t: 18, b: 46 };
    const G = spec.groups;
    const longest = Math.max(...G.map(g => g.name.length));
    const rotate = longest * 7.2 * G.length > W - pad.l - pad.r;
    if (rotate) pad.b += Math.min(longest * 5.2, 80);
    const nb = (spec.brackets || []).length;
    pad.t += Math.min(nb, 6) * 18;
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const all = [].concat(...G.map(g => g.v));
    let y0 = Math.min(...all), y1 = Math.max(...all);
    if (spec.y.zero !== false && y0 > 0 && y0 < 0.6 * y1) y0 = 0;
    const nt = niceTicks(y0 - 0.04 * (y1 - y0), y1 + 0.05 * (y1 - y0), 6);
    y0 = Math.min(y0, nt.ticks[0]); y1 = Math.max(y1, nt.ticks[nt.ticks.length - 1]);
    const Y = v => pad.t + ih - (v - y0) / (y1 - y0) * ih;
    const bw = iw / G.length;
    const X = i => pad.l + (i + 0.5) * bw;
    let g = '';
    nt.ticks.forEach(v => {
      g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${T.grid}"/>`;
      g += `<text x="${pad.l - 9}" y="${Y(v) + 4}" text-anchor="end" fill="${T.muted}" font-size="${T.size - 1}">${P.num(v, 4)}</text>`;
    });
    g += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ih}" stroke="${T.axis}" stroke-width="1.2"/>`;
    g += `<text transform="translate(16 ${pad.t + ih / 2}) rotate(-90)" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(spec.y.label)}</text>`;
    G.forEach((grp, i) => {
      const c = T.series[i % T.series.length];
      const x = X(i);
      if (rotate) g += `<text transform="translate(${x + 4} ${pad.t + ih + 14}) rotate(-35)" text-anchor="end" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(grp.name)}</text>`;
      else g += `<text x="${x}" y="${pad.t + ih + 20}" text-anchor="middle" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(grp.name)}</text>`;
      const n = grp.v.length;
      if (!n) return;
      const m = grp.v.reduce((s, v) => s + v, 0) / n;
      const sd = n > 1 ? Math.sqrt(grp.v.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)) : 0;
      const e = spec.err === 'sem' ? sd / Math.sqrt(n) : spec.err === 'ci' ? (n > 1 ? 1.96 * sd / Math.sqrt(n) : 0) : sd;
      if (spec.style === 'bar') g += `<rect x="${x - bw * 0.28}" y="${Math.min(Y(m), Y(Math.max(y0, 0)))}" width="${bw * 0.56}" height="${Math.abs(Y(Math.max(y0, 0)) - Y(m))}" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="1.4" rx="3"/>`;
      /* beeswarm-ish jitter */
      const sortedV = grp.v.map((v, k) => [v, k]).sort((a, b) => a[0] - b[0]);
      const placed = [];
      sortedV.forEach(([v]) => {
        const cy = Y(v);
        let off = 0, step = 0;
        while (placed.some(p => Math.abs(p.y - cy) < 7.5 && Math.abs(p.x - off) < 7.5)) { step++; off = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 6.5; }
        placed.push({ x: off, y: cy });
        g += `<circle cx="${x + Math.max(-bw * 0.35, Math.min(bw * 0.35, off))}" cy="${cy}" r="4.2" fill="${c}" fill-opacity="0.75" stroke="${T.bg}" stroke-width="1.2" class="pt" data-g="${i}" data-v="${v}"/>`;
      });
      g += `<line x1="${x - bw * 0.22}" x2="${x + bw * 0.22}" y1="${Y(m)}" y2="${Y(m)}" stroke="${T.ink}" stroke-width="2.2" stroke-linecap="round"/>`;
      if (e > 0) g += `<line x1="${x}" x2="${x}" y1="${Y(m - e)}" y2="${Y(m + e)}" stroke="${T.ink}" stroke-width="1.4"/><line x1="${x - 7}" x2="${x + 7}" y1="${Y(m - e)}" y2="${Y(m - e)}" stroke="${T.ink}" stroke-width="1.4"/><line x1="${x - 7}" x2="${x + 7}" y1="${Y(m + e)}" y2="${Y(m + e)}" stroke="${T.ink}" stroke-width="1.4"/>`;
    });
    (spec.brackets || []).slice(0, 6).forEach((b, k) => {
      const yb = pad.t - 12 - k * 18;
      const x1 = X(b.i), x2 = X(b.j);
      g += `<path d="M${x1} ${yb + 6}V${yb}H${x2}V${yb + 6}" fill="none" stroke="${T.ink}" stroke-width="1.1"/>`;
      g += `<text x="${(x1 + x2) / 2}" y="${yb - 3}" text-anchor="middle" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(b.text)}</text>`;
    });
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${T.font}"><rect width="${W}" height="${H}" fill="${T.bg}"/>${g}</svg>` };
  };

  /* Horizontal bars. spec: {items:[{name, v, lo, hi}], x:{label}, ci: color index} */
  P.bars = function (spec, T, W, H) {
    const items = spec.items;
    const lw = Math.min(200, 12 + Math.max(...items.map(i => String(i.name).length)) * 7);
    const pad = { l: lw, r: 22, t: 12, b: 44 };
    H = Math.max(H || 0, pad.t + pad.b + items.length * 26);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vals = [].concat(...items.map(i => [i.v, i.lo, i.hi].filter(isFinite)));
    let x0 = Math.min(0, ...vals), x1 = Math.max(0, ...vals);
    const nt = niceTicks(x0, x1 + 0.04 * (x1 - x0 || 1), 5);
    x0 = Math.min(x0, nt.ticks[0]); x1 = Math.max(x1, nt.ticks[nt.ticks.length - 1]);
    const X = v => pad.l + (v - x0) / (x1 - x0) * iw;
    const bh = ih / items.length;
    let g = '';
    nt.ticks.forEach(v => {
      g += `<line x1="${X(v)}" x2="${X(v)}" y1="${pad.t}" y2="${pad.t + ih}" stroke="${v === 0 ? T.axis : T.grid}"/>`;
      g += `<text x="${X(v)}" y="${pad.t + ih + 18}" text-anchor="middle" fill="${T.muted}" font-size="${T.size - 1}">${P.num(v, 3)}</text>`;
    });
    items.forEach((it, i) => {
      const c = T.series[(it.ci != null ? it.ci : spec.ci || 0) % T.series.length];
      const y = pad.t + i * bh;
      g += `<text x="${pad.l - 8}" y="${y + bh / 2 + 4}" text-anchor="end" fill="${T.ink}" font-size="${T.size - 0.5}">${esc(it.name)}</text>`;
      g += `<rect x="${Math.min(X(0), X(it.v))}" y="${y + bh * 0.2}" width="${Math.max(Math.abs(X(it.v) - X(0)), 1)}" height="${bh * 0.6}" fill="${c}" rx="3"/>`;
      if (isFinite(it.lo) && isFinite(it.hi)) g += `<line x1="${X(it.lo)}" x2="${X(it.hi)}" y1="${y + bh / 2}" y2="${y + bh / 2}" stroke="${T.ink}" stroke-width="1.3"/>`;
    });
    g += `<text x="${pad.l + iw / 2}" y="${H - 8}" text-anchor="middle" fill="${T.ink}" font-size="${T.size}">${esc(spec.x.label)}</text>`;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${T.font}"><rect width="${W}" height="${H}" fill="${T.bg}"/>${g}</svg>`, H };
  };

  /* Heatmap of a square matrix in [-1, 1] (correlations). */
  P.heat = function (spec, T, W) {
    const n = spec.names.length;
    const lw = Math.min(150, 12 + Math.max(...spec.names.map(s => s.length)) * 6.8);
    const cell = Math.max(22, Math.min(64, (W - lw - 70) / n));
    const H = lw * 0.15 + cell * n + 80;
    const mix = (a, b, t) => { const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    const neutral = T.bg === '#ffffff' || /^#f/i.test(T.bg) ? '#f1f2f4' : '#2a3040';
    const col = v => (v >= 0 ? mix(neutral, T.series[0], Math.min(1, v)) : mix(neutral, T.series[1], Math.min(1, -v)));
    let g = '';
    const top = 12;
    spec.names.forEach((nm, i) => {
      g += `<text x="${lw - 8}" y="${top + i * cell + cell / 2 + 4}" text-anchor="end" fill="${T.ink}" font-size="${T.size - 1}">${esc(nm)}</text>`;
      g += `<text transform="translate(${lw + i * cell + cell / 2 + 4} ${top + n * cell + 8}) rotate(-40)" text-anchor="end" fill="${T.ink}" font-size="${T.size - 1}">${esc(nm)}</text>`;
      spec.m[i].forEach((v, j) => {
        g += `<rect x="${lw + j * cell}" y="${top + i * cell}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${col(v)}" class="pt" data-i="${i}" data-j="${j}"/>`;
        if (cell >= 30) g += `<text x="${lw + j * cell + cell / 2 - 1}" y="${top + i * cell + cell / 2 + 4}" text-anchor="middle" fill="${Math.abs(v) > 0.6 ? '#fff' : T.ink}" font-size="${Math.min(T.size - 1, cell / 3)}">${v.toFixed(2)}</text>`;
      });
    });
    /* colour bar */
    const bx = lw + n * cell + 18, bh = cell * n;
    for (let k = 0; k < 40; k++) { const v = 1 - 2 * k / 39; g += `<rect x="${bx}" y="${top + k * bh / 40}" width="12" height="${bh / 40 + 0.5}" fill="${col(v)}"/>`; }
    g += `<text x="${bx + 16}" y="${top + 9}" fill="${T.muted}" font-size="${T.size - 2}">+1</text><text x="${bx + 16}" y="${top + bh / 2 + 4}" fill="${T.muted}" font-size="${T.size - 2}">0</text><text x="${bx + 16}" y="${top + bh}" fill="${T.muted}" font-size="${T.size - 2}">−1</text>`;
    const Wt = Math.max(W, bx + 40);
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wt} ${H}" width="${Wt}" height="${H}" font-family="${T.font}"><rect width="${Wt}" height="${H}" fill="${T.bg}"/>${g}</svg>`, H };
  };

  root.BF.plot = P;
})(typeof window !== 'undefined' ? window : globalThis);
