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
    $('#btn-fc-hard').addEventListener('click', () => nextCard());
    $('#btn-fc-ok').addEventListener('click', () => nextCard());
    $('#btn-fc-easy').addEventListener('click', () => nextCard());
    $('#btn-study-again').addEventListener('click', startStudy);
  }

  function resetStudy() {
    $('#study-intro').style.display = 'block';
    $('#flashcard-area').style.display = 'none';
    $('#study-complete').style.display = 'none';
  }

  async function startStudy() {
    allWords = await window.eld.getAllWords();
    let pool = [...allWords];

    const topicFilter = $('#study-topic-filter').value;
    if (topicFilter) {
      pool = pool.filter((w) => w.topic === topicFilter);
    }

    if (pool.length === 0) {
      alert('No words to study! Look up some words first.');
      return;
    }

    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    studyCards = pool.slice(0, Math.min(20, pool.length));
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
    $('#fc-vn').textContent = card.vietnameseMeaning ? `🇻🇳 ${card.vietnameseMeaning}` : '';

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

  function nextCard() {
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
      if (ai.vietnameseMeaning) html += `<div class="lr-vn">🇻🇳 ${escHtml(ai.vietnameseMeaning)}</div>`;
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
    // Populate current settings values
    populateSettings();

    // Attach event listeners ONCE only
    if (settingsEventsAttached) return;
    settingsEventsAttached = true;

    // Save button
    $('#btn-save-settings').addEventListener('click', async () => {
      const newSettings = {
        apiKey: $('#setting-api-key').value.trim(),
        model: $('#setting-model').value,
        apiEndpoint: $('#setting-endpoint').value.trim(),
        autoSave: $('#setting-autosave').checked,
        showRelatedWords: $('#setting-related').checked,
      };

      const ok = await window.eld.saveSettings(newSettings);
      settings = await window.eld.getSettings();

      const status = $('#save-status');
      status.textContent = ok ? '✓ Settings saved!' : '✗ Failed to save';
      status.style.color = ok ? 'var(--green)' : 'var(--red)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });

    // DB path
    window.eld.getDbPath().then((p) => {
      $('#db-path-display').textContent = `Database: ${p}`;
    });

    // Get API key link — use preload's openExternal
    $('#link-get-key').addEventListener('click', (e) => {
      e.preventDefault();
      window.eld.openExternal('https://openrouter.ai/keys');
    });
  }

  function populateSettings() {
    $('#setting-api-key').value = settings.apiKey || '';
    $('#setting-model').value = settings.model || 'google/gemini-2.0-flash-exp:free';
    $('#setting-endpoint').value = settings.apiEndpoint || 'https://openrouter.ai/api/v1';
    $('#setting-autosave').checked = settings.autoSave !== false;
    $('#setting-related').checked = settings.showRelatedWords !== false;
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

  // ── Start ──
  document.addEventListener('DOMContentLoaded', init);
})();
