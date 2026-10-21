const { app, BrowserWindow, ipcMain, Menu, dialog, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const {
  PROFILE_VERSION, FONTS, SHELLS, DEFAULT_GENERAL, DEFAULT_PROFILE, BUILTIN_PROFILES,
} = require('./config');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(RENDERER, 'icon.png');

// ---------------------------------------------------------------------------
// Linha de comando (mesmas opções do cool-retro-term, relatório §5)
// ---------------------------------------------------------------------------
const HELP = `Uso: HackerTerminalRetro [--default-settings] [--workdir <dir>] [-p|--profile <perfil>] [--fullscreen] [--verbose] [-e <cmd> ...]
  --default-settings  Inicia com as configurações padrão
  --workdir <dir>     Diretório de trabalho inicial
  -e <cmd>            Comando a executar (captura todos os argumentos seguintes; use por último)
  --fullscreen        Inicia em tela cheia
  -p|--profile <p>    Inicia com o perfil indicado
  --verbose           Mostra informações extras no console
  -v|--version        Mostra a versão
  -h|--help           Mostra esta ajuda`;

function parseArgs(argv) {
  const opts = { defaultSettings: false, workdir: null, profile: null, fullscreen: false, verbose: false, cmd: null, cmdArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-e') { opts.cmd = argv[i + 1] || null; opts.cmdArgs = argv.slice(i + 2); break; }
    else if (a === '--default-settings') opts.defaultSettings = true;
    else if (a === '--workdir') opts.workdir = argv[++i] || null;
    else if (a === '-p' || a === '--profile') opts.profile = argv[++i] || null;
    else if (a === '--fullscreen') opts.fullscreen = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
  }
  return opts;
}

function userArgs(argv) {
  // Em desenvolvimento: electron.exe . [args]; empacotado: RetroTerm.exe [args]
  const rest = app.isPackaged ? argv.slice(1) : argv.slice(2);
  // O Chromium insere opções próprias (--allow-file-access etc.) no argv da segunda instância.
  const known = new Set(['-e', '--default-settings', '--workdir', '-p', '--profile', '--fullscreen', '--verbose', '-h', '--help', '-v', '--version']);
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '-e') { out.push(...rest.slice(i)); break; }
    if (rest[i].startsWith('-') && !known.has(rest[i])) continue;
    out.push(rest[i]);
  }
  return out;
}

const cli = parseArgs(userArgs(process.argv));
const log = (...a) => { if (cli.verbose) console.log('[hacker-terminal-retro]', ...a); };

if (cli.help) { console.log(HELP); process.exit(0); }
if (cli.version) { console.log(`Hacker Terminal Retro ${app.getVersion()}`); process.exit(0); }

// ---------------------------------------------------------------------------
// Configurações persistentes (JSON em %APPDATA%\Hacker Terminal Retro\settings.json).
// Diferente do original, salva a cada alteração (com debounce), não só ao sair.
// ---------------------------------------------------------------------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

const state = {
  general: { ...DEFAULT_GENERAL },
  profile: { ...DEFAULT_PROFILE },
  customProfiles: [], // [{ name, profile }]
};

function sanitizeProfile(obj, base) {
  const out = { ...base };
  for (const k of Object.keys(DEFAULT_PROFILE)) {
    if (obj && obj[k] !== undefined && typeof obj[k] === typeof DEFAULT_PROFILE[k]) out[k] = obj[k];
  }
  if (!FONTS.some(f => f.id === out.fontName)) out.fontName = base.fontName;
  return out;
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (!cli.defaultSettings) {
      state.general = { ...DEFAULT_GENERAL, ...(raw.general || {}) };
      state.profile = sanitizeProfile(raw.profile, DEFAULT_PROFILE);
    }
    state.customProfiles = (raw.customProfiles || [])
      .filter(c => c && typeof c.name === 'string')
      .map(c => ({ name: c.name, profile: sanitizeProfile(c.profile, DEFAULT_PROFILE) }));
  } catch (e) {
    log('Sem configurações salvas, usando padrão.', e.message);
  }
  if (cli.profile) {
    const prof = findProfile(cli.profile);
    if (prof) state.profile = { ...prof.profile };
    else console.warn('Aviso: perfil inválido, ignorando:', cli.profile);
  }
  log('Configurações carregadas', JSON.stringify(state));
}

