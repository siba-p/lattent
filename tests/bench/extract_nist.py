"""Convert NIST StRD nonlinear-regression .dat files into tests/bench/nist.json.
Usage: python tests/bench/extract_nist.py DIR_WITH_DAT_FILES
Source (public domain): https://www.itl.nist.gov/div898/strd/nls/nls_main.shtml"""
import json, os, re, sys

# Models in Lattent's equation syntax (^ is power); Nelson is omitted because it has two predictors.
MODELS = {
    'Misra1a': ('lower', 'b1*(1-exp(-b2*x))'),
    'Chwirut2': ('lower', 'exp(-b1*x)/(b2+b3*x)'),
    'Chwirut1': ('lower', 'exp(-b1*x)/(b2+b3*x)'),
    'Lanczos3': ('lower', 'b1*exp(-b2*x) + b3*exp(-b4*x) + b5*exp(-b6*x)'),
    'Gauss1': ('lower', 'b1*exp(-b2*x) + b3*exp(-(x-b4)^2/b5^2) + b6*exp(-(x-b7)^2/b8^2)'),
    'Gauss2': ('lower', 'b1*exp(-b2*x) + b3*exp(-(x-b4)^2/b5^2) + b6*exp(-(x-b7)^2/b8^2)'),
    'DanWood': ('lower', 'b1*x^b2'),
    'Misra1b': ('lower', 'b1*(1-(1+b2*x/2)^(-2))'),
    'Kirby2': ('average', '(b1 + b2*x + b3*x^2)/(1 + b4*x + b5*x^2)'),
    'Hahn1': ('average', '(b1 + b2*x + b3*x^2 + b4*x^3)/(1 + b5*x + b6*x^2 + b7*x^3)'),
    'MGH17': ('average', 'b1 + b2*exp(-x*b4) + b3*exp(-x*b5)'),
    'Lanczos1': ('average', 'b1*exp(-b2*x) + b3*exp(-b4*x) + b5*exp(-b6*x)'),
    'Lanczos2': ('average', 'b1*exp(-b2*x) + b3*exp(-b4*x) + b5*exp(-b6*x)'),
    'Gauss3': ('average', 'b1*exp(-b2*x) + b3*exp(-(x-b4)^2/b5^2) + b6*exp(-(x-b7)^2/b8^2)'),
    'Misra1c': ('average', 'b1*(1-(1+2*b2*x)^(-0.5))'),
    'Misra1d': ('average', 'b1*b2*x*((1+b2*x)^(-1))'),
    'Roszman1': ('average', 'b1 - b2*x - atan(b3/(x-b4))/pi'),
    'ENSO': ('average', 'b1 + b2*cos(2*pi*x/12) + b3*sin(2*pi*x/12) + b5*cos(2*pi*x/b4) + b6*sin(2*pi*x/b4) + b8*cos(2*pi*x/b7) + b9*sin(2*pi*x/b7)'),
    'MGH09': ('higher', 'b1*(x^2+x*b2)/(x^2+x*b3+b4)'),
    'Thurber': ('higher', '(b1 + b2*x + b3*x^2 + b4*x^3)/(1 + b5*x + b6*x^2 + b7*x^3)'),
    'BoxBOD': ('higher', 'b1*(1-exp(-b2*x))'),
    'Rat42': ('higher', 'b1/(1+exp(b2-b3*x))'),
    'MGH10': ('higher', 'b1*exp(b2/(x+b3))'),
    'Eckerle4': ('higher', '(b1/b2)*exp(-0.5*((x-b3)/b2)^2)'),
    'Rat43': ('higher', 'b1/((1+exp(b2-b3*x))^(1/b4))'),
    'Bennett5': ('higher', 'b1*(b2+x)^(-1/b3)'),
}
NUM = r'[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?'
out = []
for name, (level, eq) in MODELS.items():
    txt = open(os.path.join(sys.argv[1], name + '.dat'), encoding='ascii', errors='replace').read().splitlines()
    start1, start2, cert, sd = {}, {}, {}, {}
    for ln in txt:
        m = re.match(r'\s*(b\d+)\s*=\s*(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s+(' + NUM + r')\s*$', ln)
        if m:
            b = m.group(1); start1[b], start2[b], cert[b], sd[b] = (float(m.group(i)) for i in range(2, 6))
    rss = float(re.search(r'Residual Sum of Squares:\s*(' + NUM + ')', '\n'.join(txt)).group(1))
    i0 = next(i for i, ln in enumerate(txt) if re.match(r'\s*Data:\s*y\s+x\s*$', ln))
    rows = [list(map(float, ln.split())) for ln in txt[i0 + 1:] if re.match(r'\s*' + NUM + r'\s+' + NUM + r'\s*$', ln)]
    out.append({'name': name, 'level': level, 'eq': eq, 'start1': start1, 'start2': start2, 'cert': cert, 'sd': sd, 'rss': rss,
                'y': [r[0] for r in rows], 'x': [r[1] for r in rows]})
    print(f'{name:10s} {level:8s} n={len(rows):4d} params={len(cert)}')
json.dump(out, open(os.path.join(os.path.dirname(__file__), 'nist.json'), 'w'), separators=(',', ':'))
