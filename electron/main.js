'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog, screen, Menu, MenuItem } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { createTray } = require('./tray');

// ─── App User Model ID (Windows notifications) ───────────────────────────────
if (process.platform === 'win32') {
  app.setAppUserModelId('Takeover');
}

// ─── Single-instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ─── Port detection ───────────────────────────────────────────────────────────
const PREFERRED_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort() {
  for (const port of PREFERRED_PORTS) {
    if (await isPortFree(port)) {
      console.log(`[Takeover] Using port ${port}`);
      return port;
    }
    console.log(`[Takeover] Port ${port} in use, trying next…`);
  }
  throw new Error('No available port found (3000-3005). Close other instances and retry.');
}

let PORT = 3000;

// ─── Path helpers ─────────────────────────────────────────────────────────────
function getWebDir() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'apps', 'web');
  }
  const unpackedRoot = app.getAppPath() + '.unpacked';
  return path.join(unpackedRoot, 'apps', 'web');
}

function getDataDir() {
  return process.env.TAKEOVER_DATA_DIR || path.join(app.getPath('home'), '.takeover-data');
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-auto-launch', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-auto-launch', (_e, enabled) => app.setLoginItemSettings({ openAtLogin: Boolean(enabled) }));
ipcMain.on('relaunch-app', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-port', () => PORT);
ipcMain.handle('get-data-dir', () => getDataDir());

ipcMain.handle('show-save-dialog', async (_e, options) => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  return dialog.showSaveDialog(win, options);
});

ipcMain.handle('copy-file', (_e, src, dst) => {
  try {
    fs.copyFileSync(src, dst);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Settings helpers ─────────────────────────────────────────────────────────
function getSettingsPath() {
  return path.join(getDataDir(), 'settings.json');
}
function readSettings() {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const prev = readSettings();
    fs.writeFileSync(getSettingsPath(), JSON.stringify({ ...prev, ...patch }, null, 2), 'utf8');
  } catch (e) {
    console.error('[Takeover] Could not write settings:', e.message);
  }
}

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverReady = false;

// ─── Splash ───────────────────────────────────────────────────────────────────
function showSplashError(message) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = JSON.stringify(message);
  splashWindow.webContents.executeJavaScript(`
    (function() {
      var s = document.getElementById('status');
      if (s) { s.textContent = ${safeMsg}; s.style.color = '#f87171'; }
      var bar = document.querySelector('.loader-bar');
      if (bar) { bar.style.animation = 'none'; bar.style.background = '#f87171'; bar.style.width = '100%'; }
    })();
  `).catch(() => {});
}

function updateSplashStatus(message) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = JSON.stringify(message);
  splashWindow.webContents.executeJavaScript(`
    (function() { var s = document.getElementById('status'); if (s) s.textContent = ${safeMsg}; })();
  `).catch(() => {});
}

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ─── Main Window ──────────────────────────────────────────────────────────────
function createWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Takeover',
    icon: path.join(__dirname, 'icons', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
    show: false,
    backgroundColor: '#050510',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  const targetURL = `http://localhost:${PORT}`;
  console.log('[Takeover] Loading:', targetURL);
  mainWindow.loadURL(targetURL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // External links → OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        setImmediate(() => mainWindow && mainWindow.loadURL(url));
      } else {
        shell.openExternal(url);
      }
    } catch (_) {}
    return { action: 'deny' };
  });

  // Context menu (copy/paste)
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const menu = new Menu();
    if (params.selectionText) menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
    }
    if (menu.items.length > 0) menu.popup({ window: mainWindow });
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Server ───────────────────────────────────────────────────────────────────
async function startServer() {
  PORT = await findAvailablePort();
  const WEB_DIR = getWebDir();
  const DATA_DIR = getDataDir();

  console.log('[Takeover] Web dir:', WEB_DIR);
  console.log('[Takeover] Data dir:', DATA_DIR);
  console.log('[Takeover] Port:', PORT);

  const serverEnv = {
    ...process.env,
    PORT: String(PORT),
    BROWSER: 'none',
    TAKEOVER_DATA_DIR: DATA_DIR,
    TAKEOVER_WEB_DIR: WEB_DIR,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct',
  };

  const spawnOpts = { windowsHide: true };

  if (!app.isPackaged) {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    serverProcess = spawn(cmd, ['run', 'dev'], { cwd: WEB_DIR, env: serverEnv, ...spawnOpts });
  } else {
    const standaloneDir = path.join(WEB_DIR, '.next', 'standalone');
    const serverScript = path.join(standaloneDir, 'server.js');
    if (!fs.existsSync(serverScript)) {
      showSplashError('Server files missing — please reinstall Takeover.');
      setTimeout(() => app.quit(), 6000);
      return;
    }
    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: standaloneDir,
      env: { ...serverEnv, ELECTRON_RUN_AS_NODE: '1', __NEXT_PRIVATE_STANDALONE_CONFIG: 'true' },
      ...spawnOpts
    });
  }

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log(`[Takeover Server] ${msg.trim()}`);
    if (!serverReady && (
      msg.includes('Ready on') ||
      msg.includes('started server on') ||
      msg.includes('Local:') ||
      msg.includes('ready started') ||
      msg.includes(`Listening on`) ||
      msg.includes(`:${PORT}`)
    )) {
      serverReady = true;
      console.log('[Takeover] Server ready — opening window.');
      createWindow();
    }
  });

  let stderrBuffer = '';
  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    console.error(`[Takeover Server ERR] ${msg}`);
    stderrBuffer = (stderrBuffer + '\n' + msg).slice(-300).trim();
  });

  serverProcess.on('close', (code) => {
    console.log(`[Takeover] Server exited (code ${code})`);
    if (!serverReady) {
      const hint = stderrBuffer ? stderrBuffer.split('\n').pop().slice(0, 120) : 'Check no other instance is running.';
      showSplashError(`Server stopped (code ${code}).\n${hint}`);
      setTimeout(() => app.quit(), 8000);
    } else if (!app.isQuitting) {
      const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
      const opts = {
        type: 'error',
        title: 'Takeover — Server Stopped',
        message: 'The Takeover server stopped unexpectedly.',
        detail: 'Restart Takeover to continue.',
        buttons: ['Restart', 'Quit'],
        defaultId: 0,
      };
      (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then(({ response }) => {
        if (response === 0) { app.relaunch(); app.quit(); } else { app.quit(); }
      });
    }
  });

  // Fallback — open after 45s even if no ready signal
  setTimeout(() => {
    if (!serverReady) {
      console.warn('[Takeover] Timeout — opening window anyway.');
      serverReady = true;
      createWindow();
    }
  }, 45000);
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.on('ready', async () => {
  showSplash();
  createTray(() => mainWindow, app, () => PORT);
  try {
    await startServer();
  } catch (err) {
    console.error('[Takeover] Failed to start server:', err.message);
    showSplashError(`Failed to start: ${err.message}`);
    setTimeout(() => app.quit(), 6000);
  }
});

app.on('window-all-closed', () => {
  // Intentionally stay alive in tray
});

app.on('activate', () => {
  if (mainWindow === null) {
    if (serverReady) createWindow();
  } else {
    mainWindow.show();
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    const proc = serverProcess;
    serverProcess = null;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    proc.once('exit', finish);
    try { proc.kill('SIGTERM'); } catch (_) {}
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} finish(); }, 5000);
    if (timer.unref) timer.unref();
  });
}

app.on('before-quit', (event) => {
  app.isQuitting = true;
  if (serverProcess) {
    event.preventDefault();
    stopServer().then(() => app.quit());
  }
});
