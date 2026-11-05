/* Checks of the on-site help guide: the questions people actually type find the right article,
   typos and synonyms are understood, and nonsense is not answered with a guess.
   Usage: node tests/guide/check.js   (after scripts/build_solutions.py has written assets/js/kb.js) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(R, 'assets/js/guide.js'), 'utf8');
const block = src.slice(src.indexOf('/* search: begin'), src.indexOf('/* search: end */'));
const ctx = { console, Math, Set, Array }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'assets/js/kb.js'), 'utf8').replace('window.BF_KB', 'var BF_KB'), ctx);
vm.runInContext(block + '\nvar IX = makeIndex(BF_KB); var API = { search: t => search(IX, t), intent, tok };', ctx);
const { search, intent, tok } = ctx.API;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
const top = q => { const r = search(q); return r.length ? r[0].e.q : null; };
const expect = (q, want) => { const got = top(q); ok(got === want, `“${q}” → ${got === want ? want : 'got “' + got + '”, wanted “' + want + '”'}`); };

console.log('   ', ctx.BF_KB.length + ' articles');
expect('what i can do with this platform', 'What can I do with Lattent?');
expect('What is Lattent?', 'What can I do with Lattent?');
expect('what does this software do', 'What can I do with Lattent?');
expect('who is it for', 'Who is Lattent for?');
expect('how much does it cost', 'How much does Lattent cost?');
expect('is it free', 'Is Lattent free?');
expect('can i upload an excel sheet', 'Can I open Excel files?');
expect('analyze 50 xrd files at once', 'Can I analyse many files at once?');
expect('export a figure for a Nature paper', "Can I export a figure at my journal's size?");
expect('does it work without internet', 'Does Lattent work offline?');
expect('share my project with my supervisor', 'How do I share a project with a colleague?');
expect('crystalite size from xrd', 'How is crystallite size calculated?');
expect('my pasted data lands in one column', 'My pasted data lands in one column.');
expect('which statistical test should I use', 'Which test should I use?');
expect('the fit does not converge', 'The fit does not converge.');
expect('i want to talk to someone', 'How do I talk to a person?');
expect('how to cite', 'How do I cite Lattent?');
expect('where is my project saved', 'Where is my project saved?');
expect("what's new", 'What is new in Lattent?');
expect('lattent vs origin', 'How does Lattent compare with Origin or GraphPad Prism?');
ok(/^How do I identify the phases?( in my XRD pattern)?\?$/.test(top('identify phases')), '“identify phases” → ' + top('identify phases'));
expect('band gap from uv vis', 'How do I get the band gap from a UV–Vis spectrum?');
expect('is my data uploaded', 'Is my data private?');
expect('what instruments are supported', 'Which measurements and instruments does Lattent support?');
ok(search('asdf qwerty zzzz').length === 0, 'nonsense gets no article (so the guide says so instead of guessing)');
ok(search('').length === 0 && search('the and of').length === 0, 'empty and all-stop-word questions get nothing');
ok(/Hello/.test(intent('hi there')) && /welcome/.test(intent('thanks a lot')) && intent('how do I fit a curve') === null, 'greetings and thanks are answered directly; questions are not');
ok(tok('fitting fitted fits').every(w => w === 'fit') && tok('prices pricing').every(w => w === 'price') && tok('analyses analyzing').every(w => w === 'analys'), 'stemming and synonyms: fit/fitting/fitted, price/pricing, analyse/analyze');
/* every article is reachable by its own question */
const miss = ctx.BF_KB.filter(e => top(e.q) !== e.q).map(e => e.q);
ok(miss.length === 0, miss.length ? 'these articles are shadowed by another when asked verbatim: ' + miss.join(' | ') : 'every article is found when its own question is asked');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
