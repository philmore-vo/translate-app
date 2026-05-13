/* ============================================
   EngiLink — Translate Popup Renderer
   Live translate panel — updates on each new selection
   ============================================ */

(function () {
  'use strict';

  let savedWords = new Set();
  let isFirstLoad = true;

  // DOM refs
  const root = document.getElementById('tp-root');
  const originalText = document.getElementById('tp-original-text');
  const translationText = document.getElementById('tp-translation-text');
  const wordsSection = document.getElementById('tp-words-section');
  const wordsList = document.getElementById('tp-words-list');
  const addAllBtn = document.getElementById('tp-add-all-btn');
  const closeBtn = document.getElementById('tp-close-btn');
  const statusDot = document.getElementById('tp-status-dot');

  // ── Reset UI to loading state ──
  function showLoading(originalTxt) {
    if (originalText) {
      originalText.textContent = originalTxt || '...';
    }
    if (translationText) {
      translationText.className = 'tp-translation-text loading';
      translationText.innerHTML = '<span class="tp-spinner"></span> Translating...';
    }
    if (wordsSection) wordsSection.style.display = 'none';
    if (statusDot) {
      statusDot.className = 'tp-status-dot loading';
      statusDot.title = 'Translating...';
    }
    // Pulse animation to signal new content incoming
    if (root) {
      root.classList.remove('fresh');
      void root.offsetWidth; // reflow
      root.classList.add('fresh');
    }
  }

  // ── Render final translation ──
  function renderTranslation(payload) {
    if (!translationText) return;
    translationText.classList.remove('loading');

    if (!payload.success) {
      translationText.className = 'tp-translation-text error';
      translationText.textContent = '⚠ ' + (payload.error || 'Translation failed');
      if (statusDot) { statusDot.className = 'tp-status-dot error'; statusDot.title = 'Error'; }
      return;
    }

    const text = payload.translation || payload.translatedMeaning || '';
    translationText.className = 'tp-translation-text';
    translationText.textContent = text || '(no translation)';
    if (statusDot) { statusDot.className = 'tp-status-dot ok'; statusDot.title = 'Ready'; }
  }

  // ── Render new word chips ──
  function renderNewWords(words) {
    if (!wordsSection || !wordsList) return;
    if (!words || words.length === 0) {
      wordsSection.style.display = 'none';
      return;
    }

    wordsSection.style.display = 'block';
    wordsList.innerHTML = '';

    // Only show words not already saved in this session
    const unsaved = words.filter(w => !savedWords.has(w));
    if (unsaved.length === 0) {
      wordsSection.style.display = 'none';
      return;
    }

    unsaved.forEach((word) => {
      const chip = document.createElement('div');
      chip.className = 'tp-word-chip';
      chip.dataset.word = word;

      const textSpan = document.createElement('span');
      textSpan.className = 'tp-word-text';
      textSpan.textContent = word;
      textSpan.title = word;

      const addBtn = document.createElement('button');
      addBtn.className = 'tp-word-add';
      addBtn.title = 'Add to library';
      addBtn.innerHTML = '<span class="plus">+</span><span class="check">✓</span>';
      addBtn.addEventListener('click', () => addWord(word, chip, addBtn));

      chip.appendChild(textSpan);
      chip.appendChild(addBtn);
      wordsList.appendChild(chip);
    });

    if (addAllBtn) {
      addAllBtn.disabled = false;
    }
  }

  async function addWord(word, chip, btn) {
    if (savedWords.has(word)) return;
    chip.classList.add('saving');
    btn.disabled = true;

    try {
      await window.eld.addWordToLibrary(word);
      savedWords.add(word);
      chip.classList.remove('saving');
      chip.classList.add('saved');

      // Check if all chips are saved
      const allChips = wordsList.querySelectorAll('.tp-word-chip');
      const allSaved = [...allChips].every(c => c.classList.contains('saved'));
      if (allSaved && addAllBtn) addAllBtn.disabled = true;
    } catch (err) {
      chip.classList.remove('saving');
      btn.disabled = false;
      console.error('Add word failed:', err);
    }
  }

  // Add All button
  if (addAllBtn) {
    addAllBtn.addEventListener('click', async () => {
      addAllBtn.disabled = true;
      const chips = wordsList.querySelectorAll('.tp-word-chip:not(.saved)');
      const words = [...chips].map(c => c.dataset.word).filter(Boolean);
      if (words.length === 0) return;

      try {
        await window.eld.addAllWords(words);
        chips.forEach(chip => {
          savedWords.add(chip.dataset.word);
          chip.classList.add('saved');
          const btn = chip.querySelector('.tp-word-add');
          if (btn) btn.disabled = true;
        });
      } catch (err) {
        addAllBtn.disabled = false;
        console.error('Add all failed:', err);
      }
    });
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => window.eld.close());
  }

  // Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.eld.close();
  });

  // ── Receive data from main ──
  if (window.eld && window.eld.onTranslateResult) {
    window.eld.onTranslateResult((payload) => {
      if (payload.loading) {
        // New selection started — show loading state immediately
        showLoading(payload.originalText || '');
        return;
      }

      // Update original text if we have it
      if (payload.originalText && originalText) {
        originalText.textContent = payload.originalText;
      }

      // Render translation
      renderTranslation(payload);

      // Render new words (skip ones already saved this session)
      renderNewWords(payload.newWords || []);
    });
  }
})();
