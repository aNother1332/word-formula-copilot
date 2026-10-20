$script:ProductProgId = 'FormulaCopilot.Connect'
$script:ProductClsid = '{90E1A593-945B-4B71-9472-72E83F188D41}'
$script:PaneProgId = 'FormulaCopilot.Pane'
$script:PaneClsid = '{E57D65F8-4018-40BD-B87B-A6A7DF167459}'
$script:ProductRoot = Join-Path $env:LOCALAPPDATA 'FormulaCopilot'

function Assert-WordClosed {
    if (Get-Process WINWORD -ErrorAction SilentlyContinue) {
        throw 'Please save your documents and close ALL Word windows, then retry. No Word process will be terminated by this installer.'
    }
}

function Assert-NetFramework {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry32)
    try {
        $key = $base.OpenSubKey('SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full')
        $release = 0
        if ($key) { try { $release = $key.GetValue('Release', 0) } finally { $key.Dispose() } }
        if ($release -lt 394802) { throw '.NET Framework 4.6.2 or newer is required. Install .NET Framework 4.8 and retry.' }
    } finally { $base.Dispose() }
}

function Get-WordInstallation {
    $candidates = @()
    foreach ($view in [Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32) {
        $machine = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
        try {
            foreach ($keyPath in 'SOFTWARE/Microsoft/Windows/CurrentVersion/App Paths/WINWORD.EXE','SOFTWARE/Microsoft/Office/16.0/Word/InstallRoot','SOFTWARE/Microsoft/Office/15.0/Word/InstallRoot') {
                $key = $machine.OpenSubKey($keyPath.Replace('/','\'))
                if ($key) {
                    try {
                        if ($keyPath -like '*InstallRoot') { $candidates += Join-Path $key.GetValue('Path') 'WINWORD.EXE' }
                        else { $candidates += $key.GetValue('') }
                    } finally { $key.Dispose() }
                }
            }
        } finally { $machine.Dispose() }
    }
    foreach ($base in $env:ProgramFiles,${env:ProgramFiles(x86)},$env:ProgramW6432) {
        if ($base) { $candidates += Join-Path $base 'Microsoft Office/root/Office16/WINWORD.EXE' }
    }
    $exe = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (!$exe) { throw 'Microsoft Word desktop for Windows was not found. This installer does not support Word Online, Mac, or WPS.' }
    $stream = [IO.File]::OpenRead($exe)
    $reader = New-Object IO.BinaryReader($stream)
    try {
        $stream.Position = 0x3c; $offset = $reader.ReadInt32()
        $stream.Position = $offset + 4; $machineType = $reader.ReadUInt16()
    } finally { $reader.Dispose(); $stream.Dispose() }
    $arch = switch ($machineType) { 0x014c { 'x86' }; 0x8664 { 'x64' }; default { throw 'Unsupported Word architecture; this package supports x86 and x64 Word.' } }
    [pscustomobject]@{ Path = $exe; Architecture = $arch; View = $(if ($arch -eq 'x64') { [Microsoft.Win32.RegistryView]::Registry64 } else { [Microsoft.Win32.RegistryView]::Registry32 }) }
}

function Set-RegistryValues($Base, [string]$Path, [hashtable]$Values) {
    $key = $Base.CreateSubKey($Path)
    try {
        foreach ($name in $Values.Keys) {
            $kind = if ($Values[$name] -is [int]) { [Microsoft.Win32.RegistryValueKind]::DWord } else { [Microsoft.Win32.RegistryValueKind]::String }
            $key.SetValue($name, $Values[$name], $kind)
        }
    } finally { $key.Dispose() }
}

function Register-ManagedClass($Base, [string]$ProgId, [string]$Clsid, [string]$Class, [string]$DllPath, [switch]$Control) {
    $assemblyName = [Reflection.AssemblyName]::GetAssemblyName($DllPath).FullName
    $values = @{ '' = 'mscoree.dll'; ThreadingModel = 'Both'; Class = $Class; Assembly = $assemblyName; RuntimeVersion = 'v4.0.30319'; CodeBase = ([Uri]$DllPath).AbsoluteUri }
    Set-RegistryValues $Base "Software\Classes\$ProgId" @{ '' = $Class }
    Set-RegistryValues $Base "Software\Classes\$ProgId\CLSID" @{ '' = $Clsid }
    Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid" @{ '' = $Class }
    Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid\ProgId" @{ '' = $ProgId }
    Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid\InprocServer32" $values
    $versionValues = $values.Clone(); $versionValues.Remove(''); $versionValues.Remove('ThreadingModel')
    Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid\InprocServer32\2.0.0.0" $versionValues
    if ($Control) {
        Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid\Control" @{}
        Set-RegistryValues $Base "Software\Classes\CLSID\$Clsid\MiscStatus" @{ '' = '131457' }
    }
}

function Test-WebViewRuntime {
    foreach ($basePath in "${env:ProgramFiles(x86)}/Microsoft/EdgeWebView/Application","$env:ProgramFiles/Microsoft/EdgeWebView/Application","$env:LOCALAPPDATA/Microsoft/EdgeWebView/Application") {
        if (Test-Path -LiteralPath $basePath) {
            if (Get-ChildItem -LiteralPath $basePath -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'msedgewebview2.exe') }) { return $true }
        }
    }
    return $false
}
