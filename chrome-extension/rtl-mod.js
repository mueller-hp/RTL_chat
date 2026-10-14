/*
 * RTL mod for Claude (claude.ai + Claude Desktop)
 * Per-paragraph direction detection for mixed Hebrew/English text.
 * Code always stays LTR. Toggle pill "עברית" + shortcut Ctrl+Alt+R.
 */
(() => {
  if (window.__rtlMod) return;
  window.__rtlMod = true;

  // ---------- settings ----------
  const USE_HEBREW_FONT = true;
  // First font that exists on the machine wins. Only Hebrew letters use it.
  const HEBREW_FONT_REGULAR = 'local("Rubik"), local("Rubik Regular"), local("Assistant"), local("Segoe UI"), local("Arial")';
  const HEBREW_FONT_BOLD = 'local("Rubik Bold"), local("Rubik-Bold"), local("Assistant Bold"), local("Segoe UI Bold"), local("Arial Bold")';
  const STORAGE_KEY = 'rtl-mod-enabled';
  const PILL_KEY = 'rtl-mod-pill-hidden';

  // Elements that get automatic direction (dir="auto")
  const BLOCKS = [
    'p', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'table', 'th', 'td', 'dt', 'dd', 'summary', 'figcaption',
    'textarea', 'input[type="text"]', 'input[type="search"]', 'input:not([type])'
  ].join(',');

  // Never touch these (code, terminals, editors, our own UI, rich-text editors)
  const SKIP = 'pre, code, kbd, samp, .cm-editor, .monaco-editor, .xterm, [contenteditable="true"], [data-rtl-skip]';

  const CSS = `
@font-face { font-family: "RTL Mod Hebrew"; src: ${HEBREW_FONT_REGULAR}; font-weight: 100 500; unicode-range: U+0590-05FF, U+FB1D-FB4F; }
@font-face { font-family: "RTL Mod Hebrew"; src: ${HEBREW_FONT_BOLD}; font-weight: 600 900; unicode-range: U+0590-05FF, U+FB1D-FB4F; }

html.rtl-mod-on :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, th, td, dt, dd, summary, figcaption)[data-rtl-mod] {
  unicode-bidi: plaintext;
  text-align: start;
}
${USE_HEBREW_FONT ? `html.rtl-mod-on [data-rtl-mod] { font-family: "RTL Mod Hebrew", var(--rtl-mod-font); }` : ''}

/* lists: bullets and indent move to the right side */
html.rtl-mod-on :is(ul, ol)[data-rtl-mod]:dir(rtl) {
  padding-left: 0 !important;
  padding-right: 1.5em !important;
}
html.rtl-mod-on li[data-rtl-mod]:dir(rtl) { margin-left: 0; }

/* quotes: line moves to the right side */
html.rtl-mod-on blockquote[data-rtl-mod]:dir(rtl) {
  border-left-width: 0 !important;
  border-right: 3px solid currentColor;
  border-right-color: color-mix(in srgb, currentColor 30%, transparent);
  padding-left: 0 !important;
  padding-right: 1em !important;
}

/* tables: Hebrew tables read right to left and sit on the right */
html.rtl-mod-on table[data-rtl-mod]:dir(rtl) { margin-left: auto; margin-right: 0; }
html.rtl-mod-on table[data-rtl-mod]:dir(rtl) th,
html.rtl-mod-on table[data-rtl-mod]:dir(rtl) td { text-align: right; }

/* rich-text input box (ProseMirror) and plain inputs: each line picks its own side */
html.rtl-mod-on [contenteditable="true"],
html.rtl-mod-on [contenteditable="true"] :is(p, li, h1, h2, h3, blockquote) {
  unicode-bidi: plaintext;
  text-align: start;
}
html.rtl-mod-on :is(textarea, input)[data-rtl-mod] { unicode-bidi: plaintext; }

/* code: always left to right */
html.rtl-mod-on pre, html.rtl-mod-on pre * {
  direction: ltr !important;
  text-align: left !important;
}
html.rtl-mod-on pre { unicode-bidi: isolate; }
html.rtl-mod-on :not(pre) > code, html.rtl-mod-on kbd, html.rtl-mod-on samp {
  direction: ltr;
  unicode-bidi: isolate;
}

/* toggle pill */
#rtl-mod-pill {
  position: fixed; bottom: 14px; right: 14px; z-index: 2147483000;
  display: flex; align-items: center; gap: 8px;
  padding: 5px 6px 5px 10px; border-radius: 999px;
  font: 600 12px/1 "Segoe UI", Arial, sans-serif; direction: rtl;
  background: rgba(245, 240, 232, .92); color: #1f1e1d;
  border: 1px solid rgba(0, 0, 0, .12); box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
  cursor: pointer; user-select: none; opacity: .55; transition: opacity .15s;
}
#rtl-mod-pill:hover { opacity: 1; }
#rtl-mod-pill .rtl-mod-switch {
  width: 30px; height: 17px; border-radius: 999px; background: #b9b5ad;
  position: relative; transition: background .15s; flex: none;
}
#rtl-mod-pill .rtl-mod-switch::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: left .15s;
}
html.rtl-mod-on #rtl-mod-pill .rtl-mod-switch { background: #1f1e1d; }
html.rtl-mod-on #rtl-mod-pill .rtl-mod-switch::after { left: 15px; }
@media (prefers-color-scheme: dark) {
  #rtl-mod-pill { background: rgba(48, 47, 44, .92); color: #f2efe8; border-color: rgba(255, 255, 255, .15); }
  html.rtl-mod-on #rtl-mod-pill .rtl-mod-switch { background: #d97757; }
}
#rtl-mod-pill.rtl-mod-hidden { display: none; }
`;

  // ---------- storage ----------
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

  let enabled = read(STORAGE_KEY, true);

  // ---------- tagging ----------
  // Containers (lists, tables) cannot use dir="auto": the browser skips children that carry
  // their own dir, so it would always land on LTR. We decide their side ourselves.
  const CONTAINERS = 'ul, ol, table';
  const HE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
  const HE_G = /[\u0590-\u05FF\uFB1D-\uFB4F]/g;
  const LA_G = /[A-Za-z\u00C0-\u024F]/g;
  const STRONG = /[A-Za-z\u00C0-\u024F\u0590-\u05FF\uFB1D-\uFB4F]/;

  function looksRtl(text) {
    const first = text.match(STRONG);
    if (!first) return false;
    if (HE.test(first[0])) return true;
    return (text.match(HE_G) || []).length > (text.match(LA_G) || []).length;
  }

  function containerText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('pre, code').forEach((c) => c.remove());
    return clone.textContent || '';
  }

  function setContainerDir(el) {
    const want = looksRtl(containerText(el)) ? 'rtl' : 'ltr';
    if (el.getAttribute('dir') !== want) el.setAttribute('dir', want);
  }

  function tag(el) {
    if (el.hasAttribute('data-rtl-mod')) return;
    if (el.closest(SKIP)) return;
    if (USE_HEBREW_FONT) {
      const font = getComputedStyle(el).fontFamily.replace(/^"RTL Mod Hebrew",\s*/, '');
      if (font) el.style.setProperty('--rtl-mod-font', font);
    }
    if (el.hasAttribute('dir')) {
      el.setAttribute('data-rtl-mod', 'keep');
    } else if (el.matches(CONTAINERS)) {
      el.setAttribute('data-rtl-mod', 'container');
      setContainerDir(el);
    } else {
      el.setAttribute('dir', 'auto');
      el.setAttribute('data-rtl-mod', 'auto');
    }
  }

  // streaming answers keep growing: re-check containers on every batch
  function refreshContainers() {
    document.querySelectorAll('[data-rtl-mod="container"]').forEach(setContainerDir);
  }

  function scan(root) {
    if (!enabled || !root || root.nodeType !== 1) return;
    if (root.matches(BLOCKS)) tag(root);
    root.querySelectorAll(BLOCKS).forEach(tag);
  }

  function untagAll() {
    document.querySelectorAll('[data-rtl-mod]').forEach((el) => {
      const kind = el.getAttribute('data-rtl-mod');
      if (kind === 'auto' || kind === 'container') el.removeAttribute('dir');
      el.removeAttribute('data-rtl-mod');
      el.style.removeProperty('--rtl-mod-font');
    });
  }

  // ---------- live updates (streaming answers, new chats) ----------
  const pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    let textChanged = false;
    for (const m of mutations) {
      if (m.type === 'characterData') textChanged = true;
      m.addedNodes.forEach((n) => { if (n.nodeType === 1) pending.add(n); else textChanged = true; });
    }
    if (!scheduled && (pending.size || textChanged)) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        pending.forEach((n) => { if (n.isConnected) scan(n); });
        pending.clear();
        refreshContainers();
      });
    }
  });

  // ---------- on / off ----------
  function apply() {
    document.documentElement.classList.toggle('rtl-mod-on', enabled);
    if (pill) pill.setAttribute('aria-checked', String(enabled));
    if (enabled) scan(document.body); else untagAll();
  }

  function setEnabled(v) {
    enabled = v;
    write(STORAGE_KEY, v);
    apply();
  }

  // ---------- UI ----------
  let pill = null;
  function buildPill() {
    if (window.top !== window) return; // only in the main frame
    pill = document.createElement('div');
    pill.id = 'rtl-mod-pill';
    pill.setAttribute('data-rtl-skip', '');
    pill.setAttribute('role', 'switch');
    pill.setAttribute('aria-label', 'RTL');
    pill.title = 'RTL: Ctrl+Alt+R להפעלה/כיבוי, Ctrl+Alt+H להסתרת הכפתור';
    pill.innerHTML = '<span>עברית</span><span class="rtl-mod-switch"></span>';
    pill.addEventListener('click', () => setEnabled(!enabled));
    if (read(PILL_KEY, false)) pill.classList.add('rtl-mod-hidden');
    document.body.appendChild(pill);
  }

  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey || e.shiftKey) return;
    if (e.code === 'KeyR') { e.preventDefault(); setEnabled(!enabled); }
    if (e.code === 'KeyH' && pill) {
      e.preventDefault();
      const hidden = pill.classList.toggle('rtl-mod-hidden');
      write(PILL_KEY, hidden);
    }
  }, true);

  // toolbar button (service-worker.js); only the main frame answers
  if (window.top === window) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'rtl-mod:toggle') setEnabled(!enabled);
    });
  }

  // ---------- start ----------
  function start() {
    const style = document.createElement('style');
    style.id = 'rtl-mod-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    buildPill();
    apply();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
