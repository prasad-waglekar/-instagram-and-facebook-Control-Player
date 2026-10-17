// ==UserScript==
// @name         Instagram & Facebook Video Controls
// @namespace    none
// @version      10.5.12
// @author       prasadw
// @license      AGPL-3.0
// @description  Video controls for Instagram & Facebook: seekable progress, volume/speed, PiP, fullscreen, keyboard shortcuts.
// @match        https://www.instagram.com/*
// @match        https://www.facebook.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=meta.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

/* ---------- SECTION 1: prototype interceptors ----------------[cite: 1] */
const NATIVE = {
  muted: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "muted"),
  volume: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume"),
  pause: HTMLMediaElement.prototype.pause,
  play: HTMLMediaElement.prototype.play,
};

let _internal = false;
const patchFlag = "__uvcPatched";

if (!HTMLMediaElement.prototype[patchFlag]) {
  if (NATIVE.muted?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, "muted", {
      configurable: true, enumerable: true,
      get() { return NATIVE.muted.get.call(this); },
      set(v) {
        if (_internal) return NATIVE.muted.set.call(this, v);
        if (this._uvcMuteArmed) return;
        NATIVE.muted.set.call(this, v);
      },
    });
  }
  if (NATIVE.volume?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true, enumerable: true,
      get() { return NATIVE.volume.get.call(this); },
      set(v) {
        if (_internal) return NATIVE.volume.set.call(this, v);
        if (this._uvcVolumeArmed) return;
        NATIVE.volume.set.call(this, v);
      },
    });
  }
  Object.defineProperty(HTMLMediaElement.prototype, patchFlag, {
    value: true, configurable: true, enumerable: false, writable: false,
  });
}

const fMuted = (v, x) => { _internal = true; try { v.muted = x; } finally { _internal = false; } };
const fVolume = (v, x) => { _internal = true; try { v.volume = x; } finally { _internal = false; } };
const fPause = (v) => { try { NATIVE.pause.call(v); } catch (_) {} };
const fPlay = (v) => { try { return NATIVE.play.call(v); } catch (_) { return Promise.resolve(); } };

/* ---------- SECTION 2: CONFIG --------------------------------[cite: 1] */
const CFG = {
  VOL: 0.5, SPD: 1,
  SPEEDS: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4],
  LONGPRESS_SPD: 2, LONGPRESS_MS: 200,
  SEEK: 5, FRAME: 1 / 30,
  HIDE_MS: 1500,
  WHEEL_VOL: 0.05, WHEEL_SPD: 1, WHEEL_SEEK: 2,
  MIN_W: 100, MIN_H: 100,
  PANEL_H: 36,
  MIN_PANEL_WIDTH_FOR_INLINE: 220,
  RESUME_MIN: 5, RESUME_AGE: 30 * 24 * 3600 * 1000,
  SAVE_MS: 2000, MAX_POS: 200,
  HYST: 20,
  VOL_DELTA: 0.01,
  SK: "v10",
};

const IC = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  volH: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  volM: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  fs: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  fsOff: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`,
  pip: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>`,
  chevD: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`,
  chevU: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 4c0 .32-.02.63-.06.94l2.03 1.58a.5.5 0 0 1 .12.61l-1.92 3.32a.5.5 0 0 1-.59.22l-2.39-.96c-.5.39-1.03.7-1.62.94l-.36 2.54a.5.5 0 0 1-.5.42h-3.84a.5.5 0 0 1-.5-.42l-.36-2.54a7 7 0 0 1-1.62-.94l-2.39.96a.5.5 0 0 1-.59-.22L2.74 15.6a.5.5 0 0 1 .12-.61l2.03-1.58A7.07 7.07 0 0 1 4.83 12c0-.32.02-.63.06-.94L2.86 9.48a.5.5 0 0 1-.12-.61l1.92-3.32a.5.5 0 0 1 .59-.22l2.39.96c.5-.39 1.03-.7 1.62-.94l.36-2.54a.5.5 0 0 1 .5-.42h3.84c.25 0 .45.18.5.42l.36 2.54c.59.24 1.13.55 1.62.94l2.39-.96a.5.5 0 0 1 .59.22l1.92 3.32a.5.5 0 0 1-.12.61L20.88 11c.04.31.06.62.06.94z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  resume: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>`,
};

const PF = location.hostname.includes("facebook") ? "fb" : "ig";
const sk = (n) => `uvc_${CFG.SK}_${n}`;
const isExplore = () => /^\/explore\//i.test(location.pathname);
const isReels = () => /\/reels?\//i.test(location.pathname);

/* ---------- SECTION 3: DEBUG --------------------------------[cite: 1] */
const Dbg = {
  enabled: false,
  init() { try { this.enabled = !!GM_getValue(sk("debug"), false); } catch (_) {} },
  log(...a) { if (this.enabled) console.log("[UVC]", ...a); },
  toggle() {
    this.enabled = !this.enabled;
    try { GM_setValue(sk("debug"), this.enabled); } catch (_) {}
    return this.enabled;
  },
  dump() {
    return {
      version: "10.5.6", platform: PF, url: location.href,
      state: JSON.parse(JSON.stringify(S.data)),
      hotkeys: JSON.parse(JSON.stringify(HK.map)),
      positions: Object.keys(S.positions).length,
      videos: Array.from(document.querySelectorAll("video")).map((v) => ({
        src: (v.currentSrc || "").slice(0, 60),
        paused: v.paused, muted: v.muted, volume: v.volume,
        rate: v.playbackRate, currentTime: v.currentTime, duration: v.duration,
        intent: v._uvcUserMuteIntent, hover: v._uvcHoverActive,
      })),
    };
  },
  copyToClipboard() {
    try { navigator.clipboard.writeText(JSON.stringify(this.dump(), null, 2)); return true; }
    catch (_) { return false; }
  },
};

/* ---------- SECTION 4: HOTKEYS ------------------------------[cite: 1] */
const DEFAULT_HK = {
  playPause: [" ", "k"],
  seekBack: ["arrowleft", "j"],
  seekFwd: ["l"],
  seekFwdHold: ["arrowright"],
  frameBack: [","],
  frameFwd: ["."],
  volUp: ["arrowup"],
  volDown: ["arrowdown"],
  mute: ["m"],
  tabPause: ["b"],
  hide: ["h"],
  spdDown: ["[", "<"],
  spdUp: ["]", ">"],
  fullscreen: ["f"],
  pip: ["p"],
  settings: ["s"],
};

const HK = {
  map: null,
  init() {
    try {
      const s = GM_getValue(sk("hotkeys"), null);
      this.map = s && typeof s === "object"
        ? Object.assign({}, DEFAULT_HK, s)
        : JSON.parse(JSON.stringify(DEFAULT_HK));
    } catch (_) { this.map = JSON.parse(JSON.stringify(DEFAULT_HK)); }
  },
  set(a, k) { this.map[a] = k; try { GM_setValue(sk("hotkeys"), this.map); } catch (_) {} },
  reset() {
    this.map = JSON.parse(JSON.stringify(DEFAULT_HK));
    try { GM_setValue(sk("hotkeys"), this.map); } catch (_) {}
  },
  matches(a, k) { return Array.isArray(this.map[a]) && this.map[a].includes(k); },
};

/* ---------- SECTION 5: VIDEO REGISTRY -----------------------[cite: 1] */
const VR = {
  _c: [], _d: true,
  init() {
    const mark = () => { this._d = true; };
    const o = new MutationObserver(mark);
    const start = () => o.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else { const w = setInterval(() => { if (document.body) { clearInterval(w); start(); } }, 50); }
  },
  list() {
    if (this._d) { this._c = Array.from(document.querySelectorAll("video")); this._d = false; }
    return this._c;
  },
};

/* ---------- SECTION 6: STATE (with Profile Scope) ------------[cite: 1] */
const S = {
  data: null, listeners: new Set(), positions: {},
  _getScopeKey() { return isReels() ? "reels" : "feed"; },
  init() {
    let volume = CFG.VOL, speed = CFG.SPD, autoUnmute = true,
      preventTabPause = false, exploreHoverOnly = true, quietMode = false;
    try {
      const scope = this._getScopeKey();
      const sv = GM_getValue(sk(`volume_${scope}`), GM_getValue(sk("volume"), null));
      if (sv !== null && !Number.isNaN(sv)) volume = Math.max(0, Math.min(1, parseFloat(sv)));

      const ss = GM_getValue(sk(`speed_${scope}`), GM_getValue(sk("speed"), null));
      if (ss !== null && CFG.SPEEDS.includes(parseFloat(ss))) speed = parseFloat(ss);

      const au = GM_getValue(sk("autoUnmute"), null);
      if (au !== null) autoUnmute = !!au;
      preventTabPause = !!GM_getValue(sk("preventTabPause"), false);
      const eho = GM_getValue(sk("exploreHoverOnly"), null);
      if (eho !== null) exploreHoverOnly = !!eho;
      const qm = GM_getValue(sk("quietMode"), null);
      if (qm !== null) quietMode = !!qm;
      const pos = GM_getValue(sk("positions"), null);
      if (pos && typeof pos === "object") this.positions = pos;
    } catch (_) {}
    this.data = { volume, speed, autoUnmute, preventTabPause, exploreHoverOnly, quietMode };
    return this;
  },
  get(k) { return this.data ? this.data[k] : undefined; },
  isQuiet() { return !!(this.data && this.data.quietMode); },
  set(k, v) {
    this.data[k] = v;
    try {
      const scope = this._getScopeKey();
      if (k === "volume" || k === "speed") {
        GM_setValue(sk(`${k}_${scope}`), v);
        GM_setValue(sk(k), v);
      } else if (["autoUnmute", "preventTabPause", "exploreHoverOnly", "quietMode"].includes(k)) {
        GM_setValue(sk(k), v);
      }
    } catch (_) {}
    if (k === "quietMode" && v) {
      Hint.hide();
      if (typeof TT !== "undefined") TT.hideNow();
    }
    this.notify();
  },
  reloadScope() {
    if (!this.data) return;
    const scope = this._getScopeKey();
    try {
      const sv = GM_getValue(sk(`volume_${scope}`), null);
      if (sv !== null && !Number.isNaN(sv)) this.data.volume = parseFloat(sv);
      const ss = GM_getValue(sk(`speed_${scope}`), null);
      if (ss !== null && CFG.SPEEDS.includes(parseFloat(ss))) this.data.speed = parseFloat(ss);
    } catch (_) {}
    this.notify();
  },
  subscribe(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); },
  notify() { for (const cb of this.listeners) { try { cb(this.data); } catch (_) {} } },
  getPos(key) {
    const r = this.positions[key];
    if (!r) return null;
    if (Date.now() - r.ts > CFG.RESUME_AGE) { delete this.positions[key]; return null; }
    return r.t;
  },
  setPos(key, t) {
    this.positions[key] = { t, ts: Date.now() };
    const keys = Object.keys(this.positions);
    if (keys.length > CFG.MAX_POS) {
      keys.sort((a, b) => (this.positions[a].ts || 0) - (this.positions[b].ts || 0));
      for (let i = 0; i < keys.length - CFG.MAX_POS; i++) delete this.positions[keys[i]];
    }
    try { GM_setValue(sk("positions"), this.positions); } catch (_) {}
  },
  clearPos(key) {
    if (this.positions[key]) {
      delete this.positions[key];
      try { GM_setValue(sk("positions"), this.positions); } catch (_) {}
    }
  },
  clearAllPos() { this.positions = {}; try { GM_setValue(sk("positions"), {}); } catch (_) {} },
  reset() {
    try {
      ["volume", "speed", "volume_feed", "speed_feed", "volume_reels", "speed_reels",
        "autoUnmute", "preventTabPause", "exploreHoverOnly", "quietMode",
        "positions", "debug", "hotkeys"].forEach((k) => GM_setValue(sk(k), null));
    } catch (_) {}
    location.reload();
  },
};

