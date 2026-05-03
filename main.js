/* ============================================
   EngiLink Dictionary — Electron Main Process
   ============================================ */

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, screen, Tray, Menu, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { classifyInput, extractVocabulary } = require('./js/stop-words');

// ── Database file path ──
const DB_DIR = path.join(app.getPath('userData'), 'engilink-db');
const DB_FILE = path.join(DB_DIR, 'data.json');
const DB_BACKUP = path.join(DB_DIR, 'data.backup.json');
const DB_BACKUP_DIR = path.join(DB_DIR, 'backups');
const MAX_AUTO_BACKUPS = 5;

// ── Default data structure (V8) ──
const DEFAULT_DATA = {
  schemaVersion: 8,
  words: [],
  lookupHistory: [],
  aiCache: {},
  settings: {
    apiKey: '',
    model: 'google/gemini-2.0-flash-exp:free',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    targetLanguage: 'Vietnamese',
    hotkeys: {
      lookup: 'CommandOrControl+Shift+Z',
      spotlight: 'CommandOrControl+Shift+Space',
      ocr: 'CommandOrControl+Shift+X',
    },
    overlayWidth: 380,
    overlayMaxHeight: 520,
    theme: 'light',
    ocrLanguage: 'eng',
    pronunciationAccent: 'en-US',
    onboardingCompleted: false,
    onboardingCompletedAt: '',
    lastHealthCheckAt: '',
    autoSave: true,
    showRelatedWords: true,
  },
  stats: {
    totalLookups: 0,
    todayLookups: 0,
    streak: 0,
    lastActiveDate: '',
  },
};

// ── Schema migration ──
function migrateDatabase(data) {
  const version = data.schemaVersion || 1;
  let changed = false;

  if (version < 2) {
    // New collections
    if (!data.lookupHistory) data.lookupHistory = [];
    if (!data.aiCache) data.aiCache = {};

    // Deep-merge settings.hotkeys (not shallow)
    const defaultHotkeys = { ...DEFAULT_DATA.settings.hotkeys };
    const existingHotkeys = data.settings.hotkeys || {};
    const hasCustomLookup = existingHotkeys.lookup && existingHotkeys.lookup !== DEFAULT_DATA.settings.hotkeys.lookup;
    if (data.settings.hotkey && !hasCustomLookup) {
      existingHotkeys.lookup = data.settings.hotkey;
    }
    data.settings.hotkeys = { ...defaultHotkeys, ...existingHotkeys };
    // Remove old single hotkey fields
    delete data.settings.hotkey;
    delete data.settings.hotkeyDoubleCopyMs;

    if (!data.settings.targetLanguage) {
      data.settings.targetLanguage = 'Vietnamese';
    }

    // Migrate each word
    for (const w of data.words) {
      // SRS defaults
      if (w.easeFactor === undefined) w.easeFactor = 2.5;
      if (w.interval === undefined) w.interval = 0;
      if (w.repetitions === undefined) w.repetitions = 0;
      if (w.dueDate === undefined) w.dueDate = null;
      // Rename vietnameseMeaning → translatedMeaning
      if (w.vietnameseMeaning && !w.translatedMeaning) {
        w.translatedMeaning = w.vietnameseMeaning;
      }
      if (!w.translatedMeaning) w.translatedMeaning = '';
    }

    data.schemaVersion = 2;
    changed = true;
    console.log('📦 Migrated database to schema v2');
  }

  // ── V2 → V3 ──
  if (version < 3) {
    if (!data.settings.theme || data.settings.theme === 'playful') {
      data.settings.theme = 'light';
    }
    data.schemaVersion = 3;
    changed = true;
    console.log('📦 Migrated database to schema v3');
  }

  if (version < 4) {
    if (data.settings.onboardingCompleted === undefined) {
      data.settings.onboardingCompleted = false;
    }
    if (!data.settings.onboardingCompletedAt) {
      data.settings.onboardingCompletedAt = '';
    }
    data.schemaVersion = 4;
    changed = true;
    console.log('Migrated database to schema v4');
  }

  if (version < 5) {
    if (!data.settings.lastHealthCheckAt) {
      data.settings.lastHealthCheckAt = '';
    }
    data.schemaVersion = 5;
    changed = true;
    console.log('Migrated database to schema v5');
  }

  // ── V5 → V6: Enhanced word data ──
  if (version < 6) {
    for (const w of data.words) {
      if (!w.contexts) w.contexts = [];
      if (!w.synonyms) w.synonyms = [];
      if (!w.antonyms) w.antonyms = [];
      if (!w.prepositions) w.prepositions = [];
      if (w.verbForms === undefined) w.verbForms = null;
      if (!w.exampleSentence) w.exampleSentence = '';
      if (!w.phraseType) w.phraseType = '';
      if (!w.enrichmentStatus) w.enrichmentStatus = 'done';
    }
    data.schemaVersion = 6;
    changed = true;
    console.log('📦 Migrated database to schema v6 (enhanced word data)');
  }

  if (version < 7) {
    for (const w of data.words) {
      if (GENERAL_TOPIC_WORDS.has(normalizeWordKey(w.word))) {
        w.topic = 'General';
      }
    }
    data.schemaVersion = 7;
    changed = true;
    console.log('Migrated database to schema v7 (word-level topic cleanup)');
  }

  if (version < 8) {
    for (const w of data.words) {
      if (!Array.isArray(w.antonyms)) w.antonyms = [];
      w.enrichmentVersion = w.antonyms.length > 0 ? 2 : (Number(w.enrichmentVersion) || 1);
    }
    data.aiCache = {};
    data.schemaVersion = 8;
    changed = true;
    console.log('Migrated database to schema v8 (antonyms enrichment)');
  }

  return { data, changed };
}

