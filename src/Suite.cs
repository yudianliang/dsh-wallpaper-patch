// DSH万用壁纸补丁 —— 一体化程序（安装 + 开关 + 卸载）
//
// 把整个皮肤包内嵌进 exe（编译时 /resource: 嵌入），所以只要这一个文件：
//   · 一键安装皮肤（释放内嵌文件 → 写 profile 依赖 → 往 cordis.patch.yml 追加皮肤块）
//   · 开关壁纸 / 启停皮肤
//   · 一键重启 DSH 让改动生效
//   · 一键卸载（注释掉皮肤块 + 删除已释放的文件）
//
// 编译：
//   csc /target:winexe /codepage:65001 /out:"DSH万用壁纸补丁.exe"
//       /reference:System.Windows.Forms.dll /reference:System.Drawing.dll
//       /resource:...\lib\index.js,Skin.lib.index.js
//       /resource:...\lib\page.js,Skin.lib.page.js
//       /resource:...\cordis.patch.yml,Skin.cordis.patch.yml
//       /resource:...\package.json,Skin.package.json
//       /resource:...\README.zh.md,Skin.README.zh.md
//       /resource:...\LICENSE,Skin.LICENSE
//       Suite.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        // 只读自检：把状态写到文件后退出（不改任何东西）。
        if (args.Length >= 2 && args[0] == "--dump")
        {
            string target = args[1];
            string patch = args.Length >= 3 ? args[2] : null;
            try { File.WriteAllText(target, Probe.Report(patch), new UTF8Encoding(false)); }
            catch (Exception ex) { try { File.WriteAllText(target, "ERROR: " + ex, new UTF8Encoding(false)); } catch { } }
            return;
        }
        // 静默安装 / 卸载（供命令行或脚本调用）。
        if (args.Length >= 1 && (args[0] == "--install" || args[0] == "--uninstall"))
        {
            StringBuilder log = new StringBuilder();
            try
            {
                if (args[0] == "--install") Skin.Install(delegate (string m) { log.AppendLine(m); });
                else Skin.Uninstall(delegate (string m) { log.AppendLine(m); });
            }
            catch (Exception ex) { log.AppendLine("ERROR: " + ex); }
            string t = args.Length >= 2 ? args[1] : Path.Combine(Path.GetTempPath(), "dsh-skin-install.log");
            try { File.WriteAllText(t, log.ToString(), new UTF8Encoding(false)); } catch { }
            return;
        }
        // 命令行启停皮肤（同时方便自动化验证）。
        if (args.Length >= 1 && (args[0] == "--enable" || args[0] == "--disable"))
        {
            StringBuilder log = new StringBuilder();
            try
            {
                string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
                string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
                string block = Patch.FindBlock(text);
                if (block == null) log.AppendLine("找不到皮肤块");
                else
                {
                    bool want = args[0] == "--enable";
                    bool isOn = !Patch.IsCommented(block);
                    if (want == isOn) log.AppendLine("已是目标状态（皮肤" + (isOn ? "启用" : "停用") + "），无需改动");
                    else
                    {
                        File.WriteAllText(patchPath,
                            text.Replace(block, want ? Patch.Uncomment(block) : Patch.Comment(block)),
                            new UTF8Encoding(false));
                        log.AppendLine(want ? "已启用皮肤" : "已停用皮肤");
                    }
                }
            }
            catch (Exception ex) { log.AppendLine("ERROR: " + ex); }
            string et = args.Length >= 2 ? args[1] : Path.Combine(Path.GetTempPath(), "dsh-skin-enable.log");
            try { File.WriteAllText(et, log.ToString(), new UTF8Encoding(false)); } catch { }
            return;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SuiteForm());
    }
}

/// <summary>内嵌皮肤包的读取与安装/卸载。</summary>
internal static class Skin
{
    public const string Id = "dsh-dream-skin";

    /// <summary>包内相对路径（同时也是内嵌资源的来源）。</summary>
    public static readonly string[] Files = new string[]
    {
        "lib/index.js", "lib/page.js", "cordis.patch.yml", "package.json", "README.zh.md", "LICENSE"
    };

    public static string ResourceName(string rel)
    {
        return "Skin." + rel.Replace('/', '.').Replace('\\', '.');
    }

