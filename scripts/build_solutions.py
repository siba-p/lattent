"""Generate the Solutions pages (solutions/<slug>/index.html), the Solutions hub and the
What's new page from one template. Run from the repository root:
    python3 scripts/build_solutions.py
Every workflow below links to something that exists today: a quick tool, a Studio example or
a Discover view. Keep the claims to what the engine actually reports.
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.lemonsqueezy.com; object-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<script src="{root}assets/js/theme.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:image" content="https://siba-p.github.io/lattent/assets/img/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="apple-touch-icon" href="{root}assets/img/apple-touch-icon.png">
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#090c1b" media="(prefers-color-scheme: dark)">
<link rel="icon" href="{root}favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{fonts}" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/css/bf.css">
<link rel="stylesheet" href="{root}assets/css/solutions.css">
</head>
<body>
<header data-bf></header>
"""
FOOT = """<footer data-bf></footer>
<script src="{root}assets/js/config.js"></script>
<script src="{root}assets/js/stats.js"></script>
<script src="{root}assets/js/plot.js"></script>
<script src="{root}assets/js/shell.js"></script>
</body>
</html>
"""

# (link, label) shortcuts
T = {
    "xrd": ("tools/xrd-crystallite-size/", "XRD crystallite size tool"),
    "tauc": ("tools/band-gap-tauc/", "Band-gap tool"),
    "arr": ("tools/activation-energy-arrhenius/", "Activation-energy tool"),
    "iso": ("tools/adsorption-isotherms/", "Isotherm tool"),
    "tens": ("tools/tensile-test/", "Tensile-test tool"),
    "peak": ("tools/peak-fitting/", "Peak-fitting tool"),
    "fit": ("tools/curve-fitting/", "Curve-fitting tool"),
    "cal": ("standard-curve/", "Calibration tool"),
    "phase": ("studio/?discover=phase", "Identify phases"),
    "db": ("studio/?discover=search", "Search the database"),
    "gen": ("studio/?discover=gen", "Generate materials"),
}
def ex(name, label):
    return ("studio/?example=" + name, label)

