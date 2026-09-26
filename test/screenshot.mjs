import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://localhost:3000/src/taskpane.html?demo=1';

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  ignoreHTTPSErrors: true,
  args: ['--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 760, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate(() => { document.getElementById('demo-banner').hidden = true; });
await sleep(400);

// 截图1：识图（初始上传区）
await page.screenshot({ path: 'docs/screenshots/home.png' });

// 截图2：描述 + 结果卡片（巴塞尔问题求和公式，视觉更有代表性）
await page.click('#mode-seg button[data-mode="describe"]');
await sleep(500);
await page.evaluate(() => {
  const latex = '\\sum_{k=1}^{\\infty} \\frac{1}{k^2} = \\frac{\\pi^2}{6}';
  document.getElementById('nl-input').value = '求和符号，k从1到无穷，1除以k的平方，加起来等于六分之派平方';
  document.getElementById('result').hidden = false;
  document.getElementById('result-title').textContent = '生成结果';
  document.getElementById('result-meta').textContent = '132 tokens';
  document.getElementById('latex-edit').value = latex;
  document.getElementById('math-preview').innerHTML =
    temml.renderToString(latex, { displayMode: true });
  document.getElementById('btn-copy').hidden = false;
  const seg = document.getElementById('insert-mode-seg');
  const active = seg.querySelector('.is-active');
  const th = document.getElementById('insert-thumb');
  th.style.width = active.offsetWidth + 'px';
  th.style.transform = 'translateX(' + (active.offsetLeft - 2) + 'px)';
});
await sleep(400);
await page.screenshot({ path: 'docs/screenshots/describe.png' });

// 截图3：设置页
await page.click('#btn-settings');
await sleep(900);
await page.screenshot({ path: 'docs/screenshots/settings.png' });

await browser.close();
console.log('✓ 截图完成');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
