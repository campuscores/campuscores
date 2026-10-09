import { test, expect, devices } from '@playwright/test';

async function settleScroll(rail) {
  await rail.evaluate(el => new Promise(resolve => {
    let timer;
    function finish() { el.removeEventListener('scroll', wait); resolve(); }
    function wait() { clearTimeout(timer); timer = setTimeout(finish, 150); }
    el.addEventListener('scroll', wait);
    wait();
  }));
}

test('approved layout, local assets and text fit from phones to large screens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager';
    return image.decode();
  })));
  const favicon = await page.request.get('/favicon.ico');
  expect(favicon.status()).toBe(200);
  expect([...(await favicon.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  await page.locator('.athlete-card, .match-card').evaluateAll(cards => Promise.all(cards.map(card => {
    const value = getComputedStyle(card).getPropertyValue(card.matches('.athlete-card') ? '--panel-background' : '--match-background');
    const image = new Image();
    image.src = value.match(/url\(['"]?([^'")]+)/)[1];
    return image.decode();
  })));
  await expect(page.locator('.player-core img')).toHaveCount(6);
  await expect(page.locator('.player-popout[aria-hidden="true"]')).toHaveCount(6);
  await expect(page.locator('h1')).toHaveText('Live Scores, Stats & More');
  await expect(page.locator('.matrix-toggle, .live-matches button, .live-matches a')).toHaveCount(0);

  for (const width of [320, 375, 390, 430, 556, 767, 768, 820, 1023, 1024, 1199, 1200, 1280, 1440, 1920, 2560, 3440, 3840]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector('.hero');
      const title = hero.querySelector('h1');
      const spans = [...title.children].map(span => span.getBoundingClientRect());
      const field = hero.querySelector('canvas').getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      const header = document.querySelector(innerWidth < 768 ? '.mobile-header' : '.desktop-banner');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        textOverflows: [...document.querySelectorAll('.sport-link span, .match-meta, .match-overview span, th, td, .tournament-details h3, .tournament-details p')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
        canvasConfined: ['left', 'right', 'top', 'bottom'].every(edge => Math.abs(field[edge] - heroBox[edge]) < 1),
        panelsFit: [...document.querySelectorAll('.athlete-card')].every(card => { const box = card.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.height > 40; }),
        lines: Math.abs(spans[0].top - spans[1].top) < 1 ? 1 : 2,
        alignment: getComputedStyle(title).textAlign,
        tournamentImageRatio: [...document.querySelectorAll('.tournament-surface img')].every(image => {
          const box = image.getBoundingClientRect();
          return Math.abs(box.width / box.height - 2) < .01;
        }),
        headerWidth: header.getBoundingClientRect().width,
        headerTargetsFit: [...header.querySelectorAll('.site-name, .nav-link, summary')].filter(el => el.getClientRects().length).every(el => {
          const box = el.getBoundingClientRect();
          return box.width >= 44 && box.height >= 44;
        }),
        rails: [...document.querySelectorAll('.match-scroll, .tournament-scroll')].map(rail => {
          rail.scrollLeft = 0;
          return rail.scrollWidth > rail.clientWidth && rail.firstElementChild.getBoundingClientRect().width < rail.clientWidth - 16;
        }),
      };
    });
    expect(geometry, `layout at ${width}px`).toMatchObject({ overflow: false, textOverflows: [], canvasConfined: true, panelsFit: true, tournamentImageRatio: true, lines: width >= 768 && width <= 1023 ? 1 : 2, headerWidth: width, headerTargetsFit: true, rails: [true, true] });
    if (width < 1024) expect(geometry.alignment).toBe('center');
    if ([390, 820, 1440, 3840].includes(width)) await page.screenshot({ path: test.info().outputPath(`homepage-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('sport filters change only live cards and support keyboard input', async ({ page }) => {
  await page.goto('/');
  const url = page.url();
  const rail = page.locator('.match-scroll');
  const history = await page.evaluate(() => window.history.length);
  await expect(page.locator('.sports-nav button')).toHaveCount(7);
  await expect(page.locator('.sports-nav a')).toHaveCount(0);
  await page.locator('.tournament-scroll').evaluate(el => { el.scrollLeft = 200; });
  const tournamentScroll = await page.locator('.tournament-scroll').evaluate(el => el.scrollLeft);
  for (const sport of ['football', 'basketball', 'lawn-tennis', 'table-tennis', 'badminton', 'volleyball', 'all']) {
    await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator(`.sports-nav button[data-sport="${sport}"]`).click();
    await expect(page.locator('.sports-nav button[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator(`.sports-nav button[data-sport="${sport}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.locator('.match-card')).toHaveCount(sport === 'all' ? 6 : 1);
    if (sport !== 'all') await expect(rail.locator('.match-card')).toHaveAttribute('data-sport', sport);
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBe(0);
    await expect(page.locator('#match-filter-status')).toContainText(sport === 'all' ? '6 live matches' : '1 live match');
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    await expect(page.locator('.tournament-card')).toHaveCount(5);
    expect(await page.locator('.tournament-scroll').evaluate(el => el.scrollLeft)).toBe(tournamentScroll);
  }
  await page.locator('[data-sport="table-tennis"].sport-link').focus();
  await page.keyboard.press('Space');
  await expect(rail.locator('.match-card')).toHaveAttribute('data-sport', 'table-tennis');
  await page.locator('[data-sport="all"].sport-link').focus();
  await page.keyboard.press('Enter');
  await expect(rail.locator('.match-card')).toHaveCount(6);
});

test('cold phone loads use smaller local portraits and textures at DPR 1, 2 and 3', async ({ browser }) => {
  for (const [width, deviceScaleFactor] of [[390, 1], [390, 2], [390, 3], [768, 1]]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor });
    try {
      const page = await context.newPage();
      const requested = [];
      page.on('request', request => requested.push(new URL(request.url()).pathname));
      await page.goto('http://127.0.0.1:4175/');
      const portraits = await page.locator('.athlete-card').evaluateAll(async cards => {
        await Promise.all(cards.flatMap(card => [...card.querySelectorAll('img')].map(image => image.decode())));
        return cards.map(card => {
          const [core, popout] = card.querySelectorAll('img');
          return { original: new URL(core.src).pathname, core: new URL(core.currentSrc).pathname, popout: new URL(popout.currentSrc).pathname };
        });
      });
      expect(portraits).toHaveLength(6);
      const textures = await page.locator('.athlete-card, .match-surface').evaluateAll(async surfaces => {
        const paths = surfaces.map(surface => getComputedStyle(surface, '::before').backgroundImage.match(/url\(['"]?([^'")]+)/)[1]);
        await Promise.all(paths.map(path => { const image = new Image(); image.src = path; return image.decode(); }));
        return paths.map(path => new URL(path).pathname);
      });
      expect(textures).toHaveLength(12);
      for (const portrait of portraits) {
        expect(portrait.popout).toBe(portrait.core);
        if (width < 768) {
          expect(portrait.core).toMatch(/^\/assets\/.+-(320|640)\.webp$/);
          if (deviceScaleFactor < 3) expect(portrait.core).toMatch(/-320\.webp$/);
          expect(requested).not.toContain(portrait.original);
        }
      }
      for (const texture of textures) expect(texture).toMatch(width < 768 ? /-background-640\.webp$/ : /-background\.webp$/);
      if (width < 768) expect(requested.filter(path => /-background\.webp$/.test(path))).toEqual([]);
    } finally { await context.close(); }
  }
});

test('both rails spotlight visible cards and scroll without arrow controls', async ({ page }) => {
  await page.goto('/');
  for (const width of [390, 820, 1440, 2560, 3840]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector);
      await rail.evaluate(el => { el.scrollLeft = 0; });
      await expect.poll(() => rail.evaluate(el => [...el.children].every(card => {
        const box = card.getBoundingClientRect(), root = el.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(box.right, root.right) - Math.max(box.left, root.left)) / box.width;
        return card.classList.contains('is-peek') === (ratio < .9);
      }))).toBe(true);
      const peek = rail.locator('.is-peek').first().locator('.match-surface, .tournament-surface');
      await expect(peek).toHaveCSS('opacity', '0.66');
      await rail.scrollIntoViewIfNeeded();
      await rail.hover();
      await page.mouse.wheel(380, 0);
      await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await settleScroll(rail);
      await rail.focus();
      await page.keyboard.press('ArrowRight');
      await settleScroll(rail);
      await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(rail.locator(':scope > :last-child')).not.toHaveClass(/is-peek/);
      await expect.poll(() => rail.evaluate(el => el.lastElementChild.getBoundingClientRect().right <= el.getBoundingClientRect().right - 52)).toBe(true);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.match-surface').first()).toHaveCSS('transform', 'none');
});

test('menu, reserved routes, refresh, back navigation and old links work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await expect(page.locator('.desktop-nav .sports-options a')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('.desktop-nav .sports-dropdown')).not.toHaveAttribute('open');
  const links = await page.locator('.desktop-nav .sports-options a, .tournament-card').evaluateAll(anchors => anchors.map(a => a.getAttribute('href')));
  for (const destination of links) {
    if (destination.startsWith('/sports/')) await page.locator('.desktop-nav .sports-dropdown summary').click();
    await page.locator(`a[href="${destination}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(destination.replace(/\/$/, '') + '/?$'));
    await expect(page.locator('#root')).toHaveText('');
    expect((await page.reload()).status()).toBe(200);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
  }
  await page.goto('/tournament.html?event=racquet-open');
  await expect(page).toHaveURL(/\/tournaments\/racquet-open$/);
  await page.goto('/index.html?preview=rectangular');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return home' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('.mobile-menu > summary');
  await expect(menu).toHaveText('');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.locator('.mobile-menu-panel summary').click();
  await expect(page.locator('.mobile-menu-panel .sports-options a:visible')).toHaveCount(6);
  await page.mouse.click(8, 130);
  await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open');
  await menu.click();
  await page.locator('.mobile-menu-panel a[href="/#tournaments"]').click();
  await expect(page).toHaveURL(/#tournaments$/);
  await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open');
  await expect(page.locator('#tournaments')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('repeat Home and Tournaments navigation scrolls and closes phone menus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    const navigation = page.locator(width < 768 ? '.mobile-menu-panel' : '.desktop-nav');
    const menu = page.locator('.mobile-menu');
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width < 768) await menu.locator(':scope > summary').click();
      await navigation.getByRole('link', { name: 'Tournaments', exact: true }).click();
      await expect(page).toHaveURL(/\/#tournaments$/);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      await expect(page.locator('#tournaments')).toBeInViewport();
      if (width < 768) await expect(menu).not.toHaveAttribute('open');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width < 768) await menu.locator(':scope > summary').click();
    const home = navigation.getByRole('link', { name: 'Home', exact: true });
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    if (width < 768) await menu.locator(':scope > summary').click();
    await home.focus();
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
    // Keyboard activation avoids Playwright scrolling an offscreen link into view first.
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveURL(/\/$/);
    if (width < 768) await expect(menu).not.toHaveAttribute('open');
  }
});

test('hero motion stops offscreen, with reduced motion, and on route unmount', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.pendingAnimationFrames = new Set();
    window.requestAnimationFrame = callback => {
      const id = request(time => { window.pendingAnimationFrames.delete(id); callback(time); });
      window.pendingAnimationFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { window.pendingAnimationFrames.delete(id); cancel(id); };
  });
  await page.goto('/');
  const canvas = page.locator('.hero-matrix');
  const pattern = () => canvas.evaluate(el => el.toDataURL());
  await expect.poll(() => canvas.evaluate(el => el.width)).toBeGreaterThan(0);
  const initial = await pattern();
  await expect.poll(pattern).not.toBe(initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await pattern();
  await page.waitForTimeout(160);
  expect(await pattern()).toBe(still);
  await expect(page.locator('.hero h1')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
  await page.locator('#tournaments').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/football/"]').click();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(0);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.pendingAnimationFrames.size)).toBe(1);
});

test('phone touch can swipe both card rows', async ({ browser }) => {
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4175/');
    const session = await context.newCDPSession(page);
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector);
      await rail.scrollIntoViewIfNeeded();
      const box = await rail.boundingBox();
      const y = box.y + box.height / 2;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 40, y }] });
      for (let step = 1; step <= 8; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 40 - step * 28, y }] });
        await page.waitForTimeout(16);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  } finally { await context.close(); }
});
