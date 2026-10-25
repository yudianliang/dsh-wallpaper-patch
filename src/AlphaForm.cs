// 外观调节窗口：给皮肤里那些"玻璃底"逐个调不透明度，并为每个元素单独挑颜色。
//
// 键名与皮肤 cordis.patch.yml 里的 config 键一一对应：
//   <name>Alpha  不透明度（数字）
//   <name>Tint   底色（颜色字符串，留空 = 用主题原本的中性底色）
// 只改这些值，不动 YAML 结构。
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal sealed class AlphaForm : Form
{
    private sealed class Item
    {
        public string Key;        // 不透明度键名，如 buttonAlpha
        public string TintKey;    // 颜色键名，如 buttonTint
        public double Default;
        public TrackBar Bar;
        public Label Show;
        public Button Color;
        public string Tint = "";  // "" = 用主题原本的中性底色
    }

    private readonly List<Item> _items = new List<Item>();
    private readonly Label _tip = new Label();

    // 不透明度键 / 颜色键 / 界面说明 / 推荐不透明度
    private static readonly string[][] Spec = new string[][]
    {
        new string[] { "buttonAlpha",  "buttonTint",  "侧栏一级按钮（新会话 / 插件…）", "0.70" },
        new string[] { "rowAlpha",     "rowTint",     "侧栏列表条目（会话行）",        "0.50" },
        new string[] { "accountAlpha", "accountTint", "左下角账户入口（头像+名字）",    "0.80" },
        new string[] { "bubbleAlpha",  "bubbleTint",  "用户气泡",                     "0.90" },
        new string[] { "inputAlpha",   "inputTint",   "输入区（composer）",            "0.50" },
        new string[] { "statsAlpha",   "statsTint",   "性能与用量条",                  "1.00" },
        new string[] { "menuAlpha",    "menuTint",    "命令菜单（/ 或 @ 弹出）",        "1.00" },
        new string[] { "scrollAlpha",  "scrollTint",  "滚动条（轨道 + 滑块）",          "1.00" },
        new string[] { "dialogAlpha",  "dialogTint",  "对话框",                       "0.30" },
        new string[] { "panelAlpha",   "panelTint",   "主区面板",                     "0.52" },
        new string[] { "sidebarAlpha", "sidebarFillTint", "左侧栏",                   "0.40" }
    };

    public AlphaForm()
    {
        Text = "调节外观（不透明度 / 颜色）";
        Icon appIcon = AppIcon.Get();
        if (appIcon != null) Icon = appIcon;
        Font = new Font("Microsoft YaHei UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.FromArgb(250, 248, 253);

        Label head = new Label();
        head.SetBounds(18, 10, 540, 18);
        head.Text = "不透明度       颜色";
        head.ForeColor = Color.FromArgb(150, 145, 165);
        head.Font = new Font("Microsoft YaHei UI", 8F);
        Controls.Add(head);

        int y = 32;
        foreach (string[] spec in Spec)
        {
            Item it = new Item();
            it.Key = spec[0];
            it.TintKey = spec[1];
            it.Default = double.Parse(spec[3], CultureInfo.InvariantCulture);
            it.Tint = ReadCurrentTint(spec[1]);

            Label name = new Label();
            name.SetBounds(18, y + 6, 226, 20);
            name.Text = spec[2];
            name.ForeColor = Color.FromArgb(60, 50, 90);
            Controls.Add(name);

            it.Show = new Label();
            it.Show.SetBounds(246, y + 6, 42, 20);
            it.Show.TextAlign = ContentAlignment.MiddleRight;
            it.Show.ForeColor = Color.FromArgb(60, 50, 90);
            Controls.Add(it.Show);

            it.Bar = new TrackBar();
            it.Bar.SetBounds(290, y, 146, 34);
            it.Bar.Minimum = 5;
            it.Bar.Maximum = 100;
            it.Bar.TickFrequency = 5;
            it.Bar.SmallChange = 1;
            it.Bar.LargeChange = 5;
            it.Bar.Value = ToPercent(ReadCurrentAlpha(spec[0], it.Default));
            it.Show.Text = it.Bar.Value + "%";
            Item captured = it;
            it.Bar.ValueChanged += delegate { captured.Show.Text = captured.Bar.Value + "%"; };
            Controls.Add(it.Bar);

            it.Color = new Button();
            it.Color.SetBounds(444, y + 3, 96, 27);
            it.Color.FlatStyle = FlatStyle.Flat;
            it.Color.Click += delegate { PickColor(captured); };
            // 右键清除，恢复主题原本的中性底色
            it.Color.MouseUp += delegate (object s, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Right)
                {
                    captured.Tint = "";
                    RenderColor(captured);
                }
            };
            Controls.Add(it.Color);
            RenderColor(it);

            _items.Add(it);
            y += 36;
        }

        _tip.SetBounds(18, y + 4, 522, 50);
        _tip.ForeColor = Color.FromArgb(120, 115, 135);
        _tip.Font = new Font("Microsoft YaHei UI", 8F);
        _tip.Text = "不透明度：数值越小越透（100% = 完全不透明）。\n"
            + "颜色：点按钮挑选；显示「默认色」表示沿用主题原本的中性底色。\n"
            + "在色块上点右键可清除颜色、恢复默认。改完点「保存」，再重启 DSH 生效。";

        Button save = new Button();
        save.SetBounds(18, y + 60, 256, 40);
        save.Text = "保存";
        save.Click += delegate { Save(false); };

        Button saveGo = new Button();
        saveGo.SetBounds(286, y + 60, 256, 40);
        saveGo.Text = "保存并重启 DSH";
        saveGo.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        saveGo.Click += delegate { Save(true); };

        Button resetA = new Button();
        resetA.SetBounds(18, y + 106, 168, 32);
        resetA.Text = "恢复推荐不透明度";
        resetA.Click += delegate { foreach (Item it in _items) it.Bar.Value = ToPercent(it.Default); };

        Button resetC = new Button();
        resetC.SetBounds(192, y + 106, 168, 32);
        resetC.Text = "恢复默认颜色";
        resetC.Click += delegate { foreach (Item it in _items) { it.Tint = ""; RenderColor(it); } };

        Button close = new Button();
        close.SetBounds(366, y + 106, 176, 32);
        close.Text = "关闭（不保存）";
        close.Click += delegate { Close(); };

        Controls.AddRange(new Control[] { _tip, save, saveGo, resetA, resetC, close });
        ClientSize = new Size(558, y + 152);
    }

    // ---------- 颜色的解析与显示 ----------

    private static Color ParseColor(string hex)
    {
        try
        {
            string s = hex.Trim().TrimStart('#');
            if (s.Length == 3)
                s = new string(new char[] { s[0], s[0], s[1], s[1], s[2], s[2] });
            if (s.Length != 6) return Color.Gray;
            return Color.FromArgb(
                Convert.ToInt32(s.Substring(0, 2), 16),
                Convert.ToInt32(s.Substring(2, 2), 16),
                Convert.ToInt32(s.Substring(4, 2), 16));
        }
        catch { return Color.Gray; }
    }

    private static bool IsDark(Color c)
    {
        // 相对亮度，用来决定按钮上的文字用黑还是白
        return (0.299 * c.R + 0.587 * c.G + 0.114 * c.B) < 140;
    }

    private void RenderColor(Item it)
    {
        if (string.IsNullOrEmpty(it.Tint))
        {
            it.Color.Text = "默认色";
            it.Color.BackColor = Color.FromArgb(240, 238, 246);
            it.Color.ForeColor = Color.FromArgb(115, 110, 130);
        }
        else
        {
            Color c = ParseColor(it.Tint);
            it.Color.Text = it.Tint.ToUpperInvariant();
            it.Color.BackColor = c;
            it.Color.ForeColor = IsDark(c) ? Color.White : Color.Black;
        }
    }

    private void PickColor(Item it)
    {
        using (ColorDialog dlg = new ColorDialog())
        {
            dlg.FullOpen = true;      // 直接展开自定义颜色，省一次点击
            dlg.AnyColor = true;
            if (!string.IsNullOrEmpty(it.Tint)) dlg.Color = ParseColor(it.Tint);
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                it.Tint = string.Format(CultureInfo.InvariantCulture, "#{0:X2}{1:X2}{2:X2}",
                    dlg.Color.R, dlg.Color.G, dlg.Color.B);
                RenderColor(it);
            }
        }
    }

    // ---------- 读写配置 ----------

    private static int ToPercent(double v)
    {
        int p = (int)Math.Round(v * 100);
        if (p < 5) p = 5;
        if (p > 100) p = 100;
        return p;
    }

    private static string PatchPath()
    {
        return Path.Combine(Skin.ProfileDir(), "cordis.patch.yml");
    }

    /// <summary>读某个不透明度的当前值；读不到就用推荐值。</summary>
    private static double ReadCurrentAlpha(string key, double fallback)
    {
        try
        {
            string text = File.ReadAllText(PatchPath(), Encoding.UTF8);
            Match m = Regex.Match(text, key + @":\s*([0-9]*\.?[0-9]+)");
            double v;
            if (m.Success && double.TryParse(m.Groups[1].Value, NumberStyles.Float,
                    CultureInfo.InvariantCulture, out v)) return v;
        }
        catch { }
        return fallback;
    }

    /// <summary>读某个颜色的当前值；没有就用空串（表示主题原本的中性底色）。</summary>
    private static string ReadCurrentTint(string key)
    {
        try
        {
            string text = File.ReadAllText(PatchPath(), Encoding.UTF8);
            Match m = Regex.Match(text, key + @":\s*'([^']*)'");
            if (m.Success) return m.Groups[1].Value.Trim();
        }
        catch { }
        return "";
    }

    private void Save(bool restart)
    {
        string patchPath = PatchPath();
        string text;
        try { text = File.ReadAllText(patchPath, Encoding.UTF8).Replace("\r\n", "\n"); }
        catch (Exception ex) { MessageBox.Show(this, "读配置失败：\n" + ex.Message, Text); return; }

        string block = Patch.FindBlock(text);
        if (block == null || Patch.IsCommented(block))
        {
            MessageBox.Show(this, "皮肤当前是「已停用」状态。\n请先在主窗口点「启用皮肤」，再来调外观。",
                Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string newBlock = block;

        // 1) 先把缺失的颜色键补齐（挂在 menuAlpha 后面，那里是配置块的末尾）
        List<string> missing = new List<string>();
        foreach (Item it in _items)
        {
            if (!Regex.IsMatch(newBlock, it.TintKey + @":\s*'[^']*'")) missing.Add(it.TintKey);
        }
        if (missing.Count > 0)
        {
            StringBuilder add = new StringBuilder();
            foreach (string key in missing) add.Append("\n        " + key + ": ''");
            if (Regex.IsMatch(newBlock, @"menuAlpha:\s*[0-9.]+"))
                newBlock = Regex.Replace(newBlock, @"(menuAlpha:\s*[0-9.]+)", "$1" + add.ToString().Replace("$", "$$"));
            else
                newBlock = Regex.Replace(newBlock, @"(pageToggle:\s*(?:true|false))",
                    "$1" + add.ToString().Replace("$", "$$"));
        }

        // 2) 写不透明度
        foreach (Item it in _items)
        {
            string value = (it.Bar.Value / 100.0).ToString("0.00", CultureInfo.InvariantCulture);
            newBlock = Regex.Replace(newBlock, "(" + it.Key + @":\s*)([0-9]*\.?[0-9]+)", "${1}" + value);
        }

        // 3) 写颜色（YAML 单引号里，值中的单引号要写成两个）
        foreach (Item it in _items)
        {
            string quoted = "'" + it.Tint.Replace("'", "''") + "'";
            newBlock = Regex.Replace(newBlock, "(" + it.TintKey + @":\s*)'[^']*'", "${1}" + quoted);
        }

        if (newBlock == block)
        {
            MessageBox.Show(this, "没有任何改动，无需保存。", Text);
            return;
        }
        try { File.WriteAllText(patchPath, text.Replace(block, newBlock), new UTF8Encoding(false)); }
        catch (Exception ex) { MessageBox.Show(this, "写配置失败：\n" + ex.Message, Text); return; }

        if (!restart)
        {
            MessageBox.Show(this, "已保存。重启 DSH 后生效。", Text,
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        SuiteForm owner = Owner as SuiteForm;
        Close();
        if (owner != null) owner.RestartFromChild();
        else MessageBox.Show(this, "已保存。请手动重启 DSH。", Text);
    }
}