    public static byte[] Read(string rel)
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        using (Stream s = asm.GetManifestResourceStream(ResourceName(rel)))
        {
            if (s == null) throw new InvalidOperationException("内嵌资源缺失：" + ResourceName(rel));
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] buf = new byte[8192];
                int n;
                while ((n = s.Read(buf, 0, buf.Length)) > 0) ms.Write(buf, 0, n);
                return ms.ToArray();
            }
        }
    }

    public static string ReadText(string rel)
    {
        return Encoding.UTF8.GetString(Read(rel));
    }

    public static string HomeDir()
    {
        return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    }

    public static string SkinDir()
    {
        return Path.Combine(HomeDir(), ".dsh", "skins", Id);
    }

    public static string ProfileDir()
    {
        string home = HomeDir();
        string dir = Path.Combine(home, ".dsh", "profiles", "desktop");
        if (File.Exists(Path.Combine(dir, "cordis.patch.yml"))) return dir;
        string profiles = Path.Combine(home, ".dsh", "profiles");
        if (Directory.Exists(profiles))
        {
            foreach (string sub in Directory.GetDirectories(profiles))
                if (File.Exists(Path.Combine(sub, "cordis.patch.yml"))) return sub;
        }
        return dir;
    }

    private static string Local(string root, string rel)
    {
        return Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar));
    }

    private static bool SameBytes(byte[] a, byte[] b)
    {
        if (a == null || b == null || a.Length != b.Length) return false;
        for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
        return true;
    }

    /// <summary>结束所有 DSH 进程，返回结束的数量。</summary>
    public static int KillDsh(Action<string> log)
    {
        int killed = 0;
        foreach (Process p in Process.GetProcesses())
        {
            string name;
            try { name = p.ProcessName; } catch { continue; }
            if (name.IndexOf("DeepSeek", StringComparison.OrdinalIgnoreCase) < 0) continue;
            try { p.Kill(); killed++; } catch { }
        }
        return killed;
    }

    /// <summary>安装：先直接试；若被 DSH 占用（Windows 文件锁）就先关掉 DSH 再重试。</summary>
    public static void Install(Action<string> log)
    {
        try
        {
            InstallCore(log);
        }
        catch (UnauthorizedAccessException)
        {
            log("检测到插件文件被 DSH 占用，先关闭 DSH 再继续…");
            int n = KillDsh(log);
            System.Threading.Thread.Sleep(2500);
            log("已结束 " + n + " 个进程，重试写入");
            InstallCore(log);
            log("（稍后可用「只重启 DSH」把它拉起来）");
        }
    }

    /// <summary>把内嵌的包释放到两处（skins 与 profile 的 node_modules）。</summary>
    private static void InstallCore(Action<string> log)
    {
        string profile = ProfileDir();
        string[] targets = new string[]
        {
            SkinDir(),
            Path.Combine(profile, "node_modules", Id)
        };
        foreach (string target in targets)
        {
            int written = 0, skipped = 0;
            foreach (string rel in Files)
            {
                byte[] data = Read(rel);
                string path = Local(target, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                // 内容一模一样就不写 —— 既省事，也避开和正在运行的 DSH 的文件锁打架
                if (File.Exists(path) && SameBytes(File.ReadAllBytes(path), data)) { skipped++; continue; }
                File.WriteAllBytes(path, data);
                written++;
            }
            log("释放到 " + target + "：写入 " + written + " 个，跳过 " + skipped + " 个（内容一致）");
        }

        // profile/package.json：登记 file: 依赖
        //
        // 必须用真正的 JSON 解析来改，不能靠字符串插入。
        // 旧写法是往 `"dependencies": {` 后面插一行（行尾带逗号），
        // 当原来的 dependencies 是空对象时就会写成 `{ "dsh-dream-skin": "...", }`，
        // 尾随逗号让 JSON 非法，DSH 直接起不来
        // （报错：Expected double-quoted property name in JSON）。
        string pkgPath = Path.Combine(profile, "package.json");
        if (File.Exists(pkgPath))
        {
            try
            {
                string pkg = File.ReadAllText(pkgPath, Encoding.UTF8);
                var ser = new System.Web.Script.Serialization.JavaScriptSerializer();
                Dictionary<string, object> root = null;
                try { root = ser.Deserialize<Dictionary<string, object>>(pkg); }
                catch { root = null; }

                // 旧版本在 dependencies 为空时会写出尾随逗号，把文件弄成非法 JSON，
                // 导致 DSH 直接起不来。这里顺手修掉，好让已经中招的机器能靠重跑恢复。
                if (root == null)
                {
                    string fixedText = Regex.Replace(pkg, @",(\s*[}\]])", "$1");
                    try
                    {
                        root = ser.Deserialize<Dictionary<string, object>>(fixedText);
                        if (root != null) log("检测到 package.json 里的尾随逗号（旧版本的 bug），已顺手修掉");
                    }
                    catch { root = null; }
                }

                if (root == null)
                {
                    log("package.json 解析失败且无法自动修复，为安全起见不动它");
                }
                else
                {
                    object raw;
                    Dictionary<string, object> deps = null;
                    if (root.TryGetValue("dependencies", out raw)) deps = raw as Dictionary<string, object>;
                    if (deps == null)
                    {
                        deps = new Dictionary<string, object>();
                        root["dependencies"] = deps;
                    }
                    string want = "file:../../skins/" + Id;
                    string have = deps.ContainsKey(Id) ? deps[Id] as string : null;
                    if (have == want)
                    {
                        log("package.json 已登记过依赖，跳过");
                    }
                    else
                    {
                        deps[Id] = want;
                        File.WriteAllText(pkgPath, ser.Serialize(root), new UTF8Encoding(false));
                        log("已在 package.json 登记依赖（经 JSON 解析写入，不会产生尾随逗号）");
                    }
                }
            }
            catch (Exception ex) { log("package.json 处理失败：" + ex.Message); }
        }

        // profile/cordis.patch.yml：确保有皮肤块
        string patchPath = Path.Combine(profile, "cordis.patch.yml");
        if (!File.Exists(patchPath))
        {
            File.WriteAllText(patchPath, "- insert:\n" + Indent(Skin.ReadText("cordis.patch.yml")), new UTF8Encoding(false));
            log("新建了 cordis.patch.yml");
        }
        else
        {
            string patch = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
            if (patch.IndexOf(Id, StringComparison.Ordinal) < 0)
            {
                patch = patch.TrimEnd() + "\n" + Skin.ReadText("cordis.patch.yml").TrimEnd() + "\n";
                File.WriteAllText(patchPath, patch, new UTF8Encoding(false));
                log("已把皮肤块追加到 cordis.patch.yml");
            }
            else log("cordis.patch.yml 已有皮肤块，跳过");
        }
    }

    private static string Indent(string text)
    {
        StringBuilder sb = new StringBuilder();
        foreach (string l in text.Replace("\r\n", "\n").Split('\n'))
            sb.AppendLine(l.Length == 0 ? l : "  " + l);
        return sb.ToString();
    }

    /// <summary>卸载：注释掉皮肤块 + 删除已释放的文件 + 去掉依赖登记。</summary>
    public static void Uninstall(Action<string> log)
    {
        string profile = ProfileDir();
        string patchPath = Path.Combine(profile, "cordis.patch.yml");
        if (File.Exists(patchPath))
        {
            string patch = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
            string block = Patch.FindBlock(patch);
            if (block != null && !Patch.IsCommented(block))
            {
                File.WriteAllText(patchPath, patch.Replace(block, Patch.Comment(block)), new UTF8Encoding(false));
                log("已注释掉 cordis.patch.yml 里的皮肤块");
            }
            else log("皮肤块已是注释状态或不存在");
        }
        foreach (string dir in new string[] { SkinDir(), Path.Combine(profile, "node_modules", Id) })
        {
            try
            {
                if (Directory.Exists(dir)) { Directory.Delete(dir, true); log("已删除 " + dir); }
            }
            catch (Exception ex) { log("删除失败（可能被占用）：" + dir + " —— " + ex.Message); }
        }
        string pkgPath = Path.Combine(profile, "package.json");
        if (File.Exists(pkgPath))
        {
            string pkg = File.ReadAllText(pkgPath, Encoding.UTF8);
            string cleaned = Regex.Replace(pkg, "\\s*\"" + Id + "\"\\s*:\\s*\"[^\"]*\",?", "");
            if (cleaned != pkg)
            {
                File.WriteAllText(pkgPath, cleaned, new UTF8Encoding(false));
                log("已从 package.json 移除依赖登记");
            }
        }
    }

    public static bool IsInstalled()
    {
        return File.Exists(Local(SkinDir(), "lib/index.js"))
            && File.Exists(Local(SkinDir(), "lib/page.js"));
    }
}

