import { test, expect } from '@playwright/test';

test('project case editor saves fields, steps, ordering and history', async ({ page }, info) => {
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  const { access_token: token, user } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const project = `editor-${Date.now()}`;
  expect((await page.request.post('/api/projects', { headers, data: { id: project, name: project } })).ok()).toBeTruthy();
  await page.addInitScript(({ token, userId, project }) => {
    localStorage.setItem('th_token', token);
    localStorage.setItem('th_project_' + userId, project);
    localStorage.setItem('th_lang', 'en');
  }, { token, userId: user.id, project });
  const created = await page.request.post('/api/tests', { headers, data: { auto_id: true, title: 'Editable case', project_id: project } });
  expect(created.ok()).toBeTruthy();
  const tc = await created.json();
  await page.goto(`/#/tests/${tc.id}`);
  await expect(page.getByLabel('Author', { exact: true })).toHaveValue('marco');
  await page.getByLabel('Tags', { exact: true }).pressSequentially('smoke, auth');
  await page.getByLabel('Tags', { exact: true }).press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved');
  expect((await (await page.request.get(`/api/tests/${tc.id}`, { headers })).json()).tags).toEqual(['smoke', 'auth']);

  // A failed save must retain the draft and offer an explicit retry.
  await page.route(`**/api/tests/${tc.id}`, async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 503, json: { detail: 'Temporary test failure' } });
    else await route.continue();
  });
  await page.getByLabel('Description', { exact: true }).fill('Updated description');
  await page.getByLabel('Description', { exact: true }).blur();
  await expect(page.getByRole('alert')).toContainText('Temporary test failure');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Updated description');
  await page.unroute(`**/api/tests/${tc.id}`);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByLabel('Prerequisites', { exact: true }).fill('Signed out');
  await page.getByLabel('Prerequisites', { exact: true }).blur();
  await expect(page.getByRole('status')).toContainText('Saved');
  for (const [i, action] of ['Open application', 'Sign in'].entries()) {
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page.getByLabel(`Action ${i + 1}`, { exact: true }).fill(action);
    await page.getByLabel(`Action ${i + 1}`, { exact: true }).blur();
    await expect(page.getByRole('status')).toContainText('Saved');
  }
  await page.getByTitle('Move up', { exact: true }).nth(1).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByLabel('Action 1', { exact: true })).toHaveValue('Sign in');
  await page.locator('.editor-step').last().scrollIntoViewIfNeeded();
  const first = page.locator('.step-drag').first();
  const second = page.locator('.step-drag').last();
  await second.scrollIntoViewIfNeeded();
  const start = (await second.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 12, { steps: 5 });
  await first.scrollIntoViewIfNeeded();
  const end = (await first.boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + 2, { steps: 20 });
  await page.waitForTimeout(250); // Sortable's fallback drag loop runs on a timer.
  await page.mouse.up();
  await expect(page.getByLabel('Action 1', { exact: true })).toHaveValue('Open application');
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Updated description');
  await expect(page.getByLabel('Action 1', { exact: true })).toHaveValue('Open application');
  await page.screenshot({ path: info.outputPath('case-editor.png'), fullPage: true });
  await page.getByLabel('Select all steps', { exact: true }).check();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByText('No steps', { exact: true })).toBeVisible();
  const history = await page.request.get(`/api/history/test/${tc.id}`, { headers });
  expect(JSON.stringify(await history.json())).toContain('Open application');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBeFalsy();

  // A stale tab must not silently overwrite a change made by another editor.
  const latest = await (await page.request.get(`/api/tests/${tc.id}`, { headers })).json();
  await page.request.patch(`/api/tests/${tc.id}`, { headers, data: { author: 'Another editor', revision: latest.revision } });
  await page.getByLabel('Description', { exact: true }).fill('Conflicting draft');
  await page.getByLabel('Description', { exact: true }).blur();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Conflicting draft');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reload server version', exact: true }).click();
  await expect(page.getByLabel('Author', { exact: true })).toHaveValue('Another editor');

  await page.goto('/#/settings');
  const textSize = page.getByRole('slider', { name: 'Text size', exact: true });
  await textSize.fill('2');
  await expect(textSize).toBeEnabled();
  const scale = page.getByRole('slider', { name: 'Interface scale', exact: true });
  await scale.fill('2');
  await expect(scale).toBeEnabled();
  await page.getByLabel('Density', { exact: true }).selectOption('comfortable');
  await expect(page.getByLabel('Density', { exact: true })).toBeEnabled();
  await page.reload();
  await expect(textSize).toHaveValue('2');
  await expect(scale).toHaveValue('2');
  await page.goto(`/#/tests/${tc.id}`);
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Updated description');
  await page.getByLabel('Prerequisites', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('case-editor-large.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await page.request.put('/api/me', { headers, data: { appearance: { textSize: 14, scale: 100, density: 'compact' } } });
});

test('project editor manages collaborator roles', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  const { access_token: token, user } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const id = `members-${Date.now()}`;
  await page.request.post('/api/projects', { headers, data: { id, name: id } });
  await page.addInitScript(({ token, user, id }) => {
    localStorage.setItem('th_token', token);
    localStorage.setItem('th_lang', 'en');
    localStorage.setItem('th_project_' + user.id, id);
  }, { token, user, id });
  await page.goto('/#/settings');
  await page.locator('.settings-nav').getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.card').filter({ hasText: id }).getByRole('button', { name: 'Edit', exact: true }).click();
  const picker = page.getByLabel('Select a user', { exact: true });
  await expect(picker.locator('option')).not.toHaveCount(1);
  const candidate = await picker.locator('option').nth(1).evaluate((o: HTMLOptionElement) => ({ id: o.value, name: o.text }));
  await picker.selectOption(candidate.id);
  await page.getByLabel('Role', { exact: true }).selectOption('editor');
  await page.getByTitle('Add collaborator', { exact: true }).click();
  const member = page.getByLabel(candidate.name, { exact: true });
  await expect(member).toHaveValue('editor');
  await member.selectOption('viewer');
  await expect(member).toBeEnabled();
  const members = await (await page.request.get(`/api/projects/${id}/members`, { headers })).json();
  expect(members.find((m: any) => String(m.user_id) === candidate.id).role).toBe('viewer');
});
