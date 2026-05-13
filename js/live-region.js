/* ============================================
   EngiLink — Live Region Overlay Renderer
   Fix: mousemove+elementFromPoint for ignoreMouseEvents pattern
   ============================================ */

(function () {
  'use strict';

  const root       = document.getElementById('lr-root');
  const dot        = document.getElementById('lr-dot');
  const idleText   = document.getElementById('lr-idle-text');
  const content    = document.getElementById('lr-content');
  const origEl     = document.getElementById('lr-original');
  const transEl    = document.getElementById('lr-translation');
  const wordsEl    = document.getElementById('lr-words');
  const btnNow     = document.getElementById('lr-btn-now');
  const btnStop    = document.getElementById('lr-btn-stop');

  // ── State ──
  let isTranslating = false;
  let mouseOverWindow = false;

  // ── Hover detection via mousemove (works with forward:true ignoreMouseEvents) ──
  // With setIgnoreMouseEvents(true, {forward:true}), only mousemove is forwarded.
  // We use elementFromPoint to check if mouse is over anything, then toggle interactability.
  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && !mouseOverWindow) {
      mouseOverWindow = true;
      root.classList.add('hovered');
      window.liveRegion.mouseEnter(); // main: setIgnoreMouseEvents(false) → full events
    }
  });

  // mouseleave fires normally once ignoreMouseEvents is false
  document.addEventListener('mouseleave', () => {
    mouseOverWindow = false;
    root.classList.remove('hovered');
    window.liveRegion.mouseLeave(); // main: setIgnoreMouseEvents(true, {forward:true})
  });

  // ── ⚡ Translate Now ──
  btnNow.addEventListener('click', () => {
    if (isTranslating) return;
    setTranslating(true);
    window.liveRegion.translateNow();
  });

  // ── ■ Stop ──
  btnStop.addEventListener('click', () => {
    window.liveRegion.stop();
  });

  // ── Keyboard ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.liveRegion.stop();
  });

  // Prevent scroll from propagating (avoid accidental scroll on overlay)
  document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  // ── IPC: status updates ──
  window.liveRegion.onStatus((status) => {
    if (status === 'translating') {
      setTranslating(true);
    } else if (status === 'idle' || status === 'notext') {
      setTranslating(false);
      dot.className = 'lr-dot scanning';
      idleText.textContent = status === 'notext' ? 'No text…' : 'Scanning…';
    } else if (status === 'ok') {
      setTranslating(false);
      dot.className = 'lr-dot ok';
    } else if (status === 'error') {
      setTranslating(false);
      dot.className = 'lr-dot error';
      idleText.textContent = 'Error';
    }
  });

  // ── IPC: translation result ──
  window.liveRegion.onResult((payload) => {
    setTranslating(false);

    if (payload.loading) {
      dot.className = 'lr-dot scanning';
      idleText.textContent = 'Translating…';
      if (payload.originalText) {
        origEl.textContent = payload.originalText;
        transEl.className = 'lr-translation loading';
        transEl.innerHTML = '<span class="lr-spinner"></span>Translating…';
        content.style.display = 'flex';
        scheduleResize();
      }
      return;
    }

    if (!payload.success && payload.error) {
      dot.className = 'lr-dot error';
      idleText.textContent = 'Error';
      origEl.textContent = payload.originalText || '';
      transEl.className = 'lr-translation error';
      transEl.textContent = '⚠ ' + payload.error;
      content.style.display = 'flex';
      scheduleResize();
      return;
    }

    // Success
    dot.className = 'lr-dot ok';
    idleText.textContent = 'Live ●';

    origEl.textContent = payload.originalText || '';
    transEl.className = 'lr-translation';
    transEl.textContent = payload.translation || '';
    content.style.display = 'flex';

    // Fade animation
    content.style.animation = 'none';
    void content.offsetWidth;
    content.style.animation = '';

    renderWords(payload.newWords || []);
    scheduleResize();
  });

  // ── Auto-resize: tell main.js the needed height ──
  function scheduleResize() {
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight;
      window.liveRegion.resize(Math.max(80, h));
    });
  }

  // ── Helpers ──
  function setTranslating(active) {
    isTranslating = active;
    btnNow.disabled = active;
    if (active) {
      dot.className = 'lr-dot scanning';
      idleText.textContent = 'Translating…';
      if (content.style.display !== 'none') {
        transEl.className = 'lr-translation loading';
        transEl.innerHTML = '<span class="lr-spinner"></span>Translating…';
        scheduleResize();
      }
    }
  }

  function renderWords(words) {
    wordsEl.innerHTML = '';
    if (!words || words.length === 0) return;
    for (const word of words) {
      const chip = document.createElement('div');
      chip.className = 'lr-word-chip';
      const text = document.createElement('span');
      text.className = 'lr-word-text';
      text.textContent = word;
      const addBtn = document.createElement('button');
      addBtn.className = 'lr-word-add';
      addBtn.title = `Add "${word}" to Library`;
      addBtn.textContent = '+';
      addBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        addBtn.disabled = true;
        const ok = await window.liveRegion.addWord(word);
        if (ok !== false) {
          chip.classList.add('saved');
          addBtn.style.display = 'none';
        } else {
          addBtn.disabled = false;
        }
      });
      chip.appendChild(text);
      chip.appendChild(addBtn);
      wordsEl.appendChild(chip);
    }
  }

  // Initial state
  dot.className = 'lr-dot scanning';
  idleText.textContent = 'Starting…';

})();