/// <summary>
/// 程序图标。编译时把 app.ico 以 /resource:...,App.icon.ico 嵌进 exe，
/// 这里取出来赋给每个窗口的 Icon ——
/// 否则任务栏和标题栏显示的是 WinForms 的默认图标，与桌面快捷方式的图标不一致。
/// </summary>
internal static class AppIcon
{
    private static Icon _cached;
    private static bool _tried;

    public static Icon Get()
    {
        if (_tried) return _cached;
        _tried = true;
        try
        {
            using (Stream s = typeof(AppIcon).Assembly.GetManifestResourceStream("App.icon.ico"))
            {
                if (s != null) _cached = new Icon(s);
            }
        }
        catch { /* 没有内嵌图标就退回系统默认 */ }
        return _cached;
    }
}

/// <summary>cordis.patch.yml 的块定位与注释处理。</summary>
internal static class Patch
{
    public static string FindBlock(string text)
    {
        string[] lines = text.Replace("\r\n", "\n").Split('\n');
        int start = -1;
        for (int i = 0; i < lines.Length; i++)
        {
            string head = lines[i].Trim();
            // 注释形式也要认得 —— 否则停用之后 FindBlock 返回 null，
            // 「启用皮肤」就会报「找不到皮肤块」，等于停用后无法恢复。
            if (head != "- insert:" && head != "# - insert:") continue;
            StringBuilder probe = new StringBuilder();
            for (int j = i; j < Math.Min(lines.Length, i + 8); j++) probe.AppendLine(lines[j]);
            if (probe.ToString().Contains(Skin.Id)) { start = i; break; }
        }
        if (start < 0) return null;
        int end = start + 1;
        while (end < lines.Length)
        {
            if (IsInsideBlock(lines[end])) { end++; continue; }
            break;
        }
        return string.Join("\n", lines, start, end - start);
    }