function vkey(video) {
  try {
    const path = location.pathname;
    if (/\/reels?\//i.test(path)) return "reel:" + path;
    if (/\/stories\//i.test(path)) return "story:" + path;
    if (PF === "fb" && /\/watch/i.test(path)) return "fbwatch:" + path;
    const src = video.currentSrc || video.src || "";
    if (src) return "src:" + src.split("?")[0].slice(0, 200);
  } catch (_) {}
  return null;
}

/* ---------- SECTION 7: PLATFORM & SPA HANDLERS -------------[cite: 1] */
const P = {
  id: PF,
  prefix: PF === "fb" ? "fbu" : "igu",
  styleId: PF === "fb" ? "fb-ultimate-styles" : "ig-ultimate-styles",
  accent: PF === "fb" ? "#1877f2" : "#0095f6",
  grad: PF === "fb"
    ? "linear-gradient(90deg, #1877f2, #42b0ff)"
    : "linear-gradient(90deg, #0095f6, #00d4ff)",

  findWrapper(video) {
    if (PF === "fb") {
      const d = video.closest("div[data-instancekey]");
      if (d && d.parentElement) return d.parentElement;
      let c = video.parentElement, best = null;
      for (let i = 0; i < 8 && c; i++) {
        if (c.querySelector('[aria-label="Play"], [aria-label="Mute"], [aria-label="Unmute"]')) {
          const r = c.getBoundingClientRect();
          if (r.width >= CFG.MIN_W && r.height >= CFG.MIN_H) {
            if (!c.querySelector("header, h3 a[href*='/']")) return c;
            best = best || c;
          }
        }
        c = c.parentElement;
      }
      if (best) return best;
    }

    let el = video.parentElement;
    for (let i = 0; i < 15 && el; i++) {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width >= CFG.MIN_W && r.height >= CFG.MIN_H &&
        r.width < window.innerWidth * 0.95 && r.height < window.innerHeight * 1.1 &&
        (st.position !== "static" || st.overflow === "hidden" || st.overflow === "clip")) {
        return el;
      }
      el = el.parentElement;
    }
    return video.parentElement;
  },

  nativeHideCSS() {
    const p = this.prefix;
    return `
.${p}-wrapper.ui-visible button[aria-label*="audio" i],
.${p}-wrapper.ui-visible button[aria-label*="mute" i],
.${p}-wrapper.ui-visible button[aria-label*="unmute" i],
.${p}-wrapper.ui-visible button[aria-label*="sound" i],
.${p}-wrapper.ui-visible button[aria-label="Play"],
.${p}-wrapper.ui-visible button[aria-label="Pause"],
.${p}-wrapper.ui-visible button[aria-label*="fullscreen" i],
.${p}-wrapper.ui-visible [role="button"]:has(> svg[aria-label*="audio" i]),
.${p}-wrapper.ui-visible [role="button"]:has(> svg[aria-label*="mute" i]),
.${p}-wrapper.ui-visible [role="button"]:has(> svg[aria-label*="unmute" i]),
.${p}-wrapper.ui-visible [role="button"]:has(> svg[aria-label*="sound" i]),
.${p}-wrapper.ui-visible [role="button"]:has(> svg[aria-label*="fullscreen" i]),
.${p}-wrapper.ui-visible div[role="progressbar"] {
	opacity: 0 !important;
	pointer-events: none !important;
	visibility: hidden !important;
}`;
  },
};

// SPA Navigation Listener
(function() {
  const handleNavChange = () => {
    S.reloadScope();
    for (const [vid, ui] of UI.map.entries()) {
      if (!document.contains(vid)) {
        ui.destroy();
        UI.map.delete(vid);
        UI.processed.delete(vid);
      }
    }
  };

  const origPush = history.pushState;
  history.pushState = function(...args) {
    const res = origPush.apply(this, args);
    window.dispatchEvent(new Event("uvc-navigation"));
    return res;
  };

  const origReplace = history.replaceState;
  history.replaceState = function(...args) {
    const res = origReplace.apply(this, args);
    window.dispatchEvent(new Event("uvc-navigation"));
    return res;
  };

  window.addEventListener("popstate", () => window.dispatchEvent(new Event("uvc-navigation")));
  window.addEventListener("uvc-navigation", handleNavChange);
})();

/* ---------- SECTION 8: GLOBAL CLICK INTERCEPTOR -------------[cite: 1] */
(function () {
  const p = P.prefix;
  const PANEL = `.${p}-panel`, BTN = `.${p}-btn, .${p}-speed-btn`;
  const TL = `.${p}-timeline`, TB = `.${p}-toggle-btn`, RC = `.${p}-resume-chip`;

  const stop = (e) => {
    e.stopImmediatePropagation();
    e.stopPropagation();
  };

  const handler = (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== "function") return;

    const tb = t.closest(TB);
    if (tb) {
      stop(e);
      if (e.cancelable) e.preventDefault();
      if (e.type === "click" && typeof tb._userscriptClickHandler === "function") {
        try { tb._userscriptClickHandler(e); } catch (_) {}
      }
      return;
    }

    const rc = t.closest(RC);
    if (rc) {
      stop(e);
      if (e.cancelable) e.preventDefault();
      if (e.type === "click" && typeof rc._userscriptClickHandler === "function") {
        try { rc._userscriptClickHandler(e); } catch (_) {}
      }
      return;
    }

    const panel = t.closest(PANEL);
    if (!panel || !panel.classList.contains("ui-visible")) return;
    const ui = panel._uvcUI;
    if (ui && ui.isDragging) return;
    if (t.closest('input[type="range"]')) return;
    if (t.closest('input[type="checkbox"]')) return;
    if (t.closest("label")) return;
    if (t.closest("a[href]")) return;
    if (t.closest("select")) return;

    if (t.closest(TL)) {
      stop(e);
      if (e.type === "mousedown" || e.type === "pointerdown" || e.type === "touchstart") {
        if (e.cancelable) e.preventDefault();
        if (ui && ui.startSeek) ui.startSeek(e);
      }
      return;
    }

    if (e.type === "click") {
      stop(e);
      const btn = t.closest(BTN);
      if (btn && typeof btn._userscriptClickHandler === "function") {
        try { btn._userscriptClickHandler(e); } catch (_) {}
      }
    }
  };

  for (const type of ["click", "dblclick", "mousedown", "mouseup",
    "pointerdown", "pointerup", "touchstart", "touchend", "pointercancel"]) {
    window.addEventListener(type, handler, true);
  }
})();

