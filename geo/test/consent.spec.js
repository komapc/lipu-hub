// Browser tests for client/consent.js, the GA consent banner every lipu.dev site loads.
// The network is faked: a test page at https://site.test/, geo.lipu.dev answering whatever
// the test says, and googletagmanager.com recorded but never contacted. Run: npx playwright test
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CONSENT_JS = readFileSync(new URL('../client/consent.js', import.meta.url), 'utf8');
const SITE = 'https://site.test/';
const GA_ID = 'G-TEST123';
const CORS = { 'access-control-allow-origin': '*' };

function html({ lang = 'en', attrs = `data-ga="${GA_ID}"` } = {}) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<script defer src="https://geo.lipu.dev/consent.js" ${attrs}></script></head>
<body><h1>Test page</h1><a href="#" data-lipu-consent-open>Analytics settings</a></body></html>`;
}

/**
 * Fakes the network for one page. `geo` is what https://geo.lipu.dev/ answers: an object
 * (sent as JSON), or a function (route) => Promise for anything else. Returns counters
 * of geo checks and GA script loads.
 */
async function setup(page, { geo, page: pageOpts } = {}) {
  const calls = { geo: 0, ga: [] };
  // Registered first, so it runs last: anything not faked below is blocked.
  await page.route('**/*', (route) => route.abort());
  await page.route((u) => u.origin === 'https://site.test', (route) =>
    route.fulfill({ contentType: 'text/html', body: html(pageOpts) }));
  await page.route('https://geo.lipu.dev/consent.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: CONSENT_JS }));
  await page.route('https://geo.lipu.dev/', async (route) => {
    calls.geo++;
    if (typeof geo === 'function') return geo(route);
    return route.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(geo) });
  });
  await page.route('https://www.googletagmanager.com/**', (route) => {
    calls.ga.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
  return calls;
}

const ask = (page) => page.getByRole('dialog', { name: 'Cookie consent' });
const notice = (page) => page.getByRole('status', { name: 'Cookie consent' });
const stored = (page, key = 'lipu-consent') => page.evaluate((k) => localStorage.getItem(k), key);
const gaDisabled = (page) => page.evaluate((id) => window['ga-disable-' + id], GA_ID);

test.describe('opt-in region (geo says consentRequired: true)', () => {
  test('asks first and loads nothing until Allow', async ({ page }) => {
    const calls = await setup(page, { geo: { consentRequired: true } });
    await page.goto(SITE);
    await expect(ask(page)).toBeVisible();
    await expect(ask(page).getByRole('button', { name: 'Decline' })).toBeVisible();
    expect(calls.ga).toHaveLength(0);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');

    await ask(page).getByRole('button', { name: 'Allow' }).click();
    await expect(ask(page)).toBeHidden();
    await expect.poll(() => calls.ga.length).toBe(1);
    expect(calls.ga[0]).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(await stored(page)).toBe('yes');

    // The stored choice is used without asking geo again.
    await page.reload();
    await expect.poll(() => calls.ga.length).toBe(2);
    await expect(ask(page)).toBeHidden();
    expect(calls.geo).toBe(1);
  });

  test('Decline stores "no" and GA never loads, on later visits too', async ({ page }) => {
    const calls = await setup(page, { geo: { consentRequired: true } });
    await page.goto(SITE);
    await ask(page).getByRole('button', { name: 'Decline' }).click();
    await expect(ask(page)).toBeHidden();
    expect(await stored(page)).toBe('no');

    await page.reload();
    await page.waitForLoadState('load');
    await expect(ask(page)).toBeHidden();
    expect(calls.geo).toBe(1);
    expect(calls.ga).toHaveLength(0);
  });

  test('the settings link reopens the choice', async ({ page }) => {
    const calls = await setup(page, { geo: { consentRequired: true } });
    await page.goto(SITE);
    await ask(page).getByRole('button', { name: 'Decline' }).click();
    await page.getByRole('link', { name: 'Analytics settings' }).click();
    await ask(page).getByRole('button', { name: 'Allow' }).click();
    await expect.poll(() => calls.ga.length).toBe(1);
    expect(await stored(page)).toBe('yes');
  });
});

test.describe('no opt-in needed (geo says consentRequired: false)', () => {
  test('loads GA at once and shows a one-time notice; the grant itself is not stored', async ({ page }) => {
    const calls = await setup(page, { geo: { consentRequired: false } });
    await page.goto(SITE);
    await expect(notice(page)).toBeVisible();
    await expect.poll(() => calls.ga.length).toBe(1);
    expect(await stored(page)).toBeNull();

    await notice(page).getByRole('button', { name: 'OK' }).click();
    await expect(notice(page)).toBeHidden();
    expect(await stored(page, 'lipu-consent-notice')).toBe('1');

    // Next visit: geo is asked again (the grant is not stored), GA loads, no notice.
    await page.reload();
    await expect.poll(() => calls.ga.length).toBe(2);
    expect(calls.geo).toBe(2);
    await expect(notice(page)).toBeHidden();
  });

  test('Opt out stops GA and deletes only the _ga cookies', async ({ page }) => {
    await setup(page, { geo: { consentRequired: false } });
    await page.goto(SITE);
    await expect(notice(page)).toBeVisible();
    await page.evaluate(() => {
      document.cookie = '_ga=GA1.1.1; path=/';
      document.cookie = '_ga_TEST123=GS1.1.1; path=/';
      document.cookie = 'keep=1; path=/';
    });
    await notice(page).getByRole('button', { name: 'Opt out' }).click();
    expect(await gaDisabled(page)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).toBe('keep=1');
    expect(await stored(page)).toBe('no');
  });

  test('q and t query parameters are not sent to GA', async ({ page }) => {
    await setup(page, { geo: { consentRequired: false } });
    await page.goto(SITE + 'search?q=secret&page=2&t=typed', { referer: 'https://site.test/prev?q=earlier' });
    await expect(notice(page)).toBeVisible();
    const config = await page.evaluate(() =>
      Array.from(window.dataLayer).map((a) => Array.from(a)).find((a) => a[0] === 'config'));
    expect(config[1]).toBe(GA_ID);
    expect(config[2].page_location).toBe(SITE + 'search?page=2');
    expect(config[2].page_referrer).toBe(SITE + 'prev');
  });
});

// Only a literal {"consentRequired": false} that arrives in time skips the question.
const FAIL_CLOSED = {
  'geo returns HTTP 500': (route) => route.fulfill({ status: 500, headers: CORS, body: '' }),
  'geo returns something that is not JSON': (route) => route.fulfill({ headers: CORS, body: 'false' }),
  'consentRequired is the string "false"': (route) =>
    route.fulfill({ contentType: 'application/json', headers: CORS, body: '{"consentRequired":"false"}' }),
  'consentRequired is missing': (route) =>
    route.fulfill({ contentType: 'application/json', headers: CORS, body: '{}' }),
  // Also stands for a CORS failure, which page.route cannot fake: fetch rejects either way.
  'geo is unreachable': (route) => route.abort(),
};
test.describe('fails closed: asks first when', () => {
  for (const [name, geo] of Object.entries(FAIL_CLOSED)) {
    test(name, async ({ page }) => {
      const calls = await setup(page, { geo });
      await page.goto(SITE);
      await expect(ask(page)).toBeVisible();
      expect(calls.ga).toHaveLength(0);
    });
  }

  test('"false" arrives after the 1.5 s timeout', async ({ page }) => {
    let answered;
    const late = new Promise((r) => { answered = r; });
    const calls = await setup(page, {
      geo: async (route) => {
        await new Promise((r) => setTimeout(r, 2500));
        await route.fulfill({ contentType: 'application/json', headers: CORS, body: '{"consentRequired":false}' })
          .catch(() => {}); // the page has aborted the request by now
        answered();
      },
    });
    await page.goto(SITE);
    await expect(ask(page)).toBeVisible();
    await late;
    await page.waitForTimeout(200);
    expect(calls.ga).toHaveLength(0);
    await expect(notice(page)).toBeHidden();
  });
});

test.describe('page options', () => {
  test('texts follow <html lang>', async ({ page }) => {
    await setup(page, { geo: { consentRequired: true }, page: { lang: 'ru' } });
    await page.goto(SITE);
    await expect(ask(page).getByRole('button', { name: 'Разрешить' })).toBeVisible();
  });

  test('data-msg replaces the text and data-privacy adds a Details link', async ({ page }) => {
    const attrs = `data-ga="${GA_ID}" data-msg="Custom text." data-privacy="/privacy"`;
    await setup(page, { geo: { consentRequired: true }, page: { attrs } });
    await page.goto(SITE);
    await expect(ask(page)).toContainText('Custom text.');
    await expect(ask(page).getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/privacy');
  });

  test('without data-ga the script does nothing', async ({ page }) => {
    const calls = await setup(page, { geo: { consentRequired: true }, page: { attrs: '' } });
    await page.goto(SITE);
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => typeof window.lipuConsent)).toBe('undefined');
    expect(calls.geo).toBe(0);
    await expect(ask(page)).toBeHidden();
  });
});
