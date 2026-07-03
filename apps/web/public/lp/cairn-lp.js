/* ───────────────────────────────────────────────────────────────────────────
   Cairn LP — interactions
   · sticky-nav state · reveal-on-scroll (reduced-motion safe)
   · vanilla Tweaks panel (tone / theme / accent / headline) on the host protocol
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* defaults — host rewrites this block on disk when a tweak changes */
  var TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "tone": "rich",
    "theme": "dark",
    "accent": "#0FB981",
    "headline": "sans",
    "lang": "ja"
  }/*EDITMODE-END*/;

  var root = document.documentElement;

  /* ── apply tweaks to the document ──────────────────────────────── */
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function mixWhite(rgb, t) {
    return {
      r: Math.round(rgb.r + (255 - rgb.r) * t),
      g: Math.round(rgb.g + (255 - rgb.g) * t),
      b: Math.round(rgb.b + (255 - rgb.b) * t)
    };
  }
  function rgbStr(o) { return 'rgb(' + o.r + ',' + o.g + ',' + o.b + ')'; }
  function rgba(o, a) { return 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + a + ')'; }
  function luminance(o) { return (0.299 * o.r + 0.587 * o.g + 0.114 * o.b) / 255; }

  function applyAccent(hex) {
    var c = hexToRgb(hex);
    var light = mixWhite(c, 0.32);
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-2', rgbStr(light));
    root.style.setProperty('--accent-glow', rgba(c, 0.55));
    root.style.setProperty('--accent-soft', rgba(c, 0.12));
    root.style.setProperty('--accent-line', rgba(c, 0.30));
    root.style.setProperty('--accent-ink', luminance(c) > 0.55 ? '#06281D' : '#FFFFFF');
  }

  function apply(t) {
    root.setAttribute('data-tone', t.tone);
    root.setAttribute('data-theme', t.theme);
    root.setAttribute('data-headline', t.headline);
    root.setAttribute('data-lang', t.lang);
    root.lang = t.lang;
    applyAccent(t.accent);
  }

  var state = Object.assign({}, TWEAK_DEFAULTS);
  apply(state);

  /* ── persona variant (?p=club|team, default club) ──────────────── */
  var persona = 'club';
  try {
    var pParam = new URLSearchParams(location.search).get('p');
    if (pParam === 'team') persona = 'team';
  } catch (e) {}
  root.setAttribute('data-persona', persona);

  /* ── sticky nav ────────────────────────────────────────────────── */
  var nav = document.getElementById('nav');
  function onScroll() { nav.classList.toggle('is-stuck', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── reveal on scroll ──────────────────────────────────────────── */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    root.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    var vh = window.innerHeight;
    reveals.forEach(function (el) {
      // anything already in (or near) the viewport reveals immediately — no waiting on IO
      if (el.getBoundingClientRect().top < vh * 1.05) { el.classList.add('in'); }
      else { io.observe(el); }
    });
  }

  /* ── Tweaks panel (vanilla, host protocol) ─────────────────────── */
  var PANEL_CSS =
    '.cl-twk{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:248px;' +
    'transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;display:none;' +
    'background:rgba(16,23,39,.82);color:#EEF2F9;border:1px solid rgba(255,255,255,.12);' +
    'border-radius:14px;-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);' +
    'box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 18px 48px rgba(0,0,0,.5);' +
    "font:12px/1.4 'Geist',ui-sans-serif,system-ui,sans-serif;overflow:hidden}" +
    '.cl-twk.show{display:block}' +
    '.cl-hd{display:flex;align-items:center;justify-content:space-between;padding:11px 10px 11px 15px;cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,.07)}' +
    '.cl-hd b{font-size:12.5px;font-weight:600;letter-spacing:.01em}' +
    ".cl-hd em{font:500 10px/1 'Geist Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#0FB981;font-style:normal}" +
    '.cl-x{appearance:none;border:0;background:transparent;color:rgba(238,242,249,.5);width:24px;height:24px;border-radius:7px;cursor:pointer;font-size:15px;line-height:1}' +
    '.cl-x:hover{background:rgba(255,255,255,.08);color:#fff}' +
    '.cl-body{padding:13px 15px 16px;display:flex;flex-direction:column;gap:15px}' +
    '.cl-row{display:flex;flex-direction:column;gap:7px}' +
    ".cl-lbl{font:500 10px/1 'Geist Mono',monospace;letter-spacing:.13em;text-transform:uppercase;color:rgba(238,242,249,.5)}" +
    '.cl-seg{display:flex;gap:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:3px}' +
    '.cl-seg button{flex:1;appearance:none;border:0;background:transparent;color:rgba(238,242,249,.62);height:28px;border-radius:6px;cursor:pointer;font:500 12px/1 inherit;transition:background .15s,color .15s}' +
    '.cl-seg button:hover{color:#EEF2F9}' +
    '.cl-seg button.on{background:rgba(255,255,255,.1);color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3)}' +
    '.cl-sw{display:flex;gap:9px}' +
    '.cl-sw button{appearance:none;width:30px;height:30px;border-radius:50%;cursor:pointer;border:2px solid transparent;background-clip:padding-box;transition:transform .15s,border-color .15s;position:relative}' +
    '.cl-sw button:hover{transform:scale(1.08)}' +
    '.cl-sw button.on{border-color:rgba(255,255,255,.85)}' +
    '.cl-foot{padding:0 15px 14px}' +
    ".cl-foot a{font:500 11px/1 'Geist Mono',monospace;color:rgba(238,242,249,.4);text-decoration:none;letter-spacing:.04em}" +
    '.cl-foot a:hover{color:#0FB981}';

  var ACCENTS = ['#0FB981', '#3B82F6', '#8B5CF6', '#F59E0B'];

  var styleEl = document.createElement('style');
  styleEl.textContent = PANEL_CSS;
  document.head.appendChild(styleEl);

  var panel = document.createElement('div');
  panel.className = 'cl-twk';
  panel.innerHTML =
    '<div class="cl-hd"><b>Tweaks <em>· tone</em></b><button class="cl-x" aria-label="閉じる">✕</button></div>' +
    '<div class="cl-body">' +
      '<div class="cl-row"><span class="cl-lbl">Tone</span><div class="cl-seg" data-k="tone">' +
        '<button data-v="minimal">Minimal</button><button data-v="rich">Rich</button></div></div>' +
      '<div class="cl-row"><span class="cl-lbl">Theme</span><div class="cl-seg" data-k="theme">' +
        '<button data-v="dark">Dark</button><button data-v="light">Light</button></div></div>' +
      '<div class="cl-row"><span class="cl-lbl">Headline</span><div class="cl-seg" data-k="headline">' +
        '<button data-v="sans">Sans</button><button data-v="mono">Mono</button></div></div>' +
      '<div class="cl-row"><span class="cl-lbl">Language</span><div class="cl-seg" data-k="lang">' +
        '<button data-v="ja">日本語</button><button data-v="en">EN</button></div></div>' +
      '<div class="cl-row"><span class="cl-lbl">Accent</span><div class="cl-sw" data-k="accent">' +
        ACCENTS.map(function (c) { return '<button data-v="' + c + '" style="background:' + c + '"></button>'; }).join('') +
      '</div></div>' +
    '</div>' +
    '<div class="cl-foot"><a href="#top">Cairn — One Project. One Place.</a></div>';
  document.body.appendChild(panel);

  function paint() {
    panel.querySelectorAll('.cl-seg').forEach(function (seg) {
      var k = seg.getAttribute('data-k');
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === state[k]);
      });
    });
    panel.querySelectorAll('.cl-sw button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === state.accent);
    });
    document.querySelectorAll('.lang-switch button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang-set') === state.lang);
    });
  }
  paint();

  /* nav language switch (works whether or not the tweaks panel is open) */
  document.querySelectorAll('.lang-switch button').forEach(function (b) {
    b.addEventListener('click', function () { setTweak('lang', b.getAttribute('data-lang-set')); });
  });

  function setTweak(k, v) {
    state[k] = v;
    apply(state);
    paint();
    try {
      var edits = {}; edits[k] = v;
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: edits }, '*');
    } catch (e) {}
  }

  panel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-v]');
    if (btn) {
      var k = btn.parentNode.getAttribute('data-k');
      setTweak(k, btn.getAttribute('data-v'));
    }
  });

  /* host protocol: show/hide */
  var xBtn = panel.querySelector('.cl-x');
  xBtn.addEventListener('click', function () {
    panel.classList.remove('show');
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  });
  window.addEventListener('message', function (e) {
    var t = e && e.data && e.data.type;
    if (t === '__activate_edit_mode') panel.classList.add('show');
    else if (t === '__deactivate_edit_mode') panel.classList.remove('show');
  });
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}

  /* draggable header */
  (function () {
    var hd = panel.querySelector('.cl-hd'), sx, sy, ox, oy, drag = false;
    hd.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('cl-x')) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      panel.style.left = (ox + e.clientX - sx) + 'px';
      panel.style.top = (oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', function () { drag = false; });
  })();
})();
