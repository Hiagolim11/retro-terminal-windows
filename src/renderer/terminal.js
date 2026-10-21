/* Janela do terminal: abas, sessões (xterm.js + ConPTY), teclado, mouse e loop de renderização CRT. */
'use strict';

const api = window.retro;
const $ = (id) => document.getElementById(id);
const canvas = $('screen');
const wrap = $('screen-wrap');

let S = null;              // estado público vindo do processo principal
let crt = null;            // CRTRenderer (WebGL2) ou null no modo de compatibilidade
let ctx2d = null;
const grid = new TextGrid();
const sessions = [];
let active = -1;
let metrics = { cols: 80, rows: 24, pixelated: false, k: 1, cssW: 1, cssH: 1, outW: 1, outH: 1, virtW: 1, virtH: 1 };
let layoutKey = '';
let textDirty = true;
let finalDirty = true;
let lastTextChange = 0;
let lastBurnUpdate = 0;
let focused = document.hasFocus();
let cursorOn = true;
let blinkTimer = null;
let frameCounter = 0;
let effectTime = 0;
let rnd = { flicker: 1, hsyncScale: 0, hsyncFreq: 4 };
let bloomCleared = false;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hex(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; // /255 (o original divide por 256)
}
const mixC = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const scaleC = (a, s) => a.map(v => clamp(v * s, 0, 1));
const addC = (a, b) => a.map((v, i) => clamp(v + b[i], 0, 1));

const fontOf = (id) => S.fonts.find(f => f.id === id) || S.fonts[0];
const cur = () => sessions[active];

function frameEnabled(p) { return p.ambientLight > 0 || p.frameSize > 0 || p.screenCurvature > 0; }

/** Cores derivadas do perfil (mesmas fórmulas do ApplicationSettings original). */
function profileColors(p) {
  const font = hex(p.fontColor), bg = hex(p.backgroundColor), frame = hex(p.frameColor);
  const sat = mixC(font, [1, 1, 1], p.saturationColor * 0.5);
  const k = 0.7 + p.contrast * 0.3;
  const fontColor = mixC(bg, sat, k);
  const bgColor = mixC(sat, bg, k);
  const light = mixC(fontColor, bgColor, 0.2);
  const frameColor = mixC(scaleC(light, 0.2), addC(frame, [0.1, 0.1, 0.1]), 0.125 + 0.75 * p.ambientLight);
  return { fontColor, bgColor, frameColor };
}

function markDirty() { textDirty = true; finalDirty = true; }

// ---------------------------------------------------------------------------
// Layout: tamanho da tela, resolução virtual, colunas e linhas
// ---------------------------------------------------------------------------
async function relayout(force) {
  if (!S) return;
  const g = S.general, p = S.profile;
  const font = fontOf(p.fontName);
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, wrap.clientWidth), cssH = Math.max(1, wrap.clientHeight);
  const key = [cssW, cssH, dpr, font.id, p.rasterization, p.fontWidth, p.lineSpacing, p.margin, p.screenRadius,
    g.fontScaling, g.windowScaling, g.burnInQuality, g.bloomQuality].join('|');
  if (!force && key === layoutKey) return;
  layoutKey = key;

  try { await document.fonts.load(`16px "${font.family}"`); } catch { /* fonte do sistema */ }

  const pixelated = font.lowRes && p.rasterization !== 4;
  const devW = cssW * dpr, devH = cssH * dpr;
  let k, sizePx;
  if (pixelated) {
    // altura de célula desejada (~22px de tela por 100% de escala) dividida pelo tamanho base da fonte
    k = Math.max(1, (22 * g.fontScaling * dpr) / font.px);
    sizePx = font.px;
  } else {
    k = 1;
    sizePx = Math.max(6, Math.round(font.px * g.fontScaling * dpr));
  }
  const virtW = Math.max(16, Math.floor(devW / (k * p.fontWidth)));
  const virtH = Math.max(16, Math.floor(devH / k));
  const radiusPx = lerp(4, 120, p.screenRadius) * (frameEnabled(p) ? 1 : 0);
  const marginPx = lerp(1, 40, p.margin) + (1 - Math.SQRT1_2) * radiusPx;
  const margin = Math.round(marginPx * dpr / k);

  const { cols, rows } = grid.layout({ width: virtW, height: virtH, family: font.family, sizePx, lineSpacing: p.lineSpacing, margin, pixelated });

  const outW = Math.max(1, Math.round(devW * g.windowScaling));
  const outH = Math.max(1, Math.round(devH * g.windowScaling));
  canvas.width = outW;
  canvas.height = outH;

  const prev = metrics;
  metrics = { cols, rows, pixelated, k, cssW, cssH, outW, outH, virtW, virtH, dpr };
  if (crt) crt.setSizes(virtW, virtH, pixelated ? 1 : g.burnInQuality, pixelated ? 1 : g.bloomQuality);

  if (cols !== prev.cols || rows !== prev.rows) {
    for (const s of sessions) s.term.resize(cols, rows);
    schedulePtyResize();
    if (g.showTerminalSize) showSizeOverlay(cols, rows);
  }
  markDirty();
}

