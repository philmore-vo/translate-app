/* ============================================
   EngiLink Dictionary — Dashboard Logic
   ============================================ */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── State ──
  let allWords = [];
  let settings = {};
  let currentPage = 'library';
  let studyCards = [];
  let studyIndex = 0;
  let studyRevealed = false;

  /* ══════════════════════════════════
     INITIALIZATION
     ══════════════════════════════════ */

  async function init() {
    settings = await window.eld.getSettings();
    allWords = await window.eld.getAllWords();

    setupNavigation();
    setupSettings();
    setupLibrary();
    setupStudy();
    setupLookup();
    setupModal();
    setupDataManagement();
    setupHistory();

    renderLibrary();
    renderStats();

    // Listen for navigation from main process (e.g., tray → settings)
    window.eld.onNavigate((page) => navigateTo(page));

    // Show settings page if no API key
    if (!settings.apiKey) {
      navigateTo('settings');
    }
  }

  /* ══════════════════════════════════
     NAVIGATION
     ══════════════════════════════════ */

  function setupNavigation() {
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page) navigateTo(page);
      });
    });
  }

  function navigateTo(page) {
    currentPage = page;

    // Update nav
    $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));

    // Update pages
    $$('.page').forEach((p) => p.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');

    // Refresh data for the page
    if (page === 'library') renderLibrary();
    if (page === 'stats') renderStats();
    if (page === 'study') resetStudy();
    if (page === 'history') renderHistory();
  }

  /* ══════════════════════════════════
     LIBRARY
     ══════════════════════════════════ */

  function setupLibrary() {
    $('#search-input').addEventListener('input', debounce(renderLibrary, 200));
    $('#filter-topic').addEventListener('change', renderLibrary);
    $('#filter-sort').addEventListener('change', renderLibrary);
  }

  async function renderLibrary() {
    allWords = await window.eld.getAllWords();
    const grid = $('#word-grid');
    const emptyState = $('#library-empty');
    const topicFilter = $('#filter-topic');

    // Update topic filter options
    const topics = [...new Set(allWords.map((w) => w.topic).filter(Boolean))].sort();
    const currentTopic = topicFilter.value;
    topicFilter.innerHTML = '<option value="">All Topics</option>' +
      topics.map((t) => `<option value="${escAttr(t)}" ${t === currentTopic ? 'selected' : ''}>${escHtml(t)}</option>`).join('');

    // Also update study topic filter
    const studyFilter = $('#study-topic-filter');
    if (studyFilter) {
      studyFilter.innerHTML = '<option value="">All Topics</option>' +
        topics.map((t) => `<option value="${escAttr(t)}">${escHtml(t)}</option>`).join('');
    }

    // Apply filters
    let filtered = [...allWords];
    
    const query = ($('#search-input').value || '').toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((w) =>
        w.word.toLowerCase().includes(query) ||
        (w.vietnameseMeaning || '').toLowerCase().includes(query) ||
        (w.topic || '').toLowerCase().includes(query) ||
        (w.technicalNote || '').toLowerCase().includes(query)
      );
    }

    if (currentTopic) {
      filtered = filtered.filter((w) => w.topic === currentTopic);
    }

    // Sort
    const sort = $('#filter-sort').value;
    switch (sort) {
      case 'alpha':
        filtered.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case 'frequency':
        filtered.sort((a, b) => (b.lookupCount || 0) - (a.lookupCount || 0));
        break;
      case 'favorites':
        filtered.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
        break;
      default: // recent
        filtered.sort((a, b) => new Date(b.lastLookup) - new Date(a.lastLookup));
    }

    // Render
    if (filtered.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      grid.innerHTML = filtered.map((w) => renderWordCard(w)).join('');

      // Attach click handlers
      grid.querySelectorAll('.word-card').forEach((card) => {
        card.addEventListener('click', () => {
          const wordId = card.dataset.id;
          const word = allWords.find((w) => w.id === wordId);
          if (word) showWordDetail(word);
        });
      });
    }
  }

  function renderWordCard(w) {
    const def = w.meanings && w.meanings[0] && w.meanings[0].definitions && w.meanings[0].definitions[0]
      ? w.meanings[0].definitions[0].definition
      : (w.technicalNote || 'No definition available');

    return `
      <div class="word-card" data-id="${escAttr(w.id)}">
        <div class="wc-header">
          <div>
            <div class="wc-word">${escHtml(w.word)}</div>
            ${w.phonetic ? `<div class="wc-phonetic">${escHtml(w.phonetic)}</div>` : ''}
          </div>
          ${w.isFavorite ? '<span class="wc-fav">⭐</span>' : ''}
        </div>
        ${w.vietnameseMeaning ? `<div class="wc-vn">🇻🇳 ${escHtml(w.vietnameseMeaning)}</div>` : ''}
        <div class="wc-definition">${escHtml(def)}</div>
        <div class="wc-footer">
          ${w.topic ? `<span class="wc-topic">${escHtml(w.topic)}</span>` : '<span></span>'}
          <span class="wc-count">×${w.lookupCount || 1}</span>
        </div>
      </div>
    `;
  }

  /* ══════════════════════════════════
     WORD DETAIL MODAL
     ══════════════════════════════════ */

  function setupModal() {
    $('#modal-close').addEventListener('click', () => {
      $('#word-detail-modal').style.display = 'none';
    });

    $('#word-detail-modal').addEventListener('click', (e) => {
      if (e.target === $('#word-detail-modal')) {
        $('#word-detail-modal').style.display = 'none';
      }
    });
  }

  function showWordDetail(w) {
    const body = $('#modal-body');
    
    let meaningsHtml = '';
    if (w.meanings && w.meanings.length > 0) {
      for (const m of w.meanings) {
        meaningsHtml += `<div class="md-def-pos">${escHtml(m.partOfSpeech)}</div>`;
        for (const d of (m.definitions || [])) {
          meaningsHtml += `<div class="md-def-item">${escHtml(d.definition)}`;
          if (d.example) meaningsHtml += `<br><em style="color:var(--text-muted);">"${escHtml(d.example)}"</em>`;
          meaningsHtml += `</div>`;
        }
      }
    }

    body.innerHTML = `
      <div class="md-word">${escHtml(w.word)}</div>
      ${w.phonetic ? `<div class="md-phonetic">${escHtml(w.phonetic)}</div>` : ''}
      ${w.vietnameseMeaning ? `<div class="md-vn">🇻🇳 ${escHtml(w.vietnameseMeaning)}</div>` : ''}

      ${meaningsHtml ? `
        <div class="md-section">
          <div class="md-section-title">📖 Dictionary</div>
          ${meaningsHtml}
        </div>
      ` : ''}

      ${w.technicalNote ? `
        <div class="md-section">
          <div class="md-section-title">🔧 Technical Note</div>
          <div class="md-tech">${escHtml(w.technicalNote)}</div>
        </div>
      ` : ''}

      ${w.topic ? `<div class="md-topic"># ${escHtml(w.topic)}</div>` : ''}

      ${w.tags && w.tags.length > 0 ? `
        <div class="md-tags">
          ${w.tags.map((t) => `<span class="md-tag">${escHtml(t)}</span>`).join('')}
        </div>
      ` : ''}

      ${w.userNote ? `
        <div class="md-section" style="margin-top:12px;">
          <div class="md-section-title">📝 Your Note</div>
          <div class="md-note">${escHtml(w.userNote)}</div>
        </div>
      ` : ''}

      <div class="md-meta">
        <span>First lookup: ${formatDate(w.firstLookup)}</span>
        <span>Last: ${formatDate(w.lastLookup)}</span>
        <span>Looked up ${w.lookupCount || 1}×</span>
      </div>

      <div class="md-actions">
        <button class="btn-secondary" id="modal-btn-fav" data-id="${escAttr(w.id)}">
          ${w.isFavorite ? '⭐ Unfavorite' : '☆ Favorite'}
        </button>
        <button class="btn-danger" id="modal-btn-delete" data-id="${escAttr(w.id)}">
          Delete
        </button>
      </div>
    `;

    // Attach action handlers
    $('#modal-btn-fav').addEventListener('click', async () => {
      await window.eld.toggleFavorite(w.id);
      w.isFavorite = !w.isFavorite;
      showWordDetail(w);
      renderLibrary();
    });

    $('#modal-btn-delete').addEventListener('click', async () => {
      if (confirm(`Delete "${w.word}" from your library?`)) {
        await window.eld.deleteWord(w.id);
        $('#word-detail-modal').style.display = 'none';
        renderLibrary();
        renderStats();
      }
    });

    $('#word-detail-modal').style.display = 'flex';
  }

  /* ══════════════════════════════════
     STUDY MODE
     ══════════════════════════════════ */

  function setupStudy() {
    $('#btn-start-study').addEventListener('click', startStudy);
    $('#flashcard').addEventListener('click', revealCard);
    // SM-2 quality buttons: Again=0, Hard=3, Good=4, Easy=5
    $('#btn-fc-hard').addEventListener('click', () => nextCard(3));
    $('#btn-fc-ok').addEventListener('click', () => nextCard(4));
    $('#btn-fc-easy').addEventListener('click', () => nextCard(5));
    $('#btn-study-again').addEventListener('click', startStudy);
  }

  function resetStudy() {
    $('#study-intro').style.display = 'block';
    $('#flashcard-area').style.display = 'none';
    $('#study-complete').style.display = 'none';
  }

  async function startStudy() {
    // Use SRS due cards
    studyCards = await window.eld.getDueCards();

    const topicFilter = $('#study-topic-filter').value;
    if (topicFilter) {
      studyCards = studyCards.filter((w) => w.topic === topicFilter);
    }

    if (studyCards.length === 0) {
      alert('No cards due for review! Look up some words first or check back later.');
      return;
    }

    studyCards = studyCards.slice(0, Math.min(20, studyCards.length));
    studyIndex = 0;
    studyRevealed = false;

    $('#study-intro').style.display = 'none';
    $('#study-complete').style.display = 'none';
    $('#flashcard-area').style.display = 'block';

    showStudyCard();
  }

  function showStudyCard() {
    const card = studyCards[studyIndex];
    const total = studyCards.length;

    $('#study-progress-text').textContent = `${studyIndex + 1} / ${total}`;
    $('#study-progress-fill').style.width = `${((studyIndex + 1) / total) * 100}%`;

    $('#fc-word').textContent = card.word;
    $('#fc-phonetic').textContent = card.phonetic || '';

    const def = card.meanings && card.meanings[0] && card.meanings[0].definitions && card.meanings[0].definitions[0]
      ? card.meanings[0].definitions[0].definition
      : '';
    $('#fc-definition').textContent = def;
    $('#fc-tech').textContent = card.technicalNote || '';
    const meaning = card.translatedMeaning || card.vietnameseMeaning || '';
    $('#fc-vn').textContent = meaning ? `🌐 ${meaning}` : '';

    $('#flashcard-front').style.display = 'block';
    $('#flashcard-back').style.display = 'none';
    $('#flashcard-actions').style.display = 'none';
    studyRevealed = false;
  }

  function revealCard() {
    if (studyRevealed) return;
    studyRevealed = true;
    $('#flashcard-front').style.display = 'none';
    $('#flashcard-back').style.display = 'block';
    $('#flashcard-actions').style.display = 'flex';
  }

  async function nextCard(quality) {
    // Submit SM-2 review
    const card = studyCards[studyIndex];
    if (card && card.id) {
      await window.eld.reviewCard(card.id, quality);
    }

    studyIndex++;
    if (studyIndex >= studyCards.length) {
      // Complete
      $('#flashcard-area').style.display = 'none';
      $('#study-complete').style.display = 'block';
      $('#study-summary').textContent = `You reviewed ${studyCards.length} word${studyCards.length > 1 ? 's' : ''}. Keep it up!`;
    } else {
      showStudyCard();
    }
  }

  /* ══════════════════════════════════
     STATISTICS
     ══════════════════════════════════ */

  async function renderStats() {
    const stats = await window.eld.getStats();

    $('#stat-total-words').textContent = stats.totalWords || 0;
    $('#stat-total-lookups').textContent = stats.totalLookups || 0;
    $('#stat-streak').textContent = stats.streak || 0;
    $('#stat-today').textContent = stats.todayLookups || 0;
    $('#stat-favorites').textContent = stats.favoriteCount || 0;

    // Top topics
    const topicBars = $('#topic-bars');
    if (stats.topTopics && stats.topTopics.length > 0) {
      const maxCount = stats.topTopics[0].count;
      topicBars.innerHTML = stats.topTopics.map((t) => `
        <div class="topic-bar-row">
          <span class="topic-bar-label">${escHtml(t.topic)}</span>
          <div class="topic-bar-track">
            <div class="topic-bar-fill" style="width: ${(t.count / maxCount) * 100}%"></div>
          </div>
          <span class="topic-bar-count">${t.count}</span>
        </div>
      `).join('');
    } else {
      topicBars.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No data yet</p>';
    }

    // Recent words
    allWords = await window.eld.getAllWords();
    const recent = [...allWords].sort((a, b) => new Date(b.lastLookup) - new Date(a.lastLookup)).slice(0, 15);
    const recentEl = $('#recent-words');
    recentEl.innerHTML = recent.map((w) => `<span class="recent-chip">${escHtml(w.word)}</span>`).join('');
  }

  /* ══════════════════════════════════
     QUICK LOOKUP
     ══════════════════════════════════ */

  function setupLookup() {
    const input = $('#lookup-input');
    const btn = $('#btn-lookup');

    async function doLookup() {
      const word = input.value.trim();
      if (!word) return;

      $('#lookup-result').style.display = 'none';
      $('#lookup-loading').style.display = 'flex';

      try {
        const result = await window.eld.lookupWord(word);
        renderLookupResult(result, word);
      } catch (err) {
        $('#lookup-result').innerHTML = `<p style="color:var(--red);">Lookup failed: ${escHtml(err.message)}</p>`;
        $('#lookup-result').style.display = 'block';
      }

      $('#lookup-loading').style.display = 'none';
    }

    btn.addEventListener('click', doLookup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLookup();
    });
  }

  function renderLookupResult(result, word) {
    const { dictionary, ai } = result;
    const el = $('#lookup-result');

    let html = `<div class="lr-word">${escHtml(word)}</div>`;

    if (dictionary && dictionary.success) {
      if (dictionary.phonetic) html += `<div class="lr-phonetic">${escHtml(dictionary.phonetic)}</div>`;

      html += '<div class="lr-section"><div class="lr-section-title">📖 Dictionary</div>';
      for (const m of (dictionary.meanings || [])) {
        for (const d of (m.definitions || [])) {
          html += `<div class="lr-def">${escHtml(d.definition)}</div>`;
        }
      }
      html += '</div>';
    }

    if (ai && ai.success) {
      const tm = ai.translatedMeaning || ai.translation || ai.vietnameseMeaning || '';
      if (tm) html += `<div class="lr-vn">🌐 ${escHtml(tm)}</div>`;
      if (ai.definition) {
        html += `<div class="lr-section"><div class="lr-section-title">🔧 Technical Note</div>`;
        html += `<div class="lr-tech">${escHtml(ai.definition)}</div></div>`;
      }
      if (ai.topic) html += `<div class="lr-topic"># ${escHtml(ai.topic)}</div>`;
    }

    el.innerHTML = html;
    el.style.display = 'block';

    // Refresh library if on that page
    renderLibrary();
  }

  /* ══════════════════════════════════
     SETTINGS
     ══════════════════════════════════ */

  let settingsEventsAttached = false;

  function setupSettings() {
    populateSettings();

    if (settingsEventsAttached) return;
    settingsEventsAttached = true;

    // Save button
    $('#btn-save-settings').addEventListener('click', async () => {
      const newSettings = {
        apiKey: $('#setting-api-key').value.trim(),
        model: $('#setting-model').value,
        apiEndpoint: $('#setting-endpoint').value.trim(),
        targetLanguage: $('#setting-language').value,
        autoSave: $('#setting-autosave').checked,
        showRelatedWords: $('#setting-related').checked,
      };

      // Update hotkeys transactionally first
      const hkLookup = $('#setting-hotkey-lookup').value;
      const hkSpotlight = $('#setting-hotkey-spotlight').value;
      if (hkLookup && hkSpotlight) {
        const hkResult = await window.eld.updateHotkeys({ lookup: hkLookup, spotlight: hkSpotlight });
        const hkStatus = $('#hotkey-status');
        if (hkResult.success) {
          newSettings.hotkeys = { lookup: hkLookup, spotlight: hkSpotlight };
          hkStatus.textContent = '✓ Hotkeys updated';
          hkStatus.style.color = 'var(--green)';
        } else {
          hkStatus.textContent = '✗ ' + hkResult.error;
          hkStatus.style.color = 'var(--red)';
        }
        setTimeout(() => { hkStatus.textContent = ''; }, 4000);
      }

      const ok = await window.eld.saveSettings(newSettings);
      settings = await window.eld.getSettings();

      const status = $('#save-status');
      status.textContent = ok ? '✓ Settings saved!' : '✗ Failed to save';
      status.style.color = ok ? 'var(--green)' : 'var(--red)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });

    // Test connection
    $('#btn-test-connection').addEventListener('click', async () => {
      const testStatus = $('#test-status');
      testStatus.textContent = '⏳ Testing...';
      testStatus.style.color = 'var(--text-muted)';
      const result = await window.eld.testAI({
        apiKey: $('#setting-api-key').value.trim(),
        endpoint: $('#setting-endpoint').value.trim(),
        model: $('#setting-model').value,
      });
      if (result.success) {
        testStatus.textContent = `✓ Connected (${result.latencyMs}ms)`;
        testStatus.style.color = 'var(--green)';
      } else {
        testStatus.textContent = `✗ ${result.error}`;
        testStatus.style.color = 'var(--red)';
      }
      setTimeout(() => { testStatus.textContent = ''; }, 5000);
    });

    // Hotkey recorder
    setupHotkeyRecorder('#setting-hotkey-lookup');
    setupHotkeyRecorder('#setting-hotkey-spotlight');

    // DB path
    window.eld.getDbPath().then((p) => {
      $('#db-path-display').textContent = `Database: ${p}`;
    });

    // Get API key link
    $('#link-get-key').addEventListener('click', (e) => {
      e.preventDefault();
      window.eld.openExternal('https://openrouter.ai/keys');
    });
  }

  function setupHotkeyRecorder(selector) {
    const input = $(selector);
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      }
      if (parts.length > 1) {
        input.value = parts.join('+');
      }
    });
  }

  function populateSettings() {
    $('#setting-api-key').value = settings.apiKey || '';
    $('#setting-model').value = settings.model || 'google/gemini-2.0-flash-exp:free';
    $('#setting-endpoint').value = settings.apiEndpoint || 'https://openrouter.ai/api/v1';
    $('#setting-language').value = settings.targetLanguage || 'Vietnamese';
    $('#setting-autosave').checked = settings.autoSave !== false;
    $('#setting-related').checked = settings.showRelatedWords !== false;
    // Hotkeys
    if (settings.hotkeys) {
      $('#setting-hotkey-lookup').value = settings.hotkeys.lookup || 'CommandOrControl+Shift+Z';
      $('#setting-hotkey-spotlight').value = settings.hotkeys.spotlight || 'CommandOrControl+Shift+Space';
    }
  }

  /* ══════════════════════════════════
     DATA MANAGEMENT
     ══════════════════════════════════ */

  function setupDataManagement() {
    // Export
    $('#btn-export-data').addEventListener('click', async () => {
      const data = await window.eld.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `engilink-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    $('#btn-import-data').addEventListener('click', () => {
      $('#import-file-input').click();
    });

    $('#import-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const ok = await window.eld.importData(text);
      if (ok) {
        alert('Data imported successfully!');
        allWords = await window.eld.getAllWords();
        settings = await window.eld.getSettings();
        renderLibrary();
        renderStats();
        populateSettings();
      } else {
        alert('Import failed. Please check the file format.');
      }
      e.target.value = '';
    });

    // Reset
    $('#btn-reset-data').addEventListener('click', async () => {
      if (confirm('⚠️ This will delete ALL your saved words and settings. Are you sure?')) {
        if (confirm('This action cannot be undone. Really reset?')) {
          await window.eld.resetData();
          allWords = [];
          settings = await window.eld.getSettings();
          renderLibrary();
          renderStats();
          populateSettings();
        }
      }
    });
  }

  /* ══════════════════════════════════
     HELPERS
     ══════════════════════════════════ */

  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function debounce(fn, ms) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ══════════════════════════════════
     HISTORY
     ══════════════════════════════════ */

  function setupHistory() {
    const btn = $('#btn-clear-history');
    if (btn) {
      btn.addEventListener('click', async () => {
        if (confirm('Clear all lookup history?')) {
          await window.eld.clearHistory();
          renderHistory();
        }
      });
    }
  }

  async function renderHistory() {
    const history = await window.eld.getHistory();
    const timeline = $('#history-timeline');
    const empty = $('#history-empty');

    if (!history || history.length === 0) {
      timeline.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Group by local date
    const groups = {};
    for (const entry of history) {
      const d = new Date(entry.timestamp);
      const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    // Render newest first
    const sortedKeys = Object.keys(groups).reverse();
    let html = '';
    for (const dateKey of sortedKeys) {
      const items = groups[dateKey];
      html += `<div class="settings-card" style="margin-bottom:16px;">`;
      html += `<h3 class="settings-card-title">📅 ${escHtml(dateKey)} <span style="font-weight:400;font-size:12px;color:var(--text-muted);">(${items.length} lookups)</span></h3>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`;
      for (const item of items.reverse()) {
        const time = new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const cached = item.cached ? ' 💾' : '';
        html += `<span class="recent-chip" title="${time}${cached}">${escHtml(item.word)}</span>`;
      }
      html += `</div></div>`;
    }
    timeline.innerHTML = html;
  }

  // ── Start ──
  document.addEventListener('DOMContentLoaded', init);
})();
