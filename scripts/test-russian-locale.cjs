const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = { window: { TH_LOCALES: {} } };
vm.createContext(context);
function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' ? [[prefix + key, child]] : flatten(child, prefix + key + '.'));
}
test('Russian locale covers all English keys and preserves interpolation', () => {
  for (const lang of ['en', 'ru']) {
    vm.runInContext(fs.readFileSync(path.join(root, `frontend/locales/${lang}.js`), 'utf8'), context);
  }
  const en = Object.fromEntries(flatten(context.window.TH_LOCALES.en));
  const ru = Object.fromEntries(flatten(context.window.TH_LOCALES.ru));
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.ok(ru[key].trim(), key);
    assert.deepEqual((ru[key].match(/\{\{\w+\}\}/g) || []).sort(),
      (en[key].match(/\{\{\w+\}\}/g) || []).sort(), key);
  }
  assert.match(fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8'), /locales\/ru\.js/);
});
