# Install script for Trustable AI (Windows)

$OPS_REPO = "https://github.com/nuvolaris/bestia"
$OPS_BRANCH = "bestia"

# Check Docker is available
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Docker check passed."

# Set system environment variables (User level)
[System.Environment]::SetEnvironmentVariable("OPS_REPO", $OPS_REPO, "User")
[System.Environment]::SetEnvironmentVariable("OPS_BRANCH", $OPS_BRANCH, "User")

# Set for current session too
$env:OPS_REPO = $OPS_REPO
$env:OPS_BRANCH = $OPS_BRANCH

Write-Host "Environment variables OPS_REPO and OPS_BRANCH set for current user."

# Open firewall for localhost:80
$confirm = Read-Host "I need your authorization to open the firewall to a local web server to run the application. Confirm? (y/N)"
if ($confirm -match '^[Yy]$') {
    Start-Process powershell -Verb RunAs -ArgumentList `
        "New-NetFirewallRule -DisplayName 'Trustable' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow"
    Write-Host "Firewall rule added for port 80."
} else {
    Write-Host "Skipped firewall configuration."
}

# Download ops (run in child process so its exit doesn't kill this script)
Write-Host "Downloading ops..."
powershell -NoProfile -Command "irm n7s.co/get-ops-exe | iex"

# Ensure variables are set and initialize
ops -t

# Install plugin
Write-Host "Installing Trustable Plugin..."
ops -plugin https://github.com/trustable-ai/olaris-trustable

# Notify download
ops trustable notify MSG=Download

Write-Host ""
Write-Host "=================================================="
Write-Host " Please reopen this terminal before using ops."
Write-Host " Install Trustable with: 'ops trustable setup'"
Write-Host " For more information and bug reports:"
Write-Host " https://github.com/trustable-ai"
Write-Host "=================================================="
Read-Host "Press Enter to exit"
