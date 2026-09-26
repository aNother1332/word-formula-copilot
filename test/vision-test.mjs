// 视觉模型冒烟测试：需要环境变量 DEEPSEEK_API_KEY
import fs from 'node:fs';
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.log('请先设置环境变量 DEEPSEEK_API_KEY'); process.exit(1); }
const b64 = fs.readFileSync(new URL('./formula.png', import.meta.url)).toString('base64');
const r = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'deepseek-flash',
    max_tokens: 8192,
    thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: '你是公式识别引擎。把图片中的数学公式转成 LaTeX，只输出 LaTeX 代码本身，不要解释，不要 $ 定界符。' },
      { role: 'user', content: [
        { type: 'text', text: '识别图片中的所有公式，每个公式输出为一行 LaTeX。' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
      ] },
    ],
  }),
});
const j = await r.json().catch(() => null);
console.log('status:', r.status);
console.log('content:', JSON.stringify(j?.choices?.[0]?.message?.content));
console.log('usage:', JSON.stringify(j?.usage));
