const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (e, ...args) => cb(...args);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('retro', {
  // PTY
  spawn: (cols, rows, useLaunch) => ipcRenderer.invoke('pty:spawn', { cols, rows, useLaunch }),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: on('pty:data'),
  onExit: on('pty:exit'),

  // Configurações e perfis
  getSettings: () => ipcRenderer.invoke('settings:get'),
  set: (scope, key, value) => ipcRenderer.send('settings:set', scope, key, value),
  onSettings: on('settings:changed'),
  loadProfile: (name) => ipcRenderer.invoke('profile:load', name),
  saveProfile: (name) => ipcRenderer.invoke('profile:save', name),
  removeProfile: (name) => ipcRenderer.invoke('profile:remove', name),
  importProfile: () => ipcRenderer.invoke('profile:import'),
  exportProfile: (name) => ipcRenderer.invoke('profile:export', name),

  // Janela / app
  action: (name, arg) => ipcRenderer.send('app:action', name, arg),
  onAction: on('app:action'),
  onFullscreen: on('window:fullscreen'),
  contextMenu: (hasSelection) => ipcRenderer.send('menu:context', hasSelection),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),
});
