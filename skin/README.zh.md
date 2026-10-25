# dsh-dream-skin

给 **DeepSeek Harness 桌面端**换肤的官方形态插件包：背景图、面板通透度、主色与遮罩，**只作用于 desktop profile**（Web/其他 profile 不受影响）。

- 零第三方依赖，离线可装。
- 只覆盖 DSH 自己的 `--dsw-*` 语义令牌，不碰任何组件类名，因此 DSH 升级界面结构后依然可用。
- 背景图由你在本地提供（本包不附带任何第三方美术素材）。

---

## 一、它是怎么工作的

DSH 桌面端的界面由 cordis 插件树组成，其中 `@deepseek-ai/dsh-client-ui-theme` 负责提供 `--dsw-*` 设计令牌（浅色定义在 `body`，深色定义在 `body[data-ds-dark-theme]`）。

本包是一个 **组合包（bundle）**：

| 文件 | 作用 |
|---|---|
| `package.json` | 用 `dsh.bundle.patch` 声明组合包 patch |
| `cordis.patch.yml` | 插入一行宿主插件，并用 `profileContext.name !== 'desktop'` 限定只在桌面端挂载 |
| `lib/index.js` | 挂在 `webserver/index-inject` 钩子上，为每个界面响应注入皮肤样式与一个标记脚本 |

它把三层皮肤叠在界面上：

1. `body::before` —— 你的背景图（固定铺满、可调透明度/模糊）；
2. `body::after` —— 半透明遮罩，保证文字可读；
3. `--dsw-*` 令牌覆盖 —— 把原本不透明的表面换成同色阶的半透明版本，让背景图透出来。

覆盖一律带 `!important`，因为客户端的令牌样式是在运行时注入的、晚于本样式。

---

## 二、安装

### 方式 A（推荐）：用 DSH 的插件管理器

1. 打开 DSH 桌面端，左侧栏进入 **插件**；
2. 点 **添加插件**；
3. 在输入框里填入下面任意一种：
   - 本包压缩包 `dsh-dream-skin-1.0.0.tgz` 的**绝对路径**；
   - 或解压后的目录 **绝对路径**（该目录里应直接看到 `package.json`）；
4. 点 **安装**，装完后点 **立即启用**；
5. 按提示刷新页面（或重启桌面端）即可看到效果。

安装器会用 pnpm 把本包装进当前 profile，并把它加进组合包列表。

> 说明书里写的「添加插件」支持：包名（可带版本）、Git 地址、压缩包、本地绝对路径。

### 方式 B：命令行

```powershell
dsh plugin --profile desktop add "C:\path\to\dsh-dream-skin-1.0.0.tgz"
```

### 方式 C：手工放置（不使用安装器）

1. 解压本包到任意固定目录，例如 `C:\Users\<你>\dsh-skins\dsh-dream-skin`；
2. 编辑 `%USERPROFILE%\.dsh\profiles\desktop\package.json`，在 `dependencies` 里加一行：

   ```json
   "dsh-dream-skin": "file:C:/Users/<你>/dsh-skins/dsh-dream-skin"
   ```

3. 在同一个文件的 `dsh.profile.bundles` 数组末尾加上 `"dsh-dream-skin"`：

   ```json
   "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-dream-skin"]
   ```

4. 在 `%USERPROFILE%\.dsh\profiles\desktop` 下执行 `pnpm install`（DSH 自带 pnpm，见安装目录 `resources\runtime\pnpm`）；
5. 重启 DSH 桌面端。

---

## 三、验证是否生效

在 DSH 窗口里按 `Ctrl+Shift+I` 打开开发者工具，在 Console 输入：

```js
document.documentElement.getAttribute('data-dsh-dream-skin')   // "1" 表示皮肤已注入
document.documentElement.getAttribute('data-dsh-dream-skin-art') // "image" 或 "builtin-gradient"
```

再在 Elements 里选中 `<body>`，检查 `--dsw-alias-bg-layer-1` 是否已是 `color-mix(...)` 形式。

---

## 四、配置

配置写在 **profile 的补丁层**（`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`）里，用行 id 覆盖本包的 `config`：

```yaml
- id: dsh-dream-skin
  config:
    imagePath: 'D:\pictures\my-skin.jpg'
    imageOpacity: 0.62
    blur: 0
    panelAlpha: 0.72
    sidebarAlpha: 0.78
    scrim: 0.22
    accent: ''
```

> 注意：patch 会**替换整行的 config**，所以要把想保留的项一起写全。
> （也可以直接改本包 `cordis.patch.yml` 里的默认值，但 DSH 升级/重装插件会覆盖它。）

