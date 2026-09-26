// CDP 深度诊断：重载任务窗格，抓取解析错误的文件/行号 + 所有失败的网络请求
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch('http://127.0.0.1:9223/json/list');
const targets = await res.json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
if (!page) { console.log('未找到任务窗格目标'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const exceptions = [];
const failedReqs = [];
const loadedScripts = [];

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const desc = d.exception?.description || d.text || '';
    exceptions.push(`[解析/运行错误] ${d.url || '(无url)'}:${d.lineNumber ?? '?'}:${d.columnNumber ?? '?'} — ${desc.split('\n')[0].slice(0, 160)}`);
  } else if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url;
    if (u.endsWith('.js') || u.endsWith('.css') || u.endsWith('.html')) {
      loadedScripts.push(`${m.params.response.status} ${u.slice(0, 100)} (${m.params.response.mimeType})`);
    }
  } else if (m.method === 'Network.loadingFailed') {
    failedReqs.push(`[网络失败] ${m.params.errorText} ${m.params.type} (canceled=${m.params.canceled})`);
  }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res2) => { const i = ++id; pending.set(i, res2); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(9000);

const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

const state = await evalJs(`JSON.stringify({
  readyState: document.readyState,
  thumbTransform: document.getElementById('mode-thumb')?.style.transform || '(未设置)',
  bannerHidden: document.getElementById('demo-banner')?.hidden,
  bannerText: document.getElementById('demo-banner')?.textContent.trim().slice(0, 50) || '(无元素)',
  hasOffice: typeof Office !== 'undefined',
})`);
console.log('重载后页面状态:', state);
console.log('\n--- 加载的脚本/样式 ---');
loadedScripts.slice(0, 20).forEach((s) => console.log(s));
console.log('\n--- 失败的请求 ---');
console.log(failedReqs.length ? failedReqs.join('\n') : '（无）');
console.log('\n--- 异常（含文件与行号） ---');
console.log(exceptions.length ? [...new Set(exceptions)].join('\n') : '（无异常）');
ws.close();
