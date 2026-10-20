using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FormulaCopilot
{
    [ComVisible(true), Guid("E57D65F8-4018-40BD-B87B-A6A7DF167459"), ProgId("FormulaCopilot.Pane")]
    [ClassInterface(ClassInterfaceType.AutoDispatch)]
    public sealed class FormulaPane : UserControl
    {
        private dynamic application;
        private dynamic window;
        private WebView2 browser;
        private bool started;
        private readonly Label status;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };
        internal string State = "created";
        private const string Origin = "https://formula-copilot.local";

        public FormulaPane()
        {
            status = new Label { Dock = DockStyle.Fill, Text = "正在加载公式助手…", TextAlign = System.Drawing.ContentAlignment.MiddleCenter };
            Controls.Add(status);
        }

        internal void Attach(object app, object parent)
        {
            if (InvokeRequired) { BeginInvoke(new Action(delegate { Attach(app, parent); })); return; }
            application = app; window = parent; StartBrowser();
        }

        private async void StartBrowser()
        {
            if (started || IsDisposed) return;
            started = true;
            try {
                browser = new WebView2 { Dock = DockStyle.Fill };
                Controls.Add(browser);
                string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FormulaCopilot", "WebView2");
                var options = new CoreWebView2EnvironmentOptions();
                int debugPort;
                if (int.TryParse(Environment.GetEnvironmentVariable("FORMULA_COPILOT_DEBUG_PORT"), out debugPort) && debugPort >= 1024 && debugPort <= 65535)
                    options.AdditionalBrowserArguments = "--remote-debugging-port=" + debugPort;
                var environment = await CoreWebView2Environment.CreateAsync(null, profile, options);
                // Use the installed Evergreen runtime; InstallDirectory contains only the loader, not a fixed runtime.
                await browser.EnsureCoreWebView2Async(environment);
                if (IsDisposed) return;
                var core = browser.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("formula-copilot.local", Path.Combine(Connect.InstallDirectory, "web"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.AreDevToolsEnabled = debugPort != 0;
                core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) {
                    e.State = e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead && IsTrusted(e.Uri)
                        ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
                };
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) { if (!IsTrusted(e.Uri)) e.Cancel = true; };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
                core.WebMessageReceived += OnMessage;
                await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__FORMULA_NATIVE__ = true;");
                core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
                    State = e.IsSuccess ? "ready" : "navigation-error";
                    if (e.IsSuccess) { status.Visible = false; browser.BringToFront(); }
                    Connect.Log("Browser " + State);
                };
                browser.Source = new Uri(Origin + "/src/taskpane.html?window=" + window.Hwnd);
            } catch (Exception ex) {
                State = "error";
                Connect.Log(ex.ToString());
                if (browser != null) browser.Visible = false;
                status.Text = "界面加载失败：" + ex.Message + "\n请运行安装包中的修复检查，确认已安装 Microsoft Edge WebView2 Runtime。";
            }
        }

        private static bool IsTrusted(string url)
        {
            Uri uri;
            return Uri.TryCreate(url, UriKind.Absolute, out uri) && uri.Scheme == "https" && uri.Host == "formula-copilot.local" && uri.IsDefaultPort;
        }

        private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!IsTrusted(e.Source)) return;
            string id = null;
            object result = null;
            string error = null;
            try {
                var request = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                id = request["id"] as string;
                string method = request["method"] as string;
                string content = request.ContainsKey("content") ? request["content"] as string : "";
                if (String.IsNullOrEmpty(id)) return;
                // Keep all Word COM operations on Office's UI thread. The pane belongs to this window.
                if (method == "ping") result = "Word native host ready";
                else {
                    if (application == null || window == null) throw new InvalidOperationException("Word 文档已关闭，请重新打开公式助手。");
                    if (content == null || content.Length > 4 * 1024 * 1024) throw new InvalidOperationException("插入内容为空或过大。");
                    dynamic target = window.Selection.Range;
                    if (method == "insertOoxml") InsertXml(target, content);
                    else if (method == "insertText") target.Text = content;
                    else throw new InvalidOperationException("不支持的操作：" + method);
                    // Leave the caret after the inserted range, so repeated inserts append.
                    target.Collapse(0);
                    target.Select();
                    result = true;
                }
            } catch (Exception ex) {
                error = ex.Message;
                Connect.Log("Word operation failed: " + ex.GetType().Name + " " + ex.Message);
            }
            if (id != null && browser != null && !browser.IsDisposed)
                browser.CoreWebView2.PostWebMessageAsJson(json.Serialize(new { id = id, result = result, error = error }));
        }

        private static void InsertXml(dynamic target, string xml)
        {
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
            var document = new XmlDocument { XmlResolver = null };
            using (var reader = XmlReader.Create(new StringReader(xml), settings)) document.Load(reader);
            const string wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
            const string mathNs = "http://schemas.openxmlformats.org/officeDocument/2006/math";
            string body;
            var root = document.DocumentElement;
            if (root.NamespaceURI == mathNs && root.LocalName == "oMath") body = "<w:p>" + root.OuterXml + "</w:p>";
            else if (root.NamespaceURI == wordNs && root.LocalName == "p") body = root.OuterXml;
            else if (root.NamespaceURI == wordNs && root.LocalName == "document") {
                var ns = new XmlNamespaceManager(document.NameTable); ns.AddNamespace("w", wordNs);
                var bodyElement = document.SelectSingleNode("/w:document/w:body", ns);
                if (bodyElement == null) throw new InvalidOperationException("公式文档缺少正文。");
                body = bodyElement.InnerXml;
            } else throw new InvalidOperationException("无法识别公式 XML 格式。");
            // Range.InsertXML accepts Word Flat OPC packages reliably, including native OMML.
            string package = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
                "<pkg:package xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\">" +
                "<pkg:part pkg:name=\"/_rels/.rels\" pkg:contentType=\"application/vnd.openxmlformats-package.relationships+xml\" pkg:padding=\"512\"><pkg:xmlData>" +
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>" +
                "</pkg:xmlData></pkg:part><pkg:part pkg:name=\"/word/document.xml\" pkg:contentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"><pkg:xmlData>" +
                "<w:document xmlns:w=\"" + wordNs + "\" xmlns:m=\"" + mathNs + "\"><w:body>" + body + "</w:body></w:document>" +
                "</pkg:xmlData></pkg:part></pkg:package>";
            target.InsertXML(package);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && browser != null) { browser.Dispose(); browser = null; }
            application = null; window = null;
            base.Dispose(disposing);
        }
    }
}
