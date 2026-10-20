import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/readme');
fs.mkdirSync(output, { recursive: true });
for (const language of ['zh', 'en']) {
  for (const theme of ['light', 'dark']) {
    const dark = theme === 'dark';
    const c = dark
      ? { bg: '#1c1c1e', surface: '#2c2c2e', fill: '#38383a', label: '#f2f2f7', secondary: '#98989d', border: '#48484a', accent: '#0a84ff', tint: '#18324e' }
      : { bg: '#f5f5f7', surface: '#ffffff', fill: '#f0f0f3', label: '#1d1d1f', secondary: '#6e6e73', border: '#e4e4e8', accent: '#007aff', tint: '#e8f2ff' };
    const copy = language === 'en'
      ? { title: 'Formula Copilot', first: 'Your formulas.', second: 'Right inside Word.', sub: 'From a screenshot or a sentence to an editable equation.', chips: ['Screenshot', 'Describe', 'Edit in Word'], input: 'Sum 1/k² from 1 to infinity', result: 'Editable equation', button: 'Insert into Word', tab: 'Describe', other: 'Screenshot' }
      : { title: '公式助手', first: '让公式录入，', second: '像粘贴一样简单。', sub: '截图、描述与 LaTeX，直接变成 Word 原生公式。', chips: ['截图识别', '自然语言', '原生可编辑'], input: '从 1 到无穷，1/k² 的和', result: '可编辑的原生公式', button: '插入到 Word', tab: '描述', other: '识图' };
    const chips = copy.chips.map((label, index) => `<rect x="${64 + index * 142}" y="356" width="128" height="38" rx="19" fill="${c.tint}"/><text x="${128 + index * 142}" y="381" font-size="15" text-anchor="middle" fill="${c.accent}">${label}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="480" viewBox="0 0 1280 480" role="img" aria-labelledby="title desc">
<title id="title">${copy.title} — ${copy.first}${copy.second}</title><desc id="desc">${copy.sub}</desc>
<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="${dark ? '.22' : '.07'}"/></filter></defs>
<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,Noto Sans CJK SC,sans-serif">
<rect width="1280" height="480" rx="24" fill="${c.bg}"/>
<rect x="64" y="50" width="34" height="34" rx="10" fill="${c.accent}"/><text x="81" y="75" text-anchor="middle" font-size="25" font-weight="700" fill="#ffffff">Σ</text><text x="112" y="74" font-size="20" font-weight="600" fill="${c.label}">Formula Copilot</text>
<text x="64" y="170" font-size="54" font-weight="700" letter-spacing="-1.4" fill="${c.label}">${copy.first}</text><text x="64" y="238" font-size="54" font-weight="700" letter-spacing="-1.4" fill="${c.label}">${copy.second}</text><text x="64" y="291" font-size="18" fill="${c.secondary}">${copy.sub}</text>
${chips}<text x="64" y="441" font-size="13" fill="${c.secondary}">WINDOWS 2.0 · MICROSOFT WORD</text>
<g filter="url(#shadow)"><rect x="772" y="46" width="444" height="388" rx="22" fill="${c.surface}" stroke="${c.border}"/></g>
<text x="798" y="84" font-size="19" font-weight="600" fill="${c.label}">${copy.title}</text><circle cx="1183" cy="77" r="9" fill="none" stroke="${c.accent}" stroke-width="2"/><circle cx="1183" cy="77" r="3" fill="none" stroke="${c.accent}" stroke-width="2"/>
<rect x="794" y="105" width="400" height="36" rx="10" fill="${c.fill}"/><rect x="995" y="108" width="196" height="30" rx="8" fill="${c.surface}"/><text x="894" y="129" font-size="14" text-anchor="middle" fill="${c.secondary}">${copy.other}</text><text x="1093" y="129" font-size="14" text-anchor="middle" font-weight="600" fill="${c.label}">${copy.tab}</text>
<rect x="794" y="155" width="400" height="55" rx="12" fill="${c.fill}"/><text x="812" y="188" font-size="16" fill="${c.label}">${copy.input}</text><text x="798" y="239" font-size="13" font-weight="600" fill="${c.secondary}">${copy.result}</text>
<g fill="${c.label}" font-family="Cambria Math,STIX Two Math,Times New Roman,serif"><text x="863" y="304" font-size="57">∑</text><text x="884" y="258" font-size="16" text-anchor="middle">∞</text><text x="884" y="326" font-size="15" text-anchor="middle">k = 1</text><text x="948" y="279" font-size="29" text-anchor="middle">1</text><line x1="927" y1="287" x2="969" y2="287" stroke="${c.label}" stroke-width="1.5"/><text x="948" y="317" font-size="29" text-anchor="middle" font-style="italic">k²</text><text x="988" y="300" font-size="34">=</text><text x="1061" y="279" font-size="29" text-anchor="middle">π²</text><line x1="1039" y1="287" x2="1083" y2="287" stroke="${c.label}" stroke-width="1.5"/><text x="1061" y="317" font-size="29" text-anchor="middle">6</text></g>
<rect x="1001" y="359" width="193" height="49" rx="13" fill="${c.accent}"/><text x="1097" y="390" font-size="16" font-weight="600" text-anchor="middle" fill="#ffffff">${copy.button}</text></g></svg>\n`;
    fs.writeFileSync(path.join(output, `hero-${language}-${theme}.svg`), svg);
  }
}
console.log('Generated four README banners using the application design tokens.');
