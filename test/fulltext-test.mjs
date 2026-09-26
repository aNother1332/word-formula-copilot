import { fullTextToHtml, splitFormulaSegments } from '../src/fulltext.js';
import temml from 'temml';
const sample = '由勾股定理可知\n\n$$a^2 + b^2 = c^2$$\n\n其中 $c$ 为斜边长度。代入 $a=3$、$b=4$ 得 $c=5$。';
const segs = splitFormulaSegments(sample);
console.log('分段数:', segs.length, '| 公式段:', segs.filter(s => s.type !== 'text').length);
const html = fullTextToHtml(sample, (l, dm) => temml.renderToString(l, { displayMode: dm }));
console.log('math 元素数:', (html.match(/<math/g) || []).length);
console.log('含段落转换:', html.includes('</p><p>') ? '是' : '否');
console.log('含转义文本:', html.includes('勾股定理') ? '是' : '否');
