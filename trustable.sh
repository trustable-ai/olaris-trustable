#!/bin/bash
# Install script for Trustable AI (Linux/Mac)

OPS_REPO="https://github.com/nuvolaris/bestia"
OPS_BRANCH="bestia"

# Check for at least 16 GB of RAM
if [[ "$OSTYPE" == "darwin"* ]]; then
    TOTAL_MEM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
else
    TOTAL_MEM_GB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1048576 ))
fi

if [ "$TOTAL_MEM_GB" -lt 16 ]; then
    echo "ERROR: This system has ${TOTAL_MEM_GB} GB of RAM. At least 16 GB is required."
    exit 1
fi
echo "RAM check passed: ${TOTAL_MEM_GB} GB detected."

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH."
    echo "Please install Docker Desktop from https://www.docker.com"
    exit 1
fi
echo "Docker check passed."

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

# Initialize
ops -t

# Install plugin
echo "Installing Trustable Plugin..."
ops -plugin https://github.com/trustable-ai/olaris-trustable

echo ""
echo "================================================"
echo " Please reopen this terminal before using ops."
echo " Install Trustable with: 'ops trustable setup'"
echo " For more information and bug reports:"
echo " https://github.com/trustable-ai/support"
echo "================================================"
echo ""
read -p "Press Enter to exit..."
