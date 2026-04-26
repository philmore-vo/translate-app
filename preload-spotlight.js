const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spotlight', {
  submit: (text) => ipcRenderer.send('spotlight:submit', text),
  hide: () => ipcRenderer.send('spotlight:hide'),
  onShow: (callback) => {
    ipcRenderer.on('spotlight:show', () => callback());
  },
});
