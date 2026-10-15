import { test, expect } from '@playwright/test';

test('admin OAuth switches persist and change the login buttons', async ({ page, browser }) => {
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const initial = await page.request.get('/api/admin/oauth-providers', { headers });
  expect(initial.ok()).toBeTruthy();
  const original = await initial.json();
  const anonymous = await browser.newContext();
  const loginPage = await anonymous.newPage();
  await page.addInitScript(value => localStorage.setItem('th_token', value), token);
  try {
    await page.goto('/#/admin');
    await page.getByRole('button', { name: 'OAuth', exact: true }).click();
    for (const provider of ['github', 'google', 'mattermost']) {
      const checkbox = page.getByRole('checkbox', { name: provider === 'github' ? 'GitHub' : provider === 'google' ? 'Google' : 'Mattermost', exact: true });
      await expect(checkbox).toBeChecked();
      await checkbox.uncheck();
      await expect(checkbox).not.toBeChecked();
      await expect(checkbox).toBeEnabled();
    }
    await loginPage.goto('/');
    await expect(loginPage.locator('.login-oauth-buttons')).toHaveCount(0);
    await expect(loginPage.locator('button[type=submit]')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'OAuth', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'GitHub', exact: true })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'GitHub', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: 'GitHub', exact: true })).toBeEnabled();
    await loginPage.reload();
    await expect(loginPage.getByRole('button', { name: /GitHub/ })).toBeVisible();
    await expect(loginPage.getByRole('button', { name: /Google|Mattermost/ })).toHaveCount(0);
    await page.route('**/api/admin/oauth-providers/google', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated save failure' }),
    }));
    await page.getByRole('checkbox', { name: 'Google', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Simulated save failure');
    await expect(page.getByRole('checkbox', { name: 'Google', exact: true })).not.toBeChecked();
    await page.unroute('**/api/admin/oauth-providers/google');
    await page.evaluate(() => (window as any).TH_I18N.setLanguage('ru'));
    await expect(page.locator('main')).toContainText('Провайдеры входа');
    await page.screenshot({ path: test.info().outputPath('oauth-settings-ru.png'), animations: 'disabled' });
    const config = await loginPage.request.get('/api/config');
    expect((await config.json()).oauth_providers).toEqual({ github: true, google: false, mattermost: false });
  } finally {
    for (const [provider, config] of Object.entries(original) as [string, { enabled: boolean }][]) {
      await page.request.patch(`/api/admin/oauth-providers/${provider}`, { headers, data: { enabled: config.enabled } });
    }
    await anonymous.close();
  }
});
