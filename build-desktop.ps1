# QuickLink Windows desktop packaging script (keep ASCII-only for PowerShell 5.1)
# Output: desktop/release/QuickLink-Setup-<version>.exe (NSIS installer)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==> [1/6] Generate app icon (icon.svg -> icon.ico/icon.png)" -ForegroundColor Cyan
node "$root\desktop\scripts\gen-icon.js"
if ($LASTEXITCODE -ne 0) { Write-Host "Icon generation failed" -ForegroundColor Red; exit 1 }

Write-Host "==> [2/6] Build server (TypeScript -> dist)" -ForegroundColor Cyan
Push-Location "$root\server"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Server build failed" -ForegroundColor Red; exit 1 }
Pop-Location

Write-Host "==> [3/6] Build client (Vite -> client/dist)" -ForegroundColor Cyan
Push-Location "$root\client"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Client build failed" -ForegroundColor Red; exit 1 }
Pop-Location

Write-Host "==> [4/6] Install server production deps -> server/prod_modules" -ForegroundColor Cyan
if (Test-Path "$root\server\prod_modules") { Remove-Item -Recurse -Force "$root\server\prod_modules" }
if (Test-Path "$root\server\.prod_tmp") { Remove-Item -Recurse -Force "$root\server\.prod_tmp" -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path "$root\server\.prod_tmp" -Force | Out-Null
Copy-Item "$root\server\package.json" "$root\server\.prod_tmp\"
if (Test-Path "$root\server\package-lock.json") {
  Copy-Item "$root\server\package-lock.json" "$root\server\.prod_tmp\"
}
Push-Location "$root\server\.prod_tmp"
npm install --omit=dev --ignore-scripts --no-audit --no-fund
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host "Production deps install failed" -ForegroundColor Red; exit 1 }
Start-Sleep -Seconds 2
# robocopy tolerates transient file locks better than Move-Item on Windows
robocopy "$root\server\.prod_tmp\node_modules" "$root\server\prod_modules" /E /MOVE /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Failed to move prod modules (robocopy exit $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
if (Test-Path "$root\server\.prod_tmp") { Remove-Item -Recurse -Force "$root\server\.prod_tmp" -ErrorAction SilentlyContinue }

Write-Host "==> [5/6] Ensure Electron binary" -ForegroundColor Cyan
if (-not (Test-Path "$root\desktop\node_modules\electron\dist\electron.exe")) {
  Write-Host "Electron binary missing, downloading..." -ForegroundColor Yellow
  Push-Location "$root\desktop"
  if (-not (Test-Path node_modules)) { npm install }
  node node_modules\electron\install.js
  Pop-Location
}

Write-Host "==> [6/6] electron-builder NSIS packaging" -ForegroundColor Cyan
# Use npmmirror for electron binaries (avoids GitHub timeout); local cache hit skips download
$env:ELECTRON_MIRROR = "https://registry.npmmirror.com/-/binary/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
Push-Location "$root\desktop"
npx electron-builder --win
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) { Write-Host "Packaging failed" -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Done! Installer located at: desktop\release\" -ForegroundColor Green
Get-ChildItem "$root\desktop\release\*.exe" | Select-Object Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB,1)}}
