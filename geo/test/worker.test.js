// Unit tests for worker.js: who needs a consent banner, and what geo.lipu.dev answers.
// Run: node --test test/worker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// worker.js imports client/consent.js as a string (wrangler.jsonc rules: Text); do the same here.
registerHooks({
  load(url, context, nextLoad) {
    if (/\/client\/[^/]+\.js$/.test(url)) {
      const text = readFileSync(new URL(url), 'utf8');
      return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const { default: worker, consentRequired } = await import('../worker.js');
const CONSENT_JS = readFileSync(new URL('../client/consent.js', import.meta.url), 'utf8');

// Written out here on purpose, not imported: a typo in the worker's list must fail a test.
const EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const OTHER_OPT_IN = ['IS', 'LI', 'NO', 'GB', 'CH', 'GI', 'JE', 'GG', 'IM', 'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF'];
const NO_OPT_IN = ['US', 'CA', 'IL', 'RU', 'UA', 'BR', 'JP', 'IN', 'AU'];

test('EU 27 need consent', () => {
  for (const c of EU27) assert.equal(consentRequired(c), true, c);
});

test('rest of the EEA, UK and its dependencies, Switzerland, EU territories need consent', () => {
  for (const c of OTHER_OPT_IN) assert.equal(consentRequired(c), true, c);
});

test('elsewhere no consent is needed', () => {
  for (const c of NO_OPT_IN) assert.equal(consentRequired(c), false, c);
});

test('fails closed: an unknown or malformed country needs consent', () => {
  for (const c of [undefined, null, '', 'XX', 'T1', 'us', 'USA', 'U', '12']) {
    assert.equal(consentRequired(c), true, String(c));
  }
});

function request(path, { method = 'GET', country } = {}) {
  const r = new Request('https://geo.lipu.dev' + path, { method });
  return country === undefined ? r : Object.assign(r, { cf: { country } });
}

test('GET / answers {consentRequired} from cf.country, uncached and open to any origin', async () => {
  for (const [country, expected] of [['DE', true], ['US', false]]) {
    const res = await worker.fetch(request('/', { country }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { consentRequired: expected }, country);
    assert.equal(res.headers.get('content-type'), 'application/json');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  }
});

test('GET / without cf data says consent is required', async () => {
  const res = await worker.fetch(request('/'));
  assert.deepEqual(await res.json(), { consentRequired: true });
});

test('OPTIONS is a 204 preflight; other methods are 405', async () => {
  const pre = await worker.fetch(request('/', { method: 'OPTIONS' }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  for (const method of ['POST', 'PUT', 'DELETE']) {
    assert.equal((await worker.fetch(request('/', { method }))).status, 405, method);
  }
});

test('GET and HEAD /consent.js serve client/consent.js as JavaScript, cached for an hour', async () => {
  const res = await worker.fetch(request('/consent.js'));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), CONSENT_JS);
  assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal((await worker.fetch(request('/consent.js', { method: 'HEAD' }))).status, 200);
});
