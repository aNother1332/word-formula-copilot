[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/scripts/install-common.ps1"
Assert-WordClosed
foreach ($view in [Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        foreach ($path in "Software\Microsoft\Office\Word\Addins\$script:ProductProgId","Software\Classes\$script:ProductProgId","Software\Classes\$script:PaneProgId","Software\Classes\CLSID\$script:ProductClsid","Software\Classes\CLSID\$script:PaneClsid",'Software\Microsoft\Windows\CurrentVersion\Uninstall\FormulaCopilot') {
            $base.DeleteSubKeyTree($path, $false)
        }
    } finally { $base.Dispose() }
}
# Only delete the verified product binary directory. Preserve WebView2 settings,
# API keys and logs; do not touch Office policies, other add-ins or certificates.
$app = [IO.Path]::GetFullPath((Join-Path $script:ProductRoot 'app'))
$expected = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FormulaCopilot/app'))
if ($app -ne $expected -or (Get-Item -LiteralPath $app -ErrorAction SilentlyContinue).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to remove an unexpected installation path.' }
if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Recurse -Force }
Write-Host 'Formula Copilot uninstalled. Personal settings are retained in LocalAppData/FormulaCopilot.'
