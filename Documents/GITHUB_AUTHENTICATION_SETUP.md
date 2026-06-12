# GitHub Authentication Setup

This document is a public-safe guide for GitHub authentication patterns. It uses placeholders only and must not contain live secrets, private key paths, private usernames, personal machine paths, private server details, or account-specific credential history.

## 1. Purpose

Use this guide when setting up or troubleshooting Git access for this repository or a future repository.

It explains the safe concepts behind:

- GitHub SSH authentication
- GitHub HTTPS authentication with a personal access token
- local credential helpers
- deploy keys
- SSH agent forwarding at a conceptual level

Real credentials belong in a password manager, keychain, or private ignored notes. They do not belong in tracked repository documentation.

## 2. Safety Rules

Never commit:

- real personal access tokens
- passwords or passphrases
- private keys or private key contents
- recovery codes or backup codes
- real machine-specific paths
- private server names, users, IPs, or access details
- command history that exposes credential material
- password manager item names that reveal private structure

Use placeholders in tracked documentation:

- `<GITHUB_USERNAME>`
- `<REPO_OWNER>`
- `<REPO_NAME>`
- `<SSH_KEY_PATH>`
- `<GITHUB_PAT>`
- `<KEYCHAIN_OR_PASSWORD_MANAGER>`
- `<DEPLOY_USER>`
- `<SERVER_HOST>`

Generic examples such as `~/.ssh/id_ed25519` are acceptable when they are clearly examples and not project-specific paths.

## 3. Recommended Public-Safe Authentication Options

Prefer SSH for day-to-day Git operations when the user controls a local key and GitHub has the matching public key.

Use HTTPS with a personal access token only when SSH is not appropriate or when a tool requires HTTPS.

Use deploy keys for machine or server access to a specific repository. Deploy keys should be scoped narrowly and documented with placeholders in tracked docs.

Use private ignored notes for exact operator details such as key names, host aliases, private server access, or password manager item references.

## 4. SSH Authentication Placeholder Workflow

1. Confirm the repository remote uses SSH:

   ```bash
   git remote -v
   ```

   Expected shape:

   ```text
   origin  git@github.com:<REPO_OWNER>/<REPO_NAME>.git (fetch)
   origin  git@github.com:<REPO_OWNER>/<REPO_NAME>.git (push)
   ```

2. If the remote uses HTTPS and SSH is intended, update it with placeholders:

   ```bash
   git remote set-url origin git@github.com:<REPO_OWNER>/<REPO_NAME>.git
   ```

3. Add the public key to GitHub:

   - Account-level key: useful when one local identity should access multiple repositories.
   - Repository deploy key: useful when a key should access only one repository.

   Do not paste public or private key material into tracked docs.

4. Optional local SSH config shape:

   ```text
   Host github.com
     HostName github.com
     User git
     IdentityFile <SSH_KEY_PATH>
     IdentitiesOnly yes
   ```

   Keep the real `<SSH_KEY_PATH>` in private local configuration or private ignored notes, not tracked docs.

5. Test authentication:

   ```bash
   ssh -T git@github.com
   git fetch origin
   ```

   Do not paste private error output into tracked docs if it includes account, host, path, or key details.

## 5. HTTPS / Personal Access Token Placeholder Workflow

When HTTPS is required, the remote shape is:

```text
https://github.com/<REPO_OWNER>/<REPO_NAME>.git
```

Use a GitHub personal access token as the password when GitHub prompts for authentication.

Store the token in `<KEYCHAIN_OR_PASSWORD_MANAGER>` or a supported credential helper. Do not put the token in:

- tracked docs
- shell history
- remote URLs
- `.env` files committed to Git
- screenshots or logs

Safe placeholder reference:

```text
<GITHUB_PAT>
```

Do not document the real token, token prefix, token suffix, scope list, or expiration date if that combination could identify a live credential.

## 6. Local Credential Helpers

Credential helpers can store HTTPS credentials locally.

Conceptual examples:

```bash
git config --global credential.helper <CREDENTIAL_HELPER>
```

Use the operating system keychain, Git Credential Manager, or another approved private credential store. Do not document the stored values in tracked repository files.

If authentication behaves unexpectedly, inspect credential-helper configuration without printing saved token values.

## 7. Deploy Key Concept

A deploy key is an SSH key associated with one GitHub repository.

Use deploy keys when:

- a server or automation needs access to one repository
- access should be narrower than a full user account
- read-only access is enough, unless write access is explicitly required

Placeholder-only deploy key notes:

```text
Repository: <REPO_OWNER>/<REPO_NAME>
Key role: <READ_ONLY_OR_WRITE_DEPLOY_KEY>
Stored in: <KEYCHAIN_OR_PASSWORD_MANAGER>
Server user: <DEPLOY_USER>
Server host: <SERVER_HOST>
```

Do not track the real private key, public key body, fingerprint, server hostname, server IP, username, or password manager item name unless the user explicitly approves a private ignored note.

## 8. Agent Forwarding Concept

SSH agent forwarding can allow a remote host to use a local SSH agent for a GitHub operation. This can be useful, but it expands the trust boundary for that session.

Tracked docs may explain the concept, but exact server commands, usernames, hostnames, key names, and session details belong in private ignored notes.

Before using agent forwarding:

- confirm the host is trusted
- confirm the purpose and duration
- avoid leaving long-lived sessions open
- avoid documenting private connection details in tracked files

## 9. What Belongs In Private Ignored Notes

Private ignored notes may contain operator-specific details when needed, such as:

- exact SSH key filenames
- exact SSH host aliases
- exact deploy usernames
- exact server hostnames or IPs
- password manager item references
- account-specific troubleshooting history
- one-time migration or recovery notes

Those notes must stay ignored and must not be copied into public tracked docs.

## 10. Verification Checklist

Use this checklist with placeholders:

- `git remote -v` shows the intended remote type.
- SSH remotes use `git@github.com:<REPO_OWNER>/<REPO_NAME>.git`.
- HTTPS remotes use `https://github.com/<REPO_OWNER>/<REPO_NAME>.git`.
- The required public key is added to GitHub or to the repository deploy keys.
- The local SSH config points to the intended key path without exposing it in tracked docs.
- `ssh -T git@github.com` succeeds for SSH workflows.
- `git fetch origin` succeeds.
- No tokens, passwords, private keys, machine paths, or private server details are copied into documentation.

## 11. Troubleshooting Checklist

If authentication fails:

- Confirm the remote URL type.
- Confirm whether the workflow is SSH or HTTPS.
- Confirm the key or token exists in a private credential store.
- Confirm the GitHub account or repository has the matching public key or deploy key.
- Confirm local SSH config uses the intended host alias and key.
- Confirm deploy keys have write access only when pushing is required.
- Confirm the credential helper is not using a stale HTTPS token.
- Keep all real credential values out of chat, logs, screenshots, and tracked docs.

## 12. Redaction Note

This file was sanitized to remove project-specific account, key, server, and credential workflow details.

Future updates must keep this file placeholder-only. If exact operator details are needed, put them in a private ignored note or credential manager instead of this tracked document.
