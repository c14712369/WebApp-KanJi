/**
 * 外幣記帳（純函式＋可注入 fetch，零依賴，可單元測試）。
 * 匯率來源：fawazahmed0/currency-api（每日更新、有歷史日期、含 TWD、開放 CORS）。
 *   主來源 jsDelivr，備援 Cloudflare Pages；舊的 frankfurter 沒有 TWD，抓了只會拿到 404。
 * 抓不到一律回傳 null，由畫面請使用者手動輸入——絕不默默當 1:1 換算。
 */

// common：台灣人最常去的地方，選單第一組；其餘依地區排。symbol 不重複，清單上看得出是哪國錢。
// 匯率來源支援所有 ISO 幣別，要再加只要補一行。
export const CURRENCIES = [
  { code: 'TWD', name: '新台幣',     symbol: '$',    decimals: 0, common: true },
  { code: 'JPY', name: '日圓',       symbol: '¥',    decimals: 0, common: true },
  { code: 'KRW', name: '韓元',       symbol: '₩',    decimals: 0, common: true },
  { code: 'USD', name: '美元',       symbol: 'US$',  decimals: 2, common: true },
  { code: 'EUR', name: '歐元',       symbol: '€',    decimals: 2, common: true },
  { code: 'THB', name: '泰銖',       symbol: '฿',    decimals: 2, common: true },
  { code: 'HKD', name: '港幣',       symbol: 'HK$',  decimals: 2, common: true },
  { code: 'CNY', name: '人民幣',     symbol: 'CN¥',  decimals: 2, common: true },
  { code: 'SGD', name: '新加坡幣',   symbol: 'S$',   decimals: 2, common: true },
  { code: 'VND', name: '越南盾',     symbol: '₫',    decimals: 0, common: true },
  // 亞洲
  { code: 'MOP', name: '澳門幣',     symbol: 'MOP$', decimals: 2 },
  { code: 'MYR', name: '馬來西亞令吉', symbol: 'RM', decimals: 2 },
  { code: 'PHP', name: '菲律賓披索', symbol: '₱',    decimals: 2 },
  { code: 'IDR', name: '印尼盾',     symbol: 'Rp',   decimals: 0 },
  { code: 'KHR', name: '柬埔寨瑞爾', symbol: '៛',    decimals: 0 },
  { code: 'LAK', name: '寮國基普',   symbol: '₭',    decimals: 0 },
  { code: 'MMK', name: '緬甸元',     symbol: 'K',    decimals: 0 },
  { code: 'INR', name: '印度盧比',   symbol: '₹',    decimals: 2 },
  { code: 'NPR', name: '尼泊爾盧比', symbol: 'Rs',   decimals: 2 },
  { code: 'LKR', name: '斯里蘭卡盧比', symbol: 'SL Rs', decimals: 2 },
  { code: 'MNT', name: '蒙古圖格里克', symbol: '₮',  decimals: 0 },
  { code: 'AED', name: '阿聯迪拉姆', symbol: 'AED ', decimals: 2 },
  { code: 'TRY', name: '土耳其里拉', symbol: '₺',    decimals: 2 },
  { code: 'ILS', name: '以色列謝克爾', symbol: '₪',  decimals: 2 },
  // 大洋洲
  { code: 'AUD', name: '澳幣',       symbol: 'A$',   decimals: 2 },
  { code: 'NZD', name: '紐西蘭幣',   symbol: 'NZ$',  decimals: 2 },
  // 歐洲
  { code: 'GBP', name: '英鎊',       symbol: '£',    decimals: 2 },
  { code: 'CHF', name: '瑞士法郎',   symbol: 'CHF ', decimals: 2 },
  { code: 'CZK', name: '捷克克朗',   symbol: 'Kč',   decimals: 2 },
  { code: 'HUF', name: '匈牙利福林', symbol: 'Ft',   decimals: 0 },
  { code: 'PLN', name: '波蘭茲羅提', symbol: 'zł',   decimals: 2 },
  { code: 'DKK', name: '丹麥克朗',   symbol: 'DKK ', decimals: 2 },
  { code: 'SEK', name: '瑞典克朗',   symbol: 'SEK ', decimals: 2 },
  { code: 'NOK', name: '挪威克朗',   symbol: 'NOK ', decimals: 2 },
  { code: 'ISK', name: '冰島克朗',   symbol: 'ISK ', decimals: 0 },
  // 美洲、非洲
  { code: 'CAD', name: '加幣',       symbol: 'C$',   decimals: 2 },
  { code: 'MXN', name: '墨西哥披索', symbol: 'MX$',  decimals: 2 },
  { code: 'BRL', name: '巴西雷亞爾', symbol: 'R$',   decimals: 2 },
  { code: 'PEN', name: '秘魯索爾',   symbol: 'S/',   decimals: 2 },
  { code: 'ZAR', name: '南非蘭特',   symbol: 'R',    decimals: 2 },
  { code: 'EGP', name: '埃及鎊',     symbol: 'E£',   decimals: 2 },
];