/* ---------- SECTION 9: STYLES -------------------------------[cite: 1] */
const Styles = {
  inject() {
    if (document.getElementById(P.styleId)) return;
    const p = P.prefix;
    const css = document.createElement("style");
    css.id = P.styleId;
    css.textContent = `
.${p}-panel{--${p}-s:36px;--${p}-g:0 0 8px ${P.accent}80,0 0 16px ${P.accent}40;background:linear-gradient(rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.94) 45%,rgba(0,0,0,0.98) 100%)!important;padding:0!important;margin:0!important;opacity:0!important;visibility:hidden!important;transition:opacity .2s ease,visibility 0s linear .2s!important;z-index:2147483647!important;pointer-events:none!important;box-sizing:border-box!important}
.${p}-panel:not(.${p}-panel-fs){position:fixed!important}
.${p}-panel.${p}-panel-fs{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto!important}
.${p}-panel.ui-visible{opacity:1!important;visibility:visible!important;transition:opacity .2s ease,visibility 0s linear 0s!important;pointer-events:auto!important}
.${p}-controls{display:flex;align-items:center;flex-wrap:nowrap!important;gap:0;min-height:var(--${p}-s);padding:0;margin:0!important}
.${p}-btn{all:unset;width:var(--${p}-s);height:var(--${p}-s);display:flex;align-items:center;justify-content:center;cursor:pointer;color:white;transition:background .15s,box-shadow .15s;flex-shrink:0;box-sizing:border-box}
.${p}-btn:hover{background:rgba(255,255,255,0.2);box-shadow:var(--${p}-g)}
.${p}-btn svg{width:18px;height:18px;pointer-events:none}
.${p}-timeline{flex:1;height:var(--${p}-s);display:flex;align-items:stretch;cursor:pointer;position:relative;margin:0!important;padding:0!important;min-width:60px!important;order:0!important}
.${p}-timeline-track{width:100%;height:100%;background:rgba(255,255,255,0.25);overflow:hidden;position:relative}
.${p}-timeline-progress{height:100%;background:${P.grad};width:0%;position:absolute;top:0;left:0;pointer-events:none}
.${p}-timeline-thumb{position:absolute;right:-6px;top:50%;transform:translateY(-50%) scale(0);width:12px;height:12px;background:white;border-radius:50%;transition:transform .15s;z-index:2;pointer-events:none}
.${p}-timeline:hover .${p}-timeline-thumb{transform:translateY(-50%) scale(1)}
.${p}-timeline-tooltip{position:absolute;bottom:100%;background:#161616;color:#f0f0f0;padding:3px 8px;border-radius:4px;font-size:12px;font-family:monospace;transform:translateX(-50%);pointer-events:none;opacity:0;margin-bottom:6px;white-space:nowrap}
.${p}-timeline:hover .${p}-timeline-tooltip{opacity:1}
.${p}-time-current,.${p}-time-duration{position:absolute;top:50%;transform:translateY(-50%);color:white;font-size:10px;font-family:monospace;text-shadow:0 1px 2px rgba(0,0,0,0.8);pointer-events:none;user-select:none;z-index:3;padding:0 5px}
.${p}-time-current{left:0}
.${p}-time-duration{right:0}
.${p}-vol-wrap,.${p}-spd-wrap{display:flex;align-items:center;position:relative}
.${p}-popup{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.95);padding:6px 4px;opacity:0;visibility:hidden;transition:opacity .15s,visibility .15s;display:flex;flex-direction:column;align-items:center;gap:4px;width:var(--${p}-s);overflow:hidden;z-index:2147483650;box-sizing:border-box}
.${p}-vol-wrap:hover .${p}-popup,.${p}-spd-wrap:hover .${p}-popup{opacity:1;visibility:visible}
.${p}-slider-value{color:white;font-size:9px;font-weight:bold;font-family:monospace;max-width:100%;text-align:center;overflow:hidden}
.${p}-toggle-row{display:flex;align-items:center;justify-content:center;padding:6px 4px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.2);margin-bottom:4px}
.${p}-toggle-row:last-of-type{margin-bottom:6px}
.${p}-toggle-checkbox{width:14px;height:14px;cursor:pointer;accent-color:${P.accent};margin:0}
.${p}-range-vert{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;width:60px;height:16px;transform:rotate(-90deg);transform-origin:center;margin:20px -2px;touch-action:none}
.${p}-range-vert::-webkit-slider-runnable-track{height:4px;background:rgba(255,255,255,0.3);border-radius:2px}
.${p}-range-vert::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;background:white;border-radius:50%;margin-top:-6px;cursor:grab}
.${p}-range-vert::-moz-range-track{height:4px;background:rgba(255,255,255,0.3);border-radius:2px}
.${p}-range-vert::-moz-range-thumb{width:16px;height:16px;background:white;border-radius:50%;border:none;cursor:grab}
.${p}-speed-btn{font-size:11px;font-weight:bold;font-family:monospace;background:rgba(255,255,255,0.1)}
.${p}-hint{position:fixed!important;background:#111!important;color:#fff!important;padding:10px 18px!important;font-size:18px!important;font-weight:bold!important;pointer-events:none!important;opacity:0!important;visibility:hidden!important;transition:opacity .15s ease,visibility 0s linear .15s!important;white-space:nowrap!important;border-radius:6px!important;box-shadow:0 4px 20px rgba(0,0,0,0.6)!important;z-index:2147483652!important;left:0!important;top:0!important;margin:0!important}
.${p}-hint.show{opacity:1!important;visibility:visible!important;transition:opacity .15s ease,visibility 0s linear 0s!important}
.${p}-tooltip{position:fixed;background:rgba(20,20,20,0.95);color:#f0f0f0;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;white-space:nowrap;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s ease,visibility .12s ease;z-index:2147483652!important}
.${p}-tooltip.visible{opacity:1;visibility:visible}
.${p}-wrapper video{position:relative;z-index:0}
.${p}-panel.stacked .${p}-controls{flex-wrap:wrap!important}
.${p}-panel.stacked .${p}-timeline{order:-1!important;width:100%!important;flex:none!important}
.${p}-toggle-btn{position:fixed;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;border:1px solid rgba(255,255,255,0.45);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;margin:0;z-index:2147483646;opacity:0.45;transition:opacity .2s,background .2s;box-sizing:border-box;-webkit-appearance:none;appearance:none}
.${p}-toggle-btn:hover{opacity:1;background:rgba(0,0,0,0.85)}
.${p}-toggle-btn svg{width:16px;height:16px;pointer-events:none}
.${p}-resume-chip{position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);color:#fff;padding:4px 10px;border-radius:14px;font-size:11px;font-family:monospace;display:flex;align-items:center;gap:6px;z-index:2147483645;cursor:pointer;user-select:none;opacity:0.95;transition:background .15s}
.${p}-resume-chip:hover{background:rgba(0,0,0,0.9)}
.${p}-resume-chip svg{width:12px;height:12px}
.${p}-resume-x{opacity:0.7;margin-left:4px;font-weight:bold}
.${p}-resume-x:hover{opacity:1}
.${p}-settings{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#141414!important;color:#f0f0f0;padding:0;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.7);z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;width:min(520px,calc(100vw - 24px));min-width:0;max-height: min(80vh, 760px);overflow:auto;display:none;box-sizing:border-box}
.${p}-settings.visible{display:block}
.${p}-settings-head{position:sticky!important;top:0!important;z-index:5!important;background:#141414!important;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:600;font-size:14px}
.${p}-settings button.${p}-settings-close{cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;opacity:0.85;background:transparent!important;border:0!important;border-radius:6px;color:inherit;min-width:32px;min-height:32px}
.${p}-settings button.${p}-settings-close:hover{opacity:1;background:rgba(255,255,255,.14)!important}
.${p}-settings button.${p}-settings-close svg{width:18px;height:18px;display:block;pointer-events:none}
.${p}-settings-body{padding:14px 18px;display:flex;flex-direction:column;gap:12px}
.${p}-settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);min-width:0}
.${p}-settings-row>label{flex:1;min-width:0;line-height:1.4}
.${p}-settings input[type="checkbox"]{flex:0 0 auto;width:16px;height:16px;accent-color:${P.accent}}
.${p}-settings-body{min-width:0}
.${p}-settings-row:last-child{border-bottom:none}
.${p}-settings-row label{cursor:pointer}
.${p}-settings-sec{font-weight:600;color:${P.accent};font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-top:6px}
.${p}-settings select,.${p}-settings input[type="text"]{background:rgba(255,255,255,0.08);color:#f0f0f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:12px;font-family:inherit;outline:none}
.${p}-settings kbd{background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:4px;font-family:monospace;font-size:11px;cursor:pointer;min-width:70px;display:inline-block;text-align:center;border:1px solid transparent;user-select:none}
.${p}-settings kbd.recording{background:${P.accent};color:#fff;border-color:#fff}
.${p}-settings button{background:rgba(255,255,255,0.1);color:#f0f0f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:inherit}
.${p}-settings button:hover{background:rgba(255,255,255,0.18)}
.${p}-settings button.primary{background:${P.accent};border-color:${P.accent};color:#fff}
.${p}-wrapper.ui-visible *:focus-visible{outline:2px solid ${P.accent};outline-offset:1px}
${P.nativeHideCSS()}`;
    document.head.appendChild(css);
  },
};

