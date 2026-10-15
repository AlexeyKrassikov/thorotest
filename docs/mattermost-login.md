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
from `/api/v4/users/me`. The profile must contain an ID and email;
deactivated users are rejected. Mattermost's `email_verified` flag is not required.
The configured Mattermost server is trusted for identity; linking an existing
account with the same email still requires password confirmation.

New Mattermost users receive `pending` account status and no application access,
regardless of their Mattermost roles. An administrator approves the account and
chooses its role in Admin > Users. The user then signs in again. Existing accounts
keep their current access during migration. Blocking an account rejects its
existing REST, GraphQL, API-token and WebSocket credentials.
This does not enable local, GitHub or Google self-registration:
keep `ALLOW_OPEN_REGISTRATION=0`. Any active user with an email on the configured
Mattermost server can request approval; this is not a team filter.
An existing matching email requires explicit password confirmation before
linking; returning users retain their existing ThoroTest role and 2FA.
Local administrator login remains available unless disabled in login settings.

Administrators can enable or disable GitHub, Google and Mattermost under
**Admin > OAuth**. Choices persist in the database and apply without restarting
the app. A login button appears only when the provider is enabled and its
environment credentials are configured. Disabling a provider also blocks its
redirect, callback and pending account-link flow; existing sessions are not
revoked. Local password login can be disabled in the same administration screen.
Disabling it also blocks local registration and password reset endpoints. The
acting administrator must first have a linked, enabled, configured OAuth identity.
Settings changes cannot remove the final available administrator login method.
The admin API never returns
provider credentials.

State is single-use, expires after ten minutes, and is tied to an HttpOnly,
SameSite=Lax browser cookie (Secure when TESTHUB_BASE_URL is HTTPS). Provider
tokens and client secrets are not sent to the browser or stored in the user
record. Removing a user in Mattermost prevents subsequent OAuth logins but
does not revoke an already-issued ThoroTest session.

## Optional Second Factors

After approval, Settings > Security offers TOTP and passkeys. Enrollment is
optional; once any factor is enrolled it is required after primary login.
Passkeys are not a standalone login method. Multiple named passkeys are supported.
Recovery codes are shown once when the first factor is enrolled; keep them in a
safe place. A recovery-code login allows replacing a lost key and revokes device
trust. With no usable factor or recovery code, an administrator must arrange
operator-assisted account recovery; there is no email-only bypass.

Passkeys use WebAuthn with user verification. The server stores public keys, not
private keys or biometric data. Configure `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID` and
`WEBAUTHN_RP_NAME`, or derive origin/RP ID from `TESTHUB_BASE_URL`. RP ID must equal
the hostname. Production requires HTTPS; localhost HTTP is allowed for testing.
An origin/RP ID change requires users to enroll new credentials on that origin.

Security changes require primary login within five minutes, plus a fresh second
factor when one already exists. The Security screen can confirm a passkey or
TOTP code; sign in again if the primary login is too old.

After a successful passkey login, users may trust that browser for exactly 30
days. This skips only the second factor, not primary login, and never extends
itself automatically. Trust uses an HttpOnly, Secure, host-only cookie; the DB
stores only a hash. Ordinary logout preserves trust. Settings > Security lists
and revokes trusted browsers; deleting the associated passkey, blocking the
account, password recovery, or using recovery codes invalidates trust.

Before disabling password login, verify that the administrator can actually sign
in using the linked OAuth provider. Configuration checks cannot guarantee that
an external provider remains reachable. If all providers become unavailable,
an operator with authorized DB access can set `login_settings.password_enabled`
back to true; this does not create or reset any administrator password.

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
