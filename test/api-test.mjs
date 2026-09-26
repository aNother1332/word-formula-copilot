import fs from 'node:fs';

// 从环境变量读取，避免把 Key 写进代码
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.log('请先设置环境变量 DEEPSEEK_API_KEY'); process.exit(1); }
const BASE = 'https://api.deepseek.com';

async function chat(model, messages, max = 200) {
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: max }),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

const fmt = (o) => JSON.stringify(o);

// 1) 文本模型（key 有效性）
let t = await chat('deepseek-chat', [{ role: 'user', content: '只回复两个字：正常' }], 20);
console.log('[text deepseek-chat]', t.status, 'content:', t.j?.choices?.[0]?.message?.content, 'usage:', fmt(t.j?.usage));
if (t.status !== 200) {
  console.log('  deepseek-chat 失败，原始响应:', fmt(t.j).slice(0, 300));
  t = await chat('deepseek-flash', [{ role: 'user', content: '只回复两个字：正常' }], 20);
  console.log('[text deepseek-flash]', t.status, 'content:', t.j?.choices?.[0]?.message?.content, 'usage:', fmt(t.j?.usage));
}

// 2) 视觉模型（deepseek-flash，传 formula.png）
const b64 = fs.readFileSync(new URL('./formula.png', import.meta.url)).toString('base64');
const v = await chat('deepseek-flash', [
  { role: 'system', content: '你是公式识别引擎。把图片中的数学公式转成 LaTeX，只输出 LaTeX 代码本身，不要解释，不要 $ 定界符。' },
  {
    role: 'user',
    content: [
      { type: 'text', text: '识别图片中的公式' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
    ],
  },
], 6000);
console.log('[vision deepseek-flash]', v.status, 'content:', fmt(v.j?.choices?.[0]?.message?.content), 'usage:', fmt(v.j?.usage));
if (v.status !== 200) console.log('  原始响应:', fmt(v.j).slice(0, 500));
