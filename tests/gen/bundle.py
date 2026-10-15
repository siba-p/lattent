"""Bundle the exported generative models into one script for the browser.
Usage: python tests/gen/bundle.py <props.json> <mdiff.json> assets/models/gen-v1.js"""
import json
import sys

props, mdiff, out = sys.argv[1:4]
P, D = json.load(open(props)), json.load(open(mdiff))
with open(out, "w") as f:
    f.write("/* Lattent generative-materials models, trained on Materials Project data (via Matbench, CC BY 4.0) by tests/gen/. Do not edit. */\n")
    f.write("window.BF_GEN_MODELS = " + json.dumps({"props": P, "mdiff": D}, separators=(",", ":")) + ";\n")
print("wrote", out)