// ── Helpers ──
function joinApiPath(base, apiPath) {
  return `${base.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
}

function getUnpackedAssetPath(...segments) {
  if (app.isPackaged) {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', ...segments);
    if (fs.existsSync(unpackedPath)) return unpackedPath;
  }
  return path.join(__dirname, ...segments);
}

function isLocalHttpHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function isSafeApiEndpoint(apiUrl) {
  return apiUrl.protocol === 'https:' || (apiUrl.protocol === 'http:' && isLocalHttpHost(apiUrl.hostname));
}

function buildCacheKey(text, inputType, targetLang, endpoint, model) {
  const normalized = text.toLowerCase().trim();
  const raw = `${normalized}|${inputType}|${targetLang}|${endpoint}|${model}|pv4`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getLocalDateStr(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeDatabaseShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid database file');
  }
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) data.settings = {};
  data.settings = {
    ...DEFAULT_DATA.settings,
    ...data.settings,
    hotkeys: { ...DEFAULT_DATA.settings.hotkeys, ...(data.settings.hotkeys || {}) },
  };
  if (!Array.isArray(data.words)) data.words = [];
  if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) data.stats = {};
  data.stats = { ...DEFAULT_DATA.stats, ...data.stats };
  if (!Array.isArray(data.lookupHistory)) data.lookupHistory = [];
  if (!data.aiCache || typeof data.aiCache !== 'object' || Array.isArray(data.aiCache)) data.aiCache = {};
  return migrateDatabase(data).data;
}

function ensureBackupDir() {
  ensureDbDir();
  if (!fs.existsSync(DB_BACKUP_DIR)) {
    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
  }
}

function safeBackupReason(reason) {
  return String(reason || 'manual').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'manual';
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getBackupMeta(filePath) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

function listAutoBackups() {
  ensureBackupDir();
  return fs.readdirSync(DB_BACKUP_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => getBackupMeta(path.join(DB_BACKUP_DIR, name)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function pruneAutoBackups() {
  const backups = listAutoBackups();
  for (const backup of backups.slice(MAX_AUTO_BACKUPS)) {
    try {
      fs.unlinkSync(backup.path);
    } catch (err) {
      console.error('Failed to prune backup:', backup.name, err.message);
    }
  }
}

function createAutoBackup(reason) {
  ensureBackupDir();
  if (!fs.existsSync(DB_FILE)) return null;
  const fileName = `data.${backupTimestamp()}.${safeBackupReason(reason)}.json`;
  const filePath = path.join(DB_BACKUP_DIR, fileName);
  fs.copyFileSync(DB_FILE, filePath);
  pruneAutoBackups();
  return getBackupMeta(filePath);
}

function resolveBackupPath(name) {
  const safeName = path.basename(String(name || ''));
  if (!safeName || !safeName.endsWith('.json')) {
    throw new Error('Invalid backup file name');
  }
  const filePath = path.join(DB_BACKUP_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }
  return filePath;
}

let tray = null;
let overlayWindow = null;
let dashboardWindow = null;
let runtimeTheme = null;

/* ══════════════════════════════════════════════
   DATABASE OPERATIONS
   ══════════════════════════════════════════════ */

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function loadDatabase() {
  ensureDbDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      let data = JSON.parse(raw);
      // Deep-merge settings (including nested hotkeys)
      data.settings = {
        ...DEFAULT_DATA.settings,
        ...data.settings,
        hotkeys: { ...DEFAULT_DATA.settings.hotkeys, ...(data.settings?.hotkeys || {}) },
      };
      if (!data.words) data.words = [];
      if (!data.stats) data.stats = { ...DEFAULT_DATA.stats };
      if (!data.lookupHistory) data.lookupHistory = [];
      if (!data.aiCache) data.aiCache = {};

      // Run migration
      const { data: migrated, changed } = migrateDatabase(data);
      if (changed) saveDatabase(migrated);
      return migrated;
    }
  } catch (err) {
    console.error('Failed to load database, trying backup:', err.message);
    try {
      if (fs.existsSync(DB_BACKUP)) {
        const raw = fs.readFileSync(DB_BACKUP, 'utf-8');
        let data = JSON.parse(raw);
        data.settings = {
          ...DEFAULT_DATA.settings,
          ...data.settings,
          hotkeys: { ...DEFAULT_DATA.settings.hotkeys, ...(data.settings?.hotkeys || {}) },
        };
        const { data: migrated, changed } = migrateDatabase(data);
        if (changed) saveDatabase(migrated);
        console.log('Restored from backup successfully');
        return migrated;
      }
    } catch (backupErr) {
      console.error('Backup also failed:', backupErr.message);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveDatabase(data) {
  ensureDbDir();
  try {
    const json = JSON.stringify(data, null, 2);
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, json, 'utf-8');
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_BACKUP);
    }
    fs.renameSync(tmpFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('Failed to save database:', err.message);
    return false;
  }
}

/* ══════════════════════════════════════════════
   DICTIONARY API (Main Process — avoid CORS)
   ══════════════════════════════════════════════ */

function restoreFullBackupJson(jsonStr, reason) {
  try {
    const parsed = JSON.parse(jsonStr);
    const data = normalizeDatabaseShape(parsed);
    const backup = createAutoBackup(reason || 'restore-full');
    const success = saveDatabase(data);
    return {
      success,
      backup,
      words: Array.isArray(data.words) ? data.words.length : 0,
      history: Array.isArray(data.lookupHistory) ? data.lookupHistory.length : 0,
    };
  } catch (err) {
    console.error('Restore failed:', err.message);
    return { success: false, error: err.message };
  }
}

function getAppHealthCheck() {
  const db = loadDatabase();
  let backups = [];
  let backupError = '';

  try {
    backups = listAutoBackups();
  } catch (err) {
    backupError = err.message;
  }

  const ocrLang = db.settings.ocrLanguage || 'eng';
  const ocrLangPath = typeof getOcrLangPath === 'function' ? getOcrLangPath() : __dirname;
  const ocrDataPath = path.join(ocrLangPath, `${ocrLang}.traineddata`);
  const hotkeys = db.settings.hotkeys || {};
  const checks = [];

  const addCheck = (id, label, status, detail) => {
    checks.push({ id, label, status, detail });
  };

  addCheck(
    'database',
    'Database',
    fs.existsSync(DB_FILE) ? 'ok' : 'warn',
    fs.existsSync(DB_FILE) ? `Ready at ${DB_FILE}` : 'Database file will be created after the first save.'
  );

  addCheck(
    'library',
    'Library',
    db.words.length > 0 ? 'ok' : 'warn',
    `${db.words.length} saved word${db.words.length === 1 ? '' : 's'}.`
  );

  addCheck(
    'api',
    'AI Settings',
    db.settings.apiKey ? 'ok' : 'warn',
    db.settings.apiKey ? `Model: ${db.settings.model}` : 'API key is missing. Lookup still opens, but AI explanations will fail.'
  );

  let endpointOk = false;
  try {
    const endpoint = new URL(db.settings.apiEndpoint || '');
    endpointOk = isSafeApiEndpoint(endpoint);
  } catch {
    endpointOk = false;
  }
  addCheck(
    'endpoint',
    'API Endpoint',
    endpointOk ? 'ok' : 'error',
    endpointOk ? db.settings.apiEndpoint : 'Endpoint must be HTTPS, or HTTP only for localhost.'
  );

  addCheck(
    'ocr',
    'OCR Language Data',
    fs.existsSync(ocrDataPath) ? 'ok' : 'warn',
    fs.existsSync(ocrDataPath)
      ? `${ocrLang}.traineddata found.`
      : `${ocrLang}.traineddata is missing from ${ocrLangPath}.`
  );

  addCheck(
    'backup',
    'Auto Backup',
    backups.length > 0 ? 'ok' : 'warn',
    backupError || (backups.length > 0 ? `${backups.length} auto-backup file${backups.length === 1 ? '' : 's'} kept.` : 'No auto-backup yet.')
  );

  addCheck(
    'hotkeys',
    'Hotkeys',
    hotkeys.lookup ? 'ok' : 'warn',
    `Lookup: ${hotkeys.lookup || 'not set'} | Spotlight: ${hotkeys.spotlight || 'not set'} | OCR: ${hotkeys.ocr || 'not set'}`
  );

  const overall = checks.some((c) => c.status === 'error')
    ? 'error'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok';

  db.settings.lastHealthCheckAt = new Date().toISOString();
  saveDatabase(db);

  return {
    success: true,
    overall,
    generatedAt: db.settings.lastHealthCheckAt,
    appVersion: app.getVersion(),
    schemaVersion: db.schemaVersion || DEFAULT_DATA.schemaVersion,
    dbPath: DB_FILE,
    backupDir: DB_BACKUP_DIR,
    wordCount: db.words.length,
    historyCount: db.lookupHistory.length,
    cacheCount: Object.keys(db.aiCache || {}).length,
    checks,
  };
}

function normalizeWordKey(word) {
  return String(word || '').trim().toLowerCase();
}

function toArrayList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[;,|]/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  return false;
}

function firstDefinition(word) {
  for (const meaning of word.meanings || []) {
    for (const def of meaning.definitions || []) {
      if (def && def.definition) return def.definition;
    }
  }
  return word.technicalNote || '';
}

function normalizeImportedWord(raw) {
  const source = typeof raw === 'string' ? { word: raw } : raw;
  if (!source || typeof source !== 'object') return null;
  const word = String(source.word || source.term || source.text || '').trim();
  if (!word) return null;

  const now = new Date().toISOString();
  const translatedMeaning = String(
    source.translatedMeaning || source.translation || source.vietnameseMeaning || source.meaning || ''
  ).trim();
  const technicalNote = String(source.technicalNote || source.definition || source.note || '').trim();
  const relatedTerms = toArrayList(source.relatedTerms || source.tags || source.related);
  const meanings = Array.isArray(source.meanings)
    ? source.meanings
    : (technicalNote ? [{
      partOfSpeech: source.partOfSpeech || '',
      definitions: [{ definition: technicalNote, example: source.example || '' }],
      synonyms: toArrayList(source.synonyms),
      antonyms: toArrayList(source.antonyms),
    }] : []);

  return {
    id: source.id || crypto.randomUUID(),
    word,
    phonetic: source.phonetic || '',
    audioUrl: source.audioUrl || '',
    meanings,
    technicalNote,
    translatedMeaning,
    vietnameseMeaning: source.vietnameseMeaning || translatedMeaning,
    topic: source.topic || '',
    tags: toArrayList(source.tags || relatedTerms),
    relatedTerms,
    userNote: source.userNote || source.personalNote || '',
    isFavorite: toBool(source.isFavorite),
    lookupCount: Number(source.lookupCount) || 1,
    firstLookup: source.firstLookup || now,
    lastLookup: source.lastLookup || now,
    isPhrase: source.isPhrase !== undefined ? Boolean(source.isPhrase) : word.split(/\s+/).length > 1,
    easeFactor: Number(source.easeFactor) || 2.5,
    interval: Number(source.interval) || 0,
    repetitions: Number(source.repetitions) || 0,
    dueDate: source.dueDate || null,
    // V6 fields
    contexts: Array.isArray(source.contexts) ? source.contexts : [],
    synonyms: Array.isArray(source.synonyms) ? source.synonyms : [],
    antonyms: Array.isArray(source.antonyms) ? source.antonyms : [],
    prepositions: Array.isArray(source.prepositions) ? source.prepositions : [],
    verbForms: source.verbForms || null,
    exampleSentence: source.exampleSentence || source.example || '',
    phraseType: source.phraseType || source.partOfSpeech || '',
    enrichmentStatus: source.enrichmentStatus || 'done',
    enrichmentVersion: Number(source.enrichmentVersion) || (Array.isArray(source.antonyms) && source.antonyms.length > 0 ? 2 : 1),
  };
}

function mergeImportedWord(existing, incoming) {
  const merged = { ...existing };
  const fillFields = [
    'phonetic', 'audioUrl', 'technicalNote', 'translatedMeaning', 'vietnameseMeaning',
    'topic', 'firstLookup', 'lastLookup', 'exampleSentence', 'phraseType',
  ];
  for (const field of fillFields) {
    if (!merged[field] && incoming[field]) merged[field] = incoming[field];
  }
  if ((!merged.meanings || merged.meanings.length === 0) && incoming.meanings && incoming.meanings.length) {
    merged.meanings = incoming.meanings;
  }
  if ((!merged.tags || merged.tags.length === 0) && incoming.tags && incoming.tags.length) {
    merged.tags = incoming.tags;
  }
  if ((!merged.relatedTerms || merged.relatedTerms.length === 0) && incoming.relatedTerms && incoming.relatedTerms.length) {
    merged.relatedTerms = incoming.relatedTerms;
  }
  if (!merged.userNote && incoming.userNote) merged.userNote = incoming.userNote;
  if (merged.isFavorite === undefined) merged.isFavorite = incoming.isFavorite || false;
  if (!merged.lookupCount && incoming.lookupCount) merged.lookupCount = incoming.lookupCount;
  if (merged.easeFactor === undefined) merged.easeFactor = incoming.easeFactor || 2.5;
  if (merged.interval === undefined) merged.interval = incoming.interval || 0;
  if (merged.repetitions === undefined) merged.repetitions = incoming.repetitions || 0;
  if (merged.dueDate === undefined) merged.dueDate = incoming.dueDate || null;

  // V6 fields — merge arrays (union), fill scalars
  if (incoming.contexts && incoming.contexts.length) {
    if (!merged.contexts) merged.contexts = [];
    for (const ctx of incoming.contexts) {
      if (!merged.contexts.some((c) => c.sentence === ctx.sentence)) {
        merged.contexts.push(ctx);
      }
    }
    if (merged.contexts.length > 5) merged.contexts = merged.contexts.slice(-5);
  }
  if (incoming.synonyms && incoming.synonyms.length) {
    if (!merged.synonyms) merged.synonyms = [];
    for (const syn of incoming.synonyms) {
      if (!merged.synonyms.some((s) => s.word === syn.word)) {
        merged.synonyms.push(syn);
      }
    }
  }
  if (incoming.antonyms && incoming.antonyms.length) {
    if (!merged.antonyms) merged.antonyms = [];
    for (const ant of incoming.antonyms) {
      const incomingWord = typeof ant === 'string' ? ant : ant.word;
      if (!merged.antonyms.some((a) => (typeof a === 'string' ? a : a.word) === incomingWord)) {
        merged.antonyms.push(ant);
      }
    }
  }
  if (incoming.prepositions && incoming.prepositions.length) {
    if (!merged.prepositions) merged.prepositions = [];
    for (const prep of incoming.prepositions) {
      if (!merged.prepositions.some((p) => p.phrase === prep.phrase)) {
        merged.prepositions.push(prep);
      }
    }
  }
  if (!merged.verbForms && incoming.verbForms) merged.verbForms = incoming.verbForms;
  if (merged.enrichmentStatus === undefined) merged.enrichmentStatus = incoming.enrichmentStatus || 'done';
  merged.enrichmentVersion = Math.max(Number(merged.enrichmentVersion) || 1, Number(incoming.enrichmentVersion) || 1);
  return merged;
}

function csvEscape(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function wordsToCsv(words) {
  const headers = ['word', 'translatedMeaning', 'definition', 'topic', 'phonetic', 'relatedTerms', 'userNote', 'isFavorite', 'lookupCount', 'phraseType', 'synonyms', 'antonyms', 'prepositions', 'verbForms', 'exampleSentence'];
  const rows = words.map((w) => [
    w.word,
    w.translatedMeaning || w.vietnameseMeaning || '',
    firstDefinition(w),
    w.topic || '',
    w.phonetic || '',
    (w.relatedTerms || w.tags || []).join('; '),
    w.userNote || '',
    w.isFavorite ? 'true' : 'false',
    w.lookupCount || 0,
    w.phraseType || '',
    (w.synonyms || []).map((s) => typeof s === 'string' ? s : `${s.word || ''}(${s.meaning || ''})`).join('; '),
    (w.antonyms || []).map((a) => typeof a === 'string' ? a : `${a.word || ''}(${a.meaning || ''})`).join('; '),
    (w.prepositions || []).map((p) => `${p.phrase || ''}→${p.meaning || ''}`).join('; '),
    w.verbForms ? `V2:${w.verbForms.v2 || ''} V3:${w.verbForms.v3 || ''}` : '',
    w.exampleSentence || '',
  ].map(csvEscape).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

function wordsToAnki(words) {
  return words.map((w) => {
    const extra = [
      w.verbForms ? `V2: ${w.verbForms.v2 || ''}, V3: ${w.verbForms.v3 || ''}` : '',
      (w.antonyms || []).map((a) => typeof a === 'string' ? a : `${a.word || ''}: ${a.meaning || ''}`).join(' | '),
      (w.prepositions || []).map((p) => `${p.phrase}: ${p.meaning || ''}`).join(' | '),
      w.exampleSentence || '',
    ].filter(Boolean).join(' / ');
    return [
      w.word,
      w.translatedMeaning || w.vietnameseMeaning || '',
      firstDefinition(w),
      w.topic || '',
      extra,
    ].map((v) => String(v || '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t');
  }).join('\r\n');
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

function rowsToImportedWords(rows, delimiterName) {
  if (!rows.length) return { words: [], errors: 0 };

  const header = rows[0].map((v) => v.trim().toLowerCase());
  const hasHeader = header.some((h) => ['word', 'term', 'text'].includes(h));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexOf = (names, fallback) => {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx >= 0) return idx;
    }
    return fallback;
  };

  const map = hasHeader ? {
    word: indexOf(['word', 'term', 'text'], 0),
    translatedMeaning: indexOf(['translatedmeaning', 'translation', 'vietnamesemeaning', 'meaning'], 1),
    definition: indexOf(['definition', 'technicalnote', 'note'], 2),
    topic: indexOf(['topic'], 3),
    phonetic: indexOf(['phonetic'], 4),
    relatedTerms: indexOf(['relatedterms', 'related', 'tags'], 5),
    userNote: indexOf(['usernote', 'personalnote'], 6),
    isFavorite: indexOf(['isfavorite', 'favorite'], 7),
    lookupCount: indexOf(['lookupcount'], 8),
  } : {
    word: 0,
    translatedMeaning: 1,
    definition: 2,
    topic: 3,
    phonetic: 4,
    relatedTerms: 5,
    userNote: 6,
    isFavorite: 7,
    lookupCount: 8,
  };

  const words = [];
  let errors = 0;
  for (const row of dataRows) {
    const imported = normalizeImportedWord({
      word: row[map.word],
      translatedMeaning: row[map.translatedMeaning],
      definition: row[map.definition],
      topic: row[map.topic],
      phonetic: row[map.phonetic],
      relatedTerms: row[map.relatedTerms],
      userNote: row[map.userNote],
      isFavorite: row[map.isFavorite],
      lookupCount: row[map.lookupCount],
    });
    if (imported) words.push(imported);
    else if (row.some((v) => String(v || '').trim())) errors++;
  }

  if (delimiterName === 'anki') {
    words.forEach((w) => { if (!w.topic) w.topic = 'Imported'; });
  }
  return { words, errors };
}

function parseWordImport(content, format, filename) {
  const ext = path.extname(filename || '').replace('.', '').toLowerCase();
  const fmt = String(format || ext || 'json').toLowerCase();

  if (fmt === 'json') {
    const parsed = JSON.parse(content);
    const source = Array.isArray(parsed) ? parsed : parsed.words;
    if (!Array.isArray(source)) throw new Error('JSON must be a word array or an object with words[]');
    const words = [];
    let errors = 0;
    for (const item of source) {
      const imported = normalizeImportedWord(item);
      if (imported) words.push(imported);
      else errors++;
    }
    return { words, errors };
  }

  if (fmt === 'csv') {
    return rowsToImportedWords(parseDelimitedText(content, ','), 'csv');
  }

  if (fmt === 'txt' || fmt === 'anki' || fmt === 'tsv') {
    return rowsToImportedWords(parseDelimitedText(content, '\t'), 'anki');
  }

  throw new Error(`Unsupported import format: ${fmt}`);
}

function importWordsIntoDatabase(content, format, filename) {
  try {
    const { words, errors } = parseWordImport(content, format, filename);
    if (!words.length) {
      return { success: false, error: 'No valid words found', added: 0, merged: 0, errors };
    }

    const db = loadDatabase();
    const backup = createAutoBackup('word-import');
    const existingByKey = new Map(db.words.map((w, idx) => [normalizeWordKey(w.word), idx]));
    const existingIds = new Set(db.words.map((w) => w.id).filter(Boolean));
    const existingCount = db.words.length;
    const newWords = [];
    let added = 0;
    let merged = 0;

    for (const incoming of words) {
      const key = normalizeWordKey(incoming.word);
      if (!key) continue;
      if (existingByKey.has(key)) {
        const idx = existingByKey.get(key);
        if (idx < existingCount) {
          db.words[idx] = mergeImportedWord(db.words[idx], incoming);
        } else {
          const newIdx = idx - existingCount;
          newWords[newIdx] = mergeImportedWord(newWords[newIdx], incoming);
        }
        merged++;
      } else {
        if (!incoming.id || existingIds.has(incoming.id)) incoming.id = crypto.randomUUID();
        existingIds.add(incoming.id);
        existingByKey.set(key, existingCount + newWords.length);
        newWords.push(incoming);
        added++;
      }
    }

    db.words = [...newWords, ...db.words];
    const success = saveDatabase(db);
    return { success, added, merged, errors, total: words.length, backup };
  } catch (err) {
    console.error('Word import failed:', err.message);
    return { success: false, error: err.message, added: 0, merged: 0, errors: 0 };
  }
}

function exportWordsFromDatabase(options = {}) {
  const db = loadDatabase();
  const ids = Array.isArray(options.ids) ? new Set(options.ids) : null;
  const words = ids && ids.size > 0 ? db.words.filter((w) => ids.has(w.id)) : db.words;
  const format = String(options.format || 'json').toLowerCase();
  const date = new Date().toISOString().split('T')[0];
  const suffix = ids && ids.size > 0 ? `${words.length}words` : 'all-words';

  if (format === 'csv') {
    return {
      success: true,
      content: wordsToCsv(words),
      filename: `engilink-${suffix}-${date}.csv`,
      mime: 'text/csv',
      count: words.length,
    };
  }

  if (format === 'anki' || format === 'txt') {
    return {
      success: true,
      content: wordsToAnki(words),
      filename: `engilink-${suffix}-anki-${date}.txt`,
      mime: 'text/plain',
      count: words.length,
    };
  }

  return {
    success: true,
    content: JSON.stringify(words, null, 2),
    filename: `engilink-${suffix}-${date}.json`,
    mime: 'application/json',
    count: words.length,
  };
}

function lookupDictionary(word, pronunciationAccent = 'en-US') {
  return new Promise((resolve) => {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase().trim())}`;

    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const entry = parsed[0];
            const audioUrls = extractAudioUrls(entry.phonetics || []);
            resolve({
              success: true,
              word: entry.word,
              phonetic: extractPhoneticText(entry.phonetics || [], pronunciationAccent) || entry.phonetic || '',
              audioUrl: pickPronunciationAudio(audioUrls, pronunciationAccent),
              audioUrls,
              meanings: (entry.meanings || []).map((m) => ({
                partOfSpeech: m.partOfSpeech,
                definitions: (m.definitions || []).slice(0, 3).map((d) => ({
                  definition: d.definition,
                  example: d.example || '',
                })),
                synonyms: (m.synonyms || []).slice(0, 5),
                antonyms: (m.antonyms || []).slice(0, 5),
              })),
            });
          } else {
            resolve({ success: false, error: parsed.message || 'Word not found' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    }).on('timeout', function () {
      this.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });
  });
}