/* ---------- SECTION 10: SHARED HINT -------------------------[cite: 1] */
const Hint = {
  el: null,
  to: null,
  ensure() {
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.className = `${P.prefix}-hint`;
      this.el.setAttribute("popover", "manual");
    }
    return this.el;
  },
  _host() {
    const fs = document.fullscreenElement;
    if (fs && fs.tagName !== "VIDEO") return fs;
    return document.body;
  },
  _promote() {
    if (!this.el) return;
    const host = this._host();
    if (this.el.parentNode !== host) host.appendChild(this.el);
    this.el.style.setProperty("z-index", "2147483652", "important");
  },
  show(text, anchorRect, force = false) {
    if (S.isQuiet() && !force) { this.hide(); return; }
    const el = this.ensure();
    clearTimeout(this.to);
    this._promote();
    el.textContent = String(text ?? "");
    try {
      if (typeof el.showPopover === "function") {
        if (el.matches(":popover-open")) el.hidePopover();
        el.showPopover();
      }
    } catch (_) {}
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("z-index", "2147483652", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");

    const r = anchorRect;
    const bounds = el.getBoundingClientRect();
    const width = bounds.width || 220;
    const height = bounds.height || 42;
    const gap = 12;
    const hasAnchor = !!r;
    let x;

    if (hasAnchor) {
      const leftX = r.left - width - gap;
      const rightX = r.right + gap;
      if (leftX >= 8) {
        x = leftX;
      } else if (rightX + width <= innerWidth - 8) {
        x = rightX;
      } else {
        x = Math.max(8, Math.min(leftX, innerWidth - width - 8));
      }
    } else {
      const leftX = (r?.left ?? 12) - width - 12;
      x = leftX >= 8 ? leftX : 8;
    }

    x = Math.max(8, Math.min(x, innerWidth - width - 8));
    const y = Math.max(8, Math.min(hasAnchor
      ? r.top + r.height / 2 - height / 2
      : (r?.top ?? 12) + 12, innerHeight - height - 8));

    el.style.setProperty("left", `${x}px`, "important");
    el.style.setProperty("top", `${y}px`, "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("bottom", "auto", "important");
    el.style.setProperty("transform", "translate(0,0)", "important");
    this.to = setTimeout(() => this.hide(), 1200);
  },
  hide() {
    if (!this.el) return;
    clearTimeout(this.to);
    this.el.classList.remove("show");
    try { if (typeof this.el.hidePopover === "function" && this.el.matches(":popover-open")) this.el.hidePopover(); } catch (_) {}
  },
};

document.addEventListener("fullscreenchange", () => {
  if (Hint.el) Hint._promote();
}, true);

/* ---------- SECTION 11: TOOLTIP ----------------------------[cite: 1] */
const TT = {
  el: null, to: null,
  init() {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = `${P.prefix}-tooltip`;
    document.body.appendChild(this.el);
  },
  show(text, target, pos, force = false) {
    if (S.isQuiet() && !force) { this.hideNow(); return; }
    if (!this.el) this.init();
    clearTimeout(this.to);
    const host = document.fullscreenElement && document.fullscreenElement.tagName !== "VIDEO"
      ? document.fullscreenElement : document.body;
    if (this.el.parentNode !== host) host.appendChild(this.el);
    this.el.style.setProperty("z-index", "2147483652", "important");
    this.el.textContent = text;
    this.el.className = `${P.prefix}-tooltip visible`;
    const r = target.getBoundingClientRect();
    this.el.style.left = "-9999px";
    this.el.style.top = "-9999px";
    const tr = this.el.getBoundingClientRect();
    let l, t;

    const inPopup = !!target.closest(`.${P.prefix}-popup`);
    if (inPopup) {
      const popRect = target.closest(`.${P.prefix}-popup`).getBoundingClientRect();
      l = popRect.right + 8;
      t = r.top + r.height / 2 - tr.height / 2;
      if (l + tr.width > innerWidth - 8) {
        l = popRect.left - tr.width - 8;
      }
    } else if (pos === "left") {
      l = r.left - tr.width - 6;
      t = r.top + r.height / 2 - tr.height / 2;
    } else if (pos === "right") {
      l = r.right + 6;
      t = r.top + r.height / 2 - tr.height / 2;
    } else {
      l = r.left + r.width / 2 - tr.width / 2;
      t = r.top - tr.height - 6;
      if (t < 5) t = r.bottom + 6;
    }

    if (l < 5) l = 5;
    if (l + tr.width > innerWidth - 5) l = innerWidth - tr.width - 5;
    if (t < 5) t = 5;
    if (t + tr.height > innerHeight - 5) t = Math.max(5, innerHeight - tr.height - 5);

    this.el.style.left = `${l}px`;
    this.el.style.top = `${t}px`;
  },
  hide() { if (!this.el) return; clearTimeout(this.to); this.to = setTimeout(() => this.el?.classList.remove("visible"), 50); },
  hideNow() {
    clearTimeout(this.to);
    if (this.el) this.el.classList.remove("visible");
  },
  attach(el, txt, pos, force = false) {
    el.addEventListener("mouseenter", () => this.show(txt, el, pos, force));
    el.addEventListener("mouseleave", () => this.hide());
  },
};

/* ---------- SECTION 12: AUDIO & HOVER ENGINE ----------------[cite: 1] */
const AE = {
  _lx: null, _ly: null,

  init() {
    const _pause = NATIVE.pause;
    const _play = NATIVE.play;

    HTMLMediaElement.prototype.pause = function () {
      if (this._uvcAudioSetup && document.visibilityState === "hidden") {
        try { if (S.get("preventTabPause")) return; } catch (_) {}
      }
      return _pause.call(this);
    };
    HTMLMediaElement.prototype.play = function () {
      if (this._uvcAudioSetup && S.get("exploreHoverOnly") && isExplore() && !this._uvcHoverActive) {
        this._uvcAutoplayRequested = true;
        return Promise.resolve();
      }
      return _play.call(this);
    };

    const obs = new MutationObserver((ms) => {
      ms.forEach((m) => m.addedNodes.forEach((node) => {
        if (node.nodeName === "VIDEO") this.setupVideo(node);
        else if (node.querySelectorAll) for (const v of node.querySelectorAll("video")) this.setupVideo(v);
      }));
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    for (const v of document.querySelectorAll("video")) this.setupVideo(v);

    const handleGlobalWindowLeave = () => {
      this._lx = -9999;
      this._ly = -9999;
      for (const v of VR.list()) {
        if (v._uvcHoverActive) {
          v._uvcHoverActive = false;
          if (!v.paused) {
            v._uvcPausedByHover = true;
            fPause(v);
          }
        }
      }
    };

    window.addEventListener("blur", handleGlobalWindowLeave, true);
    document.addEventListener("mouseleave", handleGlobalWindowLeave, true);
    document.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget && e.target === document.documentElement) handleGlobalWindowLeave();
    }, true);

    const tick = () => {
      if (document.visibilityState === "visible") {
        // Continuous boundary watchdog loop
        if (S.get("exploreHoverOnly") && isExplore() && this._lx !== null && this._ly !== null) {
          const x = this._lx, y = this._ly;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
            handleGlobalWindowLeave();
          }
        }

        for (const v of VR.list()) {
          if (!v._uvcAudioSetup) continue;
          const wm = this._wantMuted(v);
          if (v.muted !== wm) fMuted(v, wm);
          const wv = S.get("volume");
          if (Math.abs(v.volume - wv) > CFG.VOL_DELTA) fVolume(v, wv);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && !S.get("preventTabPause")) {
        for (const v of VR.list()) {
          if (v._uvcAudioSetup && !v.paused) fPause(v);
        }
      }
    });
  },

  _wantMuted(v) {
    if (v._uvcUserMuteIntent === true) return true;
    if (v._uvcUserMuteIntent === false) return false;
    return !S.get("autoUnmute");
  },

  onPointer(x, y) {
    this._lx = x; this._ly = y;
    if (!S.get("exploreHoverOnly") || !isExplore()) return;

    const hys = CFG.HYST;
    for (const v of VR.list()) {
      if (!v._uvcAudioSetup) continue;
      const r = v.getBoundingClientRect();
      if (r.width < CFG.MIN_W || r.height < CFG.MIN_H) continue;

      const was = v._uvcHoverActive === true;
      const insideStrict = x >= r.left + hys && x <= r.right - hys && y >= r.top + hys && y <= r.bottom - hys;
      const outsideStrict = x < r.left - hys || x > r.right + hys || y < r.top - hys || y > r.bottom + hys;

      let isH = was;
      if (!was && insideStrict) isH = true;
      else if (was && outsideStrict) isH = false;

      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        isH = false;
      }

      v._uvcHoverActive = isH;
      if (isH && !was) {
        v._uvcAutoplayRequested = false;
        v._uvcPausedByHover = false;
        fPlay(v);
      } else if (!isH && was && !v.paused) {
        v._uvcPausedByHover = true;
        fPause(v);
      }
    }
  },

  setupVideo(v) {
    if (v._uvcAudioSetup) return;
    v._uvcAudioSetup = true;
    v._uvcUserMuteIntent = null;
    v._uvcMuteArmed = true;
    v._uvcVolumeArmed = true;
    v._uvcHoverActive = false;
    v._uvcAutoplayRequested = false;
    v._uvcPausedByHover = false;

    fVolume(v, S.get("volume"));
    v.playbackRate = S.get("speed");
    fMuted(v, this._wantMuted(v));

    setTimeout(() => {
      v._uvcMuteArmed = false;
      v._uvcVolumeArmed = false;
    }, 100);

    // Initial check on load/refresh if cursor is already resting on this video
    if (S.get("exploreHoverOnly") && isExplore()) {
      const lx = this._lx, ly = this._ly;
      if (lx !== null && ly !== null && lx >= 0 && ly >= 0 && lx <= innerWidth && ly <= innerHeight) {
        const r = v.getBoundingClientRect();
        if (lx >= r.left && lx <= r.right && ly >= r.top && ly <= r.bottom) {
          v._uvcHoverActive = true;
          fPlay(v);
        }
      }
    }

    v.addEventListener("play", () => {
      if (S.get("exploreHoverOnly") && isExplore() && !v._uvcHoverActive) {
        const x = this._lx, y = this._ly;
        if (x !== null && x >= 0 && y >= 0) {
          const r = v.getBoundingClientRect();
          const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
          if (!over) { v._uvcPausedByHover = true; fPause(v); }
        }
      }
    });

    v.addEventListener("volumechange", () => {
      const ui = UI.map.get(v);
      if (ui) ui.updateVolUI();
    });

    v.addEventListener("ratechange", () => {
      const s = v.playbackRate;
      if (Number.isFinite(s) && s > 0 && CFG.SPEEDS.includes(s) && S.get("speed") !== s) S.set("speed", s);
      const ui = UI.map.get(v);
      if (ui) ui.updateSpdUI();
    });

    let lastSave = 0;
    v.addEventListener("timeupdate", () => {
      const now = Date.now();
      if (now - lastSave < CFG.SAVE_MS) return;
      lastSave = now;
      const k = vkey(v);
      if (!k) return;
      if (v.currentTime > 1 && v.duration && v.currentTime < v.duration - 2) S.setPos(k, v.currentTime);
    });
    v.addEventListener("ended", () => { const k = vkey(v); if (k) S.clearPos(k); });

    const restore = () => {
      const k = vkey(v);
      if (!k) return;
      const t = S.getPos(k);
      if (t === null || t < CFG.RESUME_MIN) return;
      if (!Number.isFinite(v.duration) || v.duration <= t + 2) return;
      try { v.currentTime = t; } catch (_) {}
      if (!S.isQuiet()) {
        const ui = UI.map.get(v);
        if (ui) ui.showResumeChip(t);
      }
    };
    v.addEventListener("loadedmetadata", restore, { once: true });
  },
};

