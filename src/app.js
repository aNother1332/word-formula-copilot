import { mml2omml } from './vendor/mml2omml.js';
import { fullTextToHtml } from './fulltext.js';

/* ================= 常量 ================= */

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const PROVIDERS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', visionModel: 'deepseek-flash', textModel: 'deepseek-chat' },
  zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', visionModel: 'glm-4.5v', textModel: 'glm-4.6' },
  siliconflow: { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', visionModel: 'Qwen/Qwen2.5-VL-72B-Instruct', textModel: 'deepseek-ai/DeepSeek-V3' },
  dashscope: { label: '阿里云百炼 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', visionModel: 'qwen-vl-max', textModel: 'qwen-plus' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', visionModel: 'google/gemini-2.5-flash', textModel: 'openai/gpt-4o-mini' },
  custom: { label: '自定义', baseUrl: '', visionModel: '', textModel: '' },
};

const VISION_SYSTEM =
  '你是数学公式识别引擎。把图片中的数学公式转换为 LaTeX 代码。' +
  '要求：1) 只输出 LaTeX 代码本身，不要任何解释、不要 $ 或 \\[ 定界符、不要代码块；' +
  '2) 使用标准 LaTeX（amsmath）语法，如 \\frac{}{}、\\sqrt[]{}、^、_；' +
  '3) 只输出一个公式（一行）；4) 严格保持原公式的结构与符号，不要化简。';

const VISION_FULL_SYSTEM =
  '你是笔记转录助手。把图片中的内容整理为可编辑文本，公式一律转写为 LaTeX。' +
  '要求：1) 保留图片中的段落结构与文字顺序，不要增删内容，不要解释、不要总结；' +
  '2) 行内公式用 $...$ 包裹，独立成行的公式用 $$...$$ 包裹，公式内部使用标准 LaTeX（amsmath）语法；' +
  '3) 文字部分保持原文语言；4) 数学符号（分数、上下标、根号等）一律写在公式里，不要用文字描述。';

const NL_SYSTEM =
  '你是数学排版助手。把用户的自然语言描述转换为一个 LaTeX 表达式（标准 LaTeX/amsmath 语法）。' +
  '只输出 LaTeX 代码本身，不要解释、不要定界符。' +
  '例如："y下标1等于sin x的三次方乘以cos x分之一" 对应 y_1 = \\sin^3 x \\cdot \\frac{1}{\\cos x}。';

const DEMO = new URLSearchParams(location.search).has('demo');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= 状态 ================= */

const store = {
  config: { provider: 'deepseek', baseUrl: '', apiKey: '', visionModel: '', textModel: '' },
  stats: { total: 0, requests: 0 },
  session: { total: 0, requests: 0 },
  scope: 'formula',
  mode: 'image',
  image: null, // { dataUrl, base64 }
  result: null, // { latex, tokens, source }
  busy: false,
  officeReady: false,
};

let abortCtrl = null;

/* ================= DOM ================= */

const $ = (id) => document.getElementById(id);
const els = {
  homeView: $('view-home'), settingsView: $('view-settings'),
  homeContent: $('view-home').querySelector('.content'),
  modeSeg: $('mode-seg'), modeThumb: $('mode-thumb'),
  dropzone: $('dropzone'), fileInput: $('file-input'),
  imgPreview: $('img-preview'), previewImg: $('preview-img'), imgStatus: $('img-status'),
  nlInput: $('nl-input'),
  result: $('result'), resultTitle: $('result-title'), resultMeta: $('result-meta'),
  mathPreview: $('math-preview'), latexEdit: $('latex-edit'),
  btnInsert: $('btn-insert'), btnInsertLabel: $('btn-insert').querySelector('.btn-label'),
  btnSpinner: $('btn-insert').querySelector('.btn-spinner'),
  btnCopy: $('btn-copy'), btnRerun: $('btn-rerun'),
  statsText: $('stats-text'), statsDetail: $('stats-detail'),
  demoBanner: $('demo-banner'),
  cfgProvider: $('cfg-provider'), cfgBaseurl: $('cfg-baseurl'), cfgKey: $('cfg-key'),
  cfgVmodel: $('cfg-vmodel'), cfgTmodel: $('cfg-tmodel'),
  testResult: $('test-result'), btnTest: $('btn-test'),
  scopeSeg: $('scope-seg'), scopeThumb: $('scope-thumb'), scopeRow: $('scope-row'),
  insertDiag: $('insert-diag'), insertDiagLines: $('insert-diag-lines'),
  diagLines: $('diag-lines'),
  toastHost: $('toast-host'),
};

/* ================= 工具 ================= */

// 存储防护：WebView2 配置异常时 localStorage 可能抛异常，绝不能让它杀死启动流程
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 存储不可用时静默降级 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function spring({ from = 0, to = 0, velocity = 0, response = 0.35, damping = 1, onUpdate, onComplete }) {
  let v = velocity, x = from, last = performance.now(), raf = 0;
  const omega = (2 * Math.PI) / Math.max(response, 0.01);
  const c = 2 * damping * omega;
  const s = {
    value: x,
    cancel() { cancelAnimationFrame(raf); },
  };
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const a = -omega * omega * (x - to) - c * v;
    v += a * dt;
    x += v * dt;
    s.value = x;
    if (Math.abs(x - to) < 0.001 && Math.abs(v) < 0.02) {
      s.value = x = to;
      onUpdate(x);
      onComplete && onComplete();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(frame);
  }
  if (reducedMotion || Math.abs(to - from) < 0.0001) {
    s.value = to;
    onUpdate(to);
    onComplete && onComplete();
    return s;
  }
  raf = requestAnimationFrame(frame);
  return s;
}

const springs = new Map();
function animate(key, to, opts = {}) {
  const prev = springs.get(key);
  if (prev) prev.cancel();
  const s = spring({ from: prev ? prev.value : opts.from ?? 0, to, ...opts });
  springs.set(key, s);
  return s;
}

function fadeIn(el, from = { opacity: 0, transform: 'translateY(8px)' }) {
  if (reducedMotion) return;
  el.animate([from, { opacity: 1, transform: 'none' }], {
    duration: 300,
    easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  });
}

function toast(type, text, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const dot = document.createElement('span');
  dot.className = 'dot';
  const label = document.createElement('span');
  label.textContent = text;
  el.append(dot, label);
  els.toastHost.appendChild(el);
  fadeIn(el, { opacity: 0, transform: 'translateY(10px) scale(0.96)' });
  setTimeout(() => {
    if (reducedMotion) return el.remove();
    const out = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }],
      { duration: 220, fill: 'forwards', easing: 'ease-out' }
    );
    out.onfinish = () => el.remove();
  }, ms);
}

