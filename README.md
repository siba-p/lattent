# Lattent

**Lattent Studio** is a browser workspace for scientific data, in the spirit of GraphPad Prism but for every lab:
- data tables (XY, Column, Multiple variables);
- nonlinear regression with 35 equations from materials science, polymers, nanomaterials, chemistry and biology, plus user-defined equations and AICc auto-fit;
- statistics: t tests, ANOVA with Tukey, Kruskal–Wallis, correlation and regression;
- spectra and materials analyses: multi-peak fitting, XRD Scherrer and Williamson–Hall, Tauc band gap, tensile tests;
- PCA, clustering, and Gaussian-process Bayesian optimisation for materials discovery;
- an AI co-scientist (built-in suggestions, plus Claude or GPT chat with the user's own key) that plans analyses while the validated engine computes them.

Quick calculators cover routine bench assays: dose–response, standard curves, enzyme kinetics and qPCR.

The analysis is free. Pro adds publication exports, auto-written methods and results, CSV and report export, project files, more cloud storage and the AI chat.

The site is static, hosted on GitHub Pages. The backend runs on Supabase:
- Postgres with row-level security, holding cloud projects, Lab teams and subscriptions.
- Two Edge Functions: one for the Lemon Squeezy webhook, one for account deletion.

Payments go through Lemon Squeezy as merchant of record. **To turn on accounts and payments, follow [docs/SETUP.md](docs/SETUP.md).**

Live site: https://siba-p.github.io/lattent/

## Structure

| Path | What it holds |
|---|---|
| `studio/`, `assets/js/studio.js` | The Studio workspace: tables, analysis catalogue, results, co-scientist |
| `assets/js/models.js` | Equation library, safe expression parser, nonlinear regression and auto-fit |
| `assets/js/analysis.js` | Statistics, PCA, k-means, Gaussian processes and Bayesian optimisation, peaks, XRD, Tauc, tensile |
| `assets/js/samples.js` | Example projects, one per field |
| `assets/js/ml-features.js`, `ml.js`, `assets/models/shape-v1.js` | Lattent's own specialist models (shape recogniser, scatter model), running in the browser |
| `tests/ml/` | Simulator, training script and checks for the specialist models |
| `tools/`, `scripts/build_tools.py` | Quick-tool pages for materials and chemistry (generated) |
| `assets/js/stats.js` | Levenberg–Marquardt fitting, covariance, t, F, χ² and studentized-range distributions, delta method |
| `assets/js/engines.js` | Analysis engines for the four tools (no DOM access; shared with the tests) |
| `assets/js/plot.js` | SVG charts used both on screen and for exported figures |
| `assets/js/shell.js` | Header and footer, table parsing, exports, write-up panel, Pro licence and trial gate |
| `assets/js/config.js` | Prices, checkout links, store id, support address |
| `dose.js`, `stdcurve.js`, `kinetics.js`, `qpcr.js` | The tool pages |
| `assets/js/cloud.js`, `account.js` | Sign-in, plan, cloud projects, Lab teams, checkout, account deletion |
| `supabase/migrations/` | Database schema, row-level security policies, quotas, team functions |
| `supabase/functions/` | `ls-webhook` (signed Lemon Squeezy events) and `delete-account` |
| `scripts/` | One-command backend deployment and site configuration |
| `tests/` | Validation against SciPy; database security and webhook tests (`npm run test:db`) |

It is a static site with no build step. To serve it locally, run `python3 -m http.server` and open http://localhost:8000.

## Specialist models

The co-scientist's suggestions and shape-guided auto-fit use two small neural networks trained on simulated lab data. The training set covers 13 families of behaviour, with realistic ranges, spacings, replicates, outliers and noise. To retrain:

```bash
for k in 1 2 3 4; do node tests/ml/simulate.js 1300 $((k*7919)) /tmp/ml/train$k.json & done
node tests/ml/simulate.js 600 424242 /tmp/ml/test.json; wait
python tests/ml/train.py /tmp/ml assets/models/shape-v1.js      # needs scikit-learn
node tests/ml/check.js                                         # parity and realistic cases
```

## Validation

```bash
node tests/run-engines.js /tmp/bf.json && python tests/check_scipy.py /tmp/bf.json      # calculators
node tests/run-studio.js /tmp/st.json && python tests/check_studio.py /tmp/st.json      # Studio engine
```

Run this before every release. All checks must print `ok`.

## Turning on payments (licence-key fallback)

Account-based plans (docs/SETUP.md) are the main path. Licence keys still work for buyers without an account:

1. Create a store at lemonsqueezy.com and complete identity and payout verification. Lemon Squeezy is the merchant of record, so it collects and remits VAT, GST and US sales tax.
2. Create one product, **Lattent Pro**, with three variants:
   - Monthly subscription, $4.
   - Yearly subscription, $29.
   - **Lab** yearly subscription, $99.
3. On each variant, enable **License keys**. Set the activation limit to 3 for Pro and 10 for Lab, and set the key length to match the subscription.
4. Copy each variant's checkout link (Share → Checkout link) and the numeric store id (Settings → Stores) into `assets/js/config.js`:
   ```js
   checkout: { monthly: 'https://…', yearly: 'https://…', lab: 'https://…' },
   storeId: 12345,
   support: 'support@your-domain',
   ```
5. In the product's confirmation email, tell the customer to paste their key at `/account/`.

Licence keys are checked in the browser against Lemon Squeezy's public licence API, so no server is needed. The Pro gate runs on the client, so a determined user could bypass it. That is an accepted trade-off for this audience: there are no servers to run and no customer data to hold.

© Lattent. All rights reserved.