FIELDS = [
    dict(slug="nanomaterials", name="Nanomaterials", short="Crystallite size, phases, band gaps",
         h1="Nanomaterials, measured and identified.",
         lede="Size your crystallites, confirm the phase and read the band gap of your nanoparticles, with every number traceable to the fit that produced it.",
         cta=ex("xrd", "Open the gold-nanoparticle example"), img=("discover-phase.webp", "Gold nanoparticle XRD identified as fcc Au, Fm-3m, with every peak indexed"),
         flows=[
             ("Crystallite size and strain", "Fit every Bragg peak with pseudo-Voigt profiles on a fitted baseline, remove instrumental broadening and get Scherrer and Williamson–Hall sizes.", ["d-spacing for every peak", "Scherrer size per reflection", "Williamson–Hall size and microstrain"], T["xrd"]),
             ("Which phase is it?", "Match your peaks against every computed structure of your elements in the Alexandria database. Lattent refines the lattice scale and flags peaks that point to a second phase.", ["Ranked phases with match scores", "Peaks indexed with hkl", "Second-phase detection"], T["phase"]),
             ("Band gaps and confinement", "Extract the optical gap from UV–Vis with a Tauc plot, then fit gap against particle size with a Brus-type confinement model.", ["Direct or indirect gap with a 95% CI", "Bulk gap from the size series"], T["tauc"]),
             ("Plasmonic sensing", "Fit the plasmon shift against refractive index to get the bulk sensitivity of your particles.", ["Sensitivity with its confidence interval", "Residual checks"], T["fit"]),
         ],
         eqs=["Scherrer", "Williamson–Hall", "Tauc (direct, indirect, forbidden)", "Quantum confinement (Brus-type)", "Confinement with Coulomb term", "Drude plasmon shift", "Pseudo-Voigt peaks"]),
    dict(slug="catalysis", name="Catalysis", short="Kinetics, isotherms, batch statistics",
         h1="Catalysis data, from kinetics to the next formulation.",
         lede="Extract activation energies, compare catalyst batches with the right statistics, fit adsorption isotherms, and let Bayesian optimisation choose the next composition to test.",
         cta=ex("anova", "Open the catalyst-batch example"), img=("anova.webp", "One-way ANOVA comparing the mass activity of catalyst batches, with Tukey significance brackets"),
         flows=[
             ("Activation energy", "Fit rate constants measured at several temperatures with the Arrhenius equation, with replicates and weighting handled properly.", ["Eₐ in kJ/mol and eV with a 95% CI", "Pre-exponential factor"], T["arr"]),
             ("Compare catalyst batches", "One-way or Welch’s ANOVA with Tukey or Holm–Šidák post tests. Lattent checks normality and equal variance first and suggests the right test.", ["Significance drawn on the graph", "Effect sizes, not only p-values"], ex("anova", "Catalyst-batch example")),
             ("Adsorption and uptake", "Rank Langmuir, Freundlich and Sips isotherms by AICc, and fit pseudo-first- and pseudo-second-order uptake kinetics.", ["q_max and affinity constants", "The model the data support"], T["iso"]),
             ("Optimise the formulation", "A Gaussian-process model learns how composition and conditions drive activity and proposes the most informative next experiments.", ["Next experiments, in batches", "Which inputs matter"], ex("discovery", "Optimisation example")),
         ],
         eqs=["Arrhenius", "Langmuir", "Freundlich", "Sips", "Pseudo-first-order", "Pseudo-second-order", "Tafel", "Michaelis–Menten"]),
    dict(slug="batteries-energy", name="Batteries and energy", short="Conductivity, cathodes, phase purity",
         h1="Battery and energy materials, from conductivity to new cathodes.",
         lede="Fit ionic conductivity across temperature, confirm phase purity by XRD, and explore new compositions in a chemical system before you synthesise them.",
         cta=ex("arrhenius", "Open the solid-electrolyte example"), img=("discover-gen.webp", "Generated compositions with predicted formation energy, band gap and novelty against the Alexandria database"),
         flows=[
             ("Ionic conductivity", "Fit σ(T) with Arrhenius or Vogel–Fulcher–Tammann models across replicate cells, and report the activation energy.", ["Eₐ in eV with a 95% CI", "VFT for polymer electrolytes"], T["arr"]),
             ("Phase purity", "Check a synthesised cathode or electrolyte against every computed structure of its elements, and spot impurity peaks.", ["Main phase and match score", "Unexplained peaks flagged"], T["phase"]),
             ("Explore a chemical system", "Lattent’s generative model proposes charge-balanced compositions in, for example, Li–Fe–P–O, and predicts their stability.", ["Candidate formulas with oxidation states", "Novelty against 5.8 million structures"], T["gen"]),
             ("Computed properties", "Look up formation energy, distance to the convex hull and band gap for known electrode and electrolyte phases, with a simulated XRD pattern.", ["Structure in 3D and CIF", "Simulated powder pattern"], T["db"]),
         ],
         eqs=["Arrhenius", "Vogel–Fulcher–Tammann", "Tafel", "Avrami (JMAK)", "Exponential decay"]),
    dict(slug="polymers", name="Polymers", short="Tensile tests, Tg, rheology, blends",
         h1="Polymer science, from stress–strain to the next blend.",
         lede="Read mechanical properties from tensile curves, relate Tg to molecular weight, model flow and relaxation, and optimise blend formulations with a Gaussian-process model.",
         cta=ex("tensile", "Open the tensile-test example"), img=("discovery.webp", "Bayesian optimisation suggesting the next polymer-blend experiments"),
         flows=[
             ("Tensile testing", "Young’s modulus from an automatically chosen linear region, 0.2% offset yield, ultimate strength, elongation at break and toughness.", ["All five properties from one curve", "Modulus region shown on the graph"], T["tens"]),
             ("Glass transition and chain length", "Fit Tg against Mn with Flory–Fox, and intrinsic viscosity against molar mass with Mark–Houwink.", ["Tg at infinite chain length", "Mark–Houwink K and a"], ex("floryfox", "Flory–Fox example")),
             ("Rheology and relaxation", "Carreau and Cross models for shear thinning, WLF shift factors and stretched-exponential relaxation.", ["η₀ and the power-law index", "WLF constants C₁ and C₂"], T["fit"]),
             ("Optimise a blend", "Bayesian optimisation that respects mixture constraints proposes the next compositions and processing settings.", ["Next blends to make", "Cross-validated model accuracy"], ex("discovery", "Blend-optimisation example")),
         ],
         eqs=["Flory–Fox", "Mark–Houwink", "Williams–Landel–Ferry", "Carreau", "Cross", "Stretched exponential (KWW)", "Avrami crystallisation", "Vogel–Fulcher–Tammann"]),
    dict(slug="semiconductors", name="Semiconductors and optics", short="Band gaps, PL decay, new absorbers",
         h1="Semiconductors and optics, from absorption edge to new absorbers.",
         lede="Measure optical band gaps, fit photoluminescence decays, compare with computed band gaps, and generate candidate compositions steered towards a target gap.",
         cta=ex("tauc", "Open the band-gap example"), img=("tauc.webp", "Tauc plot giving the optical band gap of ZnO nanocrystals"),
         flows=[
             ("Optical band gap", "Tauc analysis for direct, indirect and forbidden transitions, with the linear region of the absorption edge found automatically.", ["Gap with a 95% CI", "Absorption edge in nm"], T["tauc"]),
             ("Photoluminescence decay", "One- and two-phase exponential and stretched-exponential decays, compared by AICc.", ["Lifetimes with confidence intervals", "Stretching exponent β"], T["fit"]),
             ("Compare with DFT", "List every computed polymorph of your material with its band gap. PBE gaps typically run 30–50% below measured ones.", ["Gaps for all polymorphs", "Stability of each phase"], T["db"]),
             ("Design new absorbers", "Steer the generative model towards a target band gap within a chemical system such as Cs–Pb–Br, and see which candidates are new.", ["Predicted gap and stability", "Known or not in Alexandria"], T["gen"]),
         ],
         eqs=["Tauc", "One- and two-phase exponential decay", "Stretched exponential (KWW)", "Gaussian and Lorentzian peaks", "Quantum confinement (Brus-type)"]),
    dict(slug="electrochemistry", name="Electrochemistry", short="Tafel, conductivity, calibration",
         h1="Electrochemistry, fitted and tested.",
         lede="Fit Tafel slopes, ionic conductivities and sensor calibrations, resolve overlapping peaks and compare electrodes with statistics that check their own assumptions.",
         cta=ex("arrhenius", "Open the conductivity example"), img=("table.webp", "An XY table of ionic conductivity against temperature with replicate columns"),
         flows=[
             ("Tafel analysis", "Fit overpotential against log current density to get the Tafel slope with its confidence interval.", ["Tafel slope per decade", "Residual checks"], T["fit"]),
             ("Conductivity and activation energy", "Arrhenius or VFT fits of σ(T) with replicate columns recognised automatically.", ["Eₐ in kJ/mol and eV", "Confidence bands on the graph"], T["arr"]),
             ("Sensor calibration", "Linear, quadratic and 4PL calibration with unknowns read off with confidence intervals, recovery, LOD and LOQ.", ["Detection and quantitation limits", "Back-calculated recovery"], T["cal"]),
             ("Compare electrodes", "t tests and ANOVA with post tests, after normality and equal-variance checks.", ["The right test, suggested", "Significance on the graph"], ex("anova", "Comparison example")),
         ],
         eqs=["Tafel", "Arrhenius", "Vogel–Fulcher–Tammann", "Langmuir", "Linear and polynomial", "4PL calibration"]),
    dict(slug="ceramics-alloys", name="Ceramics and alloys", short="Hall–Petch, JMAK, alloy datasets",
         h1="Ceramics and alloys, from microstructure to property maps.",
         lede="Relate strength to grain size, follow transformation kinetics, identify phases, and explore multi-property datasets with PCA and clustering.",
         cta=ex("alloys", "Open the alloy-dataset example"), img=("discover-xtal.webp", "Rutile TiO2 in Lattent's 3D structure viewer with lattice parameters and computed properties"),
         flows=[
             ("Strength and grain size", "Fit yield strength against grain size with Hall–Petch, and read strength and ductility from tensile curves.", ["σ₀ and the Hall–Petch coefficient", "Tensile properties"], T["fit"]),
             ("Transformation kinetics", "Fit the transformed fraction over time with Avrami (JMAK) kinetics.", ["Avrami exponent n", "Half-time t½"], T["fit"]),
             ("Phases and structures", "Identify phases from XRD, then open any structure in 3D with its conventional cell, simulated pattern and CIF.", ["Ranked phases", "Structures and CIF files"], T["phase"]),
             ("Property datasets", "Principal component analysis, k-means clustering, correlation and regression across composition and property tables.", ["Families of similar alloys", "Which properties move together"], ex("alloys", "Alloy-dataset example")),
         ],
         eqs=["Hall–Petch", "Avrami (JMAK)", "Arrhenius", "Power law", "Curie–Weiss"]),
    dict(slug="analytical-chemistry", name="Analytical chemistry", short="Calibration, LOD/LOQ, chromatography",
         h1="Analytical chemistry, calibrated and defensible.",
         lede="Build calibration curves with detection limits, resolve chromatographic and spectroscopic peaks, fit reaction kinetics and report statistics a reviewer will accept.",
         cta=("standard-curve/", "Open the calibration tool"), img=("report.webp", "Auto-written methods, results and figure legend under an ANOVA graph"),
         flows=[
             ("Calibration curves", "Linear, quadratic, 4PL and 5PL calibration with weighting; unknowns with dilution factors and confidence intervals.", ["LOD and LOQ", "Back-calculated recovery"], T["cal"]),
             ("Peak resolution", "Chromatography, Raman, FTIR and XPS peaks on a fitted baseline, fitted simultaneously.", ["Positions, widths and areas", "Uncertainty on every centre"], T["peak"]),
             ("Reaction kinetics", "First-, second- and pseudo-order kinetics, with the best model chosen by AICc.", ["Rate constants with CIs", "Model comparison"], T["fit"]),
             ("Method statistics", "Descriptive statistics, normality and Grubbs outlier tests, t tests and ANOVA, with methods text written for you.", ["Assumption checks", "Methods and results paragraphs"], ("studio/", "Open Studio")),
         ],
         eqs=["Linear and quadratic", "4PL and 5PL", "Gaussian, Lorentzian, pseudo-Voigt", "Pseudo-first-order", "Second-order decay", "Michaelis–Menten"]),
]

