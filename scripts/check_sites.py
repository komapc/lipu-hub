#!/usr/bin/env python3
"""Smoke/SEO check of every lipu.dev site. Stdlib only.

Sites: every https://*lipu.dev/ link on the hub page (docs/index.html), plus EXTRA_SITES.
For each site's page it fails (exit 1) on: non-200 page, missing/long <title>, missing meta
description, canonical that does not match the URL, an og:image that is not an image, an
hreflang alternate that is not 200, robots.txt without a Sitemap line, a broken sitemap, and
a sampled sitemap URL that is not 200, is on another host or has another canonical.
Also: old hosts must 301 to the new one with the same path, and geo.lipu.dev (the consent
region check and the shared consent.js) must answer.
403/429 from a bot-protected host is reported as a warning, not a failure; a network error
is retried once.
"""
import concurrent.futures
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

HUB_PAGE = pathlib.Path(__file__).resolve().parent.parent / "docs" / "index.html"
# Live sites that the hub page does not link to.
EXTRA_SITES = ["https://guitar-elo.lipu.dev/"]
# Old hosts that must 301 to the new host, keeping the path. Checked with "/" and OLD_HOST_PATH,
# a path that is not a static file: Pages serves those (robots.txt, sitemap.xml) before the redirect.
OLD_HOSTS = {
    "https://www.lipu.dev": "https://lipu.dev",
    "https://ido-tradukilo.pages.dev": "https://tradukilo.lipu.dev",
    "https://ido-epo-translator.komapc.workers.dev": "https://tradukilo.lipu.dev",
    "https://ido-vortaro.pages.dev": "https://vortaro.lipu.dev",
}
OLD_HOST_PATH = "/old-host-check"
SAMPLE = 6  # sitemap URLs checked per site
UA = "Mozilla/5.0 (compatible; lipu-sites-check)"
MAX_TITLE = 61


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_no_redirect = urllib.request.build_opener(_NoRedirect)