function fmtK(n) {
  return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
}

/* ================= 诊断 ================= */

const diag = { api: [], insert: [] };
function diagLog(kind, msg) {
  diag[kind].unshift(new Date().toLocaleTimeString() + '  ' + msg);
  if (diag[kind].length > 10) diag[kind].length = 10;
  renderDiag();
}
function renderDiag() {
  const all = [...diag.api, ...diag.insert].slice(0, 12);
  els.diagLines.textContent = all.length ? all.join('\n') : '（暂无）';
}
function showInsertDiag(lines) {
  els.insertDiag.hidden = false;
  els.insertDiagLines.textContent = lines.join('\n');
}

/* ================= 配置 ================= */

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function presetFill(cfg, providerKey) {
  const p = PROVIDERS[providerKey];
  if (!p) return;
  cfg.baseUrl = p.baseUrl;
  cfg.visionModel = p.visionModel;
  cfg.textModel = p.textModel;
}

function loadConfig() {
  const savedRaw = storage.get('fc.config.v1');
  const saved = safeParse(savedRaw) || {};
  const userCfg = window.FORMULA_COPILOT_USER || {};
  const firstRun = !savedRaw;
  const cfg = { provider: firstRun ? (userCfg.provider || 'deepseek') : (saved.provider || 'deepseek') };
  presetFill(cfg, cfg.provider);
  if (firstRun) cfg.apiKey = userCfg.apiKey || '';
  Object.assign(cfg, saved);
  if (!cfg.baseUrl) presetFill(cfg, cfg.provider);
  store.config = cfg;
}

const saveConfig = () => storage.set('fc.config.v1', JSON.stringify(store.config));

/* ================= 统计 ================= */

function loadStats() {
  const s = safeParse(storage.get('fc.stats.v1'));
  if (s) store.stats = s;
  renderStats();
}
function saveStats() {
  storage.set('fc.stats.v1', JSON.stringify(store.stats));
  renderStats();
}
function recordUsage(usage) {
  const n = usage && usage.total_tokens ? usage.total_tokens : 0;
  store.stats.total += n;
  store.stats.requests += 1;
  store.session.total += n;
  store.session.requests += 1;
  saveStats();
}
function renderStats() {
  els.statsText.textContent = `累计 ${fmtK(store.stats.total)} tokens · ${store.stats.requests} 次请求`;
  const avg = store.stats.requests ? Math.round(store.stats.total / store.stats.requests) : 0;
  els.statsDetail.innerHTML =
    `<div><span>本次会话</span><span>${fmtK(store.session.total)} tokens / ${store.session.requests} 次</span></div>` +
    `<div><span>历史累计</span><span>${fmtK(store.stats.total)} tokens / ${store.stats.requests} 次</span></div>` +
    `<div><span>平均每次请求</span><span>${fmtK(avg)} tokens</span></div>`;
}

/* ================= API 层 ================= */

// 带自动重试的请求入口：网络错误 / 429 / 5xx / 推理资源不足 时自动重试 2 次
async function chat(model, messages, opts = {}) {
  const { maxTokens = 8192, thinking = null, retries = 2 } = opts;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 900 : 2200));
    try {
      return await chatOnce(model, messages, maxTokens, thinking);
    } catch (e) {
      lastErr = e;
      if (e.code === 'nokey' || e.code === 'abort') throw e;
      const retryable = e.code === 'network' || e.status === 429 || (e.status >= 500) ||
        (e.apiMsg && /insufficient_system_resource/i.test(e.apiMsg));
      if (!retryable) throw e;
      diagLog('api', `第 ${attempt + 1} 次请求失败（自动重试）: ${friendlyError(e)}`);
    }
  }
  throw lastErr;
}

