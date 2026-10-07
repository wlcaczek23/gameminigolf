/* ═══════════════════════════════════════════════════════════════
   VÝSLEDKOMAT · MINI FOTBALGOLF   v2
   Hra + most (bridge) pro připisování odměn do aplikace.
   Dokumentace integrace: README.md
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const VERSION = '2.0.0';
const TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);

// ═══════════════════════════════════════════════════════
//  KONFIGURACE
//  Lze přepsat: window.FOTBALGOLF_CONFIG (před načtením game.js),
//  URL parametry (?app=1&user=..&name=..&nonce=..&origin=..&close=1)
//  nebo zprávou {type:'init', config:{...}} z aplikace.
// ═══════════════════════════════════════════════════════
const cfg = {
  appName: 'aplikaci Výsledkomat',     // „Odměny se připisují v {appName}“
  brand: { name: 'Výsledkomat', logo: 'assets/logo.png' },
  courseLogo: true,                    // logo „namalované“ na trávníku u odpaliště
  app: false,                          // true = běží uvnitř aplikace (odměny se odešlou)
  rewardsEnabled: true,
  rewardNotice: '',                    // např. „Dnešní odměnu už máš – hraj pro radost!“
  currency: { name: 'mincí', forms: ['mince', 'mince', 'mincí'], image: 'assets/coin.png', icon: '🪙' },
  rewards: {
    completion: 0,                     // za dohrání všech 9 jamek (0 = bez odměny)
    underPar: 2,                       // za celkový výsledek pod PAR
    perStrokeUnderPar: 0,              // + za každý úder pod PAR (0 = bez odměny)
    holeInOne: 1,                      // + za každou jamku na 1 úder
  },
  ballImage: '',                       // obrázek na míčku (prázdné = kreslí se fotbalový míč)
  playerName: '',
  userId: null,
  nonce: null,                         // jednorázový token ze serveru – vrací se ve výsledku
  targetOrigin: '*',                   // komu posílat postMessage (iframe)
  hostOrigin: null,                    // od koho přijímat zprávy (iframe), null = od kohokoli
  showCloseButton: false,
  website: '',                         // např. 'www.vysledkomat.cz' – zobrazí se v menu a na sdíleném obrázku
};

function mergeConfig(src) {
  if (!src || typeof src !== 'object') return;
  for (const k of Object.keys(src)) {
    if (!(k in cfg)) continue;
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], v);
    else cfg[k] = v;
  }
}
mergeConfig(window.FOTBALGOLF_CONFIG);
(() => {
  const p = new URLSearchParams(location.search);
  if (p.has('app')) cfg.app = p.get('app') !== '0';
  if (p.get('user')) cfg.userId = p.get('user');
  if (p.get('name')) cfg.playerName = p.get('name');
  if (p.get('nonce')) cfg.nonce = p.get('nonce');
  if (p.get('origin')) { cfg.targetOrigin = p.get('origin'); cfg.hostOrigin = p.get('origin'); }
  if (p.has('close')) cfg.showCloseButton = p.get('close') !== '0';
})();

// ═══════════════════════════════════════════════════════
//  JAMKY
//  Návrhový prostor 100 × 160 jednotek (vždy se celý vejde
//  na obrazovku, kruhy zůstávají kulaté). Hřiště = polygon,
//  jeho hrany jsou mantinely.
// ═══════════════════════════════════════════════════════
const DW = 100, DH = 160;
const RECT = [[8, 8], [92, 8], [92, 152], [8, 152]];

const HOLES = [
  { name: 'Rozcvička', par: 2, poly: RECT, tee: [50, 140], cup: [50, 24],
    obs: [
      { t: 'cone', x: 34, y: 97 }, { t: 'cone', x: 42, y: 92 }, { t: 'cone', x: 50, y: 88 },
      { t: 'cone', x: 58, y: 92 }, { t: 'cone', x: 66, y: 97 },
    ] },
  { name: 'Pískoviště', par: 3, poly: RECT, tee: [50, 142], cup: [50, 22],
    zones: [{ t: 'sand', shape: 'rect', x: 18, y: 64, w: 64, h: 28, r: 9 }],
    obs: [
      { t: 'tyre', x: 24, y: 116, r: 5.5 }, { t: 'tyre', x: 76, y: 116, r: 5.5 },
      { t: 'hay', x: 50, y: 44, r: 6.5 },
    ] },
  { name: 'Rybníček', par: 3, poly: RECT, tee: [50, 142], cup: [50, 22],
    zones: [{ t: 'water', shape: 'ellipse', x: 50, y: 84, rx: 25, ry: 20 }],
    obs: [{ t: 'rock', x: 21, y: 50, r: 3.4 }, { t: 'rock', x: 79, y: 118, r: 3.4 }] },
  { name: 'Mlýnek', par: 3,
    poly: [[8, 8], [92, 8], [92, 56], [76, 64], [76, 96], [92, 104], [92, 152], [8, 152], [8, 104], [24, 96], [24, 64], [8, 56]],
    tee: [50, 142], cup: [50, 20],
    obs: [{ t: 'spinner', x: 50, y: 80, len: 15, arms: 4, r: 1.4, w: 0.022 }] },
  { name: 'Zatáčka', par: 3, poly: [[8, 152], [54, 152], [54, 62], [92, 62], [92, 8], [8, 8]],
    tee: [31, 142], cup: [78, 35],
    zones: [{ t: 'boost', x: 23, y: 92, w: 16, h: 20, dir: [0, -1] }],
    obs: [{ t: 'bumper', x: 21, y: 21, r: 5 }, { t: 'tyre', x: 64, y: 21, r: 5 }, { t: 'tyre', x: 64, y: 49, r: 5 }] },
  { name: 'Posuvné brány', par: 3, poly: RECT, tee: [50, 142], cup: [50, 22],
    obs: [
      { t: 'slider', y: 108, cx: 50, amp: 19, half: 12, r: 1.6, w: 0.02, ph: 0 },
      { t: 'slider', y: 60, cx: 50, amp: 19, half: 12, r: 1.6, w: 0.02, ph: Math.PI },
      { t: 'cone', x: 30, y: 84 }, { t: 'cone', x: 50, y: 84 }, { t: 'cone', x: 70, y: 84 },
    ] },
  { name: 'Kopečky', par: 3, poly: RECT, tee: [50, 142], cup: [50, 20],
    zones: [
      { t: 'hill', x: 63, y: 112, r: 17, k: 0.045 },
      { t: 'hill', x: 37, y: 80, r: 17, k: 0.045 },
      { t: 'hill', x: 63, y: 48, r: 17, k: 0.045 },
    ],
    obs: [{ t: 'molehill', x: 21, y: 118, r: 3.2 }, { t: 'molehill', x: 80, y: 78, r: 3.2 }, { t: 'molehill', x: 24, y: 40, r: 3.2 }] },
  { name: 'Lesík', par: 4, poly: [[52, 152], [92, 152], [92, 60], [48, 60], [48, 8], [8, 8], [8, 104], [52, 104]],
    tee: [72, 142], cup: [28, 22],
    zones: [{ t: 'sand', shape: 'ellipse', x: 19, y: 95, rx: 10, ry: 7 }],
    obs: [{ t: 'tree', x: 40, y: 80, r: 6 }, { t: 'tree', x: 74, y: 74, r: 6 }, { t: 'log', a: [8, 44], b: [28, 39], r: 1.8 }] },
  { name: 'Velké finále', par: 4, poly: RECT, tee: [50, 144], cup: [50, 20],
    zones: [
      { t: 'water', shape: 'rect', x: 8, y: 98, w: 32, h: 12, r: 1 },
      { t: 'water', shape: 'rect', x: 60, y: 98, w: 32, h: 12, r: 1 },
      { t: 'bridge', x: 40, y: 96, w: 20, h: 16 },
      { t: 'boost', x: 43, y: 99, w: 14, h: 10, dir: [0, -1] },
    ],
    obs: [
      { t: 'rail', a: [40, 96], b: [40, 112], r: 1 }, { t: 'rail', a: [60, 96], b: [60, 112], r: 1 },
      { t: 'bumper', x: 30, y: 70, r: 5 }, { t: 'bumper', x: 70, y: 70, r: 5 }, { t: 'bumper', x: 50, y: 55, r: 5 },
      { t: 'hay', x: 35, y: 26, r: 6 }, { t: 'hay', x: 65, y: 26, r: 6 },
    ] },
];
const TOTAL_PAR = HOLES.reduce((a, h) => a + h.par, 0);
const strokeLimit = (h) => h.par + 4;       // po vyčerpání se jamka zapíše za limit + 1

// ═══════════════════════════════════════════════════════
//  FYZIKA – konstanty (jednotky / snímek při 60 FPS)
// ═══════════════════════════════════════════════════════
const BALL_R = 3.2, CUP_R = 4.8, WALL_R = 1.3;
const MAX_SPEED = 4.6, FRICTION = 0.982, SAND_FRICTION = 0.925, STOP_SPEED = 0.035;
const BOOST_ACC = 0.32, OSC_SPEED = 0.0125, STEP_MS = 1000 / 60;
const REST = { wall: 0.68, tyre: 0.85, hay: 0.42, tree: 0.5, rock: 0.55, cone: 0.5, molehill: 0.42, log: 0.55, rail: 0.6 };
const DEFAULT_R = { cone: 2.2 };

// ═══════════════════════════════════════════════════════
//  STAV
// ═══════════════════════════════════════════════════════
const canvas = $('#gc'), ctx = canvas.getContext('2d');
const wrap = $('#canvas-wrap'), overlay = $('#overlay');
const staticCv = document.createElement('canvas'), sctx = staticCv.getContext('2d');

let W = 1, H = 1, dpr = 1, scale = 1, offX = 0, offY = 0;
let view = { k: 1, ox: 0, oy: 0 }, vignette = null;

let state = 'menu';                 // menu | play | holed | splash | end
let tick = 0, holeIdx = 0, hole = null, cup = { x: 0, y: 0 };
let strokes = 0, scores = [], run = null, lastResult = null;
let holding = false, power = 0, powerDir = 1, aimAngle = -Math.PI / 2;
let shotActive = false, lastShot = { x: 0, y: 0 }, endTimer = 0, sinking = false;
let particles = [], trail = [], ripples = [];
let appConnected = false, rewardState = 'none', rewardReply = null, rewardTimer = 0;
const ball = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, scale: 1, visible: true };

function loadImg(src, onload) {
  const im = new Image();
  im.ok = false;
  if (!src) return im;
  if (/^https?:/i.test(src) && !src.startsWith(location.origin)) im.crossOrigin = 'anonymous';   // ať jde obrázek sdílet
  im.onload = () => { im.ok = im.naturalWidth > 0; if (im.ok && onload) onload(); };
  im.src = src;
  return im;
}
const imgDone = (im) => (im.complete || !im.src ? Promise.resolve() : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }));
let ballImg = loadImg('');
let logoImg = loadImg('');
let coinImg = loadImg('');
function loadBallImage(src) { ballImg = loadImg(src); }
function loadBrandImages() {
  logoImg = loadImg(cfg.brand.logo, () => buildStatic());
  coinImg = loadImg(cfg.currency.image);
  const img = document.getElementById('brand-img');
  if (img) { img.hidden = !cfg.brand.logo; if (cfg.brand.logo) img.src = cfg.brand.logo; }
  const nm = document.getElementById('brand-name');
  if (nm) nm.textContent = String(cfg.brand.name || '').toLocaleUpperCase('cs');
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* soukromý režim */ } },
};

