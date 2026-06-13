# Username and Password Update Guide

This document is a public-safe template for credential rotation and account updates. It uses placeholders only and must not contain real usernames, passwords, tokens, private server details, session values, cookies, CSRF values, database URLs, recovery codes, private paths, or project-specific account history.

## 1. Purpose

Use this guide to plan and verify account credential updates without exposing real credential material in tracked documentation.

This guide applies to:

- personal accounts
- admin accounts
- service accounts
- repository or hosting accounts
- application login accounts

It is not a place to store credentials. Real values belong in `<PASSWORD_MANAGER>`, an approved keychain, or private ignored notes.

## 2. Safety Rules

Never commit:

- real usernames
- real email addresses if they identify a private account
- old or new passwords
- password reset links
- recovery codes or MFA backup codes
- tokens or token fragments
- cookies or session values
- CSRF values
- database URLs
- private server users, hosts, IPs, or access details
- private key paths
- local machine paths
- password manager item names that reveal private structure

Use placeholders in tracked docs:

- `<ACCOUNT_USERNAME>`
- `<ACCOUNT_EMAIL>`
- `<NEW_PASSWORD>`
- `<OLD_PASSWORD>`
- `<PASSWORD_MANAGER>`
- `<RECOVERY_EMAIL>`
- `<MFA_DEVICE>`
- `<SERVICE_NAME>`
- `<ADMIN_URL>`
- `<SERVER_HOST>`
- `<DEPLOY_USER>`
- `<SECRET_NAME>`
- `<SECRET_VALUE>`

If an exact value is needed for operation, keep it in private ignored notes or a credential manager, not this file.

## 3. When To Rotate Credentials

Rotate credentials when:

- a person leaves a role or no longer needs access
- access was shared more broadly than intended
- a device was lost, replaced, or compromised
- a token, password, cookie, session, or recovery code may have been exposed
- an account is being transferred to a new owner
- a password manager or MFA device is being reorganized
- a service changes its authentication requirements
- periodic security review calls for rotation

Do not rotate production or admin credentials casually. Plan the change, verify recovery paths, and avoid locking out the operator.

## 4. Preparation Checklist

Before changing credentials:

- Identify `<SERVICE_NAME>`.
- Identify whether the account is personal, admin, service, or deployment-related.
- Confirm who owns final approval.
- Confirm recovery access is available.
- Confirm MFA is working.
- Confirm the current credential is stored in `<PASSWORD_MANAGER>` or a private approved store.
- Confirm where the updated credential must be saved.
- Confirm whether automation, deployment, CI, or scheduled jobs depend on the credential.
- Confirm a rollback or recovery path exists.
- Decide whether the change needs a maintenance window.

Do not paste real credentials into chat, terminal transcripts, screenshots, or tracked docs during planning.

## 5. Password Manager Update Workflow

Use this placeholder-only workflow:

1. Open `<PASSWORD_MANAGER>`.
2. Locate the item for `<SERVICE_NAME>`.
3. Confirm the item owner and purpose.
4. Generate or choose `<NEW_PASSWORD>` inside the password manager.
5. Update the service account password through the service UI or approved admin interface.
6. Save the updated credential in `<PASSWORD_MANAGER>`.
7. Remove stale duplicate items if approved.
8. Record a private note that rotation happened, without copying the password into tracked docs.

Tracked docs may record that rotation happened, but not the old value, new value, reset link, recovery code, or password manager item name if it reveals private structure.

## 6. Username Or Email Update Workflow

Changing a username or email can affect login, recovery, notifications, integrations, and audit history.

Before changing `<ACCOUNT_USERNAME>` or `<ACCOUNT_EMAIL>`:

- Confirm the new identifier is available.
- Confirm `<RECOVERY_EMAIL>` is current.
- Confirm MFA still works after the change.
- Confirm account notifications are received.
- Confirm integrations do not rely on the old identifier.
- Confirm saved credentials in `<PASSWORD_MANAGER>` are updated.
- Confirm private ignored notes are updated if they reference the old identifier.

Do not publish real account identifiers in tracked docs unless they are intentionally public project information.

## 7. MFA And Recovery Checks

Before and after credential rotation:

- Confirm `<MFA_DEVICE>` is present and working.
- Confirm backup MFA methods are current.
- Confirm `<RECOVERY_EMAIL>` is accessible.
- Confirm recovery codes are regenerated if required.
- Store recovery codes only in `<PASSWORD_MANAGER>` or another approved private store.
- Remove recovery methods that belong to retired devices or former users.

Never commit recovery codes, MFA backup codes, authenticator seeds, QR codes, screenshots, or device-specific secrets.

## 8. Service And Admin Account Review

For each `<SERVICE_NAME>`, review:

- who owns the account
- whether the account should be personal, shared, service, or admin
- whether the account has more privilege than needed
- whether unused accounts can be disabled
- whether service accounts have scoped credentials
- whether admin access is protected by MFA
- whether any automation depends on the account

For `<ADMIN_URL>` workflows, keep real URLs private if they reveal internal or sensitive access paths.

## 9. Post-Change Verification Checklist

After updating credentials:

- Log out and log back in through the normal path.
- Confirm MFA still works.
- Confirm the password manager item opens and autofills correctly.
- Confirm recovery email and notifications work.
- Confirm expected admin or service actions still work.
- Confirm no stale token or password remains in local notes.
- Confirm no tracked docs contain real values.
- Confirm no `.env` files, runtime secrets, cookies, sessions, or CSRF values were copied into Git.
- Confirm any private ignored notes were updated if needed.

If production, deployment, CI, or automation depends on the credential, perform a separate approved verification plan before assuming the rotation is complete.

## 10. What Belongs In Private Ignored Notes

Private ignored notes may contain operator-specific details when necessary:

- exact account usernames
- exact account email addresses
- password manager item references
- private service URLs
- private admin URLs
- private server hostnames
- private deploy usernames
- rotation dates and operator notes
- recovery process notes

Private notes must remain ignored. Do not copy their contents into public tracked docs.

## 11. Troubleshooting

If login fails after a credential update:

- Confirm the correct `<SERVICE_NAME>` is being accessed.
- Confirm the password manager item was updated.
- Confirm browser autofill is not using a stale credential.
- Confirm MFA is using the correct device.
- Confirm the username or email did not change unexpectedly.
- Confirm the account is not locked or disabled.
- Confirm recovery email access is available.
- Confirm any service account or automation credential was updated separately.

Do not troubleshoot by pasting passwords, tokens, cookies, session IDs, CSRF values, reset links, or recovery codes into chat or tracked docs.

## 12. Redaction Note

This file was sanitized to remove project-specific account, credential, server, and command details.

Future updates must keep this file placeholder-only. If exact operator details are needed, store them in `<PASSWORD_MANAGER>` or private ignored notes instead of tracked documentation.