async function chatOnce(model, messages, maxTokens, thinking) {
  const cfg = store.config;
  if (!cfg.apiKey) {
    const e = new Error('未配置 API Key'); e.code = 'nokey'; throw e;
  }
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  abortCtrl = new AbortController();
  const buildBody = (withThinking) => {
    const body = { model, messages, max_tokens: maxTokens, stream: false };
    if (withThinking && thinking) body.thinking = thinking;
    return body;
  };
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(buildBody(true)),
      signal: abortCtrl.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') { const e = new Error('已取消'); e.code = 'abort'; throw e; }
    const e = new Error('无法连接到 API 地址'); e.code = 'network'; throw e;
  }
  if (!resp.ok) {
    let msg = '';
    try { msg = (await resp.json()).error?.message || ''; } catch { /* ignore */ }
    // 个别兼容端点不认识 thinking 参数：去掉后重试一次
    if (resp.status === 400 && thinking && /thinking|reasoning/i.test(msg)) {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(buildBody(false)),
        signal: abortCtrl.signal,
      });
      if (!resp.ok) {
        let msg2 = '';
        try { msg2 = (await resp.json()).error?.message || ''; } catch { /* ignore */ }
        const e2 = new Error(msg2 || 'HTTP ' + resp.status);
        e2.status = resp.status; e2.apiMsg = msg2; throw e2;
      }
    } else {
      const e = new Error(msg || 'HTTP ' + resp.status);
      e.status = resp.status;
      e.apiMsg = msg;
      throw e;
    }
  }
  const data = await resp.json();
  recordUsage(data.usage);
  const choice = data.choices && data.choices[0];
  return { content: (choice && choice.message && choice.message.content) || '', usage: data.usage, finish: choice && choice.finish_reason };
}

function friendlyError(e) {
  if (e.code === 'nokey') return '请先在设置中填写 API Key';
  if (e.code === 'network') return '网络连接失败，无法访问 API 地址（检查网络与 API 地址）';
  if (e.code === 'abort') return '已取消';
  if (e.status === 401 || e.status === 403) return 'API Key 无效或无权限（HTTP ' + e.status + '）';
  if (e.status === 404) return 'API 地址或模型不存在（HTTP 404），检查地址与模型名';
  if (e.status === 429) return '请求过于频繁或额度不足（HTTP 429），将自动重试';
  if (e.apiMsg && /insufficient_system_resource/i.test(e.apiMsg)) {
    return 'DeepSeek 推理资源不足导致中断（可关闭思考模式规避）';
  }
  if (e.status && e.apiMsg && /image|multimodal|vision|图片|多模态/i.test(e.apiMsg)) {
    return '该模型不支持图片输入，请在设置中更换视觉模型：' + e.apiMsg;
  }
  return e.message || '未知错误';
}

function cleanLatex(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```\s*$/, '');
  s = s.replace(/^\\\(|\\\[/, '').replace(/\\\)|\\\]$/, '');
  if (s.startsWith('$') && s.endsWith('$')) s = s.slice(1, -1);
  if (s.startsWith('$') && s.endsWith('$')) s = s.slice(1, -1);
  return s.replace(/\s+/g, ' ').trim();
}

// 全文模式：规范化模型输出（去代码块围栏，把 \( \) \[ \] 统一成 $ $$ 定界）
function normalizeFullText(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```(?:markdown|md|text)?\s*/i, '').replace(/```\s*$/, '');
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, x) => '$' + x.trim() + '$');
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, x) => '$$' + x.trim() + '$$');
  return s.trim();
}

/* ================= LaTeX → OMML ================= */

function latexToOmml(latex, mode) {
  if (!latex) throw new Error('内容为空');
  const mathml = temml.renderToString(latex, { displayMode: mode === 'block' });
  let oMath = mml2omml(mathml);
  if (!oMath.startsWith('<m:oMath')) {
    oMath = `<m:oMath xmlns:m="${NS_M}" xmlns:w="${NS_W}">${oMath}</m:oMath>`;
  }
  return oMath;
}

/* ================= 插入 Word（多级兜底） ================= */

function wordJsInsert(xml) {
  return new Promise((resolve, reject) => {
    Word.run(async (ctx) => {
      try {
        ctx.document.getSelection().insertOoxml(xml, Word.InsertLocation.replace);
        await ctx.sync();
        resolve(true);
      } catch (e) {
        reject(e);
      }
    }).catch(reject);
  });
}

let lastSetSelectedError = '';

function setSelectedOoxml(xml) {
  return new Promise((resolve) => {
    try {
      Office.context.document.setSelectedDataAsync(
        xml,
        { coercionType: Office.CoercionType.Ooxml },
        (r) => {
          if (r.status === Office.AsyncResultStatus.Succeeded) {
            resolve(true);
          } else {
            lastSetSelectedError = r.error ? (r.error.name || 'Error') + ': ' + r.error.message : '失败（无详细信息）';
            resolve(false);
          }
        }
      );
    } catch (e) {
      lastSetSelectedError = e.message;
      resolve(false);
    }
  });
}

async function insertOoxmlSmart(oMath, mode) {
  const errors = [];
  const canWordJs = window.Word && Office.context.requirements.isSetSupported('WordApi', '1.1');
  const para = (inner) => `<w:p xmlns:w="${NS_W}" xmlns:m="${NS_M}">${inner}</w:p>`;
  const blockPara = para(
    `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${oMath}</m:oMathPara>`
  );
  // 完整文档形式：模仿 Word 自身 getOoxml() 的输出（全套命名空间），兼容性最好
  const FULLNS =
    `xmlns:w="${NS_W}" xmlns:m="${NS_M}"` +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' +
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
    ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"';
  const fullDoc = (body) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${FULLNS}><w:body>${body}</w:body></w:document>`;

  // 由精确到宽松依次尝试；行内插入若被拒绝则降级为独立段落
  const tries = mode === 'inline'
    ? [
        { name: '行内片段(oMath)', xml: oMath, result: 'ok' },
        { name: '段落片段(w:p+oMath)', xml: para(oMath), result: 'degraded' },
        { name: '完整文档(w:document)', xml: fullDoc(para(oMath)), result: 'degraded' },
      ]
    : [
        { name: '段落片段(oMathPara)', xml: blockPara, result: 'ok' },
        { name: '完整文档(w:document)', xml: fullDoc(blockPara), result: 'ok' },
      ];

  for (const t of tries) {
    if (canWordJs) {
      try { await wordJsInsert(t.xml); diagLog('insert', `${t.name} → WordJS 成功`); return t.result; }
      catch (e) { errors.push(`${t.name} [WordJS] ${e && (e.message || e)}`); }
    }
    if (await setSelectedOoxml(t.xml)) { diagLog('insert', `${t.name} → setSelectedDataAsync 成功`); return t.result; }
    errors.push(`${t.name} [setSelectedDataAsync] ${lastSetSelectedError}`);
  }
  errors.forEach((m) => diagLog('insert', m));
  return null;
}