CHANGES = [
    ("2026-10-16", "Lab files, explained candidates and a NIST benchmark", ["Drop instrument files anywhere in Studio: CSV, TXT, XY, JCAMP-DX (including compressed), PANalytical XRDML, Rigaku RAS, Bruker UXD, Thermo SPC and CIF. A CIF becomes a simulated diffraction pattern. Files are read in your browser and never uploaded.", "Every generated material now has a Why? panel: how often the generator proposed it, its oxidation states, the predicted formation energy and band gap with intervals, and an estimate of its distance from the convex hull built from Alexandria's stable phases of the same system.", "A technical note on the Validation page: on the 52 NIST StRD nonlinear-regression fits Lattent reaches four or more correct digits in 51, against 45 for SciPy's curve_fit with default settings. The fitter uses improved damping and scouting restarts and is faster than before.", "Data privacy is now spelled out on the home page, and a Cite Lattent button gives BibTeX and APA references."]),
    ("2026-10-15", "Report agent and help guide", ["Autonomous scientific reports: Facet plans the analyses, runs them, checks them and writes the report (methods, results, figures, quality checks, limitations, next steps), offline. With your AI key it drafts the summary and discussion and reviews supplied figures.", "A Lattent guide on every page answers questions from the help articles and links to the right tool.", "Facet AI is a visible menu again."]),
    ("2026-10-15", "Support centre and a clearer home page", ["A Support centre with search, guides by topic, troubleshooting and billing help.", "The home page now opens with the problems Lattent solves and how it works in three steps.", "AI and machine learning moved into the Platform menu; Support joins the navigation."]),
    ("2026-10-15", "Facet, pricing and contact", ["The AI lab partner is now Facet. New: Check reviews the whole project for errors, Read a graph turns a picture of a plot into a table, and Ask accepts figures to interpret and critique.", "A Pricing page with plan comparison, yearly or monthly billing, and prices in US dollars or rupees. Pay by card, PayPal or Apple Pay worldwide, by UPI, cards or net banking in India through Razorpay, or by invoice.", "A Contact page; messages reach the team by email.", "Simpler navigation: Platform and Solutions menus, direct links to AI and Pricing, and a compact Resources menu."]),
    ("2026-10-15", "AI and machine learning", ["Equation discovery: symbolic regression finds a compact formula for XY data and recognises physical laws such as Arrhenius, Langmuir and Flory–Fox.", "AutoML: six kinds of model compared by cross-validation, with input importance, partial dependence, composition descriptors for formula columns and calibrated prediction intervals.", "Calibrated 90% intervals on every formation-energy and band-gap prediction.", "A new page, the periodic table of Lattent’s AI, with a live lab.", "Night mode and an account menu in every header."]),
    ("2026-10-15", "Navigation, Solutions and What’s new", ["A new site navigation with Platform, Solutions and Resources menus.", "A page for each field, from nanomaterials to analytical chemistry, linking straight to the right tool, example or Discover view.", "This release-notes page."]),
    ("2026-10-15", "New identity", ["A new mark: an L of lattice points that doubles as the axes of a plot, with a copper point for the discovery.", "An indigo-and-copper palette, checked for colour-blind safety and contrast, with Space Grotesk headings.", "A custom 404 page, social previews and home-screen icons."]),
    ("2026-10-15", "Discover", ["Search 5.8 million computed crystal structures in the Alexandria database, with a 3D viewer, simulated XRD with Miller indices and CIF export.", "Identify XRD phases: peaks are matched against every structure of your elements, with lattice refinement and second-phase detection.", "Generate materials: Lattent’s own masked-diffusion model proposes compositions; property networks predict formation energy (MAE 0.09 eV/atom) and band gap; each candidate is checked for novelty."]),
    ("2026-10-15", "Lattent", ["Benchfit is now Lattent. Old links and project files keep working."]),
    ("2026-10-14", "Specialist models and a materials focus", ["Lattent’s own shape model recognises 13 families of behaviour (98.4% on held-out data) and suggests the analysis.", "Quick tools for XRD, band gaps, activation energy, isotherms, tensile tests, peaks and curve fitting."]),
    ("2026-10-14", "Accounts, cloud projects and Lab teams", ["Optional sign-in with one-time email links; cloud projects protected by row-level security; shared projects for Lab plans; secure checkout by Lemon Squeezy."]),
    ("2026-10-14", "Lattent Studio", ["A workspace with XY, Column and Multiple-variables tables, 35 equations with AICc auto-fit, statistics with post tests, spectra and materials analyses, PCA, clustering, Bayesian optimisation and an AI co-scientist."]),
    ("2026-10-13", "First release", ["Browser calculators for dose–response, standard curves, enzyme kinetics and qPCR, checked against SciPy."]),
]

