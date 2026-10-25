// 离线自检：验证皮肤包的结构、令牌引用有效性与 CSS 生成结果。
// 不启动 DSH，不做任何系统变更。
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pkgDir = process.argv[2];
const tokensSource = process.argv[3];

const problems = [];
const notes = [];
const check = (ok, message) => {
  if (ok) notes.push(`  [OK]   ${message}`);
  else problems.push(`  [FAIL] ${message}`);
};

// ---------- 1. 包结构 ----------
const pkgJsonPath = path.join(pkgDir, 'package.json');
const patchPath = path.join(pkgDir, 'cordis.patch.yml');
const libPath = path.join(pkgDir, 'lib', 'index.js');
const pagePath = path.join(pkgDir, 'lib', 'page.js');

check(existsSync(pkgJsonPath), 'package.json 存在');
check(existsSync(patchPath), 'cordis.patch.yml 存在');
check(existsSync(libPath), 'lib/index.js 存在');
check(existsSync(path.join(pkgDir, 'lib', 'page.js')), 'lib/page.js 存在（页面内开关脚本）');

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const patchText = readFileSync(patchPath, 'utf8');
check(Array.isArray(pkg.files) && pkg.files.includes('lib/page.js'), 'package.json 的 files 含 lib/page.js（否则发包会漏掉它）');

// ---------- 2. bundle 声明 ----------
const declaredPatch = pkg?.dsh?.bundle?.patch;
const patchList = Array.isArray(declaredPatch) ? declaredPatch : [declaredPatch];
check(patchList.includes('./cordis.patch.yml'), 'package.json 声明了 dsh.bundle.patch = ./cordis.patch.yml');
check(pkg.type === 'module', 'package.json type=module（宿主插件为 ESM）');
check(pkg.main === 'lib/index.js', 'package.json main 指向 lib/index.js');
check(pkg.exports?.['./cordis.patch.yml'] === './cordis.patch.yml', 'exports 暴露 ./cordis.patch.yml');
check((pkg.dependencies ?? {}) && Object.keys(pkg.dependencies ?? {}).length === 0, '没有任何运行时依赖（离线可装）');
for (const file of pkg.files ?? []) {
  check(existsSync(path.join(pkgDir, file)), `files 列表中的 ${file} 存在`);
}

