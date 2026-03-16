#!/bin/bash
# Install script for Trustable AI

OPS_REPO="https://github.com/nuvolaris/bestia"
OPS_BRANCH="bestia"

# Detect OS and set environment variables
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - add to .bashrc and .zshrc
    for rcfile in "$HOME/.bashrc" "$HOME/.zshrc"; do
        grep -q "OPS_REPO=" "$rcfile" 2>/dev/null && sed -i '' '/OPS_REPO=/d' "$rcfile"
        grep -q "OPS_BRANCH=" "$rcfile" 2>/dev/null && sed -i '' '/OPS_BRANCH=/d' "$rcfile"
        echo "export OPS_REPO=\"$OPS_REPO\"" >> "$rcfile"
        echo "export OPS_BRANCH=\"$OPS_BRANCH\"" >> "$rcfile"
    done
    echo "Environment variables added to ~/.bashrc and ~/.zshrc"
else
    # Linux - add to .bashrc and .profile
    for rcfile in "$HOME/.bashrc" "$HOME/.profile"; do
        grep -q "OPS_REPO=" "$rcfile" 2>/dev/null && sed -i '/OPS_REPO=/d' "$rcfile"
        grep -q "OPS_BRANCH=" "$rcfile" 2>/dev/null && sed -i '/OPS_BRANCH=/d' "$rcfile"
        echo "export OPS_REPO=\"$OPS_REPO\"" >> "$rcfile"
        echo "export OPS_BRANCH=\"$OPS_BRANCH\"" >> "$rcfile"
    done
    echo "Environment variables added to ~/.bashrc and ~/.profile"
fi

# Export for current session
export OPS_REPO
export OPS_BRANCH

# Download ops
echo "Downloading ops..."
curl -fsSL n7s.co/get-ops | bash

# Initialize and install plugin
ops -t
ops -plugin https://github.com/trustable-ai/olaris-trustable

echo ""
echo "============================================"
echo "  Please close this terminal before using ops."
echo "============================================"
echo ""
read -n 1 -s -r -p "Press any key to exit..."
echo ""
