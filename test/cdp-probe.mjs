// 通过 CDP 直连 Word 任务窗格的 WebView2，检查页面真实状态
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets = null;
for (let i = 0; i < 25; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9223/json/list');
    targets = await res.json();
    if (targets.length) break;
  } catch { /* 端口未就绪 */ }
  await sleep(1500);
}
if (!targets || !targets.length) { console.log('CDP 端口未就绪（Word 可能未启动或环境变量未生效）'); process.exit(1); }

const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
if (!page) {
  console.log('未找到任务窗格页面。所有目标:');
  targets.forEach((t) => console.log(' -', t.type, t.url.slice(0, 80)));
  process.exit(1);
}
console.log('✓ 找到任务窗格页面:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
    events.push('异常: ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 220));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    events.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 220));
  }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await sleep(2000);

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
};

const state = await evalJs(`JSON.stringify({
  bannerHidden: document.getElementById('demo-banner').hidden,
  bannerText: document.getElementById('demo-banner').textContent.trim().slice(0, 60),
  thumbTransform: document.getElementById('mode-thumb').style.transform || '(未设置→事件绑定未执行)',
  statsText: document.getElementById('stats-text').textContent,
})`);
console.log('页面状态:', state);

const clickOk = await evalJs(`(() => {
  try {
    const b = document.querySelector('#mode-seg button[data-mode="describe"]');
    b.click();
    return !document.getElementById('pane-describe').hidden;
  } catch (e) { return '点击出错: ' + e.message; }
})()`);
console.log('实测点击「描述」切换成功:', clickOk);

console.log(events.length ? '捕获到的错误:\n' + events.join('\n') : '✓ 没有捕获到任何 JS 异常或 console.error');
ws.close();
