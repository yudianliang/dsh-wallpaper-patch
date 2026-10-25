// DSH万用壁纸补丁 · 安装程序
//
// 内嵌主程序本体与图标，双击即装（不需要用户点任何东西）：
//   1) 释放主程序到 %LOCALAPPDATA%\DSH万用壁纸补丁\
//   2) 调用主程序自带的 --install（复用它的皮肤安装逻辑：释放皮肤文件、登记依赖、写入配置）
//   3) 在桌面创建快捷方式（图标用内嵌的那张）
//
// 编译（见 build-setup.ps1）：
//   csc /target:winexe /win32icon:app.ico /out:安装程序.exe
//       /resource:DSH万用壁纸补丁.exe,Payload.app.exe
//       /resource:app.ico,Payload.app.ico
//       /resource:使用说明.md,Payload.usage.md
//       Setup.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class SetupInfo
{
    public const string AppName = "DSH万用壁纸补丁";

    public static string InstallDir()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
    }

    public static string MainExe()
    {
        return Path.Combine(InstallDir(), AppName + ".exe");
    }

    public static byte[] Payload(string name)
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        using (Stream s = asm.GetManifestResourceStream("Payload." + name))
        {
            if (s == null) throw new InvalidOperationException("内嵌资源缺失：Payload." + name);
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] buf = new byte[81920];
                int n;
                while ((n = s.Read(buf, 0, buf.Length)) > 0) ms.Write(buf, 0, n);
                return ms.ToArray();
            }
        }
    }
}

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        // 静默安装（给命令行或批处理用）
        if (args.Length >= 1 && args[0] == "--silent")
        {
            string logPath = args.Length >= 2 ? args[1]
                : Path.Combine(Path.GetTempPath(), "dsh-skin-setup.log");
            StringBuilder log = new StringBuilder();
            try { Installer.Run(delegate (string m) { log.AppendLine(m); }); }
            catch (Exception ex) { log.AppendLine("ERROR: " + ex); }
            try { File.WriteAllText(logPath, log.ToString(), new UTF8Encoding(false)); } catch { }
            return;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupForm());
    }
}

/// <summary>真正干活的安装流程（界面与 --silent 共用）。</summary>
internal static class Installer
{
    public static void Run(Action<string> log)
    {
        string dir = SetupInfo.InstallDir();
        Directory.CreateDirectory(dir);
        log("安装目录：" + dir);

        // 1) 释放主程序与图标
        string exe = SetupInfo.MainExe();
        foreach (string[] item in new string[][]
        {
            new string[] { "app.exe", exe },
            new string[] { "app.ico", Path.Combine(dir, "app.ico") },
            new string[] { "usage.md", Path.Combine(dir, "使用说明.md") }
        })
        {
            try
            {
                byte[] data = SetupInfo.Payload(item[0]);
                bool same = false;
                if (File.Exists(item[1]))
                {
                    try { same = SameBytes(File.ReadAllBytes(item[1]), data); } catch { same = false; }
                }
                if (same) log("已是最新，跳过：" + Path.GetFileName(item[1]));
                else { File.WriteAllBytes(item[1], data); log("释放：" + Path.GetFileName(item[1]) + "（" + data.Length + " 字节）"); }
            }
            catch (Exception ex)
            {
                log("释放失败 " + item[1] + "：" + ex.Message);
                throw;
            }
        }

        // 2) 调用主程序装皮肤（复用它的逻辑，避免两边不一致）
        log("正在安装皮肤…");
        try
        {
            string patchLog = Path.Combine(Path.GetTempPath(), "dsh-skin-install.log");
            if (File.Exists(patchLog)) { try { File.Delete(patchLog); } catch { } }
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = exe,
                Arguments = "--install \"" + patchLog + "\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (Process p = Process.Start(psi))
            {
                if (!p.WaitForExit(60000)) { try { p.Kill(); } catch { } log("皮肤安装超时（已跳过）"); }
                else log("皮肤安装退出码：" + p.ExitCode);
            }
            if (File.Exists(patchLog))
            {
                foreach (string line in File.ReadAllLines(patchLog, Encoding.UTF8))
                    if (line.Trim().Length > 0) log("    " + line.Trim());
            }
        }
        catch (Exception ex) { log("皮肤安装出错：" + ex.Message); }

        // 3) 桌面快捷方式
        try
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string lnk = Path.Combine(desktop, SetupInfo.AppName + ".lnk");
            string icon = Path.Combine(dir, "app.ico");
            object sh = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            object link = sh.GetType().InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod,
                null, sh, new object[] { lnk });
            Type lt = link.GetType();
            lt.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, link, new object[] { exe });
            lt.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, link, new object[] { dir });
            lt.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, link,
                new object[] { File.Exists(icon) ? icon + ",0" : exe + ",0" });
            lt.InvokeMember("Description", System.Reflection.BindingFlags.SetProperty, null, link,
                new object[] { "DSH 万用壁纸补丁 —— 换壁纸 / 调透明度 / 开关皮肤" });
            lt.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, link, null);
            log("已创建桌面快捷方式：" + lnk);
        }
        catch (Exception ex) { log("创建快捷方式失败：" + ex.Message); }

        log("安装完成。");
    }

    private static bool SameBytes(byte[] a, byte[] b)
    {
        if (a == null || b == null || a.Length != b.Length) return false;
        for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
        return true;
    }
}

