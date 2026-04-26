/* ============================================
   EngiLink Dictionary — Preload (Dashboard)
   ============================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eld', {
  // Database
  loadData: () => ipcRenderer.invoke('db:load'),
  saveData: (data) => ipcRenderer.invoke('db:save', data),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  exportData: () => ipcRenderer.invoke('db:export'),
  importData: (json) => ipcRenderer.invoke('db:import', json),
  resetData: () => ipcRenderer.invoke('db:reset'),

  // Words
  getAllWords: () => ipcRenderer.invoke('words:getAll'),
  deleteWord: (id) => ipcRenderer.invoke('words:delete', id),
  updateWord: (word) => ipcRenderer.invoke('words:update', word),
  toggleFavorite: (id) => ipcRenderer.invoke('words:toggleFavorite', id),
  lookupWord: (word) => ipcRenderer.invoke('lookup:word', word),

  // Stats
  getStats: () => ipcRenderer.invoke('stats:get'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Events
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, page) => callback(page));
  },
});
