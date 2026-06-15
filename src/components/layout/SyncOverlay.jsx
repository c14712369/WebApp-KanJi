import { useAppStore } from '../../store/appStore';
import { AnimatePresence, motion } from 'framer-motion';

// 開場遮罩：偵測登入 + 首次拉取雲端資料期間顯示，處理完才收起。
export default function SyncOverlay() {
  const isBootstrapping = useAppStore(s => s.isBootstrapping);

  return (
    <AnimatePresence>
      {isBootstrapping && (
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