esc = html.escape


def write(rel, text):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def field_page(f):
    root = "../../"
    a = lambda link: root + link[0]
    flows = "".join(
        f'<article class="sol-flow"><span class="sol-n">{i + 1:02d}</span><h3>{esc(t)}</h3><p>{esc(d)}</p>'
        f'<ul class="ticks">{"".join(f"<li>{esc(o)}</li>" for o in outs)}</ul>'
        f'<a class="sol-go" href="{a(link)}">{esc(link[1])} →</a></article>'
        for i, (t, d, outs, link) in enumerate(f["flows"]))
    eqs = "".join(f"<li>{esc(e)}</li>" for e in f["eqs"])
    others = "".join(f'<a href="{root}solutions/{g["slug"]}/">{esc(g["name"])}</a>' for g in FIELDS if g is not f)
    body = f"""<main>
<section class="sol-hero"><div class="wrap sol-hero-in">
  <div class="sol-copy">
    <p class="crumb"><a href="{root}solutions/">Solutions</a> ›</p>
    <h1>{esc(f["h1"])}</h1>
    <p class="sol-lede">{esc(f["lede"])}</p>
    <div class="sol-cta"><a class="btn big primary" href="{a(f["cta"])}">{esc(f["cta"][1])}</a><a class="btn big" href="{root}studio/">Open Lattent Studio</a></div>
  </div>
  <figure class="sol-shot"><img src="{root}assets/img/{f["img"][0]}" width="1200" height="750" alt="{esc(f["img"][1])}"></figure>
</div></section>
<section class="wrap section"><div class="sec-head"><h2>What you can do</h2><p>Each workflow opens with your data in the browser. Nothing is uploaded, and every result comes with its figure and methods text.</p></div>
  <div class="sol-flows">{flows}</div></section>
<section class="wrap section sol-eq"><div><h2>Equations and analyses for {esc(f["name"].lower())}</h2><p>Built into the curve-fitting engine and checked against SciPy, alongside 30 more and any equation you type yourself.</p></div><ul>{eqs}</ul></section>
<section class="wrap"><div class="band"><div><h2>Start with your own data.</h2><p>Free, in your browser, with nothing to install.</p></div><a class="btn big" href="{root}studio/">Open Lattent Studio</a></div>
  <p class="sol-more">Other fields: {others}</p></section>
</main>
"""
    title = f"{f['name']} | Lattent"
    desc = f["lede"]
    return HEAD.format(title=esc(title), desc=esc(desc), root=root, fonts=FONTS) + body + FOOT.format(root=root)


def hub():
    root = "../"
    cards = "".join(f'<a class="card sol-card" href="{root}solutions/{f["slug"]}/"><h3>{esc(f["name"])}</h3><p>{esc(f["short"])}.</p><span>{esc(f["h1"])}</span><i>Explore →</i></a>' for f in FIELDS)
    cards += f'<a class="card sol-card" href="{root}life-science/"><h3>Life sciences</h3><p>IC50, enzyme kinetics, qPCR, standard curves.</p><span>The same validated engine for biochemistry and biology assays.</span><i>Explore →</i></a>'
    body = f"""<main>
<section class="sol-hero sol-hero-hub"><div class="wrap">
  <h1>Built for the measurements your field makes.</h1>
  <p class="sol-lede">Lattent is one workspace, but every field asks different questions of its data. Choose yours to see the workflows, equations and examples that fit.</p>
</div></section>
<section class="wrap section"><div class="sol-grid">{cards}</div></section>
<section class="wrap section sol-teams"><div class="sec-head"><h2>For every kind of team</h2></div>
  <div class="sol-team-grid">
    <div class="card"><h3>Students and researchers</h3><p>Every analysis is free and runs in your browser, with no account. Pro adds publication exports and the AI chat for a few dollars a month.</p><a href="{root}pricing/">See pricing →</a></div>
    <div class="card"><h3>Research groups</h3><p>The Lab plan gives up to ten people shared cloud projects, one invoice, and the same validated engine on every computer.</p><a href="{root}pricing/">Lab plan →</a></div>
    <div class="card"><h3>Teaching labs</h3><p>Ten worked examples open with realistic data and the analysis already run, ready for a practical class.</p><a href="{root}#examples">Worked examples →</a></div>
  </div></section>
</main>
"""
    return HEAD.format(title="Solutions | Lattent", desc="Lattent workflows for nanomaterials, catalysis, batteries, polymers, semiconductors, electrochemistry, ceramics and alloys, and analytical chemistry.", root=root, fonts=FONTS) + body + FOOT.format(root=root)


def changelog():
    root = "../"
    from datetime import date
    items = "".join(
        f'<li class="cl-item"><time datetime="{d}">{date.fromisoformat(d).strftime("%-d %B %Y")}</time><div><h2>{esc(t)}</h2><ul>{"".join(f"<li>{esc(x)}</li>" for x in xs)}</ul></div></li>'
        for d, t, xs in CHANGES)
    body = f"""<main class="wrap page cl-page">
  <h1>What’s new</h1>
  <p class="sol-lede">Every release of Lattent, newest first.</p>
  <ol class="cl">{items}</ol>
</main>
"""
    return HEAD.format(title="What’s new | Lattent", desc="Release notes for Lattent: new analyses, Discover, identity and platform changes.", root=root, fonts=FONTS) + body + FOOT.format(root=root)


for f in FIELDS:
    write(f"solutions/{f['slug']}/index.html", field_page(f))
write("solutions/index.html", hub())
write("changelog/index.html", changelog())

CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
COMPARE = [
    ("Analysis", None),
    ("Every analysis, test and warning in Studio", (1, 1, 1)),
    ("Quick tools and worked examples", (1, 1, 1)),
    ("Discover: database, phase identification, generative design", (1, 1, 1)),
    ("AI: equation discovery, AutoML, shape recognition", (1, 1, 1)),
    ("Live graphs and the PNG figure", (1, 1, 1)),
    ("Publishing", None),
    ("600-dpi PNG and vector SVG, no watermark", (0, 1, 1)),
    ("Auto-written methods, results and figure legend", (0, 1, 1)),
    ("Results as CSV, reports and project files", (0, 1, 1)),
    ("Facet chat with your own Claude or GPT key", (0, 1, 1)),
    ("Cloud and team", None),
    ("Cloud projects", ("3 projects", "Unlimited, 250 MB", "Unlimited, shared")),
    ("People", ("1", "1", "Up to 10")),
    ("Shared lab projects and one invoice", (0, 0, 1)),
]
def pricing():
    root = "../"
    rows = ""
    for name, v in COMPARE:
        if v is None:
            rows += f'<tr class="grp"><th colspan="4">{esc(name)}</th></tr>'
            continue
        cell = lambda x: f'<td class="yes" aria-label="Included">{CHECK}</td>' if x == 1 else ('<td class="no" aria-label="Not included">–</td>' if x == 0 else f"<td>{esc(str(x))}</td>")
        rows += f"<tr><th>{esc(name)}</th>{''.join(cell(x) for x in v)}</tr>"
    body = f"""<main>
<section class="sol-hero sol-hero-hub"><div class="wrap pr-head">
  <h1>Free for analysis. Pro when you publish.</h1>
  <p class="sol-lede">Every analysis, model and warning is free, without limits. Pro adds what goes into papers and reports. Early-access prices, locked in for as long as you stay subscribed.</p>
  <div class="pr-toggles"><div class="seg-pr" role="radiogroup" aria-label="Billing"><button data-bill="yearly" aria-pressed="true">Yearly <span>save 40%</span></button><button data-bill="monthly" aria-pressed="false">Monthly</button></div>
  <div class="seg-pr" role="radiogroup" aria-label="Currency"><button data-cur="usd" aria-pressed="true">US$</button><button data-cur="inr" aria-pressed="false">₹ INR</button></div></div>
</div></section>
<section class="wrap section pr-plans">
  <div class="pricing">
    <div class="card price"><h3>Free</h3><div class="amt" data-amt="free">$0</div><p class="sub">for everyone, forever</p>
      <ul><li>All analyses, tools and examples</li><li>Discover and the AI models</li><li>Live graphs and PNG figures</li><li>3 cloud projects with a free account</li></ul>
      <a class="btn" href="{root}studio/">Open Studio</a></div>
    <div class="card price best"><h3>Pro <span>Best value</span></h3><div class="amt" data-amt="pro">$29<small> / year</small></div><p class="sub" data-sub="pro">about $2.42 a month</p>
      <ul><li>Everything in Free</li><li>600-dpi PNG and vector SVG, no watermark</li><li>Auto-written methods and results</li><li>Unlimited cloud projects, 250 MB</li><li>Facet chat with your own AI key</li></ul>
      <button class="btn primary" data-buy-pro>Get Pro</button><button class="pr-trial" data-trial>or try Pro free for 7 days</button></div>
    <div class="card price"><h3>Lab</h3><div class="amt" data-amt="lab">$99<small> / year</small></div><p class="sub">up to 10 people, one invoice</p>
      <ul><li>Everything in Pro for the group</li><li>Shared lab projects</li><li>Invite and remove members</li><li>Invoice or purchase order</li></ul>
      <button class="btn" data-buy="lab">Get Lab</button><a class="pr-trial" href="{root}contact/?topic=lab">Talk to us about a department licence</a></div>
  </div>
</section>
<section class="wrap section"><div class="sec-head"><h2>Compare plans</h2></div>
  <div class="tbl-wrap pr-tbl"><table><thead><tr><th></th><th>Free</th><th>Pro</th><th>Lab</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section class="wrap section"><div class="sec-head"><h2>Pay your way, securely</h2><p>Checkout is run by established payment providers. Lattent never sees or stores your card details.</p></div>
  <div class="pay-grid">
    <div class="card"><h3>Worldwide</h3><p class="pay-m">Cards · PayPal · Apple Pay · Google Pay</p><p>In US dollars, through Lemon Squeezy, our merchant of record. Sales tax and VAT are calculated and handled at checkout.</p></div>
    <div class="card"><h3>India</h3><p class="pay-m">UPI · RuPay, Visa, Mastercard · net banking</p><p>In rupees, through Razorpay, with a GST invoice for your institution.</p></div>
    <div class="card"><h3>Institutions</h3><p class="pay-m">Invoice · purchase order · bank transfer</p><p>For Lab plans and department licences, we issue a proper invoice for grant or department funds.</p><a href="{root}contact/?topic=lab">Request an invoice →</a></div>
  </div>
  <ul class="pr-trust"><li>{CHECK}PCI-DSS-compliant payment providers</li><li>{CHECK}Plans activate from signed, verified payment events only</li><li>{CHECK}Cancel any time from your account</li><li>{CHECK}14-day refund, no questions asked</li></ul>
</section>
<section class="wrap section"><div class="sec-head"><h2>Questions about pricing</h2></div><div class="faq">
  <details><summary>Is the free plan really free?</summary><p>Yes. Every analysis, every AI model and Discover are free with no time limit. Pro adds publication exports, auto-written text, more cloud storage and the Facet chat.</p></details>
  <details><summary>Can my lab or department pay by invoice?</summary><p>Yes. Choose Lab, or <a href="{root}contact/?topic=lab">write to us</a> with your institution’s details, and we will send an invoice or accept a purchase order.</p></details>
  <details><summary>Do prices include tax?</summary><p>Taxes are calculated at checkout where they apply, and you receive a tax invoice.</p></details>
  <details><summary>What happens if I cancel?</summary><p>You keep Pro until the end of the period you paid for, then return to the free plan. Your projects stay yours, and you can export them at any time.</p></details>
  <details><summary>Will the early-access price go up?</summary><p>New subscribers may pay more later; your price stays the same while your subscription continues.</p></details>
</div></section>
<section class="wrap"><div class="band"><div><h2>Questions before you buy?</h2><p>We usually reply within a day.</p></div><a class="btn big" href="{root}contact/?topic=sales">Contact us</a></div></section>
</main>
"""
    return HEAD.format(title="Pricing | Lattent", desc="Lattent is free for analysis. Pro adds publication exports, auto-written methods and cloud storage from $4 a month or ₹299; Lab covers ten people. Cards, PayPal, UPI or invoice.", root=root, fonts=FONTS).replace('</head>', f'<link rel="stylesheet" href="{root}assets/css/pricing.css">\n</head>') + body + FOOT.format(root=root).replace("</body>", f'<script src="{root}assets/js/pricing.js"></script>\n</body>')


