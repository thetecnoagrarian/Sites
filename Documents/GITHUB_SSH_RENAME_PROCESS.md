# GitHub SSH Key Rename Process

## ✅ Current Status: Keys Prepared and Ready

Your authentication is working perfectly. The keys have been retrieved and are ready for manual GitHub updates.

## Current Situation
- GitHub doesn't allow renaming SSH keys through their UI
- Solution: Delete old keys, upload with new names
- **Status**: Keys retrieved ✓, Ready for manual GitHub steps

## Keys to Replace

### 1. "Personal MacBook Key" → "TTA-MacBook-Deploy-Key-2025"
- **Old GitHub Key Name**: Personal MacBook Key
- **Fingerprint**: `SHA256:B3Ab3+nEj7iFfNaefpgNFPPUZNSVWt2X9QSMqTxsTJs`
- **New Public Key**: `~/.ssh/TTA-MacBook-Deploy-Key-2025.pub`
- **Local File**: Already created at `~/.ssh/id_ed25519_tta.pub`

### 2. "Linode Server Deploy - New Setup" → "TTA-Linode-Deploy-Key-2025"
- **Old GitHub Key Name**: Linode Server Deploy - New Setup  
- **Fingerprint**: `SHA256:XJQiXEgpuEZX5lA8Rzm5yVcI9dWUZb4jIDp6VX/bhrQ`
- **Server Path**: `~/.ssh/id_ed25519_new.pub`
- **Public Key**: 
  ```
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMdrhPR+lacmumZ50eS0DesIOYJRY6/+Kbes/He28h5+ deploy@linode-server-new
  ```

## Steps to Execute

### Step 1: On Local Machine
```bash
cd ~/.ssh
cat TTA-MacBook-Deploy-Key-2025.pub
```

Copy this public key to clipboard.

### Step 2: On GitHub (thetecnoagrarian account)
1. Go to: https://github.com/settings/keys
2. Find "Personal MacBook Key" (fingerprint: B3Ab3+n)
3. Click "Delete" button
4. Click "New SSH key" button
5. Title: `TTA-MacBook-Deploy-Key-2025`
6. Key type: Authentication Key
7. Key: Paste the public key
8. Click "Add SSH key"

### Step 3: On Server (via SSH)
```bash
ssh deploy@172.236.119.220 "cat ~/.ssh/id_ed25519_new.pub"
```

Copy this public key to clipboard.

### Step 4: On GitHub (thetecnoagrarian account)
1. Go to: https://github.com/settings/keys
2. Find "Linode Server Deploy - New Setup" (fingerprint: XJQiXEg)
3. Click "Delete" button
4. Click "New SSH key" button
5. Title: `TTA-Linode-Deploy-Key-2025`
6. Key type: Authentication Key
7. Key: Paste the public key
8. Click "Add SSH key"

### Step 5: Test Authentication
```bash
ssh -T git@github.com
# Should see: "Hi thetecnoagrarian! You've successfully authenticated..."
```

## Important Notes
- The keys themselves don't change (same fingerprints)
- Only the names change on GitHub
- No need to change SSH config files
- Authentication will continue to work seamlessly

## After Completion
✅ Both keys renamed on GitHub
✅ Authentication tested and working
✅ All keys properly organized