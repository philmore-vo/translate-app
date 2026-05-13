/* ============================================
   EngiLink Dictionary - Snip JS (Region Select)
   ============================================ */

(function () {
  'use strict';

  // ── Detect mode from URL query string ──
  const urlParams = new URLSearchParams(window.location.search);
  const TRANSLATE_MODE = urlParams.get('mode') === 'translate';
  const LIVE_REGION_MODE = urlParams.get('mode') === 'liveRegion';

  const overlay = document.getElementById('snip-overlay');
  const selection = document.getElementById('snip-selection');
  const hint = document.getElementById('snip-hint');
  const processing = document.getElementById('snip-processing');
  const preview = document.getElementById('snip-preview');
  const previewText = document.getElementById('snip-preview-text');
  const previewMeta = document.getElementById('snip-preview-meta');
  const closePreview = document.getElementById('snip-preview-close');
  const lookupWord = document.getElementById('snip-lookup-word');
  const translateText = document.getElementById('snip-translate-text');
  const saveText = document.getElementById('snip-save-text');

  // Adapt hint text for translate mode
  if (TRANSLATE_MODE && hint) {
    hint.innerHTML = '🌐 Drag to select subtitle area — Press <kbd>Esc</kbd> to cancel';
  }

  // Adapt hint text for live region mode
  if (LIVE_REGION_MODE && hint) {
    hint.innerHTML = '📡 Drag to select the region to monitor continuously — Press <kbd>Esc</kbd> to cancel';
  }

  // Adapt processing label for translate mode
  if (TRANSLATE_MODE && processing) {
    processing.innerHTML = '<span class="spinner"></span> Translating...';
  }

  // Adapt processing label for live region mode
  if (LIVE_REGION_MODE && processing) {
    processing.innerHTML = '<span class="spinner"></span> Starting live monitor...';
  }

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let phase = 'select';
  let capturedRect = null;

  document.addEventListener('mousedown', (e) => {
    if (phase !== 'select') return;
    if (e.button !== 0) return;

    startX = e.screenX;
    startY = e.screenY;
    dragging = true;
    selection.style.display = 'block';
    selection.style.left = e.clientX + 'px';
    selection.style.top = e.clientY + 'px';
    selection.style.width = '0px';
    selection.style.height = '0px';
    hint.style.display = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (phase !== 'select') return;
    if (!dragging) return;

    const x = Math.min(e.clientX, startX - window.screenX);
    const y = Math.min(e.clientY, startY - window.screenY);
    const w = Math.abs(e.clientX - (startX - window.screenX));
    const h = Math.abs(e.clientY - (startY - window.screenY));
    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = w + 'px';
    selection.style.height = h + 'px';
  });

  document.addEventListener('mouseup', (e) => {
    if (phase !== 'select') return;
    if (!dragging) return;
    dragging = false;

    const endX = e.screenX;
    const endY = e.screenY;
    const rect = {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    };

    if (rect.width < 10 || rect.height < 10) {
      selection.style.display = 'none';
      hint.style.display = 'block';
      return;
    }

    capturedRect = rect;
    phase = 'processing';
    selection.style.display = 'none';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    processing.style.display = 'block';

    if (LIVE_REGION_MODE) {
      window.eld.startLiveRegion(rect);
    } else if (TRANSLATE_MODE) {
      window.eld.captureRegionTranslate(rect);
    } else {
      window.eld.captureRegion(rect);
    }
  });

  function submitPreview(mode) {
    const text = previewText.value.trim();
    if (!text) return;
    window.eld.submitPreview({ mode, text });
  }

  function showPreview(payload) {
    phase = 'preview';
    document.body.classList.add('preview-mode');
    overlay.style.background = 'rgba(0,0,0,0.58)';
    processing.style.display = 'none';
    hint.style.display = 'none';
    selection.style.display = 'none';
    previewMeta.textContent = `Language: ${payload.languageName || payload.languageCode || 'OCR'} - edit text before choosing an action.`;
    previewText.value = payload.text || '';
    preview.style.display = 'block';
    setTimeout(() => {
      previewText.focus();
      previewText.select();
    }, 50);
  }

  if (!TRANSLATE_MODE && window.eld.onPreview) {
    window.eld.onPreview(showPreview);
  }

  if (closePreview) closePreview.addEventListener('click', () => window.eld.cancelSnip());
  if (lookupWord) lookupWord.addEventListener('click', () => submitPreview('lookup'));
  if (translateText) translateText.addEventListener('click', () => submitPreview('translate'));
  if (saveText) saveText.addEventListener('click', () => submitPreview('save'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.eld.cancelSnip();
    }
    if (phase === 'preview' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitPreview('translate');
    }
  });
})();
