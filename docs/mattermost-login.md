# Mattermost login

Configure the trusted Mattermost server through environment variables only:

```dotenv
MATTERMOST_URL=https://your-mattermost-host
MATTERMOST_CLIENT_ID=
MATTERMOST_CLIENT_SECRET=
TESTHUB_BASE_URL=https://your-thorotest-host
```

Create an OAuth application in Mattermost and register this exact callback:
`{TESTHUB_BASE_URL}/api/auth/oauth/mattermost/callback`.
Restart ThoroTest after changing configuration. The login button is hidden
unless all three Mattermost settings are present and the URL is valid.
HTTPS is required, except localhost HTTP in non-production environments.
Keep credentials in deployment secrets/environment, never in frontend code.
For deployments with an explicit environment allowlist, pass all three
Mattermost variables to the app container.

The server exchanges the code at `/oauth/access_token` and fetches the profile
from `/api/v4/users/me`. The profile must contain an ID and verified email;
deactivated users are rejected. Configure email verification in Mattermost.

New Mattermost users receive `viewer`, regardless of their Mattermost roles.
This does not enable local, GitHub or Google self-registration:
keep `ALLOW_OPEN_REGISTRATION=0`. Any active, verified user on the configured
Mattermost server can create a viewer account; this is not a team filter.
An existing matching email requires explicit password confirmation before
linking; returning users retain their existing ThoroTest role and 2FA.
Local administrator login remains available.

State is single-use, expires after ten minutes, and is tied to an HttpOnly,
SameSite=Lax browser cookie (Secure when TESTHUB_BASE_URL is HTTPS). Provider
tokens and client secrets are not sent to the browser or stored in the user
record. Removing a user in Mattermost prevents subsequent OAuth logins but
does not revoke an already-issued ThoroTest session.

## Russian language

Select **Русский** on the login screen or in Settings > Profile > Language.
Russian covers application screens, forms, built-in help, notifications,
password-reset emails and application error messages. Language changes apply
without reloading the page and persist across visits. API requests send the
selected language through `Accept-Language`; emails and newly created
notifications use the recipient's saved profile language.

User-created content, existing notification history, API identifiers, code
examples and diagnostic text returned by external providers are not translated.
Other supported languages fall back to English for newly introduced keys.

Verification:

```sh
python -m pytest backend/tests/test_oauth_mattermost.py backend/tests/test_oauth.py backend/tests/test_oauth_google.py
npm run test:i18n
npm run test:i18n:browser
npm run build
```

Real OAuth end-to-end verification requires your Mattermost instance and
registered client credentials; automated tests mock the provider exchanges.
The localization browser suite uses a disposable SQLite database and checks
Russian screens on desktop and mobile independently of any development data.

[Mattermost OAuth documentation](https://docs.mattermost.com/developers/integrate/apps/authentication/oauth2)