    /// <summary>
    /// 判断一行是否属于当前块内部。
    ///
    /// 关键点：块被注释掉之后，子行会变成 "#     - id: ..." 这种样子 ——
    /// 它以 '#' 而不是空白开头。早期版本只看「有没有缩进」，于是块范围会
    /// 塌缩成只剩 "- insert:" 一行，导致停用/启用只作用在块头上，反复几次
    /// 就会把配置弄成「块头没注释、子行全注释」的坏状态（皮肤静默失效）。
    /// </summary>
    private static bool IsInsideBlock(string line)
    {
        string t = line.Trim();
        if (t.Length == 0) return true;              // 空行算块内
        if (char.IsWhiteSpace(line[0])) return true; // 有缩进 → 块内

        if (t[0] != '#') return false;               // 顶层内容行 → 块结束

        // 注释行：只有「# 后面还有缩进、且内容像 YAML 键或列表项」才算被注释的块内行，
        // 免得把用户随手写的 "# 说明文字" 也一起取消注释。
        string rest = t.Substring(1);
        int spaces = 0;
        foreach (char c in rest) { if (c == ' ') spaces++; else break; }
        if (spaces < 2) return false;
        string deeper = rest.TrimStart();
        if (deeper.StartsWith("-")) return true;
        // 被注释掉的注释行：「#         # 背景图：…」。原文档里本来就有说明性注释，
        // 整块被 Comment() 加一层 # 之后就长这样。漏掉这一种会让块在第一个
        // 「注释里的注释」处提前结束，后面的 imagePath 等键全都落在块外，
        // 表现就是「换壁纸/恢复默认」报「没能写入配置」。
        if (deeper.StartsWith("#")) return true;
        return Regex.IsMatch(deeper, @"^[A-Za-z_][A-Za-z0-9_]*\s*:");
    }

    public static bool IsCommented(string block)
    {
        foreach (string raw in block.Replace("\r\n", "\n").Split('\n'))
        {
            string t = raw.TrimStart();
            if (t.Length == 0 || t.StartsWith("#")) continue;
            return false;
        }
        return true;
    }

    public static string Comment(string block)
    {
        string[] lines = block.Replace("\r\n", "\n").Split('\n');
        for (int i = 0; i < lines.Length; i++)
            if (lines[i].Trim().Length > 0) lines[i] = "# " + lines[i];
        return string.Join("\n", lines);
    }

    public static string Uncomment(string block)
    {
        string[] lines = block.Replace("\r\n", "\n").Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].StartsWith("# ")) lines[i] = lines[i].Substring(2);
            else if (lines[i].StartsWith("#")) lines[i] = lines[i].Substring(1);
        }
        return string.Join("\n", lines);
    }

    public static double ReadOpacity(string text)
    {
        Match m = Regex.Match(text, @"imageOpacity:\s*([0-9]*\.?[0-9]+)");
        double v;
        if (m.Success && double.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out v)) return v;
        return 1.0;
    }
}