function normalizeAudioUrl(url) {
  if (!url) return '';
  return url.startsWith('//') ? 'https:' + url : url;
}

function getPronunciationVariant(text) {
  const haystack = String(text || '').toLowerCase();
  if (/(^|[-_/\s])us($|[-_.\s/])|en-us|american/.test(haystack)) return 'us';
  if (/(^|[-_/\s])(uk|gb)($|[-_.\s/])|en-gb|british/.test(haystack)) return 'uk';
  return '';
}

function extractAudioUrls(phonetics) {
  const result = { us: '', uk: '', default: '' };
  for (const p of phonetics) {
    if (p.audio && p.audio.length > 0) {
      const url = normalizeAudioUrl(p.audio);
      if (!result.default) result.default = url;
      const variant = getPronunciationVariant(`${p.audio} ${p.sourceUrl || ''} ${p.text || ''}`);
      if (variant === 'us' && !result.us) result.us = url;
      if (variant === 'uk' && !result.uk) result.uk = url;
    }
  }
  return result;
}

function pickPronunciationAudio(audioUrls, pronunciationAccent) {
  if (!audioUrls) return '';
  return pronunciationAccent === 'en-GB'
    ? audioUrls.uk || audioUrls.us || audioUrls.default || ''
    : audioUrls.us || audioUrls.uk || audioUrls.default || '';
}

function extractPhoneticText(phonetics, pronunciationAccent) {
  const preferred = pronunciationAccent === 'en-GB' ? 'uk' : 'us';
  const fallback = [];
  for (const p of phonetics || []) {
    if (!p.text) continue;
    const variant = getPronunciationVariant(`${p.audio || ''} ${p.sourceUrl || ''} ${p.text || ''}`);
    if (variant === preferred) return p.text;
    fallback.push(p.text);
  }
  return fallback[0] || '';
}

/* ══════════════════════════════════════════════
   AI SERVICE — OpenAI-compatible (Main Process)
   ══════════════════════════════════════════════ */

// Low-level HTTP helper — shared by callAI and testConnection
function requestChatCompletion(endpoint, apiKey, model, messages, maxTokens) {
  return new Promise((resolve) => {
    if (!apiKey) {
      resolve({ success: false, error: 'No API key — go to Dashboard → Settings', statusCode: 0, latencyMs: 0 });
      return;
    }

    const startTime = Date.now();
    let apiUrl;
    try {
      const fullUrl = joinApiPath(endpoint, 'chat/completions');
      apiUrl = new URL(fullUrl);
      if (!isSafeApiEndpoint(apiUrl)) {
        resolve({ success: false, error: 'API endpoint must use HTTPS, or HTTP only for localhost.', statusCode: 0, latencyMs: 0 });
        return;
      }
    } catch (e) {
      resolve({ success: false, error: 'Invalid API endpoint URL: ' + endpoint, statusCode: 0, latencyMs: 0 });
      return;
    }

    const requestBody = JSON.stringify({
      model: model || 'google/gemini-2.0-flash-exp:free',
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    });

    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
      path: apiUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 15000,
    };

    const protocol = apiUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const latencyMs = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ success: false, error: parsed.error.message || 'API error', statusCode: res.statusCode, latencyMs });
          } else {
            resolve({ success: true, data: parsed, statusCode: res.statusCode, latencyMs });
          }
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse API response', statusCode: res.statusCode, latencyMs });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, statusCode: 0, latencyMs: Date.now() - startTime });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'AI request timed out', statusCode: 0, latencyMs: Date.now() - startTime });
    });

    req.write(requestBody);
    req.end();
  });
}

// ── Parse and normalize AI JSON response ──
function parseAIResponse(raw) {
  if (!raw.success) {
    console.log('🤖 AI error:', raw.statusCode, raw.error);
    if (raw.statusCode === 429 || raw.error?.includes('quota') || raw.error?.includes('rate')) {
      return { success: false, error: 'Rate limited — try again in ~60s' };
    } else if (raw.statusCode === 401) {
      return { success: false, error: 'Invalid API key — check Settings' };
    }
    return { success: false, error: raw.error };
  }
  try {
    const content = raw.data.choices[0].message.content;
    console.log('🤖 AI content:', content.slice(0, 400));
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(jsonStr);
    return { success: true, parsed: result };
  } catch (e) {
    console.error('🤖 AI parse error:', e.message);
    return { success: false, error: 'AI parse error: ' + e.message };
  }
}