let ptyResizeTimer = null;
function schedulePtyResize() {
  clearTimeout(ptyResizeTimer);
  ptyResizeTimer = setTimeout(() => {
    for (const s of sessions) if (s.ptyId) api.resize(s.ptyId, metrics.cols, metrics.rows);
  }, 60);
}

let sizeTimer = null;
let firstLayoutDone = false;
function showSizeOverlay(cols, rows) {
  if (!firstLayoutDone) { firstLayoutDone = true; return; }
  const el = $('size-overlay');
  el.textContent = `${cols}x${rows}`;
  el.hidden = false;
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => { el.hidden = true; }, 1000);
}

new ResizeObserver(() => relayout(false)).observe(wrap);
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => relayout(true));

// ---------------------------------------------------------------------------
// Sessões e abas
// ---------------------------------------------------------------------------
function createTerminal() {
  const host = document.createElement('div');
  $('xterm-hosts').appendChild(host);
  const term = new Terminal({
    cols: metrics.cols, rows: metrics.rows,
    scrollback: S.general.scrollback,
    allowProposedApi: true,
    cursorBlink: false,
    fontFamily: 'Consolas, monospace',
    fontSize: 12,
    windowsPty: { backend: 'conpty' },
    rightClickSelectsWord: false,
  });
  term.open(host);
  return { term, host };
}

async function addTab(useLaunch) {
  const { term, host } = createTerminal();
  const s = { term, host, ptyId: null, title: '', closing: false };
  sessions.push(s);

  const ifActive = () => { if (s === cur()) markDirty(); };
  term.onData(d => { if (s.ptyId) api.write(s.ptyId, d); cursorOn = true; });
  term.onBinary(d => { if (s.ptyId) api.write(s.ptyId, d); });
  term.onTitleChange(t => {
    t = String(t || '').trim();
    // Títulos que são só o caminho do executável viram o nome do programa.
    if (/^[a-z]:\\.*\.exe$/i.test(t)) t = t.split('\\').pop().replace(/\.exe$/i, '');
    s.title = t;
    renderTabs();
  });
  term.onWriteParsed(ifActive);
  term.onScroll(ifActive);
  term.onSelectionChange(ifActive);
  term.onCursorMove(ifActive);
  term.attachCustomKeyEventHandler(handleKey);

  switchTo(sessions.length - 1);

  const r = await api.spawn(term.cols, term.rows, !!useLaunch);
  if (!r.id) {
    term.write(`\x1b[1;31m${r.error}\x1b[0m\r\n\r\nVerifique o shell ou o comando personalizado em Configurações > Avançado.\r\n`);
    s.title = 'erro';
    renderTabs();
    return;
  }
  s.ptyId = r.id;
  if (!s.title) s.title = r.file.split(/[\\/]/).pop().replace(/\.exe$/i, '');
  if (term.cols !== metrics.cols || term.rows !== metrics.rows) term.resize(metrics.cols, metrics.rows);
  api.resize(s.ptyId, metrics.cols, metrics.rows);
  renderTabs();
}

function switchTo(i) {
  if (i < 0 || i >= sessions.length) return;
  active = i;
  if (crt) crt.resetBurnIn();
  const s = cur();
  s.term.focus();
  renderTabs();
  markDirty();
}

function closeTab(i) {
  const s = sessions[i];
  if (!s || s.closing) return;
  s.closing = true;
  if (s.ptyId) api.kill(s.ptyId);
  s.term.dispose();
  s.host.remove();
  sessions.splice(i, 1);
  if (!sessions.length) { api.action('closeWindow'); return; }
  let next = active;
  if (i < active) next = active - 1;
  else if (i === active) next = Math.min(i, sessions.length - 1);
  switchTo(next);
}