/// <summary>只读探测：供 --dump 自检使用。</summary>
internal static class Probe
{
    public static string Report(string explicitPatch)
    {
        string profile = Skin.ProfileDir();
        string patchPath = string.IsNullOrEmpty(explicitPatch)
            ? Path.Combine(profile, "cordis.patch.yml") : explicitPatch;
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("embeddedFiles=" + Skin.Files.Length);
        foreach (string rel in Skin.Files)
        {
            try { sb.AppendLine("  embed " + rel + " = " + Skin.Read(rel).Length + " bytes"); }
            catch (Exception ex) { sb.AppendLine("  embed " + rel + " = ERROR " + ex.Message); }
        }
        sb.AppendLine("skinDir=" + Skin.SkinDir());
        sb.AppendLine("skinInstalled=" + Skin.IsInstalled());
        sb.AppendLine("profileDir=" + profile);
        sb.AppendLine("patch=" + patchPath);
        sb.AppendLine("patchExists=" + File.Exists(patchPath));
        if (File.Exists(patchPath))
        {
            string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
            string block = Patch.FindBlock(text);
            sb.AppendLine("blockFound=" + (block != null));
            sb.AppendLine("skinEnabled=" + (block != null && !Patch.IsCommented(block)));
            sb.AppendLine("imageOpacity=" + Patch.ReadOpacity(text).ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        sb.AppendLine("dshExe=" + (Probe.FindDshExe() ?? "(未找到)"));
        return sb.ToString();
    }

    public static string FindDshExe()
    {
        foreach (Process p in Process.GetProcesses())
        {
            string name;
            try { name = p.ProcessName; } catch { continue; }
            if (name.IndexOf("DeepSeek", StringComparison.OrdinalIgnoreCase) < 0) continue;
            try
            {
                string file = p.MainModule.FileName;
                if (!string.IsNullOrEmpty(file) && File.Exists(file)) return file;
            }
            catch { }
        }
        string guess = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs", "DeepSeek Harness", "DeepSeek Harness.exe");
        if (File.Exists(guess)) return guess;
        guess = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "DeepSeek Harness", "DeepSeek Harness.exe");
        return File.Exists(guess) ? guess : null;
    }
}

internal sealed class SuiteForm : Form
{
    private readonly Label _status = new Label();
    private readonly Label _pathInfo = new Label();
    private readonly Label _hint = new Label();
    private readonly Button _install = new Button();
    private readonly Button _uninstall = new Button();
    private readonly Button _wall = new Button();
    private readonly Button _skin = new Button();
    private readonly Button _apply = new Button();
    private readonly Button _restart = new Button();
    private readonly Button _doc = new Button();
    private readonly Button _folder = new Button();
    private readonly PictureBox _preview = new PictureBox();
    private readonly Button _changeWall = new Button();
    private readonly Button _resetWall = new Button();
    private readonly Button _alphas = new Button();

    public SuiteForm()
    {
        Text = "DSH万用壁纸补丁";
        Icon appIcon = AppIcon.Get();
        if (appIcon != null) Icon = appIcon;
        Font = new Font("Microsoft YaHei UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(500, 566);
        BackColor = Color.FromArgb(250, 248, 253);

        _status.SetBounds(18, 14, 336, 66);
        _status.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold);
        _status.ForeColor = Color.FromArgb(60, 50, 90);

        // 当前壁纸的缩略图
        _preview.SetBounds(366, 12, 116, 70);
        _preview.SizeMode = PictureBoxSizeMode.Zoom;
        _preview.BorderStyle = BorderStyle.FixedSingle;
        _preview.BackColor = Color.White;

        _install.SetBounds(18, 90, 222, 42);
        _install.Text = "一键安装皮肤";
        _install.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        _install.Click += delegate { DoInstall(); };

        _uninstall.SetBounds(252, 90, 222, 42);
        _uninstall.Text = "卸载皮肤";
        _uninstall.Click += delegate { DoUninstall(); };

        _wall.SetBounds(18, 144, 222, 38);
        _wall.Click += delegate { DoToggleWallpaper(); };

        _skin.SetBounds(252, 144, 222, 38);
        _skin.Click += delegate { DoToggleSkin(); };

        // 壁纸区：自己上传图片替换掉原来的壁纸
        _changeWall.SetBounds(18, 192, 222, 38);
        _changeWall.Text = "更换壁纸…";
        _changeWall.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        _changeWall.Click += delegate { DoChangeWallpaper(); };

        _resetWall.SetBounds(252, 192, 222, 38);
        _resetWall.Text = "恢复默认壁纸";
        _resetWall.Click += delegate { DoResetWallpaper(); };

        // 透明度滑块面板（按钮 / 条目 / 气泡 / 性能条 …）
        _alphas.SetBounds(18, 240, 456, 40);
        _alphas.Text = "调节透明度…（按钮 / 条目 / 气泡 / 性能条 …）";
        _alphas.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        _alphas.Click += delegate { DoAlphas(); };

        _apply.SetBounds(18, 290, 222, 42);
        _apply.Text = "应用并重启 DSH";
        _apply.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        _apply.Click += delegate { DoRestart(); };

        _restart.SetBounds(252, 290, 222, 42);
        _restart.Text = "只重启 DSH";
        _restart.Click += delegate { DoRestart(); };

        _doc.SetBounds(18, 342, 222, 34);
        _doc.Text = "查看使用说明";
        _doc.Click += delegate { ShowDoc(); };

        _folder.SetBounds(252, 342, 222, 34);
        _folder.Text = "打开皮肤文件夹";
        _folder.Click += delegate { OpenPath(Skin.SkinDir()); };

        _pathInfo.SetBounds(18, 384, 464, 46);
        _pathInfo.ForeColor = Color.FromArgb(120, 115, 135);
        _pathInfo.Font = new Font("Microsoft YaHei UI", 8F);

        _hint.SetBounds(18, 434, 464, 100);
        _hint.ForeColor = Color.FromArgb(120, 115, 135);
        _hint.Font = new Font("Microsoft YaHei UI", 8F);
        _hint.Text = "· 它已经把整个皮肤包内嵌在自己里面，所以只要这一个文件，不用再另外装皮肤包。\n"
            + "· 右上角是当前壁纸的缩略图；「更换壁纸…」可以选一张你自己的图片替换掉它。\n"
            + "· 装好后重启一次 DSH，界面右下角会出现一个可拖动的小药丸，点一下就能即时开关壁纸。\n"
            + "· 「应用并重启 DSH」会让这里的设置立刻生效（会中断当前正在跑的对话）。";

        Controls.AddRange(new Control[] {
            _status, _preview, _install, _uninstall, _wall, _skin,
            _changeWall, _resetWall, _alphas, _apply, _restart, _doc, _folder, _pathInfo, _hint
        });
        Load += delegate { RefreshState(); };
    }

