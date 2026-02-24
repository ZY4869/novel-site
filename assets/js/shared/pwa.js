export function registerServiceWorker(path = '/sw.js') {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(path).catch(() => {});
}

