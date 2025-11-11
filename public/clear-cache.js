// clear-cache.js
// Detect hard reload → tell SW to delete all caches

document.addEventListener('DOMContentLoaded', () => {
  const isHardReload =
    performance.navigation.type === 1 &&
    (event?.metaKey || event?.ctrlKey || event?.shiftKey);

  if (!isHardReload) return;

  console.log('[Cache] Hard reload → clearing caches...');

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const channel = new MessageChannel();
    channel.port1.onmessage = (msg) => {
      if (msg.data?.status === 'cleared') {
        console.log('[Cache] Cleared – full reload.');
        window.location.reload(true);
      }
    };
    navigator.serviceWorker.controller.postMessage(
      { action: 'clearCache' },
      [channel.port2]
    );
  }
});