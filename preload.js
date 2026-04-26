/* ============================================
   EngiLink Dictionary — Preload (Overlay)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  // Lookup
  lookupWord: (word) => ipcRenderer.invoke('lookup:word', word),

  // Overlay controls
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  resizeOverlay: (height) => ipcRenderer.send('overlay:resize', height),
  openDashboard: () => ipcRenderer.send('dashboard:open'),

  // Word operations
  toggleFavorite: (wordId) => ipcRenderer.invoke('words:toggleFavorite', wordId),
  updateWord: (word) => ipcRenderer.invoke('words:update', word),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),

  // Events from main
  onLookupStart: (callback) => {
    ipcRenderer.on('lookup:start', (event, word) => callback(word));
  },
});
