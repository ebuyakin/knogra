/**
 * Tab guard — detects when the app is already open in another tab and warns
 * the user. Multiple concurrent tabs share the same IndexedDB and localStorage,
 * so concurrent writes can corrupt graph data.
 *
 * Mechanism: localStorage heartbeat. Each tab writes its timestamp every
 * HEARTBEAT_INTERVAL ms. On startup, if a timestamp younger than STALE_THRESHOLD
 * exists, another tab is considered active. beforeunload clears the key on normal
 * close; the stale threshold handles crashes (key expires naturally).
 */

const HEARTBEAT_KEY = 'knogra.activeTab';
const HEARTBEAT_INTERVAL = 5_000;  // write every 5s
const STALE_THRESHOLD   = 10_000; // consider stale after 10s

export function initTabGuard(): void {
  const stored = localStorage.getItem(HEARTBEAT_KEY);
  if (stored) {
    const age = Date.now() - parseInt(stored, 10);
    if (age < STALE_THRESHOLD) {
      showBanner();
    }
  }

  // Claim the slot
  localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());

  const interval = setInterval(() => {
    localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
  }, HEARTBEAT_INTERVAL);

  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
    localStorage.removeItem(HEARTBEAT_KEY);
  });
}

function showBanner(): void {
  const banner = document.createElement('div');
  banner.id = 'tab-guard-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    background: #3d2c00;
    border-bottom: 1px solid #7a5500;
    color: #e3b341;
    font-size: 13px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `;
  banner.innerHTML = `
    <span>⚠ Knogra is already open in another tab. Using multiple tabs simultaneously may cause data loss.</span>
    <button style="
      background: none;
      border: 1px solid #7a5500;
      color: #e3b341;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 12px;
      cursor: pointer;
    ">Dismiss</button>
  `;
  banner.querySelector('button')!.addEventListener('click', () => banner.remove());
  document.body.prepend(banner);
}
