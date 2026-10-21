/* Janela de Configurações. Toda alteração é enviada ao processo principal,
 * que aplica em todas as janelas e salva em disco. */
'use strict';

const api = window.retro;
const $ = (id) => document.getElementById(id);
let S = null;
const remembered = {}; // último valor de cada efeito antes de desligar
const bindings = [];   // funções que atualizam os controles a partir do estado

// ---------------------------------------------------------------------------
// Construção dos controles
// ---------------------------------------------------------------------------
function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

function pct(v, min, max) { return Math.round(((v - min) / (max - min)) * 100) + '%'; }

/** Slider simples. fmt opcional para o texto do valor. */
function slider(container, { scope, key, label, min = 0, max = 1, step = 0.01, fmt, enabledIf }) {
  const id = `${scope}-${key}`;
  const lab = el('label', { htmlFor: id, textContent: label });
  const input = el('input', { type: 'range', id, min, max, step });
  const val = el('span', { className: 'value' });
  const row = el('div', { className: 'row' }, [input, val]);
  container.append(lab, row);
  const show = (v) => { val.textContent = fmt ? fmt(v) : pct(v, min, max); };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    api.set(scope, key, v);
  });
  bindings.push(() => {
    const v = S[scope][key];
    if (document.activeElement !== input) input.value = v;
    show(document.activeElement === input ? Number(input.value) : v);
    if (enabledIf) {
      const on = enabledIf();
      input.disabled = !on;
      lab.classList.toggle('disabled', !on);
      row.classList.toggle('disabled', !on);
    }
  });
}

/** Slider com caixa de seleção: desmarcar = desligar (valor 0). */
function checkSlider(container, { key, label, enabledIf }) {
  const id = `profile-${key}`;
  const check = el('input', { type: 'checkbox', id: id + '-on' });
  const lab = el('label', { className: 'check-label' }, [check, label]);
  const input = el('input', { type: 'range', id, min: 0, max: 1, step: 0.01 });
  const val = el('span', { className: 'value' });
  const row = el('div', { className: 'row' }, [input, val]);
  container.append(lab, row);
  check.addEventListener('change', () => {
    if (check.checked) {
      const v = remembered[key] > 0 ? remembered[key] : 0.5;
      api.set('profile', key, v);
    } else {
      remembered[key] = S.profile[key];
      api.set('profile', key, 0);
    }
  });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = pct(v, 0, 1);
    check.checked = v > 0;
    api.set('profile', key, v);
  });
  bindings.push(() => {
    const v = S.profile[key];
    if (v > 0) remembered[key] = v;
    check.checked = v > 0;
    if (document.activeElement !== input) input.value = v > 0 ? v : (remembered[key] || 0);
    val.textContent = pct(v, 0, 1);
    input.disabled = v === 0;
    const on = enabledIf ? enabledIf() : true;
    check.disabled = !on;
    lab.classList.toggle('disabled', !on);
    row.classList.toggle('disabled', !on || v === 0);
  });
}

function checkbox(id, scope, key) {
  const c = $(id);
  c.addEventListener('change', () => api.set(scope, key, c.checked));
  bindings.push(() => { c.checked = !!S[scope][key]; });
}

// Geral > Tela
const screen = $('screen-controls');
slider(screen, { scope: 'profile', key: 'brightness', label: 'Brilho' });
slider(screen, { scope: 'profile', key: 'contrast', label: 'Contraste' });
slider(screen, { scope: 'profile', key: 'margin', label: 'Margem' });
slider(screen, { scope: 'profile', key: 'screenRadius', label: 'Raio dos cantos' });
slider(screen, { scope: 'profile', key: 'frameSize', label: 'Tamanho da moldura' });
slider(screen, { scope: 'profile', key: 'windowOpacity', label: 'Opacidade da janela' });