| 配置项 | 默认 | 说明 |
|---|---|---|
| `imagePath` | `''` | 背景图绝对路径。支持 `%LOCALAPPDATA%`、`%USERPROFILE%`、`%APPDATA%`、`${VAR}` 形式的环境变量。留空则用内置渐变 |
| `imageOpacity` | `0.95` | 背景图不透明度 `0.05 ~ 1` |
| `blur` | `0` | 背景图模糊像素 `0 ~ 40`。**保持 `0` 才是清晰壁纸** |
| `panelAlpha` | `0.52` | 主区面板通透度 `0.15 ~ 1`，越小越透 |
| `sidebarAlpha` | `0.40` | 左侧栏通透度 `0.05 ~ 1`（默认比主区更透） |
| `scrim` | `0.12` | 背景图之上的遮罩强度 `0 ~ 0.9`，越大文字越清楚 |
| `glassBlur` | `20` | 液态玻璃半径 `0 ~ 40`；`0` 关闭 |
| `buttonAlpha` | `0.70` | **一级按钮**（面板入口 / 新建会话 / 图标按钮）玻璃底，透明度 30% |
| `rowAlpha` | `0.50` | **列表里的单个条目**（工作区 / 会话行 `sessionRow`）玻璃底，透明度 50% |
| `dialogAlpha` | `0.30` | **对话框**毛玻璃底，透明度 70% |
| `accountAlpha` | `0.80` | **左下角个人中心按钮**（头像 + 用户名）玻璃底，不透明度 80% |
| `inputAlpha` | `0.50` | **输入区（composer）**玻璃底，不透明度 50% |
| `bubbleAlpha` | `0.90` | **用户气泡**玻璃底，透明度 10% |
| `statsAlpha` | `1` | **性能与用量条**（composer 下方那一行）不透明度，`1` = 完全不透明 |
| `scrollAlpha` | `1` | **滚动条**（透明轨道 + 滑块）不透明度，`1` = 完全不透明 |
| `pageToggle` | `true` | 是否在界面右下角注入「壁纸 开/关」小开关（可拖动，点击即时生效，不用重启） |
| `sidebarTint` | `'#a882ff'` | 左侧栏色调（Codex Dream Skin 的紫） |
| `accentPink` | `'#ff45c8'` | 侧栏强调色（霓虹粉） |
| `textShadow` | `true` | 面板变透后加极轻文字阴影以保证可读性 |
| `opaqueSettings` | `true` | 设置模态面板（设置 / 插件页）恢复为**完全不透明**（透明度 0%） |
| `accent` | `''` | 主色覆盖，例如 `'#3b82f6'`；留空保持 DSH 原主色 |
| `maxImageBytes` | `12582912` | 背景图体积上限，超过则回退到内置渐变 |

### 左侧栏效果与毛玻璃的位置

左侧栏：**紫色纵向渐变 + 青色收尾 + 霓虹右描边**，侧栏项的悬停/选中态走紫粉强调色。

**毛玻璃只加在左侧栏的按钮小块上**——`panelRow`（会话/面板行）、`newSession`（新建会话）、
`iconButton`（图标按钮）；选中行的 `panelActive` 走紫→粉渐变 + 左侧 3px 粉色强调条。

大容器（侧栏列 `sidebarCol`、主区 `centerCol`）**一律不加 `backdrop-filter`**，壁纸层本身也 `blur: 0`，
因此**壁纸始终清晰**，只有按钮内部才有玻璃质感的模糊。

定位用 `[class*="sidebarCol"]`、`[class*="panelRow"]` 等。DSH 的 CSS Modules 类名形如
`BynINW_sidebarCol`（构建哈希 + 原名后缀），因此这种写法在 DSH 升级后依然有效。

### 调参建议

- 想要**图更抢眼**：`imageOpacity: 1`、`panelAlpha: 0.38`、`scrim: 0.08`
- 想要**文字优先**：`panelAlpha: 0.58`、`scrim: 0.22`、`glassBlur: 22`
- 想要**侧栏更透**：`sidebarAlpha: 0.22`
- 换侧栏色调：`sidebarTint: '#7a9bf0'`（DSH 原生 macOS 侧栏蓝）或 `'#63f4ff'`
- 低配机器关掉毛玻璃：`glassBlur: 0`
- 浅色/深色模式共用同一张图；遮罩会自动按当前模式换成压白/压黑

---

## 五、临时关闭与卸载

- **临时关掉**：在插件管理器里停用 `dsh-dream-skin` 这一行，或在 profile 的补丁层写：

  ```yaml
  - id: dsh-dream-skin
    disabled: true
  ```

- **卸载**：在插件管理器的插件列表里对该组合包选择卸载并确认（会从 profile 依赖与组合包列表中移除）。

---

## 六、已知限制

- **只覆盖语义背景令牌**：面板通透依赖 `--dsw-alias-bg-*`、`--dsw-specific-sidebar-fill` 这几个官方语义令牌。若未来 DSH 引入直接引用静态色阶、不走语义别名的新面板，该面板可能仍是不透明的。此时把它的令牌名加进 `lib/index.js` 的覆盖列表即可。
- **背景图是内联的**：宿主把图片转成 `data:` URL 注入页面，因此图片越大，界面响应越大。默认上限 12 MB，超过会回退到渐变。
- **改配置后需刷新页面**（皮肤是在界面响应时生成的）。
- **只作用于 `desktop` profile**：这是刻意的（本包按你的要求不做 Web 版）。若也想用于 Web，把 `cordis.patch.yml` 里的 `disabled` 表达式删掉即可。
- **不改窗口材质**：Electron 窗口本身的底色/圆角不属于 `--dsw-*` 令牌，本包不触碰。

---

## 七、许可

本包代码为 MIT。包内不含任何第三方图片、角色形象或美术资源；背景图由使用者在本地提供。
