/* Site configuration. Fill in the Lemon Squeezy values once the store is approved;
   until then the Pro buttons offer the free 7-day trial only. */
window.BF_CONFIG = {
  brand: 'Benchfit',
  /* Supabase project (Settings → API). The anon key is public by design; row-level
     security in the database protects every table. Leave empty to run without accounts. */
  supabase: { url: '', anonKey: '' },
  /* Lemon Squeezy checkout links (Share → Checkout link) for each variant */
  checkout: { monthly: '', yearly: '', lab: '' },
  /* Numeric store id from Lemon Squeezy → Settings → Stores. Licence keys issued by
     any other store are refused. */
  storeId: null,
  prices: { monthly: 4, yearly: 29, lab: 99 },
  earlyAccess: true,
  trialDays: 7,
  support: '',
  site: 'siba-p.github.io/benchfit',
  author: { name: 'Sibasankar Panigrahy, PhD', url: 'https://siba-p.github.io/' }
};
