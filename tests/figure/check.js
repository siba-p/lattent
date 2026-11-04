/* Checks of journal-size figure export: the scale that gives the requested text size and width,
   the TIFF writer (decoded here independently) and the PNG resolution chunk.
   Usage: node tests/figure/check.js [out-dir]   (out-dir: also write sample.tif and sample.png) */
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const R = path.join(__dirname, '..', '..');
const ctx = { console, Math, Uint8Array, Uint32Array, DataView, ArrayBuffer }; ctx.window = ctx; ctx.globalThis = ctx; ctx.BF = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'assets/js/plot.js'), 'utf8'), ctx);
const P = ctx.BF.plot;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };

/* size: a Nature single-column figure, 89 × 60 mm with 7 pt text */
const nat = P.JOURNALS.find(j => j.id === 'nature');
const u = P.journalUnits(nat.widths[0][1], 60, nat.pt);
const spec = { x: { label: 'Temperature (K)' }, y: { label: 'Conductivity (S/cm)' }, legend: true, series: [{ name: 'Film A', ci: 0, points: [300, 350, 400, 450].map((x, i) => ({ x, y: (i + 1) * 1e-4 })) }, { name: 'Film B', ci: 1, points: [300, 350, 400, 450].map((x, i) => ({ x, y: (i + 2) * 1e-4 })) }], vguides: [{ x: 375, label: 'Tg', ci: 1 }] };
const fig = P.xy(spec, P.print, u.W, u.H), ph = P.svgPhysical(fig.svg, u.s);
ok(Math.abs(ph.wmm - 89) < 0.005 && Math.abs(ph.hmm - 60) < 0.005, `Nature single column: ${ph.wmm.toFixed(2)} × ${ph.hmm.toFixed(2)} mm`);
ok(/^<svg[^>]* width="89\.00mm" height="60\.00mm"/.test(ph.svg) && /viewBox="0 0 [\d.]+ [\d.]+"/.test(ph.svg), 'the SVG carries its physical size in millimetres and keeps its viewBox');
const sizes = [...fig.svg.matchAll(/font-size="([\d.]+)"/g)].map(m => +m[1] * u.s);
ok(Math.abs(Math.max(...sizes) - 7) < 1e-9 && Math.min(...sizes) >= 5, `text from ${Math.min(...sizes).toFixed(2)} to ${Math.max(...sizes).toFixed(2)} pt, inside Nature's 5–7 pt`);
const strokes = [...fig.svg.matchAll(/stroke-width="([\d.]+)"/g)].map(m => +m[1] * u.s);
ok(Math.min(...strokes) >= 0.25, `thinnest line ${Math.min(...strokes).toFixed(2)} pt (journals ask for at least 0.25 pt)`);
const els = P.JOURNALS.find(j => j.id === 'elsevier'), ue = P.journalUnits(190, 100, els.pt);
ok(Math.abs(ue.W * ue.s / (72 / 25.4) - 190) < 0.005 && ue.W > u.W * 2, 'Elsevier double column is drawn wider, at the same text size');

