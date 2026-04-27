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
  updateNote: (id, note) => ipcRenderer.invoke('words:updateNote', id, note),
  batchDelete: (ids) => ipcRenderer.invoke('words:batchDelete', ids),
  lookupWord: (word, options) => ipcRenderer.invoke('lookup:word', word, options),

  // Stats
  getStats: () => ipcRenderer.invoke('stats:get'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // AI Test
  testAI: (settings) => ipcRenderer.invoke('ai:testConnection', settings),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // SRS Study
  getDueCards: () => ipcRenderer.invoke('study:getDueCards'),
  getStudyCards: (opts) => ipcRenderer.invoke('study:getStudyCards', opts),
  reviewCard: (wordId, quality) => ipcRenderer.invoke('study:reviewCard', wordId, quality),

  // Cache
  pruneCache: () => ipcRenderer.invoke('cache:prune'),

  // Hotkeys
  updateHotkeys: (hotkeys) => ipcRenderer.invoke('hotkeys:update', hotkeys),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Overlay
  showOverlay: (word) => ipcRenderer.send('overlay:show', word),
  previewTheme: (theme) => ipcRenderer.send('theme:preview', theme),

  // Events
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, page) => callback(page));
  },
});
