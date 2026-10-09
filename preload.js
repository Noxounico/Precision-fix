const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('info'),
  apply: (ids) => ipcRenderer.invoke('apply', ids),
  restore: () => ipcRenderer.invoke('restore'),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, v) => cb(v)),
});
