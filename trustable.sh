#!/bin/bash
# Install script for Trustable AI (Linux/Mac)

OPS_REPO="https://github.com/nuvolaris/bestia"
OPS_BRANCH="bestia"

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH."
    echo "Please install Docker Desktop from https://www.docker.com"
    exit 1
fi
echo "Docker check passed."

# Set environment variables (avoid adding multiple times)
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

# Open firewall (Linux only, skip for macOS)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo ""
    read -p "I need your authorization to open the firewall to a local web server to run the application. Confirm? (y/N) " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        if command -v ufw &> /dev/null; then
            sudo ufw allow 80/tcp
            echo "Firewall rule added via ufw."
        elif command -v firewall-cmd &> /dev/null; then
            sudo firewall-cmd --add-port=80/tcp --permanent
            sudo firewall-cmd --reload
            echo "Firewall rule added via firewalld."
        elif command -v iptables &> /dev/null; then
            sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
            echo "Firewall rule added via iptables."
        else
            echo "WARNING: Could not detect firewall tool. Please open port 80 manually."
        fi
    else
        echo "Skipped firewall configuration."
    fi
fi

# Download ops
echo "Downloading ops..."
curl -fsSL n7s.co/get-ops | bash


# Initialize
export PATH=~/.local/bin:$PATH
ops -t

# Install plugin
echo "Installing Trustable Plugin..."
ops -plugin https://github.com/trustable-ai/olaris-trustable

# Notify download
ops trustable notify MSG=Download

echo ""
echo "=================================================="
echo " Please reopen this terminal before using ops."
echo " Install Trustable with: 'ops trustable setup'"
echo " For more information and bug reports:"
echo " https://github.com/trustable-ai"
echo "=================================================="
echo ""
read -p "Press Enter to exit..."
