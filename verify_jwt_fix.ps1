# JWT refresh-token fix verification checklist (PowerShell version for Windows)
# Usage: .\verify_jwt_fix.ps1

$ErrorActionPreference = "Continue"

function Write-Heading ($text) {
    Write-Host "`n$text" -ForegroundColor Cyan
}

function Write-Ok ($text) {
    Write-Host "  [OK] $text" -ForegroundColor Green
}

function Write-Warn ($text) {
    Write-Host "  [WARN] $text" -ForegroundColor Yellow
}

function Write-Fail ($text) {
    Write-Host "  [FAIL] $text" -ForegroundColor Red
}

Write-Heading "JWT Refresh Token Fix Verification Checklist"
Write-Heading "============================================"

# Load .env file if present
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
$envFile = Join-Path $scriptDir ".env"

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split "=", 2
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

$jwtSecret = [System.Environment]::GetEnvironmentVariable("JWT_SECRET")
$refreshSecret = [System.Environment]::GetEnvironmentVariable("REFRESH_TOKEN_SECRET")

Write-Heading "[1] Environment Variables"
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
    Write-Fail "JWT_SECRET is not set"
} else {
    Write-Ok "JWT_SECRET is set ($($jwtSecret.Length) chars)"
}

if ([string]::IsNullOrWhiteSpace($refreshSecret)) {
    Write-Warn "REFRESH_TOKEN_SECRET is not set (fallback is JWT_SECRET)"
} elseif ($refreshSecret -eq $jwtSecret) {
    Write-Warn "REFRESH_TOKEN_SECRET equals JWT_SECRET (use different values)"
} else {
    Write-Ok "REFRESH_TOKEN_SECRET is set separately ($($refreshSecret.Length) chars)"
}

Write-Heading "[2] Server Startup (manual)"
Write-Host "  Run: npm run dev"
Write-Host "  Look for: JWT Configuration Diagnostics"
Write-Host "  Look for: JWT Signing & Verification Test"
Write-Host "  Expected entries: accessTokenSign / accessTokenVerify / refreshTokenSign / refreshTokenVerify"

Write-Heading "[3] Required Files"
$files = @(
    "server/utils/auth.ts",
    "server/controllers/authController.ts",
    "server/utils/jwtDiagnostics.ts",
    "server.ts"
)

foreach ($f in $files) {
    $fullPath = Join-Path $scriptDir $f
    if (Test-Path $fullPath) {
        Write-Ok "$f exists"
    } else {
        Write-Fail "$f is missing"
    }
}

Write-Heading "[4] Key Code Checks"
$authFile = Join-Path $scriptDir "server/utils/auth.ts"
if (Test-Path $authFile) {
    $authContent = Get-Content $authFile -Raw
    if ($authContent -match "REFRESH_TOKEN_SECRET") {
        Write-Ok "REFRESH_TOKEN_SECRET reference found in server/utils/auth.ts"
    } else {
        Write-Fail "REFRESH_TOKEN_SECRET reference missing in server/utils/auth.ts"
    }

    if ($authContent -match "createRefreshToken") {
        Write-Ok "createRefreshToken function found in server/utils/auth.ts"
    } else {
        Write-Fail "createRefreshToken function missing in server/utils/auth.ts"
    }
} else {
    Write-Fail "Cannot verify code: server/utils/auth.ts not found"
}

Write-Heading "[5] API Quick Test (manual)"
Write-Host "  1. POST /api/auth/login"
Write-Host "  2. Wait ~30 seconds"
Write-Host "  3. POST /api/auth/refresh"
Write-Host "  Expected: refresh succeeds and returns a new access token"

Write-Heading "[6] Browser Cookie Check (manual)"
Write-Host "  1. Open DevTools"
Write-Host "  2. Navigate to Application > Cookies"
Write-Host "  3. Check for vault_refresh_token"
Write-Host "  4. Validate HttpOnly, Secure, SameSite attributes"

Write-Heading "[7] Error Log Check (manual)"
Write-Host "  Should NOT contain:"
Write-Host "    - invalid signature"
Write-Host "    - Failed to refresh session - invalid token"
Write-Host "    - Refresh Token Verification Failed"

Write-Heading "============================================"
Write-Heading "Checklist complete."
