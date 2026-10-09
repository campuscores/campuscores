import { defineConfig, devices } from '@playwright/test';

// Installed Chrome is a Chromium build; Firefox and WebKit always use Playwright's own builds.
const channel = process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {};
const desktop = { testIgnore: /mobile\.spec\.js/ };
const phone = { testMatch: /mobile\.spec\.js/ };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  timeout: 45000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', ...desktop, use: { ...devices['Desktop Chrome'], launchOptions: channel } },
    { name: 'firefox', ...desktop, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', ...desktop, use: { ...devices['Desktop Safari'] } },
    { name: 'pixel', ...phone, use: { ...devices['Pixel 7'], launchOptions: channel } },
    { name: 'iphone', ...phone, use: { ...devices['iPhone 15'] } },
    { name: 'ipad', ...phone, use: { ...devices['iPad (gen 11)'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
