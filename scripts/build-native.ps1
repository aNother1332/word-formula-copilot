[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (!$PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '../dist/FormulaCopilot' }
$root = Split-Path $PSScriptRoot -Parent
$output = [IO.Path]::GetFullPath($OutputDirectory)
$cache = Join-Path $env:TEMP 'formula-copilot-build'
$sdk = Join-Path $cache 'webview2'
$archive = Join-Path $cache 'webview2.zip'
$version = '1.0.3537.50'
$hash = '5EA526BBD728ADDA0DA4D31219267E96460494A427E4894C4E09D9F320F4B9AA'
New-Item -ItemType Directory -Force $cache,$output | Out-Null
if (!(Test-Path "$sdk/lib/net462/Microsoft.Web.WebView2.Core.dll")) {
    if (!(Test-Path $archive)) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive
    }
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $hash) { throw 'WebView2 SDK checksum mismatch. Remove the cached archive and retry.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
if (!(Test-Path $compiler)) { throw '.NET Framework 4.x compiler is required to build.' }
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.Xml.dll','Microsoft.CSharp.dll',"$sdk/lib/net462/Microsoft.Web.WebView2.Core.dll","$sdk/lib/net462/Microsoft.Web.WebView2.WinForms.dll")
$officePia = Get-ChildItem "$env:WINDIR/assembly/GAC_MSIL/office" -Recurse -Filter Office.dll -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
$extensibility = Get-ChildItem "$env:WINDIR/assembly/GAC/Extensibility" -Recurse -Filter Extensibility.dll -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$officePia -or !$extensibility) { throw 'Building requires Office primary interop assemblies (installed with desktop Office). End-user installation does not require these build references.' }
$arguments = @('/nologo','/target:library','/platform:anycpu','/optimize+','/utf8output',"/out:$output/FormulaCopilot.dll") + @($references | ForEach-Object { '/reference:' + $_ }) + @(Get-ChildItem "$root/native/*.cs" | ForEach-Object FullName)
$arguments += '/link:' + $officePia.FullName
$arguments += '/link:' + $extensibility.FullName
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Native add-in compilation failed.' }
Copy-Item "$sdk/lib/net462/Microsoft.Web.WebView2.Core.dll","$sdk/lib/net462/Microsoft.Web.WebView2.WinForms.dll" $output -Force
foreach ($arch in 'x86','x64') {
    New-Item -ItemType Directory -Force "$output/$arch" | Out-Null
    Copy-Item "$sdk/runtimes/win-$arch/native/WebView2Loader.dll" "$output/$arch" -Force
}
New-Item -ItemType Directory -Force "$output/web/src","$output/web/assets","$output/web/test","$output/scripts" | Out-Null
Copy-Item "$root/src/*.js","$root/src/*.css","$root/src/*.html" "$output/web/src" -Exclude 'user.config.js' -Force
Copy-Item "$root/src/user.config.example.js" "$output/web/src/user.config.js" -Force
Copy-Item "$root/src/vendor" "$output/web/src" -Recurse -Force
Copy-Item "$root/assets/icons" "$output/web/assets" -Recurse -Force
Copy-Item "$root/test/formula.png" "$output/web/test" -Force
Copy-Item "$root/Install.ps1","$root/Install.cmd","$root/Uninstall.ps1","$root/Uninstall.cmd","$root/Repair.cmd" $output -Force
Copy-Item "$root/scripts/install-common.ps1" "$output/scripts" -Force
Copy-Item "$root/LICENSE" $output -Force
Copy-Item "$root/docs/INSTALL.md" "$output/安装说明.md" -Force
Copy-Item "$sdk/LICENSE.txt" "$output/WebView2-LICENSE.txt" -Force
Copy-Item "$root/docs/licenses" "$output" -Recurse -Force
Write-Host "Built Windows add-in: $output"
Compress-Archive -Path "$output/*" -DestinationPath (Join-Path (Split-Path $output -Parent) 'FormulaCopilot-Windows.zip') -Force
Write-Host 'Release ZIP created. End users do not need Node.js, npm, certificates, or the .NET SDK.'
