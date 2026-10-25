/**
 * dsh-dream-skin —— DeepSeek Harness 桌面端换肤插件（宿主侧）
 *
 * 设计要点：
 * 1. 只依赖 Node 内置模块，不引入任何第三方依赖，因此离线也能安装。
 * 2. 通过 webserver 的 `index-inject` 钩子注入一段样式与一个标记脚本，
 *    钩子用法与官方 @deepseek-ai/dsh-client-ui-theme 的引导注入完全一致。
 * 3. 覆盖的是 DSH 自己的 `--dsw-*` 语义别名令牌；不碰任何组件类名，
 *    所以 DSH 升级界面结构后皮肤依然可用（最坏情况是某个新面板不透）。
 * 4. 所有覆盖都带 `!important`，因为客户端令牌样式在运行时注入、晚于本样式。
 */

import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

// 页面脚本单独成文件：宿主插件会经过打包/转译，写成字符串常量容易被改写或转义出错。
const PAGE_SCRIPT = readFileSync(new URL('./page.js', import.meta.url), 'utf8');

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

const DEFAULT_MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** 没有配置图片（或图片不可读）时的内置底：与 DSH 品牌色相配的深色渐变。 */
const FALLBACK_ART = [
  'radial-gradient(1200px 820px at 12% 6%, #1d2f6b 0%, rgba(29, 47, 107, 0) 62%)',
  'radial-gradient(1040px 720px at 88% 16%, #3f1f68 0%, rgba(63, 31, 104, 0) 58%)',
  'radial-gradient(920px 900px at 50% 106%, #0e3350 0%, rgba(14, 51, 80, 0) 62%)',
  'linear-gradient(160deg, #0a0f1e 0%, #121a31 55%, #191230 100%)',
].join(', ');

const clampNumber = (value, min, max, fallback) => {
  const number = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

/** 展开 %VAR%（Windows）与 ${VAR} / $VAR 形式的环境变量。 */
const expandEnvironment = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (whole, name) => process.env[name] ?? whole)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) => process.env[name] ?? whole)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name) => process.env[name] ?? whole)
    .trim();
};

// 图片内容缓存：按「展开后的路径 + mtime + 大小」命中，避免每次页面加载都重新编码。
const artCache = new Map();

/**
 * 解析背景图。返回可直接放进 CSS 的 background-image 值。
 * @returns {{ css: string, source: string, fallback: boolean }}
 */
export function resolveArt(config = {}) {
  const raw = typeof config.imagePath === 'string' ? config.imagePath.trim() : '';
  const maxBytes = clampNumber(config.maxImageBytes, 1024, 256 * 1024 * 1024, DEFAULT_MAX_IMAGE_BYTES);

  if (raw) {
    const resolved = expandEnvironment(raw);
    try {
      const stat = statSync(resolved);
      if (stat.isFile() && stat.size > 0 && stat.size <= maxBytes) {
        const key = `${resolved}|${stat.mtimeMs}|${stat.size}`;
        let dataUrl = artCache.get(key);
        if (!dataUrl) {
          const mime = MIME_TYPES[extname(resolved).toLowerCase()] ?? 'image/png';
          dataUrl = `url("data:${mime};base64,${readFileSync(resolved).toString('base64')}")`;
          artCache.clear();
          artCache.set(key, dataUrl);
        }
        return { css: dataUrl, source: resolved, fallback: false };
      }
    } catch {
      // 路径不存在或不可读：静默回退到内置渐变。
    }
  }

  return { css: FALLBACK_ART, source: '(内置渐变)', fallback: true };
}

