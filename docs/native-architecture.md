# Windows 宿主设计与验证

## 问题与调研

旧版本依赖 `office-addin-debugging` 创建的开发者侧载会话，界面还依赖 localhost HTTPS 服务和手工证书。在部分永久版 Office 上，下一次普通启动 Word 时开发者加载项不会重新出现。

2026-10-20 检查本机 OfficePlus：在 `HKLM\SOFTWARE\Microsoft\Office\Word\Addins\MSOfficePLUS` 的 Office 注册表视图中，`LoadBehavior=3`，`Manifest` 指向 `MSOPWordAddin.vsto|vstolocal`。本机登记的版本路径为 `3.16.0.55628`。这证明这台机器上的 OfficePlus 使用 VSTO/COM 应用级加载机制；没有对其内部代码做反编译，也不推断所有 OfficePlus 版本都使用相同实现。

资料依据：

- [Microsoft：使用托管 COM 加载项自定义功能区](https://learn.microsoft.com/en-us/office/vba/library-reference/concepts/customize-the-office-fluent-ribbon-by-using-a-managed-com-add-in)：`IRibbonExtensibility`、Ribbon XML 和 HKCU Word Addins 的 `LoadBehavior=3`。
- [Microsoft：使用扩展接口自定义界面](https://learn.microsoft.com/en-us/visualstudio/vsto/customizing-ui-features-by-using-extensibility-interfaces?view=visualstudio)：COM 可直接实现 `ICustomTaskPaneConsumer`，并使用 COM 可见的 Windows Forms UserControl。
- [Microsoft：ICTPFactory.CreateCTP](https://learn.microsoft.com/en-us/dotnet/api/microsoft.office.core.ictpfactory.createctp?view=office-pia)：用 ActiveX 控件 ProgID 和文档窗口建立任务窗格。
- [联想：OfficePlus 功能的启用与关闭](https://iknow.lenovo.com.cn/detail/435210)：OfficePlus 通过 Office 的 COM 加载项管理入口启用。

## 选择

采用 .NET Framework COM 加载项，直接实现 Office 接口，复用现有 HTML/CSS/JS 界面。VSTO 可以实现相同目标，但此处使用直接 COM 实现，减少终端用户额外安装 VSTO Runtime 和信任发布清单的步骤。

编译通过 `/link` 嵌入已安装 Office 的微软互操作接口定义，不维护手写 COM vtable 或 GUID 合约，终端运行无需单独分发 Office PIA。程序按 AnyCPU 编译，安装器根据 WINWORD.EXE 的 PE 架构选择 x86/x64 WebView2Loader。

## 生命周期与接口

- `Connect.OnConnection` 仅保存 Word 引用和提供诊断自动化对象，不创建浏览器、不联网、不写文档。
- `GetCustomUI` 将按钮加入 `TabHome`；点击后用 Office 的 `ICTPFactory` 创建文档窗口专属任务窗格。
- `FormulaPane` 是 COM 可见的 WinForms UserControl。浏览器初始化调度到控件所属线程，避免跨线程创建子控件。
- WebView2 使用虚拟 HTTPS 主机 `formula-copilot.local` 映射安装目录中的 `web/`，无需端口或证书。拒绝跨来源导航、弹出窗口、任意宿主对象和无关权限。
- `native-host.js` 仅提供带请求 ID 和超时的消息桥。宿主只接受可信来源的 `ping`、`insertOoxml`、`insertText`，不暴露任意 COM、文件或 shell 执行能力。
- 插入定位到任务窗格所属 Word.Window 的选区；WordprocessingML 包装成 Flat OPC 后调用 `Range.InsertXML`。全文中的文字经过 XML 转义，公式使用 OMML。
- 打开新文档时按窗口创建独立窗格；每次打开工具清理已失效窗格，避免复用过期窗口句柄。
- 用户设置按固定虚拟主机保存在 WebView2 Profile 中，修复和卸载不会删设置。

旧 Office.js 宿主由 `host-loader.js` 在非原生模式下加载 Office.js，保留开发和浏览器预览用途；原生模式不加载 Office CDN。原来会写入文档的启动自检已移除。

## 安装

构建产物包含托管程序集、WebView2 托管组件、x86/x64 原生加载器、界面资源和安装/修复/卸载脚本。当前用户注册在 HKCU 下，Word `LoadBehavior=3`。不需要登录启动项、计划任务、后台 Node 服务、修改 Word 快捷方式或文件关联。

SDK 下载版本固定并验证 SHA-256；缺少运行时时下载微软官方引导器并验证 Authenticode 签名。安装的发布文件移除下载来源标记，避免 Windows 阻止加载已由用户安装的 DLL。安装/卸载要求 Word 关闭，不强制结束用户进程。

## 验证与限制

自动化使用真实 WINWORD.EXE 启动测试文档，从实际功能区通过 UI Automation 点击按钮，然后通过测试专用 CDP 端口驱动 WebView2。Word 对象模型读回原生 OMath 数量和正文，验证插入、多文档隔离和打开窗格无副作用。模型调用不参与这些测试；付费 API 冒烟测试单独运行。

已实测：本机 Windows、64 位 Word 16.0.20430.20182，且 OfficePlus 同时启用。x86 组件已包含，尚未实机验证。未对全部 Office 构建或企业策略组合承诺兼容；用户禁用、加载失败禁用、组织策略和手工隐藏功能区仍会影响显示。安装器不会绕过这些设置。

最终验收包含直接启动空白 Word、向 WINWORD.EXE 传入 DOCX、通过 Windows 文件关联打开 DOCX 三种方式，均在实际功能区找到按钮并打开窗格。插入验收从 Word 读回 4 个原生 OMath 对象；两文档隔离检查通过。安装验收从含中文与空格的目录运行发布包，验证卸载、重装、重复修复保留设置，以及删除下载解压目录后仍能正常启动。
