/* EngiLink Spotlight — Input Logic */
(function () {
  'use strict';

  const input = document.getElementById('spotlight-input');

  // Auto-focus when shown
  window.spotlight.onShow(() => {
    input.value = '';
    input.focus();
  });

  // Enter → submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        window.spotlight.submit(text);
      }
    } else if (e.key === 'Escape') {
      window.spotlight.hide();
    }
  });
})();
