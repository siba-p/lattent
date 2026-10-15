"""Reduce a Matbench dataset (structures + target) to compositions for featurisation.
Partially occupied (disordered) structures are skipped.
Usage: python tests/gen/extract_matbench.py matbench_mp_e_form.json.gz eform.json   (needs ijson)
Datasets: https://matbench.materialsproject.org (matbench_mp_e_form, matbench_mp_gap; CC BY 4.0)."""
import gzip
import json
import math
import sys
from functools import reduce

import ijson


def run(fn, out):
    rows = []
    with gzip.open(fn, "rb") as f:
        for item in ijson.items(f, "data.item", use_float=True):
            st, val = item[0], item[1]
            counts = {}
            for site in st["sites"]:
                for sp in site["species"]:
                    el = sp["element"]
                    counts[el] = counts.get(el, 0) + sp.get("occu", 1)
            ints = {k: int(round(v)) for k, v in counts.items()}
            if any(abs(counts[k] - ints[k]) > 1e-3 for k in counts) or not all(ints.values()):
                continue
            g = reduce(math.gcd, ints.values())
            rows.append([{k: v // g for k, v in ints.items()}, float(val), len(st["sites"]), st.get("lattice", {}).get("volume")])
    json.dump(rows, open(out, "w"))
    print(fn, len(rows))


run(sys.argv[1], sys.argv[2])