def contact():
    root = "../"
    body = f"""<main>
<section class="sol-hero sol-hero-hub"><div class="wrap">
  <h1>Talk to us.</h1>
  <p class="sol-lede">Questions about buying, a Lab plan or an invoice, help with an analysis, or an idea for Lattent: write to us and a person will reply, usually within a day.</p>
</div></section>
<section class="wrap section ct-grid">
  <form class="card ct-form" id="ct-form" novalidate>
    <div class="fg two"><div><label for="ct-name">Your name</label><input type="text" id="ct-name" autocomplete="name" required maxlength="120"></div>
      <div><label for="ct-email">Email</label><input type="email" id="ct-email" autocomplete="email" required maxlength="200"></div></div>
    <div class="fg two"><div><label for="ct-org">Institution or company <span class="opt">optional</span></label><input type="text" id="ct-org" autocomplete="organization" maxlength="200"></div>
      <div><label for="ct-topic">What is it about?</label><select id="ct-topic"><option value="sales">Buying Pro</option><option value="lab">Lab plan, invoice or purchase order</option><option value="support">Help with an analysis</option><option value="partnership">Partnership or collaboration</option><option value="feedback">Feedback or an idea</option><option value="other">Something else</option></select></div></div>
    <div class="fg"><label for="ct-msg">Message</label><textarea id="ct-msg" rows="7" required minlength="10" maxlength="5000" placeholder="Tell us a little about your lab and what you need."></textarea></div>
    <div class="ct-hp" aria-hidden="true"><label>Leave this empty <input type="text" id="ct-web" tabindex="-1" autocomplete="off"></label></div>
    <div class="ct-actions"><button class="btn primary big" type="submit">Send message</button><p class="hint" id="ct-note">We use your details only to reply. See our <a href="{root}legal/privacy.html">privacy notice</a>.</p></div>
    <div id="ct-out" aria-live="polite"></div>
  </form>
  <aside class="ct-side">
    <div class="card"><h3>Buying and invoices</h3><p>Payment links in dollars or rupees, invoices and purchase orders for labs and departments.</p></div>
    <div class="card"><h3>Help with Lattent</h3><p>Stuck on an analysis? Tell us what you measured and what you expected; screenshots welcome by reply.</p></div>
    <div class="card"><h3>Collaborate</h3><p>Instrument makers, core facilities and research groups: we are keen to build workflows together.</p></div>
    <p class="hint">Found a security problem? Ask for a private channel first and do not include details in the message.</p>
  </aside>
</section>
</main>
"""
    return HEAD.format(title="Contact | Lattent", desc="Contact Lattent about buying Pro, Lab plans and invoices, help with an analysis, or partnerships.", root=root, fonts=FONTS).replace('</head>', f'<link rel="stylesheet" href="{root}assets/css/pricing.css">\n</head>') + body + FOOT.format(root=root).replace("</body>", f'<script src="{root}assets/js/contact.js"></script>\n</body>')



