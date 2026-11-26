/**
 * 幫大家付（純函式，零依賴，可單元測試）。
 * 支出可標「均分 N 人」（splitN >= 2）或「自填我的份」（myShare >= 0），兩者擇一；
 * 統計時以 spendOf(entry, ctx) 計算使用者自己的份，entry.amount（刷卡實付台幣）永不更動。
 */

const hasMyShare = (entry) => {
  const ms = entry?.myShare;
  return ms !== undefined && ms !== null && ms !== ''
    && Number.isFinite(Number(ms)) && Number(ms) >= 0;
};

/**
 * 有效花費：
 *   1. 收入一律回傳 Number(amount) || 0（不套分攤）
 *   2. 有 myShare → myShare
 *   3. 有 splitN >= 2 → amount / splitN
 *   4. 服務費列（feeOf 指向的交易在 ctx.byId 找得到且本身不是服務費）→ amount * (交易有效花費 / 交易 amount)（交易 amount 為 0 時回傳 0）
 *   5. 其他 → amount
 */
export function spendOf(entry, ctx = {}) {
  if (!entry) return 0;
  const amt = Number(entry.amount) || 0;
  if (entry.type === 'income') return amt;
  if (hasMyShare(entry)) return Number(entry.myShare);
  const sn = Number(entry.splitN);
  if (Number.isFinite(sn) && sn >= 2) return amt / sn;
  const byId = ctx?.byId;
  if (entry.feeOf && byId && typeof byId.get === 'function') {
    const parent = byId.get(entry.feeOf);
    if (parent && !parent.feeOf) {
      const parentAmt = Number(parent.amount) || 0;
      if (parentAmt === 0) return 0;
      return amt * (spendOf(parent, ctx) / parentAmt);
    }
  }
  return amt;
}

/** 是否已標記「幫大家付」（自填或均分 N >= 2；收入一律 false） */
export function isShared(entry) {
  if (!entry || entry.type === 'income') return false;
  if (hasMyShare(entry)) return true;
  const sn = Number(entry.splitN);
  return Number.isFinite(sn) && sn >= 2;
}

/** 清單副標顯示用文字：均分 →「幫大家付 $8,950 ÷ 6」；自填 →「幫大家付 $8,950 · 我的份」；否則 '' */
export function shareLabel(entry) {
  if (!entry || entry.type === 'income') return '';
  const amtStr = Math.round(Number(entry.amount) || 0).toLocaleString('en-US');
  if (hasMyShare(entry)) return `幫大家付 $${amtStr} · 我的份`;
  const sn = Number(entry.splitN);
  if (Number.isFinite(sn) && sn >= 2) return `幫大家付 $${amtStr} ÷ ${Math.round(sn)}`;
  return '';
}

/** 產生寫回 entry 的互斥欄位 patch（splitN 與 myShare 擇一） */
export function sharePatch(mode, { n, myShare } = {}) {
  if (mode === 'split') return { splitN: Math.max(2, Math.round(Number(n) || 0)), myShare: undefined };
  if (mode === 'fixed') return { myShare: Math.max(0, Number(myShare) || 0), splitN: undefined };
  return { splitN: undefined, myShare: undefined };
}