// ═══════════════════════════════════════════════════════
//  POMOCNÉ FUNKCE
// ═══════════════════════════════════════════════════════
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const fmtDiff = (d) => (d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0');
function plural(n, one, few, many) { n = Math.abs(n); return n === 1 ? one : n >= 2 && n <= 4 ? few : many; }
const strokesWord = (n) => plural(n, 'úder', 'údery', 'úderů');
function makeId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* starší prohlížeč */ }
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* bez vibrací */ } }

function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segNearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const cx = ax + t * dx, cy = ay + t * dy, ex = px - cx, ey = py - cy;
  const dist = Math.hypot(ex, ey);
  if (dist < 1e-6) { const l = Math.sqrt(l2) || 1; return { dist: 0, nx: -dy / l, ny: dx / l, cx, cy }; }
  return { dist, nx: ex / dist, ny: ey / dist, cx, cy };
}
function distToPoly(x, y, P) {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; m = Math.min(m, segNearest(x, y, a[0], a[1], b[0], b[1]).dist); }
  return m;
}
function rrect(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
}
function polyPath(P) { const p = new Path2D(); P.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; }
function zonePath(z) {
  const p = new Path2D();
  if (z.shape === 'ellipse') p.ellipse(z.x, z.y, z.rx, z.ry, 0, 0, TAU);
  else if (z.t === 'hill') p.arc(z.x, z.y, z.r, 0, TAU);
  else rrect(p, z.x, z.y, z.w, z.h, z.r ?? 2);
  return p;
}
function inZone(z, x, y) {
  if (z.t === 'hill') return Math.hypot(x - z.x, y - z.y) < z.r;
  if (z.shape === 'ellipse') { const a = (x - z.x) / z.rx, b = (y - z.y) / z.ry; return a * a + b * b <= 1; }
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }

// ═══════════════════════════════════════════════════════
//  ZVUK (syntéza přes WebAudio, žádné soubory)
// ═══════════════════════════════════════════════════════
const Sound = {
  ac: null, master: null, muted: !!store.get('fotbalgolf_muted'), lastBounce: 0,
  init() {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC(); this.master = this.ac.createGain(); this.master.gain.value = 0.6;
        this.master.connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { this.ac = null; }
  },
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (this.muted || !this.ac) return;
    try {
      const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  },
  noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
    if (this.muted || !this.ac) return;
    try {
      const t = this.ac.currentTime + delay, len = Math.ceil(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    } catch (e) { /* ignore */ }
  },
  kick(p) { this.tone(110 + p * 60, 0.15, { vol: 0.5, slide: -60 }); this.noise(0.06, { vol: 0.08 + 0.25 * p, freq: 2500 }); },
  bounce(v, kind) {
    const now = performance.now();
    if (now - this.lastBounce < 60) return;
    this.lastBounce = now;
    const vol = Math.min(0.25, v * 0.07);
    if (kind === 'bumper') this.tone(620, 0.16, { type: 'triangle', vol: 0.25, slide: 360 });
    else if (kind === 'metal') this.tone(880, 0.08, { type: 'square', vol: vol * 0.5 });
    else if (kind === 'tyre') this.tone(140, 0.1, { type: 'sine', vol, slide: 60 });
    else this.tone(220, 0.06, { type: 'triangle', vol });
  },
  cup() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.08 })); },
  splash() { this.noise(0.5, { vol: 0.35, freq: 800 }); this.tone(300, 0.3, { vol: 0.1, slide: -200 }); },
  coin() { [988, 1319, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'square', vol: 0.07, delay: i * 0.09 })); },
  fail() { this.tone(300, 0.35, { type: 'sawtooth', vol: 0.07, slide: -150 }); },
};

// ═══════════════════════════════════════════════════════
//  MOST DO APLIKACE (odchozí události)
// ═══════════════════════════════════════════════════════
const Bridge = {
  native() {
    return !!(window.ReactNativeWebView || window.FotbalgolfNative ||
      (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fotbalgolf));
  },
  send(type, data = {}) {
    const msg = Object.assign({
      source: 'fotbalgolf', version: VERSION, type, runId: run ? run.id : null,
      userId: cfg.userId, nonce: cfg.nonce, ts: Date.now(),
    }, data);
    let json;
    try { json = JSON.stringify(msg); } catch (e) { return; }
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(json); } catch (e) { /* ignore */ }
    try { const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fotbalgolf; h && h.postMessage(msg); } catch (e) { /* ignore */ }
    try { window.FotbalgolfNative && window.FotbalgolfNative.postMessage(json); } catch (e) { /* ignore */ }
    try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, cfg.targetOrigin || '*'); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('fotbalgolf', { detail: msg })); } catch (e) { /* ignore */ }
    try { typeof window.onFotbalgolfEvent === 'function' && window.onFotbalgolfEvent(msg); } catch (e) { /* ignore */ }
  },
};

// příchozí zprávy z aplikace
function handleInbound(raw, origin) {
  let msg = raw;
  if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch (e) { return; } }
  if (!msg || typeof msg !== 'object' || msg.source === 'fotbalgolf') return;
  if (origin && cfg.hostOrigin && cfg.hostOrigin !== '*' && origin !== cfg.hostOrigin) return;
  switch (msg.type) {
    case 'init': applyInit(msg.config || msg); break;
    case 'reward_result': handleRewardResult(msg); break;
    case 'start': if (state === 'menu' || state === 'end') startGame(); break;
    default: break;
  }
}
function applyInit(conf) {
  const prev = [cfg.ballImage, cfg.brand.logo, cfg.brand.name, cfg.currency.image].join('|');
  mergeConfig(conf);
  appConnected = true;
  if (cfg.ballImage !== prev.split('|')[0]) loadBallImage(cfg.ballImage);
  if ([cfg.ballImage, cfg.brand.logo, cfg.brand.name, cfg.currency.image].join('|') !== prev) loadBrandImages();
  syncCloseButton();
  if (state === 'menu') renderMenu();
}
window.addEventListener('message', (e) => handleInbound(e.data, e.origin));
document.addEventListener('message', (e) => handleInbound(e.data));   // React Native (Android)

window.Fotbalgolf = {
  version: VERSION,
  init: (conf) => applyInit(conf || {}),
  rewardResult: (res) => handleRewardResult(Object.assign({ type: 'reward_result' }, res)),
  receive: (msg) => handleInbound(msg),
  start: () => startGame(),
  getState: () => ({ state, hole: holeIdx + 1, strokes, scores: scores.slice() }),
};

// ═══════════════════════════════════════════════════════
//  VELIKOST / ZOBRAZENÍ
// ═══════════════════════════════════════════════════════
function resize() {
  const rs = getComputedStyle(document.documentElement);   // hostitel může mít okraje pro výřez telefonu
  const pad = (parseFloat(rs.paddingTop) || 0) + (parseFloat(rs.paddingBottom) || 0);
  $('#game-shell').style.height = Math.max(200, window.innerHeight - pad) + 'px';
  const r = wrap.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const PAD = 2;
  scale = Math.min(W / (DW + PAD * 2), H / (DH + PAD * 2));
  offX = (W - DW * scale) / 2; offY = (H - DH * scale) / 2;
  view = { k: dpr * scale, ox: offX * dpr, oy: offY * dpr };
  const cw = canvas.width, ch = canvas.height;
  vignette = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.38, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
  buildStatic();
}

// ═══════════════════════════════════════════════════════
//  PRŮBĚH HRY
// ═══════════════════════════════════════════════════════
function loadHole(i) {
  holeIdx = i;
  const def = HOLES[i];
  hole = JSON.parse(JSON.stringify(def));
  hole.zones = hole.zones || [];
  hole.obs = hole.obs || [];
  hole.zones.forEach((z) => { z.path = zonePath(z); });
  hole.obs.forEach((o) => { if (o.r == null) o.r = DEFAULT_R[o.t] || 3; });
  hole.path = polyPath(hole.poly);
  cup = { x: def.cup[0], y: def.cup[1] };
  Object.assign(ball, { x: def.tee[0], y: def.tee[1], vx: 0, vy: 0, rot: 0, scale: 1, visible: true });
  lastShot = { x: ball.x, y: ball.y };
  strokes = 0; shotActive = false; holding = false; power = 0; sinking = false;
  aimAngle = Math.atan2(cup.y - ball.y, cup.x - ball.x);
  trail = []; particles = []; ripples = [];
  updateMovers();
  buildStatic();
  updateHUD(); setPower(0);
}

function startGame() {
  Sound.init();
  run = { id: makeId(), startedAt: Date.now() };
  scores = []; lastResult = null; rewardState = 'none'; rewardReply = null;
  overlay.classList.add('hidden');
  loadHole(0);
  state = 'play';
  showBanner();
  setHint();
  Bridge.send('game_start', { totalPar: TOTAL_PAR, holes: HOLES.length });
}

function nextHole() {
  if (holeIdx + 1 >= HOLES.length) { finishGame(); return; }
  loadHole(holeIdx + 1);
  state = 'play';
  showBanner();
  setHint();
}

function shoot() {
  const speed = MAX_SPEED * (0.06 + 0.94 * power);
  ball.vx = Math.cos(aimAngle) * speed;
  ball.vy = Math.sin(aimAngle) * speed;
  lastShot = { x: ball.x, y: ball.y };
  strokes++; shotActive = true;
  Sound.kick(power); buzz(12);
  spawn(ball.x, ball.y, '#ffffff', 10, { speed: 0.9 });
  power = 0; setPower(0);
  updateHUD(); setHint();
}

function ballMoving() { return Math.hypot(ball.vx, ball.vy) > 0.001; }

function onBallStopped() {
  shotActive = false;
  if (state !== 'play') return;
  if (strokes >= strokeLimit(hole)) pickUp();
  else setHint();
}

function onHoled() {
  state = 'holed'; endTimer = 0; sinking = true; shotActive = false;
  const hio = strokes === 1;
  const v = holeVerdict(strokes, hole.par, hio);
  showToast(v.t, `${strokes} ${strokesWord(strokes)} · ${fmtDiff(strokes - hole.par)}`, v.c);
  Sound.cup(); buzz(hio ? [40, 60, 40, 60, 80] : [30, 40, 60]);
  confetti(cup.x, cup.y, hio ? 70 : 36);
  if (hio && cfg.rewardsEnabled && num(cfg.rewards.holeInOne) > 0) {
    setTimeout(() => { floatReward(cup.x, cup.y - 6, cfg.rewards.holeInOne); Sound.coin(); }, 350);
  }
  finishHole(strokes, 'holed');
}

function pickUp() {
  const score = strokeLimit(hole) + 1;
  state = 'holed'; endTimer = 0;
  Sound.fail();
  showToast('LIMIT ÚDERŮ', `Jamka zapsána za ${score}`, '#ffa94d');
  finishHole(score, 'limit');
}

