// Lemon Squeezy webhook logic, independent of Deno and Supabase so it can be unit-tested.
// Only signature-verified events change billing state, and every change is idempotent.

export type Plan = 'pro' | 'lab';

export interface BillingConfig {
  secret: string;
  storeId: string;
  proVariants: string[];
  labVariants: string[];
  allowTestMode: boolean;
}

export interface SubscriptionRow {
  id: string;
  user_id: string | null;
  email: string;
  plan: Plan;
  status: string;
  variant_id: string;
  customer_id: string;
  order_id: string;
  renews_at: string | null;
  ends_at: string | null;
  portal_url: string | null;
  update_payment_url: string | null;
  test_mode: boolean;
  ls_updated_at: string | null;
}

export interface BillingStore {
  /** Store the raw event; return false if this exact event was already processed. */
  recordEvent(id: string, name: string, payload: unknown): Promise<boolean>;
  userExists(id: string): Promise<boolean>;
  findUserIdByEmail(email: string): Promise<string | null>;
  getSubscription(id: string): Promise<{ ls_updated_at: string | null } | null>;
  upsertSubscription(row: SubscriptionRow): Promise<void>;
  markRefunded(orderId: string): Promise<number>;
  ensureLabTeam(subscriptionId: string): Promise<void>;
}

export interface Result { status: number; body: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 512 * 1024;

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** HMAC-SHA256 of the raw body, compared in constant time with the X-Signature header. */
export async function verifySignature(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!secret || !signature) return false;
  const given = hexToBytes(signature.trim());
  if (!given || given.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= mac[i] ^ given[i];
  return diff === 0;
}

export function planForVariant(variantId: unknown, cfg: BillingConfig): Plan | null {
  const v = String(variantId ?? '');
  if (cfg.labVariants.includes(v)) return 'lab';
  if (cfg.proVariants.includes(v)) return 'pro';
  return null;
}

const ok = (body: string): Result => ({ status: 200, body });

export async function handleWebhook(raw: string, signature: string, store: BillingStore, cfg: BillingConfig): Promise<Result> {
  if (raw.length > MAX_BODY) return { status: 413, body: 'payload too large' };
  if (!(await verifySignature(raw, signature, cfg.secret))) return { status: 401, body: 'invalid signature' };

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return { status: 400, body: 'invalid json' }; }
  const name: string = ev?.meta?.event_name ?? '';
  const data = ev?.data;
  const a = data?.attributes ?? {};
  if (!name || !data) return { status: 400, body: 'malformed event' };

  if (cfg.storeId && String(a.store_id ?? '') !== String(cfg.storeId)) return ok('ignored: other store');
  if (a.test_mode && !cfg.allowTestMode) return ok('ignored: test mode');

  const eventId = `${name}:${data.type}:${data.id}:${a.updated_at ?? a.created_at ?? ''}`;
  if (!(await store.recordEvent(eventId, name, ev))) return ok('duplicate');

  if (data.type === 'subscriptions' && name.startsWith('subscription_')) {
    const plan = planForVariant(a.variant_id, cfg);
    if (!plan) return ok('ignored: unknown variant');
    const email = String(a.user_email ?? '').trim().toLowerCase();
    if (!email) return { status: 400, body: 'missing email' };

    const existing = await store.getSubscription(String(data.id));
    if (existing?.ls_updated_at && a.updated_at && Date.parse(existing.ls_updated_at) > Date.parse(a.updated_at)) {
      return ok('ignored: stale update');
    }

    let userId: string | null = null;
    const claimed = ev?.meta?.custom_data?.user_id;
    if (typeof claimed === 'string' && UUID.test(claimed) && (await store.userExists(claimed))) userId = claimed;
    if (!userId) userId = await store.findUserIdByEmail(email);

    const row: SubscriptionRow = {
      id: String(data.id),
      user_id: userId,
      email,
      plan,
      status: String(a.status ?? 'unknown'),
      variant_id: String(a.variant_id ?? ''),
      customer_id: String(a.customer_id ?? ''),
      order_id: String(a.order_id ?? ''),
      renews_at: a.renews_at ?? null,
      ends_at: a.ends_at ?? null,
      portal_url: a.urls?.customer_portal ?? null,
      update_payment_url: a.urls?.update_payment_method ?? null,
      test_mode: !!a.test_mode,
      ls_updated_at: a.updated_at ?? null,
    };
    await store.upsertSubscription(row);
    if (plan === 'lab' && userId) await store.ensureLabTeam(row.id);
    return ok(`subscription ${row.id} ${row.status}`);
  }

  if (data.type === 'orders' && name === 'order_refunded') {
    const n = await store.markRefunded(String(data.id));
    return ok(`refunded ${n}`);
  }

  return ok('ignored: ' + name);
}
