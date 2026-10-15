// Razorpay webhook logic (subscriptions and one-time payment links), independent of Deno and
// Supabase so it can be unit-tested. Only signature-verified events change billing state.
import { verifySignature, type BillingStore, type Result, type SubscriptionRow, type Plan } from './billing.ts';

export interface RazorpayConfig {
  secret: string;
  proPlans: string[];      // Razorpay plan ids (plan_...) for Pro subscriptions
  labPlans: string[];
  proLinks: string[];      // payment link ids (plink_...) for one-time Pro purchases
  labLinks: string[];
  prepaidMonths: number;   // how long a one-time purchase lasts
}

const MAX_BODY = 512 * 1024;
const iso = (unix: unknown) => (typeof unix === 'number' && unix > 0 ? new Date(unix * 1000).toISOString() : null);
const STATUS: Record<string, string> = {
  created: 'pending', authenticated: 'active', active: 'active', pending: 'past_due', halted: 'past_due',
  paused: 'paused', resumed: 'active', cancelled: 'cancelled', completed: 'expired', expired: 'expired'
};

function planFor(id: string, pro: string[], lab: string[]): Plan | null {
  if (lab.includes(id)) return 'lab';
  if (pro.includes(id)) return 'pro';
  return null;
}

/** Razorpay signs the raw body with HMAC-SHA256 (hex) in the X-Razorpay-Signature header. */
export async function handleRazorpay(raw: string, signature: string, eventId: string, store: BillingStore, cfg: RazorpayConfig): Promise<Result> {
  if (raw.length > MAX_BODY) return { status: 413, body: 'payload too large' };
  if (!(await verifySignature(raw, signature, cfg.secret))) return { status: 401, body: 'invalid signature' };
  let ev: any;
  try { ev = JSON.parse(raw); } catch { return { status: 400, body: 'invalid json' }; }
  const name: string = ev?.event ?? '';
  if (!name || !ev.payload) return { status: 400, body: 'malformed event' };
  const created = typeof ev.created_at === 'number' ? new Date(ev.created_at * 1000).toISOString() : new Date().toISOString();
  const id = eventId || `${name}:${created}:${JSON.stringify(ev.payload).length}`;
  if (!(await store.recordEvent('rzp:' + id, name, ev))) return { status: 200, body: 'duplicate' };

  const pay = ev.payload.payment?.entity ?? {};
  if (name.startsWith('subscription.')) {
    const s = ev.payload.subscription?.entity;
    if (!s?.id) return { status: 400, body: 'missing subscription' };
    const plan = planFor(String(s.plan_id ?? ''), cfg.proPlans, cfg.labPlans);
    if (!plan) return { status: 200, body: 'ignored: unknown plan' };
    const email = String(pay.email ?? s.notes?.email ?? '').trim().toLowerCase();
    const rowId = 'rzp_' + s.id;
    const existing = await store.getSubscription(rowId);
    if (existing?.ls_updated_at && Date.parse(existing.ls_updated_at) > Date.parse(created)) return { status: 200, body: 'ignored: stale update' };
    if (!email && !existing) return { status: 200, body: 'ignored: no email yet' };
    const claimed = String(s.notes?.user_id ?? '');
    let userId: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(claimed) && (await store.userExists(claimed))) userId = claimed;
    if (!userId && email) userId = await store.findUserIdByEmail(email);
    /* later events (cancelled, completed) often carry no payment: keep who the subscriber is */
    const prev = existing as { email?: string; user_id?: string | null } | null;
    if (!userId && prev?.user_id) userId = prev.user_id;
    const row: SubscriptionRow & { provider: string } = {
      id: rowId, user_id: userId, email: email || prev?.email || 'unknown', plan, status: STATUS[s.status] ?? String(s.status ?? 'unknown'),
      variant_id: String(s.plan_id ?? ''), customer_id: String(s.customer_id ?? ''), order_id: String(pay.order_id ?? ''),
      renews_at: iso(s.current_end), ends_at: iso(s.ended_at) ?? (s.status === 'cancelled' ? iso(s.current_end) : null),
      portal_url: s.short_url ?? null, update_payment_url: null, test_mode: false, ls_updated_at: created, provider: 'razorpay'
    };
    await store.upsertSubscription(row);
    if (plan === 'lab' && ['active'].includes(row.status)) await store.ensureLabTeam(rowId);
    return { status: 200, body: 'ok' };
  }
  if (name === 'payment_link.paid') {
    const l = ev.payload.payment_link?.entity;
    if (!l?.id) return { status: 400, body: 'missing payment link' };
    const plan = planFor(String(l.id), cfg.proLinks, cfg.labLinks);
    if (!plan) return { status: 200, body: 'ignored: unknown link' };
    const email = String(pay.email ?? l.customer?.email ?? '').trim().toLowerCase();
    if (!email) return { status: 400, body: 'missing email' };
    const userId = await store.findUserIdByEmail(email);
    const ends = new Date(Date.parse(created)); ends.setMonth(ends.getMonth() + (cfg.prepaidMonths || 12));
    const rowId = 'rzpl_' + String(pay.id ?? l.id);
    const row: SubscriptionRow & { provider: string } = {
      id: rowId, user_id: userId, email, plan, status: 'prepaid', variant_id: String(l.id), customer_id: String(pay.customer_id ?? ''),
      order_id: String(pay.order_id ?? pay.id ?? ''), renews_at: null, ends_at: ends.toISOString(), portal_url: null, update_payment_url: null,
      test_mode: false, ls_updated_at: created, provider: 'razorpay'
    };
    await store.upsertSubscription(row);
    if (plan === 'lab') await store.ensureLabTeam(rowId);
    return { status: 200, body: 'ok' };
  }
  if (name === 'refund.processed' || name === 'payment.refunded') {
    const orderId = String(pay.order_id ?? ev.payload.refund?.entity?.payment_id ?? '');
    const n = orderId ? await store.markRefunded(orderId) : 0;
    return { status: 200, body: 'refunded ' + n };
  }
  return { status: 200, body: 'ignored: ' + name };
}
