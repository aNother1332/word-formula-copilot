// 在任务窗格内部做插入对照实验，二分定位 OOXML 被拒的原因
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = await fetch('http://127.0.0.1:9223/json/list');
const targets = await res.json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
if (!page) { console.log('未找到任务窗格'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (method, params = {}) => new Promise((res2) => { const i = ++id; pending.set(i, res2); ws.send(JSON.stringify({ id: i, method, params })); });

const expr = `(async () => {
  const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const out = [];
  const tryWordJS = (xml) => Word.run((ctx) => (async () => {
    try {
      ctx.document.getSelection().insertOoxml(xml, Word.InsertLocation.replace);
      await ctx.sync();
      return { ok: true };
    } catch (e) { return { ok: false, err: e.message || String(e) }; }
  })());
  const trySetSelected = (xml) => new Promise((resolve) => {
    try {
      Office.context.document.setSelectedDataAsync(xml, { coercionType: Office.CoercionType.Ooxml }, (r) => {
        if (r.status === Office.AsyncResultStatus.Succeeded) resolve({ ok: true });
        else resolve({ ok: false, err: (r.error ? r.error.name + ': ' + r.error.message : '失败') });
      });
    } catch (e) { resolve({ ok: false, err: e.message }); }
  });
  const record = (name, r) => out.push(name + ' → ' + (r.ok ? '✅成功' : '❌ ' + r.err));

  // T0: 纯文本写入（验证选区可写）
  const t0 = await new Promise((resolve) => {
    Office.context.document.setSelectedDataAsync('T0文本写入测试 ', { coercionType: Office.CoercionType.Text }, (r) =>
      resolve(r.status === Office.AsyncResultStatus.Succeeded ? { ok: true } : { ok: false, err: r.error?.message }));
  });
  record('T0 纯文本 setSelectedDataAsync', t0);

  // T1: 最小行内 oMath
  const minO = '<m:oMath xmlns:m="' + NS_M + '"><m:r><m:t>x+1</m:t></m:r></m:oMath>';
  record('T1 最小oMath WordJS', await tryWordJS(minO));
  record('T2 最小oMath setSelected', await trySetSelected(minO));

  // T3: 最小段落
  const minP = '<w:p xmlns:w="' + NS_W + '" xmlns:m="' + NS_M + '"><m:oMath><m:r><m:t>y=2</m:t></m:r></m:oMath></w:p>';
  record('T3 最小段落 WordJS', await tryWordJS(minP));
  record('T4 最小段落 setSelected', await trySetSelected(minP));

  // T5: 完整文档（不含 xml 声明）
  const fullNoDecl = '<w:document xmlns:w="' + NS_W + '" xmlns:m="' + NS_M + '"><w:body>' + minP + '</w:body></w:document>';
  record('T5 完整文档(无声明) setSelected', await trySetSelected(fullNoDecl));

  // T6: 完整文档（含 xml 声明）
  const fullDecl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + fullNoDecl;
  record('T6 完整文档(含声明) setSelected', await trySetSelected(fullDecl));

  // T7: 页面内实际转换产物（temml + mathml2omml）
  try {
    const { mml2omml } = await import('/src/vendor/mml2omml.js');
    const mathml = temml.renderToString('y_1 = \\\\sin^3 x \\\\cdot \\\\frac{1}{\\\\cos x}', { displayMode: false });
    const omml = mml2omml(mathml);
    out.push('T7pre 转换产物前120字: ' + omml.slice(0, 120));
    record('T7 实际转换产物 WordJS', await tryWordJS(omml));
    record('T8 实际转换产物 setSelected', await trySetSelected(omml));
  } catch (e) { out.push('T7 转换失败: ' + e.message); }

  return out.join('\\n');
})()`;

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (r.result?.result?.value) console.log(r.result.result.value);
else console.log('evaluate 失败:', JSON.stringify(r.result || r.error || r).slice(0, 500));
ws.close();
