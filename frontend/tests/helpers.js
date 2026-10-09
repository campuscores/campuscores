import { expect } from '@playwright/test';

/** Real touch swipe from near the right edge of `locator`. Chromium only: it uses CDP touch input. */
export async function swipe(page, locator, distance = 224) {
  const session = await page.context().newCDPSession(page);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const [x, y] = [box.x + box.width - 40, box.y + box.height / 2];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * distance / 8, y }] });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

// shortcut: patches the built bundle text; breaks if the bundler output form changes, upgrade to a render harness if component tests are added.
/** The production app bundle: `{ url, text }`. */
export async function bundle(page) {
  const html = await (await page.request.get('/')).text();
  const src = html.match(/src="(\/assets\/index-[\w-]+\.js)"/)?.[1];
  expect(src, 'app bundle script in index.html').toBeTruthy();
  return { url: src, text: await (await page.request.get(src)).text() };
}

/** Serve `text` instead of the real bundle for the rest of the page's life. */
export async function serveBundle(page, url, text) {
  await page.route(`**${url}`, route => route.fulfill({ body: text, contentType: 'text/javascript' }));
}

/** Replace the string literal `from` (backtick or double-quoted form) with `to`. */
export function replaceLiteral(text, from, to) {
  let count = 0;
  for (const quote of ['`', '"']) {
    const parts = text.split(`${quote}${from}${quote}`);
    count += parts.length - 1;
    text = parts.join(`${quote}${to}${quote}`);
  }
  return { text, count };
}
