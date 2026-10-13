# Benchfit

Assay analysis that runs in the browser: dose–response (IC50/EC50), standard curves (ELISA, BCA, Bradford), enzyme kinetics (Km, Vmax, kcat, Ki) and qPCR relative expression (ΔΔCt and Pfaffl). The analysis is free; Pro adds publication exports, auto-written methods and results, CSV and report export, and project files.

Live site: https://siba-p.github.io/benchfit/

## Structure

| Path | What it holds |
|---|---|
| `assets/js/stats.js` | Levenberg–Marquardt fitting, covariance, t distribution, Welch test, delta method |
| `assets/js/engines.js` | Analysis engines for the four tools (no DOM access; shared with the tests) |
| `assets/js/plot.js` | SVG charts used both on screen and for exported figures |
| `assets/js/shell.js` | Header and footer, table parsing, exports, write-up panel, Pro licence and trial gate |
| `assets/js/config.js` | Prices, checkout links, store id, support address |
| `dose.js`, `stdcurve.js`, `kinetics.js`, `qpcr.js` | The tool pages |
| `tests/` | Validation against SciPy |

It is a static site with no build step. To serve it locally, run `python3 -m http.server` and open http://localhost:8000.

## Validation

```bash
node tests/run-engines.js /tmp/bf.json
python tests/check_scipy.py /tmp/bf.json   # needs numpy and scipy
```

Run this before every release. All checks must print `ok`.

## Turning on payments (Lemon Squeezy)

1. Create a store at lemonsqueezy.com and complete identity and payout verification. Lemon Squeezy is the merchant of record, so it collects and remits VAT, GST and US sales tax.
2. Create one product, **Benchfit Pro**, with three variants:
   - Monthly subscription, $7.
   - Yearly subscription, $49.
   - **Lab** yearly subscription, $249.
3. On each variant, enable **License keys**. Set the activation limit to 3 for Pro and 10 for Lab, and set the key length to match the subscription.
4. Copy each variant's checkout link (Share → Checkout link) and the numeric store id (Settings → Stores) into `assets/js/config.js`:
   ```js
   checkout: { monthly: 'https://…', yearly: 'https://…', lab: 'https://…' },
   storeId: 12345,
   support: 'support@your-domain',
   ```
5. In the product's confirmation email, tell the customer to paste their key at `/account/`.

Licence keys are checked in the browser against Lemon Squeezy's public licence API, so no server is needed. The Pro gate runs on the client, so a determined user could bypass it. That is an accepted trade-off for this audience: there are no servers to run and no customer data to hold.

© Benchfit. All rights reserved.
