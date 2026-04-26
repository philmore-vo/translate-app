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

// ── Default data structure ──
const DEFAULT_DATA = {
  words: [],
  settings: {
    apiKey: '',
    model: 'google/gemini-2.0-flash-exp:free',
    apiEndpoint: 'https://openrouter.ai/api/v1',
    hotkeyDoubleCopyMs: 500,
    overlayWidth: 380,
    overlayMaxHeight: 520,
    theme: 'dark',
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

let tray = null;
let overlayWindow = null;
let dashboardWindow = null;

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
      const data = JSON.parse(raw);
      data.settings = { ...DEFAULT_DATA.settings, ...data.settings };
      if (!data.words) data.words = [];
      if (!data.stats) data.stats = { ...DEFAULT_DATA.stats };
      return data;
    }
  } catch (err) {
    console.error('Failed to load database, trying backup:', err.message);
    try {
      if (fs.existsSync(DB_BACKUP)) {
        const raw = fs.readFileSync(DB_BACKUP, 'utf-8');
        const data = JSON.parse(raw);
        data.settings = { ...DEFAULT_DATA.settings, ...data.settings };
        console.log('Restored from backup successfully');
        return data;
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

function callAI(word, apiKey, endpoint, model, isPhrase) {
  return new Promise((resolve) => {
    if (!apiKey) {
      resolve({ success: false, error: 'No API key — go to Dashboard → Settings' });
      return;
    }

    let systemPrompt, userMessage;
    if (isPhrase) {
      systemPrompt = `You are a professional translator and language assistant.
Given an English phrase or sentence, provide:
1. "translation": Full, natural Vietnamese translation.
2. "definition": Brief explanation of the meaning/context in English (2-3 sentences). If it contains technical or specialized terms, explain them.
3. "vietnameseMeaning": Same as translation field.
4. "relatedTerms": 3-5 key terms or concepts from the text.
5. "topic": A topic/category tag that best fits the content (e.g., "Technology", "Medicine", "Law", "Business", "Science", "Literature", "Daily Life", "Education", etc.).

Respond ONLY with valid JSON, no markdown:
{"translation": "...", "definition": "...", "vietnameseMeaning": "...", "relatedTerms": ["..."], "topic": "..."}`;
      userMessage = `Translate and explain: "${word}"`;
    } else {
      systemPrompt = `You are a dictionary and translation assistant.
Given a word or short phrase, provide:
1. A clear, concise definition (2-3 sentences). If the word has a specialized meaning in any field (tech, science, medicine, law, business, etc.), mention it.
2. Vietnamese translation of the meaning.
3. 3-5 related terms (single words or short phrases).
4. A topic/category tag that best fits (e.g., "Technology", "Medicine", "Law", "Business", "Science", "Mathematics", "Daily Life", "Education", etc.). Use "General" if it's a common everyday word.

Respond ONLY with valid JSON, no markdown:
{"definition": "...", "vietnameseMeaning": "...", "relatedTerms": ["...", "..."], "topic": "..."}`;
      userMessage = `Word: "${word}"`;
    }

    // Use standard OpenAI-compatible chat/completions format
    const requestBody = JSON.stringify({
      model: model || 'google/gemini-2.0-flash-exp:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: isPhrase ? 1000 : 400,
    });

    const apiUrl = new URL(`${endpoint}/chat/completions`);

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
        try {
          console.log('🤖 AI status:', res.statusCode, '| Raw (300 chars):', data.slice(0, 300));
          const parsed = JSON.parse(data);

          if (parsed.error) {
            const msg = parsed.error.message || 'API error';
            if (res.statusCode === 429 || msg.includes('quota') || msg.includes('rate')) {
              resolve({ success: false, error: 'Rate limited — try again in ~60s' });
            } else if (res.statusCode === 401) {
              resolve({ success: false, error: 'Invalid API key — check Settings' });
            } else {
              resolve({ success: false, error: msg });
            }
            return;
          }

          // OpenAI-compatible format: choices[0].message.content
          const content = parsed.choices[0].message.content;
          console.log('🤖 AI content:', content.slice(0, 300));

          // Parse JSON from AI response (may be wrapped in ```json blocks)
          const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const result = JSON.parse(jsonStr);
          resolve({ success: true, ...result });
        } catch (e) {
          console.error('🤖 AI parse error:', e.message, '| Raw:', data.slice(0, 300));
          resolve({ success: false, error: 'AI parse error: ' + e.message });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'AI request timed out' });
    });

    req.write(requestBody);
    req.end();
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
      const data = JSON.parse(jsonStr);
      return saveDatabase(data);
    } catch {
      return false;
    }
  });
  ipcMain.handle('db:reset', () => saveDatabase(JSON.parse(JSON.stringify(DEFAULT_DATA))));

  // ── Word Lookup (orchestrates all APIs) ──
  ipcMain.handle('lookup:word', async (event, word) => {
    const db = loadDatabase();
    const settings = db.settings;

    // Detect if input is a phrase/sentence (2+ words)
    const wordCount = word.trim().split(/\s+/).length;
    const isPhrase = wordCount > 1;

    let dictResult, aiResult;

    if (isPhrase) {
      // For phrases/sentences: skip Dictionary API, only use AI
      dictResult = { success: false, error: 'Phrase mode — using AI translation' };
      aiResult = await callAI(word, settings.apiKey, settings.apiEndpoint, settings.model, true);
    } else {
      // For single words / short phrases: run both in parallel
      [dictResult, aiResult] = await Promise.all([
        lookupDictionary(word),
        callAI(word, settings.apiKey, settings.apiEndpoint, settings.model, false),
      ]);
    }

    // Find related words from DB (respect showRelatedWords setting)
    const relatedWords = settings.showRelatedWords !== false
      ? findRelatedWords(
          word,
          aiResult.success ? aiResult.topic : '',
          aiResult.success ? aiResult.relatedTerms : [],
          db.words
        )
      : [];

    // Auto-save word to database
    let savedWordId = null, savedLookupCount = 0, savedIsFavorite = false, savedUserNote = '';
    if (settings.autoSave) {
      const existingIdx = db.words.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());

      const wordEntry = {
        id: existingIdx >= 0 ? db.words[existingIdx].id : crypto.randomUUID(),
        word: word,
        phonetic: dictResult.success ? dictResult.phonetic : '',
        audioUrl: dictResult.success ? dictResult.audioUrl : '',
        meanings: dictResult.success ? dictResult.meanings : [],
        technicalNote: aiResult.success ? aiResult.definition : '',
        vietnameseMeaning: aiResult.success ? (aiResult.translation || aiResult.vietnameseMeaning) : '',
        topic: aiResult.success ? aiResult.topic : '',
        tags: aiResult.success ? (aiResult.relatedTerms || []) : [],
        relatedTerms: aiResult.success ? (aiResult.relatedTerms || []) : [],
        userNote: existingIdx >= 0 ? db.words[existingIdx].userNote : '',
        isFavorite: existingIdx >= 0 ? db.words[existingIdx].isFavorite : false,
        lookupCount: existingIdx >= 0 ? db.words[existingIdx].lookupCount + 1 : 1,
        firstLookup: existingIdx >= 0 ? db.words[existingIdx].firstLookup : new Date().toISOString(),
        lastLookup: new Date().toISOString(),
        isPhrase: isPhrase,
      };

      if (existingIdx >= 0) {
        db.words[existingIdx] = wordEntry;
      } else {
        db.words.unshift(wordEntry);
      }

      // Update stats (use local date, not UTC)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      db.stats.totalLookups++;
      if (db.stats.lastActiveDate === today) {
        db.stats.todayLookups++;
      } else {
        const yesterday = new Date(now.getTime() - 86400000);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        if (db.stats.lastActiveDate === yesterdayStr) {
          db.stats.streak++;
        } else if (db.stats.lastActiveDate !== today) {
          db.stats.streak = 1;
        }
        db.stats.todayLookups = 1;
        db.stats.lastActiveDate = today;
      }

      saveDatabase(db);

      savedWordId = wordEntry.id;
      savedLookupCount = wordEntry.lookupCount;
      savedIsFavorite = wordEntry.isFavorite;
      savedUserNote = wordEntry.userNote;
    }

    return {
      dictionary: dictResult,
      ai: aiResult,
      relatedWords,
      isPhrase,
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

  ipcMain.handle('settings:save', (event, settings) => {
    const db = loadDatabase();
    db.settings = { ...db.settings, ...settings };
    return saveDatabase(db);
  });

  // ── Shell ──
  ipcMain.handle('shell:openExternal', (event, url) => {
    // Only allow http/https URLs
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      const { shell } = require('electron');
      return shell.openExternal(url);
    }
    return false;
  });

  // ── Window Controls ──
  ipcMain.on('overlay:hide', () => {
    if (overlayWindow) overlayWindow.hide();
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
    icon: path.join(__dirname, 'assets', 'icon.png'),
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
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAh5JREFUWEftlr1OwzAQx/+XtKUMSEhILIgNiQGJgYkH4A14Ap6AN+AJeAKeAIkBiYUBsaBKSHxMpS2J7TvZTty4cZyUjnTq3f1+d+e7mDDmh8ecHwMAVwFXAW4FqNF/V/4MrP4bJn+FqqoFGNSiqAD/A+Bm4vr+MEmS75BSWcU4PuB2cnz1fOcHgOvA3IMDPiCAbp6k1xLgjNgJRD4gm1tzpwrcFuB8/OxmQlE9yVkslmFRkCBBiqtTi0+enj00nUH7wlP1h6WU/K7VChFMnfY99p2dxqt/Dz9TwHuArE2IzWxbEX0RBwHOBcpHsVKeCp8r0JEdArA/v7a3T0J/xr9vdrdqK7Kxzvy6wBjIlAPDqb5hqw7cRF5/p2YnoX2l3pJl4KD7T3oLsGYLoG88oBxQxU+4FIm+geQ1Y7EX0Gijhqs+x/wGWGn6KSFcV2Y8D5FqVdNHXQHlhZp5VBhIFtmj+r5YVT/SOnmjVaVnKIH2O9AxGahSB9UVwjU9hW6AQWKZM8LMlFPVxr9Ik9vu9Bqx1q73sCVWf4dECwGnAQSBqYOnvpdvOd4WVUVPUZvt++lw3bH9tITiqJXtI8v/A3VZtDLjqTFb9U2NW7A6EvKxLf8XjC9s8j5sZFdSJ2KeBkBlR34EAEn+Y7r1R+rrj/AXAVqPM+rVkBbvYryBxs7jX6jwvwwkEJfSl0FXgDVjy0IK+k/kIAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('EngiLink Dictionary — Ctrl+Shift+Z to lookup');

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
   GLOBAL HOTKEY
   ══════════════════════════════════════════════ */

function registerHotkey() {
  const { execFile } = require('child_process');
  const copyExe = path.join(__dirname, 'assets', 'copy.exe');

  const ret = globalShortcut.register('CommandOrControl+Shift+Z', () => {
    console.log('⌨️ Hotkey Ctrl+Shift+Z pressed!');

    // Save current clipboard to compare later
    const oldClip = clipboard.readText();

    // Simulate Ctrl+C via compiled native helper (uses Win32 keybd_event)
    execFile(copyExe, [], { timeout: 2000, windowsHide: true }, (err) => {
      if (err) {
        console.log('⌨️ copy.exe failed, using existing clipboard:', err.message);
      }

      // Wait for clipboard to update after simulated Ctrl+C
      setTimeout(() => {
        const text = clipboard.readText().trim();
        console.log('⌨️ Clipboard text:', JSON.stringify(text).slice(0, 100));
        console.log('⌨️ Clipboard changed:', text !== oldClip);

        if (text && text.length > 0) {
          // Guard: skip if clipboard didn't change (copy.exe failed to capture new text)
          if (text === oldClip) {
            console.log('⌨️ Clipboard unchanged — copy.exe may have failed, skipping');
            return;
          }

          // Join multi-line text (PDFs break lines mid-sentence)
          let word = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

          // Keep up to ~50 words (enough for 2-3 sentences)
          if (word.length > 500) {
            const words = word.split(/\s+/).slice(0, 50);
            word = words.join(' ');
          }

          // Final trim to 500 chars max
          if (word.length > 500) {
            word = word.slice(0, 500).trim();
          }

          console.log('⌨️ Word to lookup:', word);
          if (word) showOverlay(word);
        } else {
          console.log('⌨️ Clipboard is empty — select some text first');
        }
      }, 300);
    });
  });

  if (!ret) {
    console.error('❌ Failed to register global hotkey Ctrl+Shift+Z — another app may have claimed it');
  } else {
    console.log('✅ Global hotkey registered: Ctrl+Shift+Z');
  }
}



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
  registerHotkey();

  // Show dashboard on first launch if no API key
  const db = loadDatabase();
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

// Prevent app from quitting when all windows close
app.on('before-quit', () => {
  app.isQuitting = true;
});
