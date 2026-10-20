import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9224', defaultViewport: null });
try {
  const pages = (await browser.pages()).filter((page) => page.url().startsWith('https://formula-copilot.local/'));
  assert.ok(pages.length, 'Native WebView2 page must exist');
  const windowArgument = process.argv.indexOf('--window');
  const expectedWindow = process.argv[windowArgument + 1];
  const page = windowArgument >= 0
    ? pages.find((candidate) => new URL(candidate.url()).searchParams.get('window') === expectedWindow)
    : pages[0];
  assert.ok(page, 'Must attach to the intended Word document window');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForFunction(() => document.querySelector('#btn-settings') && document.querySelector('#demo-banner').hidden);
  assert.equal(await page.evaluate(() => typeof window.Office), 'undefined', 'Native mode must work without Office.js');
  if (process.argv.includes('--second')) {
    await page.evaluate(async () => {
      const { nativeHost } = await import('/src/native-host.js');
      await nativeHost.request('insertText', 'SECOND-WINDOW-ONLY');
    });
    console.log('PASS second window insertion');
  } else {
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', String.raw`\frac{a}{b}+x^2`);
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !document.querySelector('#result').hidden);
    await page.click('#btn-insert');
    await page.waitForFunction(() => document.querySelector('#toast-host').textContent.includes('已插入单行公式'));
    console.log('PASS real UI -> native bridge -> Word formula insertion');
    await page.evaluate(async () => {
      const { nativeHost } = await import('/src/native-host.js');
      const { fullTextToWordXml } = await import('/src/fulltext.js');
      const { mml2omml } = await import('/src/vendor/mml2omml.js');
      const content = 'FULLTEXT-START\n\n由 $a$ 和 $b$ 得到：\n$$\\frac{a}{b}$$\nFULLTEXT-END';
      const xml = fullTextToWordXml(content, (latex) => mml2omml(temml.renderToString(latex, { displayMode: false })));
      await nativeHost.request('insertOoxml', xml);
    });
    console.log('PASS mixed text and native formulas insertion');
    // Rejected input must return an error, not hang or mutate the document.
    const rejected = await page.evaluate(async () => {
      const { nativeHost } = await import('/src/native-host.js');
      try { await nativeHost.request('insertOoxml', '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><x>&xxe;</x>'); return false; }
      catch { return true; }
    });
    assert.equal(rejected, true);
    assert.deepEqual(errors, []);
    console.log('PASS malformed/untrusted XML rejected; no page errors');
  }
} finally {
  browser.disconnect();
}
