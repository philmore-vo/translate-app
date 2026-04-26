using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

class SimCopy {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int maxCount);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    static string GetTitle(IntPtr h) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        return sb.ToString();
    }

    static void Log(StreamWriter w, string msg) {
        w.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss.fff") + "] " + msg);
        w.Flush();
    }

    [STAThread]
    static void Main() {
        string logPath = Path.Combine(Path.GetDirectoryName(
            System.Reflection.Assembly.GetExecutingAssembly().Location), "copy_debug.log");
        StreamWriter log = new StreamWriter(logPath, false);

        try {
            // 1. Capture foreground window immediately
            IntPtr fgWnd = GetForegroundWindow();
            string fgTitle = GetTitle(fgWnd);
            Log(log, "Target foreground: [" + fgTitle + "]");

            uint seqBefore = GetClipboardSequenceNumber();
            string clipBefore = "";
            try { clipBefore = Clipboard.GetText(TextDataFormat.UnicodeText); } catch { }
            Log(log, "Clipboard before: seq=" + seqBefore + " text=[" + Truncate(clipBefore, 60) + "]");

            // 2. Wait for hotkey keys to release
            int waited = 0;
            while (waited < 2000) {
                if ((GetAsyncKeyState(0x11) & 0x8000) == 0 &&
                    (GetAsyncKeyState(0x10) & 0x8000) == 0 &&
                    (GetAsyncKeyState(0x5A) & 0x8000) == 0) break;
                Thread.Sleep(10); waited += 10;
            }
            Log(log, "Keys released after " + waited + "ms");
            Thread.Sleep(50);

            // 3. Restore focus if changed
            IntPtr fgNow = GetForegroundWindow();
            string fgNowTitle = GetTitle(fgNow);
            Log(log, "Foreground before Ctrl+C: [" + fgNowTitle + "]");

            if (fgNow != fgWnd && fgWnd != IntPtr.Zero) {
                SetForegroundWindow(fgWnd);
                Thread.Sleep(80);
                Log(log, "Focus restored to: [" + GetTitle(GetForegroundWindow()) + "]");
            }

            // 4. Release all modifier keys
            keybd_event(0xA0, 0, 2, UIntPtr.Zero); // LShift up
            keybd_event(0xA1, 0, 2, UIntPtr.Zero); // RShift up
            keybd_event(0x10, 0, 2, UIntPtr.Zero); // Shift up
            keybd_event(0xA2, 0, 2, UIntPtr.Zero); // LCtrl up
            keybd_event(0xA3, 0, 2, UIntPtr.Zero); // RCtrl up
            keybd_event(0x11, 0, 2, UIntPtr.Zero); // Ctrl up
            keybd_event(0x12, 0, 2, UIntPtr.Zero); // Alt up
            Thread.Sleep(30);

            // 5. Send Ctrl+C via keybd_event
            keybd_event(0x11, 0, 0, UIntPtr.Zero); // Ctrl down
            keybd_event(0x43, 0, 0, UIntPtr.Zero); // C down
            Thread.Sleep(50);
            keybd_event(0x43, 0, 2, UIntPtr.Zero); // C up
            keybd_event(0x11, 0, 2, UIntPtr.Zero); // Ctrl up
            Thread.Sleep(100);

            // 6. Verify clipboard changed and read content
            uint seqAfter = GetClipboardSequenceNumber();
            bool changed = seqAfter != seqBefore;

            string clipAfter = "";
            try { clipAfter = Clipboard.GetText(TextDataFormat.UnicodeText); } catch { }

            Log(log, "FINAL: clipboard " + (changed ? "CHANGED" : "NOT changed"));
            Log(log, "Clipboard text length: " + clipAfter.Length);
            Log(log, "Clipboard text: [" + Truncate(clipAfter, 200) + "]");

            Environment.ExitCode = changed ? 0 : 1;
        }
        catch (Exception ex) {
            Log(log, "ERROR: " + ex.Message);
            Environment.ExitCode = 2;
        }
        finally { log.Close(); }
    }

    static string Truncate(string s, int max) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Length <= max ? s : s.Substring(0, max) + "...";
    }
}
