#Requires -Version 5.1
<#
.SYNOPSIS
    opencora distribuable build script (Windows PowerShell / pwsh)

.DESCRIPTION
    Wrapper around packages/opencode/script/build.ts that handles
    prerequisite checks, workspace install, and post-build verification.

.PARAMETER Single
    Build only for the current platform/arch (fast local dev).

.PARAMETER Baseline
    Include AVX2-baseline binary. Only meaningful when combined with -Single.

.PARAMETER SkipInstall
    Skip the cross-platform bun install step.

.PARAMETER SkipEmbedWebUi
    Skip building and embedding the Web UI.

.PARAMETER Sourcemaps
    Emit linked source maps alongside binaries.

.PARAMETER Test
    Run package-level unit tests after the build.

.EXAMPLE
    # Full cross-platform release build
    .\dist\build.ps1

.EXAMPLE
    # Fast single-platform build with tests
    .\dist\build.ps1 -Single -Test
#>
[CmdletBinding()]
param(
    [switch]$Single,
    [switch]$Baseline,
    [switch]$SkipInstall,
    [switch]$SkipEmbedWebUi,
    [switch]$Sourcemaps,
    [switch]$Test
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Log   { param([string]$Msg) Write-Host "[build.ps1] $Msg" }
function Abort { param([string]$Msg) Write-Error "[build.ps1] ERROR: $Msg"; exit 1 }

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot     = Split-Path -Parent $ScriptDir
$OpencodePkg  = Join-Path $RepoRoot 'packages\opencode'

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
Log 'Checking prerequisites…'

$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    Abort "'bun' not found. Install it from https://bun.sh and ensure it is on PATH."
}

$bunVersion = (bun --version 2>$null).Trim()
Log "bun version: $bunVersion"

$requiredBun = [Version]'1.3.14'
try {
    $foundBun = [Version]$bunVersion
} catch {
    Abort "Could not parse bun version '$bunVersion'."
}
if ($foundBun -lt $requiredBun) {
    Abort "bun >= $requiredBun required (found $bunVersion). Run: bun upgrade"
}

# ---------------------------------------------------------------------------
# Build flag forwarding
# ---------------------------------------------------------------------------
$BuildFlags = [System.Collections.Generic.List[string]]::new()
if ($Single)          { $BuildFlags.Add('--single') }
if ($Baseline)        { $BuildFlags.Add('--baseline') }
if ($SkipInstall)     { $BuildFlags.Add('--skip-install') }
if ($SkipEmbedWebUi)  { $BuildFlags.Add('--skip-embed-web-ui') }
if ($Sourcemaps)      { $BuildFlags.Add('--sourcemaps') }

# ---------------------------------------------------------------------------
# Install workspace dependencies
# ---------------------------------------------------------------------------
Log 'Installing workspace dependencies from repo root…'
Set-Location $RepoRoot
bun install
if ($LASTEXITCODE -ne 0) { Abort 'bun install failed.' }

# ---------------------------------------------------------------------------
# Run the TypeScript build orchestrator
# ---------------------------------------------------------------------------
Log 'Starting build via packages/opencode/script/build.ts…'
Set-Location $OpencodePkg

$buildArgs = @('run', 'script/build.ts') + $BuildFlags
& bun @buildArgs
if ($LASTEXITCODE -ne 0) { Abort 'Build failed — check output above.' }

# ---------------------------------------------------------------------------
# Post-build verification
# ---------------------------------------------------------------------------
$DistDir = Join-Path $OpencodePkg 'dist'
if (-not (Test-Path $DistDir)) {
    Abort "dist\ directory was not created — build may have failed."
}

Log 'Build artifacts:'
Get-ChildItem -Recurse -File -Path $DistDir -Filter 'opencode*' |
    Sort-Object FullName |
    ForEach-Object {
        $size = '{0:N0} KB' -f ($_.Length / 1KB)
        Log ("  {0,-10} {1}" -f $size, $_.FullName)
    }

# ---------------------------------------------------------------------------
# Optional: run tests
# ---------------------------------------------------------------------------
if ($Test) {
    Log 'Running unit tests…'
    Set-Location $OpencodePkg
    & bun test --timeout 30000 --only-failures
    if ($LASTEXITCODE -ne 0) { Abort 'Tests failed.' }
    Log 'Tests complete.'
}

Log "Done. Distributables are in $DistDir"
