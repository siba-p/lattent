"""Compare Benchfit studio engines with SciPy/NumPy. Usage: python tests/check_studio.py out.json"""
import json
import sys

import numpy as np
from scipy import optimize, signal, stats

d = json.load(open(sys.argv[1]))
fails = []


def close(name, a, b, rtol, atol=1e-9):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ok = a.shape == b.shape and np.allclose(a, b, rtol=rtol, atol=atol)
    print(f"{'ok ' if ok else 'FAIL'} {name}: benchfit={np.round(a, 6).tolist()} ref={np.round(b, 6).tolist()}")
    if not ok:
        fails.append(name)


g = [np.array(v) for v in d["groups"]]
nt = stats.normaltest(np.concatenate([g[0], g[2]]))
close("normality K2, p", [d["normality"]["K2"], d["normality"]["p"]], [nt.statistic, nt.pvalue], 1e-6)
r = stats.ttest_ind(g[0], g[1])
close("Student t, p", [d["student"]["t"], d["student"]["p"]], [r.statistic, r.pvalue], 1e-7)
r = stats.ttest_rel(g[0][:8], g[1])
close("paired t, p", [d["paired"]["t"], d["paired"]["p"]], [r.statistic, r.pvalue], 1e-7)
r = stats.mannwhitneyu(g[0][:6], g[1][:7], method="exact")
close("Mann-Whitney exact U, p", [d["mwSmall"]["U"], d["mwSmall"]["p"]], [r.statistic, r.pvalue], 1e-9)
a, b = [np.array(v) for v in d["mwBigData"]]
r = stats.mannwhitneyu(a, b, method="asymptotic")
close("Mann-Whitney asymptotic U, p", [d["mwBig"]["U"], d["mwBig"]["p"]], [r.statistic, r.pvalue], 1e-7)
r = stats.f_oneway(*g)
close("one-way ANOVA F, p", [d["anova"]["F"], d["anova"]["p"]], [r.statistic, r.pvalue], 1e-7)
r = stats.kruskal(*g)
close("Kruskal-Wallis H, p", [d["anova"]["kwH"], d["anova"]["kwP"]], [r.statistic, r.pvalue], 1e-7)
r = stats.levene(*g, center="median")
close("Brown-Forsythe F, p", [d["anova"]["bfF"], d["anova"]["bfP"]], [r.statistic, r.pvalue], 1e-7)
# Welch ANOVA by the textbook formula
k = len(g); n = np.array([len(x) for x in g]); m = np.array([x.mean() for x in g]); v = np.array([x.var(ddof=1) for x in g])
w = n / v; mw = (w * m).sum() / w.sum(); tmp = (((1 - w / w.sum()) ** 2) / (n - 1)).sum()
Fw = ((w * (m - mw) ** 2).sum() / (k - 1)) / (1 + 2 * (k - 2) / (k * k - 1) * tmp)
df2 = (k * k - 1) / (3 * tmp)
close("Welch ANOVA F, p", [d["anova"]["welchF"], d["anova"]["welchP"]], [Fw, stats.f.sf(Fw, k - 1, df2)], 1e-7)
tk = stats.tukey_hsd(*g)
ci = tk.confidence_interval(0.95)
for pr in d["anova"]["pairs"]:
    i, j = pr["i"], pr["j"]
    close(f"Tukey p ({i},{j})", pr["pTukey"], tk.pvalue[i, j], 2e-3, 2e-4)
    close(f"Tukey CI ({i},{j})", [pr["lo"], pr["hi"]], [ci.low[i, j], ci.high[i, j]], 2e-3, 2e-3)
for c in d["ptukey"]:
    close(f"studentized range sf q={c['q']} k={c['k']} df={c['df']}", c["sf"], stats.studentized_range.sf(c["q"], c["k"], c["df"]), 1e-3, 1e-5)
x, y = np.array(d["corr"]["x"]), np.array(d["corr"]["y"])
r = stats.pearsonr(x, y)
close("Pearson r, p", [d["corr"]["pearson"]["r"], d["corr"]["pearson"]["p"]], [r.statistic, r.pvalue], 1e-7)
r = stats.spearmanr(x, y)
close("Spearman rho, p", [d["corr"]["spearman"]["rho"], d["corr"]["spearman"]["p"]], [r.statistic, r.pvalue], 1e-7)
X = np.column_stack([np.ones(len(d["ols"]["y"])), np.array(d["ols"]["X"])]); yy = np.array(d["ols"]["y"])
beta, *_ = np.linalg.lstsq(X, yy, rcond=None)
res = yy - X @ beta; dof = len(yy) - X.shape[1]; s2 = res @ res / dof
se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X)))
close("OLS coefficients", d["ols"]["b"], beta, 1e-8)
close("OLS SE", d["ols"]["se"], se, 1e-7)
close("OLS p", d["ols"]["p"], 2 * stats.t.sf(np.abs(beta / se), dof), 1e-6, 1e-12)
Xp = np.array(d["pca"]["X"]); Z = (Xp - Xp.mean(0)) / Xp.std(0, ddof=1)
ev = np.sort(np.linalg.eigvalsh(np.corrcoef(Z.T)))[::-1]
close("PCA eigenvalues", d["pca"]["values"], ev, 1e-8)


