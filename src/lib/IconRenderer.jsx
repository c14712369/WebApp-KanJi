import { useEffect, useSyncExternalStore } from 'react';
// 具名 import，只打包實際用到的圖示（避免 import * 把整包 lucide-react ~880KB 全帶入）。
// 內建的 30 個（預設分類與舊資料在用）直接打包，第一次畫面就畫得出來；
// 其餘 170 多個在 iconsExtended.jsx，App 閒置時預載、打開選擇器或遇到用擴充圖示的分類時載入。
// 名稱字串就是存在分類資料裡的值：已用過的名稱不可改名或刪除。分組與中文名稱見 iconCatalog.js。
import {
  Gamepad2, Briefcase, Home, ShieldCheck, MoreHorizontal, Utensils, Bus, Zap, Pill, Landmark,
  Gift, TrendingUp, Plane, BedDouble, Ticket, ShoppingBag, Car, Coffee, Smartphone, Monitor,
  BookOpen, Music, Dumbbell, Scissors, HeartPulse, Baby, Dog, Cat, Camera, Palmtree,
  CircleDashed,
} from 'lucide-react';

const CORE_ICONS = {
  Gamepad2, Briefcase, Home, ShieldCheck, MoreHorizontal, Utensils, Bus, Zap, Pill, Landmark,
  Gift, TrendingUp, Plane, BedDouble, Ticket, ShoppingBag, Car, Coffee, Smartphone, Monitor,
  BookOpen, Music, Dumbbell, Scissors, HeartPulse, Baby, Dog, Cat, Camera, Palmtree,
};

let extended = null;
let loading = null;
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getExtended = () => extended;

/** 載入擴充圖示（重複呼叫只載一次）；失敗時允許下次重試 */
export function loadAllIcons() {
  if (!loading) {
    loading = import('./iconsExtended.jsx')
      .then((m) => { extended = m.EXTENDED_ICONS; listeners.forEach(fn => fn()); })
      .catch((err) => { loading = null; console.warn('[icons] 擴充圖示載入失敗', err); });
  }
  return loading;
}

export default function IconRenderer({ name, size = 16, color = 'currentColor', className = '' }) {
  const ext = useSyncExternalStore(subscribe, getExtended);
  const Core = CORE_ICONS[name];
  const needsExtended = !Core && !!name && !ext;
  useEffect(() => { if (needsExtended) loadAllIcons(); }, [needsExtended]);

  // 擴充圖示還在載入：先留同尺寸空位，不閃一個錯的圖示
  if (needsExtended) return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />;
  const IconComponent = Core || ext?.[name] || CircleDashed;
  return <IconComponent size={size} color={color} className={className} aria-hidden="true" />;
}
