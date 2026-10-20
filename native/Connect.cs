using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Extensibility;
using Office = Microsoft.Office.Core;

[assembly: AssemblyVersion("2.0.0.0")]
[assembly: ComVisible(false)]

namespace FormulaCopilot
{
    [ComVisible(true), Guid("90E1A593-945B-4B71-9472-72E83F188D41"), ProgId("FormulaCopilot.Connect")]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public sealed class Connect : IDTExtensibility2, Office.IRibbonExtensibility, Office.ICustomTaskPaneConsumer
    {
        private dynamic application;
        private Office.ICTPFactory factory;
        private readonly Dictionary<int, object> panes = new Dictionary<int, object>();
        internal static readonly string InstallDirectory = Path.GetDirectoryName(typeof(Connect).Assembly.Location);

        static Connect()
        {
            // Office owns the application configuration: resolve our private dependencies locally.
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args) {
                string name = new AssemblyName(args.Name).Name;
                if (!name.StartsWith("Microsoft.Web.WebView2.", StringComparison.Ordinal)) return null;
                string file = Path.Combine(InstallDirectory, name + ".dll");
                return File.Exists(file) ? Assembly.LoadFrom(file) : null;
            };
        }

        public Connect() { Log("COM instance created"); }

        public void OnConnection(object app, ext_ConnectMode mode, object addInInst, ref Array custom)
        {
            application = app;
            try { ((dynamic)addInInst).Object = this; Log("Connected; Word " + application.Version); }
            catch (Exception ex) { Log(ex.ToString()); }
            // Keep startup cheap: do not create a browser, contact the network, or edit documents.
        }

        public string GetCustomUI(string ribbonId)
        {
            return "<customUI xmlns=\"http://schemas.microsoft.com/office/2009/07/customui\"><ribbon><tabs>" +
                "<tab idMso=\"TabHome\"><group id=\"FormulaCopilotGroup\" label=\"公式助手\">" +
                "<button id=\"FormulaCopilotOpen\" label=\"公式助手\" size=\"large\" imageMso=\"EquationInsertNew\" " +
                "supertip=\"识图或描述生成可编辑公式\" onAction=\"OnToggle\"/>" +
                "</group></tab></tabs></ribbon></customUI>";
        }

        public void CTPFactoryAvailable(Office.ICTPFactory value) { factory = value; Log("Task pane factory ready"); }
        public void OnToggle(object control) { TogglePane(true); }
        public void ShowPane() { TogglePane(false); }
        private void TogglePane(bool toggle)
        {
            try {
                if (application == null || application.Documents.Count == 0)
                    throw new InvalidOperationException("请先新建或打开一个 Word 文档。");
                if (factory == null) throw new InvalidOperationException("Word 尚未提供任务窗格，请关闭 Word 后重新打开。");
                CleanupClosedPanes();
                dynamic window = application.ActiveWindow;
                int hwnd = window.Hwnd;
                object paneObject;
                if (!panes.TryGetValue(hwnd, out paneObject)) {
                    paneObject = factory.CreateCTP("FormulaCopilot.Pane", "公式助手", window);
                    dynamic created = paneObject;
                    created.Width = 390;
                    FormulaPane content = (FormulaPane)created.ContentControl;
                    content.Attach(application, window);
                    panes.Add(hwnd, paneObject);
                    created.Visible = true;
                } else {
                    dynamic pane = paneObject;
                    pane.Visible = toggle ? !pane.Visible : true;
                }
            } catch (Exception ex) {
                Log(ex.ToString());
                System.Windows.Forms.MessageBox.Show(ex.Message, "公式助手", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Information);
            }
        }

        private void CleanupClosedPanes()
        {
            var stale = new List<int>();
            foreach (var item in panes) {
                try {
                    var content = (FormulaPane)((dynamic)item.Value).ContentControl;
                    if (content == null || content.IsDisposed) stale.Add(item.Key);
                } catch { stale.Add(item.Key); }
            }
            foreach (int key in stale) {
                object pane = panes[key]; panes.Remove(key);
                try { ((dynamic)pane).Delete(); } catch { }
                if (Marshal.IsComObject(pane)) Marshal.ReleaseComObject(pane);
            }
        }

        public string GetStatus()
        {
            string state = "";
            foreach (object p in panes.Values) {
                try { state += "; browser=" + ((FormulaPane)((dynamic)p).ContentControl).State; } catch { state += "; browser=closed"; }
            }
            return "FormulaCopilot/2.0; factory=" + (factory != null) + "; panes=" + panes.Count + state;
        }
        public void OnDisconnection(ext_DisconnectMode mode, ref Array custom)
        {
            foreach (object p in panes.Values) { try { ((dynamic)p).Delete(); } catch { } }
            panes.Clear(); factory = null; application = null;
            Log("Disconnected");
        }
        public void OnBeginShutdown(ref Array custom) { }
        public void OnAddInsUpdate(ref Array custom) { }
        public void OnStartupComplete(ref Array custom) { }
        internal static void Log(string message)
        {
            try {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FormulaCopilot");
                Directory.CreateDirectory(directory);
                File.AppendAllText(Path.Combine(directory, "native.log"), DateTime.Now.ToString("s") + " " + message + Environment.NewLine);
            } catch { }
        }
    }
}
