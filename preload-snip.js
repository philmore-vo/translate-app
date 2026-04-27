/* ============================================
   EngiLink Dictionary — Preload (Snip)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  captureRegion: (rect) => ipcRenderer.send('ocr:captureRegion', rect),
  submitPreview: (payload) => ipcRenderer.send('ocr:previewAction', payload),
  cancelSnip: () => ipcRenderer.send('ocr:cancel'),
  onPreview: (callback) => ipcRenderer.on('ocr:preview', (event, payload) => callback(payload)),
});
