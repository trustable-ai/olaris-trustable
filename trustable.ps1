# Install script for Trustable AI (Windows)

$OPS_REPO = "https://github.com/nuvolaris/bestia"
$OPS_BRANCH = "bestia"

# Check for at least 16 GB of RAM
$totalMemoryGB = [math]::Round((Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
if ($totalMemoryGB -lt 16) {
    Write-Host "ERROR: This system has ${totalMemoryGB} GB of RAM. At least 16 GB is required." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "RAM check passed: ${totalMemoryGB} GB detected."

# Check Docker is available
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Docker check passed."

# Set system environment variables
[System.Environment]::SetEnvironmentVariable("OPS_REPO", $OPS_REPO, "User")
[System.Environment]::SetEnvironmentVariable("OPS_BRANCH", $OPS_BRANCH, "User")

# Set for current session too
$env:OPS_REPO = $OPS_REPO
$env:OPS_BRANCH = $OPS_BRANCH

Write-Host "Environment variables OPS_REPO and OPS_BRANCH set for current user."

# Download ops (run in child process so its exit doesn't kill this script)
Write-Host "Downloading ops..."
powershell -NoProfile -Command "irm n7s.co/get-ops-exe | iex"

# Ensure variables are set and initialize
ops -t

# Install plugin
Write-Host "Installing Trustable Plugin..."
ops -plugin https://github.com/trustable-ai/olaris-trustable

Write-Host ""
Write-Host "================================================"
Write-Host " Please reopen this terminal before using ops."
Write-Host " Install Trustable with: 'ops trustable setup'"
Write-Host " For more information and bug reports:"
Write-Host " https://github.com/trustable-ai/support"
Write-Host "================================================"
Read-Host "Press Enter to exit"