let saveTimer = null;
let userChanged = false;
function scheduleSave() {
  userChanged = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  // Com --default-settings não sobrescreve o que está salvo, a menos que o usuário mude algo.
  if (cli.defaultSettings && !userChanged) return;
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Falha ao salvar configurações:', e);
  }
}

function allProfiles() {
  return [
    ...BUILTIN_PROFILES.map(p => ({ name: p.name, builtin: true, profile: p.profile })),
    ...state.customProfiles.map(p => ({ name: p.name, builtin: false, profile: p.profile })),
  ];
}
function findProfile(name) {
  return allProfiles().find(p => p.name === name);
}

function publicState() {
  return {
    general: state.general,
    profile: state.profile,
    profiles: allProfiles().map(p => ({ name: p.name, builtin: p.builtin })),
    fonts: FONTS,
    shells: SHELLS.map(s => ({ ...s, available: shellAvailable(s) })),
    version: app.getVersion(),
  };
}

function broadcast() {
  const s = publicState();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', s);
  applyWindowSettings();
  rebuildMenu();
}

function applyWindowSettings() {
  for (const w of terminalWindows) {
    w.setOpacity(Math.max(0.3, state.profile.windowOpacity * 0.7 + 0.3));
    w.setMenuBarVisibility(!!state.general.showMenubar);
  }
}

// ---------------------------------------------------------------------------
// Shell / PTY (ConPTY via node-pty)
// ---------------------------------------------------------------------------
function shellAvailable(s) {
  if (path.isAbsolute(s.file)) return fs.existsSync(s.file);
  if (s.id === 'pwsh') {
    return fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe') ||
      (process.env.PATH || '').split(';').some(d => d && fs.existsSync(path.join(d, 'pwsh.exe')));
  }
  return true;
}

// Tokenizador de linha de comando com aspas (adaptado do utils.js original).
// Fora de aspas a barra invertida é literal, porque no Windows ela separa caminhos.
// Dentro de aspas duplas, \" insere uma aspa.
function tokenizeCommandLine(s) {
  const args = [];
  let cur = '', quote = '';
  const next = () => { args.push(cur); cur = ''; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === quote) { quote = ''; next(); }
      else cur += c;
    } else if (c === ' ' || c === '\t' || c === '\n') { if (cur) next(); }
    else if (c === '"' || c === "'") quote = c;
    else cur += c;
  }
  if (cur && !quote) next();
  return args;
}

function resolveCommand(launch) {
  if (launch && launch.cmd) return { file: launch.cmd, args: launch.cmdArgs || [] };
  if (state.general.useCustomCommand && state.general.customCommand.trim()) {
    const t = tokenizeCommandLine(state.general.customCommand.trim());
    if (t.length) return { file: t[0], args: t.slice(1) };
  }
  const s = SHELLS.find(x => x.id === state.general.shell) || SHELLS[0];
  let file = s.file;
  if (s.id === 'pwsh' && fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')) file = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  return { file, args: s.args };
}

const ptys = new Map(); // id -> { proc, wc }
let nextPtyId = 1;

ipcMain.handle('pty:spawn', (e, { cols, rows, useLaunch }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const launch = useLaunch ? launchOptions.get(win.id) : null;
  const { file, args } = resolveCommand(launch);
  const cwd = (launch && launch.workdir) || cli.workdir || process.env.USERPROFILE || process.cwd();
  const id = nextPtyId++;
  let proc;
  try {
    proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols | 0), rows: Math.max(1, rows | 0),
      cwd: fs.existsSync(cwd) ? cwd : process.env.USERPROFILE,
      env: { ...process.env, COLORTERM: 'truecolor', TERM_PROGRAM: 'HackerTerminalRetro' },
      useConpty: true,
    });
  } catch (err) {
    return { id: null, error: `Não foi possível iniciar "${file}": ${err.message}` };
  }
  log('PTY', id, file, args.join(' '), 'em', cwd);
  const wc = e.sender;
  ptys.set(id, { proc, wc });
  proc.onData(d => { if (!wc.isDestroyed()) wc.send('pty:data', id, d); });
  proc.onExit(({ exitCode }) => {
    ptys.delete(id);
    if (!wc.isDestroyed()) wc.send('pty:exit', id, exitCode);
  });
  return { id, file };
});

