#!/bin/bash
# Setup 1Password CLI for Cursor/VS Code integration
# This script configures 1Password CLI to work seamlessly with Cursor

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up 1Password CLI integration...${NC}"
echo ""
echo -e "${YELLOW}Note: Make sure 1Password app integration is enabled:${NC}"
echo "  1. Open 1Password app"
echo "  2. Settings > Security > Enable Touch ID"
echo "  3. Settings > Developer > Enable 'Integrate with 1Password CLI'"
echo ""

# Check if 1Password CLI is installed
if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI is not installed.${NC}"
    echo "Install it from: https://developer.1password.com/docs/cli/get-started"
    exit 1
fi

echo -e "${GREEN}✓ 1Password CLI found: $(op --version)${NC}"

# Check if already signed in
if op whoami &> /dev/null; then
    echo -e "${GREEN}✓ Already signed in to 1Password${NC}"
    op whoami
else
    echo -e "${YELLOW}⚠ Not signed in. Please sign in now...${NC}"
    echo ""
    echo "You'll be prompted to:"
    echo "1. Select your account (my.1password.com)"
    echo "2. Enter your master password"
    echo "3. Authorize with Touch ID"
    echo ""
    read -p "Press Enter to continue with sign-in..."
    
    op signin
fi

# Verify sign-in
if op whoami &> /dev/null; then
    echo -e "${GREEN}✓ Successfully signed in!${NC}"
    ACCOUNT=$(op account list | tail -n +2 | awk '{print $1}')
    echo "Account: $ACCOUNT"
else
    echo -e "${RED}✗ Sign-in failed. Please try again manually: op signin${NC}"
    exit 1
fi

# Create .op directory for session caching
mkdir -p ~/.op
echo -e "${GREEN}✓ Created ~/.op directory for session caching${NC}"

# Set up environment variable for session (optional, helps with caching)
if ! grep -q "OP_SESSION" ~/.zshrc 2>/dev/null; then
    echo ""
    echo -e "${YELLOW}To enable session caching, add this to your ~/.zshrc:${NC}"
    echo "# 1Password CLI session caching"
    echo "# export OP_SESSION_my=\$(op signin my.1password.com --raw 2>/dev/null || echo \"\")"
    echo ""
    echo "Note: This is optional. The CLI will handle sessions automatically."
fi

# Check Cursor/VS Code settings
CURSOR_SETTINGS="$HOME/Library/Application Support/Cursor/User/settings.json"
VSCODE_SETTINGS="$HOME/Library/Application Support/Code/User/settings.json"

echo ""
echo -e "${GREEN}Checking Cursor/VS Code settings...${NC}"

if [ -f "$CURSOR_SETTINGS" ]; then
    echo -e "${GREEN}✓ Found Cursor settings${NC}"
    if grep -q "1password" "$CURSOR_SETTINGS" 2>/dev/null; then
        echo -e "${GREEN}✓ 1Password extension settings found${NC}"
    else
        echo -e "${YELLOW}⚠ 1Password extension may need configuration${NC}"
    fi
fi

if [ -f "$VSCODE_SETTINGS" ]; then
    echo -e "${GREEN}✓ Found VS Code settings${NC}"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Restart Cursor to apply changes"
echo "2. The 1Password extension should now use your CLI session"
echo "3. You should only need to authorize once per session"
echo ""
echo "To test the setup:"
echo "  op whoami"
echo "  op item list"
echo ""

