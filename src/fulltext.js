// 全文模式：把"文字 + $公式$ 混合文本"解析为可插入 Word 的 HTML
// 公式由调用方注入的渲染函数转成 MathML，Word 会在插入时自动转换为原生公式对象

export function splitFormulaSegments(text) {
  const segs = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'text', content: text.slice(last, m.index) });
    if (m[1] !== undefined) segs.push({ type: 'display', content: m[1] });
    else segs.push({ type: 'inline', content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'text', content: text.slice(last) });
  return segs;
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// renderFormula(latex, displayMode) → MathML 字符串
export function fullTextToHtml(text, renderFormula) {
  const segs = splitFormulaSegments(text);
  let body = '';
  for (const seg of segs) {
    if (seg.type === 'text') {
      body += escapeHtml(seg.content)
        .replace(/\r\n?/g, '\n')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>');
    } else {
      const latex = seg.content.trim();
      if (!latex) continue;
      try {
        body += renderFormula(latex, seg.type === 'display');
      } catch (e) {
        body += '<span style="color:#b22222">' + escapeHtml(latex) + '</span>';
      }
    }
  }
  return '<p>' + body + '</p>';
}
