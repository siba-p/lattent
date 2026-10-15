"""Train Lattent's in-browser specialist models on simulated data and export them.

Usage: python tests/ml/train.py <out-dir-with-train*.json-and-test.json> <assets/models/shape-v1.js>

Writes the weights as a small JavaScript file (no runtime dependencies) and a JSON
report with held-out accuracy and the confusion matrix.
"""
import glob
import json
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, roc_auc_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

src, out_js = sys.argv[1], sys.argv[2]
train = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(src, "train*.json")))]
test = json.load(open(os.path.join(src, "test.json")))
classes = train[0]["classes"]

X = np.array(sum((d["X"] for d in train), []), dtype=np.float64)
y = np.array(sum((d["y"] for d in train), []))
Xt, yt = np.array(test["X"], dtype=np.float64), np.array(test["y"])
print("train", X.shape, "test", Xt.shape)

sc = StandardScaler().fit(X)
sc.scale_[sc.scale_ < 1e-6] = 1.0
mlp = MLPClassifier(hidden_layer_sizes=(128, 64), activation="relu", alpha=3e-4, batch_size=256,
                    learning_rate_init=1e-3, max_iter=120, early_stopping=True, validation_fraction=0.1,
                    n_iter_no_change=8, random_state=0)
mlp.fit(sc.transform(X), y)
P = mlp.predict_proba(sc.transform(Xt))
order = np.argsort(-P, axis=1)
top1 = float(np.mean(order[:, 0] == yt))
top2 = float(np.mean((order[:, :2] == yt[:, None]).any(1)))
top3 = float(np.mean((order[:, :3] == yt[:, None]).any(1)))
cm = confusion_matrix(yt, order[:, 0], labels=range(len(classes)))
per = {c: float(cm[i, i] / cm[i].sum()) for i, c in enumerate(classes)}
print(f"shape model: top-1 {top1:.3f}  top-2 {top2:.3f}  top-3 {top3:.3f}  ({mlp.n_iter_} epochs)")
for c, a in per.items():
    print(f"  {c:22s} {a:.3f}")

# measurement-error model: constant vs proportional scatter
NX = np.array(sum((d["NX"] for d in train), []), dtype=np.float64)
Ny = np.array(sum((d["Ny"] for d in train), []))
NXt, Nyt = np.array(test["NX"], dtype=np.float64), np.array(test["Ny"])
nsc = StandardScaler().fit(NX)
nsc.scale_[nsc.scale_ < 1e-6] = 1.0
nm = MLPClassifier(hidden_layer_sizes=(24,), alpha=1e-3, max_iter=300, early_stopping=True, random_state=0).fit(nsc.transform(NX), Ny)
pn = nm.predict_proba(nsc.transform(NXt))[:, 1]
nacc = float(np.mean((pn > 0.5) == Nyt))
nauc = float(roc_auc_score(Nyt, pn))
print(f"noise model: accuracy {nacc:.3f}  AUC {nauc:.3f}")

r = lambda a: np.round(np.asarray(a, dtype=np.float64), 6).tolist()
model = {
    "version": 1,
    "shape": {"classes": classes, "mean": r(sc.mean_), "scale": r(sc.scale_),
              "W": [r(w) for w in mlp.coefs_], "b": [r(b) for b in mlp.intercepts_]},
    "noise": {"mean": r(nsc.mean_), "scale": r(nsc.scale_), "W": [r(w) for w in nm.coefs_], "b": [r(b) for b in nm.intercepts_]},
    "metrics": {"shape_top1": round(top1, 4), "shape_top2": round(top2, 4), "shape_top3": round(top3, 4),
                "per_class": {k: round(v, 4) for k, v in per.items()}, "noise_accuracy": round(nacc, 4), "noise_auc": round(nauc, 4),
                "train_samples": int(len(y)), "test_samples": int(len(yt)), "confusion": cm.tolist()},
}
with open(out_js, "w") as f:
    f.write("/* Lattent specialist models, trained on simulated data by tests/ml/train.py. Do not edit. */\n")
    f.write("window.BF_ML_MODELS = " + json.dumps(model, separators=(",", ":")) + ";\n")
# reference predictions for the JavaScript parity test
json.dump({"X": Xt[:60].tolist(), "P": P[:60].tolist(), "NX": NXt[:60].tolist(), "PN": pn[:60].tolist()},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity.json"), "w"), separators=(",", ":"))
print("wrote", out_js, os.path.getsize(out_js) // 1024, "KB")