// ── Normalize AI result fields to schema conventions ──
const GENERAL_TOPIC_WORDS = new Set([
  'use', 'uses', 'used', 'using',
  'form', 'forms',
  'similar', 'different',
  'term', 'terms',
]);

function normalizeWordTopic(word, topic) {
  const key = normalizeWordKey(word);
  if (GENERAL_TOPIC_WORDS.has(key)) return 'General';
  return topic || '';
}

function normalizeAIResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) result = {};
  result.translatedMeaning = result.translatedMeaning || result.translation || result.vietnameseMeaning || '';
  result.phraseType = result.phraseType || result.partOfSpeech || '';
  result.exampleSentence = result.exampleSentence || result.example || '';
  if (!Array.isArray(result.synonyms)) result.synonyms = [];
  if (!Array.isArray(result.antonyms)) result.antonyms = [];
  if (!Array.isArray(result.prepositions)) result.prepositions = [];
  if (result.verbForms && typeof result.verbForms !== 'object') result.verbForms = null;
  if (result.word) result.topic = normalizeWordTopic(result.word, result.topic);
  return result;
}

function needsAIEnrichment(entry) {
  if (!entry) return true;
  return !entry.translatedMeaning
    || !entry.technicalNote
    || !entry.phraseType
    || !entry.exampleSentence
    || !Array.isArray(entry.synonyms)
    || entry.synonyms.length === 0
    || !Array.isArray(entry.antonyms)
    || (Number(entry.enrichmentVersion) || 1) < 2
    || !Array.isArray(entry.relatedTerms)
    || entry.relatedTerms.length === 0
    || entry.enrichmentStatus === 'pending'
    || entry.enrichmentStatus === 'failed'
    || entry.enrichmentStatus === 'skipped';
}

function needsDictionaryEnrichment(entry) {
  if (!entry) return true;
  return !entry.phonetic
    && !entry.audioUrl
    && (!Array.isArray(entry.meanings) || entry.meanings.length === 0);
}

function mergeDictionaryIntoEntry(entry, dictResult) {
  if (!entry || !dictResult || !dictResult.success) return;
  if (dictResult.phonetic && !entry.phonetic) entry.phonetic = dictResult.phonetic;
  if (dictResult.audioUrl && !entry.audioUrl) entry.audioUrl = dictResult.audioUrl;
  if (dictResult.meanings && dictResult.meanings.length && (!entry.meanings || entry.meanings.length === 0)) {
    entry.meanings = dictResult.meanings;
  }
  const dictAntonyms = [];
  for (const meaning of dictResult.meanings || []) {
    for (const antonym of meaning.antonyms || []) {
      if (antonym && !dictAntonyms.includes(antonym)) dictAntonyms.push(antonym);
    }
  }
  if (dictAntonyms.length) {
    if (!entry.antonyms) entry.antonyms = [];
    for (const antonym of dictAntonyms.slice(0, 8)) {
      if (!entry.antonyms.some((a) => (typeof a === 'string' ? a : a.word) === antonym)) {
        entry.antonyms.push({ word: antonym, meaning: '' });
      }
    }
  }
}

// High-level: enriched prompt for single word / lexical phrase
function callAIEnrich(word, apiKey, endpoint, model, inputType, targetLanguage) {
  return new Promise(async (resolve) => {
    const lang = targetLanguage || 'Vietnamese';
    const isLexicalPhrase = inputType === 'lexicalPhrase';

    const systemPrompt = `You are an expert English dictionary and ${lang} translation assistant.
Given ${isLexicalPhrase ? 'an English phrase' : 'an English word'}, provide ALL of the following:
1. "definition": Clear, concise definition in English (2-3 sentences). Mention specialized meanings if any.
2. "translatedMeaning": Short, natural ${lang} equivalent (1-8 words only, no explanatory sentence).
3. "phraseType": Exact grammatical classification. Use one of: "noun", "verb", "adjective", "adverb", "preposition", "conjunction", "interjection", "noun phrase", "verb phrase", "phrasal verb", "idiom", "collocation", "compound noun", "prepositional phrase". Be precise.
4. "synonyms": Array of 3-5 synonyms, each with a brief ${lang} meaning. Format: [{"word":"examine","meaning":"kiểm tra"}, ...]
5. "antonyms": Array of 2-4 antonyms/opposites, each with a brief ${lang} meaning. Empty array [] if none.
6. "prepositions": If the word commonly pairs with prepositions, list them. Format: [{"phrase":"look at","meaning":"nhìn vào","example":"Look at the sky."}]. Empty array [] if none.
7. "verbForms": If it is a verb, provide past simple and past participle. Format: {"v2":"went","v3":"gone"}. null if not a verb.
8. "exampleSentence": One simple, clear example sentence using the word/phrase naturally.
9. "relatedTerms": 3-5 related words or phrases.
10. "topic": A category tag for the word/phrase itself, not the surrounding sentence. Use "General" for common words such as "use", "form", "similar", or "different" even inside technical text.

Respond ONLY with valid JSON, no markdown fences:
{"definition":"...","translatedMeaning":"...","phraseType":"...","synonyms":[{"word":"...","meaning":"..."}],"antonyms":[{"word":"...","meaning":"..."}],"prepositions":[{"phrase":"...","meaning":"...","example":"..."}],"verbForms":{"v2":"...","v3":"..."},"exampleSentence":"...","relatedTerms":["..."],"topic":"..."}`;

    const userMessage = isLexicalPhrase ? `Phrase: "${word}"` : `Word: "${word}"`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const parsed = parseAIResponse(
      await requestChatCompletion(endpoint, apiKey, model, messages, 1000)
    );

    if (!parsed.success) { resolve(parsed); return; }
    const normalized = normalizeAIResult({ word, ...parsed.parsed });
    resolve({ success: true, ...normalized });
  });
}

// High-level: translate a long text / paragraph
function callAITranslate(text, apiKey, endpoint, model, targetLanguage) {
  return new Promise(async (resolve) => {
    const lang = targetLanguage || 'Vietnamese';
    const systemPrompt = `You are a professional translator and language assistant.
Given an English paragraph or sentence, provide:
1. "translation": Full, natural ${lang} translation.
2. "definition": Brief explanation of the meaning/context in English (2-3 sentences). If it contains technical or specialized terms, explain them.
3. "translatedMeaning": Same as translation field.
4. "relatedTerms": 3-5 key terms or concepts from the text.
5. "topic": A topic/category tag that best fits the content (e.g., "Technology", "Medicine", "Law", "Business", "Science", "Literature", "Daily Life", "Education", etc.).

Respond ONLY with valid JSON, no markdown:
{"translation": "...", "definition": "...", "translatedMeaning": "...", "relatedTerms": ["..."], "topic": "..."}`;
    const userMessage = `Translate and explain: "${text}"`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const parsed = parseAIResponse(
      await requestChatCompletion(endpoint, apiKey, model, messages, 1000)
    );

    if (!parsed.success) { resolve(parsed); return; }
    const result = parsed.parsed;
    result.translatedMeaning = result.translatedMeaning || result.translation || '';
    resolve({ success: true, ...result });
  });
}

