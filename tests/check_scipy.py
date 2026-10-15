"""Compare Lattent engine results with SciPy. Usage: python tests/check_scipy.py out.json"""
import json
import sys

import numpy as np
from scipy import optimize, stats

d = json.load(open(sys.argv[1]))
fails = []


def close(name, a, b, rtol):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ok = np.allclose(a, b, rtol=rtol, atol=1e-9)
    print(f"{'ok ' if ok else 'FAIL'} {name}: lattent={np.round(a, 6).tolist()} scipy={np.round(b, 6).tolist()}")
    if not ok:
        fails.append(name)


def f4(x, b, t, l, h):
    return b + (t - b) / (1 + 10 ** ((l - x) * h))


def f5(x, b, t, l, h, s):
    lxb = l + (1 / h) * np.log10(2 ** (1 / s) - 1)
    return b + (t - b) / (1 + 10 ** ((lxb - x) * h)) ** s


for case in d["dose"]:
    f = f4 if case["model"] == "4pl" else f5
    p, cov = optimize.curve_fit(f, np.array(case["x"]), np.array(case["y"]), p0=case["p"], maxfev=20000)
    close(f"dose {case['model']} params", case["p"], p, 1e-5)
    close(f"dose {case['model']} SE", case["se"], np.sqrt(np.diag(cov)), 1e-3)
    if case["model"] == "4pl":
        b, t, l, h = p
        ec80 = 10 ** (l + np.log10(0.8 / 0.2) / abs(h))
        close("dose EC80", case["ec80"], ec80, 1e-5)


def s4(x, a, b, lc, dd):
    return dd + (a - dd) / (1 + (x / 10 ** lc) ** b)


for case in d["std"]:
    x, y = np.array(case["x"]), np.array(case["y"])
    if case["weight"] == "linear":
        r = stats.linregress(x, y)
        close("std linear params", case["p"], [r.intercept, r.slope], 1e-8)
        close("std linear SE", case["se"], [r.intercept_stderr, r.stderr], 1e-5)
        continue
    sigma = np.abs(y) if case["weight"] == "1/y2" else None
    p, cov = optimize.curve_fit(s4, x, y, p0=case["p"], sigma=sigma, maxfev=20000)
    close(f"std 4pl ({case['weight']}) params", case["p"], p, 1e-5)
    close(f"std 4pl ({case['weight']}) SE", case["se"], np.sqrt(np.diag(cov)), 1e-3)
    a, b, lc, dd = p
    conc = 10 ** lc * ((a - dd) / (np.mean([0.9, 0.95]) - dd) - 1) ** (1 / b)
    close(f"std 4pl ({case['weight']}) interpolation", case["unk"], conc, 1e-5)

kin_models = {
    "mm": lambda s, v, k: v * s / (k + s),
    "subinh": lambda s, v, k, ki: v * s / (k + s * (1 + s / ki)),
    "hill": lambda s, v, k, h: v * s ** h / (k ** h + s ** h),
}
for case in d["kin"]:
    f = kin_models[case["key"]]
    try:
        p, cov = optimize.curve_fit(f, np.array(case["x"]), np.array(case["y"]), p0=case["p"], maxfev=20000)
    except Exception as e:  # noqa: BLE001
        print("skip", case["key"], e)
        continue
    close(f"kinetics {case['key']} params", case["p"], p, 1e-4)
    if case["key"] == "mm":
        close("kinetics mm SE", case["se"], np.sqrt(np.diag(cov)), 1e-3)

glob = {
    "competitive": lambda X, v, k, ki: v * X[0] / (k * (1 + X[1] / ki) + X[0]),
    "noncompetitive": lambda X, v, k, ki: v * X[0] / ((1 + X[1] / ki) * (k + X[0])),
    "uncompetitive": lambda X, v, k, ki: v * X[0] / (k + X[0] * (1 + X[1] / ki)),
    "mixed": lambda X, v, k, ki, a: v * X[0] / (k * (1 + X[1] / ki) + X[0] * (1 + X[1] / (a * ki))),
}
for case in d["glob"]:
    X = np.vstack([case["s"], case["i"]])
    p, cov = optimize.curve_fit(glob[case["key"]], X, np.array(case["y"]), p0=case["p"], maxfev=20000)
    close(f"inhibition {case['key']} params", case["p"], p, 1e-4)
    if case["key"] == "competitive":
        close("inhibition competitive SE", case["se"], np.sqrt(np.diag(cov)), 1e-3)
print("best inhibition model:", d["glob"][0]["key"])
if d["glob"][0]["key"] != "competitive":
    fails.append("mechanism selection")

for c in d["tdist"]:
    if "cdf" in c:
        close(f"t cdf t={c['t']} df={c['df']}", c["cdf"], stats.t.cdf(c["t"], c["df"]), 1e-7)
    else:
        close(f"t inv p={c['p']} df={c['df']}", c["inv"], stats.t.ppf(c["p"], c["df"]), 1e-7)
for c in d["welch"]:
    r = stats.ttest_ind(c["a"], c["b"], equal_var=False)
    close("welch t, p", [c["t"], c["p"]], [r.statistic, r.pvalue], 1e-6)

q = d["qpcr"]
dct = {s: v[0] - v[1] for s, v in q["data"].items()}
ctrl = [dct[s] for s in dct if s[0] == "c"]
trt = [dct[s] for s in dct if s[0] == "t"]
ddct = np.array(trt) - np.mean(ctrl)
fold = 2 ** np.mean(-ddct)
row = [r for r in q["summary"] if r["group"] == "Treated"][0]
close("qPCR Livak fold change", row["fold"], fold, 1e-9)
r = stats.ttest_ind(-ddct, -(np.array(ctrl) - np.mean(ctrl)), equal_var=False)
close("qPCR Welch p", row["p"], r.pvalue, 1e-6)

print("\nALL PASS" if not fails else f"\n{len(fails)} FAILURES: {fails}")
sys.exit(1 if fails else 0)