ipcMain.on('pty:write', (e, id, data) => { const p = ptys.get(id); if (p) p.proc.write(data); });
ipcMain.on('pty:resize', (e, id, cols, rows) => {
  const p = ptys.get(id);
  if (p && cols > 1 && rows > 0) { try { p.proc.resize(cols, rows); } catch { /* processo já saiu */ } }
});
ipcMain.on('pty:kill', (e, id) => killPty(id));

function killPty(id) {
  const p = ptys.get(id);
  if (!p) return;
  ptys.delete(id);
  try { p.proc.kill(); } catch { /* ignore */ }
}
function killPtysOf(wc) {
  for (const [id, p] of ptys) if (p.wc === wc) killPty(id);
}

// ---------------------------------------------------------------------------
// Configurações e perfis (IPC)
// ---------------------------------------------------------------------------
ipcMain.handle('settings:get', () => publicState());

ipcMain.on('settings:set', (e, scope, key, value) => {
  if (scope === 'general' && key in DEFAULT_GENERAL) state.general[key] = value;
  else if (scope === 'profile' && key in DEFAULT_PROFILE) state.profile[key] = value;
  else return;
  scheduleSave();
  broadcast();
});

ipcMain.handle('profile:load', (e, name) => loadProfileByName(name));

function loadProfileByName(name) {
  const prof = findProfile(name);
  if (!prof) return false;
  state.profile = { ...prof.profile };
  scheduleSave();
  broadcast();
  return true;
}

ipcMain.handle('profile:save', (e, name) => {
  name = String(name || '').trim();
  if (!name) return { error: 'O nome está vazio. Escolha outro nome.' };
  // Corrige o bug do original: não permite nomes duplicados.
  if (findProfile(name)) return { error: `Já existe um perfil chamado "${name}".` };
  state.customProfiles.push({ name, profile: { ...state.profile } });
  scheduleSave();
  broadcast();
  return { ok: true };
});

ipcMain.handle('profile:remove', (e, name) => {
  const i = state.customProfiles.findIndex(p => p.name === name);
  if (i < 0) return false;
  state.customProfiles.splice(i, 1);
  scheduleSave();
  broadcast();
  return true;
});

