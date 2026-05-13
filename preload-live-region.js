/* ============================================
   EngiLink Dictionary — Preload (Live Region Overlay)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveRegion', {
  onStatus:     (cb) => ipcRenderer.on('liveRegion:status', (_, v) => cb(v)),
  onResult:     (cb) => ipcRenderer.on('liveRegion:result', (_, v) => cb(v)),
  onConfig:     (cb) => ipcRenderer.on('liveRegion:config', (_, v) => cb(v)),
  stop:         ()  => ipcRenderer.send('liveRegion:stop'),
  translateNow: ()  => ipcRenderer.send('liveRegion:translateNow'),
  mouseEnter:   ()  => ipcRenderer.send('liveRegion:mouseEnter'),
  mouseLeave:   ()  => ipcRenderer.send('liveRegion:mouseLeave'),
  resize:       (h) => ipcRenderer.send('liveRegion:resizeHeight', h),
  addWord:      (w) => ipcRenderer.invoke('translatePopup:addWord', w),
  addAllWords:  (ws) => ipcRenderer.invoke('translatePopup:addAllWords', ws),
});
