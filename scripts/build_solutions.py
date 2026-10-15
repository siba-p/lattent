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
    <p class="sol-k">{esc(f["name"])}</p>
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
  <p class="sol-k">Solutions</p>
  <h1>Built for the measurements your field makes.</h1>
  <p class="sol-lede">Lattent is one workspace, but every field asks different questions of its data. Choose yours to see the workflows, equations and examples that fit.</p>
</div></section>
<section class="wrap section"><div class="sol-grid">{cards}</div></section>
<section class="wrap section sol-teams"><div class="sec-head"><h2>For every kind of team</h2></div>
  <div class="sol-team-grid">
    <div class="card"><h3>Students and researchers</h3><p>Every analysis is free and runs in your browser, with no account. Pro adds publication exports and the AI chat for a few dollars a month.</p><a href="{root}#pricing">See pricing →</a></div>
    <div class="card"><h3>Research groups</h3><p>The Lab plan gives up to ten people shared cloud projects, one invoice, and the same validated engine on every computer.</p><a href="{root}#pricing">Lab plan →</a></div>
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
  <p class="sol-k">Resources</p>
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
# sitemap of every public page, for search engines
BASE = "https://siba-p.github.io/lattent/"
pages = ["", "studio/", "ai/", "tools/", "solutions/", "changelog/", "validation/", "standard-curve/", "life-science/", "dose-response/", "enzyme-kinetics/", "qpcr/",
         "legal/terms.html", "legal/privacy.html", "legal/refunds.html", "legal/security.html"]
pages += [f"solutions/{f['slug']}/" for f in FIELDS]
pages += sorted(f"tools/{d}/" for d in os.listdir(os.path.join(ROOT, "tools")) if os.path.isdir(os.path.join(ROOT, "tools", d)))
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "".join(f"  <url><loc>{BASE}{p}</loc><lastmod>{CHANGES[0][0]}</lastmod></url>\n" for p in pages) + "</urlset>\n")
print(f"{len(FIELDS)} field pages, hub, changelog and sitemap ({len(pages)} URLs) written")