api.onData((id, data) => {
  const s = sessions.find(x => x.ptyId === id);
  if (s) s.term.write(data);
});
api.onExit((id) => {
  // Como no original: quando o shell termina, a aba fecha.
  const i = sessions.findIndex(x => x.ptyId === id);
  if (i >= 0) { sessions[i].ptyId = null; closeTab(i); }
});

function renderTabs() {
  const bar = $('tabbar');
  const tabs = $('tabs');
  const show = sessions.length > 1;
  if (bar.hidden === show) bar.hidden = !show; // muda o tamanho da tela -> ResizeObserver
  tabs.textContent = '';
  sessions.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'tab' + (i === active ? ' active' : '');
    el.title = s.title;
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = `${i + 1}: ${s.title || 'terminal'}`;
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Fechar aba';
    x.addEventListener('mousedown', e => e.stopPropagation());
    x.addEventListener('click', e => { e.stopPropagation(); closeTab(i); });
    el.append(t, x);
    el.addEventListener('mousedown', e => { if (e.button === 1) { closeTab(i); e.preventDefault(); } else switchTo(i); });
    tabs.appendChild(el);
  });
  const s = cur();
  document.title = (s && s.title ? s.title + ' — ' : '') + 'Hacker Terminal Retro';
}

$('add-tab').addEventListener('click', () => addTab(false));

// ---------------------------------------------------------------------------
// Ações e atalhos
// ---------------------------------------------------------------------------
async function doAction(name, arg) {
  const s = cur();
  switch (name) {
    case 'newTab': return addTab(false);
    case 'closeTab': return closeTab(active);
    case 'nextTab': return switchTo((active + 1) % sessions.length);
    case 'prevTab': return switchTo((active - 1 + sessions.length) % sessions.length);
    case 'gotoTab': return switchTo(arg);
    case 'copy': if (s && s.term.hasSelection()) api.writeClipboard(s.term.getSelection()); return;
    case 'paste': if (s) { const t = await api.readClipboard(); if (t) s.term.paste(t); s.term.focus(); } return;
    case 'selectAll': if (s) s.term.selectAll(); return;
    case 'clear': if (s) { s.term.clear(); markDirty(); } return;
    case 'zoomIn': return setScaling(S.general.fontScaling + 0.05);
    case 'zoomOut': return setScaling(S.general.fontScaling - 0.05);
    case 'zoomReset': return setScaling(1);
    case 'help': $('help').hidden = !$('help').hidden; return;
    case 'debugType': if (s && s.ptyId) api.write(s.ptyId, arg.replace(/\\r/g, '\r')); return; // usado só pelo modo de diagnóstico
    default: api.action(name, arg);
  }
}
api.onAction((name, arg) => doAction(name, arg));

function setScaling(v) {
  v = Math.round(clamp(v, 0.25, 2.5) * 100) / 100;
  api.set('general', 'fontScaling', v);
}

function handleKey(ev) {
  if (ev.type !== 'keydown') return true;
  const { ctrlKey: ctrl, shiftKey: shift, altKey: alt, code } = ev;
  let action = null, arg;
  if (ctrl && shift && !alt) {
    action = { KeyT: 'newTab', KeyW: 'closeTab', KeyN: 'newWindow', KeyQ: 'closeWindow', KeyC: 'copy', KeyV: 'paste', KeyA: 'selectAll', KeyK: 'clear', Tab: 'prevTab' }[code] || null;
  } else if (ctrl && !shift && !alt) {
    if (code === 'KeyC' && cur() && cur().term.hasSelection()) { doAction('copy'); cur().term.clearSelection(); ev.preventDefault(); return false; }
    action = { Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Digit0: 'zoomReset', Numpad0: 'zoomReset', Comma: 'settings', Tab: 'nextTab' }[code] || null;
  } else if (alt && !ctrl && !shift && /^Digit[1-9]$/.test(code)) {
    const n = Number(code.slice(5)) - 1;
    if (n < sessions.length) { action = 'gotoTab'; arg = n; }
  } else if (shift && !ctrl && !alt && code === 'Insert') action = 'paste';
  else if (shift && !ctrl && !alt && (code === 'PageUp' || code === 'PageDown')) {
    cur().term.scrollPages(code === 'PageUp' ? -1 : 1);
    ev.preventDefault();
    return false;
  }
  if (!ctrl && !alt && !shift && code === 'F11') action = 'fullscreen';
  if (!ctrl && !alt && !shift && code === 'F1') action = 'help';
  if (code === 'Escape' && !$('help').hidden) action = 'help';
  if (!action) return true;
  ev.preventDefault();
  doAction(action, arg);
  return false;
}

