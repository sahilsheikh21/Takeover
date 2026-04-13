'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getPort: () => ipcRenderer.invoke('get-port'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),

  // Auto-launch
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.send('set-auto-launch', enabled),

  // App control
  relaunchApp: () => ipcRenderer.send('relaunch-app'),

  // File dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  copyFile: (src, dst) => ipcRenderer.invoke('copy-file', src, dst),

  // Check if running in Electron
  isElectron: true,
});