def f_arr(T, lnA, Ea): return np.exp(lnA - 1000 * Ea / (8.314462618 * T))
def f_lang(c, qm, K): return qm * K * c / (1 + K * c)
def f_kww(t, A, tau, b, c): return A * np.exp(-(t / tau) ** b) + c
def f_car(g, e0, ei, lam, n): return ei + (e0 - ei) * (1 + (lam * g) ** 2) ** ((n - 1) / 2)


fns = {"arrhenius": f_arr, "langmuir": f_lang, "kww": f_kww, "carreau": f_car}
for mdl in d["models"]:
    p, cov = optimize.curve_fit(fns[mdl["id"]], np.array(mdl["x"]), np.array(mdl["y"]), p0=mdl["p"], maxfev=20000)
    close(f"model {mdl['id']} params", mdl["p"], p, 1e-5)
    close(f"model {mdl['id']} SE", mdl["se"], np.sqrt(np.diag(cov)), 2e-3)
print("Arrhenius Ea (kJ/mol, truth 45):", round(d["models"][0]["p"][1], 2))
print("auto-fit top models for Langmuir data:", d["autoTop"])
if not any("Langmuir" in t or "langmuir" in t for t in d["autoTop"]):
    fails.append("auto-fit choice")
c = d["custom"]
p, _ = optimize.curve_fit(lambda t, A, k, cc: A * np.exp(-k * t) + cc, np.array(c["x"]), np.array(c["y"]), p0=c["p"])
close("custom equation params", c["p"], p, 1e-5)
pk = d["peaks"]
close("peak centres (truth 38.2, 44.4, 64.6)", pk["centers"], [38.2, 44.4, 64.6], 2e-3)
close("peak FWHM (truth 0.9, 1.0, 1.3)", pk["fwhm"], [0.9, 1.0, 1.3], 0.05)
lam = 1.5406
for i, cen in enumerate(pk["centers"]):
    th = np.radians(cen / 2)
    close(f"XRD d-spacing {i}", d["xrd"][i]["d"], lam / (2 * np.sin(th)), 1e-9)
    close(f"Scherrer size {i}", d["xrd"][i]["size"], 0.9 * lam / (np.radians(pk["fwhm"][i]) * np.cos(th)) / 10, 1e-9)
sm = signal.savgol_filter(np.array(d["sg"]["y"]), 11, 3)
close("Savitzky-Golay interior", d["sg"]["s"][5:-5], sm[5:-5], 1e-9, 1e-7)
G = d["gp"]; Xg = np.array(G["X"]); yg = np.array(G["y"])
lo, hi = np.array(G["lo"]), np.array(G["hi"]); Zs = (Xg - lo) / (hi - lo)
ell, sf2, sn2 = np.array(G["ell"]), G["sf2"], G["sn2"] + 1e-8
my, sy = yg.mean(), yg.std(ddof=1); t = (yg - my) / sy


def kern(A, B): return sf2 * np.exp(-0.5 * (((A[:, None, :] - B[None, :, :]) / ell) ** 2).sum(-1))


K = kern(Zs, Zs) + sn2 * np.eye(len(yg)); Ki = np.linalg.inv(K)
Ts = (np.array(G["test"]) - lo) / (hi - lo); ks = kern(Ts, Zs)
mu = ks @ Ki @ t * sy + my
var = (sf2 - np.einsum("ij,jk,ik->i", ks, Ki, ks)) * sy * sy
close("GP posterior mean", [p_["mean"] for p_ in G["pred"]], mu, 1e-6, 1e-5)
close("GP posterior sd", [p_["sd"] for p_ in G["pred"]], np.sqrt(var), 1e-5)
alpha = Ki @ t
close("GP leave-one-out", G["loo"], (t - alpha / np.diag(Ki)) * sy + my, 1e-6)
print("Tauc band gap (truth 3.20 eV):", round(d["tauc"], 3))
if abs(d["tauc"] - 3.2) > 0.05:
    fails.append("Tauc band gap")
te = d["tensile"]
print("tensile E (truth 70000), yield, UTS:", round(te["E"]), round(te["yieldS"], 1), round(te["uts"], 1))
if abs(te["E"] - 70000) / 70000 > 0.02:
    fails.append("tensile modulus")
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILURES: {fails}")
sys.exit(1 if fails else 0)
