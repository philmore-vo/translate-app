/* ============================================
   EngiLink Dictionary — Overlay Logic
   ============================================ */

(function () {
  'use strict';

  // ── DOM References ──
  const $ = (sel) => document.querySelector(sel);
  const wordText = $('#word-text');
  const phoneticText = $('#phonetic-text');
  const btnAudio = $('#btn-audio');
  const btnFav = $('#btn-fav');
  const btnRefresh = $('#btn-refresh');
  const btnClose = $('#btn-close');
  const partOfSpeech = $('#part-of-speech');
  const vnMeaningHeader = $('#vn-meaning-header');
  const vnMeaningText = $('#vn-meaning-text');
  const tabBar = $('#tab-bar');
  const dictTabOrigHTML = tabBar.querySelector('[data-tab="dictionary"]').innerHTML;
  const techTabOrigHTML = tabBar.querySelector('[data-tab="technical"]').innerHTML;
  const panelDict = $('#panel-dictionary');
  const panelTech = $('#panel-technical');
  const panelReading = $('#panel-reading');
  const dictLoader = $('#dict-loader');
  const defList = $('#definitions-list');
  const dictError = $('#dict-error');
  const techLoader = $('#tech-loader');
  const techContent = $('#tech-content');
  const techDef = $('#tech-definition');
  const techVnText = $('#tech-vn-text');
  const topicBadge = $('#topic-badge');
  const techError = $('#tech-error');
  const techErrorText = $('#tech-error-text');
  const relatedSection = $('#related-section');
  const relatedChips = $('#related-chips');
  const lookupCountEl = $('#lookup-count');
  const btnNote = $('#btn-note');
  const btnDashboard = $('#btn-dashboard');
  const noteEditor = $('#note-editor');
  const noteTextarea = $('#note-textarea');
  const btnNoteSave = $('#btn-note-save');
  const btnNoteCancel = $('#btn-note-cancel');
  const audioPlayer = $('#audio-player');
  const readingInput = $('#reading-input');
  const readingOutput = $('#reading-output');
  const readingStatus = $('#reading-status');
  const btnReadingProcess = $('#btn-reading-process');
  const btnReadingClear = $('#btn-reading-clear');
  const btnReadingLookup = $('#btn-reading-lookup');
  const btnReadingExplain = $('#btn-reading-explain');
  const btnReadingTranslate = $('#btn-reading-translate');
  const btnReadingSave = $('#btn-reading-save');
  const tabLookup = $('#tab-lookup');
  const tabLookupLabel = $('#tab-lookup-label');
  const tabLookupClose = $('#tab-lookup-close');
  const panelLookup = $('#panel-lookup');
  const lookupWordEl = $('#lookup-word');
  const lookupPosEl = $('#lookup-pos');
  const lookupVnRow = $('#lookup-vn-row');
  const lookupVnText = $('#lookup-vn-text');
  const lookupLoader = $('#lookup-loader');
  const lookupBody = $('#lookup-body');
  const lookupErrorEl = $('#lookup-error');
  const lookupErrorText = $('#lookup-error-text');
  const btnAudioLookup = $('#btn-audio-lookup');

  let currentWordId = null;
  let currentFullText = null; // full text for TTS (not truncated)
  let currentLookupSource = 'idle';
  let readingSelection = { word: '', sentence: '', paragraph: '' };
  let lastLookupRequestId = 0;
  let lookupAudio = { word: '', url: '' };
  const lookupAudioPlayer = new Audio();

  // ── Listen for lookup from main process ──
  window.eld.onThemePreview((theme) => {
    document.body.setAttribute('data-theme', theme);
  });

  if (window.eld.onReadingOpen) {
    window.eld.onReadingOpen((text) => {
      resetUI();
      currentLookupSource = 'reading';
      openReadingMode(text || '', true);
    });
  }

  window.eld.onLookupStart(async (word) => {
    // Apply theme
    try {
      const s = await window.eld.getSettings();
      document.body.setAttribute('data-theme', s.theme || 'light');
    } catch (_) { /* ignore */ }

    resetUI();
    currentLookupSource = 'external';
    currentFullText = word;
    wordText.textContent = word;

    try {
      const result = await window.eld.lookupWord(word);
      renderResult(result, word);
    } catch (err) {
      console.error('Lookup failed:', err);
      showDictError();
      showTechError('Lookup failed');
    }

    // Resize overlay to fit content
    requestAnimationFrame(() => {
      const height = document.getElementById('overlay-root').scrollHeight;
      window.eld.resizeOverlay(Math.max(200, height + 2));
    });
  });

  // ── Render Results ──
  function renderResult(result, word) {
    const { dictionary, ai, relatedWords, isPhrase } = result;

    // For phrases: truncate the header text
    if (isPhrase && word.length > 40) {
      wordText.textContent = word.slice(0, 40) + '…';
      wordText.title = word; // full text on hover
    }

    // Update tab labels for phrase mode
    if (isPhrase) {
      const dictTab = tabBar.querySelector('[data-tab="dictionary"]');
      const techTab = tabBar.querySelector('[data-tab="technical"]');
      if (dictTab) dictTab.textContent = '🌐 Translation';
      if (techTab) techTab.textContent = '📝 Explanation';
      partOfSpeech.textContent = 'phrase';
    }

    // Dictionary (or Translation for phrases)
    if (isPhrase && ai && ai.success) {
      // Show translation in dictionary panel
      dictLoader.style.display = 'none';
      dictError.style.display = 'none';
      defList.innerHTML = '';

      const vnTranslation = ai.translatedMeaning || ai.translation || ai.vietnameseMeaning || '';
      if (vnTranslation) {
        const item = document.createElement('div');
        item.className = 'definition-item';
        item.innerHTML = `<div class="definition-text" style="font-size:14px;line-height:1.6;">${tokenizeInline(vnTranslation)}</div>`;
        defList.appendChild(item);
      }
      defList.style.display = 'flex';
    } else if (dictionary && dictionary.success) {
      renderDictionary(dictionary);
    } else {
      showDictError();
    }

    // Always show audio button (TTS fallback)
    btnAudio.style.display = 'flex';

    // AI Technical Note / Explanation
    if (ai && ai.success) {
      renderTechNote(ai);

      // Show translated meaning in header (for ALL lookups)
      const vnText = ai.translatedMeaning || ai.translation || ai.vietnameseMeaning || '';
      if (vnText) {
        vnMeaningText.innerHTML = tokenizeInline(vnText);
        vnMeaningHeader.style.display = 'flex';
      }
    } else {
      showTechError(ai ? ai.error : 'AI unavailable');
    }

    // Related Words
    if (relatedWords && relatedWords.length > 0) {
      renderRelated(relatedWords);
    }

    // Show refresh button
    if (btnRefresh) btnRefresh.style.display = 'flex';

    // Set word ID for favorites/notes + lookup count
    if (result.savedWordId) {
      currentWordId = result.savedWordId;
      lookupCountEl.textContent = result.savedLookupCount ? `×${result.savedLookupCount}` : '';
      btnFav.classList.toggle('active', !!result.savedIsFavorite);
      // Pre-fill note textarea with existing note
      if (result.savedUserNote) {
        noteTextarea.value = result.savedUserNote;
      }
    }

    requestAnimationFrame(() => {
      const height = document.getElementById('overlay-root').scrollHeight;
      window.eld.resizeOverlay(Math.max(200, height + 2));
    });
  }

  function renderDictionary(dict) {
    dictLoader.style.display = 'none';

    // Phonetic
    if (dict.phonetic) {
      phoneticText.textContent = dict.phonetic;
    }

    // Audio — always show button (use TTS fallback if no dictionary audio)
    btnAudio.style.display = 'flex';
    if (dict.audioUrl) {
      audioPlayer.src = dict.audioUrl;
      btnAudio.dataset.hasDictAudio = 'true';
    } else {
      btnAudio.dataset.hasDictAudio = 'false';
    }

    // Part of speech (first one)
    if (dict.meanings && dict.meanings.length > 0) {
      partOfSpeech.textContent = dict.meanings.map((m) => m.partOfSpeech).join(' · ');
    }

    // Definitions
    defList.innerHTML = '';
    if (dict.meanings) {
      for (const meaning of dict.meanings) {
        if (meaning.definitions) {
          // Part of speech sub-header if multiple
          if (dict.meanings.length > 1) {
            const posEl = document.createElement('div');
            posEl.className = 'definition-pos';
            posEl.textContent = meaning.partOfSpeech;
            defList.appendChild(posEl);
          }

          for (const def of meaning.definitions) {
            const item = document.createElement('div');
            item.className = 'definition-item';

            let html = `<div class="definition-text">${tokenizeInline(def.definition)}</div>`;
            if (def.example) {
              html += `<div class="definition-example">"${tokenizeInline(def.example)}"</div>`;
            }
            item.innerHTML = html;
            defList.appendChild(item);
          }

          // Synonyms
          if (meaning.synonyms && meaning.synonyms.length > 0) {
            const synRow = document.createElement('div');
            synRow.className = 'synonyms-row';
            synRow.innerHTML = `<span class="syn-label">syn</span>` +
              meaning.synonyms.map((s) => `<span class="syn-chip" data-word="${escAttr(s)}">${escHtml(s)}</span>`).join('');
            defList.appendChild(synRow);
          }
        }
      }
    }
    defList.style.display = 'flex';
  }

  function renderTechNote(ai) {
    techLoader.style.display = 'none';

    techDef.innerHTML = tokenizeInline(ai.definition || '');
    techVnText.innerHTML = tokenizeInline(ai.translatedMeaning || ai.translation || ai.vietnameseMeaning || '');

    if (ai.topic) {
      topicBadge.textContent = ai.topic;
      topicBadge.style.display = 'inline-flex';
    }

    techContent.style.display = 'block';
  }

  function renderRelated(words) {
    relatedChips.innerHTML = '';
    for (const w of words) {
      const chip = document.createElement('span');
      chip.className = 'related-chip';
      chip.dataset.word = w.word;
      chip.innerHTML = escHtml(w.word);
      if (w.topic) {
        chip.innerHTML += `<span class="chip-topic">${escHtml(w.topic)}</span>`;
      }
      relatedChips.appendChild(chip);
    }
    relatedSection.style.display = 'block';
  }

  // updateLookupInfo removed — data now comes from lookup:word result directly

  function showDictError() {
    dictLoader.style.display = 'none';
    dictError.style.display = 'flex';
  }

  function showTechError(msg) {
    techLoader.style.display = 'none';
    techErrorText.textContent = msg || 'AI unavailable';
    techError.style.display = 'flex';
  }

  function resetUI() {
    currentWordId = null;
    currentFullText = null;
    document.getElementById('overlay-root').scrollTop = 0;

    wordText.textContent = '—';
    wordText.title = '';
    phoneticText.textContent = '';
    partOfSpeech.textContent = '';
    btnAudio.style.display = 'none';
    btnAudio.dataset.hasDictAudio = 'false';
    audioPlayer.src = '';
    btnFav.classList.remove('active');
    if (btnRefresh) btnRefresh.style.display = 'none';
    vnMeaningHeader.style.display = 'none';
    vnMeaningText.textContent = '';

    dictLoader.style.display = 'flex';
    defList.style.display = 'none';
    defList.innerHTML = '';
    dictError.style.display = 'none';

    techLoader.style.display = 'flex';
    techContent.style.display = 'none';
    techError.style.display = 'none';
    topicBadge.style.display = 'none';
    topicBadge.textContent = '';

    relatedSection.style.display = 'none';
    relatedChips.innerHTML = '';
    lookupCountEl.textContent = '';

    // Hide sub-lookup tab/panel from previous word
    if (tabLookup) tabLookup.style.display = 'none';
    if (lookupBody) lookupBody.innerHTML = '';
    if (lookupVnRow) lookupVnRow.style.display = 'none';
    if (lookupVnText) lookupVnText.innerHTML = '';
    if (lookupErrorEl) lookupErrorEl.style.display = 'none';
    lastLookupRequestId++;

    noteEditor.style.display = 'none';
    noteTextarea.value = '';

    // Reset to dictionary tab and restore original labels (with SVG icons)
    const dictTab = tabBar.querySelector('[data-tab="dictionary"]');
    const techTab = tabBar.querySelector('[data-tab="technical"]');
    if (dictTab) dictTab.innerHTML = dictTabOrigHTML;
    if (techTab) techTab.innerHTML = techTabOrigHTML;
    switchTab('dictionary');
  }

  // ── Tab Switching ──
  function switchTab(tabName) {
    tabBar.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    const target = tabBar.querySelector(`[data-tab="${tabName}"]`);
    if (target) target.classList.add('active');
    panelDict.classList.toggle('active', tabName === 'dictionary');
    panelTech.classList.toggle('active', tabName === 'technical');
    if (panelReading) panelReading.classList.toggle('active', tabName === 'reading');
    if (panelLookup) panelLookup.classList.toggle('active', tabName === 'lookup');
    document.getElementById('overlay-root').scrollTop = 0;

    requestAnimationFrame(() => {
      const height = document.getElementById('overlay-root').scrollHeight;
      window.eld.resizeOverlay(Math.max(200, height + 2));
    });
  }

  tabBar.addEventListener('click', (e) => {
    if (e.target.closest('#tab-lookup-close')) {
      e.stopPropagation();
      closeLookupTab();
      return;
    }
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (tab.dataset.tab === 'reading') {
      const seedText = getReadingSeedText();
      openReadingMode(seedText, !!seedText);
      return;
    }
    switchTab(tab.dataset.tab);
  });

  // ── Audio Playback (Dictionary audio or TTS fallback) ──
  if (readingInput) {
    readingInput.value = localStorage.getItem('engilink-overlay-reading-text') || '';

    readingInput.addEventListener('input', debounce(() => {
      localStorage.setItem('engilink-overlay-reading-text', readingInput.value);
      setReadingStatus('Draft saved locally.');
    }, 300));

    btnReadingProcess.addEventListener('click', () => renderReadingMode());
    btnReadingClear.addEventListener('click', clearReadingMode);
    btnReadingLookup.addEventListener('click', () => lookupFromReading(readingSelection.word || getSelectedText()));
    btnReadingExplain.addEventListener('click', () => lookupFromReading(readingSelection.sentence || getSelectedText()));
    btnReadingTranslate.addEventListener('click', () => lookupFromReading(limitLookupText(readingInput.value)));
    btnReadingSave.addEventListener('click', () => saveReadingEntry());

    readingOutput.addEventListener('click', (e) => {
      const token = e.target.closest('.reading-token');
      if (!token) return;
      readingOutput.querySelectorAll('.reading-token.active').forEach((el) => el.classList.remove('active'));
      token.classList.add('active');
      readingSelection = {
        word: token.dataset.word || '',
        sentence: token.dataset.sentence || '',
        paragraph: token.dataset.paragraph || '',
      };
      setReadingStatus(`Selected: ${readingSelection.word}`);
      lookupFromReading(readingSelection.word);
    });
  }

  btnAudio.addEventListener('click', () => {
    const word = currentFullText || wordText.title || wordText.textContent;
    if (btnAudio.dataset.hasDictAudio === 'true' && audioPlayer.src) {
      // Play dictionary audio file
      audioPlayer.currentTime = 0;
      audioPlayer.play();
      btnAudio.classList.add('playing');
      audioPlayer.onended = () => btnAudio.classList.remove('playing');
    } else if (word && word !== '—') {
      // Fallback: Web Speech API TTS
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      btnAudio.classList.add('playing');
      utterance.onend = () => btnAudio.classList.remove('playing');
      utterance.onerror = () => btnAudio.classList.remove('playing');
      window.speechSynthesis.speak(utterance);
    }
  });

  // ── Close ──
  btnClose.addEventListener('click', () => window.eld.hideOverlay());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.eld.hideOverlay();
  });

  // ── Refresh (force re-fetch from AI, bypass cache) ──
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      if (!currentFullText) return;
      btnRefresh.classList.add('playing');
      try {
        const result = await window.eld.lookupWord(currentFullText, { forceRefresh: true });
        renderResult(result, currentFullText);
      } catch (err) {
        console.error('Refresh failed:', err);
      }
      btnRefresh.classList.remove('playing');
      requestAnimationFrame(() => {
        const height = document.getElementById('overlay-root').scrollHeight;
        window.eld.resizeOverlay(Math.max(200, height + 2));
      });
    });
  }

  // ── Favorite ──
  btnFav.addEventListener('click', async () => {
    if (currentWordId) {
      const isFav = await window.eld.toggleFavorite(currentWordId);
      btnFav.classList.toggle('active', isFav);
    }
  });

  // ── Note Editor ──
  btnNote.addEventListener('click', () => {
    const showing = noteEditor.style.display !== 'none';
    noteEditor.style.display = showing ? 'none' : 'block';
    if (!showing) {
      noteTextarea.focus();
      requestAnimationFrame(() => {
        const height = document.getElementById('overlay-root').scrollHeight;
        window.eld.resizeOverlay(Math.max(200, height + 2));
      });
    }
  });

  btnNoteSave.addEventListener('click', async () => {
    if (currentWordId) {
      await window.eld.updateWord({ id: currentWordId, userNote: noteTextarea.value });
    }
    noteEditor.style.display = 'none';
  });

  btnNoteCancel.addEventListener('click', () => {
    noteEditor.style.display = 'none';
    requestAnimationFrame(() => {
      const height = document.getElementById('overlay-root').scrollHeight;
      window.eld.resizeOverlay(Math.max(200, height + 2));
    });
  });

  // ── Dashboard ──
  btnDashboard.addEventListener('click', () => window.eld.openDashboard());

  // ── Chip click → re-lookup ──
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.syn-chip, .related-chip');
    if (chip && chip.dataset.word) {
      resetUI();
      const word = chip.dataset.word;
      currentLookupSource = 'external';
      currentFullText = word;
      wordText.textContent = word;
      window.eld.lookupWord(word).then((res) => {
        renderResult(res, word);
      });
      return;
    }

    const inlineWord = e.target.closest('.inline-word');
    if (inlineWord && inlineWord.dataset.word) {
      e.preventDefault();
      openLookupTab(inlineWord.dataset.word);
    }
  });

  // ── Helpers ──
  async function openReadingMode(text, processNow) {
    if (typeof text === 'string' && text.trim()) {
      readingInput.value = text.trim();
      localStorage.setItem('engilink-overlay-reading-text', readingInput.value);
    }

    currentLookupSource = 'reading';
    switchTab('reading');
    if (processNow) await renderReadingMode();
    else resizeOverlaySoon();
  }

  async function renderReadingMode() {
    const text = readingInput.value.trim();
    localStorage.setItem('engilink-overlay-reading-text', readingInput.value);
    readingSelection = { word: '', sentence: '', paragraph: '' };

    if (!text) {
      readingOutput.innerHTML = '<div class="reading-empty">Paste text and process it to start reading.</div>';
      setReadingStatus('Paste text, process it, then click any word.');
      resizeOverlaySoon();
      return;
    }

    let saved = new Set();
    try {
      const words = await window.eld.getAllWords();
      saved = new Set((words || []).map((w) => normalizeReadingWord(w.word)).filter(Boolean));
    } catch (_) { /* ignore */ }

    readingOutput.innerHTML = renderReadingHtml(text, saved);
    setReadingStatus(`Processed ${countReadingWords(text)} words. Saved words are highlighted.`);
    resizeOverlaySoon();
  }

  function clearReadingMode() {
    readingInput.value = '';
    localStorage.removeItem('engilink-overlay-reading-text');
    readingSelection = { word: '', sentence: '', paragraph: '' };
    readingOutput.innerHTML = '<div class="reading-empty">Paste text and process it to start reading.</div>';
    setReadingStatus('Cleared.');
    resizeOverlaySoon();
  }

  async function lookupFromReading(text) {
    text = limitLookupText(text);
    if (!text) {
      setReadingStatus('Select a word or sentence first.');
      return;
    }

    resetUI();
    currentLookupSource = 'reading';
    currentFullText = text;
    wordText.textContent = text;

    try {
      const result = await window.eld.lookupWord(text);
      renderResult(result, text);
    } catch (err) {
      console.error('Lookup failed:', err);
      showDictError();
      showTechError('Lookup failed');
    }
  }

  async function saveReadingEntry() {
    const text = limitLookupText(readingSelection.word || getSelectedText() || readingSelection.sentence);
    if (!text) {
      setReadingStatus('Select a word or sentence first.');
      return;
    }

    const result = await window.eld.importWords({
      content: JSON.stringify([{
        word: text,
        topic: 'Reading',
        technicalNote: text.split(/\s+/).length > 1 ? 'Saved sentence from Overlay Reading.' : 'Saved word from Overlay Reading.',
        isPhrase: text.split(/\s+/).length > 1,
      }]),
      format: 'json',
      filename: 'overlay-reading.json',
    });

    if (result && result.success) {
      setReadingStatus(`Saved: ${text}`);
      await renderReadingMode();
    } else {
      setReadingStatus(`Save failed: ${result?.error || 'unknown error'}`);
    }
  }

  function renderReadingHtml(text, savedSet) {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return paragraphs.map((paragraph) => {
      const sentenceParts = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
      const html = sentenceParts.map((sentence) => renderReadingSentence(sentence, paragraph, savedSet)).join('');
      return `<div class="reading-paragraph">${html}</div>`;
    }).join('');
  }

  function renderReadingSentence(sentence, paragraph, savedSet) {
    const regex = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(sentence)) !== null) {
      const word = match[0];
      html += escHtml(sentence.slice(lastIndex, match.index));
      const key = normalizeReadingWord(word);
      const classes = ['reading-token'];
      if (savedSet.has(key)) classes.push('saved');
      html += `<button class="${classes.join(' ')}" data-word="${escAttr(word)}" data-sentence="${escAttr(sentence.trim())}" data-paragraph="${escAttr(paragraph)}" type="button">${escHtml(word)}</button>`;
      lastIndex = match.index + word.length;
    }

    html += escHtml(sentence.slice(lastIndex));
    return html;
  }

  function normalizeReadingWord(word) {
    return String(word || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
  }

  function countReadingWords(text) {
    const matches = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu);
    return matches ? matches.length : 0;
  }

  function getReadingSeedText() {
    const lookupText = String(currentFullText || wordText.title || '').trim();
    const draftText = readingInput ? readingInput.value.trim() : '';

    if (currentLookupSource !== 'reading' && lookupText) {
      return lookupText;
    }

    return draftText || lookupText;
  }

  function limitLookupText(text) {
    let cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length > 500) cleaned = cleaned.split(/\s+/).slice(0, 50).join(' ');
    if (cleaned.length > 500) cleaned = cleaned.slice(0, 500).trim();
    return cleaned;
  }

  function getSelectedText() {
    return window.getSelection ? String(window.getSelection()).trim() : '';
  }

  function setReadingStatus(message) {
    if (readingStatus) readingStatus.textContent = message;
  }

  function resizeOverlaySoon() {
    requestAnimationFrame(() => {
      const height = document.getElementById('overlay-root').scrollHeight;
      window.eld.resizeOverlay(Math.max(200, height + 2));
    });
  }

  function debounce(fn, ms) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Tokenize text into clickable inline words (for in-tab sub-lookup) ──
  function tokenizeInline(text) {
    const str = String(text || '');
    if (!str) return '';
    const regex = /[\p{L}][\p{L}\p{N}'_-]*/gu;
    let out = '';
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const word = match[0];
      out += escHtml(str.slice(lastIndex, match.index));
      if (word.length < 2) {
        out += escHtml(word);
      } else {
        out += `<button type="button" class="inline-word" data-word="${escAttr(word)}">${escHtml(word)}</button>`;
      }
      lastIndex = match.index + word.length;
    }
    out += escHtml(str.slice(lastIndex));
    return out;
  }

  // ── Sub-lookup Tab (open looked-up word in a side tab without losing main word) ──
  async function openLookupTab(word) {
    const cleaned = String(word || '').trim();
    if (!cleaned) return;

    if (tabLookup) {
      tabLookup.style.display = 'inline-flex';
      tabLookupLabel.textContent = cleaned.length > 24 ? cleaned.slice(0, 24) + '…' : cleaned;
      tabLookupLabel.title = cleaned;
    }

    lookupWordEl.textContent = cleaned;
    lookupPosEl.textContent = '';
    lookupVnRow.style.display = 'none';
    lookupVnText.innerHTML = '';
    lookupBody.innerHTML = '';
    lookupErrorEl.style.display = 'none';
    lookupLoader.style.display = 'flex';
    if (btnAudioLookup) {
      btnAudioLookup.classList.remove('playing');
      btnAudioLookup.style.display = 'none';
    }
    try { lookupAudioPlayer.pause(); } catch (_) { /* ignore */ }
    lookupAudio = { word: cleaned, url: '' };

    switchTab('lookup');

    const reqId = ++lastLookupRequestId;
    try {
      const result = await window.eld.lookupWord(cleaned);
      if (reqId !== lastLookupRequestId) return; // newer request superseded this one
      renderLookupTab(result, cleaned);
    } catch (err) {
      if (reqId !== lastLookupRequestId) return;
      console.error('Sub-lookup failed:', err);
      lookupLoader.style.display = 'none';
      lookupErrorText.textContent = 'Lookup failed';
      lookupErrorEl.style.display = 'flex';
    }
    resizeOverlaySoon();
  }

  function renderLookupTab(result, word) {
    lookupLoader.style.display = 'none';
    lookupBody.innerHTML = '';
    lookupErrorEl.style.display = 'none';

    const { dictionary, ai } = result || {};

    // Audio: dictionary file or TTS fallback
    lookupAudio = {
      word,
      url: (dictionary && dictionary.success && dictionary.audioUrl) ? dictionary.audioUrl : '',
    };
    if (btnAudioLookup) btnAudioLookup.style.display = 'flex';

    // Phonetic / part of speech header
    let pos = '';
    if (dictionary && dictionary.success && dictionary.phonetic) pos += dictionary.phonetic;
    if (dictionary && dictionary.success && dictionary.meanings && dictionary.meanings.length) {
      const posList = dictionary.meanings.map((m) => m.partOfSpeech).filter(Boolean).join(' · ');
      if (posList) pos += (pos ? '  ·  ' : '') + posList;
    }
    lookupPosEl.textContent = pos;

    // Vietnamese translation header
    const vn = (ai && ai.success) ? (ai.translatedMeaning || ai.translation || ai.vietnameseMeaning || '') : '';
    if (vn) {
      lookupVnText.innerHTML = tokenizeInline(vn);
      lookupVnRow.style.display = 'flex';
    } else {
      lookupVnRow.style.display = 'none';
    }

    // Body sections
    if (ai && ai.success && ai.definition) {
      const sec = document.createElement('div');
      sec.className = 'lookup-section';
      sec.innerHTML = `<div class="lookup-section-title">Definition</div><div class="lookup-section-body">${tokenizeInline(ai.definition)}</div>`;
      lookupBody.appendChild(sec);
    }

    if (dictionary && dictionary.success && dictionary.meanings) {
      for (const meaning of dictionary.meanings) {
        if (!meaning.definitions || !meaning.definitions.length) continue;
        const sec = document.createElement('div');
        sec.className = 'lookup-section';
        const parts = [`<div class="lookup-section-title">${escHtml(meaning.partOfSpeech || 'Definition')}</div>`];
        for (const def of meaning.definitions.slice(0, 3)) {
          let body = `<div class="lookup-section-body">${tokenizeInline(def.definition)}`;
          if (def.example) body += `<em>"${tokenizeInline(def.example)}"</em>`;
          body += '</div>';
          parts.push(body);
        }
        sec.innerHTML = parts.join('');
        lookupBody.appendChild(sec);
      }
    }

    if (!lookupBody.children.length && !vn) {
      lookupErrorText.textContent = `No data for "${word}"`;
      lookupErrorEl.style.display = 'flex';
    }
  }

  function closeLookupTab() {
    if (tabLookup) tabLookup.style.display = 'none';
    if (btnAudioLookup) btnAudioLookup.style.display = 'none';
    lookupBody.innerHTML = '';
    lookupVnRow.style.display = 'none';
    lookupVnText.innerHTML = '';
    lookupErrorEl.style.display = 'none';
    lookupAudio = { word: '', url: '' };
    try { lookupAudioPlayer.pause(); } catch (_) { /* ignore */ }
    lastLookupRequestId++;
    switchTab('dictionary');
  }

  // ── Audio for Lookup tab ──
  if (btnAudioLookup) {
    btnAudioLookup.addEventListener('click', () => {
      const word = lookupAudio.word || lookupWordEl.textContent || '';
      if (!word || word === '—') return;

      if (lookupAudio.url) {
        try {
          window.speechSynthesis && window.speechSynthesis.cancel();
          lookupAudioPlayer.src = lookupAudio.url;
          lookupAudioPlayer.currentTime = 0;
          btnAudioLookup.classList.add('playing');
          lookupAudioPlayer.onended = () => btnAudioLookup.classList.remove('playing');
          lookupAudioPlayer.onerror = () => {
            btnAudioLookup.classList.remove('playing');
            playLookupTTS(word);
          };
          lookupAudioPlayer.play().catch(() => {
            btnAudioLookup.classList.remove('playing');
            playLookupTTS(word);
          });
        } catch (_) {
          playLookupTTS(word);
        }
      } else {
        playLookupTTS(word);
      }
    });
  }

  function playLookupTTS(word) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    btnAudioLookup.classList.add('playing');
    utterance.onend = () => btnAudioLookup.classList.remove('playing');
    utterance.onerror = () => btnAudioLookup.classList.remove('playing');
    window.speechSynthesis.speak(utterance);
  }
})();
