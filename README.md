# lipu-hub

Hub site for https://lipu.dev — links to the projects hosted on its subdomains.

- `docs/` — the static site (index.html, robots.txt, CNAME), served by GitHub Pages from `main` / `docs`
- Deploy = `git push` (GitHub Pages builds automatically)
- DNS: `lipu.dev` A/AAAA → GitHub Pages IPs, `www` CNAME → `komapc.github.io` (zone managed in Cloudflare, DNS only)
