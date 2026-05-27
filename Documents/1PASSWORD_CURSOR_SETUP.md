# 1Password CLI Setup for Cursor

## Problem
Cursor is requesting 1Password authorization 4-6 times when opening, and if you don't authorize in time, you get errors. This happens because:
1. 1Password CLI is not signed in
2. Multiple services (SSH agent, Git signing, Cursor extension) are trying to authenticate
3. Session caching is not configured

## Solution

### Prerequisites: Enable 1Password App Integration
Before running the setup, make sure 1Password desktop app integration is enabled:

1. **Open the 1Password app**
2. **Go to Settings > Security** and turn on Touch ID (or Windows Hello/Linux system auth)
3. **Go to Settings > Developer** and enable "Integrate with 1Password CLI"

This allows the CLI to use your desktop app for authentication instead of requiring separate credentials.

### Step 1: Run the Setup Script
```bash
chmod +x scripts/setup-1password-cli.sh
./scripts/setup-1password-cli.sh
```

This script will:
- Check if 1Password CLI is installed
- Sign you in to 1Password CLI
- Set up session caching
- Verify the configuration

### Step 2: Sign In to 1Password CLI
If the script prompts you to sign in, you'll be shown an interactive menu:
- **Select your account**: Choose `my.1password.com` (thetecnoagrarian@protonmail.com)
- **Master Password**: Enter your 1Password master password
- **Touch ID**: Authorize with your fingerprint

### Step 3: Verify Setup
```bash
# Check if you're signed in
op whoami

# Test accessing items (should work without prompts)
op item list
```

### Step 4: Restart Cursor
Close and reopen Cursor. You should now only need to authorize once per session.

## Manual Setup (If Script Doesn't Work)

### Sign In to 1Password CLI
```bash
op signin
```

You'll be prompted to:
1. Select your account (my.1password.com)
2. Enter your master password
3. Authorize with Touch ID

### Verify Sign-In
```bash
op whoami
```

Should output your account details.

### Check Session
```bash
op account list
```

Should show your account with a checkmark if signed in.

## Cursor/VS Code Extension Settings

The 1Password extension for Cursor/VS Code should automatically detect the CLI once you're signed in. If you still get multiple prompts:

1. **Open Cursor Settings** (Cmd+,)
2. **Search for "1Password"**
3. **Check these settings:**
   - `1Password: CLI Path` should be `/opt/homebrew/bin/op` (or wherever `op` is installed)
   - `1Password: Enable CLI Integration` should be checked
   - `1Password: Vault` should be set to your vault name (e.g., "Diehl-Citoli Family")

## Troubleshooting

### Still Getting Multiple Prompts?
1. **Check if CLI is signed in:**
   ```bash
   op whoami
   ```
   If it says "not signed in", run `op signin` again.

2. **Check session expiration:**
   ```bash
   op account list
   ```
   If you see an expired session, sign in again.

3. **Restart 1Password app:**
   Sometimes the desktop app needs to be restarted to sync with CLI.

4. **Clear and re-sign:**
   ```bash
   op signout
   op signin
   ```

### "CLI is not installed" Error
1. **Verify installation:**
   ```bash
   which op
   op --version
   ```

2. **If not installed, install it:**
   ```bash
   brew install --cask 1password-cli
   ```

### Session Expires Too Quickly
1Password CLI sessions typically last 30 minutes. To extend:
- Use `op signin --raw` to get a session token
- Set it as an environment variable (see script output)

## What This Fixes

✅ **Single Authorization**: Only need to authorize once per session  
✅ **SSH Agent**: SSH keys work without repeated prompts  
✅ **Git Signing**: Git commits signed with 1Password keys  
✅ **Cursor Extension**: 1Password extension works seamlessly  
✅ **Session Caching**: CLI remembers your session for 30 minutes  

## Security Notes

- 1Password CLI sessions are encrypted and stored securely
- Sessions expire after 30 minutes of inactivity
- Touch ID is still required for sensitive operations
- Your master password is never stored by the CLI

## Related Configuration

Your SSH config already has 1Password agent configured:
```
IdentityAgent ~/Library/Group\ Containers/2BUA8C4S2C.com.1password/t/agent.sock
```

Your Git config uses 1Password for SSH signing:
```
[gpg "ssh"]
  program = "/Applications/1Password.app/Contents/MacOS/op-ssh-sign"
```

Once the CLI is signed in, all of these should work together seamlessly.