const BY_CODE = Object.fromEntries(CURRENCIES.map(c => [c.code, c]));
const LATEST_TTL_MS = 6 * 3600 * 1000;

export function currencyMeta(code) {
  return BY_CODE[code] || { code, name: code, symbol: `${code} `, decimals: 2 };
}

/** 原幣金額：¥10,000、US$12.50（有小數才補滿位數） */
export function formatForeign(amount, code) {
  const { symbol, decimals } = currencyMeta(code);
  const n = Number(amount) || 0;
  const frac = Number.isInteger(n) ? 0 : decimals;
  return symbol + n.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: Math.max(frac, decimals) });
}

/** 匯率顯示：4 位有效數字（0.2062、32.41、0.02193） */
export function formatRate(rate) {
  return String(Number(Number(rate).toPrecision(4)));
}

/** 原幣 × 匯率 → 整數台幣；沒有有效匯率回傳 null */
export function toTWD(amount, rate) {
  const r = Number(rate);
  if (!(r > 0)) return null;
  return Math.round((Number(amount) || 0) * r);
}

export function parseRateResponse(data, code) {
  const r = Number(data?.[String(code).toLowerCase()]?.twd);
  return r > 0 ? r : null;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

const inflight = new Map();

/**
 * 某天 1 單位外幣 = 多少台幣。過去日期抓當天匯率（永久快取），今天以後抓最新（快取 6 小時）。
 * @returns {Promise<number|null>} 抓不到回傳 null
 */
export async function fetchRateToTWD(code, dateStr, { fetchImpl, storage = defaultStorage(), today = localToday() } = {}) {
  if (!code || code === 'TWD') return 1;
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;

  const tag = dateStr && dateStr < today ? dateStr : 'latest';
  const cacheKey = `fx_twd_${code}_${tag}`;
  try {
    const hit = JSON.parse(storage?.getItem(cacheKey) || 'null');
    if (hit?.rate > 0 && (tag !== 'latest' || Date.now() - hit.ts < LATEST_TTL_MS)) return hit.rate;
  } catch { /* 快取壞掉就重抓 */ }

  const key = `${cacheKey}|${fetchImpl ? 'injected' : 'global'}`;
  if (!fetchImpl && inflight.has(key)) return inflight.get(key);

  const lower = code.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${lower}.min.json`,
    `https://${tag}.currency-api.pages.dev/v1/currencies/${lower}.min.json`,
  ];
  const job = (async () => {
    for (const url of urls) {
      try {
        const res = await doFetch(url);
        if (!res.ok) continue;
        const rate = parseRateResponse(await res.json(), code);
        if (rate) {
          const rounded = Number(rate.toPrecision(6));
          try { storage?.setItem(cacheKey, JSON.stringify({ rate: rounded, ts: Date.now() })); } catch { /* 寫不進去就算了 */ }
          return rounded;
        }
      } catch { /* 換下一個來源 */ }
    }
    return null;
  })();
  if (!fetchImpl) {
    inflight.set(key, job);
    job.finally(() => inflight.delete(key));
  }
  return job;
}

/**
 * 記一筆存檔用的金額欄位：外幣存台幣＋原幣＋匯率（＋是否自訂匯率）；
 * 台幣把外幣欄位清成 undefined（JSON 會丟掉，編輯從外幣改回台幣不殘留）
 */
export function entryAmountFields(amount, code, rate, custom = false) {
  if (!code || code === 'TWD') {
    return { amount, currency: undefined, originalAmount: undefined, fxRate: undefined, fxCustom: undefined };
  }
  return { amount: toTWD(amount, rate), currency: code, originalAmount: amount, fxRate: rate, fxCustom: custom ? true : undefined };
}
