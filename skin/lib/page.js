/* 由 lib/index.js 注入到 DSH 页面里的脚本。
 *
 * 独立成文件（而不是写成宿主代码里的字符串）有两个原因：
 *   1. 宿主插件会经过打包/转译，字符串常量容易被改写或转义出错；
 *   2. 这个脚本要读写 localStorage、挂 DOM，独立文件便于单独维护。
 *
 * 职责：
 *   1. 维持 <html data-dsh-dream-skin-wallpaper="off"> 这个标记 —— CSS 靠它隐藏壁纸层；
 *   2. 在界面右下角挂一个可拖动的小药丸，点一下即时开关壁纸（不需要刷新或重启）。
 *
 * 状态与位置都存在 localStorage，刷新后保持。
 */
(function () {
  'use strict';

  var KEY = 'dsh-dream-skin-wallpaper';
  var POS = 'dsh-dream-skin-toggle-pos';
  var ID = 'dsh-dream-skin-toggle';
  var root = document.documentElement;

  function readOn() {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch (err) {
      return true; // 隐私模式等场景下拿不到 localStorage，按「开」处理
    }
  }

  function apply(on) {
    if (on) root.removeAttribute('data-dsh-dream-skin-wallpaper');
    else root.setAttribute('data-dsh-dream-skin-wallpaper', 'off');
  }

  var on = readOn();
  apply(on);

  function mount() {
    if (!document.body || document.getElementById(ID)) return;

    var host = document.createElement('div');
    host.id = ID;
    // Shadow DOM：完全隔离 DSH 自己的样式，避免小开关被主题样式改坏。
    var shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.wrap{position:fixed;z-index:2147483000;right:18px;bottom:18px;touch-action:none}' +
      '.btn{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;' +
      'border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.66);' +
      'backdrop-filter:blur(14px) saturate(1.6);-webkit-backdrop-filter:blur(14px) saturate(1.6);' +
      'color:#2b2b33;font:500 12px/1.4 system-ui,"Segoe UI",sans-serif;cursor:pointer;' +
      'opacity:.4;transition:opacity .15s;box-shadow:0 2px 10px rgba(0,0,0,.16);' +
      'user-select:none;white-space:nowrap}' +
      '.btn:hover{opacity:1}' +
      '.btn.dragging{cursor:grabbing;opacity:1}' +
      '.dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none}' +
      '.btn[data-off="1"] .dot{background:#a1a1aa}' +
      '</style>' +
      '<div class="wrap"><button class="btn" type="button"></button></div>';

    var wrap = shadow.querySelector('.wrap');
    var btn = shadow.querySelector('.btn');

    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(POS) || 'null');
    } catch (err) {
      saved = null;
    }
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = saved.x + 'px';
      wrap.style.top = saved.y + 'px';
    }

    function render() {
      btn.setAttribute('data-off', on ? '0' : '1');
      btn.innerHTML = '<span class="dot"></span>' + (on ? '壁纸：开' : '壁纸：关');
      btn.title = '点击开关壁纸（可以拖动）';
      btn.setAttribute('aria-label', on ? '关闭壁纸' : '开启壁纸');
    }
    render();

    // 拖动与点击共用 pointer 事件：位移超过 5px 视为拖动，否则视为点击。
    var from = null;
    var moved = false;

    btn.addEventListener('pointerdown', function (e) {
      var r = wrap.getBoundingClientRect();
      from = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      moved = false;
      btn.classList.add('dragging');
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 某些环境不支持，忽略 */ }
    });

    btn.addEventListener('pointermove', function (e) {
      if (!from) return;
      var dx = e.clientX - from.x;
      var dy = e.clientY - from.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      var nx = Math.max(4, Math.min(window.innerWidth - 40, from.left + dx));
      var ny = Math.max(4, Math.min(window.innerHeight - 32, from.top + dy));
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = nx + 'px';
      wrap.style.top = ny + 'px';
    });

    btn.addEventListener('pointerup', function (e) {
      btn.classList.remove('dragging');
      var wasDrag = moved;
      from = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (wasDrag) {
        var r = wrap.getBoundingClientRect();
        try {
          localStorage.setItem(POS, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
        } catch (err) { /* 忽略 */ }
        return;
      }
      on = !on;
      apply(on);
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (err) { /* 忽略 */ }
      render();
    });

    document.body.appendChild(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
