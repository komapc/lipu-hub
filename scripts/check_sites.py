#!/usr/bin/env python3
"""Smoke/SEO check of every site linked from the hub. Stdlib only.

Fails (exit 1) on: non-200 page, missing/long <title>, missing meta description,
canonical that does not match the URL, robots.txt without a Sitemap line, broken sitemap.
403/429 from a bot-protected host is reported as a warning, not a failure.
"""
import html
import re
import sys
import urllib.error
import urllib.request

SITES = [
    "https://lipu.dev/", "https://vortaro.lipu.dev/", "https://tradukilo.lipu.dev/",
    "https://echodrift.lipu.dev/", "https://hanzi.lipu.dev/", "https://ideon.lipu.dev/en/",
    "https://minco.lipu.dev/", "https://yearwheel.lipu.dev/", "https://gova.lipu.dev/", "https://noamba.lipu.dev/",
]
UA = "Mozilla/5.0 (compatible; lipu-sites-check)"
MAX_TITLE = 60


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # network error, DNS, timeout
        return 0, str(e)


def first(pattern, text):
    m = re.search(pattern, text, re.I | re.S)
    return html.unescape(m.group(1)).strip() if m else None


failures, warnings = [], []
for url in SITES:
    host = re.match(r"https://[^/]+", url).group(0)
    status, page = get(url)
    if status in (403, 429):
        warnings.append(f"{url}: HTTP {status} (bot protection?)")
        continue
    if status != 200:
        failures.append(f"{url}: HTTP {status}")
        continue
    title = first(r"<title[^>]*>(.*?)</title>", page)
    if not title:
        failures.append(f"{url}: no <title>")
    elif len(title) > MAX_TITLE:
        failures.append(f"{url}: title is {len(title)} chars (> {MAX_TITLE}): {title}")
    if not first(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', page) and \
       not first(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description', page):
        failures.append(f"{url}: no meta description")
    canon = first(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', page)
    if canon != url:
        failures.append(f"{url}: canonical is {canon!r}")
    rs, robots = get(host + "/robots.txt")
    sitemaps = re.findall(r"(?im)^sitemap:\s*(\S+)", robots) if rs == 200 else []
    if not sitemaps:
        failures.append(f"{host}: robots.txt ({rs}) has no Sitemap line")
        continue
    ss, sm = get(sitemaps[0])
    if ss != 200 or "<loc>" not in sm:
        failures.append(f"{sitemaps[0]}: sitemap HTTP {ss} / no <loc>")
    print(f"ok  {url}  title={len(title or '')}ch  sitemap={sitemaps[0]}")

for w in warnings:
    print("WARN", w)
for f in failures:
    print("FAIL", f)
sys.exit(1 if failures else 0)
