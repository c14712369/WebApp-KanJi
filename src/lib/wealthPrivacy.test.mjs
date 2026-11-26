/**
 * 零依賴測試：node --test src/lib/wealthPrivacy.test.mjs
 * 驗證資產試算頁的隱私遮罩（maskMoney、formatAmount 不被破壞、WealthTab 遮罩契約）。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// utils.js 使用 Vite 風格無副檔名匯入（../store/appStore、./fx），在純 Node ESM 下補上解析與 store stub
let privacyState = false;
globalThis.__testAppStore = {
  getState: () => ({ isPrivacyMode: privacyState }),
  setState: (patch) => {
    if ('isPrivacyMode' in patch) privacyState = patch.isPrivacyMode;
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../store/appStore') {
      return { shortCircuit: true, url: 'virtual:appStore' };
    }
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, `${specifier}.js`);
      if (fs.existsSync(candidate)) {
        return { shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'virtual:appStore') {
      return {
        shortCircuit: true,
        format: 'module',
        source: 'export const useAppStore = globalThis.__testAppStore;',
      };
    }
    return nextLoad(url, context);
  },
});

const { formatAmount, maskMoney } = await import('./utils.js');
const useAppStore = globalThis.__testAppStore;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wealthTabPath = path.resolve(__dirname, '../components/tabs/WealthTab.jsx');
const wealthTabSrc = fs.readFileSync(wealthTabPath, 'utf8');

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};

console.log('[maskMoney 基本行為]');
test('maskMoney 函式應從 utils.js 匯出', () => {
  assert.strictEqual(typeof maskMoney, 'function');
});

test('maskMoney 在關閉隱私模式時正常格式化數字與保留字串', () => {
  assert.strictEqual(maskMoney(123456, false), '123,456');
  assert.strictEqual(maskMoney(0, false), '0');
  assert.strictEqual(maskMoney(null, false), '0');
  assert.strictEqual(maskMoney('2.7 萬', false), '2.7 萬');
  assert.strictEqual(maskMoney('980.00', false), '980.00');
});

test('maskMoney 在開啟隱私模式時回傳 ****', () => {
  assert.strictEqual(maskMoney(123456, true), '****');
  assert.strictEqual(maskMoney(0, true), '****');
  assert.strictEqual(maskMoney('2.7 萬', true), '****');
  assert.strictEqual(maskMoney('980.00', true), '****');
});

test('maskMoney 未傳第二參數時預設讀取 store 的 isPrivacyMode', () => {
  useAppStore.setState({ isPrivacyMode: false });
  assert.strictEqual(maskMoney(5000), '5,000');
  useAppStore.setState({ isPrivacyMode: true });
  assert.strictEqual(maskMoney(5000), '****');
});

console.log('\n[formatAmount 既有行為不變]');
test('formatAmount 仍只遮 income，不遮 expense / asset / 未指定', () => {
  useAppStore.setState({ isPrivacyMode: true });
  assert.strictEqual(formatAmount(5000, 'income'), '****');
  assert.strictEqual(formatAmount(5000, 'expense'), '5,000');
  assert.strictEqual(formatAmount(5000, 'asset'), '5,000');
  assert.strictEqual(formatAmount(5000), '5,000');
  useAppStore.setState({ isPrivacyMode: false });
});

console.log('\n[WealthTab 隱私模式整合契約]');
test('WealthTab 主元件訂閱 useAppStore(s => s.isPrivacyMode)', () => {
  const mainBody = wealthTabSrc.slice(wealthTabSrc.indexOf('export default function WealthTab'));
  assert.match(mainBody, /useAppStore\(\s*s\s*=>\s*s\.isPrivacyMode\s*\)/);
});

test('WealthTab 不應再使用未遮罩的 formatAmount(..., "asset") 或 formatAmount(v)', () => {
  assert.doesNotMatch(wealthTabSrc, /\bformatAmount\s*\(/);
});

test('WealthTab 中的 AnimatedNumber 全部使用依 isPrivacyMode 回傳 **** 的格式器', () => {
  const matches = [...wealthTabSrc.matchAll(/<AnimatedNumber\b[^>]*>/g)].map(m => m[0]);
  assert.ok(matches.length >= 10, `預期至少 10 個 AnimatedNumber，實際 ${matches.length}`);
  for (const tag of matches) {
    assert.match(tag, /format=\{/, `AnimatedNumber 缺少 format: ${tag}`);
    assert.doesNotMatch(tag, /formatAmount/, `AnimatedNumber 不可再用 formatAmount: ${tag}`);
  }
});

test('WealthChart Y 軸與 tooltip 使用 isPrivacyMode 遮罩，且 isPrivacyMode 在依賴陣列中', () => {
  const chartSection = wealthTabSrc.slice(
    wealthTabSrc.indexOf('function WealthChart'),
    wealthTabSrc.indexOf('export default function WealthTab'),
  );
  assert.match(chartSection, /useAppStore\(\s*s\s*=>\s*s\.isPrivacyMode\s*\)/);
  assert.match(chartSection, /tooltip:\s*\{\s*callbacks:\s*\{\s*label:[\s\S]*maskMoney\(/);
  assert.match(chartSection, /ticks:\s*\{[\s\S]*(?:maskMoney\([\s\S]*?isPrivacyMode|isPrivacyMode\s*\?\s*['"]\*{4}['"])/);
  assert.match(chartSection, /\},\s*\[labels,\s*cashData,\s*investData,\s*totalData,\s*targetFV,\s*targetLabel,\s*theme,\s*isPrivacyMode\]\)/);
});

test('wan 摘要函式、HoldingModal 現價、規劃結果與比較文字皆經過遮罩', () => {
  assert.match(wealthTabSrc, /const wan\s*=.*isPrivacyMode|maskMoney/);
  assert.match(wealthTabSrc, /現價 NT\$ \$\{maskMoney\(/);
  assert.match(wealthTabSrc, /從現有資產 NT\$ \{maskMoney\(/);
  assert.match(wealthTabSrc, /退休時要備 <strong>NT\$ \{maskMoney\(/);
  assert.match(wealthTabSrc, /還貸 NT\$ \{maskMoney\(/);
  assert.match(wealthTabSrc, /存 <strong>NT\$ \{maskMoney\(/);
  assert.match(wealthTabSrc, /每月要從存款補 NT\$ \{maskMoney\(/);
  assert.match(wealthTabSrc, /目前每月存 NT\$ \$\{maskMoney\(/);
});

test('輸入框保持綁定真實數值，不傳入 maskMoney', () => {
  const inputs = [...wealthTabSrc.matchAll(/<input\b[^>]*value=\{[^}]+\}[^>]*>/g)].map(m => m[0]);
  assert.ok(inputs.length >= 6, `預期至少 6 個綁定 value 的 input，實際 ${inputs.length}`);
  for (const inp of inputs) {
    assert.doesNotMatch(inp, /maskMoney|\*{4}/, `input 不應被遮罩: ${inp}`);
  }
});

test('WealthTab 所有非標籤 NT$ 顯示金額皆經過 maskMoney 遮罩', () => {
  const lines = wealthTabSrc.split(/\r?\n/);
  const ntLines = lines
    .map((text, idx) => ({ line: idx + 1, text }))
    .filter(({ text }) => text.includes('NT$') && !text.includes('<label'));
  assert.ok(ntLines.length >= 18, `預期至少 18 處 NT$ 金額顯示，實際 ${ntLines.length}`);
  for (const { line, text } of ntLines) {
    assert.match(text, /maskMoney/, `第 ${line} 行出現 NT$ 但未使用 maskMoney: ${text.trim()}`);
  }
});

test('百分比（持倉比重、占比、利率、報酬率）保持正常顯示不被遮罩', () => {
  assert.match(wealthTabSrc, /占比 \{investPct\}%/);
  assert.match(wealthTabSrc, /占比 \{100 - investPct\}%/);
  assert.match(wealthTabSrc, /\{h\.pct\.toFixed\(1\)\}%\<\/span>/);
  assert.match(wealthTabSrc, /利率 \{a\.rate \|\| 0\}%/);
  assert.match(wealthTabSrc, /投資 \$\{num\(invRate\)\}%・存款 \$\{num\(cashRate\)\}%/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
