# SSH Key Cleanup and Rename Plan

## Current Situation Analysis

### Keys on GitHub (thetecnoagrarian account):
1. **Linode Server Deploy - New Setup**
   - Fingerprint: `SHA256:XJQiXEgpuEZX5lA8Rzm5yVcI9dWUZb4jIDp6VX/bhrQ`
   - Added: Oct 6, 2025
   - Last used: Within the last week
   - Purpose: Server deployment
   - Action: **RENAME** to `TTA-Linode-Deploy-Key-2025`

2. **Personal MacBook Key**
   - Fingerprint: `SHA256:B3Ab3+nEj7iFfNaefpgNFPPUZNSVWt2X9QSMqTxsTJs`
   - Added: Oct 7, 2025
   - Last used: Within the last week
   - Purpose: Local Mac access
   - Action: **RENAME** to `TTA-MacBook-Deploy-Key-2025`

3. **MacBook Air 1Password Signing Key**
   - Fingerprint: `SHA256:TEsqTPJ8b4jDStmprlh0qUSEumsmk6nwltD7uwKVyYQ`
   - Added: Jun 8, 2025
   - Purpose: Git commit signing
   - Action: **KEEP AS IS** (only signing key)

### Keys on GitHub (fruitionforestgarden account):
1. **local github_ed25519**
   - Fingerprint: `SHA256:TEsqTPJ8b4jDStmprlhOqUSEumsmk6nwltD7uwKVyYQ`
   - Added: Jun 8, 2025
   - Last used: Within the last 5 months
   - Action: **DELETE** (no longer used, conflicts with signing key)

### Keys on Local Machine:
1. **~/.ssh/deploy_key_ffg_june2024.pub** → DELETE (only public key, not in use)
2. **~/.ssh/github_ed25519** → DELETE (old key, replaced)
3. **~/.ssh/id_ed25519_tta** → KEEP (active local key)
4. **~/.ssh/fruitionforestgarden_server_key** → KEEP (if still used for FFG)

### Keys on Server (~deploy/.ssh/):
1. **~/.ssh/id_ed25519_new** → KEEP (active server key)
2. **~/.ssh/id_ed25519_tta** → DELETE (duplicate)
3. **~/.ssh/id_ed25519** → DELETE (old key)
4. **~/.ssh/github_deploy_key** → DELETE (old key)

## Steps to Execute

### Step 1: Rename GitHub Keys
- Rename "Linode Server Deploy - New Setup" → "TTA-Linode-Deploy-Key-2025"
- Rename "Personal MacBook Key" → "TTA-MacBook-Deploy-Key-2025"

### Step 2: Delete Old GitHub Key
- Delete "local github_ed25519" from fruitionforestgarden account

### Step 3: Clean Up Local SSH Directory
- Delete ~/.ssh/deploy_key_ffg_june2024.pub
- Delete ~/.ssh/github_ed25519
- Delete ~/.ssh/github_ed25519.pub

### Step 4: Clean Up Server SSH Directory
- Delete ~/.ssh/id_ed25519_tta
- Delete ~/.ssh/id_ed25519_tta.pub
- Delete ~/.ssh/id_ed25519
- Delete ~/.ssh/id_ed25519.pub
- Delete ~/.ssh/github_deploy_key
- Delete ~/.ssh/config.backup

### Step 5: Update SSH Config Files
- Local: ~/.ssh/config (already correct)
- Server: ~/.ssh/config (already correct)

## Post-Cleanup Verification

After cleanup, verify:
1. GitHub authentication still works
2. Server deployment still works
3. Only essential keys remain
4. All keys properly named