// Terminal > Fonte
const fontc = $('font-controls');
slider(fontc, { scope: 'general', key: 'fontScaling', label: 'Escala', min: 0.25, max: 2.5, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
slider(fontc, { scope: 'profile', key: 'fontWidth', label: 'Largura da fonte', min: 0.5, max: 1.5, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
slider(fontc, { scope: 'profile', key: 'lineSpacing', label: 'Espaçamento de linha', min: 0, max: 1, step: 0.01 });

// Terminal > Cores
const colorc = $('color-controls');
checkSlider(colorc, { key: 'chromaColor', label: 'Cor (chroma)' });
checkSlider(colorc, { key: 'saturationColor', label: 'Saturação', enabledIf: () => S.profile.chromaColor > 0 });

function colorInput(id, key) {
  const c = $(id);
  c.addEventListener('input', () => api.set('profile', key, c.value));
  bindings.push(() => { if (document.activeElement !== c) c.value = S.profile[key]; });
}
colorInput('color-font', 'fontColor');
colorInput('color-bg', 'backgroundColor');
colorInput('color-frame', 'frameColor');

// Efeitos
const fx = $('effect-controls');
const frameOn = () => S.profile.frameSize > 0 || S.profile.screenCurvature > 0 || S.profile.ambientLight > 0;
[
  ['bloom', 'Bloom (brilho)'],
  ['burnIn', 'Burn-in (rastro)'],
  ['staticNoise', 'Ruído estático'],
  ['jitter', 'Tremor (jitter)'],
  ['glowingLine', 'Linha de varredura'],
  ['screenCurvature', 'Curvatura da tela'],
  ['ambientLight', 'Luz ambiente', frameOn],
  ['flickering', 'Cintilação'],
  ['horizontalSync', 'Sincronismo horizontal'],
  ['rgbShift', 'Deslocamento RGB'],
  ['frameShininess', 'Brilho da moldura'],
].forEach(([key, label, enabledIf]) => checkSlider(fx, { key, label, enabledIf }));

// Avançado
checkbox('blink', 'profile', 'blinkingCursor');
checkbox('menubar', 'general', 'showMenubar');
checkbox('showsize', 'general', 'showTerminalSize');
checkbox('use-custom', 'general', 'useCustomCommand');

const custom = $('custom-cmd');
custom.addEventListener('change', () => api.set('general', 'customCommand', custom.value));
window.addEventListener('beforeunload', () => api.set('general', 'customCommand', custom.value));
bindings.push(() => {
  if (document.activeElement !== custom) custom.value = S.general.customCommand;
  custom.disabled = !S.general.useCustomCommand;
});

const scrollback = $('scrollback');
scrollback.addEventListener('change', () => {
  const v = Math.round(Math.min(100000, Math.max(100, Number(scrollback.value) || 5000)));
  api.set('general', 'scrollback', v);
});
bindings.push(() => { if (document.activeElement !== scrollback) scrollback.value = S.general.scrollback; });

const shellSel = $('shell');
shellSel.addEventListener('change', () => api.set('general', 'shell', shellSel.value));
bindings.push(() => {
  shellSel.textContent = '';
  for (const s of S.shells) {
    shellSel.append(el('option', { value: s.id, textContent: s.name + (s.available ? '' : ' (não encontrado)'), disabled: !s.available }));
  }
  shellSel.value = S.general.shell;
});

const perf = $('perf-controls');
slider(perf, { scope: 'general', key: 'effectsFrameSkip', label: 'FPS dos efeitos', min: 1, max: 5, step: 1, fmt: v => Math.round(100 / v) + '%' });
slider(perf, { scope: 'general', key: 'windowScaling', label: 'Qualidade da textura', min: 0.25, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
slider(perf, { scope: 'general', key: 'bloomQuality', label: 'Qualidade do bloom', min: 0.25, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });
slider(perf, { scope: 'general', key: 'burnInQuality', label: 'Qualidade do burn-in', min: 0.25, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' });

// Fonte: origem, nome e rasterização
const fontSel = $('font-name');
const rasterSel = $('raster');
document.querySelectorAll('input[name=fontsource]').forEach(r => r.addEventListener('change', () => {
  const first = S.fonts.find(f => f.source === r.value);
  if (first) chooseFont(first.id);
}));
fontSel.addEventListener('change', () => chooseFont(fontSel.value));
rasterSel.addEventListener('change', () => api.set('profile', 'rasterization', Number(rasterSel.value)));

function chooseFont(id) {
  const font = S.fonts.find(f => f.id === id);
  if (!font) return;
  // Igual ao original: fonte de alta resolução muda para "Moderna"; fonte pixelada sai de "Moderna".
  if (!font.lowRes && S.profile.rasterization !== 4) api.set('profile', 'rasterization', 4);
  if (font.lowRes && S.profile.rasterization === 4) api.set('profile', 'rasterization', 0);
  api.set('profile', 'fontName', id);
}

bindings.push(() => {
  const curFont = S.fonts.find(f => f.id === S.profile.fontName) || S.fonts[0];
  document.querySelectorAll('input[name=fontsource]').forEach(r => { r.checked = r.value === curFont.source; });
  fontSel.textContent = '';
  for (const f of S.fonts.filter(x => x.source === curFont.source)) {
    fontSel.append(el('option', { value: f.id, textContent: f.name + (f.lowRes ? '  · pixelada' : '') }));
  }
  fontSel.value = curFont.id;
  rasterSel.value = String(S.profile.rasterization);
});

// ---------------------------------------------------------------------------
// Perfis
// ---------------------------------------------------------------------------
const list = $('profile-list');
const msg = $('profile-msg');

function say(text, error) {
  msg.textContent = text || '';
  msg.classList.toggle('error', !!error);
}

function selected() {
  return S.profiles.find(p => p.name === list.value);
}

function updateProfileButtons() {
  const p = selected();
  $('btn-load').disabled = !p;
  $('btn-remove').disabled = !p || p.builtin;
  $('btn-export').disabled = !p || p.builtin;
}

bindings.push(() => {
  const keep = list.value;
  list.textContent = '';
  for (const p of S.profiles) list.append(el('option', { value: p.name, textContent: (p.builtin ? '' : '★ ') + p.name }));
  if (S.profiles.some(p => p.name === keep)) list.value = keep;
  updateProfileButtons();
});

list.addEventListener('change', updateProfileButtons);
list.addEventListener('dblclick', () => $('btn-load').click());

$('btn-load').addEventListener('click', async () => {
  const p = selected();
  if (p && await api.loadProfile(p.name)) say(`Perfil "${p.name}" carregado.`);
});
$('btn-remove').addEventListener('click', async () => {
  const p = selected();
  if (!p || p.builtin) return;
  if (!confirm(`Remover o perfil "${p.name}"?`)) return;
  if (await api.removeProfile(p.name)) say(`Perfil "${p.name}" removido.`);
});
$('btn-save').addEventListener('click', () => {
  $('save-row').hidden = false;
  $('save-name').value = '';
  $('save-name').focus();
});
$('save-cancel').addEventListener('click', () => { $('save-row').hidden = true; });
$('save-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('save-ok').click();
  if (e.key === 'Escape') $('save-cancel').click();
});
$('save-ok').addEventListener('click', async () => {
  const name = $('save-name').value.trim();
  const r = await api.saveProfile(name);
  if (r.error) { say(r.error, true); return; }
  $('save-row').hidden = true;
  list.value = name;
  updateProfileButtons();
  say(`Perfil "${name}" salvo.`);
});
$('btn-import').addEventListener('click', async () => {
  const r = await api.importProfile();
  if (r.error) say(r.error, true);
  else if (r.ok) { list.value = r.name; updateProfileButtons(); say(`Perfil "${r.name}" importado.`); }
});
$('btn-export').addEventListener('click', async () => {
  const p = selected();
  if (!p) return;
  const r = await api.exportProfile(p.name);
  if (r.error) say(r.error, true);
  else if (r.ok) say(`Exportado para ${r.file}`);
});

// ---------------------------------------------------------------------------
// Abas da janela
// ---------------------------------------------------------------------------
function showPage(name) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.page === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showPage(t.dataset.page)));
// Permite abrir direto numa aba: settings.html#effects
if (location.hash && $('page-' + location.hash.slice(1))) showPage(location.hash.slice(1));

function refresh(state) {
  S = state;
  for (const b of bindings) b();
}

api.onSettings(refresh);
api.getSettings().then(refresh);
