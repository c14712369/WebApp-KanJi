/** 線上部署的版本與執行中的不同才算有更新；任一邊未知或本機開發（dev）都不提示 */
export function hasNewerVersion(current, latest) {
  if (!current || !latest || current === 'dev') return false;
  return current !== latest;
}

/**
 * 等新 Service Worker 下載完、進入 waiting 再回傳它；逾時回 null。
 * 直接看 registration.waiting，不靠 workbox 事件：上一頁就開始下載的 SW，重新整理後不會再發事件。
 */
export async function waitForWaitingWorker(registration, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  if (!registration) return null;
  const deadline = Date.now() + timeoutMs;
  while (!registration.waiting && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return registration.waiting || null;
}
