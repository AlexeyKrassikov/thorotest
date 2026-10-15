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
    for (const file of fs.readdirSync(path.join(root, 'frontend/locales')).filter(f => f.startsWith(`${lang}-`))) {
      vm.runInContext(fs.readFileSync(path.join(root, 'frontend/locales', file), 'utf8'), context, { filename: file });
      assert.ok(fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8').includes(`locales/${file}`), `${file} must be loaded`);
    }
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

test('literal translation keys used by components exist in both dictionaries', () => {
  const ts = require('typescript');
  const en = Object.fromEntries(flatten(context.window.TH_LOCALES.en));
  const ru = Object.fromEntries(flatten(context.window.TH_LOCALES.ru));
  const files = ['app.jsx', 'api.js', ...['views', 'components'].flatMap(dir =>
    fs.readdirSync(path.join(root, 'frontend', dir)).filter(f => f.endsWith('.jsx')).map(f => `${dir}/${f}`))];
  const missing = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'frontend', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    function visit(node) {
      if (ts.isCallExpression(node) && /(?:^|\.)t$/.test(node.expression.getText(source)) && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        if (!(key in en) || !(key in ru)) missing.push(`${file}: ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
});

test('JSX user-interface text is localized, excluding brands and technical examples', () => {
  const ts = require('typescript');
  const technical = new Set([
    'ThoroTest', 'REST API', 'CLI', 'SDKs', 'CSV', 'PDF', 'CI:',
    'main', 'main · a3c9f1d', 'tests/', 'ci.yml', 'junit', 'PAY', 'Bug',
    '.thorotest/', '.thorotest/config.yml', '.github/workflows/thorotest.yml',
    '⌘/Ctrl+Enter', 'TC-1045', 'TC-2400', 'ID *',
    'http://localhost:8929/api/v4', 'https://your-org.atlassian.net',
    'you@example.com', 'https://your-endpoint.example.com/hook',
  ]);
  const missing = [];
  for (const dir of ['views', 'components']) {
    for (const file of fs.readdirSync(path.join(root, 'frontend', dir)).filter(f => f.endsWith('.jsx'))) {
      const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'frontend', dir, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
      function visit(node) {
        let text;
        if (ts.isJsxText(node)) text = node.text.trim().replace(/&[a-z]+;/g, '');
        if (ts.isJsxAttribute(node) && ['title', 'placeholder', 'aria-label', 'label', 'hint'].includes(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) text = node.initializer.text;
        if (text && /[A-Za-z]{2}/.test(text) && !technical.has(text)) {
          let parent = node.parent;
          let code = false;
          while (parent) {
            if (ts.isJsxElement(parent) && ['code', 'pre', 'CodeBlock'].includes(parent.openingElement.tagName.getText(source))) code = true;
            parent = parent.parent;
          }
          if (!code) missing.push(`${file}: ${text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.deepEqual(missing, []);
});