function finishHole(score, how) {
  const rec = { hole: holeIdx + 1, name: hole.name, par: hole.par, strokes: score,
    holeInOne: how === 'holed' && score === 1, pickedUp: how === 'limit' };
  scores.push(rec);
  updateHUD();
  Bridge.send('hole_complete', Object.assign({}, rec, { scoreToPar: totalDiff() }));
}

function splash() {
  state = 'splash'; endTimer = 0; shotActive = false;
  strokes++;                                   // trestný úder
  ripples.push({ x: ball.x, y: ball.y, t: 0 });
  spawn(ball.x, ball.y, '#9fd8ff', 22, { speed: 1.1 });
  Sound.splash(); buzz([20, 30, 20]);
  ball.vx = ball.vy = 0;
  showToast('ŠPLOUCH!', '+1 trestný úder', '#4fb3e8');
  updateHUD();
}

function totalDiff() { return scores.reduce((a, s) => a + s.strokes - s.par, 0); }

function holeVerdict(n, par, hio) {
  if (hio) return { t: 'HOLE IN ONE!', c: '#ffd34d' };
  const d = n - par;
  if (d <= -3) return { t: 'ALBATROS!', c: '#ffd34d' };
  if (d === -2) return { t: '🦅 EAGLE!', c: '#9be15d' };
  if (d === -1) return { t: '🐦 BIRDIE!', c: '#b9f58a' };
  if (d === 0) return { t: '✅ PAR', c: '#ffffff' };
  if (d === 1) return { t: 'BOGEY', c: '#ffc46b' };
  if (d === 2) return { t: 'DOUBLE BOGEY', c: '#ff9f6b' };
  return { t: '+' + d, c: '#ff6b5b' };
}

// ═══════════════════════════════════════════════════════
//  ODMĚNY
// ═══════════════════════════════════════════════════════
function computeRewards(total, par, hio) {
  const R = cfg.rewards, items = [];
  const add = (id, label, amount) => { amount = num(amount); if (amount > 0) items.push({ id, label, amount }); };
  add('completion', `Dohrání všech ${HOLES.length} jamek`, R.completion);
  const under = par - total;
  if (under > 0) {
    add('under_par', `Výsledek pod PAR (${total} < ${par})`, R.underPar);
    add('strokes_under_par', `Každý úder pod PAR (${under}×)`, num(R.perStrokeUnderPar) * under);
  }
  if (hio > 0) add('hole_in_one', `Hole-in-one (${hio}×)`, num(R.holeInOne) * hio);
  return { currency: Object.assign({}, cfg.currency), items, total: items.reduce((a, i) => a + i.amount, 0) };
}

function finishGame() {
  state = 'end';
  const totalStrokes = scores.reduce((a, s) => a + s.strokes, 0);
  const diff = totalStrokes - TOTAL_PAR;
  const hio = scores.filter((s) => s.holeInOne).length;
  const finishedAt = Date.now();
  const rewards = cfg.rewardsEnabled ? computeRewards(totalStrokes, TOTAL_PAR, hio) : { currency: cfg.currency, items: [], total: 0 };

  const best = store.get('fotbalgolf_best_v2');
  const isRecord = !best || totalStrokes < best.strokes;
  if (isRecord) store.set('fotbalgolf_best_v2', { strokes: totalStrokes, diff, date: finishedAt });

  lastResult = {
    playerName: cfg.playerName || null,
    startedAt: run.startedAt, finishedAt, durationMs: finishedAt - run.startedAt,
    completed: true, totalStrokes, totalPar: TOTAL_PAR, scoreToPar: diff, underPar: diff < 0,
    holesInOne: hio, holes: scores.slice(), rewards, isPersonalRecord: isRecord,
  };

  if (!cfg.rewardsEnabled || rewards.total <= 0) rewardState = 'none';
  else if (!appConnected) rewardState = 'offline';
  else {
    rewardState = 'pending';
    clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => { if (rewardState === 'pending') { rewardState = 'sent'; renderRewardStatus(); } }, 6000);
  }
  Bridge.send('game_complete', lastResult);
  showEnd(lastResult, isRecord);
}

function handleRewardResult(r) {
  if (!r) return;
  clearTimeout(rewardTimer);
  rewardReply = r;
  rewardState = r.ok === false ? 'error' : 'ok';
  renderRewardStatus();
  if (rewardState === 'ok') { Sound.coin(); buzz([20, 40, 20]); }
}

function renderRewardStatus() {
  const el = $('#reward-status');
  if (!el) return;
  const icon = coinHtml(), r = rewardReply || {};
  let text = '', cls = '';
  switch (rewardState) {
    case 'offline': text = `Mince se připisují jen při hraní v ${esc(cfg.appName)}.`; break;
    case 'pending': text = '⏳ Připisuji mince do aplikace…'; break;
    case 'sent': text = '📨 Výsledek byl odeslán do aplikace.'; break;
    case 'ok':
      cls = 'ok';
      text = '✅ ' + (r.message ? esc(r.message) : r.credited != null ? `Připsáno +${num(r.credited)} ${icon}` : 'Mince připsány do aplikace!');
      if (r.balance != null) text += ` · Zůstatek: ${num(r.balance)} ${icon}`;
      break;
    case 'error': cls = 'error'; text = '⚠️ ' + (r.message ? esc(r.message) : 'Mince se nepodařilo připsat.'); break;
    default: break;
  }
  el.className = cls;
  el.innerHTML = text;
}

// ═══════════════════════════════════════════════════════
//  UPDATE (pevný krok 60×/s – stejná rychlost i na 120Hz displejích)
// ═══════════════════════════════════════════════════════
function update() {
  tick++;
  updateMovers();

  if (state === 'play') {
    if (holding) {
      power += OSC_SPEED * powerDir;
      if (power >= 1) { power = 1; powerDir = -1; }
      if (power <= 0) { power = 0; powerDir = 1; }
      setPower(power);
    }
    physics();
  } else if (state === 'holed') {
    endTimer++;
    if (sinking) {
      ball.x += (cup.x - ball.x) * 0.25; ball.y += (cup.y - ball.y) * 0.25;
      ball.scale = Math.max(0, ball.scale - 0.06);
      if (ball.scale <= 0) { ball.visible = false; sinking = false; }
    }
    if (endTimer >= 125) nextHole();
  } else if (state === 'splash') {
    endTimer++;
    ball.scale = Math.max(0, ball.scale - 0.08);
    if (endTimer >= 55) {
      Object.assign(ball, { x: lastShot.x, y: lastShot.y, vx: 0, vy: 0, scale: 1, visible: true });
      trail = [];
      state = 'play';
      onBallStopped();
    }
  }

  // efekty
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy = p.vy * 0.95 + p.g; p.life -= p.decay; }
  particles = particles.filter((p) => p.life > 0);
  for (const r of ripples) r.t++;
  ripples = ripples.filter((r) => r.t < 50);
  if (state === 'play' && Math.hypot(ball.vx, ball.vy) > 0.6) { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 14) trail.shift(); }
  else if (trail.length) trail.shift();
}

function updateMovers() {
  if (!hole) return;
  for (const o of hole.obs) {
    if (o.t === 'spinner') {
      const base = o.w * tick;
      o.pts = o.pts || [];
      for (let i = 0; i < o.arms; i++) {
        const a = base + (i * TAU) / o.arms;
        o.pts[i] = { x: o.x + Math.cos(a) * o.len, y: o.y + Math.sin(a) * o.len };
      }
    } else if (o.t === 'slider') {
      const ph = o.w * tick + o.ph, cx = o.cx + o.amp * Math.sin(ph);
      o.vx = o.amp * o.w * Math.cos(ph); o.x1 = cx - o.half; o.x2 = cx + o.half;
    } else if (o.t === 'bumper') {
      o.flash = Math.max(0, (o.flash || 0) - 0.06);
    }
  }
}

function physics() {
  const wasMoving = ballMoving();
  let forced = false, fric = FRICTION;

  for (const z of hole.zones) {
    if (!inZone(z, ball.x, ball.y)) continue;
    if (z.t === 'sand') fric = SAND_FRICTION;
    else if (z.t === 'hill') {
      let dx = ball.x - z.x, dy = ball.y - z.y, d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const f = z.k * (1 - d / z.r) + 0.004;
      ball.vx += (dx / d) * f; ball.vy += (dy / d) * f; forced = true;
    } else if (z.t === 'boost') {
      ball.vx += z.dir[0] * BOOST_ACC; ball.vy += z.dir[1] * BOOST_ACC; forced = true;
    }
  }

  // jamka – „přitáhne“ míč, který se zastaví na jejím okraji
  {
    const dx = cup.x - ball.x, dy = cup.y - ball.y, d = Math.hypot(dx, dy), sp = Math.hypot(ball.vx, ball.vy);
    if (d < CUP_R + BALL_R * 0.6 && d > 0.01 && sp < 1.2) { ball.vx += (dx / d) * 0.03; ball.vy += (dy / d) * 0.03; forced = true; }
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = Math.min(10, Math.max(1, Math.ceil(speed / 1.2)));
  for (let i = 0; i < steps; i++) {
    const px = ball.x, py = ball.y;
    ball.x += ball.vx / steps; ball.y += ball.vy / steps;
    collide();
    if (!pointInPoly(ball.x, ball.y, hole.poly)) { ball.x = px; ball.y = py; ball.vx *= -0.5; ball.vy *= -0.5; }
  }
  ball.vx *= fric; ball.vy *= fric;
  let sp = Math.hypot(ball.vx, ball.vy);
  if (sp > MAX_SPEED * 1.25) { const k = (MAX_SPEED * 1.25) / sp; ball.vx *= k; ball.vy *= k; sp = MAX_SPEED * 1.25; }

  for (const z of hole.zones) if (z.t === 'water' && inZone(z, ball.x, ball.y)) { splash(); return; }

  // padne do jamky?
  {
    const dx = cup.x - ball.x, dy = cup.y - ball.y, d = Math.hypot(dx, dy);
    if (d < CUP_R) {
      if (sp < 2.6 + (1 - d / CUP_R) * 1.2) { onHoled(); return; }
      ball.vx = ball.vx * 0.94 + (dx / (d || 1)) * 0.18; ball.vy = ball.vy * 0.94 + (dy / (d || 1)) * 0.18;
    }
  }

  if (!forced && sp < STOP_SPEED) { ball.vx = 0; ball.vy = 0; sp = 0; }
  ball.rot += (sp / BALL_R) * (ball.vx >= 0 ? 1 : -1);
  if (shotActive && wasMoving && sp === 0) onBallStopped();
}

// ── kolize ───────────────────────────────────────────
function resolve(nx, ny, pen, rest, svx, svy, kind) {
  ball.x += nx * (pen + 0.01); ball.y += ny * (pen + 0.01);
  const rvx = ball.vx - svx, rvy = ball.vy - svy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
  let out = -vn * rest;
  if (kind === 'bumper') out = Math.max(out, 2.0);
  ball.vx = svx + nx * out + tx * vt * 0.97;
  ball.vy = svy + ny * out + ty * vt * 0.97;
  onImpact(-vn, kind);
  return -vn;
}
function hitCapsule(ax, ay, bx, by, cr, rest, svx, svy, kind) {
  const s = segNearest(ball.x, ball.y, ax, ay, bx, by), min = cr + BALL_R;
  return s.dist < min ? resolve(s.nx, s.ny, min - s.dist, rest, svx, svy, kind) : 0;
}
function hitCircle(x, y, r, rest, kind) {
  const dx = ball.x - x, dy = ball.y - y, d = Math.hypot(dx, dy) || 0.0001, min = r + BALL_R;
  return d < min ? resolve(dx / d, dy / d, min - d, rest, 0, 0, kind) : 0;
}
function collide() {
  const P = hole.poly;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    hitCapsule(a[0], a[1], b[0], b[1], WALL_R, REST.wall, 0, 0, 'wall');
  }
  for (const o of hole.obs) {
    switch (o.t) {
      case 'log': case 'rail': hitCapsule(o.a[0], o.a[1], o.b[0], o.b[1], o.r, REST[o.t], 0, 0, 'wood'); break;
      case 'slider': hitCapsule(o.x1, o.y, o.x2, o.y, o.r, 0.6, o.vx, 0, 'metal'); break;
      case 'spinner':
        hitCircle(o.x, o.y, 2.4, 0.5, 'metal');
        for (const p of o.pts) {
          const s = segNearest(ball.x, ball.y, o.x, o.y, p.x, p.y), min = o.r + BALL_R;
          if (s.dist < min) resolve(s.nx, s.ny, min - s.dist, 0.6, -o.w * (s.cy - o.y), o.w * (s.cx - o.x), 'metal');
        }
        break;
      case 'bumper': if (hitCircle(o.x, o.y, o.r, 1.25, 'bumper') > 0.1) o.flash = 1; break;
      default: hitCircle(o.x, o.y, o.r, REST[o.t] ?? 0.5, o.t);
    }
  }
}
const IMPACT_COLORS = { wall: '#d9a36a', wood: '#c58a4f', tyre: '#ffd34d', bumper: '#ff6b5b', metal: '#e0e0e0', hay: '#f2d27a', tree: '#7bc96f', rock: '#bbbbbb', cone: '#ff9a3c', molehill: '#9a6a40' };
function onImpact(v, kind) {
  if (v < 0.35) return;
  spawn(ball.x, ball.y, IMPACT_COLORS[kind] || '#ffffff', Math.min(8, 2 + Math.round(v * 2)), { speed: 0.5 + v * 0.2 });
  Sound.bounce(v, kind);
  if (kind === 'bumper') buzz(15);
}