// High-level: batch enrich multiple words extracted from a paragraph
function callAIBatchEnrich(words, sentenceContext, apiKey, endpoint, model, targetLanguage) {
  return new Promise(async (resolve) => {
    if (!words || words.length === 0) { resolve({ success: true, results: [] }); return; }

    const lang = targetLanguage || 'Vietnamese';
    const wordList = words.slice(0, 15); // cap at 15 to stay within token limits
    const systemPrompt = `You are an expert English dictionary and ${lang} translation assistant.
Given a list of English words extracted from a text, provide enrichment data for EACH word.

For each word, provide:
1. "word": the word exactly as given
2. "translatedMeaning": short ${lang} translation (1-5 words)
3. "definition": clear English definition (2-3 sentences)
4. "phraseType": exact grammatical type — "noun", "verb", "adjective", "adverb", etc.
5. "synonyms": 3-5 synonyms with brief ${lang} meaning. Format: [{"word":"...","meaning":"..."}]
6. "antonyms": 2-4 antonyms/opposites with brief ${lang} meaning. Use [] if the word has no natural opposite.
7. "prepositions": common preposition pairings if any. Format: [{"phrase":"...","meaning":"...","example":"..."}]. Use [] if none.
8. "verbForms": if verb, {"v2":"...","v3":"..."}. null if not a verb.
9. "exampleSentence": one simple example sentence
10. "topic": category tag for the word itself, not the whole text context. Use "General" for common words such as "use/uses", "form", "similar", or "different" even inside technical text.
11. "relatedTerms": 3-5 related words or phrases.

Respond ONLY with a valid JSON array (no markdown):
[{"word":"...","translatedMeaning":"...","definition":"...","phraseType":"...","synonyms":[{"word":"...","meaning":"..."}],"antonyms":[{"word":"...","meaning":"..."}],"prepositions":[{"phrase":"...","meaning":"...","example":"..."}],"verbForms":null,"exampleSentence":"...","topic":"...","relatedTerms":["..."]}, ...]`;

    const userMessage = `Text context: "${sentenceContext.slice(0, 500)}"\n\nWords to enrich: ${JSON.stringify(wordList)}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const parsed = parseAIResponse(
      await requestChatCompletion(endpoint, apiKey, model, messages, 2200)
    );

    if (!parsed.success) { resolve(parsed); return; }

    let results = parsed.parsed;
    if (!Array.isArray(results)) {
      // AI might wrap in an object
      results = results.words || results.results || [];
    }
    results = results.map(normalizeAIResult);
    resolve({ success: true, results });
  });
}

/* ══════════════════════════════════════════════
   CONTEXT COMPARISON
   ══════════════════════════════════════════════ */

function isSameContext(existingContexts, newSentence) {
  if (!existingContexts || existingContexts.length === 0) return false;
  const newWords = new Set(newSentence.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (newWords.size === 0) return false;

  return existingContexts.some((ctx) => {
    const ctxWords = new Set((ctx.sentence || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    if (ctxWords.size === 0) return false;
    const overlap = [...newWords].filter((w) => ctxWords.has(w)).length;
    return overlap / Math.max(newWords.size, ctxWords.size) > 0.8;
  });
}

function addContextIfNew(wordEntry, sentence, source) {
  if (!sentence || !sentence.trim()) return;
  if (!wordEntry.contexts) wordEntry.contexts = [];
  // Truncate long sentences for storage
  const trimmed = sentence.length > 300 ? sentence.slice(0, 300).trim() + '…' : sentence.trim();
  if (!isSameContext(wordEntry.contexts, trimmed)) {
    wordEntry.contexts.push({
      sentence: trimmed,
      source: source || 'lookup',
      date: new Date().toISOString(),
    });
    if (wordEntry.contexts.length > 5) {
      wordEntry.contexts = wordEntry.contexts.slice(-5);
    }
  }
}

/* ══════════════════════════════════════════════
   SEMANTIC ENGINE
   ══════════════════════════════════════════════ */

function findRelatedWords(targetWord, targetTopic, targetRelatedTerms, allWords) {
  if (!allWords || allWords.length === 0) return [];

  const scores = [];
  const targetTags = (targetRelatedTerms || []).map((t) => t.toLowerCase());
  const targetTopicLower = (targetTopic || '').toLowerCase();

  for (const entry of allWords) {
    if (entry.word.toLowerCase() === targetWord.toLowerCase()) continue;

    let score = 0;

    // Same topic bonus
    if (entry.topic && entry.topic.toLowerCase() === targetTopicLower) {
      score += 3;
    }

    // Tag overlap
    const entryTags = (entry.tags || []).map((t) => t.toLowerCase());
    const entryRelated = (entry.relatedTerms || []).map((t) => t.toLowerCase());
    const allEntryTerms = [...entryTags, ...entryRelated, entry.word.toLowerCase()];

    for (const tag of targetTags) {
      if (allEntryTerms.includes(tag)) {
        score += 2;
      }
    }

    // Check if target word appears in entry's related terms
    if (entryRelated.includes(targetWord.toLowerCase())) {
      score += 3;
    }

    if (score > 0) {
      scores.push({ word: entry.word, topic: entry.topic, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 5);
}

/* ══════════════════════════════════════════════
   SRS — SM-2 Algorithm
   ══════════════════════════════════════════════ */

function sm2(word, quality) {
  let { easeFactor, interval, repetitions } = word;
  easeFactor = easeFactor || 2.5;
  interval = interval || 0;
  repetitions = repetitions || 0;

  if (quality < 3) {
    // Again (0) or Hard-fail (1-2): reset
    repetitions = 0;
    interval = 0;
  } else {
    // Hard (3), Good (4), Easy (5): advance
    repetitions++;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);
  }

  easeFactor = Math.max(1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const due = new Date(Date.now() + interval * 86400000);
  const dueDate = due.toISOString();

  return { easeFactor, interval, repetitions, dueDate };
}

/* ══════════════════════════════════════════════
   IPC HANDLERS
   ══════════════════════════════════════════════ */

function setupIPC() {
  // ── Database ──
  ipcMain.handle('db:load', () => loadDatabase());
  ipcMain.handle('db:save', (event, data) => saveDatabase(data));
  ipcMain.handle('db:getPath', () => DB_FILE);
  ipcMain.handle('db:export', () => JSON.stringify(loadDatabase(), null, 2));
  ipcMain.handle('db:import', (event, jsonStr) => restoreFullBackupJson(jsonStr, 'legacy-db-import').success);
  ipcMain.handle('db:exportFullBackup', () => ({
    success: true,
    content: JSON.stringify(loadDatabase(), null, 2),
    filename: `engilink-full-backup-${new Date().toISOString().split('T')[0]}.json`,
  }));
  ipcMain.handle('db:restoreFullBackup', (event, jsonStr) => restoreFullBackupJson(jsonStr, 'restore-full'));
  ipcMain.handle('db:listBackups', () => {
    try {
      return { success: true, backups: listAutoBackups() };
    } catch (err) {
      return { success: false, error: err.message, backups: [] };
    }
  });
  ipcMain.handle('db:restoreAutoBackup', (event, backupName) => {
    try {
      const backups = listAutoBackups();
      const selectedName = backupName || (backups[0] && backups[0].name);
      if (!selectedName) return { success: false, error: 'No auto-backup available' };
      const filePath = resolveBackupPath(selectedName);
      return restoreFullBackupJson(fs.readFileSync(filePath, 'utf-8'), 'restore-auto-backup');
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('db:reset', () => {
    createAutoBackup('reset-data');
    return saveDatabase(cloneData(DEFAULT_DATA));
  });
  ipcMain.handle('app:healthCheck', () => getAppHealthCheck());

  // ── Word Lookup (orchestrates all APIs) ──
  ipcMain.handle('lookup:word', async (event, word, options = {}) => {
    const { forceRefresh = false, forceSave = false } = options;
    const db = loadDatabase();
    const settings = db.settings;

    // ── Three-way input classification ──
    const inputType = classifyInput(word);
    const isPhrase = inputType !== 'singleWord';

    // ── AI Cache check ──
    const cacheKey = buildCacheKey(word, inputType, settings.targetLanguage, settings.apiEndpoint, settings.model);
    let aiResult;
    let usedCache = false;

    if (!forceRefresh && db.aiCache[cacheKey]) {
      aiResult = db.aiCache[cacheKey].response;
      usedCache = true;
      console.log('💾 Cache hit for:', word.slice(0, 40));
    } else {
      if (inputType === 'longText') {
        aiResult = await callAITranslate(word, settings.apiKey, settings.apiEndpoint, settings.model, settings.targetLanguage);
      } else {
        aiResult = await callAIEnrich(word, settings.apiKey, settings.apiEndpoint, settings.model, inputType, settings.targetLanguage);
      }
      if (aiResult.success) {
        db.aiCache[cacheKey] = { response: aiResult, timestamp: Date.now() };
      }
    }

    // ── Dictionary (only for single words) ──
    let dictResult;
    if (inputType === 'singleWord') {
      dictResult = await lookupDictionary(word, settings.pronunciationAccent);
    } else {
      dictResult = { success: false, error: `${inputType} mode` };
    }

    // ── Related words ──
    const relatedWords = settings.showRelatedWords !== false
      ? findRelatedWords(word, aiResult.success ? aiResult.topic : '', aiResult.success ? aiResult.relatedTerms : [], db.words)
      : [];

    // ── Lookup History ──
    db.lookupHistory.push({ word, isPhrase, inputType, timestamp: new Date().toISOString(), cached: usedCache });
    if (db.lookupHistory.length > 1000) db.lookupHistory = db.lookupHistory.slice(-1000);

    // ── Stats ──
    const today = getLocalDateStr();
    db.stats.totalLookups++;
    if (db.stats.lastActiveDate === today) {
      db.stats.todayLookups++;
    } else {
      const yesterdayStr = getLocalDateStr(new Date(Date.now() - 86400000));
      if (db.stats.lastActiveDate === yesterdayStr) db.stats.streak++;
      else if (db.stats.lastActiveDate !== today) db.stats.streak = 1;
      db.stats.todayLookups = 1;
      db.stats.lastActiveDate = today;
    }

    // ── Word save ──
    let savedWordId = null, savedLookupCount = 0, savedIsFavorite = false, savedUserNote = '';
    let extractedWords = [];

    if (settings.autoSave || forceSave) {
      if (isPhrase) {
        // ═══ LONG TEXT: extract vocab, save individual words ═══
        const { words: vocabWords, phrasalVerbs } = extractVocabulary(word);
        extractedWords = vocabWords;
        const newWordsToEnrich = [];
        const wordsToDictionaryEnrich = [];
        const now = new Date().toISOString();
        const contextSource = inputType === 'longText' ? 'paragraph' : 'phrase';

        for (const vocabWord of vocabWords) {
          const existingIdx = db.words.findIndex((w) => w.word.toLowerCase() === vocabWord.toLowerCase());
          if (existingIdx >= 0) {
            addContextIfNew(db.words[existingIdx], word, contextSource);
            db.words[existingIdx].lookupCount = (db.words[existingIdx].lookupCount || 0) + 1;
            db.words[existingIdx].lastLookup = now;
            if (needsAIEnrichment(db.words[existingIdx])) {
              db.words[existingIdx].enrichmentStatus = 'pending';
              newWordsToEnrich.push(vocabWord);
            }
            if (needsDictionaryEnrichment(db.words[existingIdx])) {
              wordsToDictionaryEnrich.push(vocabWord);
            }
          } else {
            db.words.unshift({
              id: crypto.randomUUID(), word: vocabWord, phonetic: '', audioUrl: '', meanings: [],
              technicalNote: '', translatedMeaning: '', vietnameseMeaning: '',
              topic: '',
              tags: [], relatedTerms: [], userNote: '', isFavorite: false,
              lookupCount: 1, firstLookup: now, lastLookup: now, isPhrase: false,
              easeFactor: 2.5, interval: 0, repetitions: 0, dueDate: null,
              contexts: [{ sentence: word.length > 300 ? word.slice(0, 300) + '…' : word, source: contextSource, date: now }],
              synonyms: [], antonyms: [], prepositions: [], verbForms: null, exampleSentence: '', phraseType: '',
              enrichmentStatus: 'pending',
              enrichmentVersion: 1,
            });
            newWordsToEnrich.push(vocabWord);
            wordsToDictionaryEnrich.push(vocabWord);
          }
        }

        // Attach detected phrasal verbs to the root word entry.
        for (const pv of phrasalVerbs) {
          const parentIdx = db.words.findIndex((w) => w.word.toLowerCase() === pv.verb.toLowerCase());
          if (parentIdx >= 0) {
            if (!db.words[parentIdx].prepositions) db.words[parentIdx].prepositions = [];
            if (!db.words[parentIdx].prepositions.some((p) => p.phrase === pv.phrase)) {
              db.words[parentIdx].prepositions.push({ phrase: pv.phrase, meaning: '', example: '' });
            }
          }
        }

        saveDatabase(db);

        if (wordsToDictionaryEnrich.length > 0) {
          (async () => {
            try {
              const uniqueWords = [...new Set(wordsToDictionaryEnrich)];
              for (const dictWord of uniqueWords) {
                const dict = await lookupDictionary(dictWord, settings.pronunciationAccent);
                if (!dict.success) continue;
                const freshDb = loadDatabase();
                const idx = freshDb.words.findIndex((e) => e.word.toLowerCase() === dictWord.toLowerCase());
                if (idx >= 0) {
                  mergeDictionaryIntoEntry(freshDb.words[idx], dict);
                  saveDatabase(freshDb);
                }
              }
            } catch (err) {
              console.error('Dictionary background enrichment error:', err.message || err);
            }
          })();
        }

        // ═══ Background enrichment (async, non-blocking) ═══
        if (newWordsToEnrich.length > 0 && settings.apiKey) {
          // Chunk into batches of 15 to stay within token limits
          const BATCH_SIZE = 15;
          const chunks = [];
          for (let i = 0; i < newWordsToEnrich.length; i += BATCH_SIZE) {
            chunks.push(newWordsToEnrich.slice(i, i + BATCH_SIZE));
          }

          (async () => {
            try {
              for (const chunk of chunks) {
                const enrichResult = await callAIBatchEnrich(chunk, word, settings.apiKey, settings.apiEndpoint, settings.model, settings.targetLanguage);
                const freshDb = loadDatabase();

                if (enrichResult.success && enrichResult.results && enrichResult.results.length > 0) {
                  for (const enriched of enrichResult.results) {
                    const wKey = (enriched.word || '').toLowerCase();
                    if (!wKey) continue;
                    const idx = freshDb.words.findIndex((e) => e.word.toLowerCase() === wKey);
                    if (idx < 0) continue;
                    const entry = freshDb.words[idx];
                    if (enriched.translatedMeaning) { entry.translatedMeaning = enriched.translatedMeaning; entry.vietnameseMeaning = enriched.translatedMeaning; }
                    if (enriched.definition) entry.technicalNote = enriched.definition;
                    if (enriched.topic) entry.topic = normalizeWordTopic(entry.word, enriched.topic);
                    if (enriched.relatedTerms) { entry.relatedTerms = enriched.relatedTerms; entry.tags = enriched.relatedTerms; }
                    if (enriched.synonyms && enriched.synonyms.length) entry.synonyms = enriched.synonyms;
                    if (Array.isArray(enriched.antonyms)) {
                      if (!entry.antonyms) entry.antonyms = [];
                      for (const ant of enriched.antonyms) {
                        const antWord = typeof ant === 'string' ? ant : ant.word;
                        if (antWord && !entry.antonyms.some((a) => (typeof a === 'string' ? a : a.word) === antWord)) {
                          entry.antonyms.push(ant);
                        }
                      }
                    }
                    if (enriched.prepositions && enriched.prepositions.length) {
                      if (!entry.prepositions) entry.prepositions = [];
                      for (const prep of enriched.prepositions) {
                        if (!entry.prepositions.some((p) => p.phrase === prep.phrase)) entry.prepositions.push(prep);
                      }
                    }
                    if (enriched.verbForms) entry.verbForms = enriched.verbForms;
                    if (enriched.exampleSentence) entry.exampleSentence = enriched.exampleSentence;
                    if (enriched.phraseType) entry.phraseType = enriched.phraseType;
                    entry.enrichmentStatus = 'done';
                    entry.enrichmentVersion = 2;
                  }
                }

                // Mark this chunk's remaining pending as failed
                for (const w of chunk) {
                  const idx = freshDb.words.findIndex((e) => e.word.toLowerCase() === w.toLowerCase() && e.enrichmentStatus === 'pending');
                  if (idx >= 0) freshDb.words[idx].enrichmentStatus = 'failed';
                }
                saveDatabase(freshDb);
              }
              console.log(`✅ Batch enrichment complete: ${newWordsToEnrich.length} words processed in ${chunks.length} chunk(s)`);
            } catch (err) {
              console.error('❌ Background enrichment error:', err.message || err);
              const freshDb = loadDatabase();
              for (const w of newWordsToEnrich) {
                const idx = freshDb.words.findIndex((e) => e.word.toLowerCase() === w.toLowerCase() && e.enrichmentStatus === 'pending');
                if (idx >= 0) freshDb.words[idx].enrichmentStatus = 'failed';
              }
              saveDatabase(freshDb);
            }
          })();
        } else if (newWordsToEnrich.length > 0) {
          // No API key — mark as skipped so Dashboard doesn't show "Enriching…" forever
          for (const w of newWordsToEnrich) {
            const idx = db.words.findIndex((e) => e.word.toLowerCase() === w.toLowerCase() && e.enrichmentStatus === 'pending');
            if (idx >= 0) db.words[idx].enrichmentStatus = 'skipped';
          }
          saveDatabase(db);
        }
      } else {
        // Single word: save the looked-up word itself.
        const existingIdx = db.words.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());
        const existing = existingIdx >= 0 ? db.words[existingIdx] : null;
        const now = new Date().toISOString();

        const wordEntry = {
          id: existing ? existing.id : crypto.randomUUID(),
          word, phonetic: dictResult.success ? dictResult.phonetic : (existing ? existing.phonetic : ''),
          audioUrl: dictResult.success ? dictResult.audioUrl : (existing ? existing.audioUrl : ''),
          meanings: dictResult.success ? dictResult.meanings : (existing ? existing.meanings : []),
          technicalNote: aiResult.success ? aiResult.definition : (existing ? existing.technicalNote : ''),
          translatedMeaning: aiResult.success ? aiResult.translatedMeaning : (existing ? (existing.translatedMeaning || existing.vietnameseMeaning) : ''),
          vietnameseMeaning: aiResult.success ? aiResult.translatedMeaning : (existing ? existing.vietnameseMeaning : ''),
          topic: aiResult.success ? normalizeWordTopic(word, aiResult.topic) : (existing ? existing.topic : ''),
          tags: aiResult.success ? (aiResult.relatedTerms || []) : (existing ? existing.tags : []),
          relatedTerms: aiResult.success ? (aiResult.relatedTerms || []) : (existing ? existing.relatedTerms : []),
          userNote: existing ? existing.userNote : '',
          isFavorite: existing ? existing.isFavorite : false,
          lookupCount: existing ? existing.lookupCount + 1 : 1,
          firstLookup: existing ? existing.firstLookup : now,
          lastLookup: now, isPhrase,
          easeFactor: existing ? existing.easeFactor : 2.5,
          interval: existing ? existing.interval : 0,
          repetitions: existing ? existing.repetitions : 0,
          dueDate: existing ? existing.dueDate : null,
          // V6 fields
          contexts: existing ? existing.contexts || [] : [],
          synonyms: aiResult.success && aiResult.synonyms ? aiResult.synonyms : (existing ? existing.synonyms || [] : []),
          antonyms: aiResult.success && aiResult.antonyms ? aiResult.antonyms : (existing ? existing.antonyms || [] : []),
          prepositions: aiResult.success && aiResult.prepositions ? aiResult.prepositions : (existing ? existing.prepositions || [] : []),
          verbForms: aiResult.success && aiResult.verbForms ? aiResult.verbForms : (existing ? existing.verbForms : null),
          exampleSentence: aiResult.success && aiResult.exampleSentence ? aiResult.exampleSentence : (existing ? existing.exampleSentence || '' : ''),
          phraseType: aiResult.success && aiResult.phraseType ? aiResult.phraseType : (existing ? existing.phraseType || '' : ''),
          enrichmentStatus: 'done',
          enrichmentVersion: aiResult.success ? 2 : (existing ? Number(existing.enrichmentVersion) || 1 : 1),
        };

        if (dictResult.success) mergeDictionaryIntoEntry(wordEntry, dictResult);

        if (existingIdx >= 0) db.words[existingIdx] = wordEntry;
        else db.words.unshift(wordEntry);

        savedWordId = wordEntry.id;
        savedLookupCount = wordEntry.lookupCount;
        savedIsFavorite = wordEntry.isFavorite;
        savedUserNote = wordEntry.userNote;
        saveDatabase(db);
      }
    } else {
      saveDatabase(db);
    }

    return {
      dictionary: dictResult, ai: aiResult, relatedWords, isPhrase, inputType, usedCache,
      extractedWords, savedWordId: savedWordId || null,
      savedLookupCount: savedLookupCount || 0,
      savedIsFavorite: savedIsFavorite || false,
      savedUserNote: savedUserNote || '',
    };
  });

  // ── Word CRUD ──
  ipcMain.handle('words:getAll', () => {
    const db = loadDatabase();
    return db.words;
  });

  ipcMain.handle('words:delete', (event, wordId) => {
    const db = loadDatabase();
    db.words = db.words.filter((w) => w.id !== wordId);
    return saveDatabase(db);
  });

  ipcMain.handle('words:update', (event, updatedWord) => {
    const db = loadDatabase();
    const idx = db.words.findIndex((w) => w.id === updatedWord.id);
    if (idx >= 0) {
      db.words[idx] = { ...db.words[idx], ...updatedWord };
      return saveDatabase(db);
    }
    return false;
  });

  ipcMain.handle('words:toggleFavorite', (event, wordId) => {
    const db = loadDatabase();
    const idx = db.words.findIndex((w) => w.id === wordId);
    if (idx >= 0) {
      db.words[idx].isFavorite = !db.words[idx].isFavorite;
      saveDatabase(db);
      return db.words[idx].isFavorite;
    }
    return false;
  });

  ipcMain.handle('words:updateNote', (event, wordId, note) => {
    const db = loadDatabase();
    const idx = db.words.findIndex((w) => w.id === wordId);
    if (idx >= 0) {
      db.words[idx].userNote = note || '';
      saveDatabase(db);
      return true;
    }
    return false;
  });

  ipcMain.handle('words:batchDelete', (event, wordIds) => {
    if (!Array.isArray(wordIds) || wordIds.length === 0) return 0;
    const db = loadDatabase();
    const before = db.words.length;
    db.words = db.words.filter((w) => !wordIds.includes(w.id));
    saveDatabase(db);
    return before - db.words.length;
  });

  // ── Stats ──
  ipcMain.handle('words:export', (event, options = {}) => exportWordsFromDatabase(options));

  ipcMain.handle('words:import', (event, payload = {}) => {
    const content = typeof payload === 'string' ? payload : payload.content;
    return importWordsIntoDatabase(content || '', payload.format, payload.filename);
  });

  ipcMain.handle('stats:get', () => {
    const db = loadDatabase();
    return {
      ...db.stats,
      totalWords: db.words.length,
      favoriteCount: db.words.filter((w) => w.isFavorite).length,
      topTopics: getTopTopics(db.words),
    };
  });

  // ── Settings ──
  ipcMain.handle('settings:get', () => {
    const db = loadDatabase();
    return db.settings;
  });

  ipcMain.handle('settings:save', (event, newSettings) => {
    const db = loadDatabase();
    db.settings = {
      ...db.settings,
      ...newSettings,
      hotkeys: { ...db.settings.hotkeys, ...(newSettings.hotkeys || {}) },
    };
    runtimeTheme = db.settings.theme || runtimeTheme;
    return saveDatabase(db);
  });

  // ── Test Connection ──
  ipcMain.handle('ai:testConnection', async (event, { apiKey, endpoint, model }) => {
    const result = await requestChatCompletion(endpoint, apiKey, model,
      [{ role: 'user', content: 'Say "ok"' }], 10);
    return {
      success: result.success,
      latencyMs: result.latencyMs,
      errorType: result.statusCode === 401 ? 'auth'
        : result.statusCode === 429 ? 'rateLimit'
          : result.error?.includes('timed out') ? 'timeout'
            : result.error ? 'other' : null,
      error: result.error || null,
    };
  });

  // ── History ──
  ipcMain.handle('history:get', () => {
    const db = loadDatabase();
    return db.lookupHistory;
  });

  ipcMain.handle('history:clear', () => {
    const db = loadDatabase();
    db.lookupHistory = [];
    return saveDatabase(db);
  });

  // ── SRS (SM-2) ──
  ipcMain.handle('study:getDueCards', () => {
    const db = loadDatabase();
    const now = new Date().toISOString();
    return db.words.filter((w) =>
      w.dueDate === null || w.dueDate === undefined || w.dueDate <= now
    ).sort((a, b) => {
      if (!a.dueDate) return -1;
      if (!b.dueDate) return 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  });

  ipcMain.handle('study:getStudyCards', (event, { topic, count }) => {
    const db = loadDatabase();
    let pool = [...db.words];

    // Filter by topic if specified
    if (topic) {
      pool = pool.filter((w) => w.topic === topic);
    }

    if (pool.length === 0) return [];

    // Separate into never-studied and already-studied
    const neverStudied = pool.filter((w) => !w.repetitions || w.repetitions === 0);
    const studied = pool.filter((w) => w.repetitions && w.repetitions > 0);

    // Sort studied by repetitions ascending (least studied first)
    studied.sort((a, b) => (a.repetitions || 0) - (b.repetitions || 0));

    // Shuffle never-studied (Fisher-Yates)
    for (let i = neverStudied.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [neverStudied[i], neverStudied[j]] = [neverStudied[j], neverStudied[i]];
    }

    // Shuffle within same-repetition groups in studied
    let i = 0;
    while (i < studied.length) {
      let j = i;
      while (j < studied.length && studied[j].repetitions === studied[i].repetitions) j++;
      // Shuffle [i, j)
      for (let k = j - 1; k > i; k--) {
        const r = i + Math.floor(Math.random() * (k - i + 1));
        [studied[k], studied[r]] = [studied[r], studied[k]];
      }
      i = j;
    }

    // Merge: new words first, then least-studied
    const merged = [...neverStudied, ...studied];
    const limit = Math.min(Math.max(1, count || 10), 20);
    return merged.slice(0, limit);
  });

  ipcMain.handle('study:reviewCard', (event, wordId, quality) => {
    const db = loadDatabase();
    const idx = db.words.findIndex((w) => w.id === wordId);
    if (idx < 0) return false;

    const word = db.words[idx];
    const updated = sm2(word, quality);
    db.words[idx] = { ...word, ...updated };
    return saveDatabase(db);
  });

  // ── Cache Management ──
  ipcMain.handle('cache:prune', () => {
    const db = loadDatabase();
    const cutoff = Date.now() - 30 * 86400000; // 30 days
    let pruned = 0;
    for (const key of Object.keys(db.aiCache)) {
      if (db.aiCache[key].timestamp < cutoff) {
        delete db.aiCache[key];
        pruned++;
      }
    }
    if (pruned > 0) {
      saveDatabase(db);
      console.log(`🧹 Pruned ${pruned} stale cache entries`);
    }
    return pruned;
  });

  // ── Shell ──
  ipcMain.handle('shell:openExternal', (event, url) => {
    // Whitelist: only allow known safe URLs
    const allowed = [
      'https://openrouter.ai/',
      'https://platform.openai.com/',
      'https://console.groq.com/',
      'mailto:votrongkien1881@gmail.com',
    ];
    if (typeof url === 'string' && allowed.some((prefix) => url.startsWith(prefix))) {
      const { shell } = require('electron');
      return shell.openExternal(url);
    }
    return false;
  });

  // ── Window Controls ──
  ipcMain.on('overlay:hide', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  ipcMain.on('overlay:show', (event, word) => {
    if (typeof word === 'string' && word.trim()) {
      showOverlay(word.trim());
    }
  });

  ipcMain.on('overlay:reading', (event, text = '') => {
    showReadingOverlay(typeof text === 'string' ? text : '');
  });

  ipcMain.on('theme:preview', (event, theme) => {
    if (!['light', 'dark'].includes(theme)) return;
    runtimeTheme = theme;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('theme:preview', theme);
    }
    if (spotlightWindow && !spotlightWindow.isDestroyed()) {
      spotlightWindow.webContents.send('theme:preview', theme);
    }
  });

  ipcMain.on('overlay:resize', (event, height) => {
    if (overlayWindow) {
      const db = loadDatabase();
      const width = db.settings.overlayWidth || 380;
      overlayWindow.setSize(width, Math.min(height, db.settings.overlayMaxHeight || 520));
    }
  });

  ipcMain.on('dashboard:open', () => {
    showDashboard();
  });
}

function getTopTopics(words) {
  const topicCount = {};
  for (const w of words) {
    if (w.topic) {
      topicCount[w.topic] = (topicCount[w.topic] || 0) + 1;
    }
  }
  return Object.entries(topicCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));
}

/* ══════════════════════════════════════════════
   OVERLAY WINDOW
   ══════════════════════════════════════════════ */

function createOverlayWindow() {
  const db = loadDatabase();
  overlayWindow = new BrowserWindow({
    width: db.settings.overlayWidth || 380,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlayWindow.loadFile('overlay.html');

  // Track overlay readiness
  overlayWindow._isReady = false;
  overlayWindow._pendingWord = null;
  overlayWindow._pendingReadingText = null;

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('📗 Overlay webContents loaded');
    overlayWindow._isReady = true;
    if (overlayWindow._pendingReadingText !== null) {
      overlayWindow.webContents.send('reading:open', overlayWindow._pendingReadingText);
      overlayWindow._pendingReadingText = null;
      return;
    }
    // If a word was queued before load finished, send it now
    if (overlayWindow._pendingWord) {
      console.log('📗 Sending pending word:', overlayWindow._pendingWord);
      overlayWindow.webContents.send('lookup:start', overlayWindow._pendingWord);
      overlayWindow._pendingWord = null;
    }
  });

  // Hide on blur — but only if overlay has been visible for at least 300ms
  // This prevents the overlay from disappearing immediately on show
  let showTimestamp = 0;
  overlayWindow._setShowTimestamp = () => { showTimestamp = Date.now(); };

  overlayWindow.on('blur', () => {
    const elapsed = Date.now() - showTimestamp;
    if (elapsed > 300) {
      overlayWindow.hide();
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Log any webContents errors
  overlayWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log('📕 Overlay error:', message);
  });
}

function showOverlay(word) {
  console.log('🔍 showOverlay called with:', word);

  if (!overlayWindow) {
    console.log('🔍 Creating new overlay window...');
    createOverlayWindow();
  }

  // Position at cursor
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const bounds = display.workArea;

  const db = loadDatabase();
  const winWidth = db.settings.overlayWidth || 380;
  const winHeight = db.settings.overlayMaxHeight || 520;

  // Keep within screen bounds
  let x = cursorPos.x + 10;
  let y = cursorPos.y + 10;
  if (x + winWidth > bounds.x + bounds.width) x = cursorPos.x - winWidth - 10;
  if (y + winHeight > bounds.y + bounds.height) y = cursorPos.y - winHeight - 10;
  if (x < bounds.x) x = bounds.x;
  if (y < bounds.y) y = bounds.y;

  overlayWindow.setPosition(Math.round(x), Math.round(y));
  overlayWindow.setSize(winWidth, 300);

  // Update show timestamp before showing (used by blur guard)
  overlayWindow._setShowTimestamp();
  overlayWindow.show();
  overlayWindow.focus();

  console.log('🔍 Overlay shown at', Math.round(x), Math.round(y));

  // Send word to overlay — wait for ready if needed
  if (overlayWindow._isReady) {
    console.log('🔍 Sending word immediately:', word);
    overlayWindow.webContents.send('lookup:start', word);
  } else {
    console.log('🔍 Overlay not ready yet, queuing word:', word);
    overlayWindow._pendingWord = word;
  }
}

/* ══════════════════════════════════════════════
   DASHBOARD WINDOW
   ══════════════════════════════════════════════ */

function showReadingOverlay(text = '') {
  if (!overlayWindow) {
    createOverlayWindow();
  }

  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const bounds = display.workArea;

  const db = loadDatabase();
  const winWidth = db.settings.overlayWidth || 380;
  const winHeight = db.settings.overlayMaxHeight || 520;

  let x = cursorPos.x + 10;
  let y = cursorPos.y + 10;
  if (x + winWidth > bounds.x + bounds.width) x = cursorPos.x - winWidth - 10;
  if (y + winHeight > bounds.y + bounds.height) y = cursorPos.y - winHeight - 10;
  if (x < bounds.x) x = bounds.x;
  if (y < bounds.y) y = bounds.y;

  overlayWindow.setPosition(Math.round(x), Math.round(y));
  overlayWindow.setSize(winWidth, 420);
  overlayWindow._setShowTimestamp();
  overlayWindow.show();
  overlayWindow.focus();

  if (overlayWindow._isReady) {
    overlayWindow.webContents.send('reading:open', text);
  } else {
    overlayWindow._pendingReadingText = text;
  }
}

function showDashboard() {
  if (dashboardWindow) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'EngiLink Dictionary',
    icon: path.join(__dirname, 'assets', 'tray-icon.ico'),
    backgroundColor: '#FFF9F0',
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  dashboardWindow.loadFile('dashboard.html');

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
  });

  // DevTools: press Ctrl+Shift+I to open manually if needed

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

/* ══════════════════════════════════════════════
   SYSTEM TRAY
   ══════════════════════════════════════════════ */

function createTray() {
  // Use user-provided .ico for crisp Windows tray icon
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.ico');
  const icon = nativeImage.createFromPath(iconPath);


  tray = new Tray(icon);
  tray.setToolTip('EngiLink Dictionary');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📖 Open Dashboard',
      click: () => showDashboard(),
    },
    { type: 'separator' },
    {
      label: '🔍 Quick Lookup',
      click: () => {
        const text = clipboard.readText().trim();
        if (text) showOverlay(text);
      },
    },
    { type: 'separator' },
    {
      label: '⚙️ Settings',
      click: () => {
        showDashboard();
        // Send signal to navigate to settings
        setTimeout(() => {
          if (dashboardWindow) {
            dashboardWindow.webContents.send('navigate', 'settings');
          }
        }, 500);
      },
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    showDashboard();
  });
}

/* ══════════════════════════════════════════════
   SPOTLIGHT WINDOW
   ══════════════════════════════════════════════ */

let spotlightWindow = null;

function createSpotlightWindow() {
  spotlightWindow = new BrowserWindow({
    width: 500,
    height: 60,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-spotlight.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  spotlightWindow.loadFile('spotlight.html');

  spotlightWindow.webContents.on('did-finish-load', () => {
    const db = loadDatabase();
    spotlightWindow.webContents.send('theme:preview', runtimeTheme || db.settings.theme || 'light');
  });

  spotlightWindow.on('blur', () => {
    setTimeout(() => {
      if (spotlightWindow && spotlightWindow.isVisible()) {
        spotlightWindow.hide();
      }
    }, 200);
  });

  spotlightWindow.on('closed', () => {
    spotlightWindow = null;
  });
}

function toggleSpotlight() {
  if (!spotlightWindow) createSpotlightWindow();

  if (spotlightWindow.isVisible()) {
    spotlightWindow.hide();
  } else {
    // Center on current display
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const x = Math.round(display.workArea.x + (display.workArea.width - 500) / 2);
    const y = Math.round(display.workArea.y + display.workArea.height * 0.3);
    spotlightWindow.setPosition(x, y);
    spotlightWindow.show();
    spotlightWindow.focus();
    const db = loadDatabase();
    spotlightWindow.webContents.send('theme:preview', runtimeTheme || db.settings.theme || 'light');
    spotlightWindow.webContents.send('spotlight:show');
  }
}

// Spotlight IPC
ipcMain.on('spotlight:submit', (event, text) => {
  if (spotlightWindow) spotlightWindow.hide();
  if (text && text.trim()) showOverlay(text.trim());
});

ipcMain.on('spotlight:hide', () => {
  if (spotlightWindow) spotlightWindow.hide();
});

/* ══════════════════════════════════════════════
   OCR SNIP WINDOW
   ══════════════════════════════════════════════ */

let snipWindow = null;

const OCR_LANGUAGES = {
  eng: 'English',
  vie: 'Vietnamese',
  jpn: 'Japanese',
  kor: 'Korean',
  chi_sim: 'Chinese Simplified',
  fra: 'French',
  spa: 'Spanish',
  deu: 'German',
  tha: 'Thai',
};

function getOcrLanguageCode() {
  const db = loadDatabase();
  const code = db.settings.ocrLanguage || 'eng';
  return OCR_LANGUAGES[code] ? code : 'eng';
}

function getOcrLangPath() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

function getTesseractPaths() {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(__dirname, 'node_modules');
  return {
    corePath: path.join(baseDir, 'tesseract.js-core'),
    workerPath: path.join(baseDir, 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'),
  };
}

function cleanupOcrPreviewText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanupOcrLookupText(text, mode) {
  let cleaned = String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (mode === 'lookup') {
    const firstWord = cleaned.match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/u);
    cleaned = firstWord ? firstWord[0] : cleaned.split(/\s+/)[0] || '';
  } else {
    if (cleaned.length > 500) cleaned = cleaned.split(/\s+/).slice(0, 50).join(' ');
    if (cleaned.length > 500) cleaned = cleaned.slice(0, 500).trim();
  }
  return cleaned;
}

function saveOcrTextToLibrary(text) {
  const word = cleanupOcrLookupText(text, 'translate');
  if (!word) return { success: false, error: 'No text to save' };

  const db = loadDatabase();
  const key = normalizeWordKey(word);
  const existingIdx = db.words.findIndex((w) => normalizeWordKey(w.word) === key);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    db.words[existingIdx].lastLookup = now;
    db.words[existingIdx].lookupCount = (db.words[existingIdx].lookupCount || 0) + 1;
    if (!db.words[existingIdx].topic) db.words[existingIdx].topic = 'OCR';
  } else {
    db.words.unshift({
      id: crypto.randomUUID(),
      word,
      phonetic: '',
      audioUrl: '',
      meanings: [],
      technicalNote: 'Saved from OCR preview.',
      translatedMeaning: '',
      vietnameseMeaning: '',
      topic: 'OCR',
      tags: [],
      relatedTerms: [],
      userNote: '',
      isFavorite: false,
      lookupCount: 1,
      firstLookup: now,
      lastLookup: now,
      isPhrase: word.split(/\s+/).length > 1,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      dueDate: null,
      // V6 fields
      contexts: [],
      synonyms: [],
      antonyms: [],
      prepositions: [],
      verbForms: null,
      exampleSentence: '',
      phraseType: '',
      enrichmentStatus: 'done',
      enrichmentVersion: 1,
    });
  }

  return { success: saveDatabase(db), word };
}

function createSnipWindow() {
  if (snipWindow && !snipWindow.isDestroyed()) {
    snipWindow.close();
    snipWindow = null;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.bounds;

  snipWindow = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-snip.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  snipWindow.loadFile('snip.html');
  snipWindow.once('ready-to-show', () => {
    snipWindow.show();
    snipWindow.focus();
  });

  snipWindow.on('closed', () => { snipWindow = null; });
}

function startOCRCapture() {
  createSnipWindow();
}

// OCR IPC: region selected
ipcMain.on('ocr:captureRegion', async (event, rect) => {
  try {
    // Get the display where snip happened
    const display = screen.getDisplayNearestPoint({ x: rect.x, y: rect.y });
    const scaleFactor = display.scaleFactor || 1;
    const activeSnipWindow = snipWindow && !snipWindow.isDestroyed() ? snipWindow : null;

    // Capture a clean screenshot without the transparent snip overlay/spinner.
    if (activeSnipWindow) {
      activeSnipWindow.hide();
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    // Capture the screen
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.bounds.width * scaleFactor),
        height: Math.round(display.bounds.height * scaleFactor),
      },
    });

    // Find the correct source for this display
    const source = sources.find(s => {
      const id = s.display_id;
      return id && id === String(display.id);
    }) || sources[0];

    if (!source) {
      console.error('❌ No screen source found for OCR');
      closeSnipAndNotify('No screen source found. Please try again.');
      return;
    }

    // Crop the thumbnail to the selected region
    const fullImage = source.thumbnail;
    const cropped = fullImage.crop({
      x: Math.round((rect.x - display.bounds.x) * scaleFactor),
      y: Math.round((rect.y - display.bounds.y) * scaleFactor),
      width: Math.round(rect.width * scaleFactor),
      height: Math.round(rect.height * scaleFactor),
    });

    // The renderer already switched to "Extracting text...", so show it during OCR.
    if (activeSnipWindow && !activeSnipWindow.isDestroyed()) {
      activeSnipWindow.show();
      activeSnipWindow.focus();
    }

    // Run OCR with tesseract.js (keep snip window open for loading indicator)
    const Tesseract = require('tesseract.js');
    const buffer = cropped.toPNG();
    console.log('🔎 Running OCR on', rect.width, 'x', rect.height, 'region...');

    const ocrLang = getOcrLanguageCode();
    const bundledLangPath = getOcrLangPath();
    const trainedDataPath = path.join(bundledLangPath, `${ocrLang}.traineddata`);

    if (!fs.existsSync(trainedDataPath)) {
      closeSnipAndNotify(
        `OCR language data not found: ${ocrLang}.traineddata. ` +
        'Switch OCR Language to English or add the traineddata file to the app resources.'
      );
      return;
    }

    const { corePath, workerPath } = getTesseractPaths();
    const ocrOptions = {
      langPath: bundledLangPath,
      corePath,
      workerPath,
      gzip: false,
      cachePath: app.getPath('userData'),
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`🔎 OCR progress: ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    };

    console.log(`🔎 Using bundled ${ocrLang}.traineddata:`, trainedDataPath);
    const { data: { text } } = await Tesseract.recognize(buffer, ocrLang, ocrOptions);

    const cleaned = cleanupOcrPreviewText(text);
    console.log('🔎 OCR result:', cleaned.slice(0, 100));

    if (cleaned && cleaned.length > 0) {
      if (activeSnipWindow && !activeSnipWindow.isDestroyed()) {
        activeSnipWindow.webContents.send('ocr:preview', {
          text: cleaned,
          languageCode: ocrLang,
          languageName: OCR_LANGUAGES[ocrLang],
        });
      } else {
        showOverlay(cleanupOcrLookupText(cleaned, 'translate'));
      }
    } else {
      closeSnipAndNotify('No text found in the selected area. Try selecting a larger region with clearer text.');
    }
  } catch (err) {
    console.error('❌ OCR error:', err.message);
    closeSnipAndNotify('OCR failed: ' + err.message);
  }
});

