/*
 * JS環境 js_playground_v1.js
 * 表示中のサイト上でJavaScriptを実行できる、画面下部のパネルです。
 *
 * 機能
 * - コードエディタ(Tabで空白2つ、Enterで自動インデント、Ctrl/⌘+Enterで実行)
 * - コンソール(console.log / info / warn / error / debug、サイトのエラーも表示)
 *   - 文字は長押しして範囲選択でき、そのままコピーできる
 *   - 全体のコピーとクリアのボタン付き
 * - 式を1行で実行する入力欄(Enterで実行、↑↓で履歴)
 * - コードの保存(localStorage)・一覧・読み込み・削除・クリップボードへのコピー・貼り付け
 *   - 保存先はサイトごとのlocalStorageです。他のサイトへは「全部コピー(JSON)」→「読み込む」で移せます
 *   - 編集中のコードは、自動で下書きとして保存されます
 * - パネルの高さは、上の取っ手のドラッグで変更できる。▾で小さくでき、✕で隠せる
 * - 画面は Shadow DOM に入れ、サイトのCSSの影響を受けない
 * - パネルへの操作は、下のサイトへ伝えない
 *
 * 使い方
 * - ブックマークレットのローダーやアプレット選択から、このファイルを実行します(再実行でパネルを開き直します)
 * - Userscripts で使う場合は、先頭に ==UserScript== のヘッダー(@match など)を付けてください
 */
