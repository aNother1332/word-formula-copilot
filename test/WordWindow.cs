using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WordWindow
{
    private delegate bool EnumProc(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc proc, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr data);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int length);
    [DllImport("oleacc.dll")] private static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint objectId, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object result);
    public static object GetNativeWindow(int processId)
    {
        object result = null;
        EnumWindows(delegate(IntPtr top, IntPtr unused) {
            uint pid; GetWindowThreadProcessId(top, out pid);
            if (pid != processId) return true;
            EnumChildWindows(top, delegate(IntPtr child, IntPtr data) {
                var name = new StringBuilder(100); GetClassName(child, name, name.Capacity);
                if (name.ToString() != "_WwG") return true;
                var iid = new Guid("00020400-0000-0000-C000-000000000046");
                object found;
                if (AccessibleObjectFromWindow(child, 0xFFFFFFF0, ref iid, out found) == 0) result = found;
                return result == null;
            }, IntPtr.Zero);
            return result == null;
        }, IntPtr.Zero);
        return result;
    }
}
