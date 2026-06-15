import { create } from 'zustand';
import {
  STORAGE_KEY, CAT_KEY, LIFE_EXP_KEY, LIFE_CAT_KEY, LIFE_INC_CAT_KEY,
  LIFE_BDG_KEY, PROJECTS_KEY, PROJECT_EXP_KEY, PROJECT_CAT_KEY,
  INCOME_KEY, WEALTH_PARAMS_KEY, WEALTH_HOLDINGS_KEY, WEALTH_BANKS_KEY,
  SALARY_DEFAULT_KEY, DAILY_EXP_KEY, PAYMENT_KEY, FIXED_SORT_KEY, THEME_KEY,
  DEFAULT_CATS, DEFAULT_LIFE_CATS, DEFAULT_LIFE_INC_CATS,
  DEFAULT_PROJECT_CATS, DEFAULT_PAYMENT_METHODS,
} from '../lib/constants';

// ─── helpers ───────────────────────────────────────────────────────────────
const load  = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save  = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// 同步偵測是否已有 Supabase 登入 session（key 形如 sb-<ref>-auth-token）。
// 用來決定初始是否顯示開場同步遮罩，避免未登入者也閃一下遮罩。
const hasStoredSupabaseSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {}
  return false;
};

// ─── initial state from localStorage ──────────────────────────────────────
const initState = {
  // Sync
  lastLocalUpdate: parseInt(localStorage.getItem('last_local_update') || '0', 10),

  // Fixed expenses
  items:      load(STORAGE_KEY, []),
  categories: load(CAT_KEY, DEFAULT_CATS.map(c => ({ ...c }))),

  // Life expenses
  lifeExpenses:         load(LIFE_EXP_KEY,     []),
  lifeCategories:       load(LIFE_CAT_KEY,     DEFAULT_LIFE_CATS.map(c => ({ ...c }))),
  lifeIncomeCategories: load(LIFE_INC_CAT_KEY, DEFAULT_LIFE_INC_CATS.map(c => ({ ...c }))),
  lifeBudgets:          load(LIFE_BDG_KEY,     {}),
  lifeCurrentMonth: new Date().toISOString().slice(0, 7),

  // Projects
  projects:           load(PROJECTS_KEY,    []),
  projectExpenses:    load(PROJECT_EXP_KEY, []),
  projectCategories:  load(PROJECT_CAT_KEY, DEFAULT_PROJECT_CATS.map(c => ({ ...c }))),

  // Payments
  paymentMethods: load(PAYMENT_KEY, DEFAULT_PAYMENT_METHODS),

  // Wealth
  wealthHoldings:     load(WEALTH_HOLDINGS_KEY, []),
  wealthBankAccounts: load(WEALTH_BANKS_KEY,    []),
  wealthParams:       load(WEALTH_PARAMS_KEY,   null),

  // Settings
  estimatedIncome: localStorage.getItem(INCOME_KEY) || '0',
  fixedSortMode:   localStorage.getItem(FIXED_SORT_KEY) || 'category',
  theme:           localStorage.getItem(THEME_KEY) || 'light',
  isPrivacyMode:   localStorage.getItem('privacy_mode') === 'true',

  // Auth
  currentUser: null,
  isSyncing:   false,
  // 開場：偵測登入 + 首次拉取雲端資料期間顯示全螢幕遮罩
  isBootstrapping: hasStoredSupabaseSession(),

  // UI
  activeTab: 'life',
  lifePendingCatId: null,
};

