import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { AnimatePresence, motion } from 'framer-motion';

// 網路慢時遮罩最多擋這麼久；之後收起，用本機資料先記帳，頁首齒輪轉圈代表還在同步
const MAX_BLOCK_MS = 2500;

// 開場遮罩：偵測登入 + 首次拉取雲端資料期間顯示，處理完或逾時就收起。
export default function SyncOverlay() {
  const isBootstrapping = useAppStore(s => s.isBootstrapping);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!isBootstrapping) return;
    const t = setTimeout(() => setExpired(true), MAX_BLOCK_MS);
    return () => clearTimeout(t);
  }, [isBootstrapping]);

  return (
    <AnimatePresence>
      {isBootstrapping && !expired && (
        <motion.div
          className="sync-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="sync-overlay-spinner-wrap">
            <div className="sync-overlay-spinner" />
            <i className="fa-solid fa-vault sync-overlay-icon" />
          </div>
          <div className="sync-overlay-text">正在同步雲端資料…</div>
          <div className="sync-overlay-sub">為你載入最新的收支紀錄</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
