"""Generate the quick-tool pages (tools/<slug>/index.html), the tools hub and the
life-science hub from one template. Run from the repository root:
    python3 scripts/build_tools.py
"""
import html
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.lemonsqueezy.com https://api.anthropic.com https://api.openai.com; object-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="{root}favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@600;700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/css/bf.css">
<link rel="stylesheet" href="{root}assets/css/tools.css">
</head>
<body>
<header data-bf></header>
"""
FOOT = """<footer data-bf></footer>
<script src="{root}assets/js/config.js"></script>
<script src="{root}assets/js/stats.js"></script>
<script src="{root}assets/js/plot.js"></script>
<script src="{root}assets/js/shell.js"></script>
{extra}</body>
</html>
"""

TOOLS = [
    dict(slug="xrd-crystallite-size", short="XRD crystallite size", example="xrd",
         title="XRD crystallite size calculator: Scherrer and Williamson–Hall | Lattent",
         desc="Paste an X-ray diffraction pattern to fit the Bragg peaks and get d-spacings, Scherrer crystallite size and Williamson–Hall microstrain. Pseudo-Voigt fitting with baseline removal and instrument correction.",
         h1="XRD crystallite size", lede="Paste a diffractogram (2θ and intensity). Lattent removes the baseline, fits every peak with pseudo-Voigt profiles and reports d-spacings, Scherrer crystallite size and Williamson–Hall size and microstrain.",
         xlabel="2θ (°)", ylabel="Intensity (counts)", kind="peaks", opts=dict(xrd=True, baseline="2", shape="pv", prominence=4, lambda_="1.5406", K=0.9, inst=0.08),
         gets=["Peak positions, heights, FWHM and areas with uncertainties", "d-spacing from Bragg's law for any common anode", "Scherrer size with instrumental broadening removed", "Williamson–Hall size and microstrain from all peaks"],
         eq="D = Kλ / (β cos θ),&nbsp;&nbsp; β cos θ = Kλ/D + 4ε sin θ",
         faq=[("Which wavelength is used?", "Cu Kα (1.5406 Å) by default; Co, Mo and Fe Kα can be chosen in Studio."), ("Why correct for instrument broadening?", "Every diffractometer broadens peaks. Subtract a standard's FWHM (for example LaB₆ or Si) in quadrature, or the size will be underestimated."), ("Scherrer or Williamson–Hall?", "Scherrer assumes all broadening comes from size, so it gives a lower bound. Williamson–Hall separates size from strain when you have at least three peaks.")]),
    dict(slug="band-gap-tauc", short="Band gap (Tauc plot)", example="tauc",
         title="Band gap calculator from UV–Vis: Tauc plot | Lattent",
         desc="Calculate the optical band gap from a UV–Vis absorbance spectrum. Automatic Tauc plot for direct or indirect transitions with the linear region found for you, plus a confidence interval.",
         h1="Optical band gap (Tauc plot)", lede="Paste a UV–Vis spectrum as wavelength (nm) or photon energy (eV) against absorbance. Lattent builds the Tauc plot, finds the straight part of the absorption edge and extrapolates the band gap with its confidence interval.",
         xlabel="Wavelength (nm)", ylabel="Absorbance", kind="tauc", opts=dict(transition="direct"),
         gets=["Band gap with a 95% confidence interval", "Direct and indirect, allowed and forbidden transitions", "The fitted linear region, adjustable by hand", "The absorption-edge wavelength"],
         eq="(αhν)^{1/r} = A (hν − E<sub>g</sub>)",
         faq=[("Direct or indirect?", "Use direct allowed (r = 1/2) for ZnO, GaN, perovskites and most quantum dots; indirect (r = 2) for Si, TiO₂ (anatase) and many oxides. If unsure, try both and compare the straightness of the fit."), ("Can I use absorbance instead of α?", "Yes. α is proportional to absorbance for a film of fixed thickness, which scales the plot but does not move the intercept.")]),
    dict(slug="activation-energy-arrhenius", short="Activation energy (Arrhenius)", example="arrhenius",
         title="Activation energy calculator: Arrhenius fit | Lattent",
         desc="Calculate activation energy in kJ/mol and eV from conductivity, diffusion or rate constants measured at several temperatures. Nonlinear Arrhenius fit with confidence intervals and VFT alternative.",
         h1="Activation energy (Arrhenius)", lede="Paste temperatures (K) and a thermally activated quantity such as ionic conductivity, diffusion coefficient or a rate constant. Lattent fits the Arrhenius equation directly, without distorting the errors, and reports Eₐ in kJ/mol and eV.",
         xlabel="Temperature (K)", ylabel="σ (S/cm)", kind="nlfit", opts=dict(model="arrhenius", logy=True, weight="1/y2"),
         gets=["Eₐ in kJ/mol and eV with a 95% confidence interval", "Pre-exponential factor", "Nonlinear fit with relative weighting, plus an Arrhenius-style plot", "A check against Vogel–Fulcher–Tammann for polymer and glassy electrolytes"],
         eq="Y = A · exp(−E<sub>a</sub> / RT)",
         faq=[("Why not fit ln σ against 1/T?", "Linearising distorts the error structure. Lattent fits the exponential directly with 1/Y² weighting, which handles data spanning orders of magnitude correctly."), ("My data curve on an Arrhenius plot", "Curvature often means Vogel–Fulcher–Tammann behaviour (polymer electrolytes, glasses) or a change of mechanism. Use Find the best model in Studio to compare.")]),
    dict(slug="adsorption-isotherms", short="Adsorption isotherms", example="isotherm",
         title="Adsorption isotherm fitting: Langmuir, Freundlich, Sips | Lattent",
         desc="Fit Langmuir, Freundlich, Sips and other adsorption isotherms to qe vs Ce data and let AICc decide which model the data support. Maximum capacity with confidence intervals.",
         h1="Adsorption isotherms", lede="Paste equilibrium concentration Cₑ and uptake qₑ. Lattent fits Langmuir, Freundlich, Sips and related models by nonlinear regression, ranks them by AICc and reports q_max and affinity constants with confidence intervals.",
         xlabel="Cₑ (mg/L)", ylabel="qₑ (mg/g)", kind="autofit", opts=dict(field="Materials & chemistry"),
         gets=["Langmuir, Freundlich, Sips and kinetic models compared by AICc", "q_max, K_L, K_F and n with confidence intervals", "A plain statement of which model the data support", "Replicates averaged and shown with error bars"],
         eq="q = q<sub>max</sub> K C / (1 + K C),&nbsp;&nbsp; q = K<sub>F</sub> C<sup>1/n</sup>",
         faq=[("Should I use the linearised Langmuir plot?", "No. Linearised plots distort errors and can favour the wrong model. Nonlinear fitting with model comparison is the current recommendation in the adsorption literature."), ("Can I fit kinetics too?", "Yes: paste qₜ against time, and the pseudo-first-order and pseudo-second-order models are included.")]),
    dict(slug="tensile-test", short="Tensile test analysis", example="tensile",
         title="Tensile test calculator: Young's modulus, yield strength, toughness | Lattent",
         desc="Paste a stress–strain curve to get Young's modulus, 0.2% offset yield strength, ultimate tensile strength, elongation at break and toughness, with the modulus region found automatically.",
         h1="Tensile test analysis", lede="Paste strain (in % or as a fraction) and stress. Lattent finds the elastic region, applies the 0.2% offset method and reports the mechanical properties with a publication-ready stress–strain figure.",
         xlabel="Strain (%)", ylabel="Stress (MPa)", kind="tensile", opts={},
         gets=["Young's modulus from the steepest linear loading region", "0.2% offset yield strength (offset adjustable)", "Ultimate tensile strength and elongation at break", "Toughness from the area under the curve"],
         eq="σ = E (ε − ε<sub>0</sub> − 0.002)",
         faq=[("My modulus is lower than the handbook value", "Without an extensometer, crosshead strain includes machine compliance, which lowers the apparent modulus. Compare samples measured the same way."), ("Can it handle brittle samples?", "Yes. For samples with no yield, the yield strength is left blank and the strength and modulus are reported.")]),
    dict(slug="peak-fitting", short="Peak fitting (Raman, FTIR, XPS)", example="xrd",
         title="Peak fitting online: Raman, FTIR, XPS, chromatography | Lattent",
         desc="Fit overlapping peaks in Raman, FTIR, XPS, photoluminescence or chromatography data: baseline removal, automatic peak detection and simultaneous Gaussian, Lorentzian or pseudo-Voigt fitting.",
         h1="Peak fitting", lede="Paste any spectrum. Lattent subtracts a polynomial baseline, finds the peaks and fits them all at once, reporting position, height, FWHM, area and shape for each.",
         xlabel="Raman shift (cm⁻¹)", ylabel="Intensity", kind="peaks", opts=dict(baseline="1", shape="pv", prominence=5),
         gets=["Automatic peak detection with adjustable prominence", "Gaussian, Lorentzian or pseudo-Voigt profiles fitted together", "Positions with uncertainties, FWHM, areas and relative intensities", "The fitted spectrum, baseline and peak positions in one figure"],
         eq="I(x) = Σ h<sub>k</sub> [η L(x) + (1 − η) G(x)] + baseline",
         faq=[("Which profile should I use?", "Pseudo-Voigt is the safe default for most spectroscopies: it lets each peak be Gaussian, Lorentzian or between."), ("Peaks are missing", "Lower the minimum prominence, or reduce smoothing for very sharp peaks.")]),
    dict(slug="curve-fitting", short="Curve fitting with model selection", example="isotherm",
         title="Online curve fitting with automatic model selection | Lattent",
         desc="Fit 35 scientific equations, or your own, to XY data. Lattent's shape model suggests which family fits, nonlinear regression gives confidence intervals, and AICc tells you which model the data support.",
         h1="Curve fitting", lede="Paste any XY data. Lattent's shape model, trained on tens of thousands of simulated lab datasets, recognises the kind of behaviour. Then every matching equation is fitted and ranked by AICc.",
         xlabel="X", ylabel="Y", kind="autofit", opts=dict(field="shape"),
         gets=["The data shape recognised in your browser by Lattent's own model", "All matching equations fitted and ranked by AICc and Akaike weight", "Confidence intervals, residuals and runs test for the chosen model", "Your own equation if none of the 35 fit"],
         eq="AICc = n ln(SS/n) + 2k + 2k(k+1)/(n − k − 1)",
         faq=[("What does the shape model do?", "It reads the pattern of your data (saturating, sigmoidal, thermally activated, a spectrum and so on) and narrows 35 equations to the plausible ones, so spurious models do not win by chance."), ("Can I type my own equation?", "Yes, in Studio: choose User-defined equation and type, for example, A*exp(-k*x) + c.")]),
]

LIFE = [("dose-response/", "Dose–response and IC50", "IC50 and EC50 with confidence intervals, 96-well plate import and potency comparison."),
        ("enzyme-kinetics/", "Enzyme kinetics", "K<sub>m</sub>, V<sub>max</sub>, k<sub>cat</sub> and inhibition mechanism with K<sub>i</sub>."),
        ("qpcr/", "qPCR relative expression", "ΔΔCt and Pfaffl fold changes with statistics and replicate QC.")]


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


for t in TOOLS:
    root = "../../"
    opts = {("lambda" if k == "lambda_" else k): v for k, v in t["opts"].items()}
    cfg = json.dumps(dict(kind=t["kind"], opts=opts, xlabel=t["xlabel"], ylabel=t["ylabel"], name=t["short"], example=t["example"]), ensure_ascii=False)
    others = "".join(f'<a href="{root}tools/{o["slug"]}/">{html.escape(o["short"])}</a>' for o in TOOLS if o is not t)
    body = f"""<main class="wrap qt" data-tool="{html.escape(cfg)}">
  <nav class="crumbs"><a href="{root}tools/">Quick tools</a> ›</nav>
  <h1>{t['h1']}</h1>
  <p class="lede">{t['lede']}</p>
  <div class="qt-grid">
    <section class="card qt-in">
      <label class="lbl" for="qt-data">Paste your data: {html.escape(t['xlabel'])}, then {html.escape(t['ylabel'])} (replicate columns allowed)</label>
      <textarea id="qt-data" spellcheck="false" placeholder="Copy two or more columns from Excel or your instrument export"></textarea>
      <div class="qt-actions"><button class="btn primary big" id="qt-go">Analyse in Lattent Studio</button><button class="btn" id="qt-example">See a worked example</button><button class="linkbtn" id="qt-file">Open a CSV or TXT file</button></div>
      <p class="hint" id="qt-msg">Free, no sign-up. The analysis runs in your browser; your data is not uploaded.</p>
    </section>
    <aside class="card qt-get"><h2>What you get</h2><ul>{''.join(f'<li>{g}</li>' for g in t['gets'])}</ul><p class="eq">{t['eq']}</p></aside>
  </div>
  <section class="qt-faq"><h2>Questions</h2><div class="faq">{''.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in t['faq'])}</div></section>
  <section class="qt-more"><h2>More quick tools</h2><div class="qt-links">{others}<a href="{root}standard-curve/">Calibration curves</a></div></section>