function htmlOf(latex, mode) {
  const mathml = temml.renderToString(latex, { displayMode: mode === 'block' });
  return mathml.includes('xmlns=')
    ? mathml
    : mathml.replace('<math>', '<math xmlns="http://www.w3.org/1998/Math/MathML">');
}

function ssHtml(html) {
  return new Promise((resolve) => {
    try {
      Office.context.document.setSelectedDataAsync(html, { coercionType: Office.CoercionType.Html }, (r) => {
        if (r.status === Office.AsyncResultStatus.Succeeded) {
          resolve(true);
        } else {
          lastSetSelectedError = r.error ? (r.error.name || 'Error') + ': ' + r.error.message : '失败';
          resolve(false);
        }
      });
    } catch (e) { lastSetSelectedError = e.message; resolve(false); }
  });
}

// 仅公式插入：OOXML 通道（部分构建可用）与 HTML+MathML 通道（Word 原生转换）按环境择优
async function insertFormulaOnly(content) {
  let oMath = null;
  try { oMath = latexToOmml(content, 'block'); }
  catch (e) { return { how: 'convert-error', err: e.message }; }
  let html = null;
  try { html = htmlOf(content, 'block'); } catch (e) { html = null; }

  const preferHtml = storage.get('fc.insertChannel') === 'html';
  const tryOoxml = async () => {
    const r = await insertOoxmlSmart(oMath, 'block');
    if (r) storage.set('fc.insertChannel', 'ooxml');
    return r;
  };
  const tryHtml = async () => {
    if (!html) return null;
    if (await ssHtml(html)) {
      storage.set('fc.insertChannel', 'html');
      diagLog('insert', 'HTML+MathML 通道成功');
      return 'ok';
    }
    diagLog('insert', 'HTML 通道失败: ' + lastSetSelectedError);
    return null;
  };

  if (preferHtml) {
    const h = await tryHtml(); if (h) return { how: h };
    const o = await tryOoxml(); if (o) return { how: o };
  } else {
    const o = await tryOoxml(); if (o) return { how: o };
    const h = await tryHtml(); if (h) return { how: h };
  }
  return { how: null };
}