/* ---------- SECTION 13: UI MANAGER --------------------------[cite: 1] */
const UI = {
  map: new WeakMap(),
  processed: new WeakSet(),
  active: new Set(),
  _pending: false,

  init() {
    this.cleanupObserver = new MutationObserver((ms) => {
      for (const m of ms) {
        for (const n of m.removedNodes) {
          if (n.nodeName === "VIDEO") this.cleanup(n);
          else if (n.querySelectorAll) n.querySelectorAll("video").forEach((v) => this.cleanup(v));
        }
      }
    });
    const start = () => this.cleanupObserver.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else { const w = setInterval(() => { if (document.body) { clearInterval(w); start(); } }, 50); }

    const loop = () => {
      for (const ui of this.active) {
        if (ui.video && document.contains(ui.video)) {
          const r = ui.video.getBoundingClientRect();
          if (r.bottom >= -200 && r.top <= innerHeight + 200 && r.right >= -200 && r.left <= innerWidth + 200) {
            ui.reposition();
          } else if (ui.panel) {
            ui.panel.style.display = "none";
            ui.toggleBtn.style.display = "none";
          }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  cleanup(video) {
    const ui = this.map.get(video);
    if (ui) { ui.destroy(); this.map.delete(video); }
    this.processed.delete(video);
  },

  process(video) {
    if (this.processed.has(video)) return;
    const r = video.getBoundingClientRect();
    if (r.width < CFG.MIN_W || r.height < CFG.MIN_H) return;
    const wrapper = P.findWrapper(video);
    if (!wrapper) return;
    this.processed.add(video);
    const ui = new VideoUI(video, wrapper);
    this.map.set(video, ui);
  },

  onPointer(x, y) {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;

      const elem = document.elementFromPoint(x, y);
      let topVideo = null;
      if (elem) {
        let node = elem;
        for (let i = 0; i < 12 && node; i++) {
          if (node.nodeName === "VIDEO") { topVideo = node; break; }
          if (typeof node.querySelector === "function") {
            const v = node.querySelector("video");
            if (v) {
              const r = v.getBoundingClientRect();
              if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                topVideo = v;
                break;
              }
            }
          }
          node = node.parentElement;
        }
      }

      if (topVideo && !this.processed.has(topVideo)) {
        const r = topVideo.getBoundingClientRect();
        if (r.width >= CFG.MIN_W && r.height >= CFG.MIN_H) this.process(topVideo);
      }

      AE.onPointer(x, y);
    });
  },
};

/* ---------- SECTION 14: VIDEO UI CLASS ----------------------[cite: 1] */
class VideoUI {
  constructor(video, wrapper) {
    this.video = video;
    this.wrapper = wrapper;
    this.isDragging = false;
    this._hideTO = null;
    this._lastMousePos = null;
    this._rafPending = false;
    this.userHidden = false;
    this._build();
    this._attach();
    this.applyState();
    this.checkLayout();
    requestAnimationFrame(() => this.reposition());
    UI.active.add(this);
  }

  _build() {
    const p = P.prefix;
    this.wrapper.classList.add(`${p}-wrapper`);
    this.panel = document.createElement("div");
    this.panel.className = `${p}-panel`;
    this.panel._uvcUI = this;
    document.body.appendChild(this.panel);

    const ctrls = document.createElement("div");
    ctrls.className = `${p}-controls`;

    this.playBtn = this._btn(`${p}-btn`, IC.play, () => this.togglePlay());
    TT.attach(this.playBtn, "Play / Pause (Space)");
    this.timeline = this._timeline();
    this.volWrap = this._volCtrl();
    this.spdWrap = this._spdCtrl();
    this.gearBtn = this._btn(`${p}-btn`, IC.gear, () => Settings.toggle());
    TT.attach(this.gearBtn, "Settings (S)");
    this.pipBtn = this._btn(`${p}-btn`, IC.pip, () => this.togglePiP());
    TT.attach(this.pipBtn, "Picture-in-Picture (P)");
    this.fsBtn = this._btn(`${p}-btn`, IC.fs, () => this.toggleFS());
    TT.attach(this.fsBtn, "Fullscreen (F)");

    ctrls.append(this.playBtn, this.volWrap, this.spdWrap, this.timeline,
      this.gearBtn, this.pipBtn, this.fsBtn);
    this.panel.appendChild(ctrls);

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.type = "button";
    this.toggleBtn.className = `${p}-toggle-btn`;
    this.toggleBtn.innerHTML = IC.chevD;
    this.toggleBtn.title = "Hide video controls";
    this.toggleBtn._userscriptClickHandler = () => this._toggleHidden();
    document.body.appendChild(this.toggleBtn);

    this.resumeChip = document.createElement("div");
    this.resumeChip.className = `${p}-resume-chip`;
    this.resumeChip.style.display = "none";
    this.resumeChip._userscriptClickHandler = (e) => {
      if (e.target.classList.contains(`${p}-resume-x`)) {
        const k = vkey(this.video);
        if (k) S.clearPos(k);
        this.resumeChip.style.display = "none";
        return;
      }
      if (this._resumeTime != null) {
        try { this.video.currentTime = this._resumeTime; } catch (_) {}
      }
      this.resumeChip.style.display = "none";
    };
    this.wrapper.appendChild(this.resumeChip);
  }

  _btn(cls, html, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.innerHTML = html;
    b._userscriptClickHandler = onClick;
    return b;
  }

  _timeline() {
    const p = P.prefix;
    const tl = document.createElement("div");
    tl.className = `${p}-timeline`;
    const track = document.createElement("div");
    track.className = `${p}-timeline-track`;
    this.progress = document.createElement("div");
    this.progress.className = `${p}-timeline-progress`;
    const thumb = document.createElement("div");
    thumb.className = `${p}-timeline-thumb`;
    this.tipTL = document.createElement("div");
    this.tipTL.className = `${p}-timeline-tooltip`;
    this.tipTL.textContent = "0:00";
    this.tCur = document.createElement("span");
    this.tCur.className = `${p}-time-current`;
    this.tCur.textContent = "0:00";
    this.tDur = document.createElement("span");
    this.tDur.className = `${p}-time-duration`;
    this.tDur.textContent = "0:00";
    this.progress.appendChild(thumb);
    track.append(this.progress, this.tCur, this.tDur);
    tl.append(track, this.tipTL);
    tl.addEventListener("mousemove", (e) => this._updateTip(e));
    tl.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.seekRel(e.deltaY > 0 ? -CFG.WHEEL_SEEK : CFG.WHEEL_SEEK);
    }, { passive: false });
    return tl;
  }

  _volCtrl() {
    const p = P.prefix;
    const w = document.createElement("div");
    w.className = `${p}-vol-wrap`;
    this.muteBtn = this._btn(`${p}-btn`, IC.volH, () => this.toggleMute());
    TT.attach(this.muteBtn, "Mute / Unmute (M)", "left");
    const pop = document.createElement("div");
    pop.className = `${p}-popup`;
    this.autoUnmuteCb = this._toggleRow(pop, "autoUnmute", "New videos start unmuted");
    this.preventTabCb = this._toggleRow(pop, "preventTabPause", "Keep playing when tab hidden");
    this.exploreCb = this._toggleRow(pop, "exploreHoverOnly", "Explore: play only on hover");
    this.volVal = document.createElement("span");
    this.volVal.className = `${p}-slider-value`;
    this.volVal.textContent = `${Math.round(S.get("volume") * 100)}%`;
    this.volSlider = document.createElement("input");
    this.volSlider.type = "range";
    this.volSlider.className = `${p}-range-vert`;
    this.volSlider.min = "0";
    this.volSlider.max = "1";
    this.volSlider.step = "0.01";
    this.volSlider.value = S.get("volume");
    const onV = (e) => {
      e.stopPropagation();
      const v = parseFloat(this.volSlider.value);
      S.set("volume", v);
      for (const vid of VR.list()) fVolume(vid, v);
      if (v > 0 && this.video.muted) {
        this.video._uvcUserMuteIntent = false;
        fMuted(this.video, false);
      }
      this.updateVolUI();
      this.showHint(`${Math.round(v * 100)}%`);
    };
    this.volSlider.addEventListener("input", onV);
    pop.append(
      this.autoUnmuteCb.parentElement,
      this.preventTabCb.parentElement,
      this.exploreCb.parentElement,
      this.volVal, this.volSlider
    );
    w.append(this.muteBtn, pop);
    w.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.adjustVol(e.deltaY > 0 ? -CFG.WHEEL_VOL : CFG.WHEEL_VOL);
    }, { passive: false });
    return w;
  }

  _spdCtrl() {
    const p = P.prefix;
    const w = document.createElement("div");
    w.className = `${p}-spd-wrap`;
    this.spdBtn = document.createElement("button");
    this.spdBtn.type = "button";
    this.spdBtn.className = `${p}-btn ${p}-speed-btn`;
    this.spdBtn.textContent = `${S.get("speed")}x`;
    this.spdBtn._userscriptClickHandler = () => this.cycleSpd(1);
    TT.attach(this.spdBtn, "Speed ([ / ])", "right");
    const pop = document.createElement("div");
    pop.className = `${p}-popup`;
    this.spdVal = document.createElement("span");
    this.spdVal.className = `${p}-slider-value`;
    this.spdVal.textContent = `${S.get("speed")}x`;
    this.spdSlider = document.createElement("input");
    this.spdSlider.type = "range";
    this.spdSlider.className = `${p}-range-vert`;
    this.spdSlider.min = "0";
    this.spdSlider.max = String(CFG.SPEEDS.length - 1);
    this.spdSlider.step = "1";
    this.spdSlider.value = String(Math.max(0, CFG.SPEEDS.indexOf(S.get("speed"))));
    const onS = (e) => {
      e.stopPropagation();
      const idx = parseInt(this.spdSlider.value, 10);
      const s = CFG.SPEEDS[idx];
      if (s !== undefined) {
        S.set("speed", s);
        for (const vid of VR.list()) vid.playbackRate = s;
        this.spdBtn.textContent = `${s}x`;
        this.spdVal.textContent = `${s}x`;
        this.showHint(`${s}x`);
      }
    };
    this.spdSlider.addEventListener("input", onS);
    pop.append(this.spdVal, this.spdSlider);
    w.append(this.spdBtn, pop);
    w.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleSpd(e.deltaY > 0 ? -CFG.WHEEL_SPD : CFG.WHEEL_SPD);
    }, { passive: false });
    return w;
  }

  _toggleRow(parent, key, tooltip) {
    const p = P.prefix;
    const row = document.createElement("label");
    row.className = `${p}-toggle-row`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = `${p}-toggle-checkbox`;
    cb.checked = S.get(key);
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      S.set(key, cb.checked);
      this.showHint(cb.checked ? "ON: " + tooltip : "OFF: " + tooltip, row, true);
    });
    row.appendChild(cb);
    // Force tooltip attachment with `force = true` so hovering over these rows always works even in Quiet Mode
    TT.attach(row, tooltip, undefined, true);
    return cb;
  }

  _attach() {
    this.video.addEventListener("play", () => this.updatePlayBtn());
    this.video.addEventListener("pause", () => this.updatePlayBtn());
    this.video.addEventListener("timeupdate", () => this.updateTime());
    this.video.addEventListener("loadedmetadata", () => this.updateTime());
    this.video.addEventListener("volumechange", () => this.updateVolUI());
    this.video.addEventListener("ratechange", () => this.updateSpdUI());

    this._mmHandler = (e) => {
      const x = e.clientX, y = e.clientY;
      const vr = this.video.getBoundingClientRect();
      const pr = this.panel.getBoundingClientRect();
      const tr = this.toggleBtn.getBoundingClientRect();
      const ov = x >= vr.left && x <= vr.right && y >= vr.top && y <= vr.bottom;
      const op = x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
      const ot = tr.width > 0 && x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom;
      if (ov || op || ot || this._isOverAnyPopup()) {
        this._lastMousePos = { x, y };
        if (!this.userHidden) {
          this.wrapper.classList.add("ui-visible");
          this.panel.classList.add("ui-visible");
        }
        this.toggleBtn.style.opacity = "1";
        this._clearHideTimer();
        this._scheduleHide();
      } else if (this._lastMousePos !== null) {
        this._lastMousePos = null;
        this._clearHideTimer();
        this.hideUI();
        this.toggleBtn.style.opacity = "0.45";
      }
    };
    document.addEventListener("mousemove", this._mmHandler, true);

    this.panel.addEventListener("mouseenter", (e) => {
      this._lastMousePos = { x: e.clientX, y: e.clientY };
      this._clearHideTimer();
      if (!this.userHidden) {
        this.wrapper.classList.add("ui-visible");
        this.panel.classList.add("ui-visible");
      }
    }, true);
    this.panel.addEventListener("mouseleave", (e) => {
      this._lastMousePos = { x: e.clientX, y: e.clientY };
      this._scheduleHide();
    }, true);

    this.toggleBtn.addEventListener("mouseenter", () => {
      this._clearHideTimer();
      this.toggleBtn.style.opacity = "1";
    });
    this.toggleBtn.addEventListener("mouseleave", () => {
      this._scheduleHide();
    });

    this._scrollHandler = () => {
      this._lastMousePos = null;
      this._clearHideTimer();
      this.hideUI();
    };
    window.addEventListener("scroll", this._scrollHandler, { passive: true, capture: true });
    window.addEventListener("wheel", this._scrollHandler, { passive: true, capture: true });
    window.addEventListener("resize", () => this._scheduleReposition());

    document.addEventListener("fullscreenchange", () => {
      this._lastMousePos = null;
      const fsEl = document.fullscreenElement;
      if (fsEl && (fsEl === this.wrapper || fsEl.contains(this.wrapper))) {
        this._attachTo(fsEl);
        this.fsBtn.innerHTML = IC.fsOff;
      } else {
        this._attachTo(document.body);
        this.fsBtn.innerHTML = IC.fs;
      }
      this._scheduleReposition();
      this.checkLayout();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this._lastMousePos = null;
        this.updateVolUI();
        this.updateSpdUI();
        this.updatePlayBtn();
        this._scheduleReposition();
      }
    });

    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => {
        this.checkLayout();
        this._scheduleReposition();
      });
      this._ro.observe(this.wrapper);
    }
    this._unsubscribeState = S.subscribe(() => this.applyState());
  }

  _attachTo(parent) {
    if (this.panel.parentNode !== parent) parent.appendChild(this.panel);
    if (this.toggleBtn.parentNode !== parent) parent.appendChild(this.toggleBtn);
    if (this.resumeChip.parentNode !== parent) parent.appendChild(this.resumeChip);
  }

  reposition() {
    if (!this.video || !this.panel) return;
    const fsEl = document.fullscreenElement;
    const isFs = fsEl && (fsEl === this.wrapper || fsEl.contains(this.wrapper));
    if (isFs) {
      this.panel.classList.add(`${P.prefix}-panel-fs`);
      this.panel.style.display = "";
      this.toggleBtn.style.display = "flex";
      this.toggleBtn.style.position = "absolute";
      this.toggleBtn.style.top = "56px";
      this.toggleBtn.style.right = "16px";
      this.toggleBtn.style.left = "auto";
      return;
    }
    this.panel.classList.remove(`${P.prefix}-panel-fs`);
    this.toggleBtn.style.position = "fixed";
    const r = this.video.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > innerHeight ||
      r.right < 0 || r.left > innerWidth) {
      this.panel.style.display = "none";
      this.toggleBtn.style.display = "none";
      this.resumeChip.style.display = "none";
      return;
    }
    this.panel.style.display = "";
    const ph = this.panel.offsetHeight || CFG.PANEL_H;
    this.panel.style.left = `${r.left}px`;
    this.panel.style.top = `${r.bottom - ph}px`;
    this.panel.style.width = `${r.width}px`;
    this.toggleBtn.style.display = "flex";
    this.toggleBtn.style.left = `${r.right - 36}px`;
    this.toggleBtn.style.top = `${r.top + 56}px`;
    this.toggleBtn.style.right = "auto";
    if (this.resumeChip.style.display !== "none") {
      this.resumeChip.style.left = `${r.left + 8}px`;
      this.resumeChip.style.top = `${r.top + 8}px`;
    }
  }

  _scheduleReposition() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.reposition();
    });
  }

  _toggleHidden() {
    this.userHidden = !this.userHidden;
    if (this.userHidden) {
      this.wrapper.classList.remove("ui-visible");
      this.panel.classList.remove("ui-visible");
      this.toggleBtn.innerHTML = IC.chevU;
      this.toggleBtn.title = "Show video controls";
    } else {
      this.wrapper.classList.add("ui-visible");
      this.panel.classList.add("ui-visible");
      this.toggleBtn.innerHTML = IC.chevD;
      this.toggleBtn.title = "Hide video controls";
    }
  }

  togglePlay() {
    if (this.video.paused) fPlay(this.video);
    else fPause(this.video);
  }
  updatePlayBtn() {
    const paused = this.video.paused;
    this.playBtn.innerHTML = paused ? IC.play : IC.pause;
    this.wrapper.classList.toggle("video-paused", paused);
  }

  toggleMute() {
    const want = !this.video.muted;
    this.video._uvcUserMuteIntent = want;
    fMuted(this.video, want);
    this.showHint(want ? "Muted" : "Unmuted");
    this.updateVolUI();
  }

  updateVolUI() {
    const m = this.video.muted, v = this.video.volume;
    this.muteBtn.innerHTML = m || v === 0 ? IC.volM : IC.volH;
    this.volSlider.value = v;
    this.volVal.textContent = `${Math.round(v * 100)}%`;
    if (this.autoUnmuteCb) this.autoUnmuteCb.checked = S.get("autoUnmute");
    if (this.preventTabCb) this.preventTabCb.checked = S.get("preventTabPause");
    if (this.exploreCb) this.exploreCb.checked = S.get("exploreHoverOnly");
  }
  updateSpdUI() {
    const ss = S.get("speed");
    const rs = this.video.playbackRate;
    const sp = Number.isFinite(rs) && rs > 0 ? rs : ss;
    const cl = CFG.SPEEDS.reduce((a, c) => Math.abs(c - sp) < Math.abs(a - sp) ? c : a);
    const idx = CFG.SPEEDS.indexOf(cl);
    this.spdBtn.textContent = `${cl}x`;
    this.spdVal.textContent = `${cl}x`;
    this.spdSlider.value = String(idx >= 0 ? idx : CFG.SPEEDS.indexOf(1));
  }
  checkLayout() {
    const w = this.wrapper ? this.wrapper.offsetWidth : 0;
    const isModal = !!this.video.closest('div[role="dialog"]');
    const isStacked = !isModal && w > 0 && w < CFG.MIN_PANEL_WIDTH_FOR_INLINE;
    this.panel.classList.toggle("stacked", isStacked);
  }

  updateTime() {
    if (!this.video.duration) return;
    const c = this.video.currentTime, d = this.video.duration;
    this.tCur.textContent = U.fmtTime(c);
    this.tDur.textContent = U.fmtTime(d);
    if (!this.isDragging) this.progress.style.width = `${(c / d) * 100}%`;
  }

  startSeek(e) {
    if (this._seekCleanup) this._seekCleanup();
    this.isDragging = true;
    this._clearHideTimer();
    if (!this.userHidden) {
      this.wrapper.classList.add("ui-visible");
      this.panel.classList.add("ui-visible");
    }
    this._doSeek(e);
    const onMove = (ev) => {
      if ("buttons" in ev && ev.buttons === 0) { cleanup(); return; }
      this._doSeek(ev);
    };
    const onUp = () => cleanup();
    const onVis = () => { if (document.visibilityState !== "visible") cleanup(); };
    const cleanup = () => {
      this.isDragging = false;
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("blur", onUp, true);
      document.removeEventListener("visibilitychange", onVis, true);
      this._seekCleanup = null;
    };
    this._seekCleanup = cleanup;
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("blur", onUp, true);
    document.addEventListener("visibilitychange", onVis, true);
  }

  _doSeek(e) {
    const r = this.timeline.getBoundingClientRect();
    const pct = U.clamp((e.clientX - r.left) / r.width, 0, 1);
    const t = pct * this.video.duration;
    this.video.currentTime = t;
    this.progress.style.width = `${pct * 100}%`;
    this.tipTL.textContent = U.fmtTime(t);
    this.tipTL.style.left = `${pct * 100}%`;
    this.showHint(U.fmtTime(t));
  }

  _updateTip(e) {
    if (this.isDragging) return;
    const r = this.timeline.getBoundingClientRect();
    const pct = U.clamp((e.clientX - r.left) / r.width, 0, 1);
    const t = pct * this.video.duration;
    this.tipTL.textContent = U.fmtTime(t);
    this.tipTL.style.left = `${pct * 100}%`;
  }

  seekRel(s) {
    this.video.currentTime = U.clamp(this.video.currentTime + s, 0, this.video.duration);
    this.showHint(`${s > 0 ? "+" : ""}${s}s`);
  }
  seekFrame(f) {
    fPause(this.video);
    this.video.currentTime = U.clamp(this.video.currentTime + f * CFG.FRAME, 0, this.video.duration);
  }

  adjustVol(d) {
    const v = U.clamp(S.get("volume") + d, 0, 1);
    S.set("volume", v);
    for (const vid of VR.list()) fVolume(vid, v);
    if (v > 0 && this.video.muted) {
      this.video._uvcUserMuteIntent = false;
      fMuted(this.video, false);
    }
    this.updateVolUI();
    this.showHint(`${Math.round(v * 100)}%`);
  }

  cycleSpd(dir) {
    const idx = CFG.SPEEDS.indexOf(S.get("speed"));
    const ni = U.clamp(idx + dir, 0, CFG.SPEEDS.length - 1);
    const ns = CFG.SPEEDS[ni];
    S.set("speed", ns);
    for (const vid of VR.list()) vid.playbackRate = ns;
    this.updateSpdUI();
    this.showHint(`${ns}x`);
  }
  setSpdTemp(s) {
    this._origSpd = this.video.playbackRate;
    this.video.playbackRate = s;
    this.showHint(`${s}x hold`);
  }
  restoreSpd() {
    if (this._origSpd !== undefined) {
      this.video.playbackRate = this._origSpd;
      this.showHint(`${this._origSpd}x`);
      this._origSpd = undefined;
    }
  }

  toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen();
    else {
      const target = (this.video.requestFullscreen && this.video) || this.wrapper;
      target.requestFullscreen?.();
    }
    setTimeout(() => this._scheduleReposition(), 100);
  }
  togglePiP() {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else if (this.video.requestPictureInPicture) this.video.requestPictureInPicture().catch(() => {});
  }

  showHint(text, anchor = null, force = false) {
    const r = anchor?.getBoundingClientRect?.() ?? this.video.getBoundingClientRect();
    Hint.show(text, r, force);
  }

  showResumeChip(t) {
    if (S.isQuiet()) return;
    this._resumeTime = t;
    this.resumeChip.innerHTML =
      `${IC.resume}<span>Resume from ${U.fmtTime(t)}</span>` +
      `<span class="${P.prefix}-resume-x">×</span>`;
    this.resumeChip.style.display = "flex";
    clearTimeout(this._chipTO);
    this._chipTO = setTimeout(() => { this.resumeChip.style.display = "none"; }, 6000);
  }

  hideUI() {
    this._clearHideTimer();
    this.wrapper.classList.remove("ui-visible");
    this.panel.classList.remove("ui-visible");
  }
  _clearHideTimer() {
    if (this._hideTO) {
      clearTimeout(this._hideTO);
      this._hideTO = null;
    }
  }
  _scheduleHide() {
    this._clearHideTimer();
    this._hideTO = setTimeout(() => {
      if (this.isDragging) return;
      if (this._isOverPanel() || this._isOverAnyPopup() || this._isOverToggle()) { this._scheduleHide(); return; }
      this.hideUI();
    }, CFG.HIDE_MS);
  }
  _isOverPanel() {
    if (!this._lastMousePos || !this.panel) return false;
    const r = this.panel.getBoundingClientRect();
    const { x, y } = this._lastMousePos;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  _isOverAnyPopup() {
    if (!this._lastMousePos) return false;
    const { x, y } = this._lastMousePos;
    const popups = this.panel.querySelectorAll(`.${P.prefix}-popup`);
    for (const pop of popups) {
      const r = pop.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return true;
      }
    }
    return false;
  }
  _isOverToggle() {
    if (!this._lastMousePos || !this.toggleBtn) return false;
    const r = this.toggleBtn.getBoundingClientRect();
    const { x, y } = this._lastMousePos;
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  applyState() {
    this.volSlider.value = S.get("volume");
    this.spdSlider.value = String(Math.max(0, CFG.SPEEDS.indexOf(S.get("speed"))));
    this.updateVolUI();
    this.updateSpdUI();
    this.updatePlayBtn();
    this.checkLayout();
  }

  destroy() {
    UI.active.delete(this);
    this._clearHideTimer();
    clearTimeout(this._chipTO);
    if (this._seekCleanup) this._seekCleanup();
    if (this._mmHandler) document.removeEventListener("mousemove", this._mmHandler, true);
    if (this._scrollHandler) {
      window.removeEventListener("scroll", this._scrollHandler, true);
      window.removeEventListener("wheel", this._scrollHandler, true);
    }
    if (this._ro) this._ro.disconnect();
    if (this._unsubscribeState) { this._unsubscribeState(); this._unsubscribeState = null; }
    if (this.panel.parentNode) this.panel.remove();
    if (this.toggleBtn.parentNode) this.toggleBtn.remove();
    if (this.resumeChip.parentNode) this.resumeChip.remove();
    if (this.wrapper) this.wrapper.classList.remove(
      `${P.prefix}-wrapper`, "video-paused", "ui-visible", "stacked");
  }
}