ipcMain.on('ocr:previewAction', (event, payload = {}) => {
  const mode = payload.mode || 'translate';
  const rawText = payload.text || '';
  let text = cleanupOcrLookupText(rawText, mode);

  if (!text) {
    closeSnipAndNotify('No text to process. Please try OCR again.');
    return;
  }

  if (mode === 'save') {
    const result = saveOcrTextToLibrary(rawText);
    if (result.success && result.word) text = result.word;
  }

  if (snipWindow && !snipWindow.isDestroyed()) snipWindow.close();
  showOverlay(text);
});

function closeSnipAndNotify(message) {
  if (snipWindow && !snipWindow.isDestroyed()) snipWindow.close();
  const { dialog } = require('electron');
  dialog.showMessageBox({
    type: 'warning',
    title: 'EngiLink OCR',
    message: message,
    buttons: ['OK'],
  });
}

ipcMain.on('ocr:cancel', () => {
  if (snipWindow && !snipWindow.isDestroyed()) snipWindow.close();
});

/* ══════════════════════════════════════════════
   GLOBAL HOTKEYS (Transactional)
   ══════════════════════════════════════════════ */

let currentHotkeys = {};

const hotkeyHandlers = {
  lookup: () => {
    const { execFile } = require('child_process');
    const copyExe = getUnpackedAssetPath('assets', 'copy.exe');

    const oldClip = clipboard.readText();

    execFile(copyExe, [], { timeout: 2000, windowsHide: true }, (err) => {
      if (err) {
        console.log('⌨️ copy.exe failed:', err.message);
      }

      setTimeout(() => {
        const text = clipboard.readText().trim();
        if (text && text.length > 0) {
          if (text === oldClip) {
            console.log('⌨️ Clipboard unchanged, skipping');
            return;
          }
          let word = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
          if (word.length > 500) {
            const words = word.split(/\s+/).slice(0, 50);
            word = words.join(' ');
          }
          if (word.length > 500) word = word.slice(0, 500).trim();
          if (word) showOverlay(word);
        }
      }, 300);
    });
  },
  spotlight: () => {
    toggleSpotlight();
  },
  ocr: () => {
    startOCRCapture();
  },
};

