$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeSource = Join-Path $repoRoot "target\release\todocmd.exe"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\todocmd"
$exeDest = Join-Path $installDir "todocmd.exe"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "TodoCmd.lnk"

if (-not (Test-Path $exeSource)) {
    Write-Host "Release binary not found. Building..."
    cargo build --release
}

if (-not (Test-Path $exeSource)) {
    throw "Build failed or binary missing at $exeSource"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $exeSource $exeDest -Force

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = $exeDest
$sc.WorkingDirectory = $installDir
$sc.IconLocation = "$exeDest,0"
$sc.Save()

Write-Host "Installed to: $exeDest"
Write-Host "Startup shortcut: $shortcutPath"