// ─── store ─────────────────────────────────────────────────────────────────
export const useAppStore = create((set, get) => {
  const stamp = () => {
    const now = Date.now();
    localStorage.setItem('last_local_update', now.toString());
    set({ lastLocalUpdate: now });
  };

  return {
    ...initState,

    // ── UI ──
    setActiveTab: (tab) => set({ activeTab: tab }),
    setLifePendingCatId: (id) => set({ lifePendingCatId: id }),

    togglePrivacy: () => {
      const next = !get().isPrivacyMode;
      localStorage.setItem('privacy_mode', next);
      set({ isPrivacyMode: next });
    },

    setTheme: (theme) => {
      localStorage.setItem(THEME_KEY, theme);
      set({ theme });
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    },

    // ── Fixed Expenses ──
    setItems: (items) => { save(STORAGE_KEY, items); stamp(); set({ items }); },
    addItem:  (item)  => { const next = [...get().items, item]; save(STORAGE_KEY, next); stamp(); set({ items: next }); },
    updateItem: (id, data) => {
      const next = get().items.map(i => i.id === id ? { ...i, ...data } : i);
      save(STORAGE_KEY, next); stamp(); set({ items: next });
    },
    deleteItem: (id) => {
      const next = get().items.filter(i => i.id !== id);
      save(STORAGE_KEY, next); stamp(); set({ items: next });
    },
    setCategories: (categories) => { save(CAT_KEY, categories); stamp(); set({ categories }); },
    setFixedSortMode: (mode) => { localStorage.setItem(FIXED_SORT_KEY, mode); set({ fixedSortMode: mode }); },

    // ── Life Expenses ──
    setLifeExpenses: (lifeExpenses) => { save(LIFE_EXP_KEY, lifeExpenses); stamp(); set({ lifeExpenses }); },
    addLifeExpense:  (entry) => {
      const next = [...get().lifeExpenses, entry];
      save(LIFE_EXP_KEY, next); stamp(); set({ lifeExpenses: next });
    },
    updateLifeExpense: (id, data) => {
      const next = get().lifeExpenses.map(e => e.id === id ? { ...e, ...data } : e);
      save(LIFE_EXP_KEY, next); stamp(); set({ lifeExpenses: next });
    },
    deleteLifeExpense: (id) => {
      const next = get().lifeExpenses.filter(e => e.id !== id && e._linkedExpenseId !== id);
      save(LIFE_EXP_KEY, next); stamp(); set({ lifeExpenses: next });
    },
    setLifeCategories:       (c) => { save(LIFE_CAT_KEY,     c); stamp(); set({ lifeCategories: c }); },
    setLifeIncomeCategories: (c) => { save(LIFE_INC_CAT_KEY, c); stamp(); set({ lifeIncomeCategories: c }); },
    setLifeBudgets:          (b) => { save(LIFE_BDG_KEY,     b); stamp(); set({ lifeBudgets: b }); },
    setLifeCurrentMonth:     (m) => set({ lifeCurrentMonth: m }),

    // ── Projects ──
    setProjects:          (p) => { save(PROJECTS_KEY,    p); stamp(); set({ projects: p }); },
    setProjectExpenses:   (p) => { save(PROJECT_EXP_KEY, p); stamp(); set({ projectExpenses: p }); },
    setProjectCategories: (p) => { save(PROJECT_CAT_KEY, p); stamp(); set({ projectCategories: p }); },

    // ── Wealth ──
    setWealthHoldings:     (w) => { save(WEALTH_HOLDINGS_KEY, w); stamp(); set({ wealthHoldings: w }); },
    setWealthBankAccounts: (w) => { save(WEALTH_BANKS_KEY,    w); stamp(); set({ wealthBankAccounts: w }); },
    setWealthParams:       (w) => { save(WEALTH_PARAMS_KEY,   w); stamp(); set({ wealthParams: w }); },

    // ── Settings ──
    setEstimatedIncome: (v) => { localStorage.setItem(INCOME_KEY, v); stamp(); set({ estimatedIncome: v }); },
    setPaymentMethods:  (p) => { save(PAYMENT_KEY, p); stamp(); set({ paymentMethods: p }); },

    // ── Auth ──
    setCurrentUser: (user) => set({ currentUser: user }),
    setIsSyncing:   (v)    => set({ isSyncing: v }),
    setBootstrapping: (v)  => set({ isBootstrapping: v }),

    // ── Bulk load (用於雲端同步下載後覆寫) ──
    loadFromCloud: (data) => {
      if (data.items)                save(STORAGE_KEY,        data.items);
      if (data.categories)           save(CAT_KEY,            data.categories);
      if (data.lifeExpenses)         save(LIFE_EXP_KEY,       data.lifeExpenses);
      if (data.lifeCategories)       save(LIFE_CAT_KEY,       data.lifeCategories);
      if (data.lifeIncomeCategories) save(LIFE_INC_CAT_KEY,   data.lifeIncomeCategories);
      if (data.lifeBudgets)          save(LIFE_BDG_KEY,       data.lifeBudgets);
      if (data.projects)             save(PROJECTS_KEY,       data.projects);
      if (data.projectExpenses)      save(PROJECT_EXP_KEY,    data.projectExpenses);
      if (data.projectCategories)    save(PROJECT_CAT_KEY,    data.projectCategories);
      if (data.wealthHoldings)       save(WEALTH_HOLDINGS_KEY,data.wealthHoldings);
      if (data.wealthBankAccounts)   save(WEALTH_BANKS_KEY,   data.wealthBankAccounts);
      if (data.settings?.wealthParams)    save(WEALTH_PARAMS_KEY, data.settings.wealthParams);
      if (data.settings?.estimatedIncome) localStorage.setItem(INCOME_KEY, data.settings.estimatedIncome);
      if (data.settings?.theme)           localStorage.setItem(THEME_KEY, data.settings.theme);

      const now = Date.now();
      localStorage.setItem('last_local_update', now.toString());

      set({
        lastLocalUpdate:      now,
        items:                data.items                ?? get().items,
        categories:           data.categories           ?? get().categories,
        lifeExpenses:         data.lifeExpenses         ?? get().lifeExpenses,
        lifeCategories:       data.lifeCategories       ?? get().lifeCategories,
        lifeIncomeCategories: data.lifeIncomeCategories ?? get().lifeIncomeCategories,
        lifeBudgets:          data.lifeBudgets          ?? get().lifeBudgets,
        projects:             data.projects             ?? get().projects,
        projectExpenses:      data.projectExpenses      ?? get().projectExpenses,
        projectCategories:    data.projectCategories    ?? get().projectCategories,
        wealthHoldings:       data.wealthHoldings       ?? get().wealthHoldings,
        wealthBankAccounts:   data.wealthBankAccounts   ?? get().wealthBankAccounts,
        wealthParams:         data.settings?.wealthParams  ?? get().wealthParams,
        estimatedIncome:      data.settings?.estimatedIncome ?? get().estimatedIncome,
        theme:                data.settings?.theme      ?? get().theme,
      });
    },
  };
});
