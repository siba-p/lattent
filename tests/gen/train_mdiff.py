"""Masked (discrete) diffusion over chemical formulas, exported for in-browser sampling.

A formula is up to five (element, count) slots in electronegativity order, e.g. Zn Cu Sn S /
1 2 1 4. Training masks a random fraction of the ten tokens and teaches a network to restore
them; sampling starts fully masked and unmasks the most confident tokens over several steps.
This is the discrete diffusion used for atom types in MatterGen and in masked diffusion language
models. Conditioning (allowed elements, number of elements, band gap) is dropped at random during
training for classifier-free guidance. Data: Materials Project compositions with negative
formation energy, via Matbench (CC BY 4.0).

Usage: python tests/gen/train_mdiff.py <dir with eform_f.json gap_f.json> <out.json> <report.json>
"""
import base64
import json
import math
import os
import sys
from collections import Counter, defaultdict

import numpy as np
import torch
import torch.nn as nn

torch.manual_seed(2)
np.random.seed(2)
src, out_path, rep_path = sys.argv[1], sys.argv[2], sys.argv[3]
dev = "mps" if torch.backends.mps.is_available() else "cpu"
here = os.path.dirname(os.path.abspath(__file__))
SYM = json.load(open(os.path.join(here, "symbols.json")))
EN = json.load(open(os.path.join(here, "en.json")))
K, SLOTS, MAXC = 94, 5, 12
PAD_E, MASK_E = K, K + 1           # element vocabulary: 0..93 elements, 94 pad, 95 mask
PAD_C, MASK_C = 0, MAXC + 1        # count vocabulary: 1..12 counts, 0 pad, 13 mask
VE, VC = K + 2, MAXC + 2
CDIM = K + 2 + 6
DE, DC, H = 48, 24, int(os.environ.get("HID", 384))

ef = json.load(open(os.path.join(src, "eform_f.json")))
gp = json.load(open(os.path.join(src, "gap_f.json")))
efs, comp = defaultdict(list), {}


def parse_key(k):
    import re
    return {SYM.index(e): int(n) for e, n in re.findall(r"([A-Z][a-z]?)(\d+)", k)}


for k, y in zip(ef["keys"], ef["y"]):
    efs[k].append(y); comp[k] = None
gaps = defaultdict(list)
for k, y in zip(gp["keys"], gp["y"]):
    gaps[k].append(y); comp[k] = None
E, C, G, N, KEYS = [], [], [], [], []
for k in comp:
    if k in efs and min(efs[k]) >= 0:
        continue
    c = parse_key(k)
    if len(c) > SLOTS or max(c.values()) > MAXC:
        continue
    els = sorted(c, key=lambda z: (EN[z] if EN[z] is not None else 3.2, z))
    e = els + [PAD_E] * (SLOTS - len(els)); n = [c[z] for z in els] + [PAD_C] * (SLOTS - len(els))
    E.append(e); C.append(n); N.append(len(els)); KEYS.append(k)
    G.append([min(float(np.median(gaps[k])), 8.0) / 4.0, 1.0] if k in gaps else [0.0, 0.0])
E, C, G, N = map(np.array, (E, C, G, N))
print("training formulas", len(E), "with band gap", int(G[:, 1].sum()), "element-count distribution", dict(Counter(N.tolist())))


class Den(nn.Module):
    def __init__(self):
        super().__init__()
        self.ee = nn.Embedding(VE, DE); self.ce = nn.Embedding(VC, DC)
        self.l1 = nn.Linear(SLOTS * (DE + DC) + CDIM + 1, H); self.l2 = nn.Linear(H, H); self.l3 = nn.Linear(H, H)
        self.oe = nn.Linear(H, SLOTS * VE); self.oc = nn.Linear(H, SLOTS * VC)
        self.act = nn.SiLU()

    def forward(self, e, c, cond, r):
        h = torch.cat([self.ee(e).flatten(1), self.ce(c).flatten(1), cond, r[:, None]], 1)
        h = self.act(self.l1(h)); h = h + self.act(self.l2(h)); h = h + self.act(self.l3(h))
        return self.oe(h).view(-1, SLOTS, VE), self.oc(h).view(-1, SLOTS, VC)


net = Den().to(dev)
Et, Ct, Gt, Nt = (torch.tensor(a, device=dev) for a in (E, C, G.astype(np.float32), N))


def make_cond(e, g, n):
    B = len(e)
    present = torch.zeros(B, K, device=dev)
    valid = e < K
    present.scatter_(1, e.clamp(max=K - 1) * valid + (~valid) * 0, valid.float())
    R = torch.rand(B, K, device=dev); R[present > 0] = 2.0
    nsel = (n + torch.randint(0, 4, (B,), device=dev)).clamp(max=K)
    thr = torch.sort(R, 1, descending=True).values.gather(1, (nsel - 1)[:, None])
    mask = (R >= thr).float()
    mask[torch.rand(B, device=dev) < 0.3] = 1.0
    gc = g.clone(); gc[torch.rand(B, device=dev) < 0.25] = 0
    nl = torch.zeros(B, 6, device=dev); use = torch.rand(B, device=dev) < 0.5
    nl[use, (n[use] - 1).clamp(0, 4)] = 1.0; nl[use, 5] = 1.0
    cond = torch.cat([mask, gc, nl], 1)
    cond[torch.rand(B, device=dev) < 0.1] = 0
    return cond


