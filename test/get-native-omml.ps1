$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Add()
$sel = $word.Selection
$sel.TypeText('y_1=sin^3 x (1/cos x)')
$r2 = $doc.Range(0, $doc.Content.End - 1)
$doc.OMaths.Add($r2) | Out-Null
$doc.OMaths.Item(1).BuildUp()
$xml = $doc.OMaths.Item(1).Range.WordOpenXML
$xml | Out-File -FilePath 'D:\.zcode\workspace\default\word-formula-copilot\test\word-native-omml.xml' -Encoding UTF8
Write-Host ('提取完成, 长度: ' + $xml.Length)
$doc.Close(0)
$word.Quit()