def fetch(url, follow=True):
    """Returns (status, headers, body). Status 0 is a network error, body then holds the error."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(2):
        try:
            opener = urllib.request.urlopen if follow else _no_redirect.open
            with opener(req, timeout=30) as r:
                return r.status, r.headers, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.headers, ""
        except Exception as e:  # network error, DNS, timeout
            if attempt:
                return 0, {}, str(e)
            time.sleep(5)


def get(url):
    status, _, body = fetch(url)
    return status, body


def first(pattern, text):
    m = re.search(pattern, text, re.I | re.S)
    return html.unescape(m.group(1)).strip() if m else None


def meta(text, attr, name):
    """content of <meta {attr}="{name}">, in either attribute order."""
    return first(rf'<meta[^>]+{attr}=["\']{name}["\'][^>]+content=["\']([^"\']+)', text) or \
        first(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+{attr}=["\']{name}["\']', text)


def canonical(text):
    return first(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', text)


def hreflang_urls(text):
    urls = set()
    for tag in re.findall(r"<link\b[^>]*>", text, re.I):
        if re.search(r'rel=["\']alternate["\']', tag, re.I) and re.search(r"hreflang=", tag, re.I):
            href = first(r'href=["\']([^"\']+)', tag)
            if href:
                urls.add(href)
    return sorted(urls)


def spread(items, n):
    """n items evenly spread over the list, always with the first and the last."""
    if len(items) <= n:
        return list(items)
    return [items[round(i * (len(items) - 1) / (n - 1))] for i in range(n)]


def locs(xml):
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)


def hub_sites():
    links = re.findall(r'href="(https://(?:[a-z0-9-]+\.)*lipu\.dev/[^"#?]*)"', HUB_PAGE.read_text("utf-8"))
    return list(dict.fromkeys(links + EXTRA_SITES))


def check_site(url):
    """Returns (ok line or None, warnings, failures) for one site."""
    warnings, failures = [], []

    def status_ok(u, status, what):
        if status in (403, 429):
            warnings.append(f"{u}: HTTP {status} (bot protection?)")
            return False
        if status != 200:
            failures.append(f"{u}: {what} HTTP {status}")
            return False
        return True

    host = re.match(r"https://[^/]+", url).group(0)
    status, page = get(url)
    if not status_ok(url, status, "page"):
        return None, warnings, failures
    title = first(r"<title[^>]*>(.*?)</title>", page)
    if not title:
        failures.append(f"{url}: no <title>")
    elif len(title) > MAX_TITLE:
        failures.append(f"{url}: title is {len(title)} chars (> {MAX_TITLE}): {title}")
    if not meta(page, "name", "description"):
        failures.append(f"{url}: no meta description")
    canon = canonical(page)
    if canon != url:
        failures.append(f"{url}: canonical is {canon!r}")

    og = meta(page, "property", "og:image")
    if og:
        s, headers, _ = fetch(og)
        if status_ok(og, s, "og:image") and not headers.get("content-type", "").startswith("image/"):
            failures.append(f"{og}: og:image is {headers.get('content-type')!r}, not an image")

    alternates = [u for u in hreflang_urls(page) if u != url]
    for alt in alternates:
        status_ok(alt, get(alt)[0], "hreflang alternate")

    rs, robots = get(host + "/robots.txt")
    sitemaps = re.findall(r"(?im)^sitemap:\s*(\S+)", robots) if rs == 200 else []
    if not sitemaps:
        failures.append(f"{host}: robots.txt ({rs}) has no Sitemap line")
        return None, warnings, failures
    ss, sm = get(sitemaps[0])
    if ss != 200 or "<loc>" not in sm:
        failures.append(f"{sitemaps[0]}: sitemap HTTP {ss} / no <loc>")
        return None, warnings, failures
    pages = locs(sm)
    if "<sitemapindex" in sm:  # a sitemap of sitemaps: sample a few of them
        pages = []
        for child in spread(locs(sm), 3):
            cs, cx = get(child)
            if cs != 200 or "<loc>" not in cx:
                failures.append(f"{child}: sitemap HTTP {cs} / no <loc>")
            pages += locs(cx)
    sample = spread(pages, SAMPLE)
    for u in sample:
        if not u.startswith(host + "/"):
            failures.append(f"{sitemaps[0]}: lists {u}, which is not on {host}")
            continue
        s, p = get(u)
        if status_ok(u, s, "sitemap URL") and canonical(p) not in (None, u):
            failures.append(f"{u}: in the sitemap, but its canonical is {canonical(p)!r}")

    ok = (f"ok  {url}  title={len(title or '')}ch  og:image={'yes' if og else 'no'}  "
          f"hreflang={len(alternates)}  sitemap={len(sample)}/{len(pages)} sampled")
    return ok, warnings, failures


def check_old_hosts():
    failures = []
    for old, new in OLD_HOSTS.items():
        for path in ("/", OLD_HOST_PATH):
            status, headers, _ = fetch(old + path, follow=False)
            location = headers.get("location") if headers else None
            if status != 301 or location != new + path:
                failures.append(f"{old + path}: HTTP {status} -> {location!r}, expected 301 -> {new + path}")
    return failures


def check_geo():
    failures = []
    status, _, body = fetch("https://geo.lipu.dev/")
    try:
        if status != 200 or not isinstance(json.loads(body).get("consentRequired"), bool):
            failures.append(f"https://geo.lipu.dev/: HTTP {status}, {body[:80]!r}")
    except ValueError:
        failures.append(f"https://geo.lipu.dev/: not JSON: {body[:80]!r}")
    status, headers, body = fetch("https://geo.lipu.dev/consent.js")
    if status != 200 or "javascript" not in headers.get("content-type", "") or "lipu-consent" not in body:
        failures.append(f"https://geo.lipu.dev/consent.js: HTTP {status}, {headers.get('content-type') if headers else None!r}")
    return failures


def main():
    failures, warnings = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        site_results = pool.map(check_site, hub_sites())
        old_hosts = pool.submit(check_old_hosts)
        geo = pool.submit(check_geo)
        for ok, w, f in site_results:
            if ok:
                print(ok if not f else "BAD" + ok[2:])
            warnings += w
            failures += f
        failures += old_hosts.result() + geo.result()
    print(f"old hosts: {len(OLD_HOSTS)} checked; geo.lipu.dev checked")
    for w in warnings:
        print("WARN", w)
    for f in failures:
        print("FAIL", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