internal sealed class SetupForm : Form
{
    private readonly Label _head = new Label();
    private readonly Label _desc = new Label();
    private readonly TextBox _log = new TextBox();
    private readonly Button _install = new Button();
    private readonly Button _run = new Button();
    private readonly Button _close = new Button();
    private bool _done;

    public SetupForm()
    {
        Text = SetupInfo.AppName + " · 安装程序";
        // 用内嵌的那张 ico，让窗口/任务栏图标和桌面快捷方式保持一致。
        try
        {
            using (MemoryStream ms = new MemoryStream(SetupInfo.Payload("app.ico")))
            {
                Icon = new Icon(ms);
            }
        }
        catch { /* 没有内嵌图标就退回系统默认 */ }
        Font = new Font("Microsoft YaHei UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 400);
        BackColor = Color.FromArgb(250, 248, 253);

        _head.SetBounds(20, 18, 520, 30);
        _head.Text = "一键安装 " + SetupInfo.AppName;
        _head.Font = new Font("Microsoft YaHei UI", 13F, FontStyle.Bold);
        _head.ForeColor = Color.FromArgb(60, 50, 90);

        _desc.SetBounds(20, 54, 520, 66);
        _desc.ForeColor = Color.FromArgb(110, 105, 125);
        _desc.Text = "点下面的「开始安装」就行，不需要其它操作。它会：\r\n"
            + "  1. 把程序装到 " + SetupInfo.InstallDir() + "\r\n"
            + "  2. 自动安装 DSH 皮肤（释放文件、写入配置）\r\n"
            + "  3. 在桌面创建快捷方式";

        _log.SetBounds(20, 128, 520, 168);
        _log.Multiline = true;
        _log.ReadOnly = true;
        _log.ScrollBars = ScrollBars.Vertical;
        _log.BackColor = Color.White;
        _log.Font = new Font("Consolas", 8.5F);

        _install.SetBounds(20, 310, 250, 46);
        _install.Text = "开始安装";
        _install.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold);
        _install.Click += delegate { DoInstall(); };

        _run.SetBounds(290, 310, 250, 46);
        _run.Text = "打开程序";
        _run.Enabled = false;
        _run.Click += delegate { OpenMain(); };

        _close.SetBounds(20, 362, 520, 28);
        _close.Text = "退出";
        _close.Click += delegate { Close(); };

        Controls.AddRange(new Control[] { _head, _desc, _log, _install, _run, _close });
    }

    private void Append(string m)
    {
        _log.AppendText(m + "\r\n");
        _log.SelectionStart = _log.TextLength;
        _log.ScrollToCaret();
    }

    private void DoInstall()
    {
        _install.Enabled = false;
        _install.Text = "正在安装…";
        Append("开始安装…");
        Application.DoEvents();
        try
        {
            Installer.Run(Append);
            _done = true;
            _install.Text = "安装完成";
            _run.Enabled = true;
            MessageBox.Show(this, "安装完成！\r\n\r\n桌面已经有一个快捷方式：\r\n" + SetupInfo.AppName
                + "\r\n\r\n双击它就能打开。", SetupInfo.AppName + " · 安装程序",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            Append("安装失败：" + ex.Message);
            _install.Enabled = true;
            _install.Text = "重试安装";
            MessageBox.Show(this, "安装失败：\r\n" + ex.Message, SetupInfo.AppName + " · 安装程序",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenMain()
    {
        try
        {
            if (File.Exists(SetupInfo.MainExe()))
                Process.Start(new ProcessStartInfo { FileName = SetupInfo.MainExe(), UseShellExecute = true });
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message); }
    }
}
