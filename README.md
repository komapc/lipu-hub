# lipu-hub

Hub site for https://lipu.dev — links to the projects hosted on its subdomains.

- `docs/` — the static site (index.html, robots.txt, CNAME), served by GitHub Pages from `main` / `docs`
- Deploy = `git push` (GitHub Pages builds automatically)
- DNS: `lipu.dev` A/AAAA → GitHub Pages IPs, `www` CNAME → `komapc.github.io` (zone managed in Cloudflare, DNS only)

## License

Code and site content: MIT ([`LICENSE`](LICENSE)).

## geo.lipu.dev

`geo/` is a separate Worker (`lipu-geo`) that tells lipu.dev sites and daatan.com whether a visitor needs a cookie-consent banner. `GET https://geo.lipu.dev/` returns `{"consentRequired": true|false}` from Cloudflare's country lookup: true for the EU/EEA (with territories that have their own country codes), the UK with Gibraltar and the Crown dependencies, Switzerland, and for any unknown country. No cookies, `Cache-Control: no-store`. Deploy with `cd geo && npx wrangler deploy`.

`GET https://geo.lipu.dev/consent.js` serves the shared consent script (`geo/client/consent.js`, cached for an hour). Every site with Google Analytics includes it instead of keeping its own copy:

```html
<script defer src="https://geo.lipu.dev/consent.js" data-ga="G-XXXXXXX" data-accent="#4f46e5"></script>
<a href="#" data-lipu-consent-open>Analytics settings</a>
```

In opt-in regions (and when the check fails) it shows Allow/Decline and loads nothing until Allow. Elsewhere it loads GA at once and shows a one-time notice with Opt out. The choice lives in the site's own `localStorage["lipu-consent"]`. `data-msg` replaces the banner text; built-in texts cover en, eo, io, ru and he (picked by `<html lang>`).