$('help').addEventListener('mousedown', () => { $('help').hidden = true; cur() && cur().term.focus(); });

// ---------------------------------------------------------------------------
// Mouse: mesma distorção de curvatura do shader, para clicar no caractere certo.
// ---------------------------------------------------------------------------
function distortParams() {
  const p = S.profile;
  const norm = 1024 / (0.5 * metrics.cssW + 0.5 * metrics.cssH);
  return { curvature: p.screenCurvature * 0.6 * norm, frameSize: p.frameSize * 0.05 * norm };
}

function eventToCell(ev) {
  const rect = canvas.getBoundingClientRect();
  const u = (ev.clientX - rect.left) / rect.width;
  const v = (ev.clientY - rect.top) / rect.height;
  const { curvature, frameSize } = distortParams();
  const px = u * (1 + 2 * frameSize) - frameSize;
  const py = v * (1 + 2 * frameSize) - frameSize;
  const cx = px - 0.5, cy = py - 0.5;
  const d = (cx * cx + cy * cy) * curvature;
  return grid.cellAt(px + cx * (1 + d) * d, py + cy * (1 + d) * d);
}

function mouseTracking(term) {
  return term.modes && term.modes.mouseTrackingMode && term.modes.mouseTrackingMode !== 'none' ? term.modes.mouseTrackingMode : null;
}

function sendMouse(s, button, cell, release, ev, motion) {
  if (!s.ptyId) return;
  let b = button + (motion ? 32 : 0);
  if (ev.shiftKey) b += 4;
  if (ev.altKey) b += 8;
  if (ev.ctrlKey) b += 16;
  const core = s.term._core;
  const enc = core && core.coreMouseService && core.coreMouseService.activeEncoding;
  let seq;
  if (enc === 'SGR' || enc === 'SGR_PIXELS') {
    seq = `\x1b[<${b};${cell.col + 1};${cell.row + 1}${release ? 'm' : 'M'}`;
  } else {
    if (release) b = 3 + (b & ~3);
    seq = '\x1b[M' + String.fromCharCode(32 + b, 33 + Math.min(cell.col, 222), 33 + Math.min(cell.row, 222));
  }
  api.write(s.ptyId, seq);
}

let drag = null;

function absPos(s, cell) {
  return { col: cell.col, row: s.term.buffer.active.viewportY + cell.row };
}

function selectRange(s, a, b) {
  const cols = s.term.cols;
  const ia = a.row * cols + a.col, ib = b.row * cols + b.col;
  const start = ia <= ib ? a : b;
  const len = Math.abs(ib - ia) + 1;
  s.term.select(start.col, start.row, len);
}

function selectWord(s, pos) {
  const line = s.term.buffer.active.getLine(pos.row);
  if (!line) return;
  const text = line.translateToString(false);
  const isWord = (ch) => /[^\s"'`()[\]{}<>|;,]/.test(ch || ' ');
  if (!isWord(text[pos.col])) return;
  let a = pos.col, b = pos.col;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length - 1 && isWord(text[b + 1])) b++;
  s.term.select(a, pos.row, b - a + 1);
}

canvas.addEventListener('mousedown', (ev) => {
  // Sem isto o clique no canvas tira o foco do campo de entrada do xterm e o teclado para de funcionar.
  ev.preventDefault();
  const s = cur();
  if (!s) return;
  s.term.focus();
  const cell = eventToCell(ev);
  const tracking = mouseTracking(s.term);
  if (tracking && !ev.shiftKey) {
    if (ev.button <= 2) sendMouse(s, ev.button, cell, false, ev, false);
    drag = { tracking: true, button: ev.button, last: cell };
    ev.preventDefault();
    return;
  }
  if (ev.button === 1) { doAction('paste'); ev.preventDefault(); return; }
  if (ev.button !== 0) return;
  const pos = absPos(s, cell);
  if (ev.detail === 2) { selectWord(s, pos); drag = null; return; }
  if (ev.detail >= 3) { s.term.selectLines(pos.row, pos.row); drag = null; return; }
  s.term.clearSelection();
  drag = { tracking: false, anchor: pos, moved: false };
});

