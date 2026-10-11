/*
 * MedicalNewsToday-Analyser_5.js(クリック翻訳リーダー・ブックマークレット用)
 * 元のファイル(MedicalNewsToday-Analyser_4.js / ユーザースクリプト 0.0.5)からの機能差分
 * - ブックマークレットから実行できるように、UserScriptヘッダー(==UserScript==)を削除
 * - 実行と同時にリーダー画面を自動で開く(右下の「訳」ボタンを押す手間をなくした)
 * - 同じページで2回目に実行したときは、リーダーを開き直す(以前は何も起きなかった)
 * - 通信は GM.xmlHttpRequest が使えないため、ページ内の fetch で行う(既存のフォールバック処理をそのまま使用)
 * - 翻訳・範囲選択・スピナー表示などの機能は変更なし
 * - MedicalNewsToday の記事ページで実行してください(本文の抽出が、記事ページの構造を前提としているため)
 */

(function () {
  'use strict';

  // 2回目以降の実行では、リーダーを開き直すだけにする
  if (window.__clickTranslateReader) {
    window.__clickTranslateReader();
    return;
  }

  const POS_JA = {
    noun: '名詞',
    verb: '動詞',
    adjective: '形容詞',
    adverb: '副詞',
    preposition: '前置詞',
    conjunction: '接続詞',
    pronoun: '代名詞',
    exclamation: '感嘆詞',
    abbreviation: '略語',
    determiner: '限定詞',
    interjection: '間投詞'
  };

  const CSS = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
    }

    #fab {
      position: fixed;
      right: 16px;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 2147483646;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      border: 0;
      background: #0B7285;
      color: #fff;
      font: 700 20px -apple-system, "Hiragino Sans", sans-serif;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
      cursor: pointer;
    }

    #overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: #E6ECEF;
      color: #17252E;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    }

    #overlay[hidden] {
      display: none;
    }

    .bar {
      flex: none;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      padding-top: calc(10px + env(safe-area-inset-top, 0px));
      background: #F8FAFB;
      border-bottom: 1px solid #CBD6DB;
      -webkit-user-select: none;
      user-select: none;
    }

    #status {
      font-size: 12.5px;
      color: #5B6E78;
      flex: 1;
      min-width: 0;
    }

    button {
      font: inherit;
      font-size: 14px;
      cursor: pointer;
      border: 1px solid #0B7285;
      background: #0B7285;
      color: #fff;
      padding: 7px 13px;
      border-radius: 6px;
    }

    .modes {
      display: inline-flex;
    }

    .modes button {
      background: transparent;
      color: #0B7285;
      border-radius: 0;
    }

    .modes button:first-child {
      border-radius: 6px 0 0 6px;
    }

    .modes button:last-child {
      border-radius: 0 6px 6px 0;
      border-left: 0;
    }

    .modes button.on {
      background: #0B7285;
      color: #fff;
    }

    #scroll {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    #reader {
      max-width: 760px;
      margin: 0 auto;
      padding: 28px 18px 80px;
      -webkit-user-select: text;
      user-select: text;
    }

    #overlay.with-panel #reader {
      padding-bottom: 50vh;
    }

    #title {
      font-family: Georgia, "Noto Serif", "Hiragino Mincho ProN", serif;
      font-size: 28px;
      line-height: 1.3;
      margin: 0 0 8px;
      font-weight: 700;
    }

    #titleJa {
      margin: 0 0 26px;
      padding-bottom: 18px;
      border-bottom: 1px solid #CBD6DB;
      color: #5B6E78;
      font-size: 15px;
    }

    #article {
      font-family: Georgia, "Noto Serif", "Hiragino Mincho ProN", serif;
      font-size: 19px;
      line-height: 1.9;
    }

    #article p,
    #article blockquote {
      margin: 0 0 1.1em;
    }

    #article h2 {
      font-size: 23px;
      line-height: 1.4;
      margin: 1.8em 0 0.6em;
    }

    #article blockquote {
      border-left: 3px solid #0B7285;
      padding-left: 16px;
      color: #2A3B45;
    }

    #article p.bullet {
      padding-left: 1.1em;
      text-indent: -1.1em;
    }

    #article p.bullet::before {
      content: "・";
    }

    .s {
      border-radius: 3px;
      cursor: pointer;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }

    .s.on {
      background: #D3EDF1;
    }

    .w {
      border-radius: 3px;
    }

    .w.on {
      background: #FFD866;
    }

    #panel {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 48%;
      overflow-y: auto;
      background: #12222B;
      color: #EAF3F5;
      border-radius: 14px 14px 0 0;
      box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.25);
      -webkit-user-select: none;
      user-select: none;
    }

    #panel[hidden] {
      display: none;
    }

    .panel-inner {
      max-width: 760px;
      margin: 0 auto;
      padding: 16px 18px calc(18px + env(safe-area-inset-bottom, 0px));
      position: relative;
    }

    #pclose {
      position: absolute;
      top: 10px;
      right: 12px;
      background: transparent;
      border: 1px solid #3A4F5A;
      color: #EAF3F5;
      padding: 4px 10px;
    }

    .box {
      margin-bottom: 14px;
    }

    .box:last-child {
      margin-bottom: 0;
    }

    .box[hidden] {
      display: none;
    }

    .en {
      font-family: Georgia, serif;
      font-size: 17px;
      line-height: 1.5;
      margin-right: 8px;
    }

    #wordText {
      font-size: 22px;
      font-weight: 700;
      margin-right: 8px;
    }

    #wordCtxLabel {
      font-size: 12px;
      color: #8FA6B0;
      margin-top: 8px;
    }

    #wordCtx {
      color: #FFD866;
      font-size: 22px;
      font-weight: 700;
      margin: 2px 0 6px;
    }

    #wordPhrase {
      font-size: 14.5px;
      color: #D5E3E8;
      margin-bottom: 4px;
    }

    #wordJa {
      font-size: 14px;
      color: #AFC3CB;
      margin-bottom: 4px;
    }

    #wordDict {
      font-size: 13.5px;
      color: #AFC3CB;
      line-height: 1.7;
    }

    .hit {
      color: #FFD866;
      font-weight: 700;
    }

    #sentJa {
      font-size: 17px;
      line-height: 1.7;
      margin-top: 6px;
    }

    .speak {
      font-size: 12px;
      padding: 3px 9px;
      background: transparent;
      color: #EAF3F5;
      border: 1px solid #3A4F5A;
      vertical-align: middle;
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-right: 8px;
      border: 2px solid #3A4F5A;
      border-top-color: #FFD866;
      border-radius: 50%;
      vertical-align: -2px;
      animation: spin 0.8s linear infinite;
    }

    #status .spinner,
    #titleJa .spinner {
      border-color: #CBD6DB;
      border-top-color: #0B7285;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  const HTML = `
    <button id="fab" aria-label="クリック翻訳リーダーを開く">訳</button>
    <div id="overlay" hidden>
      <div class="bar">
        <div id="status"></div>
        <div class="modes">
          <button id="modeBoth" class="on">単語+文</button>
          <button id="modeSent">文のみ</button>
        </div>
        <button id="close">閉じる</button>
      </div>
      <div id="scroll">
        <main id="reader">
          <h1 id="title"></h1>
          <p id="titleJa"></p>
          <div id="article"></div>
        </main>
      </div>
      <section id="panel" hidden>
        <div class="panel-inner">
          <button id="pclose">閉じる</button>
          <div class="box" id="wordBox">
            <div>
              <span id="wordText"></span>
              <button class="speak" data-speak="word">読み上げ</button>
            </div>
            <div id="wordCtxLabel"></div>
            <div id="wordCtx"></div>
            <div id="wordPhrase"></div>
            <div id="wordJa"></div>
            <div id="wordDict"></div>
          </div>
          <div class="box">
            <div>
              <span class="en" id="sentEn"></span>
              <button class="speak" data-speak="sent">読み上げ</button>
            </div>
            <div id="sentJa"></div>
          </div>
        </div>
      </section>
    </div>
  `;

  const host = document.createElement('div');
  host.id = 'ctr-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' + CSS + '</style>' + HTML;
  document.body.appendChild(host);

  const $ = (s) => root.querySelector(s);
  let mode = 'both';
  let token = 0;
  let loaded = false;
  let lastSel = '';
  let selTimer = null;
  const cache = new Map();

  const segS = 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null;
  const segW = 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'word' }) : null;

  function clean(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  // 読み込み中表示(クルクル + 文言)
  function setLoading(el, label) {
    el.textContent = '';
    const sp = document.createElement('span');
    sp.className = 'spinner';
    el.appendChild(sp);
    el.appendChild(document.createTextNode(label || ''));
  }

  // ---------- 通信 ----------
  function httpGet(url, timeout) {
    const ms = timeout || 10000;
    return new Promise((resolve, reject) => {
      let gm = null;
      if (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) gm = GM.xmlHttpRequest;
      else if (typeof GM_xmlhttpRequest !== 'undefined') gm = GM_xmlhttpRequest;

      if (gm) {
        try {
          const r = gm({
            method: 'GET',
            url: url,
            timeout: ms,
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

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      fetch(url, { signal: ctrl.signal })
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  }

  async function translate(text) {
    if (cache.has(text)) return cache.get(text);
    let out;
    try {
      const r = JSON.parse(
        await httpGet(
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&dt=bd&q=' +
            encodeURIComponent(text)
        )
      );
      out = {
        text: r[0].map((x) => x[0]).join(''),
        dict: (r[1] || []).map((d) => ({ pos: d[0], terms: d[1].slice(0, 6) }))
      };
    } catch (e) {
      const r = JSON.parse(
        await httpGet(
          'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|ja'
        )
      );
      if (!r.responseData || !r.responseData.translatedText) throw new Error('翻訳失敗');
      out = { text: r.responseData.translatedText, dict: [] };
    }
    cache.set(text, out);
    return out;
  }

  // ---------- 記事の抽出(表示中のページから直接) ----------
  function collectBlocks(rootEl, h1) {
    const blocks = [];
    const seen = new Set();
    const nodes = rootEl.querySelectorAll('h2,h3,p,blockquote,li');
    for (const n of nodes) {
      if (h1 && !(h1.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (n.closest('nav,footer,aside,figure,form,button')) continue;
      const tag = n.tagName.toLowerCase();
      if ((tag === 'p' || tag === 'li') && n.closest('blockquote')) continue;
      const text = clean(n.textContent);
      if (tag === 'h2' || tag === 'h3') {
        if (/^(how we reviewed|history|references|sources)/i.test(text)) break;
        if (text.length > 3 && !seen.has(text)) {
          seen.add(text);
          blocks.push({ type: 'h', text });
        }
        continue;
      }
      if (/^(written by|fact checked|medically reviewed|share|updated)/i.test(text)) continue;
      if (text.length < (tag === 'li' ? 40 : 25)) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      blocks.push({ type: tag === 'blockquote' ? 'q' : (tag === 'li' ? 'li' : 'p'), text });
    }
    return blocks;
  }

  function extractArticle() {
    const h1 = document.querySelector('h1');
    const title = clean(h1 ? h1.textContent : document.title);

    let rootEl = document.body;
    if (h1) {
      let node = h1.parentElement;
      while (node && node !== document.body) {
        if (node.tagName === 'ARTICLE' || node.tagName === 'MAIN' || node.textContent.length > 4000) {
          rootEl = node;
          break;
        }
        node = node.parentElement;
      }
    }

    let blocks = collectBlocks(rootEl, h1);
    if (blocks.length < 3) blocks = collectBlocks(document.body, null);
    return { title, blocks };
  }

  // ---------- 描画 ----------
  function splitSentences(text) {
    if (segS) return [...segS.segment(text)].map((s) => s.segment);
    return text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) || [text];
  }

  function splitWords(s) {
    if (segW) return [...segW.segment(s)].map((x) => ({ t: x.segment, w: !!x.isWordLike }));
    return s
      .split(/([\p{L}\p{N}][\p{L}\p{N}'’-]*)/u)
      .filter(Boolean)
      .map((t) => ({ t, w: /^[\p{L}\p{N}]/u.test(t) }));
  }

  function fill(el, text) {
    for (const sent of splitSentences(text)) {
      const trimmed = sent.trim();
      if (!trimmed) {
        el.appendChild(document.createTextNode(sent));
        continue;
      }
      const s = document.createElement('span');
      s.className = 's';
      s.dataset.text = trimmed;
      for (const p of splitWords(sent)) {
        if (p.w) {
          const w = document.createElement('span');
          w.className = 'w';
          w.textContent = p.t;
          s.appendChild(w);
        } else {
          s.appendChild(document.createTextNode(p.t));
        }
      }
      el.appendChild(s);
    }
  }

  function render(art) {
    const title = $('#title');
    const titleJa = $('#titleJa');
    const box = $('#article');
    title.textContent = '';
    box.textContent = '';
    fill(title, art.title);
    setLoading(titleJa, 'タイトルを翻訳中…');

    for (const b of art.blocks) {
      let el;
      if (b.type === 'h') el = document.createElement('h2');
      else if (b.type === 'q') el = document.createElement('blockquote');
      else {
        el = document.createElement('p');
        if (b.type === 'li') el.className = 'bullet';
      }
      fill(el, b.text);
      box.appendChild(el);
    }

    translate(art.title)
      .then((r) => {
        titleJa.textContent = r.text;
      })
      .catch(() => {
        titleJa.textContent = '';
      });
  }

  // ---------- 文脈での単語の意味 ----------
  // 対象の単語だけを引用符で囲んだ文を作る(他の引用符は除去)。フォールバック用
  function buildMarked(sEl, wEl) {
    let out = '';
    for (const n of sEl.childNodes) {
      out += n === wEl ? '"' + n.textContent + '"' : n.textContent.replace(/["“”「」『』]/g, '');
    }
    return out;
  }

  // 範囲選択した語句だけを引用符で囲んだ文を作る(他の引用符は除去)
  function buildMarkedPhrase(sentence, phrase) {
    const i = sentence.indexOf(phrase);
    if (i < 0) return sentence;
    const strip = (t) => t.replace(/["“”「」『』]/g, '');
    return strip(sentence.slice(0, i)) + '"' + phrase + '"' + strip(sentence.slice(i + phrase.length));
  }

  // 翻訳結果から、引用符で囲まれた訳語を取り出す
  function extractMarked(text) {
    const m = (text || '').match(/[「『“"]([^」』”"]{1,30})[」』”"]/);
    return m ? m[1].trim() : null;
  }

  // 辞書の訳語 term が訳文 text の中に現れるか。現れたらその文字列(語幹の場合あり)を返す
  function findHit(term, text) {
    if (!term || !text) return null;
    if (term.length >= 2 && text.includes(term)) return term;
    const stems = [];
    const noSuffix = term.replace(/(する|される|させる|な|に|い|だ|的)$/, '');
    if (noSuffix !== term) stems.push(noSuffix);
    if (/[るうくぐすつぬぶむ]$/.test(term)) stems.push(term.slice(0, -1));
    for (const s of stems) {
      if (s.length >= 2 && text.includes(s)) return s;
    }
    return null;
  }

  // 優先順位の高い訳文から順に、辞書の訳語が現れるものを探す
  function pickMeaning(wv, texts) {
    if (!wv) return null;
    for (const text of texts) {
      if (!text) continue;
      for (const d of wv.dict) {
        for (const term of d.terms) {
          const matched = findHit(term, text);
          if (matched) return { term, matched, text };
        }
      }
    }
    return null;
  }

  // 直前に「〜を/に/が」があれば、目的語として添える(例: (診断を)受ける)
  function withObject(hit) {
    const idx = hit.text.indexOf(hit.matched);
    if (idx <= 0) return hit.term;
    const before = hit.text.slice(0, idx);
    const m = before.match(/([^のはがをにでともや、。,.\s\dA-Za-z]{1,8}[をにが])$/);
    return m ? '(' + m[1] + ')' + hit.term : hit.term;
  }

  function value(res) {
    return res.status === 'fulfilled' ? res.value : null;
  }

  // 辞書の訳語一覧(実際の訳文に現れるものは強調)
  function renderDict(wv, hays) {
    const dictBox = $('#wordDict');
    dictBox.textContent = '';
    if (!wv) return;
    for (const d of wv.dict) {
      const line = document.createElement('div');
      line.appendChild(document.createTextNode((POS_JA[d.pos] || d.pos) + ':'));
      d.terms.forEach((t, i) => {
        if (i) line.appendChild(document.createTextNode('、'));
        const span = document.createElement('span');
        span.textContent = t;
        if (hays.some((h) => findHit(t, h))) span.className = 'hit';
        line.appendChild(span);
      });
      dictBox.appendChild(line);
    }
  }

  function renderWord(results, center, word) {
    const wv = value(results[0]);
    const sv = value(results[1]);
    const mv = value(results[2]);
    const cv = value(results[3]);
    const rv = value(results[4]);

    const hit = pickMeaning(wv, [rv && rv.text, cv && cv.text, sv && sv.text]);
    let meaning = null;
    if (hit) meaning = withObject(hit);
    else if (mv) meaning = extractMarked(mv.text);

    if (meaning) {
      $('#wordCtxLabel').textContent = 'この文での意味(推定)';
      $('#wordCtx').textContent = meaning;
    } else if (wv) {
      $('#wordCtxLabel').textContent = '文脈からは特定できませんでした(一般的な訳)';
      $('#wordCtx').textContent = wv.text;
    } else {
      $('#wordCtxLabel').textContent = '';
      $('#wordCtx').textContent = '翻訳に失敗しました(通信を確認してください)';
    }

    $('#wordPhrase').textContent =
      cv && center !== word ? '前後を含む句:' + center + ' → ' + cv.text : '';
    $('#wordJa').textContent = wv && meaning ? '一般的な訳:' + wv.text : '';

    renderDict(wv, [rv && rv.text, cv && cv.text, sv && sv.text].filter(Boolean));
  }

  // 範囲選択(熟語・フレーズ)の表示
  function renderPhrase(results) {
    const pv = value(results[0]);
    const sv = value(results[1]);
    const mv = value(results[2]);

    let meaning = mv ? extractMarked(mv.text) : null;
    if (!meaning && pv && pv.dict.length) {
      const hit = pickMeaning(pv, [sv && sv.text]);
      if (hit) meaning = withObject(hit);
    }

    if (meaning) {
      $('#wordCtxLabel').textContent = 'この文での意味(推定)';
      $('#wordCtx').textContent = meaning;
    } else if (pv) {
      $('#wordCtxLabel').textContent = '文脈からは特定できませんでした(単独での訳)';
      $('#wordCtx').textContent = pv.text;
    } else {
      $('#wordCtxLabel').textContent = '';
      $('#wordCtx').textContent = '翻訳に失敗しました(通信を確認してください)';
    }

    $('#wordPhrase').textContent = '';
    $('#wordJa').textContent = pv && meaning ? '単独での訳:' + pv.text : '';
    renderDict(pv, [sv && sv.text].filter(Boolean));
  }

  // ---------- 選択と翻訳表示 ----------
  function clearOn() {
    root.querySelectorAll('.s.on,.w.on').forEach((n) => n.classList.remove('on'));
  }

  function getSel() {
    try {
      if (typeof root.getSelection === 'function') return root.getSelection();
    } catch (e) {}
    return window.getSelection();
  }

  function selectedText() {
    const sel = getSel();
    return sel ? clean(sel.toString()) : '';
  }

  function clearSelection() {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    lastSel = '';
  }

  function closePanel() {
    $('#panel').hidden = true;
    $('#overlay').classList.remove('with-panel');
    clearOn();
    clearSelection();
    token++;
  }

  function showSentence(sentence, my) {
    $('#sentEn').textContent = sentence;
    setLoading($('#sentJa'), '翻訳中…');
    translate(sentence)
      .then((r) => {
        if (my === token) $('#sentJa').textContent = r.text;
      })
      .catch(() => {
        if (my === token) $('#sentJa').textContent = '翻訳に失敗しました(通信を確認してください)';
      });
  }

  function select(sEl, wEl) {
    const my = ++token;
    clearOn();
    sEl.classList.add('on');
    if (wEl) wEl.classList.add('on');
    $('#panel').hidden = false;
    $('#overlay').classList.add('with-panel');

    const sentence = sEl.dataset.text;
    const word = wEl ? wEl.textContent : null;
    $('#wordBox').hidden = !word;
    showSentence(sentence, my);

    if (word) {
      const ws = [...sEl.querySelectorAll('.w')];
      const idx = ws.indexOf(wEl);
      const join = (arr) => arr.map((w) => w.textContent).join(' ');
      const center = join(ws.slice(Math.max(0, idx - 3), idx + 4));
      const right = join(ws.slice(idx, idx + 4));
      const marked = buildMarked(sEl, wEl);

      $('#wordText').textContent = word;
      setLoading($('#wordCtxLabel'), '文脈を判定中…');
      $('#wordCtx').textContent = '';
      $('#wordPhrase').textContent = '';
      $('#wordJa').textContent = '';
      $('#wordDict').textContent = '';

      Promise.allSettled([
        translate(word),
        translate(sEl.dataset.text),
        translate(marked),
        translate(center),
        translate(right)
      ]).then((results) => {
        if (my === token) renderWord(results, center, word);
      });
    }
  }

  // ---------- 範囲選択(熟語・フレーズ) ----------
  // 選択範囲を含む文の要素を探す(同じ文が複数ある場合は、選択位置に近いもの)
  function findSentenceEl(phrase) {
    const list = [...root.querySelectorAll('#reader .s')].filter((s) =>
      s.dataset.text.includes(phrase)
    );
    if (!list.length) return null;
    if (list.length === 1) return list[0];

    let rect = null;
    try {
      const r = getSel().getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) rect = r;
    } catch (e) {}
    if (!rect) return list[0];

    const cy = rect.top + rect.height / 2;
    let best = list[0];
    let bestDist = Infinity;
    for (const s of list) {
      for (const q of s.getClientRects()) {
        const d = cy < q.top ? q.top - cy : cy > q.bottom ? cy - q.bottom : 0;
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }
    return best;
  }

  function lookupSelection(phrase) {
    const my = ++token;
    clearOn();
    $('#panel').hidden = false;
    $('#overlay').classList.add('with-panel');

    const sEl = findSentenceEl(phrase);

    // 複数の文にまたがる選択: 選択部分だけを翻訳
    if (!sEl) {
      $('#wordBox').hidden = true;
      showSentence(phrase, my);
      return;
    }

    sEl.classList.add('on');
    const sentence = sEl.dataset.text;
    $('#wordBox').hidden = false;
    $('#wordText').textContent = phrase;
    setLoading($('#wordCtxLabel'), '熟語・文脈を判定中…');
    $('#wordCtx').textContent = '';
    $('#wordPhrase').textContent = '';
    $('#wordJa').textContent = '';
    $('#wordDict').textContent = '';
    showSentence(sentence, my);

    Promise.allSettled([
      translate(phrase),
      translate(sentence),
      translate(buildMarkedPhrase(sentence, phrase))
    ]).then((results) => {
      if (my === token) renderPhrase(results);
    });
  }

  function onSelectionSettled() {
    if ($('#overlay').hidden) return;
    const raw = selectedText();
    if (!raw) {
      lastSel = '';
      return;
    }
    if (raw === lastSel) return;

    // 前後の記号・空白を除いた語句を調べる
    const phrase = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!phrase || !/\p{L}/u.test(phrase) || phrase.length > 300) return;

    lastSel = raw;
    lookupSelection(phrase);
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  }

  function setMode(m) {
    mode = m;
    $('#modeBoth').classList.toggle('on', m === 'both');
    $('#modeSent').classList.toggle('on', m === 'sent');
  }

  // ---------- 開閉 ----------
  function openReader() {
    $('#overlay').hidden = false;
    $('#fab').hidden = true;
    document.documentElement.style.overflow = 'hidden';

    if (loaded) return;
    setLoading($('#status'), '記事を読み込み中…');
    // スピナーを描画させてから抽出を始める
    setTimeout(() => {
      const art = extractArticle();
      if (!art.blocks.length) {
        $('#status').textContent = '本文を抽出できませんでした。';
        return;
      }
      render(art);
      $('#status').textContent =
        '文・単語をクリック/語句を範囲選択(' + art.blocks.length + 'ブロック)';
      loaded = true;
    }, 30);
  }

  function closeReader() {
    closePanel();
    $('#overlay').hidden = true;
    $('#fab').hidden = false;
    document.documentElement.style.overflow = '';
  }

  // ---------- イベント ----------
  $('#fab').addEventListener('click', openReader);
  $('#close').addEventListener('click', closeReader);
  $('#pclose').addEventListener('click', closePanel);
  $('#modeBoth').addEventListener('click', () => setMode('both'));
  $('#modeSent').addEventListener('click', () => setMode('sent'));

  $('#reader').addEventListener('click', (e) => {
    // 範囲選択の直後は、クリック翻訳を発動しない
    if (selectedText()) return;
    const sEl = e.target.closest('.s');
    if (!sEl) return;
    const wEl = mode === 'both' ? e.target.closest('.w') : null;
    select(sEl, wEl);
  });

  // 選択が落ち着いてから(約0.5秒後)調べる
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(onSelectionSettled, 500);
  });

  root.querySelectorAll('.speak').forEach((b) => {
    b.addEventListener('click', () => {
      speak(b.dataset.speak === 'word' ? $('#wordText').textContent : $('#sentEn').textContent);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#overlay').hidden) closeReader();
  });

  // ブックマークレット: 再実行時はリーダーを開き直す
  window.__clickTranslateReader = () => {
    if ($('#overlay').hidden) openReader();
  };

  // 実行と同時にリーダーを開く
  openReader();
})();