// ── částice ──────────────────────────────────────────
function spawn(x, y, col, n, { speed = 1, g = 0, size = 0.6 } = {}) {
  for (let i = 0; i < n && particles.length < 400; i++) {
    const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.9);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.025 + Math.random() * 0.02, col, r: size * (0.6 + Math.random() * 0.9), g, sq: false });
  }
}
function confetti(x, y, n) {
  const cols = ['#f2c230', '#8fd11a', '#ffffff', '#1a1a1a', '#c4f25a'];
  for (let i = 0; i < n && particles.length < 400; i++) {
    const a = Math.random() * TAU, s = 0.5 + Math.random() * 1.6;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, life: 1, decay: 0.012 + Math.random() * 0.012, col: cols[i % cols.length], r: 0.6 + Math.random() * 0.7, g: 0.025, sq: true, rot: Math.random() * TAU });
  }
}

// ═══════════════════════════════════════════════════════
//  KRESLENÍ – statická vrstva (kreslí se jen při změně jamky / velikosti)
// ═══════════════════════════════════════════════════════
function buildStatic() {
  if (!hole) return;
  staticCv.width = canvas.width; staticCv.height = canvas.height;
  const c = sctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, staticCv.width, staticCv.height);
  c.setTransform(view.k, 0, 0, view.k, view.ox, view.oy);
  const x0 = -view.ox / view.k, y0 = -view.oy / view.k;
  const x1 = (staticCv.width - view.ox) / view.k, y1 = (staticCv.height - view.oy) / view.k;
  const rng = mulberry32(holeIdx * 7919 + 13);
  const P = hole.poly;

  // tráva mimo hřiště
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#2d6c2b'); g.addColorStop(1, '#1f5222');
  c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < 40; i++) {
    c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    circle(c, x0 + rng() * (x1 - x0), y0 + rng() * (y1 - y0), 6 + rng() * 12); c.fill();
  }
  c.lineCap = 'round'; c.lineWidth = 0.35;
  for (let i = 0; i < 520; i++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
    if (pointInPoly(x, y, P)) continue;
    c.strokeStyle = rng() < 0.5 ? 'rgba(130,200,95,0.45)' : 'rgba(10,40,10,0.35)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rng() - 0.5) * 0.9, y - 1 - rng() * 0.9); c.stroke();
  }
  // kytičky
  for (let i = 0; i < 26; i++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
    if (pointInPoly(x, y, P) || distToPoly(x, y, P) < 3) continue;
    c.fillStyle = ['#ffffff', '#ffe066', '#ffb3d1', '#c7b8ff'][Math.floor(rng() * 4)];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; circle(c, x + Math.cos(a) * 0.55, y + Math.sin(a) * 0.55, 0.4); c.fill(); }
    c.fillStyle = '#f4a300'; circle(c, x, y, 0.3); c.fill();
  }
  // keře a stromy kolem hřiště
  const placed = [];
  for (let t = 0; t < 400 && placed.length < 16; t++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0), r = 2.5 + rng() * 4;
    if (pointInPoly(x, y, P) || distToPoly(x, y, P) < r + 2.2) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r)) continue;
    placed.push({ x, y, r });
    if (r > 4.6) drawTree(c, { x, y, r }); else drawBush(c, x, y, r, rng);
  }

  // hřiště (fairway)
  const path = hole.path;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 6 * dpr; c.shadowOffsetY = 2 * dpr;
  c.fillStyle = '#55b548'; c.fill(path);
  c.restore();
  c.save();
  c.clip(path);
  for (let y = 0, i = 0; y < DH; y += 9, i++) {
    c.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)';
    c.fillRect(0, y, DW, 9);
  }
  for (let i = 0; i < 700; i++) {
    c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,50,0,0.07)';
    c.fillRect(rng() * DW, rng() * DH, 0.35, 0.35);
  }
  if (cfg.courseLogo && logoImg.ok) {               // logo „namalované“ na trávníku
    const def = HOLES[holeIdx];
    const [lx, ly, lw] = def.logo || [def.tee[0], def.tee[1] - 23, 30];
    const lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
    c.save();
    c.globalAlpha = 0.16; c.drawImage(logoImg, lx - lw / 2, ly - lh / 2, lw, lh);
    c.globalAlpha = 0.08; c.globalCompositeOperation = 'lighter'; c.drawImage(logoImg, lx - lw / 2, ly - lh / 2, lw, lh);
    c.restore();
  }
  for (const z of hole.zones) drawZoneStatic(c, z, rng);
  drawTee(c);
  for (const o of hole.obs) {
    if (o.t === 'slider') {
      c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = o.r * 2 + 1.4;
      c.beginPath(); c.moveTo(o.cx - o.amp - o.half, o.y); c.lineTo(o.cx + o.amp + o.half, o.y); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.3; c.stroke();
    } else if (o.t === 'spinner') {
      c.fillStyle = 'rgba(0,0,0,0.08)'; circle(c, o.x, o.y, o.len + o.r); c.fill();
      c.setLineDash([1.2, 1.4]); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.35;
      circle(c, o.x, o.y, o.len + o.r); c.stroke(); c.setLineDash([]);
    }
  }
  c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 5; c.stroke(path);
  c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2.6; c.stroke(path);
  c.restore();

  // dřevěné mantinely
  c.save();
  c.lineJoin = 'round';
  c.translate(0.4, 0.8); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2.8; c.stroke(path);
  c.restore();
  c.save();
  c.lineJoin = 'round';
  c.strokeStyle = '#7b4a22'; c.lineWidth = 2.6; c.stroke(path);
  c.strokeStyle = '#b77a3e'; c.lineWidth = 1.3; c.stroke(path);
  c.strokeStyle = 'rgba(255,220,170,0.35)'; c.lineWidth = 0.35; c.stroke(path);
  for (const [x, y] of P) {
    c.fillStyle = '#5e3517'; circle(c, x, y, 1.7); c.fill();
    c.fillStyle = '#a06a35'; circle(c, x - 0.3, y - 0.3, 0.8); c.fill();
  }
  c.restore();

  for (const o of hole.obs) if (!['spinner', 'slider', 'bumper'].includes(o.t)) drawObstacle(c, o);
}

function drawZoneStatic(c, z, rng) {
  if (z.t === 'sand') {
    c.save();
    c.fillStyle = '#e8cf92'; c.fill(z.path); c.clip(z.path);
    const bx = z.shape === 'ellipse' ? z.x - z.rx : z.x, by = z.shape === 'ellipse' ? z.y - z.ry : z.y;
    const bw = z.shape === 'ellipse' ? z.rx * 2 : z.w, bh = z.shape === 'ellipse' ? z.ry * 2 : z.h;
    for (let i = 0; i < bw * bh * 0.6; i++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(170,130,60,0.35)' : 'rgba(255,248,220,0.55)';
      c.fillRect(bx + rng() * bw, by + rng() * bh, 0.35, 0.35);
    }
    c.strokeStyle = 'rgba(160,120,60,0.22)'; c.lineWidth = 0.3;
    for (let y = by + 2; y < by + bh; y += 2.2) {
      c.beginPath();
      for (let x = bx; x <= bx + bw; x += 2) c.lineTo(x, y + Math.sin(x * 0.35 + y) * 0.4);
      c.stroke();
    }
    c.strokeStyle = 'rgba(120,80,20,0.28)'; c.lineWidth = 2; c.stroke(z.path);
    c.restore();
    c.strokeStyle = 'rgba(255,245,210,0.55)'; c.lineWidth = 0.5; c.stroke(z.path);
  } else if (z.t === 'water') {
    c.strokeStyle = '#cdb67c'; c.lineWidth = 2.4; c.stroke(z.path);
    const by = z.shape === 'ellipse' ? z.y - z.ry : z.y, bh = z.shape === 'ellipse' ? z.ry * 2 : z.h;
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#5fbdf0'); g.addColorStop(1, '#1d6fa5');
    c.fillStyle = g; c.fill(z.path);
    c.save(); c.clip(z.path);
    c.strokeStyle = 'rgba(0,30,70,0.35)'; c.lineWidth = 3; c.stroke(z.path);
    c.restore();
    if (z.shape === 'ellipse') {         // rákos a lekníny
      for (let i = 0; i < 4; i++) {
        const a = rng() * TAU, x = z.x + Math.cos(a) * z.rx * 0.6, y = z.y + Math.sin(a) * z.ry * 0.6;
        c.fillStyle = '#3f9b4a'; c.beginPath(); c.arc(x, y, 1.6, 0.4, TAU - 0.1); c.lineTo(x, y); c.fill();
        if (i === 0) { c.fillStyle = '#ffd1e6'; circle(c, x + 0.3, y - 0.2, 0.6); c.fill(); }
      }
      c.strokeStyle = '#2f6e2f'; c.lineWidth = 0.35;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.75 + rng() * 0.9, x = z.x + Math.cos(a) * z.rx * 0.97, y = z.y + Math.sin(a) * z.ry * 0.97;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rng() - 0.5), y - 2.5 - rng() * 1.5); c.stroke();
        c.fillStyle = '#6b4423'; c.fillRect(x + (rng() - 0.5) * 0.4 - 0.25, y - 3.2, 0.5, 1.2);
      }
    }
  } else if (z.t === 'hill') {
    const g = c.createRadialGradient(z.x - z.r * 0.25, z.y - z.r * 0.3, z.r * 0.05, z.x, z.y, z.r);
    g.addColorStop(0, 'rgba(255,255,210,0.32)'); g.addColorStop(0.55, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fill(z.path);
    const g2 = c.createRadialGradient(z.x + z.r * 0.35, z.y + z.r * 0.4, 0, z.x + z.r * 0.2, z.y + z.r * 0.25, z.r * 0.9);
    g2.addColorStop(0, 'rgba(0,40,0,0.16)'); g2.addColorStop(1, 'rgba(0,40,0,0)');
    c.save(); c.clip(z.path); c.fillStyle = g2; c.fill(z.path); c.restore();
    for (const k of [0.3, 0.6, 0.9]) {
      c.strokeStyle = `rgba(255,255,255,${0.16 - k * 0.09})`; c.lineWidth = 0.35;
      circle(c, z.x, z.y, z.r * k); c.stroke();
    }
  } else if (z.t === 'boost') {
    c.fillStyle = 'rgba(28,38,44,0.9)'; c.fill(z.path);
    c.strokeStyle = '#ffd34d'; c.lineWidth = 0.5; c.stroke(z.path);
  } else if (z.t === 'bridge') {
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(z.x + 0.5, z.y + 0.8, z.w, z.h);
    c.fillStyle = '#b07a43'; c.fillRect(z.x, z.y, z.w, z.h);
    for (let y = z.y; y < z.y + z.h; y += 2) {
      c.fillStyle = (y - z.y) % 4 ? '#c08a51' : '#a8723d'; c.fillRect(z.x, y, z.w, 1.8);
    }
    c.fillStyle = 'rgba(60,30,10,0.5)';
    for (let y = z.y + 0.9; y < z.y + z.h; y += 2) { circle(c, z.x + 2.5, y, 0.22); c.fill(); circle(c, z.x + z.w - 2.5, y, 0.22); c.fill(); }
  }
}

