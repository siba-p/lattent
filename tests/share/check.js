/* Share links: a project packed into a link must come back unchanged, in both formats, and
   damaged or hostile links must be refused. Links already sent must keep opening, so the
   format is pinned here. Usage: node tests/share/check.js   (Node 18+) */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'studio.js'), 'utf8');
const block = src.slice(src.indexOf('/* ================= share by link'), src.indexOf('/* ================= cloud storage'));
if (block.length < 500) throw new Error('share block not found in studio.js');

let fails = 0, passes = 0;
const ok = (c, n) => { if (c) { passes++; console.log('ok  ', n); } else { fails++; console.log('FAIL', n); } };
/* the parts of Studio the block relies on, reduced to what packing needs */
const K = { nlfit: 1, peaks: 1 };
const sanitize = p => (p && Array.isArray(p.tables) ? { name: String(p.name || 'Untitled project'), tables: p.tables.filter(t => t && t.type), items: (p.items || []).filter(i => K[i.kind]), cloud: p.cloud } : null);
const make = new Function('sanitize', 'window', 'btoa', 'atob', block + '\nreturn { packShare, unpackShare, SHARE_MAX };');
const win = { CompressionStream: globalThis.CompressionStream };
const S = make(sanitize, win, globalThis.btoa, globalThis.atob);
const S0 = make(sanitize, {}, globalThis.btoa, globalThis.atob);   // a browser without CompressionStream

const rows = Array.from({ length: 120 }, (_, i) => [String(20 + i * 0.5), String(Math.round(1000 * Math.exp(-((i - 60) ** 2) / 40))), 'Ünïcödé ✓']);
const proj = { name: 'XRD of Au nanoparticles — batch 2', tables: [{ id: 't1', type: 'xy', name: 'Scan', cols: ['2θ (°)', 'Intensity', 'note'], rows, ylabel: 'counts' }], items: [{ id: 'a1', tableId: 't1', kind: 'peaks', opts: { xrd: true, K: 0.9 } }], cloud: { id: 'secret' } };

(async () => {
  const z = await S.packShare(proj);
  ok(z.startsWith('z.') && /^[zj]\.[\w-]+$/.test(z), 'compressed link uses the URL-safe z. format');
  const back = await S.unpackShare(z);
  ok(JSON.stringify(back.tables) === JSON.stringify(proj.tables) && JSON.stringify(back.items) === JSON.stringify(proj.items) && back.name === proj.name, 'tables, analyses and name survive the round trip, including Unicode');
  ok(!('cloud' in back), 'a shared copy never carries the cloud project id');
  const j = await S0.packShare(proj);
  ok(j.startsWith('j.'), 'browsers without compression fall back to the j. format');
  ok(JSON.stringify((await S.unpackShare(j)).tables) === JSON.stringify(proj.tables), 'a j. link opens too');
  ok(z.length < j.length / 2, `compression roughly halves the link at least (${z.length} vs ${j.length} characters)`);

  const refuses = async (code, name) => { let threw = false; try { await S.unpackShare(code); } catch (e) { threw = true; } ok(threw, name); };
  await refuses(z.slice(0, Math.floor(z.length / 2)), 'a truncated link is refused');
  await refuses('x.' + z.slice(2), 'an unknown format is refused');
  await refuses('j.' + Buffer.from(JSON.stringify({ app: 'other', project: proj })).toString('base64url'), 'a link from another app is refused');
  await refuses('j.' + Buffer.from(JSON.stringify({ app: 'lattent-studio', project: { tables: [] } })).toString('base64url'), 'an empty project is refused');
  await refuses('j.' + 'A'.repeat(4 * S.SHARE_MAX + 10), 'an oversized link is refused before decoding');
  /* a compression bomb: a tiny link that would inflate to far more than any real project */
  const bomb = 'z.' + Buffer.from(require('zlib').deflateRawSync(Buffer.alloc(40 * 1024 * 1024, 32))).toString('base64url');
  ok(bomb.length < S.SHARE_MAX, 'the bomb fits in a link (' + bomb.length + ' characters)');
  await refuses(bomb, 'a link that inflates beyond 20 MB is refused');

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
