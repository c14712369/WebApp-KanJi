/**
 * 記一筆抽屜的數字鍵盤邏輯（純函式，方便測試）。
 * 算式以字串保存，例如 "120+35×2"；運算子使用顯示用的符號 + − × ÷。
 */
export const OPS = ['+', '−', '×', '÷'];
const MAX_INT_DIGITS = 9;
const MAX_DECIMALS = 2;

const isOp = (ch) => OPS.includes(ch);

// 算式中「最後一個數字」的字串（運算子之後的部分）
function lastNumber(expr) {
  let i = expr.length - 1;
  while (i >= 0 && !isOp(expr[i])) i--;
  return expr.slice(i + 1);
}

/** 按下一個鍵，回傳新的算式字串。鍵：'0'–'9'、'.'、'+ − × ÷'、'⌫'、'C' */
export function pressKey(expr = '', key) {
  const s = String(expr || '');
  if (key === 'C') return '';
  if (key === '⌫') return s.slice(0, -1);

  if (isOp(key)) {
    if (!s) return s;                         // 開頭不能是運算子（沒有負數金額）
    let base = s;
    if (base.endsWith('.')) base = base.slice(0, -1);
    if (isOp(base.slice(-1))) base = base.slice(0, -1); // 連按運算子 → 換掉前一個
    return base + key;
  }

  const num = lastNumber(s);
  if (key === '.') {
    if (num.includes('.')) return s;
    return s + (num === '' ? '0.' : '.');
  }

  if (/^\d$/.test(key)) {
    if (num === '0') return s.slice(0, -1) + key;   // 開頭的 0 被取代
    const [intPart, decPart] = num.split('.');
    if (decPart !== undefined) {
      if (decPart.length >= MAX_DECIMALS) return s;
    } else if (intPart.length >= MAX_INT_DIGITS) {
      return s;
    }
    return s + key;
  }
  return s;
}

/** 算式求值：先乘除後加減；結尾的運算子忽略；除以 0 視為 0；結果四捨五入到 2 位 */
export function evaluateExpr(expr = '') {
  let s = String(expr || '');
  while (s && (isOp(s.slice(-1)) || s.endsWith('.'))) s = s.slice(0, -1);
  if (!s) return 0;

  const tokens = s.split(/([+−×÷])/).filter(t => t !== '');
  // 第一輪：處理 × ÷
  const terms = [Number(tokens[0]) || 0];
  const addOps = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]) || 0;
    if (op === '×') terms[terms.length - 1] *= n;
    else if (op === '÷') terms[terms.length - 1] = n === 0 ? 0 : terms[terms.length - 1] / n;
    else { addOps.push(op); terms.push(n); }
  }
  // 第二輪：處理 + −
  let result = terms[0];
  addOps.forEach((op, i) => { result = op === '+' ? result + terms[i + 1] : result - terms[i + 1]; });
  if (!Number.isFinite(result)) return 0;
  return Math.round(result * 100) / 100;
}

export function hasOperator(expr = '') {
  return [...String(expr || '')].some(isOp);
}

/** 顯示用：數字加千分位，運算子兩側留空白 */
export function formatExpr(expr = '') {
  return String(expr || '')
    .split(/([+−×÷])/)
    .filter(t => t !== '')
    .map(t => {
      if (isOp(t)) return ` ${t} `;
      const [i, d] = t.split('.');
      const intFmt = i ? Number(i).toLocaleString('en-US') : '0';
      return d !== undefined ? `${intFmt}.${d}` : intFmt;
    })
    .join('');
}

/** 編輯既有一筆時，把金額轉成初始算式（0 或空 → 空字串） */
export function exprFromAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 100) / 100);
}
