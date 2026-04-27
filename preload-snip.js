/* ============================================
   EngiLink Dictionary — Preload (Snip)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  captureRegion: (rect) => ipcRenderer.send('ocr:captureRegion', rect),
  cancelSnip: () => ipcRenderer.send('ocr:cancel'),
});
