import { defineConfig, devices } from '@playwright/test';

// Installed Chrome is a Chromium build; Firefox and WebKit always use Playwright's own builds.
const channel = process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {};
const desktop = { testIgnore: /mobile\.spec\.js/ };
// staff-layout.spec.js measures CSS layout through 11 widths per screen with setViewportSize: Chromium only, for run time.
const otherDesktop = { testIgnore: /(mobile|staff-layout)\.spec\.js/ };
// sign-in-choice, staff-shell and the manager and Super Admin screen specs also run on phones, the main staff device.
// public-tournaments also runs on phones, the main viewer device.
const phone = { testMatch: /(mobile|sign-in-choice|staff-shell|manage-setup|manage-matches|manage-assign|admin|public-tournaments)\.spec\.js/ };

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
    // Recording every first attempt slowed Windows Firefox until context.close timed out. CI retries once with a trace;
    // use --trace on locally when you need one.
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', ...desktop, use: { ...devices['Desktop Chrome'], launchOptions: channel } },
    { name: 'firefox', ...otherDesktop, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', ...otherDesktop, use: { ...devices['Desktop Safari'] } },
    { name: 'pixel', ...phone, use: { ...devices['Pixel 7'], launchOptions: channel } },
    { name: 'iphone', ...phone, use: { ...devices['iPhone 15'] } },
    { name: 'ipad', ...phone, use: { ...devices['iPad (gen 11)'] } },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4175',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
    },
    {
      // Live-mode build for live.spec.js and operator-console.spec.js. Tests mock every socket and API call, so the API host
      // never resolves. The fake Clerk key points at an unresolvable host; operator-console.spec.js injects a stub Clerk.
      command: 'npx vite build --outDir ../output/live-dist --emptyOutDir && npx vite preview --outDir ../output/live-dist --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      env: { VITE_API_BASE: 'http://api.test', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsub3BlcmF0b3IudGVzdCQ=' }, // clerk.operator.test
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
