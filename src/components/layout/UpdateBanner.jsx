import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppUpdate, applyUpdate } from '../../lib/appUpdate';

// 線上有新版本時，從頂端（避開 iOS 狀態列模糊帶）浮出的更新提示
export default function UpdateBanner() {
  const status = useAppUpdate(s => s.status);
  const latest = useAppUpdate(s => s.latest);
  const [dismissed, setDismissed] = useState(null);
  const [applying, setApplying] = useState(false);

  // 關掉只對同一版本有效；之後再出新版會重新提示
  useEffect(() => { if (status !== 'outdated') setDismissed(null); }, [status]);

  const visible = status === 'outdated' && dismissed !== (latest || 'sw');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="update-banner"
          role="status"
          initial={{ x: '-50%', y: -24, opacity: 0, scale: 0.96 }}
          animate={{ x: '-50%', y: 0, opacity: 1, scale: 1 }}
          exit={{ x: '-50%', y: -16, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <span className="update-banner-dot" aria-hidden="true"></span>
          <span className="update-banner-text">有新版本可用</span>
          <button
            type="button"
            className="update-banner-btn"
            onClick={() => { setApplying(true); applyUpdate(); }}
          >
            <i className={`fa-solid fa-rotate${applying ? ' fa-spin' : ''}`} aria-hidden="true"></i>更新
          </button>
          <button type="button" className="update-banner-close" aria-label="稍後再說" onClick={() => setDismissed(latest || 'sw')}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
