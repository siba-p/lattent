"""Split-conformal calibration of the property networks: the 90% quantile of absolute errors on
held-out compositions (the same composition split as training). Band-gap errors depend strongly
on whether a compound is metallic, so they are calibrated per predicted-gap range (Mondrian).
Usage: python tests/gen/calibrate.py <dir with eform_f.* gap_f.*> <props.json in> <props.json out>"""
import base64
import json
import os
import sys

import numpy as np

src, pin, pout = sys.argv[1:4]
P = json.load(open(pin))
dec = lambda s: np.frombuffer(base64.b64decode(s), dtype=np.float32)


def load(prefix, agg):
    meta = json.load(open(os.path.join(src, prefix + ".json")))
    X = np.fromfile(os.path.join(src, prefix + ".bin"), dtype=np.float32).reshape(meta["n"], meta["nfeat"])
    y, keys = np.array(meta["y"], dtype=np.float32), np.array(meta["keys"])
    if agg == "all":
        return X, y, keys
    groups = {}
    for i, k in enumerate(keys):
        groups.setdefault(k, []).append(i)
    idx = [g[0] for g in groups.values()]
    return X[idx], np.array([y[g].min() for g in groups.values()], dtype=np.float32), keys[idx]


def split(keys, frac=0.1):
    u = np.unique(keys)
    rng = np.random.default_rng(0)
    test = set(rng.choice(u, int(len(u) * frac), replace=False))
    return np.array([k in test for k in keys])


def predict(m, X):
    h = (X - dec(m["mean"])) / dec(m["std"])
    for i, L in enumerate(m["layers"]):
        W = dec(L["W"]).reshape(L["in"], L["out"])
        h = h @ W + dec(L["b"])
        if i < len(m["layers"]) - 1:
            h = h / (1 + np.exp(-np.clip(h, -60, 60)))
    h = h[:, 0]
    return np.log1p(np.exp(h)) if m["positive"] else h


def q90(err):
    n = len(err)
    k = min(n - 1, int(np.ceil((n + 1) * 0.9)) - 1)
    return float(np.sort(err)[k])


Xe, ye, ke = load("eform_f", "min")
te = split(ke)
pe = predict(P["eform"], Xe[te])
P["eform"]["interval"] = {"level": 0.9, "q": round(q90(np.abs(pe - ye[te])), 4), "n": int(te.sum())}
Xg, yg, kg = load("gap_f", "all")
tg = split(kg)
pg = predict(P["gap"], Xg[tg])
bins = []
for lo, hi in [(0, 0.3), (0.3, 2.0), (2.0, 99)]:
    m = (pg >= lo) & (pg < hi)
    bins.append({"lo": lo, "hi": hi, "q": round(q90(np.abs(pg[m] - yg[tg][m])), 4), "n": int(m.sum())})
P["gap"]["interval"] = {"level": 0.9, "bins": bins}
print("formation energy:", P["eform"]["interval"])
print("band gap:", bins)
json.dump(P, open(pout, "w"), separators=(",", ":"))
