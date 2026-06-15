// 具名 import，只打包實際用到的圖示（避免 import * 把整包 lucide-react ~880KB 全帶入）。
import {
  Gamepad2, Briefcase, Home, ShieldCheck, MoreHorizontal,
  Utensils, Bus, Zap, Pill, Landmark, Gift, TrendingUp,
  Plane, BedDouble, Ticket, ShoppingBag, Car, Coffee,
  Smartphone, Monitor, BookOpen, Music, Dumbbell, Scissors,
  HeartPulse, Baby, Dog, Cat, Camera, Palmtree,
  CircleDashed,
} from 'lucide-react';

// 圖示註冊表：分類選用的圖示都來自這裡（與 AVAILABLE_ICONS 同步）。
const ICON_MAP = {
  Gamepad2, Briefcase, Home, ShieldCheck, MoreHorizontal,
  Utensils, Bus, Zap, Pill, Landmark, Gift, TrendingUp,
  Plane, BedDouble, Ticket, ShoppingBag, Car, Coffee,
  Smartphone, Monitor, BookOpen, Music, Dumbbell, Scissors,
  HeartPulse, Baby, Dog, Cat, Camera, Palmtree,
};

export default function IconRenderer({ name, size = 16, color = 'currentColor', className = '' }) {
  const IconComponent = ICON_MAP[name] || CircleDashed;
  return <IconComponent size={size} color={color} className={className} />;
}

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);