    private void RefreshState()
    {
        bool installed = Skin.IsInstalled();
        string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
        bool wallOn = true;
        bool skinOn = false;
        if (File.Exists(patchPath))
        {
            string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
            string block = Patch.FindBlock(text);
            skinOn = block != null && !Patch.IsCommented(block);
            wallOn = Patch.ReadOpacity(text) > 0.001;
        }
        _status.Text = "皮肤：" + (installed ? (skinOn ? "已安装 · 已启用" : "已安装 · 已停用") : "未安装")
            + "      壁纸：" + (wallOn ? "开" : "关");
        _status.ForeColor = installed && skinOn
            ? Color.FromArgb(40, 120, 70)
            : Color.FromArgb(150, 110, 40);

        _install.Enabled = !installed || !skinOn;
        _uninstall.Enabled = installed;
        _wall.Enabled = installed;
        _skin.Enabled = installed;
        _wall.Text = wallOn ? "关闭壁纸" : "开启壁纸";
        _skin.Text = skinOn ? "停用皮肤" : "启用皮肤";
        _pathInfo.Text = "皮肤目录：" + Skin.SkinDir() + "\n配置：" + patchPath;
        _changeWall.Enabled = installed;
        _resetWall.Enabled = installed;
        UpdatePreview();
    }

    /// <summary>读配置里的 imagePath 并展开环境变量；读不到返回 null。</summary>
    private static string CurrentImagePath()
    {
        string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
        if (!File.Exists(patchPath)) return null;
        string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
        Match m = Regex.Match(text, @"imagePath:\s*'([^']*)'");
        if (!m.Success) return null;
        string raw = m.Groups[1].Value;
        if (raw.Length == 0) return null;
        try { return Environment.ExpandEnvironmentVariables(raw); } catch { return raw; }
    }

    /// <summary>刷新缩略图。用字节流构造，避免 Image.FromFile 把文件锁住。</summary>
    private void UpdatePreview()
    {
        if (_preview.Image != null) { _preview.Image.Dispose(); _preview.Image = null; }
        string path = CurrentImagePath();
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return;
        try
        {
            byte[] data = File.ReadAllBytes(path);
            using (MemoryStream ms = new MemoryStream(data))
            {
                using (Image loaded = Image.FromStream(ms))
                {
                    _preview.Image = new Bitmap(loaded);
                }
            }
        }
        catch { /* 图读不了就不显示，不必打扰用户 */ }
    }

    // ---------- 操作 ----------

