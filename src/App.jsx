import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useAppStore } from './store/appStore';
import { useSync } from './hooks/useSync';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import SyncOverlay from './components/layout/SyncOverlay';
import TabSkeleton from './components/layout/TabSkeleton';
import { TABS } from './lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

// Global CSS (既有模組全部沿用)
import '../css/main.css';
// React-specific overrides (patch Vanilla JS CSS assumptions)
import './overrides.css';

// 分頁懶載入：首屏只載入當前分頁，chart.js / 股票清單等重物按需切出獨立 chunk
const LifeTab     = lazy(() => import('./components/tabs/LifeTab'));
const FixedTab    = lazy(() => import('./components/tabs/FixedTab'));
const AnalysisTab = lazy(() => import('./components/tabs/AnalysisTab'));
const AnnualTab   = lazy(() => import('./components/tabs/AnnualTab'));
const WealthTab   = lazy(() => import('./components/tabs/WealthTab'));
const ProjectsTab = lazy(() => import('./components/tabs/ProjectsTab'));

const TAB_MAP = {
  life:     LifeTab,
  fixed:    FixedTab,
  analysis: AnalysisTab,
  annual:   AnnualTab,
  wealth:   WealthTab,
  projects: ProjectsTab,
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset, velocity) => {
  return Math.abs(offset) * velocity;
};

export default function App() {
  const { activeTab, setActiveTab, theme } = useAppStore();
  const [direction, setDirection] = useState(0);
  const prevTabRef = useRef(activeTab);

  useSync(); // 初始化 auth + 雲端同步

  useEffect(() => {
    const prevIndex = TABS.findIndex(t => t.id === prevTabRef.current);
    const currIndex = TABS.findIndex(t => t.id === activeTab);
    if (prevIndex !== currIndex) {
      setDirection(currIndex > prevIndex ? 1 : -1);
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  // 套用 theme
  useEffect(() => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  // 切換分頁時捲回頂部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // 手機版生活費頁固定在視窗內，將垂直捲動交給明細／分類內容區。
  useEffect(() => {
    document.body.classList.toggle('life-page-active', activeTab === 'life');
    return () => document.body.classList.remove('life-page-active');
  }, [activeTab]);

  // 有彈窗開著時在 body 標記 modal-open，CSS 據此收起手機底部導覽列。
  // 不靠 z-index / :has()：iOS Safari 上分頁動畫層的 stacking context 會讓導覽列壓在彈窗上。
  useEffect(() => {
    const sync = () => document.body.classList.toggle('modal-open', !!document.querySelector('.modal-overlay.active'));
    const observer = new MutationObserver(sync);
    observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    sync();
    return () => { observer.disconnect(); document.body.classList.remove('modal-open'); };
  }, []);

  const activeIndex = TABS.findIndex(t => t.id === activeTab);
  const ActiveTab = TAB_MAP[activeTab];

  const variants = {
    enter: (direction) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
      position: 'absolute',
      width: '100%'
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      position: 'relative',
      width: '100%',
      transition: { duration: 0.3 }
    },
    exit: (direction) => ({
      zIndex: 0,
      x: direction < 0 ? 100 : -100,
      opacity: 0,
      position: 'absolute',
      width: '100%',
      transition: { duration: 0.3 }
    })
  };

  const handleDragEnd = (e, { offset, velocity }) => {
    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -swipeConfidenceThreshold) {
      if (activeIndex < TABS.length - 1) {
        if (navigator.vibrate) navigator.vibrate(50);
        setActiveTab(TABS[activeIndex + 1].id);
      }
    } else if (swipe > swipeConfidenceThreshold) {
      if (activeIndex > 0) {
        if (navigator.vibrate) navigator.vibrate(50);
        setActiveTab(TABS[activeIndex - 1].id);
      }
    }
  };

  return (
    <div className={`container app-shell${activeTab === 'life' ? ' life-page-shell' : ''}`} style={{ overflowX: 'hidden', position: 'relative' }}>
      <SyncOverlay />
      <Header />
      <main className="app-main" style={{ position: 'relative', minHeight: '80vh', paddingBottom: '0' }}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            className="tab-motion-layer"
            key={activeTab}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
            dragDirectionLock
          >
            <Suspense fallback={<TabSkeleton />}>
              <ActiveTab />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}