GUIDES = [
    ("Getting started", "studio/", [
        ("How do I start?", "Open Studio and choose a worked example close to your field, or create a table and paste your data straight from Excel or an instrument export. Then press Analyze, or open Facet for a suggestion."),
        ("Which table type should I use?", "XY for curves and spectra (one X column, one or more Y columns; columns with the same title are replicates). Column for comparing groups. Multiple variables for compositions, process settings and properties, one row per sample."),
        ("Can I import instrument files?", "Yes. Drop them anywhere on Studio, or use Paste data, then Open a file. Supported: CSV, TXT, XY, JCAMP-DX, PANalytical XRDML, Rigaku RAS, Bruker UXD, Thermo SPC, and CIF (which becomes a simulated XRD pattern). Export binary .raw or .brml scans as .xy or .xrdml first. Files are read in the browser and never uploaded."),
        ("Do I need an account?", "No. Everything runs in your browser and projects are kept there. An account adds cloud storage, your plan on every computer and Lab sharing."),
    ]),
    ("Curve fitting and equations", "tools/curve-fitting/", [
        ("Which equation should I fit?", "Run Auto-fit: it fits every plausible equation for the shape of your data and ranks them by AICc. Equation discovery can also find a formula that is not in the library."),
        ("The fit does not converge.", "Check that X and Y are in the right columns and units, try Auto-fit, fix a parameter you know, or start from a simpler model. Very few points cannot support many parameters."),
        ("Can I type my own equation?", "Yes. Choose User-defined equation and write it with x, any parameter names, + − * / ^ and functions such as exp, ln and sqrt."),
    ]),
    ("Statistics", "studio/?example=anova", [
        ("Which test should I use?", "Facet suggests one from your data: t test or Mann–Whitney for two groups, ANOVA, Welch’s ANOVA or Kruskal–Wallis for more. Lattent checks normality and equal variance for you."),
        ("Why not several t tests?", "Each extra test raises the chance of a false positive. ANOVA with Tukey or Holm–Šidák post tests corrects for the number of comparisons."),
    ]),
    ("XRD, spectra and band gaps", "tools/xrd-crystallite-size/", [
        ("How is crystallite size calculated?", "Peaks are fitted with pseudo-Voigt profiles on a fitted baseline, instrumental broadening is removed, and the Scherrer and Williamson–Hall equations give size and strain. Sizes above about 100 nm are unreliable with any lab diffractometer."),
        ("How do I identify the phase?", "After a peak analysis with X as 2θ, press Identify phases and list the elements that may be present. Lattent matches your peaks against every computed structure of those elements."),
        ("My Tauc fit looks wrong.", "Choose the transition type (direct or indirect) and set the linear region by hand around the steepest part of the absorption edge."),
    ]),
    ("Facet and the AI models", "ai/", [
        ("What can Facet do without an API key?", "Suggest analyses, check your whole project for mistakes, and read data from a picture of a graph. All of this runs offline in your browser."),
        ("How do I use the chat?", "Open Facet, choose Ask, and add your own Anthropic or OpenAI key; it stays in your browser. You can attach a figure and ask what it shows or what is wrong with it. Analyses it proposes run only after you approve them."),
        ("How accurate are the models?", "Each model’s accuracy on data it never saw is listed on the AI page and the validation page."),
    ]),
    ("Discover: database, phases, new materials", "studio/?discover=search", [
        ("The database search fails.", "Discover queries the public Alexandria database from your browser. Check your connection, or a network that blocks external sites, and try again; very broad searches can be slow."),
        ("Are generated materials real discoveries?", "They are candidates: compositions predicted to be stable and close to your target band gap, and absent from the database. Confirm them with a calculation or a synthesis."),
    ]),
    ("Figures, reports and export", "studio/", [
        ("How do I get a figure for my paper?", "Every chart has PNG export. Pro adds 600-dpi PNG and vector SVG without the watermark, plus methods, results and figure-legend text written from your numbers."),
        ("Can I export my results?", "Yes: results tables as CSV and one-page reports with Pro, and your data tables as CSV on any plan."),
    ]),
    ("Projects, cloud and Lab teams", "account/", [
        ("Where is my project saved?", "In your browser, automatically. Clearing your browser’s site data removes it, so save important work to the cloud (free account: 3 projects) or as a project file."),
        ("How does Lab sharing work?", "The Lab plan owner invites members from the account page; projects shared with the lab open for every member."),
    ]),
    ("Plans and billing", "pricing/", [
        ("How do I pay?", "By card, PayPal or Apple Pay worldwide, by UPI, cards or net banking in India, or by invoice for institutions. See the pricing page."),
        ("I paid, but Pro is still locked.", "Sign in with the same email you used to pay; the plan activates within a few seconds of the payment confirmation. If it does not, contact us with your receipt."),
        ("How do I cancel or get a refund?", "Cancel any time from your account; you keep Pro until the end of the paid period. Refunds within 14 days of a payment, no questions asked."),
    ]),
]
TROUBLE = [
    ("My pasted data lands in one column.", "Lattent recognises tab, comma and semicolon separators and decimal commas. If the paste still lands in one column, copy the cells directly from Excel rather than from a PDF, or use Paste or import."),
    ("A chart is blank or the page looks broken.", "Use a recent Chrome, Edge, Firefox or Safari, reload the page, and turn off extensions that block scripts for this site."),
    ("Studio is slow with a large file.", "Curve fitting and AutoML work best with up to a few thousand points; for long spectra, crop to the region of interest first."),
    ("I lost my project.", "Projects live in the browser where you made them. If the browser’s data was cleared and the project was not saved to the cloud or as a file, it cannot be recovered."),
]
def support():
    root = "../"
    a = lambda link: root + link
    cards = "".join(
        f'<section class="card sp-guide sp-item" data-q="{esc(g.lower())}"><h3>{esc(g)}</h3>'
        + "".join(f'<details class="sp-qa sp-item"><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>' for q, ans in qa)
        + f'<a class="sp-more" href="{a(link)}">Open →</a></section>' for g, link, qa in GUIDES)
    trouble = "".join(f'<details class="sp-item"><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>' for q, ans in TROUBLE)
    body = f"""<main>
<section class="sol-hero sol-hero-hub"><div class="wrap sp-head">
  <h1>How can we help?</h1>
  <p class="sol-lede">Answers to common questions, guides by topic, and a person to talk to when you need one.</p>
  <label class="sp-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 13.5l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input type="search" id="sp-q" placeholder="Search help: crystallite size, which test, billing…" aria-label="Search help"></label>
</div></section>
<section class="wrap section sp-start">
  <div class="sec-head"><h2>Start in three steps</h2></div>
  <ol class="how"><li><b>Open Studio</b><span>Choose a worked example or a new table. Nothing to install, no account needed.</span></li><li><b>Paste your data</b><span>Straight from Excel or your instrument. Facet recognises it and suggests the analysis.</span></li><li><b>Read, check, export</b><span>Results with uncertainties, a project check by Facet, and figures with methods text.</span></li></ol>
  <p><a class="btn primary" href="{root}studio/">Open Studio</a> <a class="btn" href="{root}#examples">Browse worked examples</a></p>
</section>
<section class="wrap section"><div class="sec-head"><h2>Guides by topic</h2></div>
  <div class="sp-grid" id="sp-guides">{cards}</div>
  <p class="sp-none" id="sp-none" hidden>No answers match. <a href="{root}contact/?topic=support">Ask us directly →</a></p>
</section>
<section class="wrap section"><div class="sec-head"><h2>Troubleshooting</h2></div><div class="faq">{trouble}</div></section>
<section class="wrap section"><div class="sec-head"><h2>Still need help?</h2></div>
  <div class="pay-grid sp-contact">
    <div class="card"><h3>Contact support</h3><p>Tell us what you measured, what you expected and what you see. We aim to reply within one working day.</p><a href="{root}contact/?topic=support">Write to support →</a></div>
    <div class="card"><h3>Billing and invoices</h3><p>Payment links, receipts, invoices, purchase orders and refunds.</p><a href="{root}contact/?topic=sales">Contact billing →</a></div>
    <div class="card"><h3>Ideas and bugs</h3><p>Missing an equation, a test or an instrument format? Found something wrong? We want to know.</p><a href="{root}contact/?topic=feedback">Send feedback →</a></div>
  </div>
</section>
</main>
"""
    return HEAD.format(title="Support | Lattent", desc="Lattent help centre: getting started, guides to fitting, statistics, XRD, AI and Discover, troubleshooting, billing help and contact.", root=root, fonts=FONTS).replace('</head>', f'<link rel="stylesheet" href="{root}assets/css/pricing.css">\n</head>') + body + FOOT.format(root=root).replace("</body>", f'<script src="{root}assets/js/support.js"></script>\n</body>')



