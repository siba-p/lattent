/* Lattent guide: a small help agent on every site page. It answers from Lattent's own help
   articles (assets/js/kb.js) by keyword matching, offline, and links to the right tool.
   It is not a language model and sends nothing anywhere. */
(function () {
  'use strict';
  const U = BF.ui, CFG = window.BF_CONFIG, esc = U.esc;
  const STOP = new Set('the and for with how can what why does did you your are any from that this have into about not but its was get use using need want would could should there their them then than when where which will just like also more some over only very out our all one two'.split(' '));
  const stem = w => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);
  const tok = t => String(t).toLowerCase().replace(/[^a-z0-9θ₀-₉ ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
  let kb = null, index = null, root = null;

  const price = () => {
    const P = CFG.prices;
    return `Lattent is free for analysis, with every model and Discover included. Pro adds publication exports, auto-written methods and cloud storage: $${P.monthly} a month or $${P.yearly} a year (₹${P.inr.monthly} or ₹${P.inr.yearly.toLocaleString('en-IN')} in India). The Lab plan covers up to ten people for $${P.lab} a year (₹${P.inr.lab.toLocaleString('en-IN')}).`;
  };
  function load() {
    return new Promise(res => {
      if (window.BF_KB) return res();
      const s = document.createElement('script'); s.src = U.root + 'assets/js/kb.js'; s.onload = res; s.onerror = res; document.body.appendChild(s);
    }).then(() => {
      kb = window.BF_KB || [];
      index = kb.map(e => ({ e, q: new Set(tok(e.q)), a: new Set(tok(e.a)), k: new Set(tok(e.k + ' ' + e.t)) }));
    });
  }
  function search(text) {
    const qt = [...new Set(tok(text))];
    if (!qt.length) return [];
    return index.map(x => {
      let sc = 0;
      qt.forEach(w => { if (x.q.has(w)) sc += 3; if (x.k.has(w)) sc += 2; if (x.a.has(w)) sc += 1; });
      return { e: x.e, sc: sc / Math.sqrt(qt.length) };
    }).filter(r => r.sc >= 2.4).sort((a, b) => b.sc - a.sc).slice(0, 4);
  }
  const answer = e => (e.a === '{{pricing}}' ? price() : e.a);
  const link = e => `<a class="ag-link" href="${U.root + e.l}">${esc(e.t)} →</a>`;

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'ag';
    wrap.innerHTML = `<button class="ag-fab" aria-expanded="false" aria-controls="ag-panel"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l6.8 4v8.4L10 18.2l-6.8-4V5.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="14.6" cy="5.4" r="2.2" fill="#f08c3e"/></svg><span>Need help?</span></button>
      <section class="ag-panel" id="ag-panel" role="dialog" aria-label="Lattent guide" hidden>
        <header><div><b>Lattent guide</b><small>Answers from our help articles</small></div><button class="ag-x" aria-label="Close">×</button></header>
        <div class="ag-log" id="ag-log" aria-live="polite"></div>
        <div class="ag-chips" id="ag-chips"></div>
        <form class="ag-form" id="ag-form"><input id="ag-q" type="text" placeholder="Ask about fitting, XRD, pricing…" aria-label="Your question" autocomplete="off"><button class="btn primary small" type="submit">Ask</button></form>
        <p class="ag-foot">No AI model here: answers come from our help pages. <a href="${U.root}contact/">Talk to a person</a></p>
      </section>`;
    document.body.appendChild(wrap);
    return wrap;
  }
  const CHIPS = ['Identify the phases in my XRD', 'Which statistical test should I use?', 'Can Lattent write a report for me?', 'How much does it cost?'];
  function init() {
    root = build();
    const fab = root.querySelector('.ag-fab'), panel = root.querySelector('.ag-panel'), log = root.querySelector('#ag-log'), q = root.querySelector('#ag-q');
    const add = (cls, html) => { const d = document.createElement('div'); d.className = 'ag-m ' + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    const chips = list => { const c = root.querySelector('#ag-chips'); c.innerHTML = list.map((t, i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join(''); c.querySelectorAll('button').forEach(b => b.onclick = () => ask(list[+b.dataset.i])); };
    async function ask(text) {
      text = String(text).trim(); if (!text) return;
      add('u', esc(text)); q.value = '';
      if (!index) await load();
      const r = search(text);
      if (!r.length) { add('a', `I could not find that in our help articles. You can browse the <a href="${U.root}support/">Support centre</a> or <a href="${U.root}contact/?topic=support">write to us</a>; a person will reply, usually within a day.`); chips(CHIPS); return; }
      const top = r[0].e;
      add('a', `<p>${esc(answer(top))}</p>${link(top)}`);
      const rel = r.slice(1, 3).map(x => x.e.q);
      if (rel.length) { add('a rel', '<small>Related</small>'); chips(rel); } else chips(CHIPS);
    }
    function open(on) {
      panel.hidden = !on; fab.setAttribute('aria-expanded', on); root.classList.toggle('open', on);
      if (on) {
        if (!log.children.length) { add('a', `Hello. I can answer questions about Lattent from its help articles and take you to the right tool. What do you need?`); chips(CHIPS); }
        setTimeout(() => q.focus(), 30);
      }
    }
    fab.onclick = () => open(panel.hidden);
    root.querySelector('.ag-x').onclick = () => { open(false); fab.focus(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });
    root.querySelector('#ag-form').onsubmit = e => { e.preventDefault(); ask(q.value); };
    load();
  }
  init();
})();