ipcMain.handle('profile:export', async (e, name) => {
  const prof = findProfile(name);
  if (!prof) return { error: 'Perfil não encontrado.' };
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar perfil', defaultPath: `${name.replace(/[\\/:*?"<>|]/g, '_')}.json`,
    filters: [{ name: 'Perfis JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  let file = r.filePath;
  if (!file.toLowerCase().endsWith('.json')) file += '.json';
  try {
    fs.writeFileSync(file, JSON.stringify({ ...prof.profile, name, version: PROFILE_VERSION }, null, 2));
    return { ok: true, file };
  } catch (err) {
    return { error: 'Não foi possível gravar o arquivo: ' + err.message };
  }
});

ipcMain.handle('profile:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Importar perfil', properties: ['openFile'],
    filters: [{ name: 'Perfis JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  try {
    const obj = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (!obj.name) return { error: 'O perfil não tem nome ("name").' };
    // Aceita versão 1 e 2 (o original rejeita perfis sem "version").
    if (obj.version !== undefined && obj.version > PROFILE_VERSION) return { error: 'Versão de perfil não suportada.' };
    let name = String(obj.name);
    while (findProfile(name)) name += ' (importado)';
    state.customProfiles.push({ name, profile: sanitizeProfile(obj, state.profile) });
    scheduleSave();
    broadcast();
    return { ok: true, name };
  } catch (err) {
    return { error: 'Arquivo inválido: ' + err.message };
  }
});

// ---------------------------------------------------------------------------
// Janelas
// ---------------------------------------------------------------------------
const terminalWindows = new Set();
const launchOptions = new Map(); // winId -> opções de linha de comando
let settingsWindow = null;
let aboutWindow = null;

function createTerminalWindow(opts = {}) {
  const win = new BrowserWindow({
    width: 1024, height: 768, minWidth: 320, minHeight: 240,
    backgroundColor: '#000000',
    title: 'Hacker Terminal Retro',
    icon: ICON,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  terminalWindows.add(win);
  launchOptions.set(win.id, opts);
  win.loadFile(path.join(RENDERER, 'terminal.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (opts.fullscreen) win.setFullScreen(true);
  });
  if (cli.verbose || process.env.HTR_CAPTURE) {
    win.webContents.on('console-message', (ev) => console.log(`[renderer:${ev.level}]`, ev.message, ev.lineNumber ? `(${ev.sourceId}:${ev.lineNumber})` : ''));
  }
  // Diagnóstico: HTR_CAPTURE=arquivo.png salva uma captura da janela após alguns segundos.
  if (process.env.HTR_CAPTURE && terminalWindows.size === 1) {
    setTimeout(async () => {
      for (const a of (process.env.HTR_ACTIONS || '').split(',').filter(Boolean)) { const [name, arg] = a.split(':'); doAction(name, win, arg); }
      if (process.env.HTR_TYPE) win.webContents.send('app:action', 'debugType', process.env.HTR_TYPE);
      // HTR_KEYS: clica na tela e digita de verdade (eventos de teclado do sistema).
      if (process.env.HTR_KEYS) {
        const wc = win.webContents;
        wc.sendInputEvent({ type: 'mouseDown', x: 400, y: 300, button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 300));
        for (const ch of process.env.HTR_KEYS) {
          if (ch === '~') {
            wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
            wc.sendInputEvent({ type: 'char', keyCode: '\r' });
            wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
          } else {
            wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
            wc.sendInputEvent({ type: 'char', keyCode: ch });
            wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
          }
          await new Promise(r => setTimeout(r, 20));
        }
      }
      setTimeout(async () => {
        const wins = BrowserWindow.getAllWindows();
        for (let i = 0; i < wins.length; i++) {
          const img = await wins[i].webContents.capturePage();
          const jpg = /\.jpe?g$/i.test(process.env.HTR_CAPTURE);
          const file = process.env.HTR_CAPTURE.replace(/\.(png|jpe?g)$/i, `-${i}.$1`);
          fs.writeFileSync(file, jpg ? img.toJPEG(88) : img.toPNG());
          console.log('captura salva em', file, wins[i].getTitle());
        }
      }, Number(process.env.HTR_TYPE_WAIT || 2500));
    }, Number(process.env.HTR_CAPTURE_DELAY || 3000));
  }
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false));
  const wc = win.webContents;
  win.on('closed', () => {
    killPtysOf(wc);
    terminalWindows.delete(win);
    launchOptions.delete(win.id);
    // Como no original: fechar a última janela de terminal encerra o app.
    if (terminalWindows.size === 0) {
      saveNow();
      app.quit();
    }
  });
  applyWindowSettings();
  return win;
}

function openSettings(page) {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 680, height: 640, minWidth: 560, minHeight: 480,
    title: 'Configurações — Hacker Terminal Retro', icon: ICON, backgroundColor: '#14110c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(RENDERER, 'settings.html'), page ? { hash: page } : undefined);
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function openAbout() {
  if (aboutWindow && !aboutWindow.isDestroyed()) { aboutWindow.show(); aboutWindow.focus(); return; }
  aboutWindow = new BrowserWindow({
    width: 560, height: 460, resizable: false, minimizable: false, maximizable: false,
    title: 'Sobre o Hacker Terminal Retro', icon: ICON, backgroundColor: '#14110c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  aboutWindow.setMenu(null);
  aboutWindow.loadFile(path.join(RENDERER, 'about.html'));
  aboutWindow.on('closed', () => { aboutWindow = null; });
}

ipcMain.on('app:action', (e, action, arg) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  doAction(action, win, arg);
});

function doAction(action, win, arg) {
  const target = win && terminalWindows.has(win) ? win : [...terminalWindows].find(w => w.isFocused()) || [...terminalWindows][0];
  switch (action) {
    case 'newWindow': createTerminalWindow({}); break;
    case 'settings': openSettings(arg); break;
    case 'about': openAbout(); break;
    case 'fullscreen': if (target) target.setFullScreen(!target.isFullScreen()); break;
    case 'closeWindow': if (target) target.close(); break;
    case 'loadProfile': loadProfileByName(arg); break;
    case 'openUrl': if (/^https:\/\//.test(arg)) shell.openExternal(arg); break;
    // Ações tratadas pela janela do terminal:
    default: if (target) target.webContents.send('app:action', action, arg);
  }
}

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.on('clipboard:write', (e, text) => clipboard.writeText(String(text || '')));

// ---------------------------------------------------------------------------
// Menus (barra de menu opcional + menu de contexto)
// ---------------------------------------------------------------------------
function item(label, action, accelerator, extra = {}) {
  return {
    label, accelerator, registerAccelerator: false, // atalhos são tratados na janela
    click: (mi, win) => doAction(action, win, extra.arg), ...extra,
  };
}

function profilesSubmenu() {
  return allProfiles().map(p => ({
    label: p.name + (p.builtin ? '' : '  ★'),
    click: () => loadProfileByName(p.name),
  }));
}

function menuTemplate() {
  return [
    { label: '&Arquivo', submenu: [
      item('Nova janela', 'newWindow', 'Ctrl+Shift+N'),
      item('Nova aba', 'newTab', 'Ctrl+Shift+T'),
      item('Fechar aba', 'closeTab', 'Ctrl+Shift+W'),
      { type: 'separator' },
      item('Sair', 'closeWindow', 'Ctrl+Shift+Q'),
    ] },
    { label: '&Editar', submenu: [
      item('Copiar', 'copy', 'Ctrl+Shift+C'),
      item('Colar', 'paste', 'Ctrl+Shift+V'),
      item('Selecionar tudo', 'selectAll', 'Ctrl+Shift+A'),
      { type: 'separator' },
      item('Configurações…', 'settings', 'Ctrl+,'),
    ] },
    { label: '&Exibir', submenu: [
      item('Tela cheia', 'fullscreen', 'F11'),
      item('Aumentar zoom', 'zoomIn', 'Ctrl+='),
      item('Diminuir zoom', 'zoomOut', 'Ctrl+-'),
      item('Zoom padrão', 'zoomReset', 'Ctrl+0'),
      { type: 'separator' },
      item('Limpar histórico', 'clear', 'Ctrl+Shift+K'),
    ] },
    { label: '&Perfis', submenu: profilesSubmenu() },
    { label: 'Aj&uda', submenu: [
      item('Atalhos de teclado', 'help'),
      item('Sobre o Hacker Terminal Retro', 'about'),
      { label: 'Ferramentas de desenvolvedor', accelerator: 'Ctrl+Shift+I', registerAccelerator: false, click: (mi, w) => w && w.webContents.toggleDevTools() },
    ] },
  ];
}

function rebuildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));
  for (const w of [settingsWindow, aboutWindow]) if (w && !w.isDestroyed()) w.setMenu(null);
  applyMenuVisibility();
}
function applyMenuVisibility() {
  for (const w of terminalWindows) w.setMenuBarVisibility(!!state.general.showMenubar);
}

ipcMain.on('menu:context', (e, hasSelection) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const tpl = [
    { ...item('Copiar', 'copy', 'Ctrl+Shift+C'), enabled: !!hasSelection },
    item('Colar', 'paste', 'Ctrl+Shift+V'),
    { type: 'separator' },
    item('Nova aba', 'newTab', 'Ctrl+Shift+T'),
    item('Nova janela', 'newWindow', 'Ctrl+Shift+N'),
    { type: 'separator' },
    { label: 'Perfis', submenu: profilesSubmenu() },
    item('Tela cheia', 'fullscreen', 'F11'),
    item('Configurações…', 'settings', 'Ctrl+,'),
    { type: 'separator' },
    item('Sobre', 'about'),
  ];
  Menu.buildFromTemplate(tpl).popup({ window: win });
});

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  // Igual ao original (KDSingleApplication): a nova execução vira uma nova janela na instância existente.
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    const o = parseArgs(userArgs(argv));
    if (o.profile) loadProfileByName(o.profile);
    createTerminalWindow({ cmd: o.cmd, cmdArgs: o.cmdArgs, workdir: o.workdir || workingDirectory, fullscreen: o.fullscreen });
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.hackerterminalretro.app');
    loadSettings();
    rebuildMenu();
    createTerminalWindow({ cmd: cli.cmd, cmdArgs: cli.cmdArgs, workdir: cli.workdir, fullscreen: cli.fullscreen });
  });

  app.on('window-all-closed', () => {
    saveNow();
    app.quit();
  });
  app.on('before-quit', () => {
    saveNow();
    for (const id of [...ptys.keys()]) killPty(id);
  });
}
