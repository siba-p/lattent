/* Quick-tool pages: paste data, then open it in Studio with the right analysis preset. */
(function () {
  'use strict';
  const U = BF.ui;
  const main = document.querySelector('[data-tool]');
  if (!main) return;
  const cfg = JSON.parse(main.dataset.tool);
  const ta = document.getElementById('qt-data');
  const msg = document.getElementById('qt-msg');
  U.fileInto(ta, document.getElementById('qt-file'));
  document.getElementById('qt-example').onclick = () => { location.href = U.root + 'studio/?example=' + encodeURIComponent(cfg.example); };
  document.getElementById('qt-go').onclick = () => {
    const g = U.parseGrid(ta.value);
    const rows = (g.raw || []).filter(r => r.length >= 2 && r.slice(0, 2).every(v => v !== '' && isFinite(parseFloat(String(v).replace(',', '.')))));
    if (rows.length < 4) { msg.textContent = 'Paste at least four rows with an X value and a Y value.'; return; }
    const ncol = Math.max(...rows.map(r => r.length));
    const cols = g.header && g.header.length >= 2 ? g.header.slice(0, ncol) : [cfg.xlabel].concat(Array.from({ length: ncol - 1 }, () => cfg.ylabel));
    while (cols.length < ncol) cols.push(cfg.ylabel);
    const payload = { name: cfg.name, table: { name: cfg.name, type: 'xy', cols, rows: rows.map(r => r.map(String)), ylabel: cfg.ylabel }, items: [{ kind: cfg.kind, opts: cfg.opts || {} }], at: Date.now() };
    try { localStorage.setItem('bf.studio.import', JSON.stringify(payload)); } catch (e) { msg.textContent = 'Your browser blocked local storage, so the data cannot be passed to Studio.'; return; }
    location.href = U.root + 'studio/?import=1';
  };
})();
