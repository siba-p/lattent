/* Lattent guide: a small help agent on every site page. It answers from Lattent's own help
   articles (assets/js/kb.js) by matching words, offline, and links to the right tool.
   It is not a language model and sends nothing anywhere. */
(function () {
  'use strict';
  const U = BF.ui, CFG = window.BF_CONFIG, esc = U.esc;
  /* search: begin (tests/guide/check.js runs this block on its own) */
  const STOP = new Set('the and for with how can what why does did you your are any from that this have into about not but its was get use using need want would could should there their them then than when where which will just like also more some over only very out our all one two to of in on at by is it if or an as be do so up we my me he no us am vs please tell know thing things something anything way ways really actually'.split(' '));
  /* different words for one idea meet on one form; the same map is applied to the articles */
  const SYN = {};
  [['lattent', 'latent', 'lattant', 'platform', 'software', 'app', 'application', 'website', 'site', 'product', 'service', 'program', 'programme', 'system'],
    ['price', 'cost', 'costs', 'costing', 'pricing', 'prices', 'priced', 'pay', 'paying', 'payment', 'payments', 'paid', 'subscription', 'subscribe', 'fee', 'fees', 'charge', 'charges', 'buy', 'purchase', 'rupee', 'rupees', 'inr', 'dollar', 'dollars', 'usd', 'cheap', 'expensive', 'afford', 'money', 'licence', 'license', 'pro', 'premium', 'upgrade', 'trial'],
    ['figure', 'graph', 'graphs', 'plot', 'plots', 'chart', 'charts', 'figures', 'diagram'],
    ['excel', 'xlsx', 'xls', 'xlsm', 'spreadsheet', 'spreadsheets', 'workbook', 'workbooks', 'worksheet', 'sheet', 'sheets'],
    ['import', 'imports', 'imported', 'importing', 'upload', 'uploads', 'uploading', 'load', 'loading', 'drag', 'drop', 'dropping'],
    ['export', 'exports', 'exporting', 'download', 'downloads', 'downloading', 'save', 'saving', 'saved'],
    ['xrd', 'diffraction', 'diffractogram', 'diffractometer', 'powder', 'pxrd', 'bragg'],
    ['spectra', 'spectrum', 'spectroscopy', 'spectral', 'spectrometer', 'uvvis', 'uv', 'vis', 'ftir', 'ir', 'raman', 'absorbance'],
    ['problem', 'error', 'errors', 'wrong', 'broken', 'fail', 'fails', 'failed', 'failing', 'failure', 'bug', 'bugs', 'issue', 'issues', 'crash', 'crashes', 'crashed', 'stuck', 'slow', 'freeze', 'frozen', 'hang', 'hangs', 'missing', 'lost', 'disappeared', 'gone', 'blank', 'empty'],
    ['start', 'begin', 'beginning', 'started', 'starting', 'beginner', 'beginners', 'newbie', 'tutorial', 'tutorials', 'guide', 'guides', 'learn', 'learning', 'basics', 'intro', 'introduction', 'onboarding', 'first', 'getting'],
    ['instrument', 'instruments', 'machine', 'machines', 'equipment', 'device', 'devices'],
    ['lab', 'team', 'teams', 'group', 'groups', 'laboratory', 'colleague', 'colleagues', 'member', 'members', 'collaborate', 'collaboration', 'collaborators', 'department', 'institution', 'university'],
    ['account', 'login', 'signin', 'signup', 'sign', 'register', 'registration', 'registered', 'password', 'accounts', 'profile', 'username', 'logged'],
    ['facet', 'ai', 'chatgpt', 'gpt', 'claude', 'openai', 'anthropic', 'llm', 'llms', 'chatbot', 'assistant', 'copilot', 'gemini', 'intelligence', 'apikey'],
    ['equation', 'equations', 'formula', 'formulas', 'formulae', 'function', 'functions', 'expression'],
    ['fit', 'fits', 'fitting', 'fitted', 'regression', 'regressions', 'nonlinear', 'curvefit', 'curvefitting', 'fitter'],
    ['statistic', 'statistics', 'statistical', 'stats', 'stat', 'significance', 'significant', 'pvalue', 'pvalues', 'hypothesis'],
    ['cite', 'citation', 'citations', 'cited', 'citing', 'reference', 'references', 'bibtex', 'acknowledge', 'acknowledgement', 'credit'],
    ['install', 'installation', 'installing', 'installed', 'offline', 'pwa', 'desktop', 'internet', 'connection'],
    ['privacy', 'private', 'secure', 'security', 'safe', 'safety', 'confidential', 'confidentiality', 'gdpr', 'encrypted', 'encryption'],
    ['cloud', 'sync', 'synced', 'syncing', 'online', 'server', 'servers', 'backup', 'backups', 'stored', 'storage'],
    ['batch', 'bulk', 'many', 'multiple', 'several', 'hundreds', 'dozens', 'lots', 'mass', 'automate', 'automation', 'automatically', 'repeat', 'repeated', 'loop'],
    ['share', 'sharing', 'shared', 'send', 'sent', 'link', 'links', 'url'],
    ['report', 'reports', 'writeup', 'writeups', 'methods', 'manuscript', 'paper', 'papers', 'publication', 'publish', 'publishing', 'thesis', 'journal', 'journals'],
    ['crystallite', 'crystallites', 'grain', 'grains', 'particle', 'particles', 'nanoparticle', 'nanoparticles', 'scherrer'],
    ['compare', 'comparison', 'versus', 'better', 'difference', 'different', 'alternative', 'alternatives', 'origin', 'prism', 'graphpad', 'originlab', 'igor', 'matlab', 'scipy'],
    ['delete', 'remove', 'removed', 'removing', 'erase', 'erased', 'deleted', 'deleting', 'wipe'],
    ['refund', 'refunds', 'refunded', 'cancel', 'cancelled', 'cancelling', 'cancellation', 'unsubscribe'],
    ['contact', 'help', 'assistance', 'assist', 'question', 'questions', 'faq', 'docs', 'documentation', 'manual', 'contacting', 'person', 'human', 'someone', 'staff', 'email', 'mail', 'reply', 'respond', 'talk', 'speak', 'call', 'phone']
  ].forEach(g => g.forEach(w => { SYN[w] = g[0]; }));
  /* a light stemmer: fit, fits, fitting, fitted → fit; price, prices, pricing → pric; analysis, analyses, analyze → analys */
  const stem = w => {
    w = w.replace(/yz/g, 'ys').replace(/iz(e|ed|es|ing|ation)$/, 'is$1');
    if (w.length > 4 && /ies$/.test(w)) w = w.slice(0, -3) + 'y';
    else if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3).replace(/([bdfgklmnprst])\1$/, '$1');
    else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2).replace(/([bdfgklmnprst])\1$/, '$1');
    else if (w.length > 5 && /sis$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /[^s]s$/.test(w)) w = w.slice(0, -1);
    if (w.length > 2 && /e$/.test(w)) w = w.slice(0, -1);
    return w;
  };
  const norm = w => SYN[w] || SYN[stem(w)] || stem(w);
  const tok = t => String(t).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9θ₀-₉\- ]+/g, ' ').split(/[\s-]+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(norm);
  /* edit distance, stopping early past `max` */
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function makeIndex(kb) {
    const vocab = new Set();
    const index = kb.map(e => {
      const q = new Set(tok(e.q)), k = new Set(tok(e.k + ' ' + e.t)), a = new Set(tok(e.a));
      [q, k, a].forEach(s => s.forEach(w => vocab.add(w)));
      return { e, q, k, a };
    });
    return { index, vocab: [...vocab] };
  }
  /* a word the articles never use is probably a typo: take the closest known word */
  function fix(ix, w) {
    if (w.length < 5 || ix.vocab.includes(w)) return w;
    const max = w.length > 7 ? 2 : 1;
    let best = null, bd = max + 1;
    for (const v of ix.vocab) { if (v[0] !== w[0] && max < 2) continue; const d = dist(w, v, max); if (d < bd) { bd = d; best = v; } }
    return best || w;
  }
  /* each query word scores by where the article uses it: question 3, keywords 1.5, answer 0.5;
     an article needs at least a real hit and must cover a fair share of the question */
  function search(ix, text) {
    const qt = [...new Set(tok(text))].map(w => fix(ix, w));
    if (!qt.length) return [];
    const out = [];
    ix.index.forEach(x => {
      let sum = 0, hit = 0;
      qt.forEach(w => { const h = (x.q.has(w) ? 3 : 0) + (x.k.has(w) ? 1.5 : 0) + (x.a.has(w) ? 0.5 : 0); sum += h; if (h) hit++; });
      /* the article's own question, word for word (chips ask exactly that), beats a close neighbour */
      if (qt.length === x.q.size && qt.every(w => x.q.has(w))) sum += 5;
      const cov = hit / qt.length;
      if (sum >= 1.5 && (cov >= 0.3 || sum >= 5)) out.push({ e: x.e, sc: sum + cov });
    });
    return out.sort((a, b) => b.sc - a.sc).slice(0, 4);
  }
  const INTENT = [
    [/^\s*(hi|hello|hey|hiya|hola|namaste|good (morning|afternoon|evening))\b/i, 'Hello! Ask me what Lattent does, how to bring in your data, which analysis to run, what it costs, or where to find a feature.'],
    [/\b(thank(s| you)?|thx|cheers)\b/i, 'You are welcome. Ask another question any time, or open Studio when you are ready.']
  ];
  const intent = text => { const m = INTENT.find(([re]) => re.test(text)); return m ? m[1] : null; };
  /* search: end */
  let kb = null, ix = null, root = null;

  const price = () => {
    const P = CFG.prices;
    return `Lattent is free for analysis, with every model and Discover included. Pro adds publication exports, auto-written methods and cloud storage: $${P.monthly} a month or $${P.yearly} a year (₹${P.inr.monthly} or ₹${P.inr.yearly.toLocaleString('en-IN')} in India). The Lab plan covers up to ten people for $${P.lab} a year (₹${P.inr.lab.toLocaleString('en-IN')}).`;
  };
  function load() {
    return new Promise(res => {
      if (window.BF_KB) return res();
      const s = document.createElement('script'); s.src = U.root + 'assets/js/kb.js'; s.onload = res; s.onerror = res; document.body.appendChild(s);
    }).then(() => { kb = window.BF_KB || []; ix = makeIndex(kb); });
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
  const CHIPS = ['What can Lattent do?', 'How do I import my data?', 'Which analysis should I run?', 'How much does it cost?'];
  const MORE = ['Identify the phases in my XRD', 'Which statistical test should I use?', 'Can Lattent write a report for me?', 'Does it work offline?'];
  function init() {
    root = build();
    const fab = root.querySelector('.ag-fab'), panel = root.querySelector('.ag-panel'), log = root.querySelector('#ag-log'), q = root.querySelector('#ag-q');
    const add = (cls, html) => { const d = document.createElement('div'); d.className = 'ag-m ' + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
    const chips = list => { const c = root.querySelector('#ag-chips'); c.innerHTML = list.map((t, i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join(''); c.querySelectorAll('button').forEach(b => b.onclick = () => ask(list[+b.dataset.i])); };
    let asked = 0;
    async function ask(text) {
      text = String(text).trim(); if (!text) return;
      add('u', esc(text)); q.value = ''; asked++;
      const said = intent(text);
      if (said) { add('a', esc(said)); chips(CHIPS); return; }
      if (!ix) await load();
      const r = search(ix, text);
      if (!r.length) {
        add('a', `<p>I could not match that to a help article. Try one of the questions below, browse the <a href="${U.root}support/">Support centre</a>, or <a href="${U.root}contact/?topic=support">write to us</a>: a person replies, usually within a day.</p>`);
        chips(CHIPS); return;
      }
      const top = r[0].e;
      add('a', `<p>${esc(answer(top))}</p>${link(top)}`);
      const rel = r.slice(1, 3).map(x => x.e.q);
      if (rel.length) { add('a rel', '<small>Related</small>'); chips(rel); } else chips(asked % 2 ? MORE : CHIPS);
    }
    function open(on) {
      panel.hidden = !on; fab.setAttribute('aria-expanded', on); root.classList.toggle('open', on);
      if (on) {
        if (!log.children.length) { add('a', `Hello. I answer questions about Lattent from its help articles: what it does, bringing in data, choosing an analysis, figures, pricing. What do you need?`); chips(CHIPS); }
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
