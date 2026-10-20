import test from 'node:test';
import assert from 'node:assert/strict';
import temml from 'temml';
import { mml2omml } from '../../src/vendor/mml2omml.js';
import { fullTextToWordXml, fullTextToHtml, splitFormulaSegments } from '../../src/fulltext.js';

const render = (latex) => mml2omml(temml.renderToString(latex, { displayMode: false, throwOnError: true }));

test('mixed content produces editable inline and display OMML, escaped text and paragraphs', () => {
  const xml = fullTextToWordXml('条件 a < b & c > d\r\n\r\n行内 $x^2$ 与 $\\frac{a}{b}$。\n$$E=mc^2$$\n结束', render);
  assert.equal((xml.match(/<m:oMath(?:\s|>)/g) || []).length, 3);
  assert.equal((xml.match(/<m:oMathPara>/g) || []).length, 1);
  assert.ok(xml.includes('a &lt; b &amp; c &gt; d'));
  assert.ok(xml.includes('</w:p><w:p></w:p><w:p>'));
  assert.ok(xml.includes('<m:f>'));
  assert.ok(xml.endsWith('</w:p></w:body></w:document>'));
});

test('malformed formulas stop native conversion before any insertion', () => {
  assert.throws(() => fullTextToWordXml('前文 $\\frac{$ 后文', render));
});

test('literal markup stays text in both native and legacy conversions', () => {
  const content = '<script>alert("x")</script>\n$y_1$';
  const xml = fullTextToWordXml(content, render);
  const html = fullTextToHtml(content, (latex, displayMode) => temml.renderToString(latex, { displayMode }));
  assert.ok(!xml.includes('<script>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(xml.includes('&lt;script&gt;'));
  assert.ok(html.includes('<math'));
});

test('segment parser preserves order and multiline display formulas', () => {
  assert.deepEqual(splitFormulaSegments('前 $a$ 中 $$b\n+c$$ 后'), [
    { type: 'text', content: '前 ' }, { type: 'inline', content: 'a' },
    { type: 'text', content: ' 中 ' }, { type: 'display', content: 'b\n+c' },
    { type: 'text', content: ' 后' },
  ]);
});