/** 按配置生成整段皮肤样式。导出以便离线自检。 */
export function buildSkinCss(config = {}, resolvedArt = null) {
  const art = resolvedArt ?? resolveArt(config);
  const imageOpacity = clampNumber(config.imageOpacity, 0.05, 1, 0.95);
  const blur = clampNumber(config.blur, 0, 40, 0);
  const panelAlpha = clampNumber(config.panelAlpha, 0.15, 1, 0.52);
  const sidebarAlpha = clampNumber(config.sidebarAlpha, 0.05, 1, 0.40);
  // 侧栏一级按钮（面板入口 / 新建会话 / 图标按钮）：透明度 30% => 不透明度 0.70。
  const buttonAlpha = clampNumber(config.buttonAlpha, 0.05, 1, 0.70);
  // 列表里的单个条目（工作区 / 会话行）：透明度 50% => 不透明度 0.50。
  const rowAlpha = clampNumber(config.rowAlpha, 0.05, 1, 0.50);
  // 对话框毛玻璃：透明度 70% => 不透明度 0.30。
  const dialogAlpha = clampNumber(config.dialogAlpha, 0.02, 1, 0.30);
  // 左下角个人中心按钮（头像 + 用户名那块）：不透明度 0.80。
  const accountAlpha = clampNumber(config.accountAlpha, 0.05, 1, 0.80);
  // 输入区（composer）玻璃底：不透明度 0.50。
  const inputAlpha = clampNumber(config.inputAlpha, 0.05, 1, 0.50);
  // 用户气泡：透明度 10% => 不透明度 0.90。
  const bubbleAlpha = clampNumber(config.bubbleAlpha, 0.05, 1, 0.90);
  // 性能与用量条（composer 下方那一行）：1 = 完全不透明。
  const statsAlpha = clampNumber(config.statsAlpha, 0.05, 1, 1);
  // 滚动条（轨道 + 滑块）：1 = 完全不透明。
  const scrollAlpha = clampNumber(config.scrollAlpha, 0.05, 1, 1);
  const scrim = clampNumber(config.scrim, 0, 0.9, 0.12);
  const accent = typeof config.accent === 'string' ? config.accent.trim() : '';
  // 左侧栏色调：默认用 Codex Dream Skin 那套紫粉霓虹色。
  const sidebarTint = typeof config.sidebarTint === 'string' && config.sidebarTint.trim()
    ? config.sidebarTint.trim() : '#a882ff';
  // 侧栏是否套用 Codex 那套紫粉强调（渐变 / 霓虹描边 / 紫粉悬停色）。
  // 默认 false —— 保持 DSH 原本的中性色，只保留通透度让壁纸透出来。
  const sidebarAccent = config.sidebarAccent === true;
  const accentPink = typeof config.accentPink === 'string' && config.accentPink.trim()
    ? config.accentPink.trim() : '#ff45c8';
  // 毛玻璃半径；0 关闭。只作用在左侧栏按钮小块上，大容器不加，壁纸保持清晰。
  const glassBlur = clampNumber(config.glassBlur, 0, 40, 20);
  const textShadow = config.textShadow !== false;
  // 命令菜单 / 下拉菜单（输入 / 或 @ 弹出的那个）的不透明度。
  // DSH 原本是半透明的：浅色 #f8f9fa94（58%）、深色 #43454a73（45%）。
  // 这里默认 1 = 完全不透明。
  const menuAlpha = clampNumber(config.menuAlpha, 0.05, 1, 1);
  // 设置模态面板是否恢复为完全不透明（透明度 0%）。
  const opaqueSettings = config.opaqueSettings !== false;

  // sidebarFillTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const sidebarFillTint = typeof config.sidebarFillTint === 'string' && config.sidebarFillTint.trim()
    ? config.sidebarFillTint.trim() : '';
  // buttonTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const buttonTint = typeof config.buttonTint === 'string' && config.buttonTint.trim()
    ? config.buttonTint.trim() : '';
  // rowTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const rowTint = typeof config.rowTint === 'string' && config.rowTint.trim()
    ? config.rowTint.trim() : '';
  // panelTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const panelTint = typeof config.panelTint === 'string' && config.panelTint.trim()
    ? config.panelTint.trim() : '';
  // dialogTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const dialogTint = typeof config.dialogTint === 'string' && config.dialogTint.trim()
    ? config.dialogTint.trim() : '';
  // accountTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const accountTint = typeof config.accountTint === 'string' && config.accountTint.trim()
    ? config.accountTint.trim() : '';
  // inputTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const inputTint = typeof config.inputTint === 'string' && config.inputTint.trim()
    ? config.inputTint.trim() : '';
  // bubbleTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const bubbleTint = typeof config.bubbleTint === 'string' && config.bubbleTint.trim()
    ? config.bubbleTint.trim() : '';
  // statsTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const statsTint = typeof config.statsTint === 'string' && config.statsTint.trim()
    ? config.statsTint.trim() : '';
  // scrollTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const scrollTint = typeof config.scrollTint === 'string' && config.scrollTint.trim()
    ? config.scrollTint.trim() : '';
  // menuTint：留空 = 用主题原本的中性底色；填颜色（如 '#ffcc00'）就换成它。
  const menuTint = typeof config.menuTint === 'string' && config.menuTint.trim()
    ? config.menuTint.trim() : '';

  const percent = (value) => `${Math.round(value * 100)}%`;
  // 抬升面越高越不透明一点，保证卡片层级仍然可辨。
  const layer1 = percent(panelAlpha);
  const layer2 = percent(Math.min(1, panelAlpha + 0.1));
  const layer3 = percent(Math.min(1, panelAlpha + 0.18));
  const overlay = percent(Math.min(1, panelAlpha + 0.2));
  const platform = percent(Math.min(1, panelAlpha + 0.06));
  const sidebar = percent(sidebarAlpha);

  const lines = [];
  lines.push('/* dsh-dream-skin：由宿主侧 index-inject 注入 */');

  // 文档画布透明，露出皮肤层。
  lines.push('html, body { background-color: transparent !important; }');
  lines.push(`html { --dsh-boot-bg: transparent !important; }`);

  // 皮肤图层：负 z-index 让它落在 body 背景之上、全部内容之下。
  lines.push('body::before {');
  lines.push('  content: "";');
  lines.push('  position: fixed;');
  lines.push('  inset: 0;');
  lines.push('  z-index: -2;');
  lines.push('  pointer-events: none;');
  lines.push(`  background-image: ${art.css};`);
  lines.push('  background-size: cover;');
  lines.push('  background-position: center center;');
  lines.push('  background-repeat: no-repeat;');
  lines.push(`  opacity: ${imageOpacity};`);
  if (blur > 0) {
    lines.push(`  filter: blur(${blur}px);`);
    // 模糊会在边缘露白，稍微放大一点盖住。
    lines.push('  transform: scale(1.04);');
  }
  lines.push('}');

  // 可读性遮罩：亮色模式压白、暗色模式压黑。
  lines.push('body::after {');
  lines.push('  content: "";');
  lines.push('  position: fixed;');
  lines.push('  inset: 0;');
  lines.push('  z-index: -1;');
  lines.push('  pointer-events: none;');
  lines.push(`  background: linear-gradient(180deg, rgba(255, 255, 255, ${scrim}), rgba(255, 255, 255, ${Math.min(0.95, scrim + 0.28)}));`);
  lines.push('}');
  lines.push(`body[data-ds-dark-theme]::after { background: linear-gradient(180deg, rgba(6, 8, 18, ${scrim}), rgba(6, 8, 18, ${Math.min(0.95, scrim + 0.3)})); }`);

  // 浅色令牌：把不透明的表面换成对应静态色阶的半透明版本。
  lines.push('body {');
  lines.push('  --dsw-alias-bg-base: transparent !important;');
  lines.push(`  --dsw-alias-bg-layer-1: color-mix(in oklab, var(--dsw-static-neutral-bluish-00) ${layer1}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-2: color-mix(in oklab, var(--dsw-static-neutral-bluish-00) ${layer2}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-3: color-mix(in oklab, var(--dsw-static-neutral-bluish-00) ${layer3}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-overlay: color-mix(in oklab, var(--dsw-static-neutral-bluish-150) ${overlay}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-module-platform: color-mix(in oklab, var(--dsw-static-neutral-bluish-60) ${platform}, transparent) !important;`);
  lines.push(`  --dsw-specific-sidebar-fill: color-mix(in oklab, var(--dsw-static-neutral-bluish-50) ${sidebar}, transparent) !important;`);
  lines.push('}');

  // 暗色令牌：同上，换成暗色静态色阶。
  lines.push('body[data-ds-dark-theme] {');
  lines.push('  --dsw-alias-bg-base: transparent !important;');
  lines.push(`  --dsw-alias-bg-layer-1: color-mix(in oklab, var(--dsw-static-neutral-bluish-875) ${layer1}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-2: color-mix(in oklab, var(--dsw-static-neutral-bluish-850) ${layer2}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-3: color-mix(in oklab, var(--dsw-static-neutral-bluish-800) ${layer3}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-overlay: color-mix(in oklab, var(--dsw-static-neutral-bluish-700) ${overlay}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-module-platform: color-mix(in oklab, var(--dsw-static-neutral-bluish-800) ${platform}, transparent) !important;`);
  lines.push(`  --dsw-specific-sidebar-fill: color-mix(in oklab, var(--dsw-static-neutral-bluish-900) ${sidebar}, transparent) !important;`);
  lines.push('}');

  // ── 左侧栏与工作区：Codex Dream Skin 风格的渐变 + 描边 + 毛玻璃 ──
  // 侧栏列的真实类名是「构建哈希 + 原名后缀」（如 BynINW_sidebarCol），
  // 后缀稳定，所以用 [class*=] 定位既精确又不怕 DSH 升级换哈希。
  const tint = (amount) => `color-mix(in oklab, ${sidebarTint} ${amount}, transparent)`;
  const pink = (amount) => `color-mix(in oklab, ${accentPink} ${amount}, transparent)`;
  const glass = glassBlur > 0
    ? [`  backdrop-filter: blur(${glassBlur}px) saturate(1.22) !important;`,
      `  -webkit-backdrop-filter: blur(${glassBlur}px) saturate(1.22) !important;`]
    : [];

  lines.push('');
  if (sidebarAccent) {
    lines.push('/* ── 左侧栏：Codex Dream Skin 观感（紫粉强调）── */');
    lines.push('[class*="sidebarCol"] {');
    lines.push('  background:');
    lines.push(`    linear-gradient(180deg, ${tint('26%')}, ${tint('7%')} 46%, color-mix(in oklab, #63f4ff 10%, transparent)),`);
    lines.push(`    linear-gradient(90deg, color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-00)'} ${sidebar}, transparent), color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-50)'} ${percent(sidebarAlpha * 0.7)}, transparent)) !important;`);
    lines.push(`  border-right: 1px solid ${tint('48%')} !important;`);
    lines.push(`  box-shadow: inset -1px 0 ${pink('24%')} !important;`);
    lines.push('}');
    lines.push('body[data-ds-dark-theme] [class*="sidebarCol"] {');
    lines.push('  background:');
    lines.push(`    linear-gradient(180deg, ${tint('32%')}, ${tint('10%')} 46%, color-mix(in oklab, #63f4ff 9%, transparent)),`);
    lines.push(`    linear-gradient(90deg, color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-900)'} ${sidebar}, transparent), color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(sidebarAlpha * 0.7)}, transparent)) !important;`);
    lines.push(`  border-right: 1px solid ${tint('40%')} !important;`);
    lines.push('}');

    // 侧栏项的悬停/选中强调色：直接改语义令牌，比命中具体类名更稳。
    lines.push('body {');
    lines.push(`  --dsw-specific-sidebar-nav-item-hover: ${tint('20%')} !important;`);
    lines.push(`  --dsw-specific-sidebar-nav-item-active: ${tint('30%')} !important;`);
    lines.push(`  --dsw-specific-sidebar-nav-item-active-accent: ${pink('28%')} !important;`);
    lines.push('}');
  } else {
    // 不加任何色调，只把 DSH 原本的侧栏底色做透一点，让壁纸透出来。
    // 悬停/选中色也不覆盖 —— 完全交给 DSH 自己的主题。
    lines.push('/* ── 左侧栏：保持 DSH 原本的中性色（只加通透度，不改色调）── */');
    lines.push('[class*="sidebarCol"] {');
    lines.push('  background:');
    lines.push(`    linear-gradient(90deg, color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-00)'} ${sidebar}, transparent), color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-50)'} ${percent(sidebarAlpha * 0.7)}, transparent)) !important;`);
    lines.push('}');
    lines.push('body[data-ds-dark-theme] [class*="sidebarCol"] {');
    lines.push('  background:');
    lines.push(`    linear-gradient(90deg, color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-900)'} ${sidebar}, transparent), color-mix(in oklab, ${sidebarFillTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(sidebarAlpha * 0.7)}, transparent)) !important;`);
    lines.push('}');
  }

  // ── 左侧栏按钮：毛玻璃小块 ──
  // 毛玻璃只挂在这些小块上；侧栏列与主区大容器一律不加 backdrop-filter，
  // 因此壁纸始终清晰，只有按钮内部才有玻璃质感的模糊。
  // newSession 要排除它的子元素（Content / Label / Shortcut），否则子元素也会被加框。
  const newSessionButton = '[class*="newSession"]:not([class*="Content"]):not([class*="Label"]):not([class*="Shortcut"])';
  // 液态玻璃的关键：强模糊 + 高饱和（iOS Liquid Glass 的观感来源）。
  const buttonGlass = glassBlur > 0
    ? [`  backdrop-filter: blur(${glassBlur}px) saturate(1.8) !important;`,
      `  -webkit-backdrop-filter: blur(${glassBlur}px) saturate(1.8) !important;`]
    : [];
  lines.push('');
  lines.push('/* ── 左侧栏按钮：70% 透明度的液态玻璃 ── */');
  lines.push(`[class*="panelRow"], ${newSessionButton} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(buttonAlpha + 0.08)}, transparent), color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, buttonAlpha - 0.06))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 42%, transparent) !important;');
  lines.push('  border-radius: 12px !important;');
  lines.push('  box-shadow:');
  lines.push('    inset 0 1px 0 color-mix(in oklab, #ffffff 62%, transparent),');
  lines.push('    inset 0 -1px 0 color-mix(in oklab, #ffffff 14%, transparent),');
  lines.push('    0 2px 10px rgb(0 0 0 / .10) !important;');
  lines.push(...buttonGlass);
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] [class*="panelRow"], body[data-ds-dark-theme] ${newSessionButton} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(buttonAlpha + 0.08)}, transparent), color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(Math.max(0.02, buttonAlpha - 0.06))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 20%, transparent) !important;');
  lines.push('}');
  lines.push('[class*="panelRow"]:hover {');
  lines.push(`  background: color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.min(1, buttonAlpha + 0.18))}, transparent) !important;`);
  lines.push(`  border-color: ${tint('50%')} !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] [class*="panelRow"]:hover {');
  lines.push(`  background: color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(Math.min(1, buttonAlpha + 0.18))}, transparent) !important;`);
  lines.push('}');
  lines.push('[class*="panelActive"] {');
  lines.push(`  background: linear-gradient(90deg, ${tint('36%')}, ${pink('18%')}) !important;`);
  lines.push(`  border-color: ${pink('55%')} !important;`);
  lines.push(`  box-shadow: inset 3px 0 ${pink('85%')} !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] [class*="panelActive"] {');
  lines.push(`  background: linear-gradient(90deg, ${tint('40%')}, ${pink('22%')}) !important;`);
  lines.push('}');
  lines.push('[class*="iconButton"] {');
  lines.push(`  background: linear-gradient(180deg, color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(buttonAlpha + 0.06)}, transparent), color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, buttonAlpha - 0.08))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 34%, transparent) !important;');
  lines.push('  box-shadow: inset 0 1px 0 color-mix(in oklab, #ffffff 52%, transparent) !important;');
  if (glassBlur > 0) {
    lines.push(`  backdrop-filter: blur(${Math.max(8, Math.round(glassBlur * 0.75))}px) saturate(1.7) !important;`);
    lines.push(`  -webkit-backdrop-filter: blur(${Math.max(8, Math.round(glassBlur * 0.75))}px) saturate(1.7) !important;`);
  }
  lines.push('}');
  lines.push('body[data-ds-dark-theme] [class*="iconButton"] {');
  lines.push(`  background: linear-gradient(180deg, color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(buttonAlpha + 0.06)}, transparent), color-mix(in oklab, ${buttonTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(Math.max(0.02, buttonAlpha - 0.08))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 16%, transparent) !important;');
  lines.push('}');

  // ── 列表里的单个条目（工作区 / 会话行）：50% 透明度 ──
  // 类名来自 workspace 包的 Rows 模块（Rows_module_css_default.sessionRow），
  // 与一级的 panelRow 是两层不同的东西，所以透明度也分开控制。
  const rowGlass = glassBlur > 0
    ? [`  backdrop-filter: blur(${glassBlur}px) saturate(1.7) !important;`,
      `  -webkit-backdrop-filter: blur(${glassBlur}px) saturate(1.7) !important;`]
    : [];
  lines.push('');
  lines.push('/* ── 列表条目：50% 透明度的玻璃 ── */');
  lines.push('[class*="sessionRow"] {');
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${rowTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(rowAlpha + 0.06)}, transparent), color-mix(in oklab, ${rowTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, rowAlpha - 0.04))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 32%, transparent) !important;');
  lines.push('  border-radius: 10px !important;');
  lines.push('  box-shadow: inset 0 1px 0 color-mix(in oklab, #ffffff 46%, transparent) !important;');
  lines.push(...rowGlass);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] [class*="sessionRow"] {');
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${rowTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(rowAlpha + 0.06)}, transparent), color-mix(in oklab, ${rowTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(Math.max(0.02, rowAlpha - 0.04))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 16%, transparent) !important;');
  lines.push('}');
  lines.push('[class*="sessionRow"]:hover {');
  lines.push(`  background: color-mix(in oklab, ${rowTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.min(1, rowAlpha + 0.16))}, transparent) !important;`);
  lines.push('}');

  // 工作区主列：半透明 + 毛玻璃。
  lines.push('[class*="centerCol"] {');
  lines.push(`  background: color-mix(in oklab, ${panelTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(panelAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] [class*="centerCol"] { background: color-mix(in oklab, ${panelTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(panelAlpha)}, transparent) !important; }`);

  // 面板变透之后用极轻的文字阴影保住可读性。
  if (textShadow) {
    lines.push('body { text-shadow: 0 1px 1.5px color-mix(in oklab, var(--dsw-static-neutral-bluish-00) 72%, transparent); }');
    lines.push('body[data-ds-dark-theme] { text-shadow: 0 1px 2px rgb(0 0 0 / .5); }');
  }

  // ── 设置模态面板：完全不透明（透明度 0%）──
  // DSH 的设置 / 插件页是一个 800×800 模态面板，标记为 data-shortcut-modal="settings"，
  // 背景取自 --dsw-alias-bg-layer-2（被本皮肤改成了半透明）。这里在面板作用域内把这些
  // 令牌还原成不透明静态色阶，于是面板本体与其中的卡片都不再透出壁纸。
  if (opaqueSettings) {
    lines.push('');
    lines.push('/* ── 设置面板：完全不透明（透明度 0%）── */');
    lines.push('[data-shortcut-modal="settings"] {');
    lines.push('  --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-00) !important;');
    lines.push('  --dsw-alias-bg-layer-2: var(--dsw-static-neutral-bluish-00) !important;');
    lines.push('  --dsw-alias-bg-layer-3: var(--dsw-static-neutral-bluish-00) !important;');
    lines.push('  --dsw-alias-settings-card-fill: var(--dsw-static-neutral-bluish-50) !important;');
    lines.push('  background: var(--dsw-static-neutral-bluish-00) !important;');
    lines.push('  text-shadow: none !important;');
    lines.push('}');
    lines.push('body[data-ds-dark-theme] [data-shortcut-modal="settings"] {');
    lines.push('  --dsw-alias-bg-layer-1: var(--dsw-static-neutral-bluish-875) !important;');
    lines.push('  --dsw-alias-bg-layer-2: var(--dsw-static-neutral-bluish-850) !important;');
    lines.push('  --dsw-alias-bg-layer-3: var(--dsw-static-neutral-bluish-800) !important;');
    lines.push('  --dsw-alias-settings-card-fill: var(--dsw-static-neutral-bluish-800) !important;');
    lines.push('  background: var(--dsw-static-neutral-bluish-850) !important;');
    lines.push('}');
  }

  // ── 对话框：80% 透明度的玻璃 ──
  // 用 :not([data-shortcut-modal="settings"]) 把设置面板排除掉 —— 它按上一轮的要求保持完全不透明，
  // 否则这条规则会把它一起变透，等于推翻上一轮。
  const dialogTarget = '[role="dialog"][aria-modal="true"]:not([data-shortcut-modal="settings"])';
  const dialogGlass = glassBlur > 0
    ? [`  backdrop-filter: blur(${Math.round(glassBlur * 1.25)}px) saturate(1.8) !important;`,
      `  -webkit-backdrop-filter: blur(${Math.round(glassBlur * 1.25)}px) saturate(1.8) !important;`]
    : [];
  lines.push('');
  lines.push('/* ── 对话框：70% 透明度的毛玻璃 ── */');
  lines.push(`${dialogTarget} {`);
  lines.push(`  --dsw-alias-bg-layer-1: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(dialogAlpha + 0.06)}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-2: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(dialogAlpha)}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-3: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(dialogAlpha + 0.04)}, transparent) !important;`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(dialogAlpha + 0.06)}, transparent), color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, dialogAlpha - 0.04))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 40%, transparent) !important;');
  lines.push('  box-shadow:');
  lines.push('    inset 0 1px 0 color-mix(in oklab, #ffffff 55%, transparent),');
  lines.push('    0 18px 50px rgb(0 0 0 / .22) !important;');
  lines.push(...dialogGlass);
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] ${dialogTarget} {`);
  lines.push(`  --dsw-alias-bg-layer-1: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(dialogAlpha + 0.06)}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-2: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(dialogAlpha)}, transparent) !important;`);
  lines.push(`  --dsw-alias-bg-layer-3: color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-800)'} ${percent(dialogAlpha + 0.04)}, transparent) !important;`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(dialogAlpha + 0.06)}, transparent), color-mix(in oklab, ${dialogTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(Math.max(0.02, dialogAlpha - 0.04))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 18%, transparent) !important;');
  lines.push('}');

  // ── 左下角个人中心按钮：液态玻璃（透明度 20%）──
  // 侧栏底部席位是 triggerRow：账户插件可往 settings.launcher 注册自己的入口，
  // 未注册时外壳保留回退的 trigger 按钮。这里把两者一并覆盖，
  // 并排除 triggerLabel（那是按钮内部的文字 span，给它加框会很难看）。
  const accountButton = '[class*="triggerRow"] > :is(button, [role="button"], [class*="trigger"]):not([class*="triggerLabel"])';
  const accountGlass = glassBlur > 0
    ? [`  backdrop-filter: blur(${glassBlur}px) saturate(1.8) !important;`,
      `  -webkit-backdrop-filter: blur(${glassBlur}px) saturate(1.8) !important;`]
    : [];
  lines.push('');
  lines.push('/* ── 左下角个人中心按钮：20% 透明度的液态玻璃 ── */');
  lines.push(`${accountButton} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${accountTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(accountAlpha + 0.06)}, transparent), color-mix(in oklab, ${accountTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, accountAlpha - 0.06))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 45%, transparent) !important;');
  lines.push('  border-radius: 12px !important;');
  lines.push('  box-shadow:');
  lines.push('    inset 0 1px 0 color-mix(in oklab, #ffffff 66%, transparent),');
  lines.push('    inset 0 -1px 0 color-mix(in oklab, #ffffff 16%, transparent),');
  lines.push('    0 2px 10px rgb(0 0 0 / .10) !important;');
  lines.push(...accountGlass);
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] ${accountButton} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${accountTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(accountAlpha + 0.06)}, transparent), color-mix(in oklab, ${accountTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(Math.max(0.02, accountAlpha - 0.06))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 20%, transparent) !important;');
  lines.push('}');

  // ── 输入区（composer）：不透明度 50% ──
  // composer 卡的背景取自专用语义令牌 --dsw-specific-input-major
  // （浅色 bluish-00 / 暗色 bluish-850），覆盖令牌比依赖类名哈希稳得多。
  // 毛玻璃则用 :has() 精确命中「含输入框的那张卡」，避免误伤设置卡片、账户卡片等其它 card。
  const composerCard = '[class*="card"]:has(textarea, [contenteditable="true"])';
  lines.push('');
  lines.push('/* ── 输入区（composer）：不透明度 50% ── */');
  lines.push('body {');
  lines.push(`  --dsw-specific-input-major: color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(inputAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] {');
  lines.push(`  --dsw-specific-input-major: color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(inputAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push(`${composerCard} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(inputAlpha + 0.05)}, transparent), color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(Math.max(0.02, inputAlpha - 0.05))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 38%, transparent) !important;');
  lines.push('  box-shadow:');
  lines.push('    inset 0 1px 0 color-mix(in oklab, #ffffff 55%, transparent),');
  lines.push('    0 8px 30px rgb(0 0 0 / .12) !important;');
  if (glassBlur > 0) {
    lines.push(`  backdrop-filter: blur(${Math.round(glassBlur * 0.9)}px) saturate(1.7) !important;`);
    lines.push(`  -webkit-backdrop-filter: blur(${Math.round(glassBlur * 0.9)}px) saturate(1.7) !important;`);
  }
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] ${composerCard} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(inputAlpha + 0.05)}, transparent), color-mix(in oklab, ${inputTint || 'var(--dsw-static-neutral-bluish-875)'} ${percent(Math.max(0.02, inputAlpha - 0.05))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 18%, transparent) !important;');
  lines.push('}');

  // ── 用户气泡：透明度 10% => 不透明度 0.90 ──
  // 气泡本体是 chat 包的 .bubble，背景取自专用语义令牌 --dsw-specific-bubble
  // （浅色 deepseek-50 / 暗色 bluish-850）。覆盖令牌即命中气泡，不会波及其它表面。
  const bubbleSurface = '[class*="bubble"]';
  lines.push('');
  lines.push('/* ── 用户气泡：透明度 10% ── */');
  lines.push('body {');
  lines.push(`  --dsw-specific-bubble: color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-deepseek-50)'} ${percent(bubbleAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] {');
  lines.push(`  --dsw-specific-bubble: color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(bubbleAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push(`${bubbleSurface} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-deepseek-50)'} ${percent(Math.min(1, bubbleAlpha + 0.05))}, transparent), color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-deepseek-50)'} ${percent(Math.max(0.02, bubbleAlpha - 0.05))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 40%, transparent) !important;');
  lines.push('  box-shadow: inset 0 1px 0 color-mix(in oklab, #ffffff 58%, transparent), 0 2px 10px rgb(0 0 0 / .08) !important;');
  if (glassBlur > 0) {
    lines.push(`  backdrop-filter: blur(${Math.round(glassBlur * 0.8)}px) saturate(1.6) !important;`);
    lines.push(`  -webkit-backdrop-filter: blur(${Math.round(glassBlur * 0.8)}px) saturate(1.6) !important;`);
  }
  lines.push('}');
  lines.push(`body[data-ds-dark-theme] ${bubbleSurface} {`);
  lines.push('  background:');
  lines.push(`    linear-gradient(180deg, color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(Math.min(1, bubbleAlpha + 0.05))}, transparent), color-mix(in oklab, ${bubbleTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(Math.max(0.02, bubbleAlpha - 0.05))}, transparent)) !important;`);
  lines.push('  border: 1px solid color-mix(in oklab, #ffffff 18%, transparent) !important;');
  lines.push('}');

  // ── 性能与用量条：不透明度 100%（完全不透明）──
  // 组件是 chat 包的 StatsPills（带稳定属性 data-composer-stats，内含 TimePill 与 UsagePill）；
  // 它所在的那一整行是 conversation 包 composer 里的 .dock，上下文百分比那一项也在这行里，
  // 所以两个选择器都覆盖，整行才会一致地不透明。
  // dock 里的 ContextMeter（上下文占用环，._2WTFBq_trigger）自带底色，会盖住父级，
  // 所以把 dock 本身、它的所有直接子元素、以及其中的 trigger 按钮一并染成同一色，
  // 整行（含最右的百分比环）才会真正同色。
  // 用数组保存，浅色 / 暗色两套规则都从它派生 —— 暗色必须【逐个选择器】加主题前缀，
  // 直接对拼接好的字符串加前缀只会约束第一个（踩过这个坑：整行一半白一半黑）。
  const statsBarList = ['[data-composer-stats]', '[class*="dock"]', '[class*="dock"] > *', '[class*="dock"] [class*="trigger"]'];
  const statsBar = statsBarList.join(', ');
  lines.push('');
  lines.push('/* ── 性能与用量条：不透明度 100% ── */');
  lines.push(`${statsBar} {`);
  lines.push(`  background: color-mix(in oklab, ${statsTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(statsAlpha)}, transparent) !important;`);
  lines.push('  border-radius: 10px !important;');
  lines.push('}');
  // 多选择器时必须逐个加主题前缀 —— 直接拼前缀只会约束第一个选择器，
  // 其余会在浅色主题下也套用暗色底（上一版整行颜色不一致就是这个 bug）。
  const statsBarDark = statsBarList.map((sel) => `body[data-ds-dark-theme] ${sel}`).join(', ');
  lines.push(`${statsBarDark} {`);
  lines.push(`  background: color-mix(in oklab, ${statsTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(statsAlpha)}, transparent) !important;`);
  lines.push('}');

  // ── 滚动条：不透明度 100% ──
  // ui-theme 里 ::-webkit-scrollbar-track 的默认值是 background:0 0（全透明），
  // 所以滚动条那一条会直接透出壁纸。这里把轨道与滑块都改成不透明。
  lines.push('');
  lines.push('/* ── 滚动条：不透明度 100% ── */');
  lines.push('body {');
  lines.push(`  --dsh-scrollbar-thumb: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-400)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push(`  --dsh-scrollbar-thumb-hover: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-500)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] {');
  lines.push(`  --dsh-scrollbar-thumb: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-500)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push(`  --dsh-scrollbar-thumb-hover: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-400)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('::-webkit-scrollbar-track {');
  lines.push(`  background: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-00)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] ::-webkit-scrollbar-track {');
  lines.push(`  background: color-mix(in oklab, ${scrollTint || 'var(--dsw-static-neutral-bluish-850)'} ${percent(scrollAlpha)}, transparent) !important;`);
  lines.push('}');

  // ── 壁纸关闭态（页面内小开关即时切换用）──
  // 页面脚本会给 <html> 加 data-dsh-dream-skin-wallpaper="off"；
  // 这里让壁纸层与遮罩直接消失，并把底色恢复为不透明，
  // 免得关掉壁纸之后界面透出 Electron 的窗口底色。
  const wallOff = 'html[data-dsh-dream-skin-wallpaper="off"]';
  lines.push('');
  lines.push('/* ── 壁纸关闭态（页面内开关即时生效）── */');
  lines.push(`${wallOff} body::before, ${wallOff} body::after {`);
  lines.push('  display: none !important;');
  lines.push('}');
  lines.push(`${wallOff} body {`);
  lines.push('  --dsw-alias-bg-base: var(--dsw-static-neutral-bluish-00) !important;');
  lines.push('}');
  lines.push(`${wallOff} body[data-ds-dark-theme] {`);
  lines.push('  --dsw-alias-bg-base: var(--dsw-static-neutral-bluish-1000) !important;');
  lines.push('}');

  // ── 命令菜单 / 下拉菜单的不透明度 ──
  // 菜单底色来自 --dsw-menu-surface-fill（浅色 #f8f9fa94 / 深色 #43454a73，
  // 本身就带 alpha，所以天生半透明）。菜单容器带 data-menu-material 属性，
  // 是 DSH 自己用的稳定钩子，比猜 CSS Modules 的 hash 类名可靠。
  lines.push('');
  lines.push('/* ── 命令菜单 / 下拉菜单 ── */');
  lines.push('[data-menu-material] {');
  lines.push(`  --dsw-menu-surface-fill: color-mix(in oklab, ${menuTint || '#f8f9fa'} ${percent(menuAlpha)}, transparent) !important;`);
  lines.push('}');
  lines.push('body[data-ds-dark-theme] [data-menu-material] {');
  lines.push(`  --dsw-menu-surface-fill: color-mix(in oklab, ${menuTint || '#43454a'} ${percent(menuAlpha)}, transparent) !important;`);
  lines.push('}');

  // 可选主色覆盖。
  if (accent) {
    lines.push(`body { --dsw-alias-brand-primary: ${accent} !important; }`);
    lines.push(`body[data-ds-dark-theme] { --dsw-alias-brand-primary: ${accent} !important; }`);
  }

  return lines.join('\n');
}

/**
 * cordis 宿主插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} config 来自 cordis.patch.yml 的 config
 */
export function apply(ctx, config = {}) {
  // 注意：apply 与 buildSkinCss 是两个独立作用域。这里用到的每个配置项
  // 都必须在本地重新解析一遍 —— 漏掉的话宿主插件注册时会抛
  // "xxx is not defined"，直接导致 DSH 启动失败。
  const pageToggle = config.pageToggle !== false;
  // 每次界面响应都重新按当前配置生成，改配置后刷新页面即可生效。
  ctx.on('webserver/index-inject', (table) => {
    const art = resolveArt(config);
    table.push({ kind: 'style', text: buildSkinCss(config, art) });
    table.push({
      kind: 'script',
      placement: 'body',
      text: `document.documentElement.setAttribute('data-dsh-dream-skin', '1');`
        + `document.documentElement.setAttribute('data-dsh-dream-skin-art', ${JSON.stringify(art.fallback ? 'builtin-gradient' : 'image')});`,
    });
    // 页面内小开关：即时开关壁纸，不需要刷新或重启。
    if (pageToggle) {
      table.push({ kind: 'script', placement: 'body', text: PAGE_SCRIPT });
    }
    // 单参数调用：不依赖 logger 的 printf 风格语义。
    ctx.logger?.info?.(`dsh-dream-skin: 已注入皮肤样式（背景来源：${art.source}）`);
  });
}
