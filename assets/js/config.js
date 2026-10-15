/* Site configuration. Fill in the Lemon Squeezy values once the store is approved;
   until then the Pro buttons offer the free 7-day trial only. */
window.BF_CONFIG = {
  brand: 'Lattent',
  /* Supabase project (Settings → API). The anon key is public by design; row-level
     security in the database protects every table. Leave empty to run without accounts. */
  supabase: { url: '', anonKey: '' },
  /* Lemon Squeezy checkout links (Share → Checkout link) for each variant */
  checkout: { monthly: '', yearly: '', lab: '' },
  /* Numeric store id from Lemon Squeezy → Settings → Stores. Licence keys issued by
     any other store are refused. */
  storeId: null,
  /* Razorpay (India: UPI, RuPay and other cards, net banking, wallets). Paste a subscription
     link or a payment link for each plan from the Razorpay dashboard. */
  razorpay: { monthly: '', yearly: '', lab: '' },
  /* USD prices for Lemon Squeezy; INR prices for Razorpay */
  prices: { monthly: 4, yearly: 29, lab: 99, inr: { monthly: 299, yearly: 1999, lab: 6999 } },
  earlyAccess: true,
  trialDays: 7,
  support: '',
  site: 'siba-p.github.io/lattent',
  author: { name: 'Sibasankar Panigrahy, PhD', url: 'https://siba-p.github.io/' }
};