(function () {
  'use strict';

  if (window.__jsPlayground) {
    window.__jsPlayground.open();
    return;
  }

  const KEY_SNIPPETS = 'jsplay:snippets';
  const KEY_DRAFT = 'jsplay:draft';
  const KEY_UI = 'jsplay:ui';
  const LOG_LIMIT = 500;
  const ENTRY_MAX = 20000;
  const DEFAULT_CODE = 'console.log(document.title);\nconsole.log(location.href);\n';

  // ---------- 保存 ----------
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 画面 ----------
  const CSS = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
    }

    .dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 55vh;
      display: flex;
      flex-direction: column;
      background: #1e1f24;
      color: #e6e6e6;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
      font: 14px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    }

    .dock.min {
      height: auto !important;
    }

    .grip {
      flex: none;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: ns-resize;
      touch-action: none;
    }

    .grip::before {
      content: "";
      width: 44px;
      height: 4px;
      border-radius: 2px;
      background: #666;
    }

    .bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px 6px;
    }

    .bar .title {
      margin-right: auto;
      font-weight: 700;
    }

    .seg {
      display: inline-flex;
    }

    .seg button {
      border-radius: 0;
    }

    .seg button:first-child {
      border-radius: 6px 0 0 6px;
    }

    .seg button:last-child {
      border-radius: 0 6px 6px 0;
    }

    button {
      flex: none;
      font: inherit;
      font-size: 13px;
      color: #fff;
      background: #3a3d46;
      border: 0;
      border-radius: 6px;
      padding: 7px 10px;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      white-space: nowrap;
    }

    button.primary {
      background: #2e8b57;
    }

    button.on {
      background: #3b82f6;
    }

    button.danger {
      background: #a33a3a;
    }

    .body {
      position: relative;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .dock.min .body {
      display: none;
    }

    .pane {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-top: 1px solid #333;
    }

    .dock.mode-editor .pane.console {
      display: none;
    }

    .dock.mode-console .pane.editor {
      display: none;
    }

    .toolbar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      overflow-x: auto;
    }

    .toolbar .label {
      color: #aaa;
      font-size: 12px;
      margin-right: auto;
    }

    input,
    textarea {
      font: inherit;
      color: #e6e6e6;
      background: #15161a;
      border: 1px solid #3a3d46;
      border-radius: 6px;
      outline: none;
    }

    input {
      min-width: 0;
      padding: 7px 8px;
      font-size: 14px;
    }

    #nameInput {
      flex: 1 1 110px;
      min-width: 90px;
    }

    textarea.code {
      flex: 1;
      min-height: 0;
      width: 100%;
      resize: none;
      border: 0;
      border-radius: 0;
      padding: 10px;
      font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace;
      tab-size: 2;
      white-space: pre;
      overflow: auto;
      -webkit-user-select: text;
      user-select: text;
    }

    .log {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 4px 10px;
      font: 12.5px/1.45 ui-monospace, Menlo, Consolas, monospace;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      -webkit-user-select: text;
      user-select: text;
      -webkit-touch-callout: default;
    }

    .line {
      position: relative;
      padding: 3px 0 3px 18px;
      border-bottom: 1px solid #2a2c33;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .line::before {
      position: absolute;
      left: 0;
      color: #888;
      content: "";
    }

    .line.input {
      color: #9cdcfe;
    }

    .line.input::before {
      content: ">";
    }

    .line.result {
      color: #b5cea8;
    }

    .line.result::before {
      content: "←";
    }

    .line.info {
      color: #79c0ff;
    }

    .line.info::before {
      content: "ℹ";
    }

    .line.warn {
      color: #e5c07b;
      background: rgba(229, 192, 123, 0.08);
    }

    .line.warn::before {
      content: "⚠";
    }

    .line.error {
      color: #ff7b72;
      background: rgba(255, 123, 114, 0.08);
    }

    .line.error::before {
      content: "✖";
    }

    .line.debug {
      color: #999;
    }

    .line.sys {
      color: #888;
      font-style: italic;
    }

    .repl {
      flex: none;
      display: flex;
      gap: 6px;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid #333;
    }

    .repl input {
      flex: 1;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 13px;
    }

    .saved {
      display: none;
      position: absolute;
      inset: 0;
      overflow: auto;
      padding: 8px;
      background: #1e1f24;
      -webkit-overflow-scrolling: touch;
      -webkit-user-select: text;
      user-select: text;
    }

    .dock.show-saved .saved {
      display: block;
    }

    .saved h4 {
      margin: 0 0 8px;
      font-size: 14px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 6px 0;
    }

    .row .name {
      flex: 1;
      min-width: 0;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty {
      color: #888;
      padding: 8px 0;
    }

    .import {
      width: 100%;
      height: 70px;
      margin-top: 6px;
      padding: 8px;
      font: 12px ui-monospace, Menlo, Consolas, monospace;
      resize: none;
    }

    .toast {
      position: fixed;
      left: 50%;
      bottom: 90px;
      transform: translateX(-50%);
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

  const HTML = `
    <div class="dock mode-both" id="dock">
      <div class="grip" id="grip"></div>
      <div class="bar">
        <span class="title">JS環境</span>
        <span class="seg">
          <button id="mEditor">エディタ</button>
          <button id="mBoth">分割</button>
          <button id="mConsole">コンソール</button>
        </span>
        <button id="btnMin">▾</button>
        <button id="btnClose">✕</button>
      </div>
      <div class="body">
        <section class="pane editor">
          <div class="toolbar">
            <button id="btnRun" class="primary">▶ 実行</button>
            <input id="nameInput" placeholder="名前" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false">
            <button id="btnSave">💾 保存</button>
            <button id="btnSaved">📂 保存済み</button>
            <button id="btnCopyCode">📋 コピー</button>
            <button id="btnPaste">📥 貼り付け</button>
            <button id="btnClearCode" class="danger">🗑 消去</button>
          </div>
          <textarea id="code" class="code" wrap="off" spellcheck="false" autocapitalize="none" autocorrect="off" autocomplete="off"></textarea>
        </section>
        <section class="pane console">
          <div class="toolbar">
            <span class="label">コンソール(長押しで範囲選択できます)</span>
            <button id="btnCopyLog">📋 全部コピー</button>
            <button id="btnClearLog">🧹 クリア</button>
          </div>
          <div id="log" class="log"></div>
          <div class="repl">
            <input id="repl" placeholder="式を入力(Enterで実行)" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false">
            <button id="btnEval" class="primary">実行</button>
          </div>
        </section>
        <section class="saved" id="saved"></section>
      </div>
    </div>
    <div class="toast" id="toast"></div>
  `;

  const host = document.createElement('div');
  host.id = 'js-playground-host';
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<style>' + CSS + '</style>' + HTML;
  host.setAttribute('popover', 'manual');

  const q = (selector) => shadow.querySelector(selector);
  const dock = q('#dock');
  const codeEl = q('#code');
  const nameInput = q('#nameInput');
  const logEl = q('#log');
  const replEl = q('#repl');
  const savedEl = q('#saved');
  const toastEl = q('#toast');

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
  // パネルへの操作は、window のキャプチャ段階で止める。
  // 止めるとパネル内のリスナーが動かないため、タップ・キー・ドラッグは登録した処理を自前で呼ぶ。
  // (入力欄への入力・フォーカス・文字の選択などは、止めても標準の動作のまま働く)
  const taps = new WeakMap();
  const keys = new WeakMap();
  const drags = new WeakMap();

  function onTap(el, fn) {
    taps.set(el, fn);
  }

  function onKey(el, fn) {
    keys.set(el, fn);
  }

  function onDrag(el, spec) {
    drags.set(el, spec);
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

    if (e.type === 'keydown') {
      for (const node of path) {
        const fn = keys.get(node);
        if (fn) {
          fn(e);
          return;
        }
        if (node === host) return;
      }
      return;
    }

    if (e.type === 'pointerdown') {
      const dragNode = path.find((n) => drags.has(n));
      downInfo = {
        x: e.clientX,
        y: e.clientY,
        target: path[0],
        pointerId: e.pointerId,
        drag: dragNode ? { node: dragNode, state: drags.get(dragNode).start() } : null
      };
      if (dragNode) {
        try {
          dragNode.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
    } else if (e.type === 'pointermove') {
      const d = downInfo;
      if (d && d.drag && d.pointerId === e.pointerId) {
        drags.get(d.drag.node).move(e, d, d.drag.state);
      }
    } else if (e.type === 'pointercancel') {
      const d = downInfo;
      downInfo = null;
      if (d && d.drag) drags.get(d.drag.node).end();
    } else if (e.type === 'pointerup') {
      const d = downInfo;
      downInfo = null;
      if (d && d.drag) {
        drags.get(d.drag.node).end();
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
    // click と keydown は preventDefault を使うため、passive にしない
    window.addEventListener(type, guard, { capture: true, passive: !(type === 'click' || type === 'keydown') });
  });

  // ---------- 小さな部品 ----------
  let toastTimer = 0;

  function toast(message, ms) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2500);
  }

  async function copyText(text, doneMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(doneMessage || 'コピーしました');
      return;
    } catch (e) {}
    const t = document.createElement('textarea');
    t.value = text;
    shadow.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    try {
      document.execCommand('copy');
      toast(doneMessage || 'コピーしました');
    } catch (e) {
      toast('コピーできませんでした');
    }
    t.remove();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function stamp() {
    const d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  // ---------- コンソール ----------
  const entries = [];
  const PREFIX = { log: '', sys: '', debug: '[debug] ', info: '[info] ', warn: '[warn] ', error: '[error] ', input: '> ', result: '← ' };

  function hasSelection() {
    try {
      const s = window.getSelection();
      return !!s && s.toString().length > 0;
    } catch (e) {
      return false;
    }
  }

  function addEntry(level, text) {
    if (text.length > ENTRY_MAX) text = text.slice(0, ENTRY_MAX) + '…(省略)';
    entries.push({ level: level, text: text });
    const line = document.createElement('div');
    line.className = 'line ' + level;
    line.textContent = text;
    const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    logEl.appendChild(line);
    if (entries.length > LOG_LIMIT) {
      entries.shift();
      if (logEl.firstChild) logEl.firstChild.remove();
    }
    // 範囲選択している間は、自動でスクロールしない
    if (nearBottom && !hasSelection()) logEl.scrollTop = logEl.scrollHeight;
  }

  function describeNode(n) {
    if (n.nodeType === 1) {
      const id = n.id ? '#' + n.id : '';
      const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : '';
      return '<' + n.tagName.toLowerCase() + id + cls + '>';
    }
    return '#' + (n.nodeName || 'node');
  }

  function format(v, depth, seen) {
    depth = depth || 0;
    seen = seen || new Set();
    const t = typeof v;
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (t === 'string') return depth === 0 ? v : JSON.stringify(v);
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'bigint') return String(v) + 'n';
    if (t === 'symbol') return v.toString();
    if (t === 'function') return 'ƒ ' + (v.name || '(anonymous)') + '()';

    const tag = Object.prototype.toString.call(v);
    if (tag === '[object Error]' || (v && typeof v.message === 'string' && typeof v.name === 'string' && v.stack)) {
      return formatError(v);
    }
    if (typeof Node !== 'undefined' && v instanceof Node) return describeNode(v);
    if (seen.has(v)) return '[Circular]';
    if (depth >= 3) return Array.isArray(v) ? '[…]' : '{…}';

    seen.add(v);
    let out;
    try {
      if (Array.isArray(v)) {
        out = '[' + v.slice(0, 50).map((x) => format(x, depth + 1, seen)).join(', ') +
          (v.length > 50 ? ', …(+' + (v.length - 50) + ')' : '') + ']';
      } else if (tag === '[object Map]') {
        const parts = [];
        v.forEach((val, key) => {
          if (parts.length < 50) parts.push(format(key, depth + 1, seen) + ' => ' + format(val, depth + 1, seen));
        });
        out = 'Map(' + v.size + ') {' + parts.join(', ') + '}';
      } else if (tag === '[object Set]') {
        const parts = [];
        v.forEach((val) => {
          if (parts.length < 50) parts.push(format(val, depth + 1, seen));
        });
        out = 'Set(' + v.size + ') {' + parts.join(', ') + '}';
      } else if (tag === '[object Promise]') {
        out = 'Promise {…}';
      } else if (tag === '[object Date]') {
        out = isNaN(v) ? 'Invalid Date' : v.toISOString();
      } else if (tag === '[object RegExp]') {
        out = String(v);
      } else {
        const ks = Object.keys(v);
        const ctor = v.constructor && v.constructor.name && v.constructor.name !== 'Object' ? v.constructor.name + ' ' : '';
        out = ctor + '{' + ks.slice(0, 50).map((k) => k + ': ' + format(v[k], depth + 1, seen)).join(', ') +
          (ks.length > 50 ? ', …(+' + (ks.length - 50) + ')' : '') + '}';
      }
    } catch (e) {
      out = '[' + String(e) + ']';
    }
    seen.delete(v);
    return out;
  }

  function formatError(err) {
    if (err && typeof err === 'object' && 'message' in err) {
      return (err.name || 'Error') + ': ' + err.message;
    }
    return format(err);
  }

  // console を横取りして、パネルにも表示する(元の出力もそのまま行う)
  const originals = {};
  ['log', 'info', 'warn', 'error', 'debug', 'dir'].forEach((name) => {
    originals[name] = console[name];
    console[name] = function () {
      try {
        const level = name === 'dir' ? 'log' : name;
        addEntry(level, Array.prototype.map.call(arguments, (a) => format(a)).join(' '));
      } catch (e) {}
      return originals[name].apply(console, arguments);
    };
  });

  window.addEventListener('error', (e) => {
    const where = e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : '';
    addEntry('error', (e.message || 'Error') + where);
  });

  window.addEventListener('unhandledrejection', (e) => {
    addEntry('error', 'Uncaught (in promise) ' + formatError(e.reason));
  });

  // ---------- 実行 ----------
  function isCspError(err) {
    const m = String((err && err.message) || err);
    return (typeof EvalError !== 'undefined' && err instanceof EvalError) || /unsafe-eval|Content Security Policy/i.test(m);
  }

  function injectScript(code) {
    const s = document.createElement('script');
    s.textContent = code;
    document.documentElement.appendChild(s);
    s.remove();
    addEntry('sys', 'サイトの設定(CSP)のため、script要素で実行しました(戻り値は表示されません)');
  }

  function evalCode(code) {
    try {
      return (0, eval)(code);
    } catch (err) {
      // トップレベルの await は、async の関数に包んで再実行する
      if (err instanceof SyntaxError && /await/.test(String(err.message))) {
        try {
          return (0, eval)('(async () => (\n' + code.replace(/;\s*$/, '') + '\n))()');
        } catch (err2) {
          if (!(err2 instanceof SyntaxError)) throw err2;
          return (0, eval)('(async () => {\n' + code + '\n})()');
        }
      }
      if (isCspError(err)) return injectScript(code);
      throw err;
    }
  }

  function summarize(code) {
    const lines = code.split('\n');
    const first = lines[0].trim();
    if (lines.length === 1) return first.length > 200 ? first.slice(0, 200) + '…' : first;
    return (first.length > 80 ? first.slice(0, 80) : first) + ' … (' + lines.length + '行)';
  }

  function runCode(code) {
    if (!code.trim()) return;
    addEntry('input', summarize(code));
    let result;
    try {
      result = evalCode(code);
    } catch (err) {
      addEntry('error', formatError(err));
      return;
    }
    if (result && typeof result.then === 'function') {
      addEntry('result', 'Promise(待機中)');
      result.then(
        (v) => addEntry('result', format(v)),
        (err) => addEntry('error', 'Uncaught (in promise) ' + formatError(err))
      );
    } else if (result !== undefined) {
      addEntry('result', format(result));
    }
  }

  function runEditor() {
    if (mode === 'editor') setMode('both');
    runCode(codeEl.value);
  }

  const replHistory = [];
  let historyIndex = 0;

  function runRepl() {
    const code = replEl.value;
    if (!code.trim()) return;
    if (replHistory[replHistory.length - 1] !== code) replHistory.push(code);
    historyIndex = replHistory.length;
    replEl.value = '';
    runCode(code);
  }

  // ---------- エディタ ----------
  let draftTimer = 0;

  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      writeJson(KEY_DRAFT, { code: codeEl.value, name: nameInput.value });
    }, 400);
  }

  function insertText(text) {
    const s = codeEl.selectionStart;
    const e = codeEl.selectionEnd;
    codeEl.setRangeText(text, s, e, 'end');
    saveDraftSoon();
  }

  codeEl.addEventListener('input', saveDraftSoon);
  nameInput.addEventListener('input', saveDraftSoon);

  onKey(codeEl, (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('  ');
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runEditor();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      // 前の行のインデントを引き継ぐ(行末が { [ ( なら、1段深くする)
      const v = codeEl.value;
      const pos = codeEl.selectionStart;
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      const line = v.slice(lineStart, pos);
      const indent = line.match(/^[ \t]*/)[0];
      const extra = /[{[(]\s*$/.test(line) ? '  ' : '';
      e.preventDefault();
      insertText('\n' + indent + extra);
    }
  });

  onKey(nameInput, (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') saveSnippet();
  });

  onKey(replEl, (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      runRepl();
    } else if (e.key === 'ArrowUp' && replHistory.length) {
      e.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      replEl.value = replHistory[historyIndex];
    } else if (e.key === 'ArrowDown' && replHistory.length) {
      e.preventDefault();
      historyIndex = Math.min(replHistory.length, historyIndex + 1);
      replEl.value = historyIndex === replHistory.length ? '' : replHistory[historyIndex];
    }
  });

  // ---------- 保存済みのコード ----------
  function getSnippets() {
    const v = readJson(KEY_SNIPPETS, []);
    return Array.isArray(v) ? v.filter((s) => s && typeof s.name === 'string' && typeof s.code === 'string') : [];
  }

  function saveSnippet() {
    let name = nameInput.value.trim();
    if (!name) {
      name = '無題 ' + stamp();
      nameInput.value = name;
    }
    const list = getSnippets();
    const i = list.findIndex((s) => s.name === name);
    const item = { name: name, code: codeEl.value, time: Date.now() };
    if (i >= 0) list[i] = item;
    else list.push(item);
    if (writeJson(KEY_SNIPPETS, list)) {
      toast((i >= 0 ? '上書き保存しました: ' : '保存しました: ') + name);
    } else {
      toast('保存できませんでした(容量不足など)', 4000);
    }
    saveDraftSoon();
    if (dock.classList.contains('show-saved')) renderSaved();
  }

  function loadSnippet(s) {
    if (codeEl.value.trim() && codeEl.value !== s.code && !confirm('エディタの内容を「' + s.name + '」で置き換えますか?')) {
      return;
    }
    codeEl.value = s.code;
    nameInput.value = s.name;
    saveDraftSoon();
    hideSaved();
    if (mode === 'console') setMode('both');
  }

  function makeButton(label, className) {
    const b = document.createElement('button');
    if (className) b.className = className;
    b.textContent = label;
    return b;
  }

  function importJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast('JSONとして読み込めませんでした', 3500);
      return;
    }
    if (!Array.isArray(data)) data = [data];
    const incoming = data.filter((s) => s && typeof s.name === 'string' && typeof s.code === 'string');
    if (!incoming.length) {
      toast('読み込めるコードがありませんでした', 3500);
      return;
    }
    const list = getSnippets();
    incoming.forEach((s) => {
      const item = { name: s.name, code: s.code, time: Date.now() };
      const i = list.findIndex((x) => x.name === s.name);
      if (i >= 0) list[i] = item;
      else list.push(item);
    });
    if (writeJson(KEY_SNIPPETS, list)) toast(incoming.length + '件を読み込みました');
    else toast('保存できませんでした(容量不足など)', 4000);
    renderSaved();
  }

  const importBox = document.createElement('textarea');
  importBox.className = 'import';
  importBox.placeholder = '他のサイトの「全部コピー(JSON)」を、ここに貼り付けて「読み込む」を押します';
  importBox.setAttribute('autocapitalize', 'none');
  importBox.setAttribute('autocorrect', 'off');
  importBox.spellcheck = false;

  function renderSaved() {
    savedEl.textContent = '';

    const head = document.createElement('div');
    head.className = 'row';
    const title = document.createElement('h4');
    title.textContent = '保存済みのコード(このサイトのlocalStorage)';
    title.style.flex = '1';
    title.style.margin = '0';
    const closeBtn = makeButton('✕ 閉じる');
    onTap(closeBtn, hideSaved);
    head.append(title, closeBtn);
    savedEl.appendChild(head);

    const list = getSnippets().sort((a, b) => b.time - a.time);
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '保存されたコードはありません。';
      savedEl.appendChild(empty);
    }
    list.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'row';
      const lines = s.code.split('\n').length;
      const nameBtn = makeButton(s.name + '(' + lines + '行)', 'name');
      const copyBtn = makeButton('📋');
      const delBtn = makeButton('🗑', 'danger');
      onTap(nameBtn, () => loadSnippet(s));
      onTap(copyBtn, () => copyText(s.code, 'コピーしました: ' + s.name));
      onTap(delBtn, () => {
        if (!confirm('「' + s.name + '」を削除しますか?')) return;
        writeJson(KEY_SNIPPETS, getSnippets().filter((x) => x.name !== s.name));
        renderSaved();
      });
      row.append(nameBtn, copyBtn, delBtn);
      savedEl.appendChild(row);
    });

    const tools = document.createElement('div');
    tools.className = 'row';
    const exportBtn = makeButton('📋 全部コピー(JSON)');
    onTap(exportBtn, () => copyText(JSON.stringify(getSnippets(), null, 2), '全部コピーしました'));
    const importBtn = makeButton('📥 読み込む');
    onTap(importBtn, () => {
      if (importBox.value.trim()) {
        importJson(importBox.value);
        importBox.value = '';
      } else {
        toast('JSONを貼り付けてください');
      }
    });
    tools.append(exportBtn, importBtn);
    savedEl.append(tools, importBox);
  }

  function showSaved() {
    renderSaved();
    dock.classList.add('show-saved');
  }

  function hideSaved() {
    dock.classList.remove('show-saved');
  }

  // ---------- 表示モード・大きさ ----------
  const ui = readJson(KEY_UI, {});
  let mode = ui.mode === 'editor' || ui.mode === 'console' ? ui.mode : 'both';

  function saveUi() {
    writeJson(KEY_UI, { mode: mode, hr: ui.hr, min: dock.classList.contains('min') });
  }

  function setMode(m) {
    mode = m;
    dock.classList.remove('mode-editor', 'mode-both', 'mode-console');
    dock.classList.add('mode-' + m);
    q('#mEditor').classList.toggle('on', m === 'editor');
    q('#mBoth').classList.toggle('on', m === 'both');
    q('#mConsole').classList.toggle('on', m === 'console');
    saveUi();
  }

  function viewportHeight() {
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }

  function setHeight(px) {
    const vh = viewportHeight();
    const h = Math.min(Math.max(px, 160), Math.max(160, vh - 30));
    dock.style.height = h + 'px';
    ui.hr = h / vh;
  }

  // キーボードが出たときも、パネルが隠れないように位置と大きさを合わせる
  function fit() {
    const vv = window.visualViewport;
    const vh = viewportHeight();
    const bottom = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    dock.style.bottom = bottom + 'px';
    setHeight((ui.hr || 0.55) * vh);
  }

  onDrag(q('#grip'), {
    start: () => ({ h: dock.offsetHeight }),
    move: (e, d, st) => setHeight(st.h - (e.clientY - d.y)),
    end: () => saveUi()
  });

  // ---------- ボタン ----------
  onTap(q('#mEditor'), () => setMode('editor'));
  onTap(q('#mBoth'), () => setMode('both'));
  onTap(q('#mConsole'), () => setMode('console'));

  onTap(q('#btnMin'), () => {
    dock.classList.toggle('min');
    q('#btnMin').textContent = dock.classList.contains('min') ? '▴' : '▾';
    saveUi();
  });

  onTap(q('#btnClose'), () => close());
  onTap(q('#btnRun'), runEditor);
  onTap(q('#btnSave'), saveSnippet);
  onTap(q('#btnSaved'), () => {
    if (dock.classList.contains('show-saved')) hideSaved();
    else showSaved();
  });
  onTap(q('#btnCopyCode'), () => copyText(codeEl.value, 'コードをコピーしました'));
  onTap(q('#btnPaste'), () => {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast('貼り付けに対応していません(入力欄を長押しして貼り付けてください)', 4000);
      return;
    }
    navigator.clipboard.readText().then(
      (text) => {
        insertText(text);
        toast('貼り付けました');
      },
      () => toast('貼り付けできませんでした(入力欄を長押しして貼り付けてください)', 4000)
    );
  });
  onTap(q('#btnClearCode'), () => {
    if (!codeEl.value) return;
    if (!confirm('エディタの内容を消去しますか?(保存済みのコードは消えません)')) return;
    codeEl.value = '';
    saveDraftSoon();
  });

  onTap(q('#btnCopyLog'), () => {
    const text = entries.map((en) => PREFIX[en.level] + en.text).join('\n');
    copyText(text, 'コンソールの内容をコピーしました');
  });
  onTap(q('#btnClearLog'), () => {
    entries.length = 0;
    logEl.textContent = '';
  });
  onTap(q('#btnEval'), runRepl);

  // ---------- 開く・閉じる ----------
  function open() {
    host.style.display = '';
    dock.classList.remove('min');
    q('#btnMin').textContent = '▾';
    bringToFront(true);
    fit();
  }

  function close() {
    host.style.display = 'none';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.style.display !== 'none' && dock.classList.contains('show-saved')) hideSaved();
  }, true);

  window.addEventListener('resize', fit);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit);
  }

  // ---------- 起動 ----------
  const draft = readJson(KEY_DRAFT, null);
  codeEl.value = draft && typeof draft.code === 'string' ? draft.code : DEFAULT_CODE;
  nameInput.value = draft && typeof draft.name === 'string' ? draft.name : '';
  if (ui.min) {
    dock.classList.add('min');
    q('#btnMin').textContent = '▴';
  }
  setMode(mode);

  bringToFront(false);
  fit();
  addEntry('sys', 'JS環境を起動しました(Ctrl/⌘+Enterで実行できます)');

  const htmlEl = document.documentElement;
  if (htmlEl) {
    new MutationObserver(() => {
      if (host.parentNode !== htmlEl || host !== htmlEl.lastElementChild) bringToFront(false);
    }).observe(htmlEl, { childList: true });
  }

  window.__jsPlayground = { open: open, close: close };
})();