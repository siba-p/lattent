/* Support centre: filter the guides and answers as you type. */
(function () {
  'use strict';
  const q = document.getElementById('sp-q'), none = document.getElementById('sp-none');
  const guides = [...document.querySelectorAll('.sp-guide')], items = [...document.querySelectorAll('.faq .sp-item')];
  q.addEventListener('input', () => {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = el => terms.every(t => el.textContent.toLowerCase().includes(t));
    let shown = 0;
    guides.forEach(g => {
      const qas = [...g.querySelectorAll('.sp-qa')];
      const titleHit = terms.length && hit(g.querySelector('h3'));
      let any = false;
      qas.forEach(d => { const ok = !terms.length || titleHit || hit(d); d.hidden = !ok; d.open = !!terms.length && ok && !titleHit; if (ok) any = true; });
      g.hidden = !any; if (any) shown++;
    });
    items.forEach(d => { const ok = !terms.length || hit(d); d.hidden = !ok; if (ok && terms.length) shown++; });
    none.hidden = shown > 0;
  });
})();
