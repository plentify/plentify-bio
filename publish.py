#!/usr/bin/env python3
import argparse, base64, datetime, getpass, json, pathlib, re, subprocess, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

HERE = pathlib.Path(__file__).resolve().parent

def keygen(key, site):
    if key.exists():
        sys.exit(f"{key} already exists. Move it first if you want a new key.")
    pw = getpass.getpass("Passphrase for private.pem (blank for none): ").encode()
    enc = serialization.BestAvailableEncryption(pw) if pw else serialization.NoEncryption()
    k = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    key.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, enc))
    (site / "public.pem").write_bytes(k.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    print(f"Wrote {key} (keep secret) and {site / 'public.pem'} (commit this).")

def load_key(key):
    if not key.exists():
        sys.exit(f"{key} not found. Use --key or run: python publish.py keygen")
    data = key.read_bytes()
    try:
        return serialization.load_pem_private_key(data, password=None)
    except TypeError:
        return serialization.load_pem_private_key(data, password=getpass.getpass("Key passphrase: ").encode())

def sign(key, text):
    return base64.b64encode(load_key(key).sign(text.encode(), padding.PKCS1v15(), hashes.SHA256())).decode()

def git_push(site, paths, msg):
    subprocess.run(["git", "add", *paths], cwd=site, check=True)
    subprocess.run(["git", "commit", "-m", msg], cwd=site, check=True)
    subprocess.run(["git", "push"], cwd=site, check=True)

def post(key, site, title, body_file, push):
    body = pathlib.Path(body_file).read_text(encoding="utf-8").strip()
    date = datetime.date.today().isoformat()
    sig = sign(key, f"{title}\n{date}\n{body}")
    slug = f"{date}-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    posts = site / "posts"
    posts.mkdir(exist_ok=True)
    (posts / f"{slug}.json").write_text(json.dumps(
        {"title": title, "date": date, "body": body, "sig": sig}, indent=2), encoding="utf-8")
    idx = posts / "index.json"
    slugs = json.loads(idx.read_text()) if idx.exists() else []
    if slug not in slugs:
        slugs.insert(0, slug)
    idx.write_text(json.dumps(slugs, indent=2))
    print(f"Published {slug}")
    if push:
        git_push(site, ["posts"], f"post: {title}")

def status(key, site, state, tz, push):
    f = site / "status.json"
    if tz is None:
        try:
            tz = json.loads(f.read_text()).get("tz", "")
        except (OSError, ValueError):
            tz = ""
    now = datetime.datetime.now().astimezone()
    off = int(now.utcoffset().total_seconds() // 60)
    at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    f.write_text(json.dumps({"state": state, "at": at, "tz": tz, "offset": off,
                             "sig": sign(key, f"{state}\n{at}\n{tz}\n{off}")}, indent=2), encoding="utf-8")
    print(f"Status: {state} ({tz or 'UTC offset ' + str(off) + ' min'})")
    if not tz:
        print("Tip: add --tz Your/Zone (e.g. America/Chicago) so daylight saving stays correct.")
    if push:
        git_push(site, ["status.json"], f"status: {state}")

ap = argparse.ArgumentParser()
ap.add_argument("--site", default=".", help="site folder (default: current directory)")
ap.add_argument("--key", default=str(HERE / "private.pem"), help="path to private.pem")
sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("keygen")
p = sub.add_parser("post"); p.add_argument("title"); p.add_argument("body_file"); p.add_argument("--push", action="store_true")
for names in (["online", "login"], ["offline", "logout"]):
    s = sub.add_parser(names[0], aliases=names[1:]); s.add_argument("--tz"); s.add_argument("--push", action="store_true")
a = ap.parse_args()
site, key = pathlib.Path(a.site).resolve(), pathlib.Path(a.key)
if a.cmd == "keygen": keygen(key, site)
elif a.cmd == "post": post(key, site, a.title, a.body_file, a.push)
else: status(key, site, "online" if a.cmd in ("online", "login") else "offline", a.tz, a.push)
