[CmdletBinding()]
param([switch]$RequirePane)
$ErrorActionPreference = 'Stop'
# Attach to the Word the user opened through Explorer, not a child process of
# this test runner. Registry/file checks inside an isolated runner are not proof
# that the desktop user environment has the add-in installed.
Add-Type -Path "$PSScriptRoot/WordWindow.cs"
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$checked = 0
foreach ($process in @(Get-Process WINWORD -ErrorAction SilentlyContinue)) {
    $native = [WordWindow]::GetNativeWindow($process.Id)
    if (!$native) { continue }
    $app = $native.Application
    if ($app.Documents.Count -eq 0) { continue }
    try { $addin = $app.COMAddIns.Item('FormulaCopilot.Connect') }
    catch { throw "FAIL Word PID $($process.Id) does not enumerate Formula Copilot. Run Install.cmd from Windows Explorer, then reopen Word from the desktop." }
    if (!$addin.Connect) { throw "FAIL Word PID $($process.Id): Formula Copilot is disconnected." }
    $status = $addin.Object.GetStatus()
    if ($status -notmatch 'factory=True') { throw "FAIL task pane factory: $status" }
    $processCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $process.Id)
    $buttonCondition = New-Object Windows.Automation.AndCondition(
        (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, '公式助手')),
        (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)))
    $visible = $false
    foreach ($window in [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $processCondition)) {
        foreach ($button in $window.FindAll([Windows.Automation.TreeScope]::Descendants, $buttonCondition)) {
            if (!$button.Current.IsOffscreen) { $visible = $true }
        }
    }
    if (!$visible) { throw 'FAIL no visible Formula Copilot ribbon button. Select Home and expand the ribbon, then retry.' }
    if ($RequirePane -and $status -notmatch 'browser=ready') { throw "FAIL open the Formula Copilot pane first: $status" }
    Write-Output "PASS desktop Word PID $($process.Id): visible ribbon button; $status"
    $checked++
}
if (!$checked) { throw 'Open a document by double-clicking it in Windows Explorer, select Home, then run this check.' }
# Never insert, save, close documents or change add-in connection state here.