async function insertResult() {
  const result = store.result;
  if (!result) return;
  const content = els.latexEdit.value.trim();
  if (!content) { toast('error', '内容为空'); return; }

  if (!store.officeReady) { toast('info', '浏览器预览模式：跳过插入 Word'); return; }

  setInsertBusy(true);
  els.insertDiag.hidden = true;
  try {
    if (store.scope === 'full') {
      // 全文：文字 + MathML 内联公式，经 HTML 通道写入（Word 自动转换为公式对象）
      let html;
      try { html = fullTextToHtml(content, (l, dm) => temml.renderToString(l, { displayMode: dm })); }
      catch (e) { toast('error', '内容转换失败：' + e.message); return; }
      if (await ssHtml(html)) {
        toast('success', '已插入全文（公式已转换为公式对象）');
      } else {
        showInsertDiag(['HTML 通道失败: ' + lastSetSelectedError]);
        await new Promise((resolve) => {
          Office.context.document.setSelectedDataAsync(content, { coercionType: Office.CoercionType.Text }, () => resolve());
        });
        toast('error', '插入失败，已退化为纯文本（详见卡片下方的诊断信息）', 6000);
      }
      return;
    }
    const r = await insertFormulaOnly(content);
    if (r.how === 'convert-error') {
      toast('error', 'LaTeX 转换失败：' + r.err);
    } else if (r.how === 'ok') {
      toast('success', '已插入单行公式');
    } else if (r.how === 'degraded') {
      toast('info', '已作为独立段落插入（当前版本不支持行内插入）');
    } else {
      showInsertDiag(diag.insert.slice(0, 6));
      // 最终兜底：插入 LaTeX 文本 + 提示 Alt+=
      await new Promise((resolve) => {
        Office.context.document.setSelectedDataAsync(content, { coercionType: Office.CoercionType.Text }, () => resolve());
      });
      toast('error', '公式对象插入失败，已退化为插入 LaTeX 文本（详见卡片下方的诊断信息）', 6000);
    }
  } finally {
    setInsertBusy(false);
  }
}

function setInsertBusy(busy) {
  els.btnInsert.disabled = busy;
  els.btnSpinner.hidden = !busy;
  els.btnInsertLabel.textContent = busy ? '插入中…' : '插入到 Word';
}

/* ================= 结果卡片 ================= */

function showResult({ latex, tokens, source }) {
  store.result = { latex, tokens, source };
  els.resultTitle.textContent = source === '识图' ? '识图结果'
    : source === '描述' ? '生成结果'
    : source === '全文' ? '全文结果'
    : 'LaTeX';
  els.latexEdit.value = latex;
  els.latexEdit.rows = store.scope === 'full' ? 6 : 2;
  els.resultMeta.textContent = tokens ? `${tokens} tokens` : '';
  els.btnCopy.hidden = false;
  els.btnRerun.hidden = !(source === '识图' && store.image);
  if (els.result.hidden) {
    els.result.hidden = false;
    fadeIn(els.result, { opacity: 0, transform: 'translateY(14px) scale(0.97)' });
  }
  renderPreview(true);
  els.result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
}

let previewTimer = 0;
function renderPreview(immediate = false) {
  const run = () => {
    const content = els.latexEdit.value.trim();
    if (!content) { els.mathPreview.innerHTML = ''; return; }
    try {
      if (store.scope === 'full') {
        els.mathPreview.innerHTML = fullTextToHtml(content, (l, dm) => temml.renderToString(l, { displayMode: dm }));
      } else {
        els.mathPreview.innerHTML = temml.renderToString(content, { displayMode: true });
      }
    } catch (e) {
      els.mathPreview.innerHTML = '<span class="preview-err">' + (store.scope === 'full' ? '内容中部分公式语法有误' : 'LaTeX 语法有误') + '，无法完整预览</span>';
    }
  };
  clearTimeout(previewTimer);
  if (immediate) run();
  else previewTimer = setTimeout(run, 250);
}

/* ================= 识图流程 ================= */

