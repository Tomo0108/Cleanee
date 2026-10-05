'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();
ipcRenderer.on('progress', (_e, task, data) => {
  (listeners.get(task) || []).forEach((cb) => cb(data));
});

contextBridge.exposeInMainWorld('cleanee', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  onNavigate: (cb) => {
    const h = (_e, page) => cb(page);
    ipcRenderer.on('navigate', h);
    return () => ipcRenderer.removeListener('navigate', h);
  },
  onProgress: (task, cb) => {
    const arr = listeners.get(task) || [];
    arr.push(cb);
    listeners.set(task, arr);
    return () => listeners.set(task, (listeners.get(task) || []).filter((x) => x !== cb));
  },
});
