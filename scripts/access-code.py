#!/usr/bin/env python3
"""Issue an access code that unlocks Pro (or Lab) for one email address, without a payment.

    python3 scripts/access-code.py someone@lab.edu                              # Pro, no end date
    python3 scripts/access-code.py someone@lab.edu --until 2027-06-30 --note "IITD pilot"
    python3 scripts/access-code.py someone@lab.edu --plan lab --write           # and add it to config.js

The code is printed once: send it to the person together with the email address it is bound
to. Only the SHA-256 hash of "email|code" goes into assets/js/config.js (the `access` list), so
nobody can read a code from the public site. To revoke a code, delete its entry and publish.
"""
import argparse, hashlib, json, pathlib, re, secrets, sys

ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # no 0/O or 1/I, so codes survive being read aloud
ROOT = pathlib.Path(__file__).resolve().parent.parent


def make_code():
    s = ''.join(secrets.choice(ALPHABET) for _ in range(12))
    return 'LAT-' + '-'.join(s[i:i + 4] for i in range(0, 12, 4))


def hash_of(email, code):
    """The same normalisation as Pro.hash in assets/js/shell.js."""
    norm = email.strip().lower() + '|' + re.sub(r'\s+', '', code.strip().upper())
    return hashlib.sha256(norm.encode('utf-8')).hexdigest()


def js_entry(e):
    q = lambda v: 'null' if v is None else "'" + str(v).replace('\\', '\\\\').replace("'", "\\'") + "'"
    return "{ h: %s, plan: %s, until: %s, note: %s }" % (q(e['h']), q(e['plan']), q(e['until']), q(e['note']))


def write_config(path, entry):
    src = path.read_text(encoding='utf-8')
    m = re.search(r'(\n[ \t]*)access: \[(.*?)\]', src, re.S)
    if not m:
        sys.exit('could not find the `access: [...]` list in ' + str(path))
    indent, inner = m.group(1).lstrip('\n'), m.group(2)
    lines = [l.strip().rstrip(',') for l in inner.strip().splitlines() if l.strip()]
    lines.append(js_entry(entry))
    body = ''.join('\n' + indent + '  ' + l + ',' for l in lines) + '\n' + indent
    src = src[:m.start(2)] + body + src[m.end(2):]
    path.write_text(src, encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description='Issue a Lattent access code.')
    ap.add_argument('email', help='the address the code is bound to')
    ap.add_argument('--plan', choices=['pro', 'lab'], default='pro')
    ap.add_argument('--until', help='last valid day, YYYY-MM-DD (default: no end date)')
    ap.add_argument('--note', default='', help='who or why, kept with the entry')
    ap.add_argument('--code', help='use this code instead of a random one (for tests)')
    ap.add_argument('--write', action='store_true', help='add the entry to config.js')
    ap.add_argument('--config', default=str(ROOT / 'assets' / 'js' / 'config.js'))
    a = ap.parse_args()
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', a.email.strip()):
        sys.exit('that does not look like an email address')
    if a.until and not re.match(r'^\d{4}-\d{2}-\d{2}$', a.until):
        sys.exit('--until must be YYYY-MM-DD')
    code = a.code or make_code()
    entry = {'h': hash_of(a.email, code), 'plan': a.plan, 'until': a.until or None, 'note': a.note}
    print('code:  ', code)
    print('email: ', a.email.strip().lower())
    print('entry: ', json.dumps(entry))
    if a.write:
        write_config(pathlib.Path(a.config), entry)
        print('added to', a.config, '- commit and publish it, then send the code to the person')
    else:
        print('(add --write to put the entry into config.js)')


if __name__ == '__main__':
    main()
