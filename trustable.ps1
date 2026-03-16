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

# Download ops
Write-Host "Downloading ops..."
irm n7s.co/get-ops-exe | iex

# Initialize and install plugin
ops -t
ops -plugin https://github.com/trustable-ai/olaris-trustable

Write-Host ""
Write-Host "============================================"
Write-Host "  Please close this terminal before using ops."
Write-Host "============================================"
Write-Host ""
Read-Host "Press Enter to exit"