function drawTee(c) {
  const [x, y] = HOLES[holeIdx].tee;
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); rrect(c, x - 8, y - 5.5, 16, 11, 2); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 0.35; c.stroke();
  for (const sx of [-6, 6]) {
    c.fillStyle = 'rgba(0,0,0,0.25)'; circle(c, x + sx + 0.25, y + 0.35, 0.95); c.fill();
    c.fillStyle = '#ffffff'; circle(c, x + sx, y, 0.95); c.fill();
  }
}

// ── překážky ─────────────────────────────────────────
function shadow(c, x, y, rx, ry = rx * 0.85) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 0.8, y + 1.4, rx, ry, 0, 0, TAU); c.fill(); }

function drawObstacle(c, o) {
  switch (o.t) {
    case 'cone': return drawCone(c, o);
    case 'tyre': return drawTyre(c, o);
    case 'hay': return drawHay(c, o);
    case 'rock': return drawRock(c, o);
    case 'tree': return drawTree(c, o);
    case 'molehill': return drawMolehill(c, o);
    case 'log': return drawLog(c, o, false);
    case 'rail': return drawLog(c, o, true);
    case 'bumper': return drawBumper(c, o);
    case 'spinner': return drawSpinner(c, o);
    case 'slider': return drawSlider(c, o);
    default: return undefined;
  }
}
function drawCone(c, o) {
  shadow(c, o.x, o.y, o.r * 1.05);
  const g = c.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 0, o.x, o.y, o.r);
  g.addColorStop(0, '#ffa04d'); g.addColorStop(1, '#e85d0c');
  c.fillStyle = g; circle(c, o.x, o.y, o.r); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = o.r * 0.22; circle(c, o.x, o.y, o.r * 0.58); c.stroke();
  c.fillStyle = '#ffc48c'; circle(c, o.x, o.y, o.r * 0.22); c.fill();
  c.strokeStyle = '#b5470a'; c.lineWidth = 0.3; circle(c, o.x, o.y, o.r); c.stroke();
}
function drawTyre(c, o) {
  const { x, y, r } = o;
  shadow(c, x, y, r);
  c.fillStyle = '#1c1e21'; circle(c, x, y, r); c.fill();
  c.strokeStyle = '#3a3d42'; c.lineWidth = r * 0.12;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); c.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); c.stroke();
  }
  const g = c.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r * 0.5);
  g.addColorStop(0, '#5aa84c'); g.addColorStop(1, '#2f6b2a');
  c.fillStyle = g; circle(c, x, y, r * 0.5); c.fill();
  c.strokeStyle = '#4b4f55'; c.lineWidth = 0.35; circle(c, x, y, r * 0.5); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.5;
  c.beginPath(); c.arc(x, y, r * 0.86, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
}
function drawHay(c, o) {
  const { x, y, r } = o;
  shadow(c, x, y, r);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r);
  g.addColorStop(0, '#f6dc8a'); g.addColorStop(0.6, '#dcb04f'); g.addColorStop(1, '#a87b26');
  c.fillStyle = g; circle(c, x, y, r); c.fill();
  c.strokeStyle = 'rgba(120,80,15,0.5)'; c.lineWidth = 0.35;
  c.beginPath();
  for (let a = 0; a < TAU * 3.2; a += 0.2) { const rr = (a / (TAU * 3.2)) * r * 0.92; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.stroke();
  c.strokeStyle = 'rgba(255,240,180,0.6)'; c.lineWidth = 0.25;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); c.lineTo(x + Math.cos(a + 0.12) * r * 1.12, y + Math.sin(a + 0.12) * r * 1.12); c.stroke();
  }
  c.strokeStyle = '#7a4a12'; c.lineWidth = 0.45; circle(c, x, y, r * 0.98); c.stroke();
}
function drawRock(c, o) {
  shadow(c, o.x, o.y, o.r);
  c.save(); c.translate(o.x, o.y);
  const g = c.createRadialGradient(-o.r * 0.3, -o.r * 0.3, o.r * 0.1, 0, 0, o.r);
  g.addColorStop(0, '#d0d0d0'); g.addColorStop(1, '#5f6266');
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2, r = o.r * (0.82 + 0.18 * Math.sin(i * 2.3));
    i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath(); c.fillStyle = g; c.fill();
  c.strokeStyle = '#3b3e42'; c.lineWidth = 0.3; c.stroke();
  c.restore();
}
function drawTree(c, o) {
  const { x, y, r } = o;
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(x + r * 0.35, y + r * 0.45, r * 1.05, r * 0.9, 0, 0, TAU); c.fill();
  const blobs = [[0, 0, 1], [-0.45, -0.25, 0.62], [0.42, -0.3, 0.6], [0.35, 0.4, 0.58], [-0.4, 0.38, 0.55]];
  for (const [bx, by, br] of blobs) {
    const g = c.createRadialGradient(x + (bx - 0.25) * r, y + (by - 0.3) * r, 0, x + bx * r, y + by * r, br * r);
    g.addColorStop(0, '#5cb85c'); g.addColorStop(1, '#215e26');
    c.fillStyle = g; circle(c, x + bx * r, y + by * r, br * r); c.fill();
  }
  c.fillStyle = 'rgba(200,255,170,0.18)'; circle(c, x - r * 0.3, y - r * 0.35, r * 0.3); c.fill();
}
function drawBush(c, x, y, r, rng) {
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 0.6, y + 1, r, r * 0.8, 0, 0, TAU); c.fill();
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU, d = rng() * r * 0.4, br = r * (0.5 + rng() * 0.3);
    c.fillStyle = i % 2 ? '#2e7d32' : '#388e3c'; circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, br); c.fill();
  }
  c.fillStyle = 'rgba(190,255,160,0.15)'; circle(c, x - r * 0.25, y - r * 0.3, r * 0.3); c.fill();
}
function drawMolehill(c, o) {
  shadow(c, o.x, o.y, o.r * 1.1, o.r * 0.8);
  const g = c.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.05, o.x, o.y, o.r * 1.1);
  g.addColorStop(0, '#a77a4f'); g.addColorStop(0.55, '#7a5230'); g.addColorStop(1, '#4e3018');
  c.fillStyle = g; c.beginPath(); c.ellipse(o.x, o.y, o.r * 1.1, o.r, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(40,20,5,0.3)';
  for (let i = 0; i < 6; i++) { circle(c, o.x + Math.sin(i * 1.9) * o.r * 0.6, o.y + Math.cos(i * 2.7) * o.r * 0.5, o.r * 0.1); c.fill(); }
  c.fillStyle = '#1a0d00'; c.beginPath(); c.ellipse(o.x, o.y - o.r * 0.2, o.r * 0.3, o.r * 0.22, 0, 0, TAU); c.fill();
}
function drawLog(c, o, isRail) {
  const [ax, ay] = o.a, [bx, by] = o.b, len = Math.hypot(bx - ax, by - ay);
  c.save();
  c.translate(ax, ay); c.rotate(Math.atan2(by - ay, bx - ax));
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); rrect(c, -o.r + 0.5, -o.r + 1, len + o.r * 2, o.r * 2, o.r); c.fill();
  const g = c.createLinearGradient(0, -o.r, 0, o.r);
  if (isRail) { g.addColorStop(0, '#d9a066'); g.addColorStop(1, '#8a5527'); }
  else { g.addColorStop(0, '#c8783a'); g.addColorStop(0.45, '#a0522d'); g.addColorStop(1, '#6b3318'); }
  c.fillStyle = g; c.beginPath(); rrect(c, -o.r, -o.r, len + o.r * 2, o.r * 2, o.r); c.fill();
  if (!isRail) {
    c.strokeStyle = 'rgba(70,30,10,0.4)'; c.lineWidth = 0.25;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(len * 0.1 * i, -o.r * 0.4); c.lineTo(len * 0.1 * i + len * 0.25, -o.r * 0.35); c.stroke(); }
    c.fillStyle = '#e0b48a'; circle(c, len, 0, o.r * 0.9); c.fill();
    c.strokeStyle = 'rgba(110,60,25,0.6)'; c.lineWidth = 0.2; circle(c, len, 0, o.r * 0.5); c.stroke();
  }
  c.restore();
}
function drawBumper(c, o) {
  const { x, y, r } = o;
  shadow(c, x, y, r);
  if (o.flash > 0) {
    c.fillStyle = `rgba(255,230,109,${0.35 * o.flash})`; circle(c, x, y, r + 2.5 * o.flash); c.fill();
  }
  c.lineWidth = r * 0.42;
  for (let i = 0; i < 8; i++) {
    c.strokeStyle = i % 2 ? '#ffffff' : '#e63946';
    c.beginPath(); c.arc(x, y, r * 0.78, (i / 8) * TAU, ((i + 1) / 8) * TAU); c.stroke();
  }
  const g = c.createRadialGradient(x - r * 0.15, y - r * 0.2, 0, x, y, r * 0.58);
  g.addColorStop(0, o.flash > 0 ? '#fff3b0' : '#ff7b7b'); g.addColorStop(1, '#9a1b26');
  c.fillStyle = g; circle(c, x, y, r * 0.56); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.55)'; circle(c, x - r * 0.18, y - r * 0.2, r * 0.14); c.fill();
  c.strokeStyle = '#7a1520'; c.lineWidth = 0.35; circle(c, x, y, r); c.stroke();
}
function drawSpinner(c, o) {
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = o.r * 2;
  for (const p of o.pts) { c.beginPath(); c.moveTo(o.x + 0.6, o.y + 1); c.lineTo(p.x + 0.6, p.y + 1); c.stroke(); }
  for (const p of o.pts) {
    c.strokeStyle = '#d62828'; c.lineWidth = o.r * 2;
    c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(p.x, p.y); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = o.r * 1.4; c.lineCap = 'butt'; c.setLineDash([1.6, 1.6]);
    c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(p.x, p.y); c.stroke();
    c.setLineDash([]); c.lineCap = 'round';
  }
  const g = c.createRadialGradient(o.x - 0.8, o.y - 0.8, 0, o.x, o.y, 2.6);
  g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#6b7078');
  c.fillStyle = g; circle(c, o.x, o.y, 2.6); c.fill();
  c.strokeStyle = '#3d4248'; c.lineWidth = 0.3; c.stroke();
}
function drawSlider(c, o) {
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = o.r * 2;
  c.beginPath(); c.moveTo(o.x1 + 0.5, o.y + 1); c.lineTo(o.x2 + 0.5, o.y + 1); c.stroke();
  c.strokeStyle = '#ffc300'; c.beginPath(); c.moveTo(o.x1, o.y); c.lineTo(o.x2, o.y); c.stroke();
  c.save();
  c.beginPath(); c.moveTo(o.x1, o.y); c.lineTo(o.x2, o.y);
  c.strokeStyle = '#1d1d1d'; c.lineWidth = o.r * 1.6; c.lineCap = 'butt'; c.setLineDash([1.4, 1.4]); c.lineDashOffset = -o.x1;
  c.stroke(); c.restore();
  for (const x of [o.x1, o.x2]) { c.fillStyle = '#3d4248'; circle(c, x, o.y, o.r * 1.05); c.fill(); c.fillStyle = '#9aa0a8'; circle(c, x - 0.3, o.y - 0.3, o.r * 0.45); c.fill(); }
}

