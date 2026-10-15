import { test, expect } from '@playwright/test';

test('passkey enrollment, second factor and trusted browser revocation', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const email = `passkey-${Date.now()}@example.test`;
  const password = 'Secure-Example-9274';
  const created = await page.request.post('/api/auth/register', { data: { email, username: `pk${Date.now()}`, password } });
  expect(created.ok()).toBeTruthy();
  const login = await page.request.post('/api/auth/login', { data: { email, password } });
  const token = (await login.json()).access_token;
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('th_token', value), token);
  await page.goto('/#/settings');
  await page.reload();
  await page.locator('.settings-nav').getByRole('button', { name: 'Security', exact: true }).click();
  await page.getByRole('textbox', { name: 'Passkey name' }).fill('Test laptop');
  await page.getByRole('button', { name: 'Add passkey', exact: true }).click();
  await expect(page.getByText('Test laptop', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('passkey-settings.png') });
  await page.evaluate(async () => { await (window as any).TH_API.logout(); });
  await page.goto('/');
  await page.reload();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use passkey', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Trust this browser for 30 days' }).check();
  await page.getByRole('button', { name: 'Use passkey', exact: true }).click();
  await expect(page.locator('main')).toBeVisible();
  const devices = await page.evaluate(async () => (window as any).TH_API.securityRequest('/me/trusted-devices'));
  expect(devices).toHaveLength(1);
  await page.evaluate(async () => { await (window as any).TH_API.logout(); });
  const trusted = await page.request.post('/api/auth/login', { data: { email, password } });
  const session = await trusted.json();
  expect(session.access_token).toBeTruthy();
  await page.request.delete('/api/me/trusted-devices', { headers: { Authorization: `Bearer ${session.access_token}` } });
  const untrusted = await page.request.post('/api/auth/login', { data: { email, password } });
  expect((await untrusted.json()).status).toBe('2fa_required');
});

test('pending accounts have no session until admin approval', async ({ page, browser }) => {
  const email = `pending-${Date.now()}@example.test`;
  const password = 'Secure-Example-9274';
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  const token = (await login.json()).access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const created = await page.request.post('/api/admin/users', { headers, data: {
    email, username: `pending${Date.now()}`, password, display_name: 'Pending member', role: 'viewer',
  } });
  const user = await created.json();
  expect(created.ok()).toBeTruthy();
  expect((await page.request.patch(`/api/admin/users/${user.id}/status`, { headers, data: { status: 'pending' } })).ok()).toBeTruthy();
  const pendingLogin = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(await pendingLogin.json()).toEqual({ status: 'pending_approval' });
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('th_token', value), token);
  await page.goto('/#/admin');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Pending approval');
  await row.getByRole('combobox').selectOption('tester');
  await expect(row.getByRole('combobox')).toHaveValue('tester');
  await row.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(row).toContainText('Approved');
  const approvedLogin = await page.request.post('/api/auth/login', { data: { email, password } });
  const session = await approvedLogin.json();
  expect(session.user.role).toBe('tester');
  await row.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(row).toContainText('Blocked');
  expect((await page.request.get('/api/me', { headers: { Authorization: `Bearer ${session.access_token}` } })).status()).toBe(401);
  await page.request.delete(`/api/admin/users/${user.id}`, { headers });
});
