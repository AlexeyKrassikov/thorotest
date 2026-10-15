import { test, expect } from '@playwright/test';

test('sidebar logo keeps its inset and automatic case IDs are optional', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: { email: 'marco@acme.com', password: 'demo123' } });
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const ids: string[] = [];
  const folderIds: string[] = [];
  await page.addInitScript(value => {
    localStorage.setItem('th_token', value);
    localStorage.setItem('th_lang', 'en');
  }, token);
  await page.goto('/#/library');
  if (test.info().project.name !== 'mobile') {
    const brand = page.locator('.sidebar-brand');
    const mark = page.locator('.brand-mark');
    await expect(brand).toBeVisible();
    const outer = (await brand.boundingBox())!;
    const inner = (await mark.boundingBox())!;
    expect(inner.x - outer.x).toBeGreaterThanOrEqual(14);
    expect(inner.y - outer.y).toBeGreaterThanOrEqual(14);
  }
  try {
    for (const language of ['en', 'ru']) {
      await page.evaluate(lang => (window as any).TH_I18N.setLanguage(lang), language);
      const label = async (key: string) => page.evaluate(k => (window as any).TH_I18N.t(k), key);
      await page.locator('.toolbar').getByRole('button', { name: await label('cases.library.newTest'), exact: true }).click();
      const dialog = page.getByRole('dialog');
      const automatic = dialog.getByRole('checkbox', { name: await label('cases.library.autoId') });
      const idInput = dialog.locator('#new-test-id');
      await expect(automatic).not.toBeChecked();
      await idInput.fill(`MANUAL-${language}-${Date.now()}`);
      const manualId = await idInput.inputValue();
      await automatic.check();
      await expect(idInput).toBeDisabled();
      await automatic.uncheck();
      await expect(idInput).toHaveValue(manualId);
      await idInput.fill('');
      await automatic.check();
      await dialog.locator('input').nth(2).fill(`Optional numbering ${language}`);
      await expect(dialog.getByLabel(await label('editor.author'), { exact: true })).toHaveValue('marco');
      await dialog.getByLabel(await label('editor.author'), { exact: true }).fill('Case author');
      await dialog.getByLabel(await label('editor.newFolder'), { exact: true }).fill(`Inline folder ${language}`);
      const folderResponse = page.waitForResponse(r => r.url().endsWith('/api/folders') && r.request().method() === 'POST');
      await dialog.getByTitle(await label('editor.createFolder'), { exact: true }).click();
      const folder = await (await folderResponse).json();
      folderIds.push(folder.id);
      await expect(dialog.getByRole('button', { name: await label('cases.library.createTest'), exact: true })).toBeEnabled();
      await page.screenshot({ path: test.info().outputPath(`new-case-${language}.png`), animations: 'disabled' });
      const response = page.waitForResponse(r => r.url().endsWith('/api/tests') && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: await label('cases.library.createTest'), exact: true }).click();
      const created = await response;
      expect(created.status()).toBe(201);
      const result = await created.json();
      ids.push(result.id);
      expect(result.id).toMatch(/^TC-\d+$/);
      expect(result.author).toBe('Case author');
      expect(result.folder_id).toBe(folder.id);
      expect(result.project_id).toBe(folder.project_id);
      await expect(dialog).not.toBeVisible();
    }
    expect(Number(ids[1].slice(3))).toBe(Number(ids[0].slice(3)) + 1);
  } finally {
    for (const id of ids) await page.request.delete(`/api/tests/${id}`, { headers });
    for (const id of folderIds) await page.request.delete(`/api/folders/${id}`, { headers });
  }
});