// ---------- 3. patch 结构 ----------
check(/^-\s*insert:/m.test(patchText), 'patch 含 `- insert:` 列表（组合包硬性要求）');
check(/id:\s*dsh-dream-skin/.test(patchText), 'patch 声明了 id: dsh-dream-skin');
check(/name:\s*['"]?dsh-dream-skin['"]?/.test(patchText), 'patch 的 name 指向本包');
check(/disabled:\s*!!js\s+".*desktop.*"/.test(patchText), 'patch 用 !!js 表达式门控 desktop profile');

// ---------- 4. 模块加载与 CSS 生成 ----------
const mod = await import(pathToFileURL(libPath).href);
check(typeof mod.apply === 'function', 'lib/index.js 导出 apply()（cordis 宿主插件入口）');
check(typeof mod.buildSkinCss === 'function', 'lib/index.js 导出 buildSkinCss()（便于自检）');
check(typeof mod.resolveArt === 'function', 'lib/index.js 导出 resolveArt()');

const cssDefault = mod.buildSkinCss({});
check(cssDefault.includes('body::before'), '生成的 CSS 含 body::before 皮肤层');
check(cssDefault.includes('body::after'), '生成的 CSS 含 body::after 遮罩层');
check(cssDefault.includes('body[data-ds-dark-theme]'), '生成的 CSS 区分深色模式');
check(/--dsw-alias-bg-base:\s*transparent\s*!important/.test(cssDefault), '覆盖了 --dsw-alias-bg-base 为透明');
check((cssDefault.match(/!important/g) ?? []).length >= 12, '所有令牌覆盖都带 !important');

// ---------- 5. 令牌引用有效性（关键：拼错令牌名会静默失效）----------
// 直接从 DSH 的主题产物里抓取全部令牌名；正则扫描天然不受 BOM / 格式影响。
//
// 第三个参数是可选的：本仓库不附带 DSH 自己的源码，所以单独 clone 下来跑时
// 拿不到令牌表（known = null）。此时只跳过「令牌是否存在」这两处检查，
// 其余检查（包括下面的覆盖完整度）照常执行。
const known = tokensSource && existsSync(tokensSource)
  ? new Set(readFileSync(tokensSource, 'utf8').match(/--dsw-[a-zA-Z0-9_-]+/g) ?? [])
  : null;

if (known) {
  const referenced = new Set((cssDefault.match(/--dsw-[a-zA-Z0-9_-]+/g) ?? []));
  // 这些是本包自定义注入的，不属于 DSH 令牌表
  const selfDefined = new Set(['--dsh-boot-bg']);
  const unknown = [...referenced].filter((name) => !known.has(name) && !selfDefined.has(name));
  check(unknown.length === 0, `CSS 引用的 ${referenced.size} 个 --dsw-* 令牌全部存在于 DSH 令牌表${unknown.length ? `（未知：${unknown.join(', ')}）` : ''}`);
} else {
  notes.push('  [SKIP] 未提供 DSH 令牌表，跳过「令牌名有效性」检查（加第 3 个参数即可启用）');
}
notes.push(`  [INFO] 本次生成覆盖的 DSH 令牌：`);
for (const name of (cssDefault.match(/--dsw-alias-bg-[a-z0-9-]+|--dsw-specific-sidebar-fill/g) ?? []).sort()) {
  notes.push(`         ${name}`);
}

// ---------- 6. 令牌覆盖的完整度 ----------
const shouldOverride = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-bg-module-platform',
  '--dsw-specific-sidebar-fill',
];
for (const token of shouldOverride) {
  if (known) check(known.has(token), `DSH 令牌表里存在 ${token}`);
  check(new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*:`).test(cssDefault), `CSS 覆盖了 ${token}`);
}

// ---------- 7. 图片解析 ----------
const art = mod.resolveArt({});
check(art.fallback === true && art.css.includes('radial-gradient'), '未配置 imagePath 时回退到内置渐变');

const missing = mod.resolveArt({ imagePath: 'C:\\definitely\\missing\\nope.png' });
check(missing.fallback === true, '图片路径不存在时静默回退（不抛错）');

const envPath = '%LOCALAPPDATA%\\CodexDreamSkin\\images\\dream-reference.jpg';
const expanded = envPath.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (w, n) => process.env[n] ?? w);
if (existsSync(expanded)) {
  const inline = mod.resolveArt({ imagePath: envPath });
  const bytes = statSync(expanded).size;
  check(inline.fallback === false, `环境变量路径可解析并内联（${path.basename(expanded)}, ${bytes} 字节）`);
  check(inline.css.startsWith('url("data:image/'), '图片以内联 data URL 注入 CSS');
  check(inline.css.length > bytes, `base64 长度合理（CSS 片段 ${inline.css.length} 字符）`);
  notes.push(`  [INFO] 背景图 sha256=${createHash('sha256').update(readFileSync(expanded)).digest('hex').slice(0, 16)}`);
} else {
  notes.push(`  [INFO] 未找到本机示例图片（${expanded}），跳过图片内联测试`);
}

const tooBig = mod.resolveArt({ imagePath: envPath, maxImageBytes: 10 });
check(tooBig.fallback === true, '超过 maxImageBytes 时回退到渐变');

// ---------- 8. 参数边界 ----------
const clamped = mod.buildSkinCss({ imageOpacity: 99, blur: -5, panelAlpha: 0, scrim: 5 });
check(/opacity: 1;/.test(clamped), 'imageOpacity 超界被夹到 1');
check(!/blur\(-/.test(clamped), 'blur 负数不会产生非法 CSS');
check(/color-mix\(in oklab, var\(--dsw-static-neutral-bluish-00\) 15%, transparent\)/.test(clamped), 'panelAlpha 下界被夹到 15%');
check(clamped.includes('[class*="sidebarCol"]'), '生成的 CSS 含左侧栏渐变规则');
check(cssDefault.includes('data-menu-material'), 'CSS 覆盖了命令菜单的 data-menu-material');
check(/--dsw-menu-surface-fill: color-mix\(in oklab, #f8f9fa 100%, transparent\)/.test(cssDefault), '菜单默认完全不透明（100%）');
check(/body\[data-ds-dark-theme\] \[data-menu-material\]/.test(cssDefault), '深色主题的菜单规则带主题前缀');
check(mod.buildSkinCss({ menuAlpha: 0.5 }).includes('#f8f9fa 50%'), 'menuAlpha 可调（0.5 → 50%）');
check(mod.buildSkinCss({ menuAlpha: 0 }).includes('#f8f9fa 5%'), 'menuAlpha 下界被夹到 5%');
{
  const pageSrc = readFileSync(pagePath, 'utf8');
  check(pageSrc.includes('dsh-dream-skin-toggle'), '页面脚本含右下角壁纸小开关');
  check(pageSrc.includes('showSaveFilePicker') === false, '页面脚本不碰文件选择器');
}
check(!cssDefault.includes('particles'), '生成的 CSS 不再包含粒子层（功能已移除）');
check(!cssDefault.includes('dsh-dream-skin-particles'), 'CSS 里没有粒子 canvas 的定位规则');
check(!clamped.includes('--dsw-specific-sidebar-nav-item-active-accent'), '默认不覆盖侧栏项强调色（保持 DSH 原本色）');
check(mod.buildSkinCss({ sidebarAccent: true }).includes('--dsw-specific-sidebar-nav-item-active-accent'), 'sidebarAccent=true 时才覆盖强调色');
check(clamped.includes('backdrop-filter: blur('), '生成的 CSS 含毛玻璃');
check(clamped.includes('[class*="panelRow"]'), '左侧栏按钮 panelRow 拿到毛玻璃');
{
  const at = clamped.indexOf('[class*="sidebarCol"] {');
  const sidebarRule = at >= 0 ? clamped.slice(at, at + 520) : '';
  check(sidebarRule.length > 0 && !sidebarRule.includes('backdrop-filter'), '侧栏列大容器不加毛玻璃（壁纸保持清晰）');
  const ct = clamped.indexOf('[class*="centerCol"] {');
  const centerRule = ct >= 0 ? clamped.slice(ct, ct + 320) : '';
  check(centerRule.length > 0 && !centerRule.includes('backdrop-filter'), '主区大容器不加毛玻璃（壁纸保持清晰）');
  check(/\[class\*="panelRow"\][\s\S]{0,700}?saturate\(1\.8\)/.test(clamped), '按钮使用液态玻璃（saturate 1.8）');
  check(/\[class\*="panelRow"\][\s\S]{0,700}?78%/.test(clamped), '一级按钮玻璃底 = buttonAlpha(70%) + 8% 顶部高光');
  check(clamped.includes('[class*="sessionRow"]'), '列表条目 sessionRow 拿到玻璃');
  {
    const rowAt = clamped.indexOf('[class*="sessionRow"] {');
    const rowRule = rowAt >= 0 ? clamped.slice(rowAt, rowAt + 620) : '';
    check(rowRule.length > 0 && rowRule.includes('backdrop-filter: blur('), '列表条目有玻璃模糊');
    check(rowRule.includes('var(--dsw-static-neutral-bluish-00) 56%, transparent'), '列表条目玻璃底 = rowAlpha(50%) + 6% 顶部高光');
  }
  check(clamped.includes(':not([class*="Content"])'), 'newSession 按钮排除了子元素，避免子元素被加框');
}
check(clamped.includes('[data-shortcut-modal="settings"] {'), '覆盖了设置模态面板');
{
  const at = clamped.indexOf('[data-shortcut-modal="settings"] {');
  const panelRule = at >= 0 ? clamped.slice(at, at + 520) : '';
  check(panelRule.length > 0 && !panelRule.includes('color-mix'), '设置面板背景不是半透明（即透明度 0%）');
  check(panelRule.includes('var(--dsw-static-neutral-bluish-00)'), '设置面板背景使用不透明静态色阶');
  check(panelRule.includes('text-shadow: none'), '设置面板内关掉文字阴影');
  const off = mod.buildSkinCss({ opaqueSettings: false });
  check(!off.includes('[data-shortcut-modal="settings"] {'), 'opaqueSettings=false 时不输出设置面板规则');
}
check(clamped.includes('[class*="triggerRow"]'), '左下角个人中心按钮被覆盖');
{
  const at = clamped.indexOf('[class*="triggerRow"] > ');
  const end = at >= 0 ? clamped.indexOf('}', at) : -1;
  const rule = end > at ? clamped.slice(at, end) : '';
  check(rule.length > 0, '生成了个人中心按钮的玻璃规则');
  check(rule.includes('backdrop-filter: blur('), '个人中心按钮有玻璃模糊');
  check(rule.includes('var(--dsw-static-neutral-bluish-00) 86%, transparent'), '个人中心按钮玻璃底 = accountAlpha(80%) + 6% 顶部高光');
  check(rule.includes(':not([class*="triggerLabel"])'), '个人中心按钮排除了内部文字 span');
}
check(clamped.includes('--dsw-specific-input-major'), '输入区令牌被覆盖');
{
  const at = clamped.indexOf('--dsw-specific-input-major: color-mix');
  const decl = at >= 0 ? clamped.slice(at, clamped.indexOf(';', at)) : '';
  check(decl.includes('50%, transparent'), '输入区不透明度 = 50%');
  check(clamped.includes(':has(textarea, [contenteditable="true"])'), '输入区毛玻璃用 :has() 精确命中含输入框的卡片');
  check(/\[class\*="card"\]:has\([\s\S]{0,900}?backdrop-filter: blur\(/.test(clamped), '输入区卡片有玻璃模糊');
  const offInput = mod.buildSkinCss({ inputAlpha: 0.9 });
  check(offInput.includes('90%, transparent'), 'inputAlpha 可配置');
}
check(clamped.includes('--dsw-specific-bubble'), '用户气泡令牌被覆盖');
{
  const at = clamped.indexOf('--dsw-specific-bubble: color-mix');
  const decl = at >= 0 ? clamped.slice(at, clamped.indexOf(';', at)) : '';
  check(decl.includes('90%, transparent'), '用户气泡不透明度 = 90%（即透明度 10%）');
  check(decl.includes('--dsw-static-deepseek-50'), '用户气泡用 deepseek-50 做底');
  check(clamped.includes('[class*="bubble"]'), '气泡本体的玻璃规则已生成');
  check(/\[class\*="bubble"\][\s\S]{0,900}?backdrop-filter: blur\(/.test(clamped), '气泡有玻璃模糊');
  const offBubble = mod.buildSkinCss({ bubbleAlpha: 0.4 });
  check(offBubble.includes('40%, transparent'), 'bubbleAlpha 可配置');
}
check(clamped.includes('[data-composer-stats]'), '性能与用量条被覆盖');
{
  const at = clamped.indexOf('/* ── 性能与用量条');
  const bgAt = at >= 0 ? clamped.indexOf('background', at) : -1;
  const end = bgAt >= 0 ? clamped.indexOf('}', bgAt) : -1;
  const rule = end > bgAt ? clamped.slice(bgAt, end) : '';
  check(rule.length > 0, '生成了性能用量条的规则');
  check(rule.includes('100%, transparent'), '性能用量条不透明度 = 100%');
  check(clamped.includes('[class*="dock"]'), '整行（dock）一并覆盖');
  check(clamped.includes('[class*="dock"] > *'), 'dock 的所有直接子元素同色');
  check(clamped.includes('[class*="dock"] [class*="trigger"]'), '上下文占用环 ContextMeter 同色');
  {
    // 通用防复发：任何暗色规则块，其每个选择器都必须带主题前缀。
    // 注意按「括号外层」的逗号分割 —— :is(a, b) / :has(a, b) 内部也有逗号，
    // 裸切会把一个选择器切碎从而误报。
    const splitTop = (list) => {
      const out = [];
      let depth = 0;
      let cur = '';
      for (const ch of list) {
        if (ch === '(' || ch === '[') depth += 1;
        else if (ch === ')' || ch === ']') depth -= 1;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out.filter(Boolean);
    };
    const darkRules = [...clamped.matchAll(/(?:^|\n)(body\[data-ds-dark-theme\][^{]*)\{/g)].map((m) => m[1]);
    const bad = darkRules.filter((sel) => splitTop(sel).some((part) => !part.startsWith('body[data-ds-dark-theme]')));
    check(darkRules.length >= 5 && bad.length === 0, `所有暗色规则的每个选择器都带主题前缀（已检查 ${darkRules.length} 条）`);
  }
  const offStats = mod.buildSkinCss({ statsAlpha: 0.5 });
  check(offStats.includes('50%, transparent'), 'statsAlpha 可配置');
}
check(clamped.includes('html[data-dsh-dream-skin-wallpaper="off"]'), 'CSS 含壁纸关闭态');
check(clamped.includes('html[data-dsh-dream-skin-wallpaper="off"] body::before'), '关闭态隐藏壁纸层');
check(clamped.includes('--dsw-static-neutral-bluish-1000'), '关闭态恢复深色底色（不透出窗口底）');
check(clamped.includes('::-webkit-scrollbar-track'), '滚动条轨道被覆盖');
{
  const at = clamped.indexOf('::-webkit-scrollbar-track {');
  const end = at >= 0 ? clamped.indexOf('}', at) : -1;
  const rule = end > at ? clamped.slice(at, end) : '';
  check(rule.includes('100%, transparent'), '滚动条轨道不透明度 = 100%');
  check(clamped.includes('--dsh-scrollbar-thumb: color-mix'), '滚动条滑块改为不透明');
  const offScroll = mod.buildSkinCss({ scrollAlpha: 0.4 });
  check(offScroll.includes('40%, transparent'), 'scrollAlpha 可配置');
}
check(clamped.includes(':not([data-shortcut-modal="settings"])'), '对话框玻璃排除了设置面板');
{
  const at = clamped.indexOf('[role="dialog"][aria-modal="true"]:not(');
  const rule = at >= 0 ? clamped.slice(at, at + 1100) : '';
  check(rule.length > 0, '生成了对话框玻璃规则');
  check(rule.includes('backdrop-filter: blur('), '对话框有玻璃模糊');
  check(/--dsw-alias-bg-layer-2: color-mix\([^;]*?30%, transparent\)/.test(rule), '对话框毛玻璃底 30% 不透明（透明度 70%）');
  check(rule.includes('saturate(1.8)'), '对话框同样使用液态玻璃饱和度');
  check(rule.includes('inset 0 1px 0'), '对话框有顶部高光（玻璃质感）');
}
const noGlass = mod.buildSkinCss({ glassBlur: 0 });
check(!noGlass.includes('backdrop-filter: blur('), 'glassBlur=0 时不输出毛玻璃');
const noShadow = mod.buildSkinCss({ textShadow: false });
{
  const noShadowDecls = noShadow.match(/text-shadow:[^;]*/g) ?? [];
  check(noShadowDecls.length > 0 && noShadowDecls.every((decl) => decl.includes('none')), 'textShadow=false 时只剩 text-shadow: none');
  const defaultDecls = clamped.match(/text-shadow:[^;]*/g) ?? [];
  check(defaultDecls.some((decl) => !decl.includes('none')), '默认输出皮肤文字阴影');
}
check(noShadow.includes('text-shadow: none'), '设置面板仍保持 text-shadow: none');
const tinted = mod.buildSkinCss({ sidebarTint: '#12ab34', sidebarAccent: true });
check(tinted.includes('color-mix(in oklab, #12ab34 26%, transparent)'), 'sidebarAccent=true 时 sidebarTint 参与侧栏渐变');

const accented = mod.buildSkinCss({ accent: '#3b82f6' });
check(accented.includes('--dsw-alias-brand-primary: #3b82f6 !important'), 'accent 配置会覆盖主色');

// ---------- apply() 冒烟测试 ----------
// 这是宿主插件的真正入口。buildSkinCss 只是纯函数，就算它全对，
// apply 里少一个变量也会让 DSH 直接起不来 —— 所以必须真的调一次。
{
  const seen = [];
  const fakeCtx = { on: (evt, fn) => seen.push([evt, fn]), logger: { info: () => {} } };
  let threw = null;
  try { mod.apply(fakeCtx, {}); } catch (e) { threw = e; }
  check(threw === null, 'apply() 在默认配置下不抛错' + (threw ? '（' + threw.message + '）' : ''));
  check(seen.length === 1 && seen[0][0] === 'webserver/index-inject', 'apply() 注册了 webserver/index-inject 钩子');

  if (seen.length) {
    const table = [];
    let injectThrew = null;
    try { seen[0][1](table); } catch (e) { injectThrew = e; }
    check(injectThrew === null, '注入回调执行不抛错' + (injectThrew ? '（' + injectThrew.message + '）' : ''));
    check(table.length >= 3, '注入表含样式与脚本（实际 ' + table.length + ' 项）');
    const scripts = table.filter((x) => x.kind === 'script').map((x) => x.text).join('\n');
    check(!scripts.includes('__dshDreamSkinParticles'), '注入表不再含粒子配置脚本（功能已移除）');
    check(!/undefined/.test(scripts), '注入脚本里不含 undefined（变量都解析到了）');
  }

  const combos = [
    {}, { pageToggle: false }, { sidebarTint: '#123456' }, { sidebarAccent: true },
    { accentPink: '' }, { accent: '#3b82f6' }, { imageOpacity: 0 }, { blur: 40 },
  ];
  let bad = null;
  for (const cfg of combos) {
    const handlers = [];
    try {
      mod.apply({ on: (e, f) => handlers.push(f), logger: { info: () => {} } }, cfg);
      handlers[0]([]);
    } catch (e) { bad = JSON.stringify(cfg) + ' → ' + e.message; break; }
  }
  check(bad === null, 'apply() 在 8 种配置组合下都不抛错' + (bad ? '（' + bad + '）' : ''));
}

// ---------- 汇总 ----------
console.log(JSON.stringify({
  package: pkg.name,
  version: pkg.version,
  cssBytes: Buffer.byteLength(cssDefault, 'utf8'),
  checks: notes.length + problems.length,
  failed: problems.length,
  problems,
  details: notes,
}, null, 2));

process.exit(problems.length === 0 ? 0 : 1);
