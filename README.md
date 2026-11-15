# lipu-hub

Hub site for https://lipu.dev — links to the projects hosted on its subdomains.

- `docs/` — the static site (index.html, robots.txt, CNAME), served by GitHub Pages from `main` / `docs`
- Deploy = `git push` (GitHub Pages builds automatically)
- DNS: `lipu.dev` A/AAAA → GitHub Pages IPs, `www` CNAME → `komapc.github.io` (zone managed in Cloudflare, DNS only)

## License

Code and site content: MIT ([`LICENSE`](LICENSE)).

## geo.lipu.dev

`geo/` is a separate Worker (`lipu-geo`) that tells lipu.dev sites and daatan.com whether a visitor needs a cookie-consent banner. `GET https://geo.lipu.dev/` returns `{"consentRequired": true|false}` from Cloudflare's country lookup: true for the EU/EEA (with territories that have their own country codes), the UK with Gibraltar and the Crown dependencies, Switzerland, and for any unknown country. No cookies, `Cache-Control: no-store`. Deploy with `cd geo && npx wrangler deploy`.
