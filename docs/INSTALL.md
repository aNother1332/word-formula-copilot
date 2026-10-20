# Windows 安装、修复和卸载

## 安装

1. 完整解压 `FormulaCopilot-Windows.zip`，不要直接在压缩包里运行脚本。
2. 保存文档并关闭所有 Word 窗口。
3. 双击 `Install.cmd`，看到 `Installed for this user` 后关闭安装窗口。
4. 从任意正常入口打开 Word，新建或打开文档，在“开始”页点击“公式助手”。

安装只需执行一次。以后无需先启动脚本或本地服务器。

支持 Windows 10/11 的桌面 Word，自动选择 x86/x64 WebView2 加载器；不适用于 WPS、Word 网页版或 Mac。当前实机验证环境是 64 位 Word 16.0.20430.20182，32 位 Office 尚未实机验证。

安装器在当前用户目录安装文件、注册 COM 类和 Word 加载项，并写入 Windows 应用卸载项。无需手工安装 Node.js、配置共享目录、生成证书或使用 Office 商店。缺少 WebView2 Runtime 时会自动安装微软官方组件，因此首次安装可能需要网络。

首次使用需要在设置中填写 API Key。旧版插件设置保存在另一个浏览器来源中，需要在新版重新填写。

## 修复

保存并关闭 Word，然后双击 `Repair.cmd`。它会重新复制文件、恢复注册并检查本工具是否被 Word 列为禁用项目。也可以再次运行 `Install.cmd`。

如果 Word 中看不到按钮：

1. 确认已进入文档编辑界面，Word 启动首页本身没有“开始”功能区。
2. 在“文件 → 选项 → 加载项”底部选择“COM 加载项 → 转到”，勾选“公式助手 Formula Copilot”。
3. 若显示为禁用项目，在同一位置选择“禁用项目 → 转到”，恢复公式助手后重启 Word。
4. 若用户隐藏了该功能区分组，在“自定义功能区”中恢复。

安装器不会更改 Office 安全策略、清空禁用项目列表或强制启用其他加载项。企业策略限制 COM 加载项时，需要由管理员处理对应策略。

如果提示 Word 正在运行，先保存并关闭所有窗口；安装器不会强制结束 Word。

如果界面提示 WebView2 缺失，安装 Microsoft Edge WebView2 Runtime 后重新运行安装。普通打开界面不需要联网；模型识别仍需要联网。

## 卸载

保存并关闭 Word，双击 `Uninstall.cmd`，或从 Windows“设置 → 应用”卸载“公式助手 Formula Copilot”。

卸载会删除本工具的 COM / Word 注册和安装文件，保留本机的模型设置、用量和日志。卸载不删除旧版开发证书，不改动其他 Office 加载项。

## 文件位置

| 内容 | 路径 |
|---|---|
| 程序 | `%LOCALAPPDATA%\FormulaCopilot\app\2.0.0` |
| 设置与用量 | `%LOCALAPPDATA%\FormulaCopilot\WebView2` 中的浏览器存储 |
| 宿主日志 | `%LOCALAPPDATA%\FormulaCopilot\native.log` |

程序已复制到用户目录，安装完成后可以移动或删除原来的解压目录。修复和卸载脚本也保留在程序目录中。
