/* Contact form, in order of preference: the Lattent server function when accounts are configured;
   the Web3Forms relay when a key is set (no server needed); otherwise the visitor's own email
   app, with the message shown so it can be copied; and, until an address is set, a public
   GitHub issue. */
(function () {
  'use strict';
  const C = window.BF_CONFIG, U = BF.ui, esc = U.esc;
  const $ = s => document.querySelector(s);
  const form = $('#ct-form'), out = $('#ct-out'), t0 = Date.now();
  const q = new URLSearchParams(location.search);
  const PLAN = { monthly: 'Pro monthly', yearly: 'Pro yearly', lab: 'the Lab plan' };
  if (q.get('topic') && $('#ct-topic').querySelector(`option[value="${q.get('topic')}"]`)) $('#ct-topic').value = q.get('topic');
  if (PLAN[q.get('plan')]) $('#ct-msg').value = `I would like to buy ${PLAN[q.get('plan')]}. Please send a payment link${q.get('plan') === 'lab' ? ' or an invoice for my institution' : ''}.\n\n`;
  const sb = C.supabase && C.supabase.url, relayOn = () => !!C.web3forms;
  if (!sb && !relayOn() && !C.support) $('#ct-note').innerHTML = 'Messages are delivered by email once our mail service is connected; until then the button opens a public GitHub issue, so do not include private details.';
  else if (!sb && !relayOn()) $('#ct-note').innerHTML = `The button opens your email app with the message ready to send. We use your details only to reply; see our <a href="../legal/privacy.html">privacy notice</a>.`;
  const done = html => { out.innerHTML = html; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const busy = on => { const b = form.querySelector('[type=submit]'); b.disabled = on; b.textContent = on ? 'Sending…' : 'Send message'; };
  const thanks = d => `<div class="ct-ok"><b>Thank you, ${esc(d.name.split(' ')[0])}.</b> Your message is on its way; we will reply to ${esc(d.email)}, usually within a day.</div>`;
  /* the visitor's own email app, with the text shown in case nothing opens */
  function byEmailApp(subject, text, lead) {
    done(`<div class="ct-ok">${lead || ''}<b>Press Send in your email app</b>, which should now be open with your message. If nothing opened, copy the message below and email it to <b class="sel">${esc(C.support)}</b>.</div>
      <div class="ct-copy"><div class="ct-copy-head"><span>To: ${esc(C.support)} · Subject: ${esc(subject)}</span><button type="button" class="btn" id="ct-copy">Copy message</button></div><pre id="ct-text">${esc(text)}</pre></div>`);
    $('#ct-copy').onclick = () => { const b = $('#ct-copy'); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { b.textContent = 'Copied'; }, () => { const r = document.createRange(); r.selectNodeContents($('#ct-text')); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Select and copy'; }); };
    location.href = `mailto:${C.support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  }
  form.onsubmit = async e => {
    e.preventDefault();
    const d = { name: $('#ct-name').value.trim(), email: $('#ct-email').value.trim(), organisation: $('#ct-org').value.trim(), topic: $('#ct-topic').value, message: $('#ct-msg').value.trim(), website: $('#ct-web').value, elapsed: Date.now() - t0 };
    if (!d.name) return done('<p class="err">Please tell us your name.</p>');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return done('<p class="err">Please enter a valid email address.</p>');
    if (d.message.length < 10) return done('<p class="err">Please write a little more about what you need.</p>');
    const topic = $('#ct-topic').selectedOptions[0].textContent, subject = `[Lattent] ${topic}: ${d.name}`;
    const text = `${d.message}\n\n${d.name}${d.organisation ? ', ' + d.organisation : ''}\n${d.email}`;
    if (sb) {
      busy(true);
      try {
        const r = await fetch(C.supabase.url.replace(/\/$/, '') + '/functions/v1/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.supabase.anonKey, Authorization: 'Bearer ' + C.supabase.anonKey }, body: JSON.stringify(d) });
        const msg = await r.text();
        if (r.ok) { form.reset(); done(thanks(d)); }
        else done(`<p class="err">${esc(msg || 'The message could not be sent.')}</p>`);
      } catch (err) { done('<p class="err">The message could not be sent. Check your connection and try again.</p>'); }
      busy(false);
      return;
    }
    if (d.website) { form.reset(); return done(thanks(d)); }   // a filled honeypot: a bot, quietly dropped
    if (relayOn()) {
      busy(true);
      let ok = false;
      try {
        const r = await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ access_key: C.web3forms, subject, from_name: 'Lattent contact form', name: d.name, email: d.email, organisation: d.organisation || '—', topic, message: d.message, botcheck: false }) });
        const j = await r.json().catch(() => ({}));
        ok = r.ok && j.success === true;
      } catch (err) { ok = false; }
      busy(false);
      if (ok) { form.reset(); return done(thanks(d)); }
      if (C.support) return byEmailApp(subject, text, 'Our mail relay did not answer, so we have opened another way. ');
      return done('<p class="err">The message could not be sent. Check your connection and try again.</p>');
    }
    if (C.support) return byEmailApp(subject, text);
    const url = `https://github.com/siba-p/lattent/issues/new?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(d.message + '\n\n' + (d.organisation ? d.organisation : ''))}`;
    done(`<div class="ct-ok">Our mail service is not connected yet. <a href="${url}" target="_blank" rel="noopener">Open your message as a GitHub issue</a>; it will be public, so leave out private details.</div>`);
  };
})();
