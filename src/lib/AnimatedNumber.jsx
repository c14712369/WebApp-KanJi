import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animated Number component
 * @param {string} effect - 'scroll' (count up), 'fade' (just opacity/blur), 'none'
 */
export default function AnimatedNumber({ value, format, duration = 700, effect = 'fade' }) {
  const [display, setDisplay] = useState(0);
  const prevValueRef = useRef(0);
  const wasHiddenRef = useRef(false);

  const isHiddenNow = format && format(value) === '****';

  useEffect(() => {
    if (isHiddenNow) {
      wasHiddenRef.current = true;
      return;
    }

    const revealed = wasHiddenRef.current;
    wasHiddenRef.current = false;

    // For non-scroll effects or when just revealed from hidden state, snap to target value immediately
    if (effect !== 'scroll' || revealed) {
      setDisplay(value);
      prevValueRef.current = value;
      return;
    }

    const initial = prevValueRef.current;
    const diff = value - initial;
    
    if (diff === 0 && !revealed) {
      setDisplay(value);
      return;
    }

    let start = null;
    let animationFrameId;

    const step = (ts) => {
      if (!start) start = ts;
      const p      = Math.min((ts - start) / duration, 1);
      const eased  = 1 - Math.pow(1 - p, 4); // easeOutQuart
      setDisplay(initial + diff * eased);
      
      if (p < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplay(value);
        prevValueRef.current = value;
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration, isHiddenNow, effect]); 

  const rounded = Math.round(display);
  const displayText = format ? format(rounded) : rounded.toLocaleString();

  // 遮蔽時寬度不變（2026-11-13 使用者定）：真正的數字留在原位但透明、撐住寬度，星號疊在上面置中。
  // 星號照原數字逐位替換、保留逗號（54,000 → **,***），寬度跟原數字一樣；
  // 固定四顆「****」遇到 $15 這種小金額會比原數字寬，蓋到旁邊的字。
  // 所有 format 都是 formatAmount 系列，不遮時就是 toLocaleString()。
  // 每顆星號放進 1ch 寬（＝數字 0 的字寬）的格子：星號剛好排在原本每一位數字的位置，「$」後面不會空一截
  const realText = Math.round(value).toLocaleString();
  const maskChars = [...realText].map((ch, i) => (/\d/.test(ch)
    ? <span key={i} style={{ display: 'inline-block', width: '1ch', textAlign: 'center' }}>*</span>
    : ch));

  // Animation variants for the container
  const variants = {
    initial: { opacity: 0, filter: 'blur(4px)', y: 2 },
    animate: { opacity: 1, filter: 'blur(0px)', y: 0 },
    exit: { opacity: 0, filter: 'blur(2px)', y: -2 }
  };

  return (
    <AnimatePresence mode="wait">
      {isHiddenNow ? (
        <motion.span
          key="hidden-stars"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          style={{ display: 'inline-block', position: 'relative' }}
        >
          <span aria-hidden="true" style={{ visibility: 'hidden' }}>{realText}</span>
          <span style={{ position: 'absolute', inset: 0, textAlign: 'center', whiteSpace: 'nowrap' }}>{maskChars}</span>
        </motion.span>
      ) : (
        <motion.span
          key={`visible-${effect === 'scroll' ? 'scrolling' : value}`}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          style={{ display: 'inline-block' }}
        >
          {displayText === '****' ? '0' : displayText}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