epochs, bs = int(os.environ.get("EPOCHS", 120)), 512
opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-6)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=1e-3, total_steps=epochs * (len(Et) // bs + 1))
ckpt = out_path + ".pt"
if os.environ.get("RESUME") and os.path.exists(ckpt):
    net.load_state_dict(torch.load(ckpt)); epochs = 0
for ep in range(epochs):
    perm = torch.randperm(len(Et), device=dev); tot = 0
    for i in range(0, len(Et), bs):
        idx = perm[i:i + bs]
        e0, c0 = Et[idx], Ct[idx]
        B = len(idx)
        r = torch.rand(B, device=dev).clamp(0.02, 1.0)
        m = torch.rand(B, SLOTS, device=dev) < r[:, None]
        mc = torch.rand(B, SLOTS, device=dev) < r[:, None]
        e = torch.where(m, torch.full_like(e0, MASK_E), e0)
        c = torch.where(mc, torch.full_like(c0, MASK_C), c0)
        le, lc = net(e, c, make_cond(e0, Gt[idx], Nt[idx]), r)
        loss = (nn.functional.cross_entropy(le.reshape(-1, VE), e0.reshape(-1), reduction="none") * m.reshape(-1)).sum() / m.sum().clamp(min=1) \
             + (nn.functional.cross_entropy(lc.reshape(-1, VC), c0.reshape(-1), reduction="none") * mc.reshape(-1)).sum() / mc.sum().clamp(min=1)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item() * B
    if ep % 20 == 0 or ep == epochs - 1:
        print(f"epoch {ep} loss {tot / len(Et):.4f}")
net.eval()
torch.save(net.state_dict(), ckpt)


def build_cond(n, gap=None, allowed=None, nel=None):
    c = torch.zeros(n, CDIM, device=dev)
    if allowed is not None:
        c[:, allowed] = 1.0
    else:
        c[:, :K] = 1.0
    if gap is not None:
        c[:, K] = gap / 4.0; c[:, K + 1] = 1.0
    if nel is not None:
        c[:, K + 2 + nel - 1] = 1.0; c[:, K + 2 + 5] = 1.0
    return c


@torch.no_grad()
def sample(n, gap=None, allowed=None, nel=None, steps=10, w=float(os.environ.get("CFG_W", 1.5)), temp=1.0, seed=0):
    g = torch.Generator(device="cpu").manual_seed(seed)
    e = torch.full((n, SLOTS), MASK_E, device=dev); c = torch.full((n, SLOTS), MASK_C, device=dev)
    cond = build_cond(n, gap, allowed, nel); nul = build_cond(n, None, allowed, None)
    guided = gap is not None or nel is not None
    emask = torch.ones(VE, dtype=torch.bool, device=dev); emask[MASK_E] = False
    if allowed is not None:
        emask[:K] = False; emask[allowed] = True
    for s in range(steps):
        r = torch.full((n,), 1 - s / steps, device=dev)
        le, lc = net(e, c, nul, r)
        if guided:
            le2, lc2 = net(e, c, cond, r); le = le + w * (le2 - le); lc = lc + w * (lc2 - lc)
        le = le.masked_fill(~emask[None, None, :], -1e9)
        lc[:, :, MASK_C] = -1e9
        if nel is not None:     # slot i is an element for i < nel, padding afterwards
            for i in range(SLOTS):
                if i < nel:
                    le[:, i, PAD_E] = -1e9; lc[:, i, PAD_C] = -1e9
                else:
                    le[:, i, :] = -1e9; le[:, i, PAD_E] = 0; lc[:, i, :] = -1e9; lc[:, i, PAD_C] = 0
        for i in range(SLOTS):   # one element per slot only once
            used = e.clone(); used[:, i] = MASK_E
            for j in range(SLOTS):
                ok = used[:, j] < K
                le[ok, i, used[ok, j]] = -1e9
        pe = torch.softmax(le / temp, -1); pc = torch.softmax(lc / temp, -1)
        se = torch.multinomial(pe.reshape(-1, VE).cpu(), 1, generator=g).to(dev).view(n, SLOTS)
        sc = torch.multinomial(pc.reshape(-1, VC).cpu(), 1, generator=g).to(dev).view(n, SLOTS)
        conf_e = pe.gather(2, se[..., None]).squeeze(-1); conf_c = pc.gather(2, sc[..., None]).squeeze(-1)
        target_masked = int(round(SLOTS * (1 - (s + 1) / steps)))
        for tok, smp, conf, MASKV in ((e, se, conf_e, MASK_E), (c, sc, conf_c, MASK_C)):
            masked = tok == MASKV
            conf = torch.where(masked, conf, torch.full_like(conf, -1.0))
            nmask = masked.sum(1)
            k_unmask = (nmask - target_masked).clamp(min=0)
            order = torch.argsort(conf, 1, descending=True)
            rank = torch.argsort(order, 1)
            take = masked & (rank < k_unmask[:, None])
            tok[take] = smp[take]
    return e.cpu().numpy(), c.cpu().numpy()


def formulas(ec):
    e, c = ec; out = []
    for i in range(len(e)):
        d = {}
        ok = True
        for z, n in zip(e[i], c[i]):
            if z == PAD_E:
                continue
            if z > PAD_E or n == PAD_C or n > MAXC:
                ok = False; break
            d[SYM[z]] = d.get(SYM[z], 0) + int(n)
        if ok and d:
            gg = np.gcd.reduce(list(d.values()))
            out.append({k: v // gg for k, v in d.items()})
    return out


key = lambda d: "".join(f"{k}{d[k]}" for k in sorted(d))
train_keys = set(KEYS)
rep = {}
U = formulas(sample(3000, seed=3)); uk = [key(u) for u in U]
rep["unconditional"] = {"n": len(U), "unique": round(len(set(uk)) / max(1, len(uk)), 3), "novel": round(sum(k not in train_keys for k in set(uk)) / max(1, len(set(uk))), 3),
                        "n_elements": {str(m): round(sum(len(u) == m for u in U) / max(1, len(U)), 3) for m in range(1, 6)}}
rep["training_n_elements"] = {str(m): round(float((N == m).mean()), 3) for m in range(1, 6)}
cz = formulas(sample(800, gap=1.5, nel=4, allowed=[SYM.index(x) for x in ("Cu", "Zn", "Sn", "S")], seed=11)); czk = [key(x) for x in cz]
rep["CuZnSnS"] = {"n": len(czk), "top": [k for k, _ in Counter(czk).most_common(12)], "rank_of_Cu2ZnSnS4": ([k for k, _ in Counter(czk).most_common()].index("Cu2S4Sn1Zn1") + 1) if "Cu2S4Sn1Zn1" in czk else None,
                  "share_Cu2ZnSnS4": round(czk.count("Cu2S4Sn1Zn1") / max(1, len(czk)), 3)}
lfp = formulas(sample(600, nel=4, allowed=[SYM.index(x) for x in ("Li", "Fe", "P", "O")], seed=12)); lk = [key(x) for x in lfp]
rep["LiFePO"] = {"top": [k for k, _ in Counter(lk).most_common(8)], "has_LiFePO4": "Fe1Li1O4P1" in lk}
rep["conditional_samples"] = {str(gt): [key(x) for x in formulas(sample(1500, gap=gt, seed=7))] for gt in (0.0, 1.5, 3.0, 5.0)}
print(json.dumps({k: v for k, v in rep.items() if k != "conditional_samples"}, indent=1))


def enc16(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.float16).tobytes()).decode()


lin = lambda l: {"in": l.in_features, "out": l.out_features, "W": enc16(l.weight.detach().cpu().numpy().T), "b": enc16(l.bias.detach().cpu().numpy())}
exp = {"version": 1, "kind": "masked-discrete-diffusion", "K": K, "slots": SLOTS, "maxc": MAXC, "VE": VE, "VC": VC, "DE": DE, "DC": DC, "H": H, "cdim": CDIM,
       "ee": enc16(net.ee.weight.detach().cpu().numpy()), "ce": enc16(net.ce.weight.detach().cpu().numpy()),
       "l1": lin(net.l1), "l2": lin(net.l2), "l3": lin(net.l3), "oe": lin(net.oe), "oc": lin(net.oc), "n_train": int(len(E)), "source": "Materials Project via Matbench (CC BY 4.0)"}
pe_ = torch.tensor([[29 - 1, 30 - 1, MASK_E, PAD_E, PAD_E], [MASK_E] * 5], device=dev)
pc_ = torch.tensor([[2, MASK_C, MASK_C, PAD_C, PAD_C], [MASK_C] * 5], device=dev)
pcond = torch.cat([build_cond(1, 1.5, [28, 29, 15], 3), build_cond(1)], 0)
with torch.no_grad():
    le, lc = net(pe_, pc_, pcond, torch.tensor([0.6, 1.0], device=dev))
exp["probe"] = {"e": pe_.cpu().tolist(), "c": pc_.cpu().tolist(), "cond": pcond.cpu().tolist(), "r": [0.6, 1.0], "le": le[:, 2, :6].cpu().tolist(), "lc": lc[:, 1, :6].cpu().tolist()}
json.dump(exp, open(out_path, "w"), separators=(",", ":"))
json.dump(rep, open(rep_path, "w"))
print("wrote", out_path, os.path.getsize(out_path) // 1024, "KB")
