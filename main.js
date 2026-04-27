/* ============================================
   EngiLink Dictionary — Electron Main Process
   ============================================ */

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ── Database file path ──
const DB_DIR = path.join(app.getPath('userData'), 'engilink-db');
const DB_FILE = path.join(DB_DIR, 'data.json');
const DB_BACKUP = path.join(DB_DIR, 'data.backup.json');

// ── Default data structure (V3) ──
const DEFAULT_DATA = {
  schemaVersion: 3,
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
    },
    overlayWidth: 380,
    overlayMaxHeight: 520,
    theme: 'light',
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

  return { data, changed };
}

// ── Helpers ──
function joinApiPath(base, apiPath) {
  return `${base.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`;
}

function buildCacheKey(text, isPhrase, targetLang, endpoint, model) {
  const normalized = text.toLowerCase().trim();
  const raw = `${normalized}|${isPhrase}|${targetLang}|${endpoint}|${model}|pv2`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function getLocalDateStr(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function lookupDictionary(word) {
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
            resolve({
              success: true,
              word: entry.word,
              phonetic: entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text) || '',
              audioUrl: extractAudioUrl(entry.phonetics || []),
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

function extractAudioUrl(phonetics) {
  for (const p of phonetics) {
    if (p.audio && p.audio.length > 0) {
      let url = p.audio;
      if (url.startsWith('//')) url = 'https:' + url;
      return url;
    }
  }
  return '';
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

// High-level: build prompt, call API, parse JSON result
function callAI(word, apiKey, endpoint, model, isPhrase, targetLanguage) {
  return new Promise(async (resolve) => {
    const lang = targetLanguage || 'Vietnamese';

    let systemPrompt, userMessage;
    if (isPhrase) {
      systemPrompt = `You are a professional translator and language assistant.
Given an English phrase or sentence, provide:
1. "translation": Full, natural ${lang} translation.
2. "definition": Brief explanation of the meaning/context in English (2-3 sentences). If it contains technical or specialized terms, explain them.
3. "translatedMeaning": Same as translation field.
4. "relatedTerms": 3-5 key terms or concepts from the text.
5. "topic": A topic/category tag that best fits the content (e.g., "Technology", "Medicine", "Law", "Business", "Science", "Literature", "Daily Life", "Education", etc.).

Respond ONLY with valid JSON, no markdown:
{"translation": "...", "definition": "...", "translatedMeaning": "...", "relatedTerms": ["..."], "topic": "..."}`;
      userMessage = `Translate and explain: "${word}"`;
    } else {
      systemPrompt = `You are a dictionary and translation assistant.
Given a word or short phrase, provide:
1. A clear, concise definition (2-3 sentences). If the word has a specialized meaning in any field (tech, science, medicine, law, business, etc.), mention it.
2. "translatedMeaning": A short, natural ${lang} equivalent for the word. Keep it concise (usually 1-8 words). Do not write a full explanatory sentence here; put explanations only in "definition".
3. 3-5 related terms (single words or short phrases).
4. A topic/category tag that best fits (e.g., "Technology", "Medicine", "Law", "Business", "Science", "Mathematics", "Daily Life", "Education", etc.). Use "General" if it's a common everyday word.

Respond ONLY with valid JSON, no markdown:
{"definition": "...", "translatedMeaning": "...", "relatedTerms": ["...", "..."], "topic": "..."}`;
      userMessage = `Word: "${word}"`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const raw = await requestChatCompletion(endpoint, apiKey, model, messages, isPhrase ? 1000 : 400);

    if (!raw.success) {
      console.log('🤖 AI error:', raw.statusCode, raw.error);
      if (raw.statusCode === 429 || raw.error?.includes('quota') || raw.error?.includes('rate')) {
        resolve({ success: false, error: 'Rate limited — try again in ~60s' });
      } else if (raw.statusCode === 401) {
        resolve({ success: false, error: 'Invalid API key — check Settings' });
      } else {
        resolve({ success: false, error: raw.error });
      }
      return;
    }

    try {
      const content = raw.data.choices[0].message.content;
      console.log('🤖 AI content:', content.slice(0, 300));
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const result = JSON.parse(jsonStr);

      // Normalize translatedMeaning (fallback chain)
      result.translatedMeaning = result.translatedMeaning || result.translation || result.vietnameseMeaning || '';

      resolve({ success: true, ...result });
    } catch (e) {
      console.error('🤖 AI parse error:', e.message);
      resolve({ success: false, error: 'AI parse error: ' + e.message });
    }
  });
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
  ipcMain.handle('db:import', (event, jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      // Normalize with defaults before migration (handle missing fields)
      if (!parsed.settings) parsed.settings = {};
      parsed.settings = {
        ...DEFAULT_DATA.settings,
        ...parsed.settings,
        hotkeys: { ...DEFAULT_DATA.settings.hotkeys, ...(parsed.settings.hotkeys || {}) },
      };
      if (!parsed.words) parsed.words = [];
      if (!parsed.stats) parsed.stats = { ...DEFAULT_DATA.stats };
      if (!parsed.lookupHistory) parsed.lookupHistory = [];
      if (!parsed.aiCache) parsed.aiCache = {};
      const { data } = migrateDatabase(parsed);
      return saveDatabase(data);
    } catch (e) {
      console.error('Import failed:', e.message);
      return false;
    }
  });
  ipcMain.handle('db:reset', () => saveDatabase(JSON.parse(JSON.stringify(DEFAULT_DATA))));

  // ── Word Lookup (orchestrates all APIs) ──
  ipcMain.handle('lookup:word', async (event, word, options = {}) => {
    const { forceRefresh = false } = options;
    const db = loadDatabase();
    const settings = db.settings;

    // Detect if input is a phrase/sentence (2+ words)
    const wordCount = word.trim().split(/\s+/).length;
    const isPhrase = wordCount > 1;

    // ── AI Cache check ──
    const cacheKey = buildCacheKey(word, isPhrase, settings.targetLanguage, settings.apiEndpoint, settings.model);
    let aiResult;
    let usedCache = false;

    if (!forceRefresh && db.aiCache[cacheKey]) {
      aiResult = db.aiCache[cacheKey].response;
      usedCache = true;
      console.log('💾 Cache hit for:', word.slice(0, 40));
    } else {
      // Call AI
      if (isPhrase) {
        aiResult = await callAI(word, settings.apiKey, settings.apiEndpoint, settings.model, true, settings.targetLanguage);
      } else {
        aiResult = await callAI(word, settings.apiKey, settings.apiEndpoint, settings.model, false, settings.targetLanguage);
      }
      // Store in cache if successful
      if (aiResult.success) {
        db.aiCache[cacheKey] = { response: aiResult, timestamp: Date.now() };
      }
    }

    // ── Dictionary (only for single words) ──
    let dictResult;
    if (isPhrase) {
      dictResult = { success: false, error: 'Phrase mode — using AI translation' };
    } else {
      dictResult = await lookupDictionary(word);
    }

    // ── Related words ──
    const relatedWords = settings.showRelatedWords !== false
      ? findRelatedWords(
        word,
        aiResult.success ? aiResult.topic : '',
        aiResult.success ? aiResult.relatedTerms : [],
        db.words
      )
      : [];

    // ── Lookup History (always saved) ──
    db.lookupHistory.push({
      word: word,
      isPhrase: isPhrase,
      timestamp: new Date().toISOString(),
      cached: usedCache,
    });
    if (db.lookupHistory.length > 1000) {
      db.lookupHistory = db.lookupHistory.slice(-1000);
    }

    // ── Stats (always updated) ──
    const today = getLocalDateStr();
    db.stats.totalLookups++;
    if (db.stats.lastActiveDate === today) {
      db.stats.todayLookups++;
    } else {
      const yesterdayStr = getLocalDateStr(new Date(Date.now() - 86400000));
      if (db.stats.lastActiveDate === yesterdayStr) {
        db.stats.streak++;
      } else if (db.stats.lastActiveDate !== today) {
        db.stats.streak = 1;
      }
      db.stats.todayLookups = 1;
      db.stats.lastActiveDate = today;
    }

    // ── Word save (only if autoSave) ──
    let savedWordId = null, savedLookupCount = 0, savedIsFavorite = false, savedUserNote = '';
    if (settings.autoSave) {
      const existingIdx = db.words.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());

      const wordEntry = {
        id: existingIdx >= 0 ? db.words[existingIdx].id : crypto.randomUUID(),
        word: word,
        phonetic: dictResult.success ? dictResult.phonetic : (existingIdx >= 0 ? db.words[existingIdx].phonetic : ''),
        audioUrl: dictResult.success ? dictResult.audioUrl : (existingIdx >= 0 ? db.words[existingIdx].audioUrl : ''),
        meanings: dictResult.success ? dictResult.meanings : (existingIdx >= 0 ? db.words[existingIdx].meanings : []),
        technicalNote: aiResult.success ? aiResult.definition : (existingIdx >= 0 ? db.words[existingIdx].technicalNote : ''),
        translatedMeaning: aiResult.success ? aiResult.translatedMeaning : (existingIdx >= 0 ? (db.words[existingIdx].translatedMeaning || db.words[existingIdx].vietnameseMeaning) : ''),
        vietnameseMeaning: aiResult.success ? aiResult.translatedMeaning : (existingIdx >= 0 ? db.words[existingIdx].vietnameseMeaning : ''),
        topic: aiResult.success ? aiResult.topic : (existingIdx >= 0 ? db.words[existingIdx].topic : ''),
        tags: aiResult.success ? (aiResult.relatedTerms || []) : (existingIdx >= 0 ? db.words[existingIdx].tags : []),
        relatedTerms: aiResult.success ? (aiResult.relatedTerms || []) : (existingIdx >= 0 ? db.words[existingIdx].relatedTerms : []),
        userNote: existingIdx >= 0 ? db.words[existingIdx].userNote : '',
        isFavorite: existingIdx >= 0 ? db.words[existingIdx].isFavorite : false,
        lookupCount: existingIdx >= 0 ? db.words[existingIdx].lookupCount + 1 : 1,
        firstLookup: existingIdx >= 0 ? db.words[existingIdx].firstLookup : new Date().toISOString(),
        lastLookup: new Date().toISOString(),
        isPhrase: isPhrase,
        // SRS fields (preserve existing)
        easeFactor: existingIdx >= 0 ? db.words[existingIdx].easeFactor : 2.5,
        interval: existingIdx >= 0 ? db.words[existingIdx].interval : 0,
        repetitions: existingIdx >= 0 ? db.words[existingIdx].repetitions : 0,
        dueDate: existingIdx >= 0 ? db.words[existingIdx].dueDate : null,
      };

      if (existingIdx >= 0) {
        db.words[existingIdx] = wordEntry;
      } else {
        db.words.unshift(wordEntry);
      }

      savedWordId = wordEntry.id;
      savedLookupCount = wordEntry.lookupCount;
      savedIsFavorite = wordEntry.isFavorite;
      savedUserNote = wordEntry.userNote;
    }

    // Always save (cache + history + stats, and words if autoSave)
    saveDatabase(db);

    return {
      dictionary: dictResult,
      ai: aiResult,
      relatedWords,
      isPhrase,
      usedCache,
      savedWordId: savedWordId || null,
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
      sandbox: false,
    },
  });

  overlayWindow.loadFile('overlay.html');

  // Track overlay readiness
  overlayWindow._isReady = false;
  overlayWindow._pendingWord = null;

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('📗 Overlay webContents loaded');
    overlayWindow._isReady = true;
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
      sandbox: false,
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
      sandbox: false,
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
   GLOBAL HOTKEYS (Transactional)
   ══════════════════════════════════════════════ */

let currentHotkeys = {};

const hotkeyHandlers = {
  lookup: () => {
    const { execFile } = require('child_process');
    const copyExe = path.join(__dirname, 'assets', 'copy.exe');

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
