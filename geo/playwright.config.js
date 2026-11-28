// Browser tests for client/consent.js. No web server: each test serves a fake page and
// fakes geo.lipu.dev and googletagmanager.com with page.route (see test/consent.spec.js).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  testMatch: '*.spec.js',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