    private void DoInstall()
    {
        StringBuilder log = new StringBuilder();
        try { Skin.Install(delegate (string m) { log.AppendLine(m); }); }
        catch (Exception ex)
        {
            MessageBox.Show(this, "安装出错：\n" + ex.Message, "DSH万用壁纸补丁",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        RefreshState();
        DialogResult r = MessageBox.Show(this,
            "安装完成：\n\n" + log + "\n现在重启 DSH 让它生效吗？",
            "DSH万用壁纸补丁", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
        if (r == DialogResult.Yes) DoRestart();
    }

    private void DoUninstall()
    {
        if (MessageBox.Show(this, "确定卸载皮肤吗？\n会注释掉配置里的皮肤块并删除已释放的文件（重新安装随时可以恢复）。",
                "DSH万用壁纸补丁", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        StringBuilder log = new StringBuilder();
        try { Skin.Uninstall(delegate (string m) { log.AppendLine(m); }); }
        catch (Exception ex)
        {
            MessageBox.Show(this, "卸载出错：\n" + ex.Message, "DSH万用壁纸补丁",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        RefreshState();
        MessageBox.Show(this, "卸载完成：\n\n" + log + "\n重启 DSH 后彻底生效。", "DSH万用壁纸补丁",
            MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void DoToggleWallpaper()
    {
        string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
        if (!File.Exists(patchPath)) { Warn("找不到配置文件。"); return; }
        string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
        bool on = Patch.ReadOpacity(text) > 0.001;
        string replaced = Regex.Replace(text, @"(imageOpacity:\s*)([0-9]*\.?[0-9]+)", "${1}" + (on ? "0" : "0.95"));
        if (replaced == text) { Warn("配置里没有 imageOpacity 这一项。"); return; }
        File.WriteAllText(patchPath, replaced, new UTF8Encoding(false));
        RefreshState();
        AskRestart(on ? "壁纸已关闭。" : "壁纸已开启。");
    }

    private void DoToggleSkin()
    {
        string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
        if (!File.Exists(patchPath)) { Warn("找不到配置文件。"); return; }
        string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
        string block = Patch.FindBlock(text);
        if (block == null) { Warn("配置里没找到皮肤块。"); return; }
        bool on = !Patch.IsCommented(block);
        File.WriteAllText(patchPath, text.Replace(block, on ? Patch.Comment(block) : Patch.Uncomment(block)),
            new UTF8Encoding(false));
        RefreshState();
        AskRestart(on ? "皮肤已停用。" : "皮肤已启用。");
    }

    private const long MaxWallpaperBytes = 12 * 1024 * 1024;

    // 默认壁纸改为放在皮肤自己的目录里，不再引用 Codex Dream Skin 的资源
    // （那是另一个软件的素材，删它会影响那个软件）。
    // 用 %USERPROFILE% 变量形式写进配置，换用户 / 换机器也能解析。
    private const string DefaultWallpaper =
        @"%USERPROFILE%\.dsh\skins\dsh-dream-skin\wallpaper\default-wallpaper.jpg";

    /// <summary>让用户挑一张本地图片当壁纸：复制进皮肤目录，再改配置里的 imagePath。</summary>
    private void DoChangeWallpaper()
    {
        if (!Skin.IsInstalled()) { Warn("请先安装皮肤。"); return; }
        using (OpenFileDialog dlg = new OpenFileDialog())
        {
            dlg.Title = "选择一张图片作为壁纸";
            dlg.Filter = "图片文件|*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.gif|所有文件|*.*";
            dlg.CheckFileExists = true;
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            FileInfo fi;
            try { fi = new FileInfo(dlg.FileName); }
            catch (Exception ex) { Warn("读不到这个文件：\n" + ex.Message); return; }

            if (fi.Length > MaxWallpaperBytes)
            {
                Warn("这张图太大了：" + (fi.Length / 1048576.0).ToString("0.0") + " MB\n"
                    + "请压缩到 12 MB 以内再试。（皮肤会把图片内联进页面，图太大拖慢启动）");
                return;
            }

            // 复制进皮肤自己的目录，配置里用 %USERPROFILE% 写法，换用户/换机器也能用
            string dir = Path.Combine(Skin.SkinDir(), "wallpaper");
            string name = "wall-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + fi.Extension.ToLowerInvariant();
            try
            {
                Directory.CreateDirectory(dir);
                File.Copy(dlg.FileName, Path.Combine(dir, name), true);
            }
            catch (Exception ex) { Warn("复制图片失败：\n" + ex.Message); return; }

            string yamlValue = @"%USERPROFILE%\.dsh\skins\" + Skin.Id + @"\wallpaper\" + name;
            if (!WriteImagePath(yamlValue))
            {
                Warn("没能写入配置。请确认皮肤处于「已启用」状态再试。");
                return;
            }
            RefreshState();
            AskRestart("壁纸已更换为：" + fi.Name);
        }
    }

    /// <summary>恢复成内置的默认壁纸路径。</summary>
    private void DoResetWallpaper()
    {
        if (!Skin.IsInstalled()) { Warn("请先安装皮肤。"); return; }
        // 默认壁纸是皮肤自带的一张图；万一被删了就提示，而不是把坏路径写进配置。
        if (!File.Exists(Environment.ExpandEnvironmentVariables(DefaultWallpaper)))
        {
            Warn("默认壁纸文件不在了：\n" + Environment.ExpandEnvironmentVariables(DefaultWallpaper)
                + "\n\n可以点「更换壁纸…」自己选一张。");
            return;
        }
        if (!WriteImagePath(DefaultWallpaper))
        {
            Warn("没能写入配置。请确认皮肤处于「已启用」状态再试。");
            return;
        }
        RefreshState();
        AskRestart("已恢复默认壁纸。");
    }

    /// <summary>把配置里的 imagePath 换成指定值；皮肤块被注释或没有该键时返回 false。</summary>
    private static bool WriteImagePath(string value)
    {
        string patchPath = Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
        if (!File.Exists(patchPath)) return false;
        string text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n");
        string block = Patch.FindBlock(text);
        if (block == null || Patch.IsCommented(block)) return false;
        // YAML 单引号里是字面量：值里出现的单引号要写成两个
        string safe = value.Replace("'", "''");
        if (!Regex.IsMatch(block, @"imagePath:\s*'[^']*'"))
        {
            return false;   // 块里确实没有 imagePath 这一项
        }
        string newBlock = Regex.Replace(block, @"(imagePath:\s*)'[^']*'", "${1}'" + safe + "'");
        // 值本来就一样也要算成功。「无需改动」不是「写入失败」——
        // 之前把两者混为一谈，导致已经是默认壁纸时点「恢复默认壁纸」会弹错。
        if (newBlock != block)
        {
            File.WriteAllText(patchPath, text.Replace(block, newBlock), new UTF8Encoding(false));
        }
        return true;
    }

    /// <summary>打开透明度调节面板。</summary>
    private void DoAlphas()
    {
        if (!Skin.IsInstalled()) { Warn("请先安装皮肤。"); return; }
        using (AlphaForm f = new AlphaForm())
        {
            f.ShowDialog(this);
        }
        RefreshState();
    }

    /// <summary>供子窗口的「保存并重启 DSH」调用。</summary>
    public void RestartFromChild()
    {
        RefreshState();
        DoRestart();
    }

    private void Warn(string message)
    {
        MessageBox.Show(this, message, "DSH万用壁纸补丁", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    private void AskRestart(string message)
    {
        if (MessageBox.Show(this, message + "\n\n现在重启 DSH 让它生效吗？（会中断当前正在跑的对话）",
                "DSH万用壁纸补丁", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            DoRestart();
    }

    private void DoRestart()
    {
        string exe = Probe.FindDshExe();
        if (exe == null) { Warn("没找到 DeepSeek Harness 的可执行文件，请手动重启它。"); return; }
        int killed = 0;
        foreach (Process p in Process.GetProcesses())
        {
            string name;
            try { name = p.ProcessName; } catch { continue; }
            if (name.IndexOf("DeepSeek", StringComparison.OrdinalIgnoreCase) < 0) continue;
            try { p.Kill(); killed++; } catch { }
        }
        System.Threading.Thread.Sleep(1500);
        try { Process.Start(new ProcessStartInfo { FileName = exe, UseShellExecute = true }); }
        catch (Exception ex)
        {
            MessageBox.Show(this, "已结束 " + killed + " 个进程，但启动失败：\n" + ex.Message,
                "DSH万用壁纸补丁", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        MessageBox.Show(this, "已重启 DSH（结束 " + killed + " 个进程）。", "DSH万用壁纸补丁",
            MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void ShowDoc()
    {
        string tmp = Path.Combine(Path.GetTempPath(), "dsh-dream-skin-README.md");
        try
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("Docs.readme.md"))
            {
                if (s == null) { Warn("内嵌说明缺失。"); return; }
                using (FileStream fs = File.Create(tmp)) s.CopyTo(fs);
            }
            Process.Start(new ProcessStartInfo { FileName = tmp, UseShellExecute = true });
        }
        catch (Exception ex) { Warn("导出说明失败：" + ex.Message); return; }

        // .md 在 Windows 上常常没有默认打开方式，直接指定记事本，免得弹「找不到应用」。
        string notepad = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Windows), "notepad.exe");
        foreach (string ed in new string[] { notepad, "notepad.exe" })
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = ed,
                    Arguments = "\"" + tmp + "\"",
                    UseShellExecute = true
                });
                return;
            }
            catch { }
        }
        // 连记事本都起不来，退回系统默认关联
        try { Process.Start(new ProcessStartInfo { FileName = tmp, UseShellExecute = true }); }
        catch (Exception ex) { Warn("打开说明失败，文件已导出到：\n" + tmp + "\n\n" + ex.Message); }
    }

    private void OpenPath(string path)
    {
        try
        {
            if (Directory.Exists(path) || File.Exists(path))
                Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
            else Warn("路径不存在：\n" + path);
        }
        catch (Exception ex) { Warn(ex.Message); }
    }
}
