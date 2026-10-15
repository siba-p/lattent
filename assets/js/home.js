/* Landing page: prices, buy buttons and example cards. */
(function () {
  var C = window.BF_CONFIG;
  document.querySelectorAll('[data-price]').forEach(function (el) { el.textContent = C.prices[el.dataset.price]; });
  document.querySelectorAll('[data-buy]').forEach(function (a) {
    a.onclick = function (e) { e.preventDefault(); BF.ui.buy(a.dataset.buy); };
  });
  document.querySelectorAll('[data-trial]').forEach(function (a) {
    a.onclick = function (e) { e.preventDefault(); if (BF.pro.kind() === 'free') BF.pro.startTrial(); else BF.ui.upgrade(); };
  });
  var esc = BF.ui.esc;
  document.getElementById('ex-cards').innerHTML = window.BF_SAMPLES.map(function (s) {
    return '<a class="ex-card" href="studio/?example=' + s.id + '"><span class="fld">' + esc(s.field) + '</span><b>' + esc(s.title) + '</b><span>' + esc(s.blurb) + '</span><i>Open in Studio →</i></a>';
  }).join('');
})();