</main>
"""
    write(os.path.join(ROOT, "tools", t["slug"], "index.html"),
          HEAD.format(title=html.escape(t["title"]), desc=html.escape(t["desc"]), root=root) + body + FOOT.format(root=root, extra=f'<script src="{root}assets/js/tool.js"></script>\n'))

root = "../"
cards = "".join(f'<a class="card tool-card" href="{root}tools/{t["slug"]}/"><h3>{html.escape(t["short"])}</h3><p>{html.escape(t["desc"].split(". ")[0])}.</p><span class="go">Open →</span></a>' for t in TOOLS)
cards += f'<a class="card tool-card" href="{root}standard-curve/"><h3>Calibration curves</h3><p>Linear, quadratic and 4PL calibration for HPLC, ICP, UV–Vis or ELISA, with unknowns, recovery and LOD/LOQ.</p><span class="go">Open →</span></a>'
hub = f"""<main class="wrap qt">
  <h1>Quick tools</h1>
  <p class="lede">One-step analyses for the measurements materials and chemistry labs make every day. Paste your data and get the result in Lattent Studio, with the figure and methods text.</p>
  <div class="tools-grid">{cards}</div>
  <p class="hint" style="margin-top:24px">Working with biological assays? See the <a href="{root}life-science/">life-science tools</a>.</p>
