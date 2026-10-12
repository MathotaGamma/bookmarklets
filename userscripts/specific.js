// ==UserScript==
// @name         アプレット選択ローダー
// @description  GitHubリポジトリの指定ディレクトリにある .js を一覧から選んで、表示中のページで実行します
// @author       Lupar
// @version      0.0.1
// @match        *://*/*
// @noframes
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      data.jsdelivr.com
// @connect      cdn.jsdelivr.net
// @inject-into  content
// ==/UserScript==


(function () {
  'use strict';

  if (window.__appletPickerLoaded) return;
  window.__appletPickerLoaded = true;

  // ===== ここを書き換える =====
  var owner = 'MathotaGamma';  // ユーザー名
  var repo = 'extension';      // リポジトリ名
  var dir = 'scripts';         // 対象ディレクトリ(空 '' でリポジトリ全体)
  var branch = '';             // ブランチ名(空 '' で既定ブランチ)
  // =====               =====

  dir = dir.replace(/^\/+|\/+$/g, '');
  const base = dir ? dir + '/' : '';
  const ICON_SIZE = 50;
  const POS_KEY = 'applet-picker-icon-pos';
  const CACHE_KEY = 'applet-picker-cache:' + owner + '/' + repo + '/' + dir + '@' + branch;
  const CACHE_MS = 10 * 60 * 1000;

  const CSS = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
    }

    .icon {
      position: fixed;
      right: 20px;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #6c5ce7;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: none;
      z-index: 1;
    }

    .icon.dragging {
      opacity: 0.85;
      transform: scale(1.1);
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      font: 16px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    }

    .panel {
      background: #fff;
      color: #111;
      border-radius: 12px;
      padding: 14px;
      width: min(92vw, 420px);
      max-height: 80vh;
      overflow: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .title {
      font-weight: 700;
      margin-bottom: 8px;
      word-break: break-all;
    }

    .msg {
      color: #555;
      padding: 6px 0;
      word-break: break-all;
    }

    button {
      display: block;
      width: 100%;
      margin: 6px 0;
      padding: 12px;
      border: 0;
      border-radius: 8px;
      font: inherit;
      font-size: 16px;
      text-align: left;
      word-break: break-all;
      color: #111;
      background: #E8F0FE;
      cursor: pointer;
      touch-action: manipulation;
    }

    button.sub {
      background: #ddd;
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      border: 2px solid #ccc;
      border-top-color: #6c5ce7;
      border-radius: 50%;
      vertical-align: -2px;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .toast {
      position: fixed;
      left: 50%;
      bottom: calc(24px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 3;
      max-width: 90vw;
      background: rgba(30, 30, 30, 0.95);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font: 13px -apple-system, "Hiragino Sans", sans-serif;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }

    .toast.show {
      opacity: 1;
    }
  `;

  // ---------- UI の土台(Shadow DOM) ----------
  const host = document.createElement('div');
  host.id = 'applet-picker-host';
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  // 対応ブラウザでは、トップレイヤーに載せて、サイト側の要素より前に出す
  host.setAttribute('popover', 'manual');

  function bringToFront(force) {
    const parent = document.documentElement;
    if (!parent) return;
    if (host.parentNode !== parent || host !== parent.lastElementChild) {
      parent.appendChild(host);
    }
    if (typeof host.showPopover === 'function') {
      try {
        if (force && host.matches(':popover-open')) host.hidePopover();
        if (!host.matches(':popover-open')) host.showPopover();
      } catch (e) {}
    }
  }

  // ---------- 操作がサイトへ伝わらないようにする ----------
  const taps = new WeakMap();

  function onTap(el, fn) {
    taps.set(el, fn);
  }

  const BLOCKED_EVENTS = [
    'click', 'dblclick', 'auxclick', 'contextmenu',
    'mousedown', 'mouseup', 'mousemove',
    'pointerdown', 'pointerup', 'pointermove', 'pointercancel',
    'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'wheel', 'keydown', 'keyup', 'keypress'
  ];

  let downInfo = null;
  let lastTapAt = 0;

  function runTap(path) {
    for (const node of path) {
      const fn = taps.get(node);
      if (fn) {
        fn();
        return;
      }
      if (node === host) return;
    }
  }

  function guard(e) {
    // 自分のUIの内側で起きた操作は、window から見ると target が host になる
    if (e.target !== host) {
      // タップ処理の直後に発生する click は、下のサイトへ伝えない
      if (e.type === 'click' && Date.now() - lastTapAt < 700) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      return;
    }

    const path = e.composedPath();
    e.stopImmediatePropagation();

    if (e.type === 'pointerdown') {
      const onIcon = path.includes(icon);
      const rect = onIcon ? icon.getBoundingClientRect() : null;
      downInfo = {
        x: e.clientX,
        y: e.clientY,
        target: path[0],
        onIcon: onIcon,
        pointerId: e.pointerId,
        startLeft: rect ? rect.left : 0,
        startTop: rect ? rect.top : 0,
        dragging: false
      };
      if (onIcon) {
        try {
          icon.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
    } else if (e.type === 'pointermove') {
      const d = downInfo;
      if (d && d.onIcon && d.pointerId === e.pointerId) {
        if (!d.dragging && (Math.abs(e.clientX - d.x) >= 10 || Math.abs(e.clientY - d.y) >= 10)) {
          d.dragging = true;
          icon.classList.add('dragging');
        }
        if (d.dragging) moveIcon(d.startLeft + (e.clientX - d.x), d.startTop + (e.clientY - d.y));
      }
    } else if (e.type === 'pointercancel') {
      endDrag();
      downInfo = null;
    } else if (e.type === 'pointerup') {
      const d = downInfo;
      downInfo = null;
      if (d && d.dragging) {
        endDrag();
        lastTapAt = Date.now();
      } else if (d && d.target === path[0] && Math.abs(e.clientX - d.x) < 10 && Math.abs(e.clientY - d.y) < 10) {
        lastTapAt = Date.now();
        runTap(path);
      }
    } else if (e.type === 'click') {
      if (Date.now() - lastTapAt < 700) return;
      runTap(path);
    }
  }

  BLOCKED_EVENTS.forEach((type) => {
    window.addEventListener(type, guard, { capture: true, passive: type !== 'click' });
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && picker) closePicker();
    },
    true
  );

  // ---------- 小さな部品 ----------
  let toastTimer = 0;
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  shadow.appendChild(toastEl);

  function toast(message, ms) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 3000);
  }

  function makeButton(label, className) {
    const b = document.createElement('button');
    b.type = 'button';
    if (className) b.className = className;
    b.textContent = label;
    return b;
  }

  // パスを区切りごとにURLエンコード(スペースや日本語を含む名前に対応)
  function enc(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function byName(a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }

  // ---------- 通信 ----------
  function httpGet(url) {
    return new Promise((resolve, reject) => {
      let gm = null;
      if (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) gm = GM.xmlHttpRequest;
      else if (typeof GM_xmlhttpRequest !== 'undefined') gm = GM_xmlhttpRequest;

      if (gm) {
        try {
          const r = gm({
            method: 'GET',
            url: url,
            timeout: 15000,
            onload: (res) => {
              if (res.status >= 200 && res.status < 300) resolve(res.responseText);
              else reject(new Error('HTTP ' + res.status));
            },
            onerror: () => reject(new Error('通信エラー')),
            ontimeout: () => reject(new Error('タイムアウト'))
          });
          if (r && typeof r.catch === 'function') r.catch(reject);
        } catch (e) {
          reject(e);
        }
        return;
      }

      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(resolve, reject);
    });
  }

  // ---------- 一覧の取得 ----------
  // (1) GitHub API(サブフォルダ以下も含む)
  async function listFromApi() {
    const api = 'https://api.github.com/repos/' + owner + '/' + repo;
    let br = branch;
    if (!br) {
      const info = JSON.parse(await httpGet(api));
      br = info.default_branch || 'main';
    }
    const d = JSON.parse(await httpGet(api + '/git/trees/' + encodeURIComponent(br) + '?recursive=1'));
    return d.tree
      .filter((i) => i.type === 'blob' && i.path.indexOf(base) === 0 && /\.js$/i.test(i.path))
      .map((i) => {
        const name = i.path.slice(base.length);
        return {
          name: name,
          url: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + br + '/' + base + enc(name),
          branch: br
        };
      })
      .sort(byName);
  }

  // (2) jsDelivr(branch 未指定なら main)
  async function listFromCdn() {
    const br = branch || 'main';
    const d = JSON.parse(
      await httpGet('https://data.jsdelivr.com/v1/package/gh/' + owner + '/' + repo + '@' + br + '/flat')
    );
    const prefix = '/' + base;
    return d.files
      .filter((f) => f.name.indexOf(prefix) === 0 && /\.js$/i.test(f.name))
      .map((f) => {
        const name = f.name.slice(prefix.length);
        return {
          name: name,
          url: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + br + '/' + base + enc(name),
          branch: br
        };
      })
      .sort(byName);
  }

  function readCache() {
    try {
      const v = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (v && Array.isArray(v.items) && Date.now() - v.time < CACHE_MS) return v.items;
    } catch (e) {}
    return null;
  }

  function writeCache(items) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), items: items }));
    } catch (e) {}
  }

  async function loadList(force) {
    if (!force) {
      const cached = readCache();
      if (cached) return cached;
    }
    let items;
    try {
      items = await listFromApi();
    } catch (e) {
      items = await listFromCdn();
    }
    writeCache(items);
    return items;
  }

  // ---------- 実行(3段階で切り替え) ----------
  const PROBE_ATTR = 'data-applet-picker-probe';

  // <script> にコードを入れて実行できるか、事前に確かめる
  function canRunInline() {
    const root = document.documentElement;
    root.removeAttribute(PROBE_ATTR);
    const s = document.createElement('script');
    s.textContent = "document.documentElement.setAttribute('" + PROBE_ATTR + "','1')";
    root.appendChild(s);
    s.remove();
    const ok = root.getAttribute(PROBE_ATTR) === '1';
    root.removeAttribute(PROBE_ATTR);
    return ok;
  }

  function runInline(code) {
    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
    s.remove();
  }

  // Blob の <script> として実行。読み込めたら true
  function runBlob(code) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const s = document.createElement('script');
      const done = (ok) => {
        s.remove();
        URL.revokeObjectURL(url);
        resolve(ok);
      };
      s.onload = () => done(true);
      s.onerror = () => done(false);
      s.src = url;
      document.documentElement.appendChild(s);
    });
  }

  // jsDelivr から <script> で読み込む。読み込めたら true
  function runFromCdn(item) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.onload = () => resolve(true);
      s.onerror = () => {
        s.remove();
        resolve(false);
      };
      s.src = 'https://cdn.jsdelivr.net/gh/' + owner + '/' + repo + '@' + item.branch + '/' + base + enc(item.name);
      document.documentElement.appendChild(s);
    });
  }

  async function runApplet(item) {
    let code = null;
    try {
      code = await httpGet(item.url);
    } catch (e) {}

    if (code !== null) {
      if (canRunInline()) {
        runInline(code);
        toast('実行しました: ' + item.name);
        return;
      }
      if (await runBlob(code)) {
        toast('実行しました: ' + item.name);
        return;
      }
    }
    if (await runFromCdn(item)) {
      toast('実行しました: ' + item.name);
      return;
    }
    toast('実行できませんでした: ' + item.name + '(ページの設定で止められた可能性があります)', 5000);
  }

  // ---------- 一覧画面 ----------
  let picker = null;

  function closePicker() {
    if (!picker) return;
    picker.remove();
    picker = null;
  }

  function setLoading(el, label) {
    el.textContent = '';
    const sp = document.createElement('span');
    sp.className = 'spinner';
    el.append(sp, document.createTextNode(label));
  }

  async function openPicker(force) {
    closePicker();
    bringToFront(true);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const panel = document.createElement('div');
    panel.className = 'panel';
    backdrop.appendChild(panel);
    // 背景(パネルの外側)をタップすると閉じる
    onTap(backdrop, closePicker);
    shadow.appendChild(backdrop);
    picker = backdrop;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = owner + '/' + repo + (dir ? '/' + dir : '');

    const msg = document.createElement('div');
    msg.className = 'msg';
    setLoading(msg, '一覧を取得中…');
    panel.append(title, msg);

    // パネル内のタップでは閉じないように、何もしない処理を登録しておく
    onTap(panel, () => {});

    const addCloseAndRefresh = () => {
      const refresh = makeButton('↻ 更新', 'sub');
      onTap(refresh, () => openPicker(true));
      const close = makeButton('閉じる', 'sub');
      onTap(close, closePicker);
      panel.append(refresh, close);
    };

    try {
      const items = await loadList(force);
      if (picker !== backdrop) return;
      msg.remove();
      if (!items.length) {
        const none = document.createElement('div');
        none.className = 'msg';
        none.textContent = (dir || 'リポジトリ') + ' 内に .js ファイルが見つかりませんでした';
        panel.appendChild(none);
      }
      items.forEach((item) => {
        const b = makeButton(item.name);
        onTap(b, () => {
          closePicker();
          runApplet(item);
        });
        panel.appendChild(b);
      });
    } catch (e) {
      if (picker !== backdrop) return;
      msg.textContent = '一覧を取得できませんでした: ' + e;
    }
    addCloseAndRefresh();
  }

  // ---------- 常駐アイコン(ドラッグで移動・位置を保存) ----------
  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.textContent = '🧩';
  shadow.appendChild(icon);

  let iconRatio = null;

  function loadRatio() {
    try {
      const v = JSON.parse(localStorage.getItem(POS_KEY));
      if (v && isFinite(v.rx) && isFinite(v.ry)) return { rx: v.rx, ry: v.ry };
    } catch (e) {}
    return null;
  }

  function saveRatio() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(iconRatio));
    } catch (e) {}
  }

  function limits() {
    return {
      maxX: Math.max(0, window.innerWidth - ICON_SIZE),
      maxY: Math.max(0, window.innerHeight - ICON_SIZE)
    };
  }

  // 画面内に収めて、アイコンを動かす
  function moveIcon(left, top) {
    const m = limits();
    const x = Math.min(Math.max(0, left), m.maxX);
    const y = Math.min(Math.max(0, top), m.maxY);
    icon.style.left = x + 'px';
    icon.style.top = y + 'px';
    icon.style.right = 'auto';
    icon.style.bottom = 'auto';
    iconRatio = { rx: m.maxX ? x / m.maxX : 0, ry: m.maxY ? y / m.maxY : 0 };
  }

  function applyRatio() {
    if (!iconRatio) return;
    const m = limits();
    moveIcon(iconRatio.rx * m.maxX, iconRatio.ry * m.maxY);
  }

  function endDrag() {
    if (!icon.classList.contains('dragging')) return;
    icon.classList.remove('dragging');
    saveRatio();
  }

  iconRatio = loadRatio();
  applyRatio();
  window.addEventListener('resize', applyRatio);

  onTap(icon, () => {
    if (picker) closePicker();
    else openPicker(false);
  });

  // ---------- 表示 ----------
  bringToFront(false);
  document.addEventListener('DOMContentLoaded', () => bringToFront(false));
  window.addEventListener('load', () => bringToFront(false));

  const htmlEl = document.documentElement;
  if (htmlEl) {
    new MutationObserver(() => {
      if (host.parentNode !== htmlEl || host !== htmlEl.lastElementChild) bringToFront(false);
    }).observe(htmlEl, { childList: true });
  }
})();