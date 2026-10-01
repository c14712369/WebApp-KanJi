// ====== src/lib/constants.js ======
// LocalStorage keys
export const STORAGE_KEY        = 'subscription_manager_data';
export const THEME_KEY          = 'subscription_manager_theme';
export const CAT_KEY            = 'subscription_manager_categories';
export const INCOME_KEY         = 'subscription_manager_income';
export const LIFE_EXP_KEY       = 'sub_mgr_life_expenses';
export const LIFE_CAT_KEY       = 'sub_mgr_life_categories';
export const LIFE_INC_CAT_KEY   = 'sub_mgr_life_inc_categories';
export const LIFE_BDG_KEY       = 'sub_mgr_life_budgets';
export const WEALTH_PARAMS_KEY  = 'sub_mgr_wealth_params';
export const PROJECTS_KEY       = 'sub_mgr_projects';
export const PROJECT_EXP_KEY    = 'sub_mgr_project_expenses';
export const PROJECT_CAT_KEY    = 'sub_mgr_project_categories';
export const SALARY_DEFAULT_KEY = 'sub_mgr_default_salary';
export const APP_IDENTITY_KEY   = 'sub_mgr_app_identity';
export const DAILY_EXP_KEY      = 'sub_mgr_daily_exp';
export const PAYMENT_KEY        = 'sub_mgr_payment_methods';
export const FIXED_SORT_KEY     = 'sub_mgr_fixed_sort';
export const WEALTH_HOLDINGS_KEY = 'wealthHoldings_v1';
export const WEALTH_BANKS_KEY   = 'wealthBanks_v1';
export const MERCHANT_RULES_KEY = 'sub_mgr_merchant_rules';
export const DELETED_IMPORT_KEY = 'sub_mgr_deleted_import_ids';

// Default data
export const DEFAULT_CATS = [
  { id: 'cat_ent',   name: '娛樂', color: '#8b5cf6', icon: 'Gamepad2' },
  { id: 'cat_work',  name: '工作', color: '#3b82f6', icon: 'Briefcase' },
  { id: 'cat_life',  name: '生活', color: '#10b981', icon: 'Home' },
  { id: 'cat_ins',   name: '保險', color: '#f59e0b', icon: 'ShieldCheck' },
  { id: 'cat_other', name: '其他', color: '#94a3b8', icon: 'MoreHorizontal' },
];

export const DEFAULT_LIFE_CATS = [
  { id: 'lc_food',   name: '飲食', color: '#C17B2E', icon: 'Utensils' },
  { id: 'lc_trans',  name: '交通', color: '#2A6475', icon: 'Bus' },
  { id: 'lc_util',   name: '水電費', color: '#5A9E7A', icon: 'Zap' },
  { id: 'lc_ent',    name: '娛樂', color: '#8B5CF6', icon: 'Gamepad2' },
  { id: 'lc_health', name: '醫療', color: '#D46060', icon: 'Pill' },
  { id: 'lc_other',  name: '其他', color: '#8A8A8A', icon: 'MoreHorizontal' },
];

export const DEFAULT_LIFE_INC_CATS = [
  { id: 'lc_inc_salary', name: '薪資', color: '#5A9E7A', icon: 'Landmark' },
  { id: 'lc_inc_bonus',  name: '獎金', color: '#C17B2E', icon: 'Gift' },
  { id: 'lc_inc_invest', name: '投資', color: '#2A6475', icon: 'TrendingUp' },
  { id: 'lc_inc_other',  name: '其他', color: '#8A8A8A', icon: 'MoreHorizontal' },
];

export const DEFAULT_PROJECT_CATS = [
  { id: 'pc_trans',  name: '交通', color: '#2A6475', icon: 'Plane' },
  { id: 'pc_stay',   name: '住宿', color: '#5A9E7A', icon: 'BedDouble' },
  { id: 'pc_food',   name: '飲食', color: '#C17B2E', icon: 'Utensils' },
  { id: 'pc_ticket', name: '門票', color: '#8B5CF6', icon: 'Ticket' },
  { id: 'pc_shop',   name: '購物', color: '#D46060', icon: 'ShoppingBag' },
  { id: 'pc_other',  name: '其他', color: '#8A8A8A', icon: 'MoreHorizontal' },
];

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'cash',                name: '現金 / 其他',       type: 'cash', rewardRate: 0 },
  { id: 'credit_card_default', name: '信用卡 (自動計算)', type: 'card', rewardRate: 0 },
];

export const TABS = [
  { id: 'life',     label: '生活費記帳', mobileLabel: '生活', icon: 'fa-solid fa-wallet' },
  { id: 'fixed',    label: '固定支出',   mobileLabel: '固定', icon: 'fa-solid fa-list-check' },
  { id: 'analysis', label: '收支分析',   mobileLabel: '分析', icon: 'fa-solid fa-chart-pie' },
  { id: 'wealth',   label: '資產試算',   mobileLabel: '試算', icon: 'fa-solid fa-seedling' },
  { id: 'projects', label: '專案預算',   mobileLabel: '專案', icon: 'fa-solid fa-plane-up' },
  { id: 'annual',   label: '年度報表',   mobileLabel: '報表', icon: 'fa-solid fa-calendar-days' },
];
