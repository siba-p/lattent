# Turning on accounts, cloud storage and payments

This takes about 40 minutes. You need three accounts:
- **Supabase**, for sign-in and the database. It is free.
- **Lemon Squeezy**, for payments. It is free, and takes a fee per sale.
- **Resend**, to send sign-in emails. It is free up to 3,000 emails a month.

Everything else is already built and tested.

## 1. Supabase (accounts and storage)

1. Sign up at **supabase.com** and create a project:
   - Name: `lattent`.
   - Pick a strong database password and store it in your password manager.
   - Region: the one closest to most users. For a global audience, use `us-east-1`; for Europe, use `eu-central-1`.
2. Open **Project Settings → API** and copy two values:
   - the **Project URL**, which looks like `https://abcd1234.supabase.co`. The part before `.supabase.co` is your project ref.
   - the **anon public** key, which is safe to publish.
   - Do **not** copy the `service_role` key anywhere. It stays inside Supabase.
3. Open **Account (top right) → Access Tokens** and create a token for the setup script.

**Sign-in emails.** Supabase's built-in mailer sends only a few emails per hour, which is fine for testing but not for real users.
1. Sign up at **resend.com** and verify a domain you own, or use their test domain while you're trying things out.
2. Create an SMTP key.
3. In Supabase, open **Authentication → Emails → SMTP Settings** and enter:
   - host `smtp.resend.com`, port `465`, user `resend`;
   - password: the key from Resend;
   - sender: `Lattent <login@your-domain>`.
4. Optionally, edit the **Magic Link** email template so it says "Sign in to Lattent".

## 2. Lemon Squeezy (payments)

1. Sign up at **lemonsqueezy.com** and create a store named **Lattent**. Complete identity and payout verification; your Indian bank account works for payouts.
2. Stay in **Test mode** (toggle at the bottom left) for now.
3. Create a product **Lattent Pro** with these subscription variants:

   | Variant | Price | Interval |
   |---|---|---|
   | Pro monthly | $4 | monthly |
   | Pro yearly | $29 | yearly |

4. Create a second product **Lattent Lab**: subscription, $99, yearly.
5. Do not enable license keys; plans are tied to accounts now.
6. For each product, set **Confirmation modal → Button link** to `https://siba-p.github.io/lattent/account/?paid=1`.
7. For each variant, use **Share** to copy the checkout link, which looks like `https://lattent.lemonsqueezy.com/buy/…`. Also note the **variant id** (the number in the variant's URL) and your **store id** (**Settings → Stores**).
8. Open **Settings → Webhooks → +** and fill in:
   - **Callback URL:** `https://<project-ref>.supabase.co/functions/v1/ls-webhook`
   - **Signing secret:** a long random string; generate one with `openssl rand -hex 32`. Keep it for step 3.
   - **Events:** `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused` and `order_refunded`.

## 3. Deploy the backend (one command)

From the repository folder:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_…
export SUPABASE_PROJECT_REF=abcd1234
export SUPABASE_DB_PASSWORD='…'
export SUPABASE_ANON_KEY=eyJ…
export LEMONSQUEEZY_WEBHOOK_SECRET=…        # the same string as in the webhook
export LEMONSQUEEZY_STORE_ID=12345
export LEMONSQUEEZY_PRO_VARIANTS=111111,222222   # Pro monthly and Pro yearly
export LEMONSQUEEZY_LAB_VARIANTS=333333
export CHECKOUT_MONTHLY=https://lattent.lemonsqueezy.com/buy/…
export CHECKOUT_YEARLY=https://lattent.lemonsqueezy.com/buy/…
export CHECKOUT_LAB=https://lattent.lemonsqueezy.com/buy/…
export LEMONSQUEEZY_ALLOW_TEST_MODE=true          # only while testing
bash scripts/setup-backend.sh
git add assets/js/config.js && git commit -m "Connect accounts and payments" && git push
```

The script does the following:
- creates the tables and security policies;
- applies the sign-in settings;
- stores the secrets in Supabase;
- deploys the webhook and account-deletion functions;
- writes only the public URL and anon key into the website.

If `config push` is not available, set the auth URLs by hand in **Authentication → URL Configuration**:
- **Site URL:** `https://siba-p.github.io/lattent/`
- **Redirect URLs:** `https://siba-p.github.io/lattent/**`

## 4. Test, then go live

1. Open the site and sign in on the **Account** page. The email link should bring you back already signed in.
2. In Studio, use **Cloud → Save to cloud**, then open the project in another browser.
3. Buy Pro with Lemon Squeezy's test card `4242 4242 4242 4242` (any future date, any CVC). Within a few seconds the account page should show **Pro**. In Lemon Squeezy, **Webhooks → Recent deliveries** should show `200`.
4. Cancel the test subscription from **Manage billing**. You keep Pro until the period ends.
5. To go live:
   1. Switch Lemon Squeezy to **Live mode** and create the same products there; live variants get new ids and links.
   2. Run the setup script again with the live values and `LEMONSQUEEZY_ALLOW_TEST_MODE=false`.
   3. Push.

## Keeping it healthy

- **Billing problems:** check **Supabase → Edge Functions → ls-webhook → Logs**, and **Lemon Squeezy → Webhooks → Recent deliveries**, which retries failed deliveries.
- **Changing prices:** create new variants. Existing subscribers keep the variant they bought. Add the new variant ids to `LEMONSQUEEZY_PRO_VARIANTS` and rerun the script.
- **Security tests:** run before every change to `supabase/`: `npm ci && npm run test:db`. GitHub Actions runs them on every push.
- **Backups:** the free Supabase tier keeps daily backups for 7 days. Users can download all their cloud data from the account page at any time.
