// 擴充圖示（分類選擇器新增的那批）：拆成獨立 chunk，不進主程式檔。
// 由 IconRenderer.jsx 的 loadAllIcons() 動態載入；名稱與分組見 iconCatalog.js，由 iconCatalog.test.mjs 對齊。
import {
  // 飲食
  UtensilsCrossed, ChefHat, CookingPot, Soup, Salad, Sandwich, EggFried, Croissant, Pizza,
  Hamburger, Drumstick, Beef, Fish, CupSoda, GlassWater, Milk, Beer, Wine, Martini, Cake,
  CakeSlice, Cookie, Donut, IceCreamCone, Candy, Popcorn, Apple, Carrot, Wheat,
  // 交通
  TrainFront, TramFront, CarTaxiFront, Fuel, CircleParking, Bike, Motorbike, Scooter, Ship,
  Truck, CableCar, Route,
  // 居家・帳單
  Building2, Key, Droplet, Flame, Wifi, Phone, Tv, Sofa, Lamp, Bath, WashingMachine,
  Refrigerator, AirVent, Fan, Plug, Hammer, Wrench, PaintRoller, SprayCan, Trash2,
  // 購物
  ShoppingCart, ShoppingBasket, Store, Package, Shirt, Glasses, Watch, Gem, Sparkles, Umbrella,
  Backpack, Tag, Receipt,
  // 娛樂
  Joystick, Dice5, Puzzle, Headphones, Mic, Guitar, Film, Clapperboard, MonitorPlay, Drama,
  PartyPopper, Palette, BookHeart, Trophy, FerrisWheel, Tent,
  // 健康・運動
  Stethoscope, Hospital, Syringe, Bandage, Activity, Brain, Eye, Smile, Volleyball, Footprints,
  PersonStanding, Leaf,
  // 工作・學習
  Laptop, Tablet, Keyboard, Printer, Cpu, Code, Book, NotebookPen, Pencil, GraduationCap, School,
  Presentation, Languages, Calculator, Newspaper,
  // 金融・保險
  Wallet, CreditCard, Banknote, Coins, PiggyBank, HandCoins, TrendingDown, ChartPie, Percent,
  BadgeDollarSign, CircleDollarSign, JapaneseYen, Bitcoin, Shield, FileText, Scale, Vault,
  Repeat,
  // 家人・寵物
  Users, User, Heart, Handshake, HeartHandshake, PawPrint, Bird, Rabbit, Turtle, Bone, Flower2,
  Sprout,
  // 旅行
  PlaneTakeoff, TicketsPlane, Luggage, Hotel, Map, MapPin, Compass, Globe, Mountain,
  MountainSnow, Waves, Sun,
  // 其他
  Star, Bell, Calendar, Clock, Flag, Bookmark, Lightbulb, Box, Cloud, Bot, Settings, Cigarette,
} from 'lucide-react';

export const EXTENDED_ICONS = {
  // 飲食
  UtensilsCrossed, ChefHat, CookingPot, Soup, Salad, Sandwich, EggFried, Croissant, Pizza,
  Hamburger, Drumstick, Beef, Fish, CupSoda, GlassWater, Milk, Beer, Wine, Martini, Cake,
  CakeSlice, Cookie, Donut, IceCreamCone, Candy, Popcorn, Apple, Carrot, Wheat,
  // 交通
  TrainFront, TramFront, CarTaxiFront, Fuel, CircleParking, Bike, Motorbike, Scooter, Ship,
  Truck, CableCar, Route,
  // 居家・帳單
  Building2, Key, Droplet, Flame, Wifi, Phone, Tv, Sofa, Lamp, Bath, WashingMachine,
  Refrigerator, AirVent, Fan, Plug, Hammer, Wrench, PaintRoller, SprayCan, Trash2,
  // 購物
  ShoppingCart, ShoppingBasket, Store, Package, Shirt, Glasses, Watch, Gem, Sparkles, Umbrella,
  Backpack, Tag, Receipt,
  // 娛樂
  Joystick, Dice5, Puzzle, Headphones, Mic, Guitar, Film, Clapperboard, MonitorPlay, Drama,
  PartyPopper, Palette, BookHeart, Trophy, FerrisWheel, Tent,
  // 健康・運動
  Stethoscope, Hospital, Syringe, Bandage, Activity, Brain, Eye, Smile, Volleyball, Footprints,
  PersonStanding, Leaf,
  // 工作・學習
  Laptop, Tablet, Keyboard, Printer, Cpu, Code, Book, NotebookPen, Pencil, GraduationCap, School,
  Presentation, Languages, Calculator, Newspaper,
  // 金融・保險
  Wallet, CreditCard, Banknote, Coins, PiggyBank, HandCoins, TrendingDown, ChartPie, Percent,
  BadgeDollarSign, CircleDollarSign, JapaneseYen, Bitcoin, Shield, FileText, Scale, Vault,
  Repeat,
  // 家人・寵物
  Users, User, Heart, Handshake, HeartHandshake, PawPrint, Bird, Rabbit, Turtle, Bone, Flower2,
  Sprout,
  // 旅行
  PlaneTakeoff, TicketsPlane, Luggage, Hotel, Map, MapPin, Compass, Globe, Mountain,
  MountainSnow, Waves, Sun,
  // 其他
  Star, Bell, Calendar, Clock, Flag, Bookmark, Lightbulb, Box, Cloud, Bot, Settings, Cigarette,
};
