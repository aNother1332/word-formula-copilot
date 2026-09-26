$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('D:\.zcode\workspace\default\word-formula-copilot\test\omml-pipeline-test.docx', $false, $true)
  Write-Host ("OMaths.Count: {0}" -f $doc.OMaths.Count)
  if ($doc.OMaths.Count -ge 1) {
    $m = $doc.OMaths.Item(1)
    Write-Host ("第1个公式类型: {0}  是否行内(非独占段): {1}" -f $m.Type, ($m.Type -eq 1))
    Write-Host ("公式线性文本: {0}" -f $m.Range.Text)
  }
  $doc.Close(0)
} finally { $word.Quit() }
