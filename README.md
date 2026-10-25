# DSH 万用壁纸补丁

[**下载安装包**](../../releases/latest) · [使用说明](docs/使用说明.md) · [手动应用与排错](docs/手动应用与排错.md) · [皮肤包文档](skin/README.zh.md)

给 **DeepSeek Harness 桌面端**换壁纸、换观感的一体化工具。

纯插件实现 —— **不修改 DSH 本体**，不替换任何官方文件；皮肤挂在宿主侧的
`webserver/index-inject` 钩子上，为每个界面响应注入样式。

> **关于壁纸**：本项目**不附带任何美术资源**。默认是一个由 CSS 生成的渐变底；
> 你可以随时换成自己的图片。仓库与安装包都不含第三方插画。

---

## 特性

| 功能 | 说明 |
|---|---|
| **自定义壁纸** | 任意本地图片（jpg / png / webp / gif / avif / bmp / svg）。内联渲染，**不模糊**，等比铺满 |
| **动态壁纸** | `gif` / 动态 `webp` / 动态 `avif` 直接就能动，无需额外设置 |
| **毛玻璃界面** | 侧栏按钮、对话框、输入区使用液态玻璃质感；**大容器不做模糊**，保证壁纸清晰 |
| **逐元素透明度** | 面板里 11 个滑块，分别控制侧栏按钮、列表条目、气泡、输入区、性能条、滚动条、对话框、主区面板、侧栏、账户入口、命令菜单 |
| **逐元素配色** | 每个滑块右边都有一个色块按钮，可把该元素的玻璃底换成任意颜色；清空则回到主题原本的中性色 |
| **一键开关** | 界面右下角有一个可拖动的小药丸，点一下即时开关壁纸（不用重启） |
| **一键安装包** | 单文件 exe，双击自动完成安装，**不需要管理员权限** |
| **安全** | 改动前会备份配置；配置文件损坏能自动修复 |

## 快速开始

### 方式一：用安装包（推荐给普通用户）

1. 到 [Releases](../../releases) 下载 `DSH-Wallpaper-Patch-Setup.exe`
2. 双击它
3. 重启 DSH

它会自动：把程序装到 `%LOCALAPPDATA%\DSH万用壁纸补丁\` → 安装皮肤 → 在桌面创建快捷方式。

> 附件名是英文，是因为 GitHub 的 Release 文件名只接受 ASCII。装好之后，
> 桌面上的快捷方式和安装目录都叫「**DSH万用壁纸补丁**」。

### 方式二：手动安装皮肤（只想要皮肤，不需要那个 GUI）

把 `skin/` 目录整个复制到：

```
%USERPROFILE%\.dsh\skins\dsh-dream-skin\
```

再把这个目录复制（或做 junction）到 profile 的 node_modules：

```
%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-dream-skin\
```

然后在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-dream-skin
      name: 'dsh-dream-skin'
      disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"
      config:
        imagePath: ''          # 留空 = 内置渐变底
        imageOpacity: 1
        panelAlpha: 0.30
```

在 `package.json` 的 `dependencies` 里登记：

```json
"dsh-dream-skin": "file:../../skins/dsh-dream-skin"
```

重启 DSH 即可。

## 配置项

改 `cordis.patch.yml` 里 `dsh-dream-skin` 的 `config`，**重启 DSH** 生效。

| 键 | 默认 | 范围 | 说明 |
|---|---|---|---|
| `imagePath` | `''` | — | 壁纸路径。支持 `%LOCALAPPDATA%` / `%USERPROFILE%` 等环境变量。留空 = 内置渐变 |
| `imageOpacity` | `1` | 0.05–1 | 壁纸不透明度 |
| `blur` | `0` | 0–40 | 壁纸模糊。**保持 0 最清晰** |
| `scrim` | `0.04` | 0–0.9 | 壁纸上的压暗遮罩，保证文字可读 |
| `panelAlpha` | `0.30` | 0.15–1 | 主区面板不透明度。**越小壁纸越明显** |
| `sidebarAlpha` | `0.26` | 0.05–1 | 侧栏不透明度 |
| `glassBlur` | `20` | 0–40 | 毛玻璃半径。只作用于按钮与对话框小块 |
| `buttonAlpha` | `0.70` | 0.05–1 | 侧栏一级按钮 |
| `rowAlpha` | `0.50` | 0.05–1 | 侧栏列表条目 |
| `accountAlpha` | `0.80` | 0.05–1 | 左下角账户入口 |
| `bubbleAlpha` | `0.90` | 0.05–1 | 用户气泡 |
| `inputAlpha` | `0.50` | 0.05–1 | 输入区 |
| `statsAlpha` | `1` | 0.05–1 | 性能与用量条 |
| `scrollAlpha` | `1` | 0.05–1 | 滚动条 |
| `dialogAlpha` | `0.30` | 0.05–1 | 对话框 |
| `menuAlpha` | `1` | 0.05–1 | 命令菜单（输入 `/` 或 `@` 弹出） |
| `buttonTint` | `''` | `#rrggbb` | 侧栏一级按钮 / 工作区按钮的底色 |
| `rowTint` | `''` | `#rrggbb` | 侧栏列表条目的底色 |
| `accountTint` | `''` | `#rrggbb` | 左下角账户入口的底色 |
| `bubbleTint` | `''` | `#rrggbb` | 用户气泡的底色 |
| `inputTint` | `''` | `#rrggbb` | 输入区的底色 |
| `statsTint` | `''` | `#rrggbb` | 性能与用量条的底色 |
| `menuTint` | `''` | `#rrggbb` | 命令菜单的底色 |
| `scrollTint` | `''` | `#rrggbb` | 滚动条滑块的底色 |
| `dialogTint` | `''` | `#rrggbb` | 对话框的底色 |
| `panelTint` | `''` | `#rrggbb` | 主区面板的底色 |
| `sidebarFillTint` | `''` | `#rrggbb` | 侧栏整体底色 |

