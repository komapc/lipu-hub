// geo.lipu.dev — tells a page whether to show a cookie-consent banner.
// Returns only {"consentRequired": true|false}. No cookies, no logging of the
// visitor's IP beyond what Cloudflare does for any request.
// Fails closed: unknown country (missing, XX, T1/Tor) => consent required.

// Countries/territories where analytics cookies need opt-in consent:
// EU 27, rest of the EEA, EU outermost regions and Åland that have their own
// ISO 3166-1 codes, the UK with Gibraltar and the Crown dependencies, Switzerland.
const CONSENT_REQUIRED = new Set([
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // rest of the EEA
  'IS', 'LI', 'NO',
  // EU territories with their own codes
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  // UK, Gibraltar, Crown dependencies
  'GB', 'GI', 'JE', 'GG', 'IM',
  // Switzerland
  'CH',
]);

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'x-content-type-options': 'nosniff',
};

export function consentRequired(country) {
  if (!country || !/^[A-Z]{2}$/.test(country) || country === 'XX' || country === 'T1') return true;
  return CONSENT_REQUIRED.has(country);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: HEADERS });
    const country = request.cf && request.cf.country;
    return new Response(JSON.stringify({ consentRequired: consentRequired(country) }), { headers: HEADERS });
  },
};