/* ---------- SECTION 15: KEYBOARD ----------------------------[cite: 1] */
const KB = {
  _longPressTO: null,
  _longPressActive: false,
  init() {
    document.addEventListener("keydown", (e) => this.onDown(e), { capture: true });
    document.addEventListener("keyup", (e) => this.onUp(e), { capture: true });
  },
  _ensureUI(video) {
    if (!video) return null;
    let ui = UI.map.get(video);
    if (!ui) {
      UI.process(video);
      ui = UI.map.get(video);
    }
    return ui || null;
  },

  onDown(e) {
    if (e.key === "Escape" && Settings.el && Settings.el.classList.contains("visible")) {
      e.preventDefault();
      e.stopPropagation();
      Settings.close();
      return;
    }
    if (U.inputFocused()) return;
    const video = U.videoAtCursor();
    if (!video) return;
    const ui = this._ensureUI(video);
    if (!ui) return;
    const key = e.key.toLowerCase();
    let handled = true;

    if (HK.matches("playPause", key)) { e.preventDefault(); ui.togglePlay(); }
    else if (HK.matches("seekBack", key)) { e.preventDefault(); ui.seekRel(-CFG.SEEK); }
    else if (HK.matches("seekFwd", key)) { e.preventDefault(); ui.seekRel(CFG.SEEK); }
    else if (HK.matches("seekFwdHold", key)) {
      e.preventDefault();
      if (!this._longPressTO && !this._longPressActive) {
        this._longPressTO = setTimeout(() => {
          this._longPressActive = true;
          ui.setSpdTemp(CFG.LONGPRESS_SPD);
        }, CFG.LONGPRESS_MS);
      }
    }
    else if (HK.matches("frameBack", key)) { e.preventDefault(); ui.seekFrame(-1); }
    else if (HK.matches("frameFwd", key)) { e.preventDefault(); ui.seekFrame(1); }
    else if (HK.matches("volUp", key)) { e.preventDefault(); ui.adjustVol(0.05); }
    else if (HK.matches("volDown", key)) { e.preventDefault(); ui.adjustVol(-0.05); }
    else if (HK.matches("mute", key)) { e.preventDefault(); ui.toggleMute(); }
    else if (HK.matches("tabPause", key)) {
      e.preventDefault();
      const nv = !S.get("preventTabPause");
      S.set("preventTabPause", nv);
      if (ui.preventTabCb) ui.preventTabCb.checked = nv;
      ui.showHint(nv ? "Background play ON" : "Background play OFF", ui.preventTabCb?.closest?.(`.${P.prefix}-toggle-row`) ?? null, true);
    }
    else if (HK.matches("hide", key)) { e.preventDefault(); ui._toggleHidden(); }
    else if (HK.matches("spdDown", key)) { e.preventDefault(); ui.cycleSpd(-1); }
    else if (HK.matches("spdUp", key)) { e.preventDefault(); ui.cycleSpd(1); }
    else if (HK.matches("fullscreen", key)) { e.preventDefault(); ui.toggleFS(); }
    else if (HK.matches("pip", key)) { e.preventDefault(); ui.togglePiP(); }
    else if (HK.matches("settings", key)) { e.preventDefault(); Settings.toggle(); }
    else if (/^[0-9]$/.test(key)) {
      e.preventDefault();
      video.currentTime = (parseInt(key, 10) * 10 / 100) * video.duration;
      ui.showHint(`${parseInt(key, 10) * 10}%`);
    }
    else if (key === "home") { e.preventDefault(); video.currentTime = 0; ui.showHint("Start"); }
    else if (key === "end") { e.preventDefault(); video.currentTime = video.duration; ui.showHint("End"); }
    else handled = false;

    if (handled) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  },

  onUp(e) {
    if (U.inputFocused()) return;
    const key = e.key.toLowerCase();
    if (HK.matches("seekFwdHold", key)) {
      if (this._longPressTO) {
        clearTimeout(this._longPressTO);
        this._longPressTO = null;
      }
      const video = U.videoAtCursor();
      const ui = video ? this._ensureUI(video) : null;
      if (this._longPressActive) {
        this._longPressActive = false;
        if (ui) ui.restoreSpd();
      } else if (ui) ui.seekRel(CFG.SEEK);
      e.preventDefault();
      e.stopPropagation();
    }
  },
};