> 11 个 `*Tint` 留空即沿用主题的中性色（推荐）；只有想给某个元素定一个专属颜色时才填。
| `pageToggle` | `true` | — | 是否注入右下角小药丸 |
| `opaqueSettings` | `true` | — | 设置面板是否强制不透明 |
| `textShadow` | `true` | — | 是否给文字加轻微投影 |
| `sidebarAccent` | `false` | — | `true` 时侧栏套用紫粉强调（渐变/霓虹描边） |
| `sidebarTint` | `#a882ff` | — | 侧栏强调色，仅 `sidebarAccent: true` 时生效 |
| `accentPink` | `#ff45c8` | — | 霓虹粉 |
| `accent` | `''` | — | 覆盖 DSH 主色，留空不动 |
| `maxImageBytes` | `12582912` | — | 壁纸体积上限（默认 12 MiB） |

## 自行编译

需要 .NET Framework 的 `csc.exe`（Windows 自带）与 Node.js 18+。

```powershell
# 只编译主程序
.\scripts\build.ps1

# 连安装包一起编译
.\scripts\build.ps1 -Setup
```

产物在 `build\` 下。

### 跑自检

```powershell
node .\scripts\verify-pkg.mjs .\skin
```

会自动校验包结构、CSS 生成结果、以及宿主插件入口 `apply()` 能否正常注册
（这一项很关键：`apply()` 里少一个变量就会让 DSH 起不来）。

## 工作原理

```
DSH 启动
  └─ 读取 profile 的 cordis.patch.yml
       └─ 加载 skin（cordis 宿主插件）
            └─ 注册 webserver/index-inject 钩子
                 ├─ 注入 <style>：皮肤 CSS（令牌覆盖 + 结构规则）
                 ├─ 注入 <script>：给 <html> 打标记
                 └─ 注入 <script>：右下角小药丸（page.js）
```

几个设计上的取舍：

- **壁纸内联成 data URL**：避免额外的文件服务与路径问题；代价是图不能太大（默认上限 12 MiB）
- **大容器不加 `backdrop-filter`**：只给按钮/对话框加，否则整屏模糊，壁纸就废了
- **用 `[class*=]` 后缀匹配 + DSH 语义令牌**：CSS Modules 的类名带构建哈希，只匹配稳定的后缀部分
- **多选择器规则逐条加主题前缀**：`body[data-ds-dark-theme] A, B` 只会约束 A，B 必须单独写

## 目录结构

```
skin/                 皮肤包（DSH 插件本体，可直接装进 profile）
  lib/index.js        宿主插件：生成 CSS、注册注入钩子
  lib/page.js         页面脚本：右下角壁纸小药丸
  cordis.patch.yml    插入模板（含全部默认配置）
  package.json        包声明（files 字段不含任何图片）
src/                  C# 源码
  Suite.cs            主程序：安装/卸载/开关/换壁纸/透明度面板
  AlphaForm.cs        透明度滑块面板
  Setup.cs            一键安装包
scripts/
  build.ps1           一键编译
  verify-pkg.mjs      离线自检（含 apply() 冒烟测试）
  update-skin-config.mjs  把新配置写进 profile，保留其它行
docs/                 使用说明
```

## 程序面板

主程序 `DSH万用壁纸补丁.exe` 一个窗口解决全部操作：

| 按钮 | 作用 |
|---|---|
| **一键安装皮肤** | 把内嵌的皮肤包装进 profile，并在 `cordis.patch.yml` 里追加插入行 |
| **更换壁纸…** | 选一张本地图片，写入 `imagePath`，立即生效 |
| **恢复默认壁纸** | 清空 `imagePath`，回退到内置渐变底 |
| **调节透明度…** | 打开 11 组「滑块 + 色块」，调完保存即写入配置 |
| **应用并重启 DSH** | 写入配置并重启 DSH |
| **只重启 DSH** | 配置没变、只想重载界面时用 |
| **卸载皮肤** | 移除插入行与依赖登记，DSH 回到原样 |
| **查看使用说明 / 打开皮肤文件夹** | 文档与目录 |

改完配置需要重启 DSH（宿主插件在启动时加载）。
只是想开关壁纸的话，点界面右下角的那个小药丸就行，不用重启。

## 系统要求

- Windows 10 / 11（x64）
- 已安装 **DeepSeek Harness 桌面端** —— 皮肤挂在它的 `desktop` profile 上
- 不需要管理员权限，不需要 Node.js，也不需要 .NET SDK（`csc` 只有自己编译时才用得到）

## 已知限制

- **只支持桌面端 profile**（`cordis.patch.yml` 里用 `!!js` 判断 `profileContext.name`）
- **视频壁纸不支持**：视频无法作为 CSS `background-image`，内联又会把页面撑爆
- **改配置后需要重启 DSH**（宿主插件在启动时加载）；只改 CSS 类配置的话 `Ctrl+R` 也够
- **壁纸体积上限 12 MiB**：内联进页面，太大明显拖慢启动
- 壁纸走的是 `background-size: cover`，极端比例会被裁切

## 许可

[MIT](LICENSE) —— 代码随便用。

**仓库不含任何美术资源。** 请自行确保你所使用的图片拥有相应授权。