window.addEventListener('mousemove', (ev) => {
  const s = cur();
  if (!s) return;
  const tracking = mouseTracking(s.term);
  if (drag && drag.tracking) {
    const cell = eventToCell(ev);
    if (cell.col !== drag.last.col || cell.row !== drag.last.row) {
      drag.last = cell;
      if (tracking === 'drag' || tracking === 'any') sendMouse(s, drag.button, cell, false, ev, true);
    }
    return;
  }
  if (drag) {
    const cell = eventToCell(ev);
    const pos = absPos(s, cell);
    if (pos.col !== drag.anchor.col || pos.row !== drag.anchor.row || drag.moved) {
      drag.moved = true;
      // rolagem automática ao arrastar para fora da tela
      if (cell.rowExact < 0) s.term.scrollLines(-1);
      else if (cell.rowExact > metrics.rows) s.term.scrollLines(1);
      selectRange(s, drag.anchor, absPos(s, eventToCell(ev)));
    }
  } else if (tracking === 'any' && ev.target === canvas) {
    const cell = eventToCell(ev);
    if (!s.lastHover || s.lastHover.col !== cell.col || s.lastHover.row !== cell.row) {
      s.lastHover = cell;
      sendMouse(s, 3, cell, false, ev, true);
    }
  }
});

window.addEventListener('mouseup', (ev) => {
  const s = cur();
  if (drag && drag.tracking && s) sendMouse(s, drag.button, eventToCell(ev), true, ev, false);
  drag = null;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const s = cur();
  if (!s) return;
  if (mouseTracking(s.term) && !ev.shiftKey) return; // já enviado ao programa
  api.contextMenu(s.term.hasSelection());
});

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const s = cur();
  if (!s) return;
  const dir = ev.deltaY < 0 ? -1 : 1;
  if (ev.ctrlKey) { doAction(dir < 0 ? 'zoomIn' : 'zoomOut'); return; }
  if (mouseTracking(s.term) && !ev.shiftKey) {
    sendMouse(s, dir < 0 ? 64 : 65, eventToCell(ev), false, ev, false);
    return;
  }
  if (s.term.buffer.active.type === 'alternate') {
    // Em programas de tela cheia (less, vim) a roda vira setas.
    const app = s.term.modes && s.term.modes.applicationCursorKeysMode;
    const seq = dir < 0 ? (app ? '\x1bOA' : '\x1b[A') : (app ? '\x1bOB' : '\x1b[B');
    if (s.ptyId) api.write(s.ptyId, seq.repeat(3));
    return;
  }
  s.term.scrollLines(dir * 3);
}, { passive: false });

window.addEventListener('focus', () => { focused = true; markDirty(); cur() && cur().term.focus(); });

// Mantém o foco no terminal: se ele se perder com a janela ativa, devolve.
function ensureTermFocus() {
  const s = cur();
  if (!s || !document.hasFocus() || !$('help').hidden) return;
  if (document.activeElement !== s.term.textarea) s.term.focus();
}
document.addEventListener('focusout', () => setTimeout(ensureTermFocus, 0));
document.addEventListener('mousedown', (ev) => {
  if (ev.target.closest && ev.target.closest('#tabbar')) ev.preventDefault();
}, true);

// Se uma tecla chegar sem o terminal em foco, foca e repassa a tecla.
window.addEventListener('keydown', (ev) => {
  const s = cur();
  if (!s || !$('help').hidden || document.activeElement === s.term.textarea) return;
  s.term.focus();
  if (handleKey(ev) === false) return;
  ev.preventDefault();
  const seq = keyToSequence(ev);
  if (seq && s.ptyId) api.write(s.ptyId, seq);
}, true);