EXTRA_KB = [
    ("Which file formats can I import?", "Drag files onto Studio, or use Paste data, then Open a file. Lattent reads CSV, TXT, DAT, XY, JCAMP-DX (.jdx, .dx, including compressed data), PANalytical .xrdml, Rigaku .ras, Bruker .uxd, Thermo/Galactic .spc and .cif. A CIF becomes a simulated XRD pattern. Binary vendor files (.raw, .brml, PerkinElmer .sp) need exporting to text first. Nothing is uploaded.", "studio/", "Open Studio", "import file format csv jcamp jdx xrdml ras uxd spc cif raw drag drop upload instrument export"),
    ("Why did the generator suggest this material?", "Press Why? next to any generated formula. It shows how often the diffusion model proposed it, its oxidation states, the predicted formation energy and band gap with 90% intervals, and an estimate of its distance from the convex hull built from Alexandria's stable phases in the same chemical system.", "studio/?discover=gen", "Generate materials", "why candidate explain generated convex hull stability decomposition suggestion reason"),
    ("How do I cite Lattent?", "Use the Cite Lattent link in the footer or Studio's sidebar for BibTeX and APA references. If you used Discover, please also cite the Alexandria database and Matbench, listed in the same dialog.", "validation/", "Validation", "cite citation bibtex apa reference paper publish acknowledge"),
    ("How accurate is the curve fitting?", "On the 52 NIST StRD nonlinear-regression reference fits, Lattent gets at least four correct significant digits in every parameter for 51 (median 8.6 digits); SciPy's curve_fit with default settings gets 45. The full benchmark is in the technical note on the Validation page.", "validation/#nist", "Technical note", "accuracy nist strd benchmark scipy curve_fit precision digits speed white paper"),
    ("How do I identify the phases in my XRD pattern?", "Fit the peaks in Studio with X set to 2θ, then press Identify phases and list the elements that may be present. Lattent matches your peaks against every computed structure of those elements and flags peaks left unexplained.", "studio/?discover=phase", "Identify phases", "phase identification diffraction pattern xrd match crystal structure"),
    ("How do I get the band gap from a UV–Vis spectrum?", "Paste wavelength (or energy) and absorbance into the band-gap tool. It builds the Tauc plot, finds the linear part of the absorption edge and reports the gap with a confidence interval.", "tools/band-gap-tauc/", "Band-gap tool", "tauc optical band gap uv vis absorbance edge"),
    ("How do I get activation energy from conductivity or rate data?", "Use the activation-energy tool: paste temperature and conductivity (or rate constant) and Lattent fits Arrhenius or VFT and reports Eₐ in kJ/mol and eV with confidence intervals.", "tools/activation-energy-arrhenius/", "Activation-energy tool", "arrhenius activation energy conductivity rate temperature"),
    ("Can Lattent suggest new materials?", "Yes, at the level of composition. The generator proposes formulas inside the elements you choose, steered towards a band gap, predicts stability and band gap with intervals, and checks each candidate against 5.8 million computed structures.", "studio/?discover=gen", "Generate materials", "generate new materials diffusion generative compositions discovery"),
    ("Can Lattent write a report for me?", "Yes. Open Facet in Studio and choose Report. The agent plans the analyses, runs them, checks them for mistakes and assembles a report with methods, results, figures, checks and next steps. With your own AI key it also drafts the summary and discussion, and it can review figures you supply.", "studio/?example=anova&facet=report", "See an autonomous report", "report autonomous agent write up paper methods results export"),
    ("Can Lattent read a graph from an image?", "Yes. In Facet, choose Graph: calibrate the axes with four clicks, click the curve, and Lattent traces it into a data table. With an AI key you can also attach the figure and ask what it shows or what is wrong with it.", "studio/?facet=graph", "Read a graph", "digitise digitize image plot picture figure graph data extract"),
    ("What is Facet?", "Facet is Lattent’s AI lab partner. It suggests analyses, checks your project for mistakes, reads graphs, writes reports autonomously and, with your own Claude or GPT key, answers questions and reviews figures. All numbers come from the validated engine.", "ai/", "Facet AI", "facet ai assistant partner co-scientist"),
    ("How much does Lattent cost?", "{{pricing}}", "pricing/", "See pricing", "price cost pro plan lab free subscription payment inr rupee"),
    ("Is my data private?", "Analyses run in your browser and projects stay there unless you save them to the cloud. Nothing you paste is uploaded. The optional AI features send data only to the provider you chose, with your own key.", "legal/privacy.html", "Privacy notice", "privacy data upload security gdpr stored"),
    ("How do I talk to a person?", "Use the contact form and tell us what you need. We usually reply within one working day.", "contact/", "Contact us", "contact email support human sales invoice question help"),
]

def kb():
    out = []
    for g, link, qa in GUIDES:
        for q, a in qa:
            out.append({"q": q, "a": a, "l": link, "t": g, "k": g.lower()})
    for q, a in TROUBLE:
        out.append({"q": q, "a": a, "l": "support/", "t": "Troubleshooting", "k": "troubleshooting problem error broken"})
    for q, a, link, label, kw in EXTRA_KB:
        out.append({"q": q, "a": a, "l": link, "t": label, "k": kw})
    return out
import json as _json
write("assets/js/kb.js", "/* Help articles for the on-site guide. Generated by scripts/build_solutions.py; do not edit. */\nwindow.BF_KB = " + _json.dumps(kb(), ensure_ascii=False, separators=(",", ":")) + ";\n")

write("support/index.html", support())
write("pricing/index.html", pricing())
write("contact/index.html", contact())

# sitemap of every public page, for search engines
BASE = "https://siba-p.github.io/lattent/"
pages = ["", "studio/", "ai/", "pricing/", "contact/", "support/", "tools/", "solutions/", "changelog/", "validation/", "standard-curve/", "life-science/", "dose-response/", "enzyme-kinetics/", "qpcr/",
         "legal/terms.html", "legal/privacy.html", "legal/refunds.html", "legal/security.html"]
pages += [f"solutions/{f['slug']}/" for f in FIELDS]
pages += sorted(f"tools/{d}/" for d in os.listdir(os.path.join(ROOT, "tools")) if os.path.isdir(os.path.join(ROOT, "tools", d)))
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "".join(f"  <url><loc>{BASE}{p}</loc><lastmod>{CHANGES[0][0]}</lastmod></url>\n" for p in pages) + "</urlset>\n")
print(f"{len(FIELDS)} field pages, hub, changelog and sitemap ({len(pages)} URLs) written")