/* ---------- SECTION 16: SETTINGS ----------------------------[cite: 1] */
const Settings = {
  el: null,
  open() {
    if (!this.el) this.build();
    else this._sync();
    this.el.classList.add("visible");
  },
  close() { if (this.el) this.el.classList.remove("visible"); },
  toggle() {
    if (this.el && this.el.classList.contains("visible")) this.close();
    else this.open();
  },
  _sync() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-set]').forEach((input) => {
      const key = input.dataset.set;
      if (key === "debug") { input.checked = Dbg.enabled; return; }
      if (input.type === "checkbox") input.checked = !!S.get(key);
      else if (key === "volume") input.value = S.get("volume");
      else if (key === "speed") input.value = S.get("speed");
    });
  },
  build() {
    const p = P.prefix;
    const el = document.createElement("div");
    el.className = `${p}-settings`;

    const hkRows = Object.keys(DEFAULT_HK).map((action) => {
      const keys = HK.map[action];
      return `<div class="${p}-settings-row">
        <label>${action}</label>
        <kbd data-action="${action}" title="Click to rebind">${keys.join(" / ")}</kbd>
      </div>`;
    }).join("");

    el.innerHTML = `
    <div class="${p}-settings-head">
      <span>Ultimate Video Controls</span>
      <button type="button" class="${p}-settings-close" aria-label="Close settings" title="Close settings">${IC.close}</button>
    </div>
    <div class="${p}-settings-body">
      <div class="${p}-settings-sec">General</div>
      <div class="${p}-settings-row">
        <label>Auto-unmute new videos</label>
        <input type="checkbox" data-set="autoUnmute" ${S.get("autoUnmute") ? "checked" : ""}>
      </div>
      <div class="${p}-settings-row">
        <label>Keep playing when tab is hidden</label>
        <input type="checkbox" data-set="preventTabPause" ${S.get("preventTabPause") ? "checked" : ""}>
      </div>
      <div class="${p}-settings-row">
        <label>Explore: play only on hover</label>
        <input type="checkbox" data-set="exploreHoverOnly" ${S.get("exploreHoverOnly") ? "checked" : ""}>
      </div>
      <div class="${p}-settings-row">
        <label>Quiet mode (no hint popups)</label>
        <input type="checkbox" data-set="quietMode" ${S.get("quietMode") ? "checked" : ""}>
      </div>
      <div class="${p}-settings-row">
        <label>Debug logging</label>
        <input type="checkbox" data-set="debug" ${Dbg.enabled ? "checked" : ""}>
      </div>
      <div class="${p}-settings-sec">Playback</div>
      <div class="${p}-settings-row">
        <label>Default volume</label>
        <input type="range" min="0" max="1" step="0.05" data-set="volume" value="${S.get("volume")}" style="width:120px">
      </div>
      <div class="${p}-settings-row">
        <label>Default speed</label>
        <select data-set="speed">
          ${CFG.SPEEDS.map((s) => `<option value="${s}" ${S.get("speed") === s ? "selected" : ""}>${s}x</option>`).join("")}
        </select>
      </div>
      <div class="${p}-settings-sec">Keyboard shortcuts</div>
      ${hkRows}
      <div class="${p}-settings-sec">Data</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button data-act="clear-pos">Clear resume positions</button>
        <button data-act="reset-hk">Reset hotkeys</button>
        <button data-act="dump">Copy diagnostics</button>
        <button class="primary" data-act="reset-all">Reset all settings</button>
      </div>
    </div>`;

    document.body.appendChild(el);
    this.el = el;

    this._outsideHandler = (ev) => {
      if (!this.el || !this.el.classList.contains("visible")) return;
      if (!this.el.contains(ev.target)) this.close();
    };
    document.addEventListener("pointerdown", this._outsideHandler, true);
    el.addEventListener("click", (ev) => {
      if (ev.target.closest(`.${p}-settings-close`)) {
        ev.preventDefault();
        ev.stopPropagation();
        this.close();
      }
    }, true);

    el.querySelectorAll('input[type="checkbox"][data-set], input[type="range"][data-set], select[data-set]')
      .forEach((input) => {
        const key = input.dataset.set;
        input.addEventListener("change", () => {
          if (key === "debug") {
            Dbg.enabled = input.checked;
            try { GM_setValue(sk("debug"), input.checked); } catch (_) {}
            return;
          }
          if (input.type === "checkbox") S.set(key, input.checked);
          else if (key === "volume") S.set("volume", parseFloat(input.value));
          else if (key === "speed") S.set("speed", parseFloat(input.value));
        });
      });

    el.querySelectorAll("kbd[data-action]").forEach((kb) => {
      kb.addEventListener("click", () => {
        if (kb.classList.contains("recording")) return;
        const action = kb.dataset.action;
        const original = kb.textContent;
        kb.classList.add("recording");
        kb.textContent = "Press key...";
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape"].includes(e.key)) return;
          const k = e.key === " " ? " " : e.key.toLowerCase();
          HK.set(action, [k]);
          kb.textContent = k;
          kb.classList.remove("recording");
          document.removeEventListener("keydown", onKey, true);
        };
        document.addEventListener("keydown", onKey, true);
        setTimeout(() => {
          if (kb.classList.contains("recording")) {
            kb.classList.remove("recording");
            kb.textContent = original;
            document.removeEventListener("keydown", onKey, true);
          }
        }, 4000);
      });
    });

    el.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.act;
        if (a === "clear-pos") {
          S.clearAllPos();
          const orig = btn.textContent;
          btn.textContent = "Cleared";
          setTimeout(() => (btn.textContent = orig), 1200);
        } else if (a === "reset-hk") {
          HK.reset();
          if (this.el) { this.el.remove(); this.el = null; this.open(); }
        } else if (a === "dump") {
          const ok = Dbg.copyToClipboard();
          const orig = btn.textContent;
          btn.textContent = ok ? "Copied" : "Copy failed";
          setTimeout(() => (btn.textContent = orig), 1200);
        } else if (a === "reset-all") {
          if (confirm("Reset all settings?")) S.reset();
        }
      });
    });
  },
};