function registerAllHotkeys(hotkeys) {
  const results = {};
  for (const [name, accelerator] of Object.entries(hotkeys)) {
    if (!hotkeyHandlers[name]) continue;
    try {
      const ok = globalShortcut.register(accelerator, hotkeyHandlers[name]);
      results[name] = ok;
      if (ok) {
        console.log(`✅ Hotkey registered: ${name} = ${accelerator}`);
      } else {
        console.error(`❌ Failed to register hotkey: ${name} = ${accelerator}`);
      }
    } catch (err) {
      console.error(`❌ Hotkey error for ${name}:`, err.message);
      results[name] = false;
    }
  }
  return results;
}

// IPC: transactional hotkey update
ipcMain.handle('hotkeys:update', (event, newHotkeys) => {
  const oldHotkeys = { ...currentHotkeys };

  // 1. Validate: no duplicates
  const values = Object.values(newHotkeys);
  if (new Set(values).size !== values.length) {
    return { success: false, error: 'Duplicate hotkeys — each must be unique' };
  }

  // 2. Unregister old EngiLink hotkeys
  for (const accel of Object.values(oldHotkeys)) {
    try { globalShortcut.unregister(accel); } catch { }
  }

  // 3. Try register new
  const results = registerAllHotkeys(newHotkeys);
  const failed = Object.entries(results).filter(([, ok]) => !ok);

  if (failed.length > 0) {
    // 4. Rollback: unregister any new that succeeded, re-register old
    for (const [name, ok] of Object.entries(results)) {
      if (ok) {
        try { globalShortcut.unregister(newHotkeys[name]); } catch { }
      }
    }
    registerAllHotkeys(oldHotkeys);
    currentHotkeys = oldHotkeys;
    return { success: false, error: `Failed to register: ${failed.map(f => f[0]).join(', ')}` };
  }

  // 5. Success
  currentHotkeys = { ...newHotkeys };
  // Update tray tooltip
  if (tray) {
    tray.setToolTip(`EngiLink Dictionary — ${currentHotkeys.lookup} to lookup`);
  }
  return { success: true };
});


