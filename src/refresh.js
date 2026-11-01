import {APP_VERSION} from './version.js?v=2026.11.01.4';

// Update checks may stall offline. Reload the current route within a bounded wait.
async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return;
  let timer;
  try {
    await Promise.race([
      navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {}),
      new Promise(resolve => { timer = setTimeout(resolve, 1500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function initRefresh() {
  const version = document.querySelector('#deployment-version');
  const button = document.querySelector('#app-refresh');
  if (version) version.textContent = `버전 ${APP_VERSION}`;
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.querySelector('span').textContent = '새로고침 중…';
    try {
      await checkForUpdate();
    } finally {
      // Preserve query parameters, login cookies, saved items, and browser history.
      location.reload();
    }
  };
}
