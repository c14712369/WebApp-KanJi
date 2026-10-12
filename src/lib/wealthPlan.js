/** 資產試算用的純函式：持股比重、人生目標規劃（買車/買房/退休）回推每月要存多少。 */

/** 持股依市值算比重，大到小；沒股價或市值 0 的不列入。 */
export function holdingAllocation(holdings) {
  const rows = holdings
    .map(h => ({ ...h, value: (h.shares || 0) * (h.lastPrice || 0) }))
    .filter(h => h.value > 0);
  const total = rows.reduce((s, h) => s + h.value, 0);
  if (total <= 0) return [];
  return rows.map(h => ({ ...h, pct: (h.value / total) * 100 })).sort((a, b) => b.value - a.value);
}

/** 本息平均攤還的每月應付（利率為年利率 %）。 */
export function loanPayment(principal, ratePct, years) {
  const n = Math.round((years || 0) * 12);
  if (!(principal > 0) || !(n > 0)) return 0;
  const r = (ratePct || 0) / 100 / 12;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}

// 目標換成「第幾個月付頭期」與貸款期間
const goalMonth  = g => Math.max(0, Math.round((g.years || 0) * 12));
const loanMonths = g => Math.round((g.loanYears || 0) * 12);

/** 第 t 個月（1 起算）要還的貸款總額：頭期付完的下個月開始還。 */
export function loanPayAt(t, goals) {
  let sum = 0;
  for (const g of goals) {
    const start = goalMonth(g);
    if (t > start && t <= start + loanMonths(g)) sum += loanPayment(g.loan, g.loanRate, g.loanYears);
  }
  return sum;
}

const retireMonthOf = r => Math.max(0, Math.round(((r.retireAge || 0) - (r.age || 0)) * 12));

/**
 * 退休那天要備好多少錢：退休後每月缺口（花費 − 勞保勞退，皆以今日幣值、隨通膨上漲）
 * ＋ 退休後仍在還的貸款 ＋ 退休後才發生的目標頭期，用退休後報酬率折現回退休當月。
 */
export function retirementNeed(r, goals) {
  const R  = retireMonthOf(r);
  const L  = Math.max(0, Math.round(((r.lifeAge || 0) - (r.retireAge || 0)) * 12));
  const rp = (r.postReturn || 0) / 100 / 12;
  const gap = Math.max(0, (r.monthlySpend || 0) - (r.pension || 0));
  let need = 0;
  for (let k = 1; k <= L; k++) {
    const w = gap * Math.pow(1 + (r.inflation || 0) / 100, (R + k) / 12) + loanPayAt(R + k, goals);
    need += w / Math.pow(1 + rp, k);
  }
  for (const g of goals) {
    const gm = goalMonth(g);
    if (gm > R) need += (g.cash || 0) / Math.pow(1 + rp, gm - R);
  }
  return need;
}

/**
 * 以固定的「每月可挪出金額」budget 逐月模擬：貸款從 budget 裡扣，剩下的依 invShare 分到投資/存款；
 * 到期的頭期先動用存款、不夠再賣投資。退休時資產 ≥ 退休所需、且途中從未付不出來 → ok。
 */
export function simulatePlan({ budget, inv0, cash0, invRate, cashRate, invShare, goals, retire }) {
  const ri = (invRate || 0) / 100 / 12, rc = (cashRate || 0) / 100 / 12;
  const s  = Math.min(1, Math.max(0, invShare ?? 0.5));
  const horizon = retire
    ? retireMonthOf(retire)
    : goals.reduce((m, g) => Math.max(m, goalMonth(g) + loanMonths(g)), 0);
  const need = retire ? retirementNeed(retire, goals) : 0;

  let inv = inv0 || 0, cash = cash0 || 0, fail = null;
  const withdraw = (amt, why, t) => {
    const fromCash = Math.min(cash, amt);
    cash -= fromCash; amt -= fromCash;
    const fromInv = Math.min(inv, amt);
    inv -= fromInv; amt -= fromInv;
    if (amt > 0.5 && !fail) fail = { why, month: t };
  };
  const payGoals = t => goals.forEach(g => { if (goalMonth(g) === t && t <= horizon) withdraw(g.cash || 0, g.id, t); });

  const series = [{ month: 0, inv, cash }];
  payGoals(0);
  for (let t = 1; t <= horizon; t++) {
    inv *= 1 + ri; cash *= 1 + rc;
    const free = budget - loanPayAt(t, goals);
    if (free >= 0) { inv += free * s; cash += free * (1 - s); }
    else withdraw(-free, 'loan', t);
    payGoals(t);
    if (t % 12 === 0 || t === horizon) series.push({ month: t, inv, cash });
  }

  const atRetire = inv + cash;
  return {
    ok: !fail && atRetire >= need - 0.5,
    failGoal: fail?.why ?? null, failMonth: fail?.month ?? null,
    atRetire, need, horizon, series,
  };
}

/** 找出最少要多少「每月可挪出金額」才能全部達成；連每月 10 億都不夠則 budget 為 null。 */
export function solveMonthlyBudget(p) {
  const ok = b => simulatePlan({ ...p, budget: b }).ok;
  if (ok(0)) return { budget: 0, sim: simulatePlan({ ...p, budget: 0 }) };
  let lo = 0, hi = 10_000;
  while (!ok(hi)) { lo = hi; hi *= 2; if (hi > 1e9) return { budget: null, sim: simulatePlan({ ...p, budget: lo }) }; }
  for (let i = 0; i < 50 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  const budget = Math.ceil(hi);
  return { budget, sim: simulatePlan({ ...p, budget }) };
}
