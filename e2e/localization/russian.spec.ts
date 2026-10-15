import { test, expect } from '@playwright/test';

test('first visit uses browser locale and keeps a later manual choice', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'ru-RU' });
  const page = await context.newPage();
  try {
    await page.goto(baseURL!);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('select')).toHaveValue('ru');
    await page.locator('select').selectOption('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('select')).toHaveValue('en');
  } finally {
    await context.close();
  }
});

test('login language persists and does not translate entered data', async ({ page }) => {
  await page.goto('/');
  await page.locator('select').selectOption('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.locator('input[type=email]').fill('Save@example.test');
  await page.locator('select').selectOption('en');
  await expect(page.locator('input[type=email]')).toHaveValue('Save@example.test');
  await page.locator('select').selectOption('ru');
  await page.reload();
  await expect(page.locator('select')).toHaveValue('ru');
  await expect(page.locator('button[type=submit]')).toHaveText('Войти');
});

test('Russian routes render, preserve data and switch live without missing keys', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) externalRequests.push(url.origin);
  });
  page.on('websocket', socket => {
    const url = new URL(socket.url());
    if (url.host !== new URL(baseURL!).host) externalRequests.push(url.origin);
  });
  page.on('pageerror', e => errors.push(e.message));
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  expect(login.ok()).toBeTruthy();
  const { access_token: adminToken } = await login.json();
  const username = `locale-${Date.now()}`;
  const password = 'UI-i18n-Fixture!459';
  const created = await page.request.post('/api/admin/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { username, email: `${username}@example.test`, password, display_name: 'Locale test', role: 'admin' },
  });
  expect(created.ok()).toBeTruthy();
  const user = await created.json();
  const session = await page.request.post('/api/auth/login', { data: { email: user.email, password } });
  const { access_token: token } = await session.json();
  try {
  const profile = await page.request.put('/api/me', {
    headers: { Authorization: `Bearer ${token}` }, data: { language: 'ru' },
  });
  expect(profile.ok()).toBeTruthy();
  await page.addInitScript(value => {
    localStorage.setItem('th_token', value);
    localStorage.setItem('th_lang', 'ru');
  }, token);

  for (const route of ['overview', 'library', 'tests/TC-1042', 'requirements', 'runs', 'runs/R-1287', 'defects', 'my-work', 'pipelines', 'insights', 'ai', 'integrations', 'import', 'settings', 'admin', 'docs']) {
    await page.goto(`/#/${route}`);
    const screen = route.startsWith('tests/') ? 'test-detail' : route.startsWith('runs/') ? 'run-detail' : route;
    await expect(page.locator('.app')).toHaveAttribute('data-screen-label', screen);
    const content = page.locator('main');
    await expect(content).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(content).toContainText(/[А-Яа-яЁё]/);
    await expect(content).not.toContainText(/(?<![A-Za-z0-9_:/.-])(?:cases|execution|config|import|docs|misc|workspace|shell|api)\.[a-zA-Z]+\./);
    await page.evaluate(() => (window as any).TH_I18N.setLanguage('en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('a[href="#/library"]').first()).toHaveText('Test library');
    await page.evaluate(() => (window as any).TH_I18N.setLanguage('ru'));
    await expect(page.locator('a[href="#/library"]').first()).toHaveText('Библиотека тестов');
    if (route === 'tests/TC-1042') {
      await expect(content).toContainText('User can sign in with valid email + password');
    }
    if (route === 'library') {
      const gridLabel = await page.evaluate(() => (window as any).TH_I18N.t('cases.library.gridView'));
      await page.getByRole('button', { name: gridLabel, exact: true }).click();
      await expect(content.locator('.card').first()).toBeVisible();
      const listLabel = await page.evaluate(() => (window as any).TH_I18N.t('cases.library.listView'));
      await page.getByRole('button', { name: listLabel, exact: true }).click();
      await expect(content.locator('table')).toBeVisible();
    }
    await page.screenshot({ path: test.info().outputPath(`${route.replaceAll('/', '-')}.png`), fullPage: true, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
  expect(externalRequests, 'Normal app navigation must not contact third-party services').toEqual([]);
  } finally {
    await page.request.delete(`/api/admin/users/${user.id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  }
});
