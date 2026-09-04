'use strict';

(function () {
  let secondsRemaining = 5;
  let timerId = null;

  function executeReload(btn) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Refreshing...';
    }
    window.location.reload();
  }

  function init() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;

    // 1. Initial button state with countdown
    refreshBtn.textContent = `Refresh (${secondsRemaining}s)`;

    // 2. Countdown timer with auto-retry
    timerId = setInterval(() => {
      secondsRemaining -= 1;
      if (secondsRemaining <= 0) {
        executeReload(refreshBtn);
      } else {
        refreshBtn.textContent = `Refresh (${secondsRemaining}s)`;
      }
    }, 1000);

    // 3. Manual click handler (cancels timer & triggers immediate reload)
    refreshBtn.addEventListener('click', (event) => {
      event.preventDefault();
      executeReload(refreshBtn);
    });

    // 4. Cancel timer if user clicks status link
    const healthLink = document.querySelector('a[href="/health"]');
    if (healthLink) {
      healthLink.addEventListener('click', () => {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
      });
    }
  }

  // Prevents missed events if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
