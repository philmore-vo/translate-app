/* ============================================
   EngiLink Dictionary — Preload (Snip)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  captureRegion: (rect) => ipcRenderer.send('ocr:captureRegion', rect),
  captureRegionTranslate: (rect) => ipcRenderer.send('ocr:captureRegionTranslate', rect),
  startLiveRegion: (rect) => ipcRenderer.send('ocr:startLiveRegion', rect),
  submitPreview: (payload) => ipcRenderer.send('ocr:previewAction', payload),
  cancelSnip: () => ipcRenderer.send('ocr:cancel'),
  onPreview: (callback) => ipcRenderer.on('ocr:preview', (event, payload) => callback(payload)),
});
