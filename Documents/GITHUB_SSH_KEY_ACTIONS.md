# GitHub SSH Key Management Actions

## ✅ **COMPLETED: Local & Server Cleanup**
- Removed old local keys: `deploy_key_ffg_june2024.pub`, `github_ed25519`
- Removed old server keys: `id_ed25519_tta`, `id_ed25519`, `github_deploy_key`
- Verified GitHub authentication still works ✓

## 🔄 **TODO: Manual GitHub Key Management**

### For thetecnoagrarian account (https://github.com/settings/keys):

1. **Rename Keys** (click on each key name, then click Edit):
   - "Linode Server Deploy - New Setup" → "TTA-Linode-Deploy-Key-2025"
   - "Personal MacBook Key" → "TTA-MacBook-Deploy-Key-2025"

2. **Keep**: "MacBook Air 1Password Signing Key" (used for commit signing)

### For fruitionforestgarden account (https://github.com/fruitionforestgarden/settings/keys):

1. **Delete**: "local github_ed25519" key
   - Fingerprint: `SHA256:TEsqTPJ8b4jDStmprlhOqUSEumsmk6nwltD7uwKVyYQ`
   - Last used: Within the last 5 months
   - Reason: Duplicate of signing key, no longer used

## 📝 **Final State After Cleanup**

### thetecnoagrarian Account (3 keys):
- `TTA-Linode-Deploy-Key-2025` (active server key)
- `TTA-MacBook-Deploy-Key-2025` (active local key)
- `MacBook Air 1Password Signing Key` (commit signing)

### Local Machine (~/.ssh/):
- `id_ed25519_tta` (active)
- `id_ed25519_tta.pub` (active)
- `fruitionforestgarden_server_key` (if still needed)
- `fruitionforestgarden_server_key.pub`

### Server (~deploy/.ssh/):
- `id_ed25519_new` (active)
- `id_ed25519_new.pub` (active)
- `config` (configured correctly)
- `known_hosts`

## ⚠️ **Important Notes**

- The signing key has the same fingerprint as the old "local github_ed25519" key, but serves a different purpose (commit signing vs authentication)
- All active keys are labeled clearly with their purpose
- Local config: `IdentityFile ~/.ssh/id_ed25519_tta`
- Server config: `IdentityFile ~/.ssh/id_ed25519_new`
- Both authenticate as `thetecnoagrarian`