async function runVision() {
  if (!store.image || store.busy) return;
  if (!store.config.apiKey) {
    toast('error', '请先在设置中填写 API Key');
    openSettings();
    return;
  }
  store.busy = true;
  const isFull = store.scope === 'full';
  const t0 = performance.now();
  const tick = setInterval(() => {
    els.imgStatus.textContent = `正在识别… ${((performance.now() - t0) / 1000).toFixed(0)}s`;
  }, 1000);
  els.imgStatus.textContent = '正在识别… 0s';
  els.btnRerun.disabled = true;
  try {
    const req = () => chat(store.config.visionModel, [
      { role: 'system', content: isFull ? VISION_FULL_SYSTEM : VISION_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: isFull ? '转录图片中的内容，公式用 LaTeX 表示。' : '识别图片中的数学公式并输出 LaTeX。' },
          { type: 'image_url', image_url: { url: store.image.dataUrl } },
        ],
      },
    ], { maxTokens: 8192, thinking: { type: 'disabled' } });
    // 推理型模型思考 token 不可控：截断则自动重试一次
    let { content, usage, finish } = await req();
    let resultText = isFull ? normalizeFullText(content) : cleanLatex(content);
    if (!resultText && finish === 'length') {
      ({ content, usage, finish } = await req());
      resultText = isFull ? normalizeFullText(content) : cleanLatex(content);
    }
    if (!resultText) {
      throw new Error(finish === 'length' ? '模型思考过长导致输出被截断，请重试或更换视觉模型' : '模型未返回有效内容');
    }
    showResult({ latex: resultText, tokens: usage && usage.total_tokens, source: isFull ? '全文' : '识图' });
    els.imgStatus.textContent = `完成，用时 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
  } catch (e) {
    if (e.code !== 'abort') {
      els.imgStatus.textContent = '';
      toast('error', friendlyError(e), 5200);
    }
  } finally {
    store.busy = false;
    els.btnRerun.disabled = false;
    clearInterval(tick);
  }
}

/* ================= 描述流程 ================= */

async function generateFromText() {
  const text = els.nlInput.value.trim();
  if (!text || store.busy) return;
  if (!store.config.apiKey) {
    toast('error', '请先在设置中填写 API Key');
    openSettings();
    return;
  }
  store.busy = true;
  setInsertBusy(true);
  els.btnInsertLabel.textContent = '生成中…';
  els.btnSpinner.hidden = false;
  try {
    const model = store.config.textModel || store.config.visionModel;
    const { content, usage } = await chat(model, [
      { role: 'system', content: NL_SYSTEM },
      { role: 'user', content: text },
    ]);
    const latex = cleanLatex(content);
    if (!latex) throw new Error('模型未返回有效内容');
    showResult({ latex, tokens: usage && usage.total_tokens, source: '描述' });
  } catch (e) {
    if (e.code !== 'abort') toast('error', friendlyError(e), 5200);
  } finally {
    store.busy = false;
    setInsertBusy(false);
  }
}

/* ================= 图片处理 ================= */

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    toast('error', '请选择图片文件');
    return;
  }
  try {
    let dataUrl;
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageEl(objectUrl);
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale < 1 || file.size > 1.5 * 1024 * 1024) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      } else {
        dataUrl = await fileToDataUrl(file);
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    store.image = { dataUrl };
    els.previewImg.src = dataUrl;
    els.dropzone.hidden = true;
    els.imgPreview.hidden = false;
    els.imgStatus.textContent = '';
    runVision(); // 识别完成后自动开始
  } catch (e) {
    toast('error', '图片读取失败');
  }
}

function clearImage() {
  store.image = null;
  els.previewImg.removeAttribute('src');
  els.imgPreview.hidden = true;
  els.dropzone.hidden = false;
  els.imgStatus.textContent = '';
}

/* ================= 设置页导航 ================= */

let settingsOpen = false;

function layoutNav(p) {
  els.homeView.style.transform = `translateX(${-30 * p}%)`;
  els.settingsView.style.transform = `translateX(${(1 - p) * 100}%)`;
}

function openSettings() {
  if (settingsOpen) return;
  settingsOpen = true;
  els.settingsView.style.visibility = 'visible';
  els.settingsView.setAttribute('aria-hidden', 'false');
  animate('nav', 1, { response: 0.4, damping: 1, onUpdate: layoutNav });
}
function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  els.settingsView.setAttribute('aria-hidden', 'true');
  animate('nav', 0, {
    response: 0.4, damping: 1, onUpdate: layoutNav,
    onComplete: () => { if (!settingsOpen) els.settingsView.style.visibility = 'hidden'; },
  });
}

function applyConfigToInputs() {
  const cfg = store.config;
  els.cfgProvider.value = cfg.provider;
  els.cfgBaseurl.value = cfg.baseUrl || '';
  els.cfgKey.value = cfg.apiKey || '';
  els.cfgVmodel.value = cfg.visionModel || '';
  els.cfgTmodel.value = cfg.textModel || '';
}

function readInputsToConfig() {
  const cfg = store.config;
  cfg.baseUrl = els.cfgBaseurl.value.trim();
  cfg.apiKey = els.cfgKey.value.trim();
  cfg.visionModel = els.cfgVmodel.value.trim();
  cfg.textModel = els.cfgTmodel.value.trim();
}

/* ================= 能力测试 ================= */

async function smallTestImage() {
  try {
    const r = await fetch('/test/formula.png');
    if (r.ok) return await fileToDataUrl(await r.blob());
  } catch { /* ignore */ }
  // 兜底：canvas 画一个简单式子
  const c = document.createElement('canvas');
  c.width = 240; c.height = 90;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 90);
  g.fillStyle = '#000'; g.font = '36px Cambria Math, serif';
  g.fillText('x^2 + 1', 40, 58);
  return c.toDataURL('image/png');
}

async function testConnection() {
  const cfg = store.config;
  readInputsToConfig();
  saveConfig();
  els.testResult.hidden = false;
  els.testResult.className = 'test-result';
  els.testResult.textContent = '正在测试…（先测文本连接，再测识图能力）';
  els.btnTest.disabled = true;

  const show = (cls, text) => {
    els.testResult.className = 'test-result ' + cls;
    els.testResult.textContent = text;
    els.btnTest.disabled = false;
  };

  try {
    // 1) 文本连通性
    const textModel = cfg.textModel || cfg.visionModel;
    await chat(textModel, [{ role: 'user', content: '请只回复两个字：正常' }], { maxTokens: 600 });
    // 2) 视觉能力
    try {
      const dataUrl = await smallTestImage();
      const { content } = await chat(cfg.visionModel, [
        { role: 'user', content: [
          { type: 'text', text: '图片里是什么公式？只输出 LaTeX。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] },
      ]);
      if (content && content.trim()) {
        show('ok', `✅ 连接正常；视觉模型 ${cfg.visionModel} 支持识图（返回：${content.trim().slice(0, 40)}…）`);
      } else {
        show('warn', `⚠️ 连接正常，但 ${cfg.visionModel} 对图片返回为空，识图可能不稳定，建议更换视觉模型。`);
      }
    } catch (ve) {
      if (ve.status && ve.apiMsg && /image|multimodal|vision|图片|多模态/i.test(ve.apiMsg)) {
        show('warn', `⚠️ 连接正常，但模型 ${cfg.visionModel} 不支持图片输入：请在「视觉模型」中填写多模态模型。`);
      } else {
        show('warn', `⚠️ 文本模型可用，但识图测试失败：${friendlyError(ve)}`);
      }
    }
  } catch (e) {
    show('err', '❌ ' + friendlyError(e));
  }
}

/* ================= 分段控件 ================= */

function positionSegThumb(seg, thumb, btn) {
  thumb.style.width = btn.offsetWidth + 'px';
  const target = btn.offsetLeft - (seg.clientLeft || 0);
  thumb.style.transform = `translateX(${target - 2}px)`;
}

function bindSeg(seg, thumb, onPick) {
  const btns = [...seg.querySelectorAll('button')];
  const active = seg.querySelector('.is-active') || btns[0];
  requestAnimationFrame(() => positionSegThumb(seg, thumb, active));
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      btns.forEach((b) => b.classList.toggle('is-active', b === btn));
      const target = btn.offsetLeft - (seg.clientLeft || 0) - 2;
      animate('seg:' + seg.id, target, {
        response: 0.3, damping: 1,
        onUpdate: (x) => { thumb.style.transform = `translateX(${x}px)`; },
      });
      onPick(btn);
    });
  });
  addEventListener('resize', () => {
    const a = seg.querySelector('.is-active');
    if (a) positionSegThumb(seg, thumb, a);
  });
}

function switchMode(mode) {
  store.mode = mode;
  const showImage = mode === 'image';
  els.dropzone.hidden = showImage ? !!(store.image) : true;
  if (!showImage) els.imgPreview.hidden = true;
  else if (store.image) els.imgPreview.hidden = false;
  els.scopeRow.hidden = !showImage; // 全文/仅公式仅用于识图；描述模式固定仅公式
  $('pane-image').hidden = !showImage;
  $('pane-describe').hidden = showImage;
}

function setScope(scope) {
  store.scope = scope;
  storage.set('fc.scope', scope);
  els.scopeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.scope === scope));
  if (!els.result.hidden) {
    els.latexEdit.rows = scope === 'full' ? 6 : 2;
    renderPreview(true);
  }
}

/* ================= 事件绑定 ================= */

function bindEvents() {
  // 顶栏
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-back').addEventListener('click', closeSettings);

  // 分段控件
  bindSeg(els.modeSeg, els.modeThumb, (btn) => switchMode(btn.dataset.mode));
  bindSeg(els.scopeSeg, els.scopeThumb, (btn) => setScope(btn.dataset.scope));

  // 识图
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  els.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropzone.classList.add('is-drag'); });
  els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('is-drag'));
  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('is-drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  els.fileInput.addEventListener('change', () => {
    const f = els.fileInput.files && els.fileInput.files[0];
    if (f) handleFile(f);
    els.fileInput.value = '';
  });
  $('btn-repick').addEventListener('click', () => els.fileInput.click());
  $('btn-remove').addEventListener('click', () => { clearImage(); els.imgStatus.textContent = ''; });

  // 粘贴（输入框内的粘贴不拦截）
  addEventListener('paste', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (items) {
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            if (store.mode !== 'image') {
              els.modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'image'));
              switchMode('image');
            }
            handleFile(f);
          }
          return;
        }
      }
    }
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (/\\(frac|d?frac|sin|cos|tan|sum|int|sqrt|alpha|beta|gamma|pi|cdot|times|left|log|lim)/i.test(text)) {
      e.preventDefault();
      showResult({ latex: cleanLatex(text), tokens: 0, source: '粘贴' });
      toast('info', '检测到 LaTeX，已放入结果卡片');
    }
  });

  // 描述
  els.nlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateFromText();
    }
  });

  // 结果卡片
  els.latexEdit.addEventListener('input', () => renderPreview(false));
  els.btnInsert.addEventListener('click', insertResult);
  els.btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.latexEdit.value);
      toast('success', 'LaTeX 已复制');
    } catch { toast('error', '复制失败'); }
  });
  els.btnRerun.addEventListener('click', runVision);

  // 设置
  const persist = () => { readInputsToConfig(); saveConfig(); };
  els.cfgProvider.addEventListener('change', () => {
    store.config.provider = els.cfgProvider.value;
    if (PROVIDERS[store.config.provider]) presetFill(store.config, store.config.provider);
    applyConfigToInputs();
    saveConfig();
  });
  [els.cfgBaseurl, els.cfgKey, els.cfgVmodel, els.cfgTmodel].forEach((i) => i.addEventListener('change', persist));
  $('btn-toggle-key').addEventListener('click', () => {
    const isPw = els.cfgKey.type === 'password';
    els.cfgKey.type = isPw ? 'text' : 'password';
    $('btn-toggle-key').textContent = isPw ? '隐藏' : '显示';
  });
  els.btnTest.addEventListener('click', testConnection);
  $('btn-reset-stats').addEventListener('click', () => {
    store.stats = { total: 0, requests: 0 };
    store.session = { total: 0, requests: 0 };
    saveStats();
    toast('success', '统计已清零');
  });

  // 顶栏毛玻璃发丝线（滚动到边缘才出现）
  [els.homeContent, $('view-settings').querySelector('.content')].forEach((c) => {
    const view = c.closest('.view');
    const update = () => view.classList.toggle('is-scrolled', c.scrollTop > 4);
    c.addEventListener('scroll', update, { passive: true });
    update();
  });
}

/* ================= 启动 ================= */

async function detectOffice() {
  if (DEMO) return false;
  if (!(window.Office && typeof Office.onReady === 'function')) {
    // office.js 从微软 CDN 加载，网络慢时稍作等待
    const loaded = await new Promise((res) => {
      let n = 0;
      const t = setInterval(() => {
        if (window.Office && typeof Office.onReady === 'function') { clearInterval(t); res(true); }
        else if (++n > 16) { clearInterval(t); res(false); }
      }, 500);
    });
    if (!loaded) return false;
  }
  const info = await Promise.race([
    new Promise((res) => Office.onReady((i) => res(i))),
    new Promise((res) => setTimeout(() => res(null), 4000)),
  ]);
  return !!(info && info.host);
}

async function init() {
  loadConfig();
  loadStats();
  store.scope = storage.get('fc.scope') || 'formula';
  els.scopeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.scope === store.scope));
  applyConfigToInputs();
  bindEvents();
  store.officeReady = await detectOffice();
  if (store.officeReady) {
    runSelfTest(); // 一次性诊断，结果写到本地 debug-report.json
  } else {
    els.demoBanner.textContent = DEMO
      ? '浏览器预览模式 — 在 Word 中打开后所有功能可用'
      : '未检测到 Office 运行时：若是首次加载请稍候；长期如此请检查网络（office.js 需联网加载）';
    els.demoBanner.hidden = false;
  }
}

// 一次性插入自检：在真实 Word 里逐层测试，结果上报到本地服务
async function runSelfTest() {
  if (storage.get('fc.selftest3') === 'done') return;
  const report = { time: new Date().toISOString(), results: {} };
  const results = report.results;
  try {
    const mathml = temml.renderToString('y_1 = \\sin^3 x \\cdot \\frac{1}{\\cos x}', { displayMode: false });
    // 确保 xmlns 存在（Word 靠它识别 MathML）
    const mathmlNs = mathml.includes('xmlns=') ? mathml : mathml.replace('<math>', '<math xmlns="http://www.w3.org/1998/Math/MathML">');

    const readBack = () => new Promise((resolve) => {
      try {
        Office.context.document.getSelectedDataAsync('ooxml', (r) => {
          if (r.status === Office.AsyncResultStatus.Succeeded) {
            const v = r.value || '';
            resolve(v.includes('<m:oMath') ? ('✓已是公式对象(oMath) 前200字:' + v.replace(/\s+/g, ' ').slice(v.indexOf('<m:oMath'), v.indexOf('<m:oMath') + 200)) : '✗未转换 前200字:' + v.replace(/\s+/g, ' ').slice(0, 200));
          } else resolve('读回失败 ' + (r.error && r.error.message));
        });
      } catch (e) { resolve('throw ' + e.message); }
    });
    const ssHtml = (html) => new Promise((resolve) => {
      try {
        Office.context.document.setSelectedDataAsync(html, { coercionType: Office.CoercionType.Html }, (r) =>
          resolve(r.status === Office.AsyncResultStatus.Succeeded ? 'ok' : 'setSelected ' + ((r.error && (r.error.name + ': ' + r.error.message)) || 'fail')));
      } catch (e) { resolve('throw ' + e.message); }
    });

    results.S9mathmlHead = mathmlNs.slice(0, 160);
    results.S9write = await ssHtml(mathmlNs);
    results.S9readback = await readBack();

    results.S10write = await ssHtml('<html><body>' + mathmlNs + '</body></html>');
    results.S10readback = await readBack();

    // 对照：displayMode 块级公式
    const mathmlBlock = temml.renderToString('E = mc^2', { displayMode: true });
    const mathmlBlockNs = mathmlBlock.includes('xmlns=') ? mathmlBlock : mathmlBlock.replace('<math>', '<math xmlns="http://www.w3.org/1998/Math/MathML">');
    results.S11write = await ssHtml(mathmlBlockNs);
    results.S11readback = await readBack();

    results.UA = navigator.userAgent.slice(0, 90);
    storage.set('fc.selftest3', 'done');
  } catch (e) {
    report.fatal = e.message || String(e);
  }
  try { fetch('/__debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => {}); } catch { /* ignore */ }
}

// 任何启动/运行时错误都显示在界面上，绝不无声死亡
function fatal(e) {
  const msg = (e && (e.message || String(e))) || '未知错误';
  try {
    els.demoBanner.textContent = '⚠ 启动出错：' + msg;
    els.demoBanner.style.color = 'var(--red)';
    els.demoBanner.hidden = false;
  } catch { /* ignore */ }
  if (window.console) console.error('[公式助手]', e);
}
window.addEventListener('error', (e) => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));
init().catch(fatal);
