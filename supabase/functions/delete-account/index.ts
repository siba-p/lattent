// Supabase Edge Function: lets a signed-in user permanently delete their account and
// cloud projects. Refuses while a paid subscription is still live, so nobody keeps
// being billed for a deleted account.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
const allowed = (Deno.env.get('SITE_ORIGINS') ?? 'https://siba-p.github.io').split(',').map((s) => s.trim());

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

Deno.serve(async (req) => {
  const h = cors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: h });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return new Response(JSON.stringify({ error: 'not signed in' }), { status: 401, headers: h });
  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (body.confirm !== 'DELETE') return new Response(JSON.stringify({ error: 'confirmation missing' }), { status: 400, headers: h });

  const { data: subs } = await admin.from('subscriptions').select('id,status,ends_at,portal_url')
    .or(`user_id.eq.${user.id},email.ilike.${(user.email ?? '').replace(/[,()]/g, '')}`);
  const live = (subs ?? []).filter((s) => ['on_trial', 'active', 'past_due', 'paused', 'unpaid'].includes(s.status));
  if (live.length) {
    return new Response(JSON.stringify({ error: 'Cancel your subscription before deleting the account.', portal_url: live[0].portal_url }), { status: 409, headers: h });
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: h });
  return new Response(JSON.stringify({ deleted: true }), { headers: h });
});
