// Supabase Edge Function: receives Lemon Squeezy webhooks and updates subscriptions.
// Deploy with JWT verification off (Lemon Squeezy signs requests with its own secret):
//   supabase functions deploy ls-webhook --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handleWebhook, type BillingStore } from '../_shared/billing.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const list = (k: string) => env(k).split(',').map((s) => s.trim()).filter(Boolean);

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const store: BillingStore = {
  async recordEvent(id, name, payload) {
    const { error } = await sb.from('webhook_events').insert({ id, event_name: name, payload });
    if (error && error.code === '23505') return false;
    if (error) throw error;
    return true;
  },
  async userExists(id) {
    const { data } = await sb.from('profiles').select('id').eq('id', id).maybeSingle();
    return !!data;
  },
  async findUserIdByEmail(email) {
    const { data } = await sb.from('profiles').select('id').ilike('email', email).limit(1).maybeSingle();
    return data?.id ?? null;
  },
  async getSubscription(id) {
    const { data } = await sb.from('subscriptions').select('ls_updated_at').eq('id', id).maybeSingle();
    return data ?? null;
  },
  async upsertSubscription(row) {
    const { error } = await sb.from('subscriptions').upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async markRefunded(orderId) {
    const { data, error } = await sb.from('subscriptions').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('order_id', orderId).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  },
  async ensureLabTeam(id) {
    const { error } = await sb.rpc('ensure_lab_team', { sub_id: id });
    if (error) throw error;
  },
};

const cfg = {
  secret: env('LEMONSQUEEZY_WEBHOOK_SECRET'),
  storeId: env('LEMONSQUEEZY_STORE_ID'),
  proVariants: list('LEMONSQUEEZY_PRO_VARIANTS'),
  labVariants: list('LEMONSQUEEZY_LAB_VARIANTS'),
  allowTestMode: env('LEMONSQUEEZY_ALLOW_TEST_MODE') === 'true',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  try {
    const raw = await req.text();
    const res = await handleWebhook(raw, req.headers.get('X-Signature') ?? '', store, cfg);
    return new Response(res.body, { status: res.status });
  } catch (e) {
    console.error('webhook error', e);
    // 500 makes Lemon Squeezy retry the delivery later
    return new Response('error', { status: 500 });
  }
});