/* TIFF: write an image with flat areas, runs of two and noise, then decode it here */
function readTiff(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 0x4949 || dv.getUint16(2, true) !== 42) throw new Error('not a little-endian TIFF');
  const ifd = dv.getUint32(4, true), n = dv.getUint16(ifd, true), tags = {};
  const val = (type, count, at) => { const sz = { 3: 2, 4: 4, 5: 8 }[type], off = count * sz > 4 ? dv.getUint32(at, true) : at; return Array.from({ length: count }, (_, i) => (type === 3 ? dv.getUint16(off + 2 * i, true) : type === 4 ? dv.getUint32(off + 4 * i, true) : dv.getUint32(off + 8 * i, true) / dv.getUint32(off + 8 * i + 4, true))); };
  for (let i = 0; i < n; i++) { const e = ifd + 2 + 12 * i; tags[dv.getUint16(e, true)] = val(dv.getUint16(e + 2, true), dv.getUint32(e + 4, true), e + 8); }
  const w = tags[256][0], h = tags[257][0], out = new Uint8Array(w * h * 3); let o = 0;
  tags[273].forEach((off, s) => {
    const end = off + tags[279][s];
    for (let p = off; p < end;) { const c = u8[p++]; if (c < 128) { out.set(u8.subarray(p, p + c + 1), o); o += c + 1; p += c + 1; } else if (c > 128) { out.fill(u8[p++], o, o + 257 - c); o += 257 - c; } }
  });
  return { w, h, tags, rgb: out, filled: o };
}
const W = 333, H = 211, rgba = new Uint8Array(W * H * 4);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = 4 * (y * W + x), band = y % 50;
  const v = band < 20 ? [255, 255, 255] : band < 30 ? [x % 3 ? 10 : 200, 20, x % 2 ? 30 : 31] : band < 40 ? [rnd() * 255, rnd() * 255, rnd() * 255].map(Math.floor) : [62, 78, 216];
  rgba.set(v.concat(255), i);
}
const tif = P.tiff(rgba, W, H, 600), dec = readTiff(tif);
const same = dec.filled === W * H * 3 && dec.rgb.every((v, k) => v === rgba[4 * Math.floor(k / 3) + k % 3]);
ok(dec.w === W && dec.h === H && same, `TIFF decodes to the same ${W} × ${H} pixels across ${dec.tags[273].length} strips`);
ok(dec.tags[259][0] === 32773 && dec.tags[262][0] === 2 && dec.tags[277][0] === 3 && dec.tags[258].join() === '8,8,8', 'baseline RGB, 8 bits per sample, PackBits');
ok(dec.tags[282][0] === 600 && dec.tags[283][0] === 600 && dec.tags[296][0] === 2, '600 dpi recorded in the file');
ok(tif.length < W * H * 3 * 0.75, `PackBits: ${(tif.length / 1024).toFixed(0)} kB, ${(100 * tif.length / (W * H * 3)).toFixed(0)}% of uncompressed`);
let worst = true;
for (const pat of [[1, 1, 2], [1, 2], [5, 5, 6, 6], [9]]) {
  const w = 257, a = new Uint8Array(w * 4); for (let x = 0; x < w; x++) a.fill(pat[x % pat.length], 4 * x, 4 * x + 3);
  try { const d = readTiff(P.tiff(a, w, 1, 300)); worst = worst && d.rgb.every((v, k) => v === a[4 * Math.floor(k / 3)]); } catch (e) { worst = false; }
}
ok(worst, 'PackBits never overflows or corrupts on worst-case patterns');
const one = readTiff(P.tiff(rgba.subarray(0, 40 * 4 * 2), 40, 2, 1200));
ok(one.tags[273].length === 1 && one.w === 40 && one.tags[282][0] === 1200, 'a single-strip TIFF stores its offset in the tag itself');

/* PNG: build one, record 600 dpi twice, check chunks and CRCs */
const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 8 + data.length); return b; };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(H * (1 + W * 3)); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) raw[y * (1 + W * 3) + 1 + 3 * x + c] = rgba[4 * (y * W + x) + c];
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('pHYs', Buffer.from([0, 0, 11, 19, 0, 0, 11, 19, 1])), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const out = Buffer.from(P.pngDpi(P.pngDpi(png, 300), 600));
const chunks = []; for (let p = 8; p < out.length;) { const len = out.readUInt32BE(p), type = out.toString('latin1', p + 4, p + 8); chunks.push({ type, data: out.subarray(p + 8, p + 8 + len), crcOk: out.readUInt32BE(p + 8 + len) === zlib.crc32(out.subarray(p + 4, p + 8 + len)) }); p += 12 + len; }
const phys = chunks.filter(c => c.type === 'pHYs');
ok(chunks.map(c => c.type).join() === 'IHDR,pHYs,IDAT,IEND' && chunks.every(c => c.crcOk), 'PNG: one pHYs right after IHDR, every CRC valid');
ok(phys.length === 1 && phys[0].data.readUInt32BE(0) === 23622 && phys[0].data[8] === 1, '600 dpi = 23622 pixels per metre');
ok(zlib.inflateSync(chunks[2].data).equals(raw), 'image data untouched');

if (process.argv[2]) { fs.writeFileSync(path.join(process.argv[2], 'sample.tif'), tif); fs.writeFileSync(path.join(process.argv[2], 'sample.png'), out); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
