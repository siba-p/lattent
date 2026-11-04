/* Lab file formats → Lattent tables. Each reader returns
   { kind: 'xy', name, cols, rows, ylabel, meta } or { kind: 'structure', name, structure, meta }.
   Readers: delimited text (.csv .txt .dat .xy .asc .tsv .prn), JCAMP-DX (.jdx .dx, AFFN and
   ASDF-compressed), PANalytical .xrdml, Rigaku .ras, Bruker .uxd, Thermo/Galactic .spc,
   crystallographic .cif (expanded by its symmetry operations) and Excel .xlsx workbooks, which
   return { kind: 'book', name, sheets: [xy tables] }. Works in browsers and Node. */
(function (root) {
  'use strict';
  const F = {};
  (root.BF = root.BF || {}).formats = F;
  const num = s => { const v = parseFloat(String(s).replace(/\(\d+\)$/, '')); return v; };
  const base = n => String(n || 'data').replace(/\.[^.]+$/, '');
  const decode = buf => (typeof buf === 'string' ? buf : new TextDecoder('utf-8').decode(buf));

  /* ---------- delimited text ---------- */
  F.text = function (text, name) {
    const lines = decode(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !/^[#;!%]/.test(l));
    if (!lines.length) throw new Error('The file is empty.');
    const sample = lines.slice(0, 20).join('\n');
    const delim = sample.includes('\t') ? /\t/ : /;/.test(sample) ? /;/ : /,/.test(sample) && !/\d,\d+\s*[,\t ]/.test(sample.replace(/,/g, ', ')) ? /\s*,\s*/ : /\s+/;
    const decComma = delim.source === ';' || (delim.source === '\\t' && /\d,\d/.test(sample) && !/\d\.\d/.test(sample));
    const split = l => l.split(delim).map(c => c.trim()).filter((c, i, a) => c !== '' || i < a.length - 1);
    const isNum = c => c !== '' && isFinite(Number(decComma ? c.replace(',', '.') : c));
    let header = null;
    const rows = [];
    lines.forEach(l => {
      const c = split(l);
      if (c.length >= 2 && c.filter(isNum).length >= Math.max(2, c.length - 1)) rows.push(c.map(v => (decComma ? v.replace(',', '.') : v)));
      else if (!rows.length && c.length >= 2) header = c;
    });
    if (rows.length < 2) throw new Error('No columns of numbers were found.');
    const w = Math.max(...rows.map(r => r.length));
    const cols = header && header.length >= w ? header.slice(0, w) : ['X'].concat(Array.from({ length: w - 1 }, (_, i) => (w > 2 ? 'Y' + (i + 1) : 'Y')));
    return { kind: 'xy', name: base(name), cols, rows, meta: {} };
  };

  /* ---------- JCAMP-DX ---------- */
  const SQZ = { '@': 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, a: -1, b: -2, c: -3, d: -4, e: -5, f: -6, g: -7, h: -8, i: -9 };
  const DIF = { '%': 0, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, j: -1, k: -2, l: -3, m: -4, n: -5, o: -6, p: -7, q: -8, r: -9 };
  const DUP = { S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8, s: 9 };
  /* decode one ASDF line into [x, y1, y2, …]; DIF values are differences from the previous y */
  function asdfLine(line) {
    const out = [];
    let i = 0, mode = null, cur = '';
    const flush = () => {
      if (cur === '') return;
      const v = parseFloat(cur);
      if (mode === 'dif') out.push({ dif: v }); else out.push({ abs: v });
      cur = ''; mode = null;
    };
    while (i < line.length) {
      const ch = line[i];
      if (ch in SQZ) { flush(); mode = 'abs'; cur = String(SQZ[ch]); }
      else if (ch in DIF) { flush(); mode = 'dif'; cur = String(DIF[ch]); }
      else if (ch in DUP) { flush(); let d = String(DUP[ch]); while (i + 1 < line.length && /\d/.test(line[i + 1])) d += line[++i]; out.push({ dup: +d }); }
      else if (/[\d.]/.test(ch)) { if (mode === null) mode = 'abs'; cur += ch; }
      else if (ch === '-' || ch === '+') { flush(); mode = 'abs'; cur = ch === '-' ? '-' : ''; }
      else flush();
      i++;
    }
    flush();
    const vals = [];
    let last = null, lastTok = null;
    out.forEach(t => {
      if (t.abs != null) { vals.push(t.abs); last = t.abs; lastTok = t; }
      else if (t.dif != null) { last = last + t.dif; vals.push(last); lastTok = t; }
      else if (t.dup) { for (let k = 1; k < t.dup; k++) { if (lastTok && lastTok.dif != null) last = last + lastTok.dif; vals.push(last); } }
    });
    return { vals, endsDif: lastTok && lastTok.dif != null };
  }
  F.jcamp = function (text, name) {
    const s = decode(text).replace(/\r/g, '');
    const lab = {};
    s.split('\n').forEach(l => { const m = l.match(/^##([^=]+)=\s*(.*)$/); if (m) lab[m[1].trim().toUpperCase().replace(/[\s_-]/g, '')] = m[2].trim(); });
    const xf = +(lab.XFACTOR || 1), yf = +(lab.YFACTOR || 1);
    const xu = lab.XUNITS || 'X', yu = lab.YUNITS || 'Y', title = lab.TITLE || base(name);
    const block = (tag) => { const m = s.match(new RegExp('##' + tag + '=[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)', 'i')); return m ? m[1] : null; };
    let pts = [];
    const xy = block('XYDATA');
    if (xy != null) {
      const first = +lab.FIRSTX * 1, last = +lab.LASTX * 1, n = +lab.NPOINTS;
      const ys = [], lineX = [];
      let prevDif = false;
      xy.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
        const { vals, endsDif } = asdfLine(l);
        if (vals.length < 2) return;
        let yv = vals.slice(1);
        if (prevDif && ys.length) yv = yv.slice(1);          // repeated check value after a DIF line
        yv.forEach(y => { ys.push(y * yf); lineX.push(vals[0] * xf); });
        prevDif = endsDif;
      });
      const m = n && ys.length > n ? n : ys.length;
      const dx = isFinite(first) && isFinite(last) && m > 1 ? (last - first) / (m - 1) : null;
      for (let k = 0; k < m; k++) pts.push([dx != null ? first + k * dx : lineX[k], ys[k]]);
    } else {
      const p = block('XYPOINTS') || block('PEAKTABLE');
      if (p == null) throw new Error('This JCAMP-DX file has no XYDATA, XYPOINTS or PEAK TABLE block.');
      p.split(/[;\n]/).forEach(l => { const v = l.trim().split(/[\s,]+/).map(Number); if (v.length >= 2 && v.every(isFinite)) pts.push([v[0] * xf, v[1] * yf]); });
    }
    if (pts.length < 2) throw new Error('No data points were found in the JCAMP-DX file.');
    return { kind: 'xy', name: title, cols: [xu, yu], rows: pts.map(r => r.map(v => String(+v.toPrecision(8)))), ylabel: yu, meta: { format: 'JCAMP-DX' } };
  };

  /* ---------- PANalytical XRDML ---------- */
  F.xrdml = function (text, name) {
    const s = decode(text);
    const pos = s.match(/<positions[^>]*axis="2Theta"[^>]*>([\s\S]*?)<\/positions>/i);
    const ints = s.match(/<(intensities|counts)[^>]*>([\s\S]*?)<\/\1>/i);
    if (!pos || !ints) throw new Error('No 2θ scan was found in the XRDML file.');
    const y = ints[2].trim().split(/\s+/).map(Number);
    let x;
    const list = pos[1].match(/<listPositions>([\s\S]*?)<\/listPositions>/i);
    if (list) x = list[1].trim().split(/\s+/).map(Number);
    else {
      const a = +(pos[1].match(/<startPosition>([^<]+)/i) || [])[1], b = +(pos[1].match(/<endPosition>([^<]+)/i) || [])[1];
      x = y.map((_, i) => a + (b - a) * i / Math.max(1, y.length - 1));
    }
    const ct = +((s.match(/<commonCountingTime[^>]*>([^<]+)/i) || [])[1] || 0);
    const lam = +((s.match(/<kAlpha1[^>]*>([^<]+)/i) || [])[1] || 0);
    const unit = ints[1].toLowerCase() === 'counts' ? 'counts' : ((ints[0].match(/unit="([^"]+)"/) || [])[1] || 'counts');
    return { kind: 'xy', name: base(name), cols: ['2θ (°)', `Intensity (${unit})`], rows: x.map((v, i) => [String(+v.toFixed(5)), String(y[i])]).filter(r => isFinite(+r[1])), ylabel: `Intensity (${unit})`, meta: { format: 'XRDML', lambda: lam || null, countingTime: ct || null } };
  };

  /* ---------- Rigaku RAS ---------- */
  F.ras = function (text, name) {
    const s = decode(text).replace(/\r/g, '');
    const m = s.match(/\*RAS_INT_START\s*\n([\s\S]*?)\n\*RAS_INT_END/);
    if (!m) throw new Error('No intensity block (*RAS_INT_START) was found in the RAS file.');
    const rows = m[1].split('\n').map(l => l.trim().split(/\s+/)).filter(r => r.length >= 2 && isFinite(+r[0]) && isFinite(+r[1])).map(r => [r[0], r[1]]);
    const lam = +((s.match(/\*HW_XG_WAVE_LENGTH_ALPHA1\s+"?([\d.]+)/) || [])[1] || 0);
    return { kind: 'xy', name: base(name), cols: ['2θ (°)', 'Intensity (counts)'], rows, ylabel: 'Intensity (counts)', meta: { format: 'RAS', lambda: lam || null } };
  };

  /* ---------- Bruker UXD ---------- */
  F.uxd = function (text, name) {
    const lines = decode(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
    const key = {}; const data = [];
    lines.forEach(l => { const m = l.match(/^_([A-Z0-9_]+)\s*=\s*(.+)$/i); if (m) key[m[1].toUpperCase()] = m[2].trim(); else if (/^[-\d.]/.test(l)) data.push(l.split(/[\s,]+/).map(Number).filter(isFinite)); });
    if (!data.length) throw new Error('No data were found in the UXD file.');
    let rows;
    if (data.every(r => r.length === 2) && data.length > 2 && data[1][0] > data[0][0]) rows = data.map(r => [String(r[0]), String(r[1])]);
    else {
      const start = +(key.START || key['2THETA'] || 0), step = +(key.STEPSIZE || 0.02);
      const ys = [].concat(...data);
      rows = ys.map((y, i) => [String(+(start + i * step).toFixed(5)), String(y)]);
    }
    return { kind: 'xy', name: base(name), cols: ['2θ (°)', 'Intensity (counts)'], rows, ylabel: 'Intensity (counts)', meta: { format: 'UXD' } };
  };

  /* ---------- Thermo/Galactic SPC (new format, single or first subfile) ---------- */
  const SPC_X = { 0: 'Arbitrary', 1: 'Wavenumber (cm⁻¹)', 2: 'Wavelength (µm)', 3: 'Wavelength (nm)', 4: 'Time (s)', 5: 'Time (min)', 6: 'Frequency (Hz)', 7: 'Frequency (kHz)', 8: 'Frequency (MHz)', 9: 'm/z', 10: 'Chemical shift (ppm)', 11: 'Time (days)', 12: 'Time (years)', 13: 'Raman shift (cm⁻¹)', 14: 'Energy (eV)', 16: 'Diode number', 17: 'Channel', 18: 'Degrees', 19: 'Temperature (°F)', 20: 'Temperature (°C)', 21: 'Temperature (K)', 22: 'Data points', 23: 'Time (ms)', 24: 'Time (µs)', 25: 'Time (ns)', 26: 'Frequency (GHz)', 27: 'Length (cm)', 28: 'Length (m)', 29: 'Length (mm)', 30: 'Time (h)' };
  const SPC_Y = { 0: 'Intensity', 1: 'Interferogram', 2: 'Absorbance', 3: 'Kubelka–Munk', 4: 'Counts', 5: 'Voltage (V)', 6: 'Angle (°)', 7: 'Current (mA)', 8: 'Length (mm)', 9: 'Voltage (mV)', 10: 'log(1/R)', 11: 'Percent', 12: 'Intensity', 13: 'Relative intensity', 14: 'Energy', 16: 'Decibel', 19: 'Temperature (°F)', 20: 'Temperature (°C)', 21: 'Temperature (K)', 22: 'Refractive index', 23: 'Extinction coefficient', 24: 'Real', 25: 'Imaginary', 26: 'Complex', 128: 'Transmission', 129: 'Reflectance', 130: 'Arbitrary', 131: 'Emission' };
  F.spc = function (buf, name) {
    if (typeof buf === 'string') throw new Error('SPC files are binary; open them as files.');
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    if (dv.byteLength < 512) throw new Error('The SPC file is too short.');
    const flags = dv.getUint8(0), ver = dv.getUint8(1);
    if (ver !== 0x4B) throw new Error(ver === 0x4D ? 'Old-format SPC files are not supported; re-save as new-format SPC or export CSV.' : 'This SPC variant is not supported; export CSV or JCAMP-DX from your instrument software.');
    const fexp = dv.getInt8(3), n = dv.getInt32(4, true), first = dv.getFloat64(8, true), last = dv.getFloat64(16, true);
    const xt = dv.getUint8(28), yt = dv.getUint8(29);
    if (!(n > 1 && n < 5e7)) throw new Error('The SPC header is not valid.');
    let off = 512, xs;
    if (flags & 0x80) { xs = Array.from({ length: n }, (_, i) => dv.getFloat32(off + 4 * i, true)); off += 4 * n; }
    else xs = Array.from({ length: n }, (_, i) => first + (last - first) * i / (n - 1));
    const sexp = dv.getInt8(off + 1); const e = (flags & 0x01) ? sexp : fexp;  // subfile header 32 bytes
    off += 32;
    const ys = Array.from({ length: n }, (_, i) => (e === -128 ? dv.getFloat32(off + 4 * i, true) : dv.getInt32(off + 4 * i, true) * Math.pow(2, e - 32)));
    return { kind: 'xy', name: base(name), cols: [SPC_X[xt] || 'X', SPC_Y[yt] || 'Y'], rows: xs.map((x, i) => [String(+x.toPrecision(8)), String(+ys[i].toPrecision(8))]), ylabel: SPC_Y[yt] || 'Y', meta: { format: 'SPC' } };
  };

  /* ---------- CIF: cell, atoms and symmetry operations → full unit cell ---------- */
  function parseOp(op) {
    return op.replace(/['"\s]/g, '').toLowerCase().split(',').map(e => {
      const r = [0, 0, 0, 0];
      (e.match(/[+-]?[^+-]+/g) || []).forEach(t => {
        const sign = t[0] === '-' ? -1 : 1, b = t.replace(/^[+-]/, '');
        const m = b.match(/^(\d*\.?\d*(?:\/\d+)?)\*?([xyz])$/);
        if (m) { const c = m[1] ? (m[1].includes('/') ? m[1].split('/').reduce((a2, b2) => a2 / b2) : +m[1]) : 1; r['xyz'.indexOf(m[2])] += sign * c; }
        else r[3] += sign * (b.includes('/') ? b.split('/').map(Number).reduce((a2, b2) => a2 / b2) : +b);
      });
      return r;
    });
  }
  function cifLoops(s) {
    const lines = s.replace(/\r/g, '').split('\n');
    const loops = [], items = {};
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (/^loop_/i.test(l)) {
        const tags = []; i++;
        while (i < lines.length && /^_/.test(lines[i].trim())) tags.push(lines[i++].trim().split(/\s+/)[0].toLowerCase());
        const vals = [];
        while (i < lines.length && lines[i].trim() && !/^(loop_|_|data_)/i.test(lines[i].trim())) { vals.push(...(lines[i].trim().match(/'[^']*'|"[^"]*"|\S+/g) || [])); i++; }
        i--;
        const rows = []; for (let k = 0; k + tags.length <= vals.length; k += tags.length) rows.push(Object.fromEntries(tags.map((t, j) => [t, vals[k + j].replace(/^['"]|['"]$/g, '')])));
        loops.push({ tags, rows });
      } else { const m = l.match(/^(_\S+)\s+(.+)$/); if (m) items[m[1].toLowerCase()] = m[2].replace(/^['"]|['"]$/g, '').trim(); }
    }
    return { loops, items };
  }
  F.cif = function (text, name) {
    const { loops, items } = cifLoops(decode(text));
    const a = num(items._cell_length_a), b = num(items._cell_length_b), c = num(items._cell_length_c);
    const al = num(items._cell_angle_alpha || 90), be = num(items._cell_angle_beta || 90), ga = num(items._cell_angle_gamma || 90);
    if (![a, b, c].every(v => v > 0)) throw new Error('The CIF has no unit cell.');
    const atoms = loops.find(L => L.tags.includes('_atom_site_fract_x'));
    if (!atoms) throw new Error('The CIF has no atom positions.');
    const symL = loops.find(L => L.tags.some(t => /_(symmetry_equiv_pos_as_xyz|space_group_symop_operation_xyz)$/.test(t)));
    const opTag = symL ? symL.tags.find(t => /xyz$/.test(t)) : null;
    const ops = (symL ? symL.rows.map(r => r[opTag]) : ['x,y,z']).map(parseOp);
    const rad = Math.PI / 180, ca = Math.cos(al * rad), cb = Math.cos(be * rad), cg = Math.cos(ga * rad), sg = Math.sin(ga * rad);
    const L = [[a, 0, 0], [b * cg, b * sg, 0], [c * cb, c * (ca - cb * cg) / sg, c * Math.sqrt(Math.max(0, 1 - cb * cb - ((ca - cb * cg) / sg) ** 2))]];
    const pos = [], sp = [], occ = [];
    atoms.rows.forEach(r => {
      const el = String(r._atom_site_type_symbol || r._atom_site_label || '').match(/^[A-Z][a-z]?/);
      if (!el) return;
      const f0 = [num(r._atom_site_fract_x), num(r._atom_site_fract_y), num(r._atom_site_fract_z)];
      if (!f0.every(isFinite)) return;
      const o = r._atom_site_occupancy != null ? num(r._atom_site_occupancy) : 1;
      const mine = [];
      ops.forEach(op => {
        const f = op.map(q => { let v = q[0] * f0[0] + q[1] * f0[1] + q[2] * f0[2] + q[3]; v -= Math.floor(v); return v > 1 - 1e-4 ? 0 : v; });
        if (mine.some(g => g.every((v, k) => { const d = Math.abs(v - f[k]); return d < 1e-3 || d > 1 - 1e-3; }))) return;
        mine.push(f);
      });
      mine.forEach(f => { pos.push([0, 1, 2].map(j => f[0] * L[0][j] + f[1] * L[1][j] + f[2] * L[2][j])); sp.push(el[0]); occ.push(isFinite(o) ? o : 1); });
    });
    if (!pos.length) throw new Error('No atoms could be placed from the CIF.');
    const sgNum = parseInt(items._symmetry_int_tables_number || items._space_group_it_number || '0', 10) || null;
    const formula = String(items._chemical_formula_sum || items._chemical_formula_structural || base(name)).replace(/\s+/g, '').replace(/(^|[A-Z][a-z]?)1(?![0-9.])/g, '$1');
    return { kind: 'structure', name: base(name), structure: { lattice: L, positions: pos, species: sp, occ }, meta: { format: 'CIF', spacegroup: sgNum, formula, ops: ops.length, cell: { a, b, c, alpha: al, beta: be, gamma: ga } } };
  };

  /* ---------- Excel workbooks (.xlsx, .xlsm): a zip of XML parts ---------- */
  const XLSX_MAX = 60e6;                       // bytes unpacked per part: refuses zip bombs
  const u8of = buf => (buf instanceof Uint8Array ? buf : new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open Excel files. Update it, or save the sheet as CSV.');
    const rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (n > XLSX_MAX) { rd.cancel(); throw new Error('The workbook is too large to open here. Save the sheet as CSV.'); }
      parts.push(value);
    }
    const out = new Uint8Array(n); let o = 0;
    parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  /* the zip's central directory lists every part with its compressed size and offset */
  function unzip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This is not a readable .xlsx workbook. Open it in Excel and save it again as .xlsx or CSV.');
    const parts = {};
    let p = dv.getUint32(e + 16, true);
    for (let k = dv.getUint16(e + 10, true); k > 0 && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; k--) {
      const nl = dv.getUint16(p + 28, true);
      parts[new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl))] = { flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }
    return async function read(name) {
      const f = parts[name];
      if (!f) return null;
      if (f.flags & 1) throw new Error('The workbook is password-protected. Remove the password in Excel, or save the sheet as CSV.');
      if (f.off + 30 > u8.length || dv.getUint32(f.off, true) !== 0x04034b50) throw new Error('The workbook is damaged.');
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.size);
      const out = f.method === 0 ? raw : f.method === 8 ? await inflateRaw(raw) : null;
      if (!out) throw new Error('The workbook uses a compression method that cannot be read here. Save it again from Excel.');
      /* tag prefixes (x:row, x:c) appear in files written by some libraries */
      return new TextDecoder('utf-8').decode(out).replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1');
    };
  }
  const unxml = s => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]))
    .replace(/_x([\dA-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const attr = (s, k) => { const m = s.match(new RegExp('(?:^|\\s)(?:\\w+:)?' + k + '="([^"]*)"')); return m ? unxml(m[1]) : null; };
  const runs = s => (s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[^<]*<\/t>/g) || []).map(t => unxml(t.replace(/<[^>]+>/g, ''))).join('');
  const colNum = ref => { let n = 0; for (const ch of ref) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  /* a sheet's cells as a grid of strings; numbers keep Excel's 15 significant digits */
  function sheetGrid(xml, sst) {
    const grid = [];
    let ri = -1;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rr = attr(rm[1], 'r'); ri = rr ? +rr - 1 : ri + 1;
      if (!rm[2] || ri > 2e5) continue;
      const row = []; let ci = -1;
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[1], 'r'); ci = ref ? colNum(ref.replace(/\d+$/, '')) : ci + 1;
        if (ci > 500) continue;
        const ty = attr(cm[1], 't') || 'n', body = cm[2] || '', v = (body.match(/<v\b[^>]*>([^<]*)<\/v>/) || [])[1];
        let s = '';
        if (ty === 's') s = v != null ? sst[+v] || '' : '';
        else if (ty === 'inlineStr') s = runs(body);
        else if (ty === 'b') s = v === '1' ? 'TRUE' : 'FALSE';
        else if (ty === 'e') s = '';
        else if (v != null) { s = unxml(v); if (ty === 'n' && s !== '' && isFinite(+s)) s = String(+(+s).toPrecision(15)); }
        row[ci] = s.trim();
      }
      grid[ri] = row;
    }
    return grid;
  }
  /* the block of numbers on a sheet: the header is the text row just above the first row of numbers;
     columns with no numbers (notes, sample codes) are dropped, text in number columns becomes blank */
  function gridTable(grid, name) {
    const isNum = c => c != null && c !== '' && isFinite(Number(c));
    const rows = []; for (let i = 0; i < grid.length; i++) rows.push((grid[i] || []).map(c => (c == null ? '' : c)));
    const nNum = r => r.filter(isNum).length;
    const i0 = rows.findIndex(r => nNum(r) >= 2);
    if (i0 < 0) return null;
    const isText = r => r && r.some(c => c !== '') && nNum(r) < r.filter(c => c !== '').length / 2;
    let ih = -1;
    for (let i = i0 - 1; i >= Math.max(0, i0 - 3); i--) if (rows[i].some(c => c !== '')) { if (isText(rows[i])) ih = i; break; }
    const body = rows.slice(i0).filter(r => nNum(r) >= 1);
    const w = Math.max(...body.map(r => r.length));
    const keep = []; for (let j = 0; j < w; j++) if (body.some(r => isNum(r[j]))) keep.push(j);
    if (keep.length < 2 || body.length < 2) return null;
    const head = ih >= 0 ? rows[ih] : [];
    /* a two-row header: names above, units below ("Temperature" over "K") */
    const up = ih > 0 && isText(rows[ih - 1]) && keep.filter(j => rows[ih - 1][j]).length >= keep.length / 2 && keep.every(j => !head[j] || (head[j].length <= 12 && !/[()[\]]/.test(head[j]))) ? rows[ih - 1] : null;
    const title = j => (up && up[j] && head[j] ? `${up[j]} (${head[j]})` : head[j] || (up && up[j]) || '');
    const cols = keep.map((j, k) => title(j) || (k === 0 ? 'X' : keep.length > 2 ? 'Y' + k : 'Y'));
    return { kind: 'xy', name, cols, rows: body.map(r => keep.map(j => (isNum(r[j]) ? r[j] : ''))), meta: { format: 'XLSX' } };
  }
  /* every visible sheet with numbers becomes a table: {kind:'book', name, sheets:[xy tables]} */
  F.xlsx = async function (buf, name) {
    if (typeof buf === 'string') throw new Error('Excel files are binary; open them as files.');
    const u8 = u8of(buf);
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) throw new Error('This is an older .xls workbook. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then open that file.');
    /* many instruments write tab-separated text and call it .xls */
    if (u8[0] !== 0x50 || u8[1] !== 0x4B) return F.text(u8, name);
    const read = unzip(u8);
    const rels = (await read('_rels/.rels')) || '';
    const wbPath = ((rels.match(/<Relationship\b[^>]*officeDocument"[^>]*>/) || [''])[0].match(/Target="\/?([^"]+)"/) || [])[1] || 'xl/workbook.xml';
    const wb = await read(wbPath);
    if (!wb) throw new Error('This file has no workbook inside. Save it again from Excel as .xlsx or CSV.');
    const dir = wbPath.replace(/[^/]*$/, '');
    const wbRels = (await read(dir + '_rels/' + wbPath.slice(dir.length) + '.rels')) || '';
    const target = {};
    for (const m of wbRels.matchAll(/<Relationship\b([^>]*)>/g)) target[attr(m[1], 'Id')] = attr(m[1], 'Target');
    const resolve = t => (t[0] === '/' ? t.slice(1) : (dir + t).split('/').reduce((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' ? a : a.concat(s)), []).join('/'));
    const sstPath = Object.values(target).find(t => /sharedStrings\.xml$/i.test(t || ''));
    const sstXml = sstPath ? (await read(resolve(sstPath))) || '' : '';
    const sst = (sstXml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(runs);
    const stem = base(name), sheets = [];
    const list = [...wb.matchAll(/<sheet\b([^>]*?)\/?>/g)].map(m => ({ name: attr(m[1], 'name') || 'Sheet', state: attr(m[1], 'state'), rid: attr(m[1], 'id') })).filter(s => !s.state || s.state === 'visible');
    for (const s of list.slice(0, 30)) {
      const path = target[s.rid] && resolve(target[s.rid]);
      const xml = path && await read(path);
      if (!xml) continue;
      const t = gridTable(sheetGrid(xml, sst), list.length > 1 ? `${stem} – ${s.name}` : stem);
      if (t) sheets.push(t);
    }
    if (!sheets.length) throw new Error('No columns of numbers were found in the workbook.');
    return { kind: 'book', name: stem, sheets, meta: { format: 'XLSX' } };
  };

  const EXT = { csv: 'text', txt: 'text', dat: 'text', xy: 'text', xye: 'text', asc: 'text', tsv: 'text', prn: 'text', jdx: 'jcamp', dx: 'jcamp', jcamp: 'jcamp', xrdml: 'xrdml', ras: 'ras', uxd: 'uxd', spc: 'spc', cif: 'cif', xlsx: 'xlsx', xlsm: 'xlsx', xls: 'xlsx' };
  F.extensions = Object.keys(EXT);
  F.accept = F.extensions.map(e => '.' + e).join(',');
  const UNSUPPORTED = { raw: 'Bruker and Rigaku .raw files are binary and vendor-specific. Export the scan as .xy, .uxd, .ras or .xrdml from DIFFRAC or SmartLab software, or use PowDLL to convert it.', sp: 'PerkinElmer .sp files are binary. Export the spectrum as CSV or JCAMP-DX from Spectrum software.', brml: 'Bruker .brml files are packaged archives. Export the scan as .xy or .uxd from DIFFRAC.EVA.', opj: 'Origin projects cannot be read; export the worksheet as CSV.', ods: 'Save the sheet as .xlsx or CSV from LibreOffice, then open that file.', numbers: 'Export the sheet as .xlsx or CSV from Numbers, then open that file.' };
  /* name: file name; data: ArrayBuffer (or string for text formats). Workbooks are unpacked
     asynchronously, so for .xlsx this returns a Promise of {kind:'book', sheets}. */
  F.parse = function (name, data) {
    const ext = String(name).toLowerCase().split('.').pop();
    if (UNSUPPORTED[ext]) throw new Error(UNSUPPORTED[ext]);
    const kind = EXT[ext] || 'text';
    if (kind === 'spc') return F.spc(data, name);
    if (kind === 'xlsx') return F.xlsx(data, name);
    const text = decode(data);
    if (kind === 'text' && /^##TITLE=/m.test(text)) return F.jcamp(text, name);
    return F[kind](text, name);
  };
  F.read = function (file) {
    return file.arrayBuffer().then(buf => F.parse(file.name, buf));
  };
})(typeof window !== 'undefined' ? window : globalThis);
