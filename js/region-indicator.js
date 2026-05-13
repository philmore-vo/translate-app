/* ============================================
   EngiLink — Region Indicator Renderer
   Handles resize handle drag via main-process cursor polling
   ============================================ */

(function () {
  'use strict';

  const handles = document.querySelectorAll('.handle');
  let mouseOverWindow = false;

  // ── Hover detection (same pattern as live-region.js) ──
  document.addEventListener('mousemove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && !mouseOverWindow) {
      mouseOverWindow = true;
      window.regionIndicator.mouseEnter();
    }
  });

  document.addEventListener('mouseleave', () => {
    mouseOverWindow = false;
    window.regionIndicator.mouseLeave();
  });

  // ── Resize handle drag ──
  handles.forEach((handle) => {
    const dir = handle.dataset.dir;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('dragging');
      window.regionIndicator.startResize(dir);
    });
  });

  // mouseup on document to catch release even if cursor moved
  document.addEventListener('mouseup', () => {
    handles.forEach(h => h.classList.remove('dragging'));
    window.regionIndicator.stopResize();
  });

  // Prevent scroll
  document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

})();
