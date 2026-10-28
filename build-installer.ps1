# QuickLink Windows service installer build script (ASCII only for PowerShell 5.1)
# Output: installer/release/QuickLink-Setup-<version>.exe
#
# Replaces the former build-desktop.ps1: the Electron shell is gone, the app is now a
# Windows service (node.exe + NSSM) accessed through a browser.
param(
  [string]$Version = "1.0.0",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$installer = "$root\installer"
$stage = "$installer\stage"
$cache = "$installer\.cache"

# Pinned third-party binaries. Hashes were cross-verified against two independent mirrors:
#  - NSSM 2.24-101-g897c7ad win64: the Chocolatey package's embedded zip matches the official
#    checksum published in its VERIFICATION.txt, and its win64/nssm.exe matches npm nssm-bin@2.24.102.
#  - Node.js v22.14.0 win-x64: official distribution zip from the npmmirror binary mirror.
$NssmSha256    = "eee9c44c29c2be011f1f1e43bb8c3fca888cb81053022ec5a0060035de16d848"
$NodeVersion   = "v22.14.0"
$NodeZipSha256 = "55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217"
$NodeExeSha256 = "33b1bc1a8aca11fd5a4f2699e51019c63c0af30cf437701d07af69be7706771b"
$NodeMirror    = "https://registry.npmmirror.com/-/binary/node"

function Assert-Sha256 {
  param([string]$Path, [string]$Expected, [string]$What)
  $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) {
    Write-Host "Checksum mismatch for ${What}: expected $Expected, got $actual" -ForegroundColor Red
    Write-Host "Deleting $Path so the next run re-downloads it." -ForegroundColor Yellow
    Remove-Item -Force $Path -ErrorAction SilentlyContinue
    exit 1
  }
  Write-Host "    verified $What ($actual)" -ForegroundColor DarkGray
}

function Find-MakeNsis {
  # Prefer a locally cached NSIS tree, then PATH, then the electron-builder cache
  # (present on machines that previously built the Electron package).
  # The electron-builder nsis-3.0.4.1 cache ships a broken 2.5 KB root-level
  # makensis.exe stub (fails to start with 0xc0000142) next to the real
  # Bin\makensis.exe compiler, and the recursive "first match" order is not
  # stable. Keep only candidates > 100 KB (the real compiler is ~440 KB) and
  # prefer the largest one.
  $local = Get-ChildItem "$cache\nsis" -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 100KB } | Sort-Object Length -Descending | Select-Object -First 1
  if ($local) { return $local.FullName }
  $cmd = Get-Command makensis -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $eb = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\nsis" -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 100KB } | Sort-Object Length -Descending | Select-Object -First 1
  if ($eb) { return $eb.FullName }
  return $null
}

Write-Host "==> [1/7] Generate installer icon" -ForegroundColor Cyan
Push-Location $installer
if (-not (Test-Path "node_modules\png-to-ico")) { npm install --no-audit --no-fund }
node scripts\gen-icon.js
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Icon generation failed" -ForegroundColor Red; exit 1 }
Pop-Location

