[CmdletBinding()]
param([string]$SourcePath, [switch]$Repair)
$ErrorActionPreference = 'Stop'
if (!$PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (!$SourcePath) { $SourcePath = $PSScriptRoot }
. "$PSScriptRoot/scripts/install-common.ps1"
Assert-WordClosed
Assert-NetFramework
$word = Get-WordInstallation
$source = [IO.Path]::GetFullPath($SourcePath)
if (!(Test-Path "$source/FormulaCopilot.dll")) {
    $source = Join-Path $PSScriptRoot 'dist/FormulaCopilot'
    if (!(Test-Path "$source/FormulaCopilot.dll")) {
        if (Test-Path "$PSScriptRoot/scripts/build-native.ps1") {
            Write-Host 'Building the add-in from source (first installation only)...'
            & "$PSScriptRoot/scripts/build-native.ps1"
        } else { throw 'Release files not found. Extract the complete FormulaCopilot-Windows.zip before running Install.cmd.' }
    }
}
if (!(Test-WebViewRuntime)) {
    Write-Host 'Installing Microsoft Edge WebView2 Runtime for the current user...'
    $bootstrapper = Join-Path $env:TEMP 'FormulaCopilot-WebView2Setup.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
    $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'WebView2 installer signature verification failed.' }
    $process = Start-Process -FilePath $bootstrapper -ArgumentList '/silent','/install' -WindowStyle Hidden -Wait -PassThru
    if (!(Test-WebViewRuntime)) { throw "WebView2 installation failed (exit $($process.ExitCode)). Install Microsoft Edge WebView2 Runtime and retry." }
}
$destination = Join-Path $script:ProductRoot 'app/2.0.0'
New-Item -ItemType Directory -Force $destination | Out-Null
if ([IO.Path]::GetFullPath($source).TrimEnd('\') -ne [IO.Path]::GetFullPath($destination).TrimEnd('\')) {
    Copy-Item "$source/*" $destination -Recurse -Force
}
Copy-Item "$destination/$($word.Architecture)/WebView2Loader.dll" "$destination/WebView2Loader.dll" -Force
Get-ChildItem -LiteralPath $destination -Recurse -File | Unblock-File
$dll = Join-Path $destination 'FormulaCopilot.dll'
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $word.View)
try {
    Register-ManagedClass $base $script:ProductProgId $script:ProductClsid 'FormulaCopilot.Connect' $dll
    Register-ManagedClass $base $script:PaneProgId $script:PaneClsid 'FormulaCopilot.FormulaPane' $dll -Control
    Set-RegistryValues $base "Software\Microsoft\Office\Word\Addins\$script:ProductProgId" @{ FriendlyName = '公式助手 Formula Copilot'; Description = '截图或自然语言生成可编辑 Word 公式'; LoadBehavior = 3 }
    $uninstall = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $destination 'Uninstall.ps1') + '"'
    Set-RegistryValues $base 'Software\Microsoft\Windows\CurrentVersion\Uninstall\FormulaCopilot' @{ DisplayName = '公式助手 Formula Copilot'; DisplayVersion = '2.0.0'; Publisher = 'Formula Copilot'; InstallLocation = $destination; UninstallString = $uninstall; NoModify = 1; NoRepair = 1 }
} finally { $base.Dispose() }
if ($Repair) {
    $disabled = Get-Item 'HKCU:/Software/Microsoft/Office/16.0/Word/Resiliency/DisabledItems' -ErrorAction SilentlyContinue
    if ($disabled) {
        foreach ($name in $disabled.GetValueNames()) {
            $data = $disabled.GetValue($name)
            if ($data -is [byte[]] -and [Text.Encoding]::Unicode.GetString($data) -match 'formulacopilot[.](connect|dll)') {
                Write-Warning 'Word has disabled Formula Copilot. In Word: File > Options > Add-ins > Manage: Disabled Items > Go, enable Formula Copilot, then restart Word.'
            }
        }
    }
}
Write-Host "Installed for this user ($($word.Architecture) Word). Open Word normally, then Home > 公式助手."
Write-Host "Location: $destination"
Write-Host 'API settings and usage are retained when repairing or reinstalling. Word security policies and user-disabled add-ins are respected.'