/* ---------- SECTION 17: UTILS -------------------------------[cite: 1] */
const U = {
  fmtTime(s) {
    if (!s || Number.isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${x.toString().padStart(2, "0")}`;
    return `${m}:${x.toString().padStart(2, "0")}`;
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  videoAtCursor() {
    const lx = AE._lx, ly = AE._ly;
    if (lx !== null && ly !== null && lx >= 0 && ly >= 0) {
      for (const v of VR.list()) {
        const r = v.getBoundingClientRect();
        if (r.width >= 50 && r.height >= 50 &&
          lx >= r.left && lx <= r.right && ly >= r.top && ly <= r.bottom) {
          return v;
        }
      }
    }
    let best = null, bd = Infinity;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const v of VR.list()) {
      const r = v.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) continue;
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  },
  inputFocused() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" ||
      a.isContentEditable || a.contentEditable === "true" ||
      a.getAttribute("role") === "textbox");
  },
};

/* ---------- SECTION 18: USERSCRIPT MENU ---------------------[cite: 1] */
function registerMenu() {
  try {
    GM_registerMenuCommand("Open settings", () => Settings.toggle());
    GM_registerMenuCommand("Toggle debug logging", () => {
      const on = Dbg.toggle();
      alert(`Debug ${on ? "ON" : "OFF"}`);
    });
    GM_registerMenuCommand("Copy diagnostics", () => {
      const ok = Dbg.copyToClipboard();
      alert(ok ? "Copied to clipboard" : "Copy failed");
    });
    GM_registerMenuCommand("Clear resume positions", () => {
      S.clearAllPos();
      alert("Cleared");
    });
    GM_registerMenuCommand("Reset all settings", () => {
      if (confirm("Reset all settings?")) S.reset();
    });
  } catch (_) {}
}

/* ---------- SECTION 19: BOOTSTRAP ---------------------------[cite: 1] */
let _initDone = false;

function bootstrap() {
  Dbg.init();
  HK.init();
  S.init();
  VR.init();
  AE.init();
  Styles.inject();
  TT.init();
  UI.init();
  KB.init();
  registerMenu();

  S.subscribe(() => {
    if (S.isQuiet()) {
      Hint.hide();
      TT.hideNow();
    }
  });

  document.addEventListener("pointermove",
    (e) => UI.onPointer(e.clientX, e.clientY),
    { passive: true, capture: true });
  document.addEventListener("pointerdown",
    (e) => UI.onPointer(e.clientX, e.clientY),
    { passive: true, capture: true });

  Dbg.log("bootstrap complete");
}

const _early = new MutationObserver(() => {
  if (!document.head || !document.body || _initDone) return;
  _initDone = true;
  _early.disconnect();
  bootstrap();
});
_early.observe(document.documentElement, { childList: true, subtree: true });

if (document.head && document.body && !_initDone) {
  _initDone = true;
  try { _early.disconnect(); } catch (_) {}
  bootstrap();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!_initDone) {
    _initDone = true;
    try { _early.disconnect(); } catch (_) {}
    bootstrap();
  }
});

})();