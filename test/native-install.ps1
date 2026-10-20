[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../scripts/install-common.ps1"
Assert-WordClosed
$root = Split-Path $PSScriptRoot -Parent
$zip = Join-Path $root 'dist/FormulaCopilot-Windows.zip'
if (!(Test-Path $zip)) { throw 'Build the release package first.' }
$extract = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('Formula Copilot 安装验收 ' + [Guid]::NewGuid().ToString('N'))))
$profile = Join-Path $script:ProductRoot 'WebView2'
New-Item -ItemType Directory -Force $profile | Out-Null
$marker = Join-Path $profile 'installer-test-marker.txt'
[IO.File]::WriteAllText($marker, 'preserve-user-settings')
try {
    $installedUninstaller = Join-Path $script:ProductRoot 'app/2.0.0/Uninstall.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installedUninstaller
    if ($LASTEXITCODE -ne 0) { throw 'Installed uninstaller failed.' }
    if ((Test-Path 'HKCU:/Software/Microsoft/Office/Word/Addins/FormulaCopilot.Connect') -or (Test-Path (Join-Path $script:ProductRoot 'app'))) { throw 'Uninstall left registration or program files behind.' }
    if ([IO.File]::ReadAllText($marker) -ne 'preserve-user-settings') { throw 'Uninstall damaged personal settings.' }
    Write-Output 'PASS installed uninstaller removes program and registration, preserves profile'
    Expand-Archive -LiteralPath $zip -DestinationPath $extract
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $extract 'Install.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Release installer failed from extracted folder.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $extract 'Install.ps1') -Repair
    if ($LASTEXITCODE -ne 0) { throw 'Idempotent repair failed.' }
    if ([IO.File]::ReadAllText($marker) -ne 'preserve-user-settings') { throw 'Repair damaged personal settings.' }
    Write-Output 'PASS ZIP install and repeat repair from a path containing spaces and Chinese characters'
} finally {
    Remove-Item -LiteralPath $marker -ErrorAction SilentlyContinue
    # Delete only this exact, generated temporary extraction directory.
    $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if (!$extract.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test extraction path.' }
    if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }
}
# The original ZIP extraction folder no longer exists: Word must load the copy
# in LocalAppData, not a source checkout or download directory.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/native-startup.ps1" -LaunchMode Association -OpenPane
if ($LASTEXITCODE -ne 0) { throw 'Installed copy failed after removing the extraction folder.' }
Write-Output 'PASS installed add-in works after deleting its download/extraction folder'
