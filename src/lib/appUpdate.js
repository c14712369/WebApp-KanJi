import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';
import { hasNewerVersion } from './appVersion.js';

// build 時由 vite.config 注入（Vercel 用 commit 短碼，本機為 dev）
export const APP_VERSION = __APP_VERSION__;

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// status: idle | checking | latest | outdated | error
export const useAppUpdate = create(() => ({ status: 'idle', latest: null }));

let updateSW = null;
let registration = null;
let swWaiting = false;

const markOutdated = () => useAppUpdate.setState({ status: 'outdated' });

/** 比對 dist/version.json 與執行中版本，同時請 Service Worker 去抓新版 */
export async function checkForUpdate() {
  const { status } = useAppUpdate.getState();
  if (status !== 'outdated') useAppUpdate.setState({ status: 'checking' });
  registration?.update().catch(() => {});
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const { version } = await res.json();
    const outdated = swWaiting || hasNewerVersion(APP_VERSION, version);
    useAppUpdate.setState({ latest: version, status: outdated ? 'outdated' : 'latest' });
  } catch {
    if (useAppUpdate.getState().status !== 'outdated') useAppUpdate.setState({ status: swWaiting ? 'outdated' : 'error' });
  }
}

/** 套用更新：新 Service Worker 已就緒就啟用它（會自動重新整理），否則直接重新載入 */
export async function applyUpdate() {
  if (swWaiting && updateSW) await updateSW(true);
  else window.location.reload();
}

/** 在 main.jsx 呼叫一次：註冊 SW（prompt 模式，不自動換版）並排程檢查 */
export function initAppUpdate() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { swWaiting = true; markOutdated(); },
    onRegisteredSW(_url, reg) { registration = reg || null; },
  });
  checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}
