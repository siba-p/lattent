/* Pricing page: billing period and currency toggles, and the buy buttons. */
(function () {
  'use strict';
  const C = window.BF_CONFIG, U = BF.ui, P = C.prices;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  let bill = 'yearly', cur = 'usd';
  const money = v => (cur === 'inr' ? '₹' + v.toLocaleString('en-IN') : '$' + v);
  const price = plan => (cur === 'inr' ? P.inr[plan] : P[plan]);
  function paint() {
    $$('[data-bill]').forEach(b => b.setAttribute('aria-pressed', b.dataset.bill === bill));
    $$('[data-cur]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cur === cur));
    $('[data-amt="free"]').innerHTML = money(0);
    const pro = bill === 'yearly' ? 'yearly' : 'monthly';
    $('[data-amt="pro"]').innerHTML = `${money(price(pro))}<small> / ${bill === 'yearly' ? 'year' : 'month'}</small>`;
    $('[data-sub="pro"]').textContent = bill === 'yearly' ? `about ${money(Math.round(price('yearly') / 12 * (cur === 'inr' ? 1 : 100)) / (cur === 'inr' ? 1 : 100))} a month` : 'billed monthly, cancel any time';
    $('[data-amt="lab"]').innerHTML = `${money(price('lab'))}<small> / year</small>`;
  }
  $$('[data-bill]').forEach(b => b.onclick = () => { bill = b.dataset.bill; paint(); });
  $$('[data-cur]').forEach(b => b.onclick = () => { cur = b.dataset.cur; paint(); });
  $('[data-buy-pro]').onclick = () => U.buy(bill === 'yearly' ? 'yearly' : 'monthly');
  $$('[data-buy]').forEach(b => b.onclick = () => U.buy(b.dataset.buy));
  $$('[data-trial]').forEach(b => b.onclick = () => { if (BF.pro.kind() === 'free') BF.pro.startTrial(); else U.upgrade(); });
  /* visitors in India see rupees first */
  try { if (/^(hi|bn|ta|te|mr|gu|kn|ml|pa)\b|-IN$/i.test(navigator.language || '') || /Asia\/(Kolkata|Calcutta)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone)) cur = 'inr'; } catch (e) { /* default to US$ */ }
  paint();
})();
