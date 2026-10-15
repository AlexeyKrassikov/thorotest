// Isolated, disposable backend for the browser localization suite.
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'thorotest-i18n-'));
const python = path.join(root, existsSync(path.join(root, '.venv/bin/python')) ? '.venv/bin/python' : 'venv/bin/python');
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${path.join(temporary, 'test.db')}`,
  SECRET_KEY: randomBytes(32).toString('hex'),
  ADMIN_INITIAL_PASSWORD: randomBytes(24).toString('hex'),
  ENVIRONMENT: 'test', DEMO_MODE: '0', REDIS_URL: '',
  ALLOW_OPEN_REGISTRATION: '1', LOGIN_RATELIMIT_DISABLED: '1',
  WEBHOOK_ALLOW_PRIVATE_HOSTS: '1',
  SMTP_HOST: '', MATTERMOST_URL: '',
  GITHUB_CLIENT_ID: 'browser-test-client', GITHUB_CLIENT_SECRET: 'browser-test-secret',
  GOOGLE_CLIENT_ID: 'browser-test-client', GOOGLE_CLIENT_SECRET: 'browser-test-secret',
};
const seed = spawnSync(python, ['-m', 'backend.seed'], { cwd: root, env, stdio: 'inherit' });
if (seed.status !== 0) {
  rmSync(temporary, { recursive: true, force: true });
  process.exit(seed.status || 1);
}
const server = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', process.env.I18N_TEST_PORT || '18347', '--no-access-log', '--log-level', 'warning'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', code => {
  rmSync(temporary, { recursive: true, force: true });
  process.exit(code || 0);
});
