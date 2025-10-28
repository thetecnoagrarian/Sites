# 1Password SSH Key Update Guide

## Current Situation

Looking at your 1Password screenshot, you have these 4 SSH keys:

### Keys Currently in 1Password:
1. **`id_ed25519_tta`** (Oct 2025)
   - Fingerprint: `B3Ab3+nEj7iFfNaefpgNFPPUZNSVWt2X9QSMqTxsTJs`
   - **KEEP**: This is your local MacBook key
   - **ACTION**: Rename to `TTA-MacBook-Deploy-Key-2025`

2. **`TTAGitHubSSH Key`** (Oct 2025) - Currently selected
   - Fingerprint: `XJQIXEgpuEZX5IA8Rzm5yVcl9dWUZb4jIDp6VX/bhrQ`
   - **KEEP**: This is your server/Linode key
   - **ACTION**: Rename to `TTA-Linode-Deploy-Key-2025`

3. **`Deploy Key - Fruition Forest Garden - June 2024`** (Sep 2025)
   - Fingerprint: `3qfSL6sWyeXq1YTMFHrHilVeXcmYzrMyA0getVCUMcg`
   - **DELETE**: This old key is no longer used

4. **`local github_ed25519`** (Jun 2025)
   - Fingerprint: `TEsqTPJ8b4jDStmprlhOqUSEumsmk6nwltD7uwKVyYQ`
   - **DELETE**: This old key is no longer used

---

## How to Update in 1Password

### Step 1: Delete Old Keys

For each key marked DELETE:
1. Right-click on the key in the left panel
2. Select "Delete" or "Move to Trash"
3. Confirm deletion

**Keys to DELETE:**
- `Deploy Key - Fruition Forest Garden - June 2024`
- `local github_ed25519`

### Step 2: Rename Existing Keys

For each key to keep, just update the title:

**RENAME:**
1. `id_ed25519_tta` → `TTA-MacBook-Deploy-Key-2025`
2. `TTAGitHubSSH Key` → `TTA-Linode-Deploy-Key-2025`

**TO RENAME A KEY:**
1. Click on the key in the left panel
2. Click "Edit" or double-click the title at the top
3. Change the name
4. Save

---

## Final 1Password State

After cleanup, you should have exactly **2 SSH keys**:

### Keys to Keep (2):
1. ✅ **`TTA-MacBook-Deploy-Key-2025`** (your MacBook)
   - Fingerprint: `B3Ab3+nEj7iFfNaefpgNFPPUZNSVWt2X9QSMqTxsTJs`

2. ✅ **`TTA-Linode-Deploy-Key-2025`** (your server)
   - Fingerprint: `XJQIXEgpuEZX5IA8Rzm5yVcl9dWUZb4jIDp6VX/bhrQ`

### Keys to Delete (2):
1. ❌ `Deploy Key - Fruition Forest Garden - June 2024`
2. ❌ `local github_ed25519`

---

## Important Notes

- **Keep the passphrases** - Don't change them, just rename the keys
- **No need to regenerate keys** - The keys themselves are fine, just the names need updating
- **This matches your GitHub cleanup** - 1Password will mirror your GitHub key names
- **Your MacBook key** (`id_ed25519_tta`) is the one being authenticated to GitHub
- **Your server key** (`TTAGitHubSSH Key`) is the one on your Linode server

---

## Verification

After updating:
1. Your 1Password will have 2 keys with clear, descriptive names
2. Your GitHub will have 2 authentication keys with matching names
3. Your server will have 1 active key with proper config
4. Everything will be consistent and organized! ✨