/* ══════════════════════════════════════════════
   APP LIFECYCLE
   ══════════════════════════════════════════════ */

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showDashboard();
  });
}

app.whenReady().then(() => {
  setupIPC();
  createTray();
  createOverlayWindow();

  // Register hotkeys from settings (transactional)
  const db = loadDatabase();
  const hotkeys = db.settings.hotkeys || { lookup: 'CommandOrControl+Shift+Z' };
  currentHotkeys = { ...hotkeys };
  const hkResults = registerAllHotkeys(hotkeys);
  const failedHks = Object.entries(hkResults).filter(([, ok]) => !ok);
  if (failedHks.length > 0) {
    console.warn('⚠️ Some hotkeys failed to register:', failedHks.map(f => f[0]).join(', '));
    // Open settings so user can fix
    showDashboard();
    setTimeout(() => {
      if (dashboardWindow) dashboardWindow.webContents.send('navigate', 'settings');
    }, 1000);
  }
  if (tray && hkResults.lookup) {
    tray.setToolTip(`EngiLink Dictionary - ${currentHotkeys.lookup || DEFAULT_DATA.settings.hotkeys.lookup} to lookup`);
  } else if (tray) {
    tray.setToolTip('EngiLink Dictionary - lookup hotkey not registered');
  }

  // Prune stale cache on startup
  const cutoff = Date.now() - 30 * 86400000;
  let pruned = 0;
  for (const key of Object.keys(db.aiCache || {})) {
    if (db.aiCache[key].timestamp < cutoff) {
      delete db.aiCache[key];
      pruned++;
    }
  }
  if (pruned > 0) {
    saveDatabase(db);
    console.log(`🧹 Pruned ${pruned} stale cache entries on startup`);
  }

  // Show dashboard on first launch if no API key
  if (!db.settings.apiKey) {
    showDashboard();
  }

  console.log('📦 Database location:', DB_FILE);
  console.log('🚀 EngiLink Dictionary is running in system tray');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
