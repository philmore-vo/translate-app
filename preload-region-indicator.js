/* ============================================
   EngiLink — Region Indicator Preload
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regionIndicator', {
  startResize: (dir) => ipcRenderer.send('liveRegion:startResize', dir),
  stopResize:  ()    => ipcRenderer.send('liveRegion:stopResize'),
  mouseEnter:  ()    => ipcRenderer.send('liveRegion:indicatorMouseEnter'),
  mouseLeave:  ()    => ipcRenderer.send('liveRegion:indicatorMouseLeave'),
});
