import { useEffect, useState, useRef } from 'react';
import { useAppStore } from './store/appStore';
import { useSync } from './hooks/useSync';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import SyncOverlay from './components/layout/SyncOverlay';
import LifeTab     from './components/tabs/LifeTab';
import FixedTab    from './components/tabs/FixedTab';
import AnalysisTab from './components/tabs/AnalysisTab';
import AnnualTab   from './components/tabs/AnnualTab';
import WealthTab   from './components/tabs/WealthTab';
import ProjectsTab from './components/tabs/ProjectsTab';
import { TABS } from './lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

// Global CSS (既有模組全部沿用)
import '../css/main.css';
// React-specific overrides (patch Vanilla JS CSS assumptions)
import './overrides.css';

const TAB_MAP = {
  life:     <LifeTab />,
  fixed:    <FixedTab />,
  analysis: <AnalysisTab />,
  annual:   <AnnualTab />,
  wealth:   <WealthTab />,
  projects: <ProjectsTab />,
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

  const activeIndex = TABS.findIndex(t => t.id === activeTab);

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
    <div className="container" style={{ overflowX: 'hidden', position: 'relative' }}>
      <SyncOverlay />
      <Header />
      <main style={{ position: 'relative', minHeight: '80vh', paddingBottom: '0' }}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
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
            {TAB_MAP[activeTab]}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}
