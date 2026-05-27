# GitHub Authentication Setup (thetecnoagrarian Account)

**Purpose**: Fix authentication when using the **thetecnoagrarian** GitHub account—especially for a **new repo** or a second project. Use this for this project and share with the other project.

---

## Do this now (new repo not working)

1. **Get your public key** (run on your Mac):
   ```bash
   cat ~/.ssh/id_ed25519_tta.pub
   ```
   Copy the whole line.

2. **Add it to GitHub** (pick one):
   - **Account (recommended)**  
     GitHub → Profile → **Settings** → **SSH and GPG keys** → **New SSH key** → paste key, save.  
     Then it works for **all** thetecnoagrarian repos, including new ones.
   - **This repo only**  
     Open the **new repo** → **Settings** → **Deploy keys** → **Add deploy key** → paste key, check **Allow write access** if you push, save.

3. **Use SSH remote** (in the new repo folder):
   ```bash
   git remote set-url origin git@github.com:thetecnoagrarian/YOUR_NEW_REPO_NAME.git
   ```
   Replace `YOUR_NEW_REPO_NAME` with the actual repo name.

4. **Test**:
   ```bash
   ssh -T git@github.com
   git fetch origin
   ```
   If both succeed, authentication is fixed.

---

## Quick summary

- **GitHub account**: `thetecnoagrarian`
- **SSH key used for GitHub from this Mac**: `~/.ssh/id_ed25519_tta` (TTA-MacBook-Deploy-Key-2025)
- **New repo**: You must add this same **public key** to the new repo (or to the account once). Below is the full flow.

---

## Option A: One key for all repos (recommended)

Add your SSH public key to your **GitHub account** (not per-repo). Then it works for every repo under `thetecnoagrarian`, including new ones.

### 1. Get your public key

```bash
cat ~/.ssh/id_ed25519_tta.pub
```

Copy the full line (starts with `ssh-ed25519`, ends with your email or label).

### 2. Add it to thetecnoagrarian GitHub account

1. Log in to **GitHub** as **thetecnoagrarian**.
2. Click your profile picture → **Settings**.
3. Left sidebar: **SSH and GPG keys**.
4. Click **New SSH key**.
5. **Title**: e.g. `TTA-MacBook-Deploy-Key-2025`.
6. **Key type**: Authentication Key.
7. **Key**: Paste the output of `cat ~/.ssh/id_ed25519_tta.pub`.
8. Click **Add SSH key**.

After this, **any new repo** under thetecnoagrarian will work with `git push` / `git pull` from this Mac. No per-repo step needed.

---

## Option B: Deploy key per repo (if you don’t use account key)

If you only use **deploy keys** (one key per repo), each **new repo** needs the same key added.

### 1. Get your public key

```bash
cat ~/.ssh/id_ed25519_tta.pub
```

Copy the full line.

### 2. Add it to the new repo as a deploy key

1. Open the **new repo** on GitHub (e.g. `thetecnoagrarian/YourNewRepo`).
2. **Settings** → **Deploy keys** (in the left sidebar).
3. **Add deploy key**.
4. **Title**: e.g. `TTA-MacBook-Deploy-Key-2025`.
5. **Key**: Paste the public key.
6. If this machine will push (not just pull): check **Allow write access**.
7. **Add key**.

Repeat for every new repo you create.

---

## Make sure Git uses SSH (and the right key)

### 1. Remote URL must be SSH

```bash
git remote -v
```

You want:

- `origin  git@github.com:thetecnoagrarian/REPO_NAME.git  (fetch)`
- `origin  git@github.com:thetecnoagrarian/REPO_NAME.git  (push)`

If you see `https://github.com/...` instead:

```bash
git remote set-url origin git@github.com:thetecnoagrarian/REPO_NAME.git
```

Replace `REPO_NAME` with the actual repo name (e.g. `Sites`, or your new repo).

### 2. SSH config so GitHub uses the TTA key

Your Mac should use the TTA key for `github.com`. In `~/.ssh/config` you want:

```
Host github.com
  IdentityFile ~/.ssh/id_ed25519_tta
  IdentitiesOnly yes
```

If you have multiple GitHub accounts, you can use a host alias (see “Multiple GitHub accounts” below).

---

## Test authentication

```bash
ssh -T git@github.com
```

Expected:

- `Hi thetecnoagrarian/...! You've successfully authenticated...`  
  → SSH is working for that account.
- `Permission denied (publickey)`  
  → Key not added to account or repo, or wrong key used (check `~/.ssh/config` and that you added the key from `id_ed25519_tta.pub`).

Then in your repo:

```bash
git fetch origin
# or
git push origin main
```

If those work, authentication is fixed.

---

## Checklist for a new repo (this project or the other)

- [ ] Public key added to **thetecnoagrarian** (either **account** SSH key or **deploy key** on the new repo).
- [ ] Remote is SSH: `git@github.com:thetecnoagrarian/REPO_NAME.git`.
- [ ] `~/.ssh/config` has `Host github.com` and `IdentityFile ~/.ssh/id_ed25519_tta`.
- [ ] `ssh -T git@github.com` succeeds.
- [ ] `git fetch` or `git push` works in the repo.

---

## Multiple GitHub accounts (optional)

If you use **thetecnoagrarian** for some repos and another account (e.g. fruitionforestgarden) for others:

1. In `~/.ssh/config` define a host alias for thetecnoagrarian:

   ```
   Host github.com-thetecnoagrarian
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_ed25519_tta
     IdentitiesOnly yes
   ```

2. Use that host in the remote URL for TTA repos:

   ```bash
   git remote set-url origin git@github.com-thetecnoagrarian:thetecnoagrarian/REPO_NAME.git
   ```

3. Other account: use a different host and key in `~/.ssh/config`, and set that repo’s remote to the matching host.

---

## Server (Linode) and 1Password

- **This Mac**: Uses `~/.ssh/id_ed25519_tta` for GitHub (and optionally 1Password for other things).
- **Server**: Uses either:
  - **SSH agent forwarding** from your Mac (1Password / TTA key), or  
  - A **server deploy key** (e.g. TTA-Linode-Deploy-Key-2025) added to the repo or account.

If the server runs `git pull` and you use agent forwarding, the server uses your Mac’s key. No extra key on the server is needed for GitHub. If you don’t use forwarding, add the server’s public key to thetecnoagrarian (account or deploy key) and use that on the server.

---

## Summary for “the other project”

1. **Same GitHub account (thetecnoagrarian)**  
   Add the same public key (`~/.ssh/id_ed25519_tta.pub`) to the account **or** to that repo’s deploy keys.

2. **Same Mac**  
   Keep `Host github.com` and `IdentityFile ~/.ssh/id_ed25519_tta` in `~/.ssh/config`. Use SSH remote: `git@github.com:thetecnoagrarian/REPO_NAME.git`.

3. **Test**  
   `ssh -T git@github.com` then `git fetch` / `git push` in the new repo.

4. **New repo**  
   No new key is required if the key is already on the **account**. If you only use **deploy keys**, add the same key to the new repo as a deploy key with write access if you push from that Mac.

This document is the single place to follow for fixing authentication for this project and for informing the other project.
