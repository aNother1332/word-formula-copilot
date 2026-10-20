[CmdletBinding()]
param([switch]$OpenPane, [switch]$Integration, [switch]$KeepOpen, [ValidateSet('Document','Blank','Association')][string]$LaunchMode = 'Document')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../scripts/install-common.ps1"
Assert-WordClosed
$word = Get-WordInstallation
if ($Integration) { $OpenPane = $true; $env:FORMULA_COPILOT_DEBUG_PORT = '9224' }
Add-Type -Path "$PSScriptRoot/WordWindow.cs"
$fixture = Join-Path $env:TEMP ('FormulaCopilot-startup-' + [Guid]::NewGuid().ToString('N') + '.docx')
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($fixture, [IO.Compression.ZipArchiveMode]::Create)
try {
    $parts = @{
        '[Content_Types].xml' = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
        '_rels/.rels' = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
        'word/document.xml' = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Formula Copilot startup test</w:t></w:r></w:p></w:body></w:document>'
    }
    foreach ($name in $parts.Keys) {
        $entry = $zip.CreateEntry($name); $writer = New-Object IO.StreamWriter($entry.Open())
        try { $writer.Write($parts[$name]) } finally { $writer.Dispose() }
    }
} finally { $zip.Dispose() }
if ($LaunchMode -eq 'Association') {
    $process = Start-Process -FilePath $fixture -Verb Open -WindowStyle Normal -PassThru
} elseif ($LaunchMode -eq 'Blank') {
    $process = Start-Process -FilePath $word.Path -ArgumentList '/w','/q' -WindowStyle Normal -PassThru
} else {
    $process = Start-Process -FilePath $word.Path -ArgumentList '/n','/q',('"' + $fixture + '"') -WindowStyle Normal -PassThru
}
$app = $null
try {
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        foreach ($candidate in @(Get-Process WINWORD -ErrorAction SilentlyContinue)) {
            try { $native = [WordWindow]::GetNativeWindow($candidate.Id); if ($native) { $app = $native.Application; break } } catch { }
        }
        if ($app) { break }
    }
    if (!$app) { throw 'Word did not register a running application.' }
    $addin = $app.COMAddIns.Item('FormulaCopilot.Connect')
    if (!$addin.Connect) { throw 'Formula Copilot is not connected after ordinary Word startup.' }
    $status = $addin.Object.GetStatus()
    if ($status -notmatch 'factory=True') { throw "Task pane factory not ready: $status" }
    $xml = [xml]$addin.Object.GetCustomUI('Microsoft.Word.Document')
    if ($xml.customUI.ribbon.tabs.tab.idMso -ne 'TabHome') { throw 'Ribbon button is not in the Home tab.' }
    Write-Output "PASS ordinary Word startup ($LaunchMode): $status"
    if ($OpenPane) {
        if ($app.Documents.Count -eq 0) { [void]$app.Documents.Add() }
        $before = $app.ActiveDocument.Content.Text
        Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
        $root = [Windows.Automation.AutomationElement]::RootElement
        $button = $null
        $condition = New-Object Windows.Automation.AndCondition(
            (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, '公式助手')),
            (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)))
        foreach ($candidate in @(Get-Process WINWORD)) {
            $windowCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $candidate.Id)
            foreach ($wordWindow in $root.FindAll([Windows.Automation.TreeScope]::Children, $windowCondition)) {
                $button = $wordWindow.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
                if ($button) { break }
            }
            if ($button) { break }
        }
        if (!$button) { throw 'Formula Copilot button is absent from the actual Word ribbon.' }
        $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
        for ($i=0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 500
            if ($addin.Object.GetStatus() -match 'browser=(ready|error|navigation-error)') { break }
        }
        if ($addin.Object.GetStatus() -notmatch 'browser=ready') { throw ('Browser failed to initialize: ' + $addin.Object.GetStatus()) }
        if ($app.ActiveDocument.Content.Text -ne $before) { throw 'Opening the pane changed document contents.' }
        Write-Output ('PASS pane opens without modifying document: ' + $addin.Object.GetStatus())
        if ($Integration) {
            & node "$PSScriptRoot/native-ui.mjs" --window $app.ActiveWindow.Hwnd
            if ($LASTEXITCODE -ne 0) { throw 'Native UI integration failed.' }
            $first = $app.ActiveDocument
            if ($first.OMaths.Count -ne 4) { throw "Expected 4 editable formulas; found $($first.OMaths.Count)." }
            if ($first.Content.Text -notmatch 'FULLTEXT-END') { throw 'Full-text content did not reach the document.' }
            Write-Output 'PASS Word confirms 4 native OMath objects and full text'
            $second = $app.Documents.Add()
            $addin.Object.ShowPane()
            for ($i=0; $i -lt 30; $i++) {
                Start-Sleep -Milliseconds 500
                if ($addin.Object.GetStatus() -match 'panes=2.*browser=ready.*browser=ready') { break }
            }
            & node "$PSScriptRoot/native-ui.mjs" --second --window $app.ActiveWindow.Hwnd
            if ($LASTEXITCODE -ne 0) { throw 'Second window integration failed.' }
            if ($second.Content.Text -notmatch 'SECOND-WINDOW-ONLY' -or $first.Content.Text -match 'SECOND-WINDOW-ONLY') { throw 'Insertion targeted the wrong document.' }
            Write-Output 'PASS two document windows insert into their own documents'
        }
    }
} finally {
    if ($app -and !$KeepOpen) { $app.Quit([ref]0); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) }
    if (!$KeepOpen) { Remove-Item -LiteralPath $fixture -ErrorAction SilentlyContinue }
}
