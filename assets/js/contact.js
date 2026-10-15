/* Contact form: sent through the Lattent server function when accounts are configured,
   otherwise by email (or, until an address is set, as a public GitHub issue). */
(function () {
  'use strict';
  const C = window.BF_CONFIG, U = BF.ui, esc = U.esc;
  const $ = s => document.querySelector(s);
  const form = $('#ct-form'), out = $('#ct-out'), t0 = Date.now();
  const q = new URLSearchParams(location.search);
  const PLAN = { monthly: 'Pro monthly', yearly: 'Pro yearly', lab: 'the Lab plan' };
  if (q.get('topic') && $('#ct-topic').querySelector(`option[value="${q.get('topic')}"]`)) $('#ct-topic').value = q.get('topic');
  if (PLAN[q.get('plan')]) $('#ct-msg').value = `I would like to buy ${PLAN[q.get('plan')]}. Please send a payment link${q.get('plan') === 'lab' ? ' or an invoice for my institution' : ''}.\n\n`;
  const sb = C.supabase && C.supabase.url;
  if (!sb && !C.support) $('#ct-note').innerHTML = 'Messages are delivered by email once our mail service is connected; until then the button opens a public GitHub issue, so do not include private details.';
  const done = html => { out.innerHTML = html; out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  form.onsubmit = async e => {
    e.preventDefault();
    const d = { name: $('#ct-name').value.trim(), email: $('#ct-email').value.trim(), organisation: $('#ct-org').value.trim(), topic: $('#ct-topic').value, message: $('#ct-msg').value.trim(), website: $('#ct-web').value, elapsed: Date.now() - t0 };
    if (!d.name) return done('<p class="err">Please tell us your name.</p>');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return done('<p class="err">Please enter a valid email address.</p>');
    if (d.message.length < 10) return done('<p class="err">Please write a little more about what you need.</p>');
    const subject = `[Lattent] ${$('#ct-topic').selectedOptions[0].textContent}: ${d.name}`;
    const text = `${d.message}\n\n${d.name}${d.organisation ? ', ' + d.organisation : ''}\n${d.email}`;
    if (sb) {
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await fetch(C.supabase.url.replace(/\/$/, '') + '/functions/v1/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.supabase.anonKey, Authorization: 'Bearer ' + C.supabase.anonKey }, body: JSON.stringify(d) });
        const msg = await r.text();
        if (r.ok) { form.reset(); done(`<div class="ct-ok"><b>Thank you, ${esc(d.name.split(' ')[0])}.</b> Your message is on its way; we will reply to ${esc(d.email)}, usually within a day.</div>`); }
        else done(`<p class="err">${esc(msg || 'The message could not be sent.')}</p>`);
      } catch (err) { done('<p class="err">The message could not be sent. Check your connection and try again.</p>'); }
      btn.disabled = false; btn.textContent = 'Send message';
      return;
    }
    if (C.support) {
      location.href = `mailto:${C.support}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      return done(`<div class="ct-ok">Your email app should open with the message ready to send. If it does not, write to <b class="sel">${esc(C.support)}</b>.</div>`);
    }
    const url = `https://github.com/siba-p/lattent/issues/new?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(d.message + '\n\n' + (d.organisation ? d.organisation : ''))}`;
    done(`<div class="ct-ok">Our mail service is not connected yet. <a href="${url}" target="_blank" rel="noopener">Open your message as a GitHub issue</a>; it will be public, so leave out private details.</div>`);
  };
})();
