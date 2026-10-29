#!/usr/bin/env python3
"""Tell IndexNow engines (Bing, Yandex, ...) about new or changed pages on the hub sites. Stdlib only.

Reads each site's sitemap, compares it with the previous run's snapshot (STATE, kept in the
Actions cache) and submits only URLs that are new or whose <lastmod> changed. Without a
snapshot every URL counts as new, so the first run submits everything once.
Each site serves the same key at /<KEY>.txt; a site without it (not deployed yet) is skipped.
vortaro.lipu.dev is not listed: it runs its own IndexNow step with its own key.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

KEY = "483e472b63ec64808ac4046f1b87eeb1"
SITES = [
    "lipu.dev", "tradukilo.lipu.dev", "echodrift.lipu.dev", "hanzi.lipu.dev", "ideon.lipu.dev",
    "minco.lipu.dev", "yearwheel.lipu.dev", "gova.lipu.dev", "noamba.lipu.dev", "yaplikacija.lipu.dev",
]
STATE = os.environ.get("INDEXNOW_STATE", "indexnow-state.json")
UA = "Mozilla/5.0 (compatible; lipu-sites-check)"
BATCH = 10000  # IndexNow limit per request
DRY = "--dry" in sys.argv


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # network error, DNS, timeout
        return 0, str(e)


def sitemap_urls(url, depth=0):
    """{loc: lastmod} for a sitemap, following one level of sitemap index."""
    status, xml = get(url)
    if status != 200:
        raise RuntimeError(f"{url}: HTTP {status}")
    if "<sitemapindex" in xml and depth == 0:
        out = {}
        for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml):
            out.update(sitemap_urls(loc, 1))
        return out
    out = {}
    for block in re.findall(r"<url>(.*?)</url>", xml, re.S):
        loc = re.search(r"<loc>\s*([^<\s]+)\s*</loc>", block)
        mod = re.search(r"<lastmod>\s*([^<\s]+)\s*</lastmod>", block)
        if loc:
            out[loc.group(1)] = mod.group(1) if mod else ""
    return out


def submit(host, urls):
    for i in range(0, len(urls), BATCH):
        body = json.dumps({"host": host, "key": KEY, "keyLocation": f"https://{host}/{KEY}.txt",
                           "urlList": urls[i:i + BATCH]}).encode()
        req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status not in (200, 202):
                raise RuntimeError(f"IndexNow HTTP {r.status}")


state = json.load(open(STATE)) if os.path.exists(STATE) else {}
failed = False
for host in SITES:
    ks, body = get(f"https://{host}/{KEY}.txt")
    if ks != 200 or body.strip() != KEY:
        print(f"{host}: key file not served (HTTP {ks}), skipped")
        continue
    try:
        current = sitemap_urls(f"https://{host}/sitemap.xml")
    except RuntimeError as e:
        print(f"{host}: {e}")
        failed = True
        continue
    old = state.get(host, {})
    changed = sorted(u for u, mod in current.items()
                     if u.startswith(f"https://{host}/") and (u not in old or old[u] != mod))
    if not changed:
        print(f"{host}: no changes ({len(current)} URLs)")
    elif DRY:
        print(f"{host}: would submit {len(changed)} of {len(current)} URLs")
        continue
    else:
        try:
            submit(host, changed)
            print(f"{host}: submitted {len(changed)} of {len(current)} URLs")
        except Exception as e:  # keep the old snapshot so these URLs are retried next run
            print(f"{host}: IndexNow failed: {e}")
            failed = True
            continue
    state[host] = current

if not DRY:
    with open(STATE, "w") as f:
        json.dump(state, f, indent=1, sort_keys=True)
sys.exit(1 if failed else 0)
