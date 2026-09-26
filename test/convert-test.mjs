import fs from 'node:fs';
import temml from 'temml';
import * as m2o from 'mathml2omml';

console.log('temml exports:', Object.keys(temml).slice(0, 12).join(', '));
console.log('mathml2omml exports:', Object.keys(m2o).join(', '));

const latex = 'y_1 = \\sin^3 x \\cdot \\frac{1}{\\cos x}';
const mathml = temml.renderToString(latex, { displayMode: false });
console.log('--- MathML (前 200 字) ---');
console.log(mathml.slice(0, 200));

const conv = m2o.mml2omml || m2o.default || m2o;
let omml;
try {
  omml = conv(mathml);
} catch (e) {
  console.log('mml2omml 调用失败:', e.message);
  process.exit(1);
}
console.log('--- OMML (前 200 字) ---');
console.log(omml.slice(0, 200));
console.log('OMML 是否以 <m:oMath 开头:', omml.startsWith('<m:oMath'));

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const oMathInner = omml.replace(/^<m:oMath[^>]*>/, '').replace(/<\/m:oMath>$/, '');

const inline = `<m:oMath xmlns:m="${NS_M}">${oMathInner}</m:oMath>`;
const paragraph = `<w:p xmlns:w="${NS_W}" xmlns:m="${NS_M}">${omml}</w:p>`;
const block = `<w:p xmlns:w="${NS_W}" xmlns:m="${NS_M}"><m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${omml}</m:oMathPara></w:p>`;

fs.writeFileSync(new URL('./omml-inline.xml', import.meta.url), inline);
fs.writeFileSync(new URL('./omml-paragraph.xml', import.meta.url), paragraph);
fs.writeFileSync(new URL('./omml-block.xml', import.meta.url), block);
console.log('已写出 3 个 XML 片段');
