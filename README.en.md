# Formula Copilot for Word

<div align="center">

**In Microsoft Word: screenshot / natural language → LaTeX → native equation, one click**

[简体中文](README.md) | [English](README.en.md)

![Describe to equation](docs/screenshots/describe.png)

</div>

---

## ⚠️ Please read before installing

> **The installation process of the current version may run into compatibility issues** depending on your Office build and network environment (add-in sideloading quirks, the Office Store dialog freezing, broken OOXML write channels on certain Office builds, etc.). The project has been verified on Office Home 2024 (Windows, build 16.0.20326), but a manual install may still hit issues not covered by this document.
>
> **⭐ We strongly recommend letting an AI coding agent (ZCode / Claude Code / Cursor, etc.) install it for you**: hand the repository URL to the agent and ask it to "install this Word add-in". It will clone the repo, install dependencies, generate certificates, sideload into Word and debug automatically — the diagnostics tooling is included (see [Option 1: install with an AI agent](#option-1-install-with-an-ai-agent-recommended)).
>
> Manual installation instructions are still provided [below](#option-2-manual-installation).

---

## Features

- **Screenshot → equation**: upload an image or just press `Ctrl+V` to paste a screenshot; it is recognized as LaTeX automatically
- **Natural language → equation**: describe a formula in plain words and press Enter
- **Inline / display** insertion modes; inserts **native Word equation objects** (fully editable, not images)
- **Live equation preview** (Temml / MathML)
- **Multiple providers**: DeepSeek (default) / Zhipu GLM / SiliconFlow / Alibaba Qwen / OpenRouter / any OpenAI-compatible API
- **One-click self test**: verifies connectivity and whether the model truly supports image input
- **Token usage tracking**: per request / session / total
- **Resilient insertion pipeline**: if the OOXML channel fails, it automatically falls back to an **HTML+MathML channel** (Word converts it natively), then to LaTeX text + `Alt+=`

| Recognize | Settings |
| --- | --- |
| ![Recognize](docs/screenshots/home.png) | ![Settings](docs/screenshots/settings.png) |

## How it works

```
screenshot / description
    ↓  vision model (deepseek-flash etc., thinking disabled for stability)
  LaTeX
    ├→ temml → MathML → mathml2omml → OMML ── insertOoxml / setSelectedDataAsync   (OOXML channel)
    ├→ MathML ──────────────────────────── setSelectedDataAsync(HTML)              (HTML channel, Word converts natively)
    └→ LaTeX text + Alt+= hint                                                     (last resort)
```

Channels degrade automatically; whichever works on your Office build is remembered and preferred.

## Installation

### Option 1: install with an AI agent (recommended)

Give the repository URL to an AI coding agent and ask it to "install this Word add-in". The repo ships with:

- Diagnostic scripts (`test/cdp-probe.mjs` and friends) that attach to the task pane WebView2 and surface real errors
- The local HTTPS server and self-test logic
- Known issues and fixes (see Troubleshooting below)

The agent will handle: clone → `npm install` → generate & trust the localhost certificate → start the local server → sideload into Word → read diagnostics and fix issues as they appear — and set up `start-word.bat` as the daily entry point.

### Option 2: manual installation

**Prerequisites**: Windows 10/11, [Node.js](https://nodejs.org) ≥ 18, Word 2019/2021/2024 (perpetual) or Microsoft 365, network access to your model provider.

```bash
git clone https://github.com/aNother1332/word-formula-copilot.git
cd word-formula-copilot
npm install
```

**1. Generate and trust a local certificate** (Office requires HTTPS):

```bash
mkdir certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout certs/localhost-key.pem -out certs/localhost-cert.pem \
  -subj "//CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
certutil -user -addstore Root "%cd%\certs\localhost-cert.pem"
```

**2. Configure your API key**:

```bash
copy src\user.config.example.js src\user.config.js
# edit src/user.config.js and put in your key (this file is gitignored)
```
You can also fill it in later in the add-in settings pane.

**3. Start the local server**:

```bash
npm start
```

**4. Sideload into Word** (either):

- **Official debugging tool** (recommended, verified in this project's environment):
  ```bash
  npx -y office-addin-debugging start manifest.xml
  ```
  Word opens automatically with the add-in loaded.
- **Upload inside Word**: Insert → Get Add-ins → My Add-ins → Upload My Add-in → pick `manifest.xml`.
  ⚠️ That dialog loads the Microsoft Store online and may hang on some networks — if it freezes, use the command-line method above.

**5. Configure the provider and models** (gear icon in the pane), then click "Test connection & vision capability".

### Daily launch (important, please read)

On some Office builds (**verified on Office Home 2024**), a developer-sideloaded add-in **only appears in the Word session that starts right after the sideload command** — afterwards, opening Word normally may show no add-in at all. This is a version-specific sideload quirk, not a failed installation.

That is why the repo ships **`start-word.bat`**: double-click it and it loads the add-in and starts Word automatically (takes seconds). **Create a desktop shortcut to it — that is your daily entry point.** If Word is already running, the script asks you to close it first (the sideload registration must be in place at the moment Word starts).

> Technical background: the `Wef\Developer` registry sideload entry is one-shot, and some builds ignore it entirely; `office-addin-debugging` launches Word with a generated document linked to the add-in, which proved to be the most reliable channel in practice.
>
> Alternative: run `npx -y office-addin-debugging start manifest.xml` manually each time — same effect.

## Usage

1. Paste a screenshot with `Ctrl+V` (or click the drop zone to upload) — recognition starts automatically
2. Check the preview and the LaTeX (editable), choose **inline** or **display**
3. Place the cursor where the formula should go → click **Insert to Word**

## Provider reference

| Provider | Vision model | Text model | Base URL |
| --- | --- | --- | --- |
| DeepSeek (default) | `deepseek-flash` | `deepseek-chat` | `https://api.deepseek.com` |
| Zhipu GLM | `glm-4.5v` | `glm-4.6` | `https://open.bigmodel.cn/api/paas/v4` |
| SiliconFlow | `Qwen/Qwen2.5-VL-72B-Instruct` | `deepseek-ai/DeepSeek-V3` | `https://api.siliconflow.cn/v1` |
| Alibaba Bailian | `qwen-vl-max` | `qwen-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenRouter | `google/gemini-2.5-flash` | any | `https://openrouter.ai/api/v1` |

> DeepSeek's `deepseek-flash` is a reasoning model; this project calls it with thinking disabled (`thinking: disabled`) for speed and stability. Adjust models in the settings pane as needed.

## Troubleshooting

- **The add-in only shows up when launched via the script, not when I open Word normally**: that is a version-specific sideload quirk (verified on Office Home 2024). Use `start-word.bat` daily (a desktop shortcut helps), or run the sideload command manually each time.
- **The "Get Add-ins" dialog freezes**: it loads the Microsoft Store online and often stalls on some networks. Sideload with `npx office-addin-debugging start manifest.xml` instead.
- **Only LaTeX text gets inserted, not an equation**: your Office build's OOXML write channel is broken (reproduced on one build here — even plain paragraphs failed). The add-in automatically switches to the **HTML+MathML channel**, which Word converts natively into an equation object; the red diagnostics box under the result card shows per-layer errors.
- **Recognition is slow**: thinking is already disabled for DeepSeek flash (~200–300 tokens per call); switch to Qwen-VL / GLM-4V if needed.
- **Editing a formula**: inserted equations are native Word objects — click and edit, or tweak the LaTeX and re-insert.
- **Remove the local certificate**: `certutil -user -delstore Root localhost`

## Development & testing

```bash
npm start                 # local server (3000 HTTPS / 3100 HTTP)
npm run test              # DeepSeek API smoke test (needs DEEPSEEK_API_KEY env var)
node test/screenshot.mjs  # regenerate README screenshots
node test/cdp-probe.mjs   # attach to the task pane WebView2 (needs the debug port)
```

Built with vanilla HTML/CSS/JS (no framework) · [Office.js](https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins) · [Temml](https://temml.org) (LaTeX→MathML) · [mathml2omml](https://github.com/fiduswriter/mathml2omml) (MathML→OMML) · local Node HTTPS server.

## License

[MIT](LICENSE)
