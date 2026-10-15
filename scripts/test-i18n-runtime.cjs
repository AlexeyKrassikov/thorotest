const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime(stored = 'ru', storageBlocked = false, navigator = {}) {
  const values = new Map([['th_lang', stored]]);
  const context = vm.createContext({
    window: {}, document: { documentElement: {}, title: '' }, console, Headers, navigator,
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('blocked'); return values.get(key); },
      setItem(key, value) { if (storageBlocked) throw new Error('blocked'); values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'frontend', file), 'utf8'), context);
  run('i18n.js');
  for (const language of ['en', 'ru']) {
    run(`locales/${language}.js`);
    for (const domain of ['api', 'shell']) run(`locales/${language}-${domain}.js`);
  }
  return { context, run, i18n: context.window.TH_I18N };
}

test('restores language, document language and title before rendering', () => {
  const { context, i18n } = runtime('ru');
  i18n.initialize();
  assert.equal(i18n.getLanguage(), 'ru');
  assert.equal(context.document.documentElement.lang, 'ru');
  assert.equal(context.document.title, 'ThoroTest — Управление тестированием');
});

test('unsupported stored language and unavailable storage fall back safely', () => {
  for (const r of [runtime('invalid'), runtime('ru', true)]) {
    r.i18n.initialize();
    assert.equal(r.i18n.getLanguage(), 'en');
    assert.equal(r.context.document.documentElement.lang, 'en');
  }
});

test('detects the first supported browser locale, including regional variants', () => {
  for (const navigator of [
    { languages: ['ja-JP', 'ru-RU', 'en-US'] },
    { languages: ['RU-ru'] },
    { language: 'ru-RU' },
    { languages: [], language: 'ru' },
  ]) {
    const { i18n, context } = runtime(null, false, navigator);
    i18n.initialize();
    assert.equal(i18n.getLanguage(), 'ru');
    assert.equal(context.document.documentElement.lang, 'ru');
  }
});

test('stored choice wins while invalid or inaccessible storage uses browser preferences', () => {
  for (const [stored, blocked, expected] of [
    ['en', false, 'en'], ['invalid', false, 'ru'], ['en', true, 'ru'],
  ]) {
    const { i18n } = runtime(stored, blocked, { languages: ['ru-RU'] });
    i18n.initialize();
    assert.equal(i18n.getLanguage(), expected);
  }
});

test('unsupported browser locales fall back to English and manual selection persists', () => {
  const { i18n, context } = runtime(null, false, { languages: ['ja-JP', 'zh-CN'] });
  i18n.initialize();
  assert.equal(i18n.getLanguage(), 'en');
  i18n.setLanguage('ru');
  i18n.initialize();
  assert.equal(i18n.getLanguage(), 'ru');
  assert.equal(context.localStorage.getItem('th_lang'), 'ru');
});

test('switches languages with interpolation, fallback and subscription', () => {
  const { i18n } = runtime('ru');
  i18n.initialize();
  let changes = 0;
  const unsubscribe = i18n.subscribe(() => changes++);
  const text = '<b>User {{seconds}}</b>';
  assert.equal(i18n.t('login.fill', { email: text }), `Заполнить ${text}`);
  i18n.setLanguage('en');
  assert.equal(i18n.t('common.save'), 'Save');
  i18n.setLanguage('ru');
  assert.equal(i18n.t('common.save'), 'Сохранить');
  assert.equal(i18n.t('unknown.key'), 'unknown.key');
  assert.equal(changes, 2);
  unsubscribe();
  i18n.setLanguage('en');
  assert.equal(changes, 2);
});

test('API sends current language on authenticated and anonymous requests', async () => {
  const { context, run, i18n } = runtime('ru');
  const requests = [];
  context.window.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ access_token: 'test', user: { language: 'ru' } }) };
  };
  context.fetch = context.window.fetch;
  i18n.initialize();
  run('api.js');
  await context.window.TH_API.forgotPassword('person@example.test');
  assert.equal(new Headers(requests[0].options.headers).get('Accept-Language'), 'ru');
  assert.equal(context.window.authHeaders()['Accept-Language'], 'ru');
  i18n.setLanguage('en');
  assert.equal(context.window.authHeaders()['Accept-Language'], 'en');
});

test('API fallback errors are localized without changing request payloads', async () => {
  const { context, run, i18n } = runtime('ru');
  let payload;
  context.window.fetch = async (url, options) => {
    payload = options.body;
    return { ok: false, json: async () => ({}) };
  };
  context.fetch = context.window.fetch;
  i18n.initialize();
  run('api.js');
  await assert.rejects(context.window.TH_API.forgotPassword('Save@example.test'), /Не удалось выполнить запрос/);
  assert.equal(JSON.parse(payload).email, 'Save@example.test');
});

test('API validation errors display readable localized messages', async () => {
  const { context, run, i18n } = runtime('ru');
  context.window.fetch = async () => ({ ok: false, json: async () => ({ detail: [{ msg: 'Поле обязательно', loc: ['body', 'email'] }] }) });
  context.fetch = context.window.fetch;
  i18n.initialize();
  run('api.js');
  await assert.rejects(context.window.TH_API.login('', ''), { message: 'Поле обязательно' });
});