function keyToSequence(ev) {
  if (ev.ctrlKey && !ev.altKey && ev.key.length === 1) {
    const c = ev.key.toUpperCase().charCodeAt(0);
    if (c >= 64 && c <= 95) return String.fromCharCode(c - 64);
  }
  const map = { Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D', Home: '\x1b[H', End: '\x1b[F', Delete: '\x1b[3~' };
  if (map[ev.key]) return map[ev.key];
  if (ev.key.length === 1 && !ev.ctrlKey) return (ev.altKey ? '\x1b' : '') + ev.key;
  return null;
}
window.addEventListener('blur', () => { focused = false; markDirty(); });

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
function applySettings(state) {
  const first = !S;
  S = state;
  for (const s of sessions) {
    if (s.term.options.scrollback !== S.general.scrollback) s.term.options.scrollback = S.general.scrollback;
  }
  clearInterval(blinkTimer);
  cursorOn = true;
  if (S.profile.blinkingCursor) blinkTimer = setInterval(() => { cursorOn = !cursorOn; textDirty = true; finalDirty = true; }, 530);
  bloomCleared = false;
  markDirty();
  return relayout(first);
}

api.onSettings(applySettings);

// ---------------------------------------------------------------------------
// Loop de renderização
// ---------------------------------------------------------------------------
function animatedEffects(p) {
  return p.staticNoise > 0 || p.jitter > 0 || p.glowingLine > 0 || p.flickering > 0 || p.horizontalSync > 0;
}

function uniforms(now) {
  const p = S.profile, g = S.general;
  const { curvature, frameSize } = distortParams();
  const colors = profileColors(p);
  const fe = frameEnabled(p);
  const hasBloom = p.bloom > 0 || p.frameShininess > 0;
  return {
    uTime: effectTime,
    uFontColor: colors.fontColor,
    uBgColor: colors.bgColor,
    uFrameColor: colors.frameColor,
    uChroma: p.chromaColor,
    uCurvature: curvature,
    uFrameSize: frameSize,
    uRadius: fe ? lerp(4, 120, p.screenRadius) * metrics.dpr * g.windowScaling : 0,
    uBloom: hasBloom ? p.bloom * 1.5 : 0,
    uBurnIn: p.burnIn,
    uStaticNoise: p.staticNoise,
    uJitter: p.jitter,
    uGlow: p.glowingLine * 0.2,
    uFlicker: rnd.flicker,
    uHsyncScale: rnd.hsyncScale,
    uHsyncFreq: rnd.hsyncFreq,
    uRgbShift: p.rgbShift * 0.004 * g.fontScaling,
    uBrightness: lerp(0.5, 1.5, p.brightness),
    uAmbient: fe ? p.ambientLight : 0,
    uShine: p.frameShininess * 0.5,
    uRaster: p.rasterization,
    uRasterIntensity: smoothstep(1.5, 3.0, metrics.outH / metrics.virtH),
    uPixelated: metrics.pixelated ? 1 : 0,
    uNoiseScale: [(metrics.outW / g.windowScaling * 0.75) / (512 * g.fontScaling * metrics.dpr), (metrics.outH / g.windowScaling * 0.75) / (512 * g.fontScaling * metrics.dpr)],
  };
}

function randomizeEffects(p) {
  rnd.flicker = 1 + (Math.random() - 0.5) * p.flickering;
  const strength = lerp(0.05, 0.35, p.horizontalSync);
  const randval = strength - Math.random();
  rnd.hsyncScale = p.horizontalSync > 0 ? Math.max(0, randval) * strength * p.horizontalSync : 0;
  rnd.hsyncFreq = lerp(4, 40, Math.random());
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  if (!S) return;
  const p = S.profile, g = S.general;
  const now = nowMs / 1000;

  let tick = false;
  if (++frameCounter >= Math.max(1, g.effectsFrameSkip)) { frameCounter = 0; tick = true; }
  const fadeTime = lerp(0.16, 1.6, p.burnIn);
  const burnActive = p.burnIn > 0 && now - lastTextChange < fadeTime + 0.2;
  const animate = tick && (animatedEffects(p) || burnActive);
  if (!textDirty && !finalDirty && !animate) return;

  if (textDirty) {
    grid.draw(cur() && cur().term, { cursorOn, focused });
    if (crt) {
      crt.uploadText(grid.canvas);
      if (p.bloom > 0 || p.frameShininess > 0) { crt.updateBloom(); bloomCleared = false; }
      else if (!bloomCleared) { crt.clearBloom(); bloomCleared = true; }
    }
    textDirty = false;
    lastTextChange = now;
  }

  if (!crt) {
    ctx2d.imageSmoothingEnabled = !metrics.pixelated;
    ctx2d.drawImage(grid.canvas, 0, 0, canvas.width, canvas.height);
    finalDirty = false;
    return;
  }

  if (tick) { effectTime = now; randomizeEffects(p); }
  if (p.burnIn > 0) {
    const dt = Math.min(0.5, Math.max(0, now - lastBurnUpdate));
    crt.updateBurnIn(dt / fadeTime);
  }
  lastBurnUpdate = now;
  crt.renderFinal(uniforms(now));
  finalDirty = false;
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
(async function init() {
  try {
    crt = new CRTRenderer(canvas);
  } catch (e) {
    console.error(e);
    crt = null;
    ctx2d = canvas.getContext('2d');
    const err = $('error');
    err.textContent = 'WebGL2 indisponível: efeitos CRT desativados. (' + e.message + ')';
    err.hidden = false;
    setTimeout(() => { err.hidden = true; }, 6000);
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  await applySettings(await api.getSettings());
  await addTab(true);
  requestAnimationFrame(frame);
})();
