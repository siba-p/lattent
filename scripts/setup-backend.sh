#!/usr/bin/env bash
# Deploys the Lattent backend to your Supabase project and writes the public keys
# into assets/js/config.js. Run from the repository root:
#
#   export SUPABASE_ACCESS_TOKEN=...        # supabase.com → Account → Access tokens
#   export SUPABASE_PROJECT_REF=...         # the id in your project URL
#   export SUPABASE_DB_PASSWORD=...         # chosen when you created the project
#   export SUPABASE_ANON_KEY=...            # Project settings → API → anon public
#   export LEMONSQUEEZY_WEBHOOK_SECRET=...  # the signing secret you typed in Lemon Squeezy
#   export LEMONSQUEEZY_STORE_ID=...        # Settings → Stores (number)
#   export LEMONSQUEEZY_PRO_VARIANTS=...    # variant ids of Pro monthly and yearly, comma-separated
#   export LEMONSQUEEZY_LAB_VARIANTS=...    # variant id of Lab
#   export CHECKOUT_MONTHLY=... CHECKOUT_YEARLY=... CHECKOUT_LAB=...   # checkout links
#   bash scripts/setup-backend.sh
#
# Secrets (service role key, webhook secret) never leave Supabase; only the public
# URL and anon key are written to the website.
set -euo pipefail
need() { [ -n "${!1:-}" ] || { echo "Missing environment variable $1"; exit 1; }; }
for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_ANON_KEY \
         LEMONSQUEEZY_WEBHOOK_SECRET LEMONSQUEEZY_STORE_ID LEMONSQUEEZY_PRO_VARIANTS LEMONSQUEEZY_LAB_VARIANTS; do need "$v"; done

SB="npx --yes supabase@2"
echo "› Linking project $SUPABASE_PROJECT_REF"
$SB link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "› Applying database schema and security policies"
$SB db push --password "$SUPABASE_DB_PASSWORD"

echo "› Applying auth settings (site URL, redirect URLs, rate limits)"
$SB config push || echo "  (config push unavailable; set the URLs in the dashboard as described in docs/SETUP.md)"

echo "› Setting function secrets"
$SB secrets set \
  LEMONSQUEEZY_WEBHOOK_SECRET="$LEMONSQUEEZY_WEBHOOK_SECRET" \
  LEMONSQUEEZY_STORE_ID="$LEMONSQUEEZY_STORE_ID" \
  LEMONSQUEEZY_PRO_VARIANTS="$LEMONSQUEEZY_PRO_VARIANTS" \
  LEMONSQUEEZY_LAB_VARIANTS="$LEMONSQUEEZY_LAB_VARIANTS" \
  LEMONSQUEEZY_ALLOW_TEST_MODE="${LEMONSQUEEZY_ALLOW_TEST_MODE:-false}" \
  SITE_ORIGINS="${SITE_ORIGINS:-https://siba-p.github.io}"

echo "› Deploying Edge Functions"
$SB functions deploy ls-webhook --no-verify-jwt
$SB functions deploy delete-account

echo "› Writing public settings to assets/js/config.js"
node scripts/configure.mjs \
  --supabase-url "https://$SUPABASE_PROJECT_REF.supabase.co" \
  --anon-key "$SUPABASE_ANON_KEY" \
  --store-id "$LEMONSQUEEZY_STORE_ID" \
  --monthly "${CHECKOUT_MONTHLY:-}" --yearly "${CHECKOUT_YEARLY:-}" --lab "${CHECKOUT_LAB:-}"

echo
echo "Done. Webhook URL for Lemon Squeezy:"
echo "  https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/ls-webhook"
echo "Commit and push assets/js/config.js to publish."
