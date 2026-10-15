# lipu-hub

Hub site for https://lipu.dev — links to projects hosted on subdomains.

- `public/` — static files (index.html, robots.txt)
- `wrangler.jsonc` — Cloudflare Worker with static assets; custom domains `lipu.dev`, `www.lipu.dev`

Deploy: `npx wrangler deploy`
