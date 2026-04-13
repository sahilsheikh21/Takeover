'use strict';
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function createTray(getMainWindow, electronApp, getPort) {
  // Prefer shipped tray/app icon assets; fall back to generated icon if unavailable.
  const iconCandidates = ['tray.png', 'icon.png'];
  let icon;
  for (const name of iconCandidates) {
    const candidatePath = path.join(__dirname, 'icons', name);
    if (!fs.existsSync(candidatePath)) continue;
    const candidate = nativeImage.createFromPath(candidatePath);
    if (!candidate.isEmpty()) {
      icon = candidate;
      break;
    }
  }

  if (!icon) {
    // Create a simple programmatic icon (16x16 purple square)
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABOSURBVDiNY2BgYPj/n4GBgYGBgeE/A8OANAAHMDAwMDCwMzAwMDRhAGb///8zMDAwMDA8/w8VYCAI/wcGRiD+DxRjDVIMAwMDA8P/BwBe7w+V'
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('Takeover AI');

  function buildMenu() {
    const port = getPort ? getPort() : 3000;
    return Menu.buildFromTemplate([
      { label: 'Takeover AI', enabled: false },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          const win = getMainWindow();
          if (win) { win.show(); win.focus(); }
        }
      },
      {
        label: 'Settings',
        click: () => {
          const win = getMainWindow();
          if (win) { 
            win.loadURL(`http://localhost:${port}/settings`);
            win.show(); 
            win.focus(); 
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Takeover',
        click: () => {
          electronApp.isQuitting = true;
          electronApp.quit();
        }
      }
    ]);
  }

  tray.setContextMenu(buildMenu());

  tray.on('double-click', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.focus();
      } else {
        win.show();
        win.focus();
      }
    }
  });

  return tray;
}

module.exports = { createTray };
