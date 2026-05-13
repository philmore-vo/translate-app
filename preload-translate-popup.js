/* ============================================
   EngiLink Dictionary — Preload (Translate Popup)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  onTranslateResult: (callback) =>
    ipcRenderer.on('translate:result', (event, payload) => callback(payload)),
  addWordToLibrary: (word) =>
    ipcRenderer.invoke('translatePopup:addWord', word),
  addAllWords: (words) =>
    ipcRenderer.invoke('translatePopup:addAllWords', words),
  close: () => ipcRenderer.send('translatePopup:close'),
  lookupWord: (word) => ipcRenderer.send('translatePopup:lookupWord', word),
});
