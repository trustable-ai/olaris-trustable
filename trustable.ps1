# Install script for Trustable AI (Windows)

$OPS_REPO = "https://github.com/nuvolaris/bestia"
$OPS_BRANCH = "bestia"

# Set system environment variables
[System.Environment]::SetEnvironmentVariable("OPS_REPO", $OPS_REPO, "User")
[System.Environment]::SetEnvironmentVariable("OPS_BRANCH", $OPS_BRANCH, "User")

Write-Host "Environment variables OPS_REPO and OPS_BRANCH set for current user."

# Set for current session too
$env:OPS_REPO = $OPS_REPO
$env:OPS_BRANCH = $OPS_BRANCH

# Download ops (run in child process so its exit doesn't kill this script)
Write-Host "Downloading ops..."
powershell -NoProfile -Command "irm n7s.co/get-ops-exe | iex"

# Initialize and install plugin
Write-Host "Current Nuvolaris Server:"
ops util apihost
Write-Host "Installing Trustable Plugin"
ops -plugin https://github.com/trustable-ai/olaris-trustable

Write-Host ""
Write-Host "=============================================="
Write-Host " Please reopen this terminal before using ops."
Write-Host " Install Trustable with: 'ops trustable setup'"
Write-Host "=============================================="
Write-Host ""
