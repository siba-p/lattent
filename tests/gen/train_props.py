"""Train composition → property networks (formation energy, band gap) on Materials Project data
(via Matbench, CC BY 4.0) and export them for the browser.

Usage: python tests/gen/train_props.py <dir with eform_f.* gap_f.*> <out.json> [parity.json]
The split is by composition, so no test composition is seen in training under another polymorph.
A composition has one formation energy that matters for discovery: that of its most stable
polymorph. Matbench lists every computed polymorph (GaAs: +0.28 to −0.33 eV/atom), so the
formation-energy model is trained on the lowest value per composition. The band-gap model keeps
every entry, which weights well-studied compounds (TiO2 has six) by how often they were computed;
training on per-composition medians made predictions for common oxides clearly worse.
"""
import base64
import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn

torch.manual_seed(0)
np.random.seed(0)
src, out = sys.argv[1], sys.argv[2]
dev = "mps" if torch.backends.mps.is_available() else "cpu"


def load(prefix, agg):
    meta = json.load(open(os.path.join(src, prefix + ".json")))
    X = np.fromfile(os.path.join(src, prefix + ".bin"), dtype=np.float32).reshape(meta["n"], meta["nfeat"])
    y, keys = np.array(meta["y"], dtype=np.float32), np.array(meta["keys"])
    if agg == "all":
        print(f"{prefix}: {len(y)} entries, {len(set(keys))} compositions (all entries)")
        return X, y, keys
    groups = {}
    for i, k in enumerate(keys):
        groups.setdefault(k, []).append(i)
    idx = [g[0] for g in groups.values()]
    yy = np.array([y[g].min() if agg == "min" else np.median(y[g]) for g in groups.values()], dtype=np.float32)
    print(f"{prefix}: {len(y)} entries, {len(idx)} compositions ({agg} per composition)")
    return X[idx], yy, keys[idx]


def split(keys, frac=0.1):
    u = np.unique(keys)
    rng = np.random.default_rng(0)
    test = set(rng.choice(u, int(len(u) * frac), replace=False))
    m = np.array([k in test for k in keys])
    return ~m, m


class Net(nn.Module):
    def __init__(self, d, h=(256, 128, 64), positive=False):
        super().__init__()
        layers, prev = [], d
        for w in h:
            layers += [nn.Linear(prev, w), nn.SiLU()]
            prev = w
        layers += [nn.Linear(prev, 1)]
        self.f = nn.Sequential(*layers)
        self.positive = positive

    def forward(self, x):
        y = self.f(x).squeeze(-1)
        return nn.functional.softplus(y) if self.positive else y


def train(name, X, y, keys, positive):
    tr, te = split(keys)
    mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-6
    Xs = (X - mu) / sd
    Xt = torch.tensor(Xs[tr], device=dev); yt = torch.tensor(y[tr], device=dev)
    Xv = torch.tensor(Xs[te], device=dev)
    net = Net(X.shape[1], positive=positive).to(dev)
    epochs, bs = 80, 512
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=epochs * (len(Xt) // bs + 1))
    for ep in range(epochs):
        perm = torch.randperm(len(Xt), device=dev)
        net.train()
        for i in range(0, len(Xt), bs):
            idx = perm[i:i + bs]
            loss = nn.functional.l1_loss(net(Xt[idx]), yt[idx])
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
    net.eval()
    with torch.no_grad():
        p = net(Xv).cpu().numpy()
    mae = float(np.mean(np.abs(p - y[te])))
    base = float(np.mean(np.abs(np.median(y[tr]) - y[te])))
    ss = 1 - np.sum((p - y[te]) ** 2) / np.sum((y[te] - y[te].mean()) ** 2)
    print(f"{name}: test MAE {mae:.3f} (median baseline {base:.3f}), R² {ss:.3f}, train {tr.sum()}, test {te.sum()}")
    layers = [m for m in net.f if isinstance(m, nn.Linear)]
    enc = lambda a: base64.b64encode(np.ascontiguousarray(a, dtype=np.float32).tobytes()).decode()
    exp = {"mean": enc(mu), "std": enc(sd), "positive": positive,
           "layers": [{"in": l.in_features, "out": l.out_features, "W": enc(l.weight.detach().cpu().numpy().T), "b": enc(l.bias.detach().cpu().numpy())} for l in layers],
           "metrics": {"mae": round(mae, 4), "baseline_mae": round(base, 4), "r2": round(float(ss), 4), "n_train": int(tr.sum()), "n_test": int(te.sum())}}
    par = {"X": X[te][:40].tolist(), "p": p[:40].tolist()}
    return exp, par


Xe, ye, ke = load("eform_f", "min")
Xg, yg, kg = load("gap_f", "all")
e, pe = train("formation energy (eV/atom)", Xe, ye, ke, False)
g, pg = train("band gap (eV)", Xg, yg, kg, True)
json.dump({"version": 2, "source": "Materials Project via Matbench (CC BY 4.0)", "targets": {"eform": "formation energy of the most stable known polymorph (eV/atom)", "gap": "PBE band gap, averaged over the computed polymorphs (eV)"}, "eform": e, "gap": g}, open(out, "w"), separators=(",", ":"))
if len(sys.argv) > 3:
    json.dump({"eform": pe, "gap": pg}, open(sys.argv[3], "w"), separators=(",", ":"))
print("wrote", out, os.path.getsize(out) // 1024, "KB")