if (-not $SkipBuild) {
  Write-Host "==> [2/7] Build server (TypeScript -> server/dist)" -ForegroundColor Cyan
  Push-Location "$root\server"
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Server build failed" -ForegroundColor Red; exit 1 }
  Pop-Location

  Write-Host "==> [3/7] Build client (Vite -> client/dist)" -ForegroundColor Cyan
  Push-Location "$root\client"
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Client build failed" -ForegroundColor Red; exit 1 }
  Pop-Location

  Write-Host "==> [4/7] Install server production deps -> server/prod_modules" -ForegroundColor Cyan
  if (Test-Path "$root\server\prod_modules") { Remove-Item -Recurse -Force "$root\server\prod_modules" }
  if (Test-Path "$root\server\.prod_tmp") { Remove-Item -Recurse -Force "$root\server\.prod_tmp" -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path "$root\server\.prod_tmp" -Force | Out-Null
  Copy-Item "$root\server\package.json" "$root\server\.prod_tmp\"
  if (Test-Path "$root\server\package-lock.json") { Copy-Item "$root\server\package-lock.json" "$root\server\.prod_tmp\" }
  Push-Location "$root\server\.prod_tmp"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Write-Host "Production deps install failed" -ForegroundColor Red; exit 1 }
  Start-Sleep -Seconds 2
  # robocopy tolerates transient file locks better than Move-Item on Windows
  robocopy "$root\server\.prod_tmp\node_modules" "$root\server\prod_modules" /E /MOVE /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { Write-Host "Failed to move prod modules (robocopy exit $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
  Remove-Item -Recurse -Force "$root\server\.prod_tmp" -ErrorAction SilentlyContinue
} else {
  Write-Host "==> [2-4/7] Skipped (-SkipBuild)" -ForegroundColor Yellow
}

Write-Host "==> [5/7] Resolve vendor binaries (node.exe / nssm.exe)" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $cache -Force | Out-Null

Assert-Sha256 "$installer\vendor\nssm.exe" $NssmSha256 "nssm.exe"

$nodeExe = "$cache\node-$NodeVersion\node.exe"
if (-not (Test-Path $nodeExe)) {
  $zip = "$cache\node-$NodeVersion-win-x64.zip"
  if (-not (Test-Path $zip)) {
    $url = "$NodeMirror/$NodeVersion/node-$NodeVersion-win-x64.zip"
    Write-Host "    downloading $url" -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  }
  Assert-Sha256 $zip $NodeZipSha256 "node zip"
  Write-Host "    extracting node.exe" -ForegroundColor DarkGray
  $tmp = "$cache\node-extract"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Path "$cache\node-$NodeVersion" -Force | Out-Null
  Copy-Item "$tmp\node-$NodeVersion-win-x64\node.exe" $nodeExe -Force
  Remove-Item -Recurse -Force $tmp
}
Assert-Sha256 $nodeExe $NodeExeSha256 "node.exe"

Write-Host "==> [6/7] Assemble staging tree" -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path "$stage\node" -Force | Out-Null
New-Item -ItemType Directory -Path "$stage\nssm" -Force | Out-Null
New-Item -ItemType Directory -Path "$stage\server" -Force | Out-Null

# Only node.exe is needed: the server has no native addons (verified: zero *.node files in prod_modules)
Copy-Item $nodeExe "$stage\node\node.exe"
Copy-Item "$installer\vendor\nssm.exe" "$stage\nssm\nssm.exe"

Copy-Item -Recurse "$root\server\dist" "$stage\server\dist"
Copy-Item -Recurse "$root\server\prod_modules" "$stage\server\node_modules"
Copy-Item "$root\server\package.json" "$stage\server\package.json"
Copy-Item "$root\server\service.js" "$stage\server\service.js"
Copy-Item "$installer\scripts\migrate-legacy.js" "$stage\server\migrate-legacy.js"
Copy-Item "$installer\scripts\check-health.js" "$stage\server\check-health.js"

# Frontend static files, served by Express (STATIC_DIR)
Copy-Item -Recurse "$root\client\dist" "$stage\public"

Write-Host "==> [7/7] Compile NSIS installer" -ForegroundColor Cyan
$makensis = Find-MakeNsis
if (-not $makensis) {
  Write-Host "makensis.exe not found." -ForegroundColor Red
  Write-Host "Install NSIS 3 and put makensis.exe on PATH, or drop a full NSIS tree into:" -ForegroundColor Yellow
  Write-Host "  $cache\nsis\" -ForegroundColor Yellow
  exit 1
}
Write-Host "    using $makensis" -ForegroundColor DarkGray

New-Item -ItemType Directory -Path "$installer\release" -Force | Out-Null
Push-Location $installer
& $makensis "/INPUTCHARSET" "UTF8" "/DVERSION=$Version" "/DSTAGE_DIR=stage" "quicklink.nsi"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Host "NSIS compilation failed (exit $code)" -ForegroundColor Red; exit 1 }

# Staging tree is reproducible build output; drop it to keep the working tree clean
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! Installer located at: installer\release\" -ForegroundColor Green
Get-ChildItem "$installer\release\QuickLink-Setup-$Version.exe" | Select-Object Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB,1)}}
