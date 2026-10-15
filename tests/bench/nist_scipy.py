"""The same NIST StRD problems with scipy.optimize.curve_fit (MINPACK Levenberg–Marquardt,
default tolerances), for comparison with tests/bench/nist.js.
Usage: python tests/bench/nist_scipy.py [out.json]"""
import json, math, os, re, sys, time, warnings

import numpy as np
from scipy.optimize import curve_fit

warnings.simplefilter('ignore')
probs = json.load(open(os.path.join(os.path.dirname(__file__), 'nist.json')))


def lre(est, cert):
    if not np.isfinite(est):
        return 0.0
    if est == cert:
        return 11.0
    return max(0.0, min(11.0, -math.log10(abs(est - cert) / abs(cert))))


out = []
for P in probs:
    names = sorted(P['cert'], key=lambda b: int(b[1:]))
    expr = re.sub(r'\^', '**', P['eq'])
    expr = re.sub(r'\b(exp|cos|sin)\(', r'np.\1(', expr).replace('atan(', 'np.arctan(').replace('pi', 'np.pi')
    f = eval('lambda x, ' + ', '.join(names) + ': ' + expr, {'np': np})
    x, y = np.array(P['x']), np.array(P['y'])
    for s in ('start1', 'start2'):
        p0 = [P[s][b] for b in names]
        try:
            p, cov = curve_fit(f, x, y, p0=p0, maxfev=20000)
            se = np.sqrt(np.diag(cov))
            L = min(lre(p[i], P['cert'][b]) for i, b in enumerate(names))
            Lse = min(lre(se[i], P['sd'][b]) for i, b in enumerate(names))
        except Exception:
            L = Lse = 0.0
        reps = 20
        t = time.perf_counter()
        for _ in range(reps):
            try:
                curve_fit(f, x, y, p0=p0, maxfev=20000)
            except Exception:
                pass
        ms = (time.perf_counter() - t) / reps * 1e3
        out.append({'name': P['name'], 'level': P['level'], 'start': s, 'lre': L, 'lreSE': Lse, 'ms': ms})
        print(f"{P['name']:9s} {s}  LRE params {L:4.1f}  SE {Lse:4.1f}  {ms:7.2f} ms")
ok = sum(o['lre'] >= 4 for o in out)
print(f"\n{ok}/{len(out)} fits with at least 4 correct significant digits in every parameter; median {sorted(o['ms'] for o in out)[len(out) // 2]:.2f} ms per fit")
if len(sys.argv) > 1:
    json.dump(out, open(sys.argv[1], 'w'))