</main>
"""
write(os.path.join(ROOT, "tools", "index.html"),
      HEAD.format(title="Quick tools for materials and chemistry labs | Lattent", desc="Free online tools for XRD crystallite size, band gaps, activation energy, adsorption isotherms, tensile tests, peak fitting, calibration curves and curve fitting.", root=root) + hub + FOOT.format(root=root, extra=""))

life = "".join(f'<a class="card tool-card" href="{root}{p}"><h3>{n}</h3><p>{d}</p><span class="go">Open →</span></a>' for p, n, d in LIFE)
life_page = f"""<main class="wrap qt">
  <h1>Life-science tools</h1>
  <p class="lede">Lattent focuses on materials and chemistry, and these calculators serve biochemistry and biology assays with the same validated engine.</p>
  <div class="tools-grid">{life}<a class="card tool-card" href="{root}standard-curve/"><h3>Standard curves (ELISA, BCA)</h3><p>4PL and 5PL calibration with interpolation, recovery and LOD/LOQ.</p><span class="go">Open →</span></a></div>
</main>
"""
write(os.path.join(ROOT, "life-science", "index.html"),
      HEAD.format(title="Life-science tools: IC50, enzyme kinetics, qPCR | Lattent", desc="Dose–response IC50, enzyme kinetics, qPCR ΔΔCt and ELISA standard curves, validated against SciPy.", root=root) + life_page + FOOT.format(root=root, extra=""))
print("built", len(TOOLS), "tool pages, tools hub, life-science hub")
