/* Turns extracted Materials Project entries into composition features with assets/js/chem.js
   (the same code the browser runs). Usage: node tests/gen/featurize.js <in.json> <out-prefix>
   Writes <prefix>.bin (float32 features), <prefix>.json (targets, composition keys, fractions). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'chem.js'), 'utf8'), ctx);
const C = ctx.BF.chem;
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const keep = rows.filter(r => Object.keys(r[0]).every(e => C.BY[e]) && isFinite(r[1]));
const X = new Float32Array(keep.length * C.NFEAT);
const y = [], keys = [], fr = [];
keep.forEach((r, i) => {
  const f = C.features(r[0]);
  for (let j = 0; j < C.NFEAT; j++) X[i * C.NFEAT + j] = f[j];
  y.push(r[1]); keys.push(C.key(r[0]));
  const fx = C.fractions(r[0]); fr.push(Object.entries(fx).map(([e, v]) => [C.BY[e].z - 1, +v.toFixed(6)]));
});
fs.writeFileSync(process.argv[3] + '.bin', Buffer.from(X.buffer));
fs.writeFileSync(process.argv[3] + '.json', JSON.stringify({ n: keep.length, nfeat: C.NFEAT, y, keys, fr }));
console.log('featurised', keep.length, 'of', rows.length, 'entries,', C.NFEAT, 'features');
