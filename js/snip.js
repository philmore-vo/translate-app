/* ============================================
   EngiLink Dictionary — Snip JS (Region Select)
   ============================================ */

(function () {
  'use strict';

  const overlay = document.getElementById('snip-overlay');
  const selection = document.getElementById('snip-selection');
  const hint = document.getElementById('snip-hint');
  const processing = document.getElementById('snip-processing');

  let startX = 0, startY = 0;
  let dragging = false;

  // ── Mouse down: start selection ──
  document.addEventListener('mousedown', (e) => {
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

  // ── Mouse move: resize selection ──
  document.addEventListener('mousemove', (e) => {
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

  // ── Mouse up: finish selection ──
  document.addEventListener('mouseup', (e) => {
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

    // Ignore tiny selections (accidental clicks)
    if (rect.width < 10 || rect.height < 10) {
      selection.style.display = 'none';
      hint.style.display = 'block';
      return;
    }

    // Show processing indicator
    selection.style.display = 'none';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    processing.style.display = 'block';

    // Send region to main process for capture + OCR
    window.eld.captureRegion(rect);
  });

  // ── Escape to cancel ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.eld.cancelSnip();
    }
  });
})();
