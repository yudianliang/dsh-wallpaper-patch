// 把 profile 补丁层里 dsh-dream-skin 的 insert 块替换为新的增强配置。
// 按行定位块边界，不依赖旧值的精确文本；替换后用真实 YAML 解析器校验。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [, , patchPath, jsYamlDir] = process.argv;
const require = createRequire(path.join(jsYamlDir, '__probe__.cjs'));
const yaml = require(jsYamlDir);

const block = [
  '# ── dsh-dream-skin：DSH 桌面端换肤（Codex Dream Skin 观感）──────────────',
  '# 由 DSH 助手直接应用。挂在宿主侧 index 注入钩子上，为每个界面响应注入皮肤样式。',
  '# 左侧栏：Codex 风格的渐变 + 通透 + 霓虹描边；毛玻璃只加在侧栏按钮小块上，',
  '# 大容器不做模糊，所以壁纸始终清晰。改完任意一项，按 Ctrl+R 刷新界面即可看到。',
  '- insert:',
  '    - id: dsh-dream-skin',
  "      name: 'dsh-dream-skin'",
  '      config:',
  "        imagePath: '%LOCALAPPDATA%\\CodexDreamSkin\\images\\dream-reference.jpg'",
  '        imageOpacity: 0.95',
  '        blur: 0',
  '        panelAlpha: 0.52',
  '        sidebarAlpha: 0.40',
  '        scrim: 0.12',
  '        glassBlur: 20',
  '        buttonAlpha: 0.70',
  '        rowAlpha: 0.50',
  '        dialogAlpha: 0.30',
  '        accountAlpha: 0.80',
  '        inputAlpha: 0.50',
  '        bubbleAlpha: 0.90',
  '        statsAlpha: 1',
  '        menuAlpha: 1',
  '        scrollAlpha: 1',
  '        pageToggle: true',
  "        sidebarTint: '#a882ff'",
  '        sidebarAccent: false',
  "        accentPink: '#ff45c8'",
  '        textShadow: true',
  '        opaqueSettings: true',
  "        accent: ''",
  "        buttonTint: ''",
  "        rowTint: ''",
  "        accountTint: ''",
  "        bubbleTint: ''",
  "        inputTint: ''",
  "        statsTint: ''",
  "        menuTint: ''",
  "        scrollTint: ''",
  "        dialogTint: ''",
  "        panelTint: ''",
  "        sidebarFillTint: ''",
  '        maxImageBytes: 12582912',
];

const text = readFileSync(patchPath, 'utf8');
const lines = text.split('\n');

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() !== '- insert:') continue;
  if (lines.slice(i, i + 8).join('\n').includes('dsh-dream-skin')) { start = i; break; }
}
if (start < 0) throw new Error('未找到 dsh-dream-skin 的 insert 块');

let commentStart = start;
while (commentStart > 0 && lines[commentStart - 1].trim().startsWith('#')) commentStart -= 1;

let end = start + 1;
while (end < lines.length) {
  const line = lines[end];
  if (line.trim() === '') { end += 1; continue; }
  if (!/^\s/.test(line)) break;
  end += 1;
}

const next = `${[...lines.slice(0, commentStart), ...block, ...lines.slice(end)].join('\n').replace(/\s*$/, '')}\n`;
writeFileSync(patchPath, next, 'utf8');

// ---------- 校验 ----------
const doc = yaml.load(readFileSync(patchPath, 'utf8'));
if (!Array.isArray(doc)) throw new Error('解析后顶层不是数组');
const skin = doc.flatMap((row) => row?.insert ?? []).find((row) => row?.id === 'dsh-dream-skin');
if (!skin) throw new Error('替换后找不到 dsh-dream-skin 条目');
const expected = {
  imageOpacity: 0.95, panelAlpha: 0.52, sidebarAlpha: 0.40, scrim: 0.12,
  glassBlur: 20, buttonAlpha: 0.70, rowAlpha: 0.50, dialogAlpha: 0.30, accountAlpha: 0.80,
  inputAlpha: 0.50, bubbleAlpha: 0.90, statsAlpha: 1, menuAlpha: 1, scrollAlpha: 1, pageToggle: true,
  sidebarTint: '#a882ff', sidebarAccent: false,
  buttonTint: '', rowTint: '', accountTint: '', bubbleTint: '', inputTint: '', statsTint: '', menuTint: '', scrollTint: '', dialogTint: '', panelTint: '', sidebarFillTint: '', 
  accentPink: '#ff45c8', textShadow: true, opaqueSettings: true,
};
for (const [key, value] of Object.entries(expected)) {
  if (skin.config?.[key] !== value) throw new Error(`config.${key} 期望 ${value}，实际 ${skin.config?.[key]}`);
}
if (!String(skin.config?.imagePath ?? '').includes('dream-reference.jpg')) throw new Error('imagePath 丢失');

console.log(JSON.stringify({
  ok: true,
  totalRows: doc.length,
  preservedRowIds: doc.filter((r) => r && 'id' in r).map((r) => r.id),
  skinConfig: skin.config,
}, null, 2));
