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
  prices: { monthly: 4, yearly: 29, lab: 299, inr: { monthly: 299, yearly: 1999, lab: 19999 } },
  /* Access codes issued by the founders with scripts/access-code.py: only the SHA-256 of
     "email|code" is listed, with the plan ('pro' or 'lab') and an optional end date. */
  access: [
    { h: '3ddd21503774d57b98a23c95a799d449863ae93a835f8c1f4a0e7b3ecd3c6c18', plan: 'pro', until: null, note: 'founder' },
  ],
  earlyAccess: true,
  trialDays: 7,
  support: 'sibasankarpanigrahy08@gmail.com',
  /* Web3Forms access key: delivers contact-form messages to the support inbox without a server.
     Get one free at https://web3forms.com (enter the support address; the key arrives by email).
     Leave empty and the form opens the visitor's own email app instead. */
  web3forms: 'f9c05839-d007-45df-b64f-1cf051ba5580',
  site: 'siba-p.github.io/lattent',
  /* shown in the site footer; url is optional */
  founders: [{ name: 'Sibasankar Panigrahy', url: 'https://siba-p.github.io/' }, { name: 'Satyendra Rajput', url: '' }],
  foundersNote: 'both PhDs from IIT Delhi'
};
