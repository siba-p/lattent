// Supabase Edge Function: the website's contact form. Stores the enquiry and emails it to the
// owner through Resend, with the sender as Reply-To. The owner's address stays secret.
//   supabase functions deploy contact --no-verify-jwt
//   secrets: RESEND_API_KEY, CONTACT_TO (your inbox), CONTACT_FROM (e.g. Lattent <hello@yourdomain>), SITE_ORIGIN
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleContact } from '../_shared/contact.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const origin = env('SITE_ORIGIN') || 'https://siba-p.github.io';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization', Vary: 'Origin' };

const store = {
  async recentCount(email: string, minutes: number) {
    const { count } = await sb.from('enquiries').select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', new Date(Date.now() - minutes * 60e3).toISOString());
    return count ?? 0;
  },
  async save(e: any) { const { data, error } = await sb.from('enquiries').insert(e).select('id').single(); if (error) throw error; return data.id; },
};
const mailer = {
  async send(subject: string, text: string, replyTo: string) {
    if (!env('RESEND_API_KEY') || !env('CONTACT_TO')) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('CONTACT_FROM') || 'Lattent <onboarding@resend.dev>', to: [env('CONTACT_TO')], reply_to: replyTo, subject, text }),
    });
    return r.ok;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  try {
    const raw = await req.text();
    if (raw.length > 20000) return new Response('too large', { status: 413, headers: cors });
    const res = await handleContact(JSON.parse(raw), store, mailer);
    return new Response(res.body, { status: res.status, headers: cors });
  } catch (e) {
    console.error('contact error', e);
    return new Response('Something went wrong. Please try again later.', { status: 500, headers: cors });
  }
});
