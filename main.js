const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const tweaks = require('./tweaks');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 620,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#08080a',
    title: 'PrecisionFix',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  if (process.platform !== 'win32') {
    dialog.showErrorBox('PrecisionFix', 'O PrecisionFix só funciona no Windows.');
    app.quit();
    return;
  }

  ipcMain.handle('info', () => tweaks.info());

  ipcMain.handle('apply', async (_e, ids) => {
    try {
      return await tweaks.applyMany(ids, (p) => win.webContents.send('progress', p));
    } catch (err) {
      return { applied: 0, errors: [], fatal: err.message };
    }
  });

  ipcMain.handle('restore', async () => {
    try {
      await tweaks.restoreAll();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