// ═══════════════════════════════════════════════════════
//  KRESLENÍ – každý snímek
// ═══════════════════════════════════════════════════════
function render() {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(staticCv, 0, 0);
  if (!hole) return;
  c.setTransform(view.k, 0, 0, view.k, view.ox, view.oy);

  // animované zóny
  c.save(); c.clip(hole.path);
  for (const z of hole.zones) {
    if (z.t === 'water') {
      c.save(); c.clip(z.path);
      const bx = z.shape === 'ellipse' ? z.x - z.rx : z.x, by = z.shape === 'ellipse' ? z.y - z.ry : z.y;
      const bw = z.shape === 'ellipse' ? z.rx * 2 : z.w, bh = z.shape === 'ellipse' ? z.ry * 2 : z.h;
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.35;
      const rows = Math.max(2, Math.round(bh / 4));
      for (let i = 0; i < rows; i++) {
        const y = by + ((i + 0.5) * bh) / rows, x = bx + ((tick * 0.06 + i * 37) % (bw + 10)) - 5;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 1.5, y - 0.7, x + 3, y); c.quadraticCurveTo(x + 4.5, y + 0.7, x + 6, y); c.stroke();
      }
      c.restore();
    } else if (z.t === 'boost') {
      c.save(); c.clip(z.path);
      const cx = z.x + z.w / 2, cy = z.y + z.h / 2, vertical = z.dir[1] !== 0, L = vertical ? z.h : z.w;
      c.translate(cx, cy); c.rotate(Math.atan2(z.dir[1], z.dir[0]) + Math.PI / 2);
      c.strokeStyle = '#ffd34d'; c.lineWidth = 1.1; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        const t = ((tick * 0.35 + (k * L) / 3) % L), y = L / 2 - t;
        c.globalAlpha = 0.25 + 0.75 * Math.sin((t / L) * Math.PI);
        c.beginPath(); c.moveTo(-3.5, y + 2.4); c.lineTo(0, y); c.lineTo(3.5, y + 2.4); c.stroke();
      }
      c.restore();
    }
  }
  for (const r of ripples) {
    c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r.t / 50)})`; c.lineWidth = 0.4;
    circle(c, r.x, r.y, 1 + r.t * 0.18); c.stroke();
    circle(c, r.x, r.y, Math.max(0.1, r.t * 0.1)); c.stroke();
  }
  c.restore();

  drawCup(c);
  for (const o of hole.obs) if (o.t === 'slider' || o.t === 'bumper') drawObstacle(c, o);
  drawTrail(c);
  drawAim(c);
  drawBall(c);
  for (const o of hole.obs) if (o.t === 'spinner') drawSpinner(c, o);
  drawFlag(c);
  for (const p of particles) {
    c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.col;
    if (p.sq) { c.save(); c.translate(p.x, p.y); c.rotate(p.rot + p.life * 6); c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); c.restore(); }
    else { circle(c, p.x, p.y, p.r * (0.4 + p.life * 0.6)); c.fill(); }
  }
  c.globalAlpha = 1;
  drawCloudShadows(c);
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (vignette) { c.fillStyle = vignette; c.fillRect(0, 0, canvas.width, canvas.height); }
}

// pomalu plující stíny mraků – hřiště „žije“
const CLOUD = [[0, 0, 16, 9], [12, -4, 12, 8], [-12, 3, 11, 7], [5, 6, 13, 7]];
function drawCloudShadows(c) {
  c.fillStyle = 'rgba(0,25,0,0.08)';
  for (let i = 0; i < 3; i++) {
    const x = ((tick * 0.025 + i * 75) % 230) - 65, y = 25 + i * 52 + Math.sin(i * 2.1) * 10;
    c.beginPath();
    for (const [dx, dy, rx, ry] of CLOUD) { c.moveTo(x + dx + rx, y + dy); c.ellipse(x + dx, y + dy, rx, ry, 0, 0, TAU); }
    c.fill();
  }
}
function sparkle(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}

function drawCup(c) {
  const { x, y } = cup;
  c.fillStyle = 'rgba(255,255,255,0.10)'; circle(c, x, y, CUP_R + 2.4); c.fill();
  const g = c.createRadialGradient(x + 0.8, y + 1, CUP_R * 0.1, x, y, CUP_R);
  g.addColorStop(0, '#000'); g.addColorStop(0.7, '#0c0c0c'); g.addColorStop(1, '#2b2b2b');
  c.fillStyle = g; circle(c, x, y, CUP_R); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(x, y, CUP_R, Math.PI * 1.1, Math.PI * 1.9); c.arc(x + 0.4, y + 0.9, CUP_R * 0.9, Math.PI * 1.9, Math.PI * 1.1, true); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.5; circle(c, x, y, CUP_R); c.stroke();
  for (let k = 0; k < 4; k++) {                    // zlaté jiskry kolem jamky
    const a = tick * 0.015 + (k * TAU) / 4, rr = CUP_R + 3.4 + Math.sin(tick * 0.05 + k) * 0.8;
    const t = (Math.sin(tick * 0.11 + k * 1.7) + 1) / 2;
    c.fillStyle = `rgba(255,214,90,${0.2 + 0.65 * t})`;
    sparkle(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.5 + t * 0.9);
  }
}
function drawFlag(c) {
  const { x, y } = cup, ph = 15, w = 9, h = 6, t = tick * 0.08;
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 7, y + 4); c.stroke();
  c.strokeStyle = '#f2f2f2'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - ph); c.stroke();
  c.beginPath(); c.moveTo(x, y - ph);
  for (let i = 0; i <= 10; i++) { const u = i / 10; c.lineTo(x + u * w, y - ph + Math.sin(t + u * 3) * u * 1.1); }
  for (let i = 10; i >= 0; i--) { const u = i / 10; c.lineTo(x + u * w, y - ph + h - u * 0.8 + Math.sin(t + u * 3) * u * 1.1); }
  c.closePath();
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#0d0d0d'); g.addColorStop(1, '#3a3a3a');
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#8fd11a'; c.lineWidth = 0.35; c.stroke();
  c.fillStyle = '#c4f25a'; c.font = '900 4px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(holeIdx + 1), x + w * 0.45, y - ph + h / 2 - 0.3 + Math.sin(t + 1.35) * 0.5);
  c.fillStyle = '#ffffff'; circle(c, x, y - ph, 0.85); c.fill();
  c.strokeStyle = '#111'; c.lineWidth = 0.25; c.stroke();
}
function drawTrail(c) {
  if (trail.length < 2) return;
  c.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const k = i / trail.length;
    c.strokeStyle = `rgba(255,255,255,${0.28 * k})`; c.lineWidth = BALL_R * 1.4 * k;
    c.beginPath(); c.moveTo(trail[i - 1].x, trail[i - 1].y); c.lineTo(trail[i].x, trail[i].y); c.stroke();
  }
}
function pentagon(c, x, y, r, rot) {
  c.beginPath();
  for (let i = 0; i < 5; i++) { const a = rot + (i * TAU) / 5; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill();
}
function drawBall(c) {
  if (!ball.visible) return;
  const r = BALL_R * ball.scale, { x, y } = ball;
  c.fillStyle = `rgba(0,0,0,${0.3 * ball.scale})`; c.beginPath(); c.ellipse(x + 0.9, y + 1.3, r, r * 0.85, 0, 0, TAU); c.fill();
  c.save();
  c.translate(x, y); circle(c, 0, 0, r); c.clip();
  c.rotate(ball.rot);
  if (ballImg.ok) c.drawImage(ballImg, -r, -r, r * 2, r * 2);
  else {
    c.fillStyle = '#fafafa'; c.fillRect(-r, -r, r * 2, r * 2);
    c.fillStyle = '#1b1f24'; pentagon(c, 0, 0, r * 0.38, -Math.PI / 2);
    c.strokeStyle = '#1b1f24'; c.lineWidth = r * 0.08;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5, b = a + TAU / 10;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38); c.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); c.stroke();
      pentagon(c, Math.cos(b) * r * 1.02, Math.sin(b) * r * 1.02, r * 0.36, b + Math.PI);
    }
  }
  c.rotate(-ball.rot);
  const g = c.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.25; circle(c, x, y, r); c.stroke();
}
function drawAim(c) {
  if (state !== 'play' || ballMoving()) return;
  const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle);
  if (holding) {
    const col = `hsl(${Math.round(120 - power * 120)},95%,58%)`, L = 8 + power * 46;
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.8; circle(c, ball.x, ball.y, BALL_R + 1.8); c.stroke();
    c.strokeStyle = col; c.beginPath(); c.arc(ball.x, ball.y, BALL_R + 1.8, -Math.PI / 2, -Math.PI / 2 + TAU * power); c.stroke();
    c.fillStyle = col;
    for (let d = BALL_R + 2.6; d < L; d += 3.2) { c.globalAlpha = 1 - (d / L) * 0.6; circle(c, ball.x + dx * d, ball.y + dy * d, 0.75); c.fill(); }
    c.globalAlpha = 1;
    const ex = ball.x + dx * (L + 1), ey = ball.y + dy * (L + 1), px = -dy, py = dx;
    c.beginPath(); c.moveTo(ex + dx * 2.4, ey + dy * 2.4); c.lineTo(ex + px * 1.9, ey + py * 1.9); c.lineTo(ex - px * 1.9, ey - py * 1.9); c.closePath(); c.fill();
  } else {
    const p = (Math.sin(tick * 0.08) + 1) / 2;
    c.strokeStyle = `rgba(255,255,255,${0.25 + 0.35 * p})`; c.lineWidth = 0.45;
    circle(c, ball.x, ball.y, BALL_R + 1.5 + p * 1.2); c.stroke();
    const tx = cup.x - ball.x, ty = cup.y - ball.y, d = Math.hypot(tx, ty);
    if (d > 12) {
      c.strokeStyle = 'rgba(255,255,255,0.3)'; c.setLineDash([1.2, 1.6]); c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(ball.x + (tx / d) * 6, ball.y + (ty / d) * 6); c.lineTo(ball.x + (tx / d) * 16, ball.y + (ty / d) * 16); c.stroke();
      c.setLineDash([]);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  UI (DOM)
// ═══════════════════════════════════════════════════════
const hud = { hole: $('#st-hole'), par: $('#st-par'), str: $('#st-str'), score: $('#st-score') };
const powerFill = $('#powerbar-fill'), hintEl = $('#hint');
let lastPowerPct = -1;

function updateHUD() {
  hud.hole.textContent = holeIdx + 1;
  hud.par.textContent = hole ? hole.par : '-';
  hud.str.textContent = strokes;
  hud.str.className = hole && strokes >= strokeLimit(hole) - 1 ? 'warn' : '';
  const d = totalDiff();
  hud.score.textContent = fmtDiff(d);
  hud.score.className = d < 0 ? 'good' : d > 0 ? 'bad' : '';
}
function setPower(p) {
  const pct = Math.round(p * 100);
  if (pct === lastPowerPct) return;
  lastPowerPct = pct;
  powerFill.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  if (holding) hintEl.textContent = `Síla ${pct} % – pusť!`;
}
function setHint() {
  if (state !== 'play') { hintEl.textContent = ''; return; }
  if (ballMoving()) { hintEl.textContent = 'Míč se kutálí…'; return; }
  const left = strokeLimit(hole) - strokes;
  hintEl.textContent = left <= 2
    ? `Pozor – zbývá ${left} ${strokesWord(left)} do limitu`
    : 'Drž prst a miř → síla se mění → pusť ve správný moment!';
}
let bannerTimer = 0;
function showBanner() {
  const el = $('#banner');
  el.innerHTML = `<small>JAMKA ${holeIdx + 1}/${HOLES.length}</small><b>${esc(hole.name)}</b><span>PAR ${hole.par}</span>`;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function showToast(main, sub, color) {
  const el = $('#toast');
  el.innerHTML = `<div class="t-main" style="color:${color}">${esc(main)}</div>${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// ── mince ────────────────────────────────────────────
function coinsWord(n) { const f = cfg.currency.forms; return Array.isArray(f) && f.length === 3 ? plural(n, f[0], f[1], f[2]) : cfg.currency.name; }
function coinHtml(cls = '') {
  const img = cfg.currency.image;
  return img ? `<img class="coin ${cls}" src="${esc(img)}" alt="${esc(cfg.currency.name)}">` : `<span class="coin ${cls}">${esc(cfg.currency.icon)}</span>`;
}
const amountHtml = (n) => `<b class="amt">+${num(n)} ${coinHtml()}</b>`;
function rewardRowsHtml(items) {
  return items.map((i) => `<div class="rrow"><span>${esc(i.label)}</span>${amountHtml(i.amount)}</div>`).join('');
}
function coinSkyHtml(n) {
  if (!cfg.currency.image) return '';
  let h = '<div class="coin-sky" aria-hidden="true">';
  for (let i = 0; i < n; i++) {
    const x = (i * 37 + 7) % 96, d = 9 + (i % 4) * 3, w = 20 + ((i * 13) % 26), del = -((i * 2.3) % 12);
    h += `<img src="${esc(cfg.currency.image)}" alt="" style="left:${x}%;width:${w}px;animation-duration:${d}s;animation-delay:${del}s">`;
  }
  return h + '</div>';
}
// mince vyletí z místa na obrazovce (souřadnice v návrhovém prostoru)
function floatReward(x, y, amount) {
  const el = document.createElement('div');
  el.className = 'float-reward';
  el.style.left = (offX + x * scale) + 'px';
  el.style.top = (offY + y * scale) + 'px';
  el.innerHTML = `+${num(amount)} ${coinHtml()}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
function coinBurst(count) {
  if (!cfg.currency.image) return;
  const box = document.createElement('div');
  box.className = 'coin-burst';
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, d = 90 + Math.random() * 120;
    const im = document.createElement('img');
    im.src = cfg.currency.image; im.alt = '';
    im.style.setProperty('--tx', `${Math.cos(a) * d}px`);
    im.style.setProperty('--ty', `${Math.sin(a) * d}px`);
    im.style.animationDelay = `${i * 35}ms`;
    box.appendChild(im);
  }
  wrap.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}
function brandHeroHtml() {
  const logo = cfg.brand.logo;
  return logo ? `<div class="brand-hero" style="--logo-mask:url('${esc(logo)}')"><img src="${esc(logo)}" alt="${esc(cfg.brand.name)}"></div>` : '';
}

function renderMenu() {
  const R = cfg.rewards;
  const best = store.get('fotbalgolf_best_v2');
  const teaser = [
    ['Dohraj všech ' + HOLES.length + ' jamek', R.completion],
    [`Zahraj pod PAR (méně než ${TOTAL_PAR} úderů)`, R.underPar],
    ['Navíc za každý úder pod PAR', R.perStrokeUnderPar],
    ['Hole-in-one (jamka na 1 úder)', R.holeInOne],
  ].filter(([, a]) => num(a) > 0);
  const note = cfg.rewardNotice ? esc(cfg.rewardNotice)
    : !appConnected ? `Mince se připisují, když hraješ v ${esc(cfg.appName)}.` : '';
  const rewardsHtml = cfg.rewardsEnabled && teaser.length ? `
    <div class="card rewards${appConnected ? '' : ' offline'}">
      <div class="card-title">${coinHtml('spin')} Získej ${esc(coinsWord(2))}</div>
      ${teaser.map(([l, a]) => `<div class="rrow"><span>${esc(l)}</span>${amountHtml(a)}</div>`).join('')}
      ${note ? `<div class="rnote">${note}</div>` : ''}
    </div>` : '';
  overlay.innerHTML = `
    ${coinSkyHtml(9)}
    <div class="panel">
      ${brandHeroHtml()}
      <h1>MINI<br>FOTBALGOLF</h1>
      <div class="sub">${esc(String(cfg.brand.name || '').toLocaleUpperCase('cs'))}</div>
      ${cfg.playerName ? `<div class="hello">Ahoj, ${esc(cfg.playerName)}! 👋</div>` : ''}
      <div class="card howto">
        <div>👆 <b>Drž prst</b> a miř – síla se sama mění</div>
        <div>🎯 <b>Pusť</b> ve správný moment</div>
        <div>⛳ ${HOLES.length} jamek · celkový <b>PAR ${TOTAL_PAR}</b></div>
        <div>💦 Voda = <b>+1 trestný úder</b></div>
      </div>
      ${rewardsHtml}
      ${best ? `<div class="best">Tvůj rekord: <b>${num(best.strokes)}</b> ${strokesWord(num(best.strokes))} (${fmtDiff(num(best.diff))})</div>` : ''}
      <button class="btn" id="btn-start">HRÁT!</button>
      <div class="site">${esc(cfg.website)}</div>
    </div>`;
  overlay.classList.remove('hidden');
  $('#btn-start').addEventListener('click', startGame);
}

function verdictFor(diff) {
  if (diff <= -4) return { t: '🏆 Profík!', c: '#f2c230' };
  if (diff < 0) return { t: '⭐ Pod PAR!', c: '#8fd11a' };
  if (diff === 0) return { t: '✅ Přesně PAR', c: '#ffffff' };
  if (diff <= 4) return { t: '👍 Dobrá hra!', c: '#d8e6cf' };
  return { t: '😄 Příště lépe!', c: '#ff9f6b' };
}

function showEnd(res, isRecord) {
  const v = verdictFor(res.scoreToPar);
  const scoreColor = res.scoreToPar < 0 ? '#8fd11a' : res.scoreToPar > 0 ? '#ff6b5b' : '#ffffff';
  const cells = (fn) => res.holes.map(fn).join('');
  const card = `
    <div class="scorecard">
      <div class="lbl">Jamka</div>${cells((s) => `<div class="h">${s.hole}</div>`)}<div class="h">Σ</div>
      <div class="lbl">Par</div>${cells((s) => `<div class="h">${s.par}</div>`)}<div class="h">${res.totalPar}</div>
      <div class="lbl">Ty</div>${cells((s) => `<div class="c ${s.holeInOne ? 'hio' : s.strokes < s.par ? 'under' : s.strokes > s.par ? 'over' : ''}">${s.strokes}</div>`)}<div class="sum">${res.totalStrokes}</div>
    </div>`;
  const R = res.rewards;
  const rewardsHtml = cfg.rewardsEnabled && R.total > 0 ? `
    <div class="card rewards${appConnected ? '' : ' offline'}">
      <div class="reward-hero">${coinHtml('spin')}<div><small>ZÍSKÁVÁŠ</small><b>+${R.total}</b><span>${esc(coinsWord(R.total))}</span></div></div>
      ${rewardRowsHtml(R.items)}
      <div id="reward-status"></div>
    </div>` : cfg.rewardNotice ? `<div class="rnote">${esc(cfg.rewardNotice)}</div>`
    : cfg.rewardsEnabled && num(cfg.rewards.underPar) > 0
      ? `<div class="rnote">Tentokrát bez mincí – zahraj pod PAR (méně než ${res.totalPar} úderů) a získej +${num(cfg.rewards.underPar)} ${coinHtml()}</div>` : '';

  overlay.innerHTML = `
    <div class="panel">
      <div class="verdict" style="color:${v.c}">${v.t}</div>
      <div class="bigscore" style="color:${scoreColor}">${fmtDiff(res.scoreToPar)}</div>
      <div class="bigsub">${res.totalStrokes} ${strokesWord(res.totalStrokes)} · PAR ${res.totalPar}${res.holesInOne ? ` · 🎯 ${res.holesInOne}× hole-in-one` : ''}</div>
      ${isRecord ? '<div class="record">🎉 Nový osobní rekord!</div>' : ''}
      <div class="card">${card}</div>
      ${rewardsHtml}
      <div class="actions">
        <button class="btn" id="btn-again">HRÁT ZNOVU</button>
        <button class="btn btn-ghost" id="btn-share">📸 SDÍLET</button>
      </div>
      ${appConnected && cfg.showCloseButton ? '<button class="link-btn" id="btn-back">Zpět do aplikace</button>' : ''}
      <div class="site">${esc(cfg.website)}</div>
    </div>`;
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-share').addEventListener('click', doShare);
  const back = $('#btn-back');
  if (back) back.addEventListener('click', () => Bridge.send('close', { state }));
  renderRewardStatus();
  if (R.total > 0) { coinBurst(Math.min(24, 8 + R.total * 4)); Sound.coin(); }
  setPower(0); setHint();
}

// ═══════════════════════════════════════════════════════
//  SDÍLENÍ – obrázek 1080×1080
// ═══════════════════════════════════════════════════════
async function createShareImage(res) {
  try { await document.fonts.ready; } catch (e) { /* bez fontů */ }
  await Promise.all([imgDone(logoImg), imgDone(coinImg)]);
  const S = 1080, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const BB = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", NU = "'Nunito', system-ui, sans-serif";
  const LIME = '#8fd11a', GOLD = '#f2c230';

  const bg = c.createRadialGradient(S / 2, 0, 50, S / 2, S * 0.4, S * 0.95);
  bg.addColorStop(0, '#20361a'); bg.addColorStop(1, '#070b06');
  c.fillStyle = bg; c.fillRect(0, 0, S, S);
  c.save(); c.globalAlpha = 0.05; c.fillStyle = LIME; c.translate(S / 2, S / 2); c.rotate(-Math.PI / 8);
  for (let x = -S; x < S; x += 90) c.fillRect(x, -S, 45, S * 2);
  c.restore();
  const fr = c.createLinearGradient(0, 0, S, S);
  fr.addColorStop(0, '#c4f25a'); fr.addColorStop(0.5, LIME); fr.addColorStop(1, '#4a7a08');
  c.strokeStyle = fr; c.lineWidth = 12; c.beginPath(); rrect(c, 30, 30, S - 60, S - 60, 44); c.stroke();

  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (logoImg.ok) {
    const lw = 300, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
    c.save(); c.shadowColor = 'rgba(143,209,26,0.45)'; c.shadowBlur = 30;
    c.drawImage(logoImg, S / 2 - lw / 2, 62, lw, lh); c.restore();
  }
  c.fillStyle = LIME; c.font = `56px ${BB}`; c.fillText('MINI FOTBALGOLF', S / 2, 300);

  const v = verdictFor(res.scoreToPar);
  c.font = `60px ${BB}`; c.fillStyle = v.c; c.fillText(v.t, S / 2, 368);

  const scoreColor = res.scoreToPar < 0 ? LIME : res.scoreToPar > 0 ? '#ff6b5b' : '#ffffff';
  const glow = c.createRadialGradient(S / 2, 520, 0, S / 2, 520, 200);
  glow.addColorStop(0, 'rgba(143,209,26,0.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(S / 2, 520, 200, 0, TAU); c.fill();
  c.font = `240px ${BB}`; c.fillStyle = scoreColor; c.shadowColor = scoreColor; c.shadowBlur = 40;
  c.fillText(fmtDiff(res.scoreToPar), S / 2, 610);
  c.shadowBlur = 0;
  c.font = `800 26px ${NU}`; c.fillStyle = 'rgba(238,246,230,0.55)'; c.fillText('SKÓRE VŮČI PAR', S / 2, 652);

  const earned = res.rewards && res.rewards.total > 0 && coinImg.ok;
  const stats = [['ÚDERŮ', res.totalStrokes], ['PAR', res.totalPar], earned ? ['ZÍSKÁNO', '+' + res.rewards.total] : ['JAMEK', res.holes.length]];
  const bw = 250, bh = 110, gap = 30, bx0 = (S - (stats.length * (bw + gap) - gap)) / 2;
  stats.forEach(([l, val], i) => {
    const bx = bx0 + i * (bw + gap), by = 682, coinBox = earned && i === 2;
    c.fillStyle = coinBox ? 'rgba(242,194,48,0.14)' : 'rgba(143,209,26,0.10)'; c.beginPath(); rrect(c, bx, by, bw, bh, 18); c.fill();
    c.strokeStyle = coinBox ? 'rgba(242,194,48,0.55)' : 'rgba(143,209,26,0.3)'; c.lineWidth = 2; c.stroke();
    c.font = `800 20px ${NU}`; c.fillStyle = 'rgba(238,246,230,0.5)'; c.fillText(l, bx + bw / 2, by + 34);
    c.font = `64px ${BB}`; c.fillStyle = coinBox ? GOLD : '#ffffff';
    if (coinBox) { c.fillText(String(val), bx + bw / 2 - 28, by + 94); c.drawImage(coinImg, bx + bw / 2 + 18, by + 46, 56, 56); }
    else c.fillText(String(val), bx + bw / 2, by + 94);
  });

  const n = res.holes.length, cw = 86, cx0 = S / 2 - ((n - 1) * cw) / 2;
  res.holes.forEach((s, i) => {
    const x = cx0 + i * cw, y = 860;
    c.fillStyle = s.holeInOne ? GOLD : s.strokes < s.par ? LIME : s.strokes > s.par ? '#ff8a7a' : 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(x, y, 31, 0, TAU); c.fill();
    c.fillStyle = '#0a1206'; c.font = `46px ${BB}`; c.fillText(String(s.strokes), x, y + 16);
  });

  c.font = `800 32px ${NU}`; c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fillText(`Dokážeš to líp? Zahraj si v aplikaci ${cfg.brand.name}! 🏆`, S / 2, 955);
  c.font = `700 22px ${NU}`; c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillText([cfg.website, new Date(res.finishedAt).toLocaleDateString('cs-CZ')].filter(Boolean).join('  ·  '), S / 2, 1005);
  return cv;
}

async function doShare() {
  if (!lastResult) return;
  const btn = $('#btn-share');
  const done = () => { if (btn) { btn.textContent = '📸 SDÍLET'; btn.disabled = false; } };
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const res = lastResult;
    const cv = await createShareImage(res);
    const text = `⚽ ${cfg.brand.name} · Mini Fotbalgolf – moje skóre ${fmtDiff(res.scoreToPar)} (${res.totalStrokes} ${strokesWord(res.totalStrokes)}, PAR ${res.totalPar}). Dokážeš to líp?${cfg.website ? ' https://' + cfg.website : ''}`;
    const blob = await new Promise((r) => { try { cv.toBlob(r, 'image/png'); } catch (e) { r(null); } });
    let file = null;
    try { file = blob ? new File([blob], 'fotbalgolf-vysledek.png', { type: 'image/png' }) : null; } catch (e) { file = null; }

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${cfg.brand.name} – Mini Fotbalgolf`, text });
        Bridge.send('share', { method: 'native', text });
        done(); return;
      } catch (e) { if (e && e.name === 'AbortError') { done(); return; } }
    }
    if (appConnected) {                         // ve WebView sdílení obvykle nefunguje → necháme to na aplikaci
      Bridge.send('share', { method: 'app', text, imageDataUrl: cv.toDataURL('image/png') });
      done(); return;
    }
    const a = document.createElement('a');
    a.href = blob ? URL.createObjectURL(blob) : cv.toDataURL('image/png');
    a.download = 'fotbalgolf-vysledek.png';
    document.body.appendChild(a); a.click(); a.remove();
    Bridge.send('share', { method: 'download', text });
  } catch (e) { /* sdílení selhalo – nic se neděje */ }
  done();
}

