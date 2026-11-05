/* Access codes: the Python issuer and the browser's Pro.hash must agree, and --write must keep
   config.js valid. Run: node tests/access/check.js */
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..'), SCRIPT = path.join(ROOT, 'scripts', 'access-code.py');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
/* the browser normalisation, copied from Pro.hash in assets/js/shell.js */
const norm = (email, code) => email.trim().toLowerCase() + '|' + code.trim().toUpperCase().replace(/\s+/g, '');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const issue = args => { const out = execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' }); return { out, entry: JSON.parse(out.split('\n').find(l => l.startsWith('entry:')).slice(7)), code: out.split('\n')[0].slice(7).trim() }; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-access-')), cfg = path.join(tmp, 'config.js');
fs.copyFileSync(path.join(ROOT, 'assets', 'js', 'config.js'), cfg);
const load = () => { const w = {}; vm.runInNewContext(fs.readFileSync(cfg, 'utf8'), { window: w }); return w.BF_CONFIG; };
const before = load().access.length;

/* 1. a fixed code hashes the same in Python and in the browser rule */
const a = issue(['someone@lab.edu', '--code', 'LAT-TEST-CODE-2345', '--until', '2099-01-31', '--note', 'test', '--config', cfg]);
ok('hash matches browser rule', a.entry.h === sha(norm('someone@lab.edu', 'LAT-TEST-CODE-2345')));
ok('entry fields', a.entry.plan === 'pro' && a.entry.until === '2099-01-31' && a.entry.note === 'test');
/* 2. messy input normalises: case, spaces, lower-case code */
const b = issue(['  Someone@LAB.edu ', '--code', ' lat-test-code-2345 ', '--config', cfg]);
ok('normalised email and code', b.entry.h === a.entry.h && b.entry.until === null);
/* 3. a random code has the expected shape and unambiguous alphabet */
const c = issue(['x@y.org', '--config', cfg]);
ok('code shape', /^LAT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(c.code));
ok('random codes differ', issue(['x@y.org', '--config', cfg]).code !== c.code);
/* 4. --write adds entries and config.js stays valid JavaScript */
issue(['one@lab.edu', '--code', 'LAT-AAAA-BBBB-CCCC', '--plan', 'lab', '--note', "O'Neil's lab", '--write', '--config', cfg]);
issue(['two@lab.edu', '--code', 'LAT-DDDD-EEEE-FFFF', '--until', '2030-12-31', '--write', '--config', cfg]);
const after = load();
ok('two entries written', after.access.length === before + 2);
const e1 = after.access[before], e2 = after.access[before + 1];
ok('first entry', e1.h === sha(norm('one@lab.edu', 'LAT-AAAA-BBBB-CCCC')) && e1.plan === 'lab' && e1.until === null && e1.note === "O'Neil's lab");
ok('second entry', e2.h === sha(norm('two@lab.edu', 'LAT-DDDD-EEEE-FFFF')) && e2.until === '2030-12-31');
ok('other config kept', after.support === load().support && typeof after.prices === 'object');
/* 5. bad input is refused */
let refused = false; try { issue(['not-an-email', '--config', cfg]); } catch (e) { refused = true; } ok('refuses a bad email', refused);
refused = false; try { issue(['a@b.c', '--until', '31/12/2030', '--config', cfg]); } catch (e) { refused = true; } ok('refuses a bad date', refused);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
