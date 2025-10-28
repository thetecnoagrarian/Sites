# SSH Key Management - Manual GitHub Steps

## ✅ **COMPLETED: Local and Server Cleanup**
- Removed old local SSH keys ✓
- Removed old server SSH keys ✓
- Created new public key file: `TTA-MacBook-Deploy-Key-2025.pub` ✓
- Verified GitHub authentication working ✓

## 📋 **YOUR MANUAL STEPS ON GITHUB**

### Step 1: Rename "Personal MacBook Key"
**Location**: https://github.com/settings/keys (thetecnoagrarian account)

1. Find the key named **"Personal MacBook Key"**
   - Fingerprint: `SHA256:B3Ab3+nEj7iFfNaefpgNFPPUZNSVWt2X9QSMqTxsTJs`
2. Click **Delete**
3. Click **New SSH key**
4. Fill in:
   - **Title**: `TTA-MacBook-Deploy-Key-2025`
   - **Key Type**: Authentication Key
   - **Key**: 
     ```
     ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+QY1F3XIUekQmdGhryaCHbimpWqCvc1RnHGSuOVm5j deploy@thetecnoagrarian
     ```
5. Click **Add SSH key**

### Step 2: Rename "Linode Server Deploy - New Setup"
**Location**: https://github.com/settings/keys (thetecnoagrarian account)

1. Find the key named **"Linode Server Deploy - New Setup"**
   - Fingerprint: `SHA256:XJQiXEgpuEZX5lA8Rzm5yVcI9dWUZb4jIDp6VX/bhrQ`
2. Click **Delete**
3. Click **New SSH key**
4. Fill in:
   - **Title**: `TTA-Linode-Deploy-Key-2025`
   - **Key Type**: Authentication Key
   - **Key**: 
     ```
     ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMdrhPR+lacmumZ50eS0DesIOYJRY6/+Kbes/He28h5+ deploy@linode-server-new
     ```
5. Click **Add SSH key**

### Step 3: Delete "local github_ed25519"
**Location**: https://github.com/fruitionforestgarden/settings/keys

1. Find the key named **"local github_ed25519"**
   - Fingerprint: `SHA256:TEsqTPJ8b4jDStmprlhOqUSEumsmk6nwltD7uwKVyYQ`
2. Click **Delete**
3. Confirm deletion

### Step 4: Keep "MacBook Air 1Password Signing Key"
**Location**: https://github.com/settings/keys (thetecnoagrarian account)

- **DO NOT DELETE** - This key is for Git commit signing
- Fingerprint: `SHA256:TEsqTPJ8b4jDStmprlh0qUSEumsmk6nwltD7uwKVyYQ`

## ✅ **Expected Final State**

### GitHub Keys (thetecnoagrarian account):
- ✅ `TTA-MacBook-Deploy-Key-2025` (new)
- ✅ `TTA-Linode-Deploy-Key-2025` (new)
- ✅ `MacBook Air 1Password Signing Key` (unchanged)

### GitHub Keys (fruitionforestgarden account):
- ✅ No SSH keys (old "local github_ed25519" deleted)

### Local Machine:
- ✅ `id_ed25519_tta` (active)
- ✅ `id_ed25519_tta.pub` (active)
- ✅ `TTA-MacBook-Deploy-Key-2025.pub` (backup copy)

### Server:
- ✅ `id_ed25519_new` (active)
- ✅ `id_ed25519_new.pub` (active)

## 🧪 **After You Complete These Steps**

Let me know when you're done, and I'll verify that everything is working correctly!