// ═══════════════════════════════════════════════════════
//  OVLÁDÁNÍ (pointer events = myš i dotyk)
// ═══════════════════════════════════════════════════════
function toDesign(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale };
}
function aimAt(p) {
  const dx = p.x - ball.x, dy = p.y - ball.y;
  if (Math.hypot(dx, dy) > BALL_R * 1.2) aimAngle = Math.atan2(dy, dx);
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  Sound.init();
  if (state !== 'play' || ballMoving()) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  aimAt(toDesign(e));
  holding = true; power = 0; powerDir = 1;
  setPower(0);
});
canvas.addEventListener('pointermove', (e) => { if (holding) { e.preventDefault(); aimAt(toDesign(e)); } });
function release(e, cancel) {
  if (!holding) return;
  e.preventDefault();
  holding = false;
  if (cancel || state !== 'play' || ballMoving() || power < 0.03) { power = 0; setPower(0); setHint(); return; }
  shoot();
}
canvas.addEventListener('pointerup', (e) => release(e, false));
canvas.addEventListener('pointercancel', (e) => release(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function syncCloseButton() {
  $('#btn-close').hidden = !cfg.showCloseButton;
  $('#topbar').classList.toggle('has-close', !!cfg.showCloseButton);
}
const soundBtn = $('#btn-sound');
function refreshSoundBtn() { soundBtn.textContent = Sound.muted ? '🔇' : '🔊'; }
soundBtn.addEventListener('click', () => { Sound.muted = !Sound.muted; store.set('fotbalgolf_muted', Sound.muted); Sound.init(); refreshSoundBtn(); });
$('#btn-close').addEventListener('click', () => Bridge.send('close', { state, hole: holeIdx + 1 }));

// ═══════════════════════════════════════════════════════
//  SMYČKA
// ═══════════════════════════════════════════════════════
let lastT = performance.now(), acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  let dt = t - lastT; lastT = t;
  if (dt > 100) dt = 100;
  acc += dt;
  let n = 0;
  while (acc >= STEP_MS && n < 6) { update(); acc -= STEP_MS; n++; }
  if (n === 6) acc = 0;
  if (state === 'play' && !holding && n > 0) {
    const moving = ballMoving();
    if (moving !== frame.wasMoving) { frame.wasMoving = moving; setHint(); }
  }
  render();
}
document.addEventListener('visibilitychange', () => { lastT = performance.now(); if (document.hidden) holding = false; });

// iframe – rodičovská stránka může podle výšky zvětšit iframe
function tellParentHeight() {
  try { if (window.parent !== window) window.parent.postMessage({ type: 'fotbalgolf-height', height: window.innerHeight }, cfg.targetOrigin || '*'); } catch (e) { /* ignore */ }
}

// ═══════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════
appConnected = cfg.app || Bridge.native();
syncCloseButton();
refreshSoundBtn();
loadBallImage(cfg.ballImage);
loadBrandImages();
loadHole(0);
resize();
window.addEventListener('resize', () => { resize(); tellParentHeight(); });
renderMenu();
tellParentHeight();
requestAnimationFrame(frame);
Bridge.send('ready', { totalPar: TOTAL_PAR, holes: HOLES.map((h, i) => ({ hole: i + 1, name: h.name, par: h.par })), rewards: cfg.rewards });

// vývojářský přístup pro testy
window.Fotbalgolf._dev = {
  ball, cup: () => cup, get state() { return state; }, get scores() { return scores; }, get strokes() { return strokes; },
  get holeIdx() { return holeIdx; }, get hole() { return hole; },
  loadHole: (i) => { loadHole(i); state = 'play'; overlay.classList.add('hidden'); },
  shoot: (angle, p) => { aimAngle = angle; power = p; shoot(); },
  step: (n) => { for (let i = 0; i < n; i++) update(); },
  pointInPoly,
};
})();
