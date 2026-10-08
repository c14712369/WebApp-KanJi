import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '../../store/appStore';
import { calculateExpenseForMonth, prefetchFXRates, showToast } from '../../lib/utils';
import ChartEmpty from '../ui/ChartEmpty';
import { sumProjectExpenses, projectExpenseYears } from '../../lib/projectSpend';

Chart.register(...registerables);

// ── Local helpers ────────────────────────────────────────────────────────────
function getMonthlyFixedTotal(items, ym) {
  if (!ym || !items?.length) return 0;
  const [y, m] = ym.split('-').map(Number);
  return items.reduce((s, item) => s + calculateExpenseForMonth(item, y, m), 0);
}

function calculateExpenseForYear(item, year) {
  const start     = new Date(item.startDate);
  const end       = item.endDate ? new Date(item.endDate) : new Date(9999, 11, 31);
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);
  if (start > yearEnd || end < yearStart) return 0;

  if (item.cycle === 'fixed') {
    return start.getFullYear() === year ? item.amount : 0;
  }

  const steps = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12, bimonthly: 2 };
  const inc = steps[item.cycle];
  if (!inc) return 0;

  let total = 0;
  let d = new Date(start);
  while (d <= yearEnd) {
    if (d >= yearStart && d <= end) total += item.amount;
    d.setMonth(d.getMonth() + inc);
  }
  return total;
}

function getLifeIncomeForMonth(lifeExpenses, ym) {
  return lifeExpenses.filter(e => e.type === 'income' && (e.date || '').startsWith(ym)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
}
function getLifeExpForMonth(lifeExpenses, ym) {
  return lifeExpenses.filter(e => e.type !== 'income' && (e.date || '').startsWith(ym)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function buildChartYears(items) {
  const now = new Date().getFullYear();
  let min = now, max = now + 2;
  items.forEach(i => {
    const s = new Date(i.startDate).getFullYear();
    if (s < min) min = s;
    if (i.endDate && new Date(i.endDate).getFullYear() > max) max = new Date(i.endDate).getFullYear();
  });
  const years = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}

function getUniqueYears(items, lifeExpenses, projects, projectExpenses) {
  const years = new Set([new Date().getFullYear()]);
  items.forEach(i => {
    if (i.startDate) years.add(new Date(i.startDate).getFullYear());
    if (i.endDate) years.add(new Date(i.endDate).getFullYear());
  });
  lifeExpenses.forEach(e => {
    if (e.date) years.add(new Date(e.date).getFullYear());
  });
  projectExpenseYears(projects, projectExpenses).forEach(y => years.add(Number(y)));
  return Array.from(years).sort((a, b) => a - b);
}

// ── Chart hook ───────────────────────────────────────────────────────────────
// canvas 只在有資料時才掛載；destroy 一律可重複呼叫，切換空/非空不會留殘影
function useChart(ref) {
  const inst = useRef(null);
  const destroy = useCallback(() => { inst.current?.destroy(); inst.current = null; }, []);
  const create  = useCallback((config) => {
    destroy();
    if (!ref.current) return;
    inst.current = new Chart(ref.current, config);
  }, [ref, destroy]);
  useEffect(() => () => destroy(), [destroy]);
  return { create, destroy };
}

// Y 軸刻度：萬以上縮寫，避免手機上刻度擠掉繪圖區
const fmtTick = (v) => (Math.abs(v) >= 10000 ? `${+(v / 10000).toFixed(1)}萬` : Number(v).toLocaleString());
const fmtNT   = (v) => 'NT$ ' + Math.round(v).toLocaleString();

// 小型分段控制（沿用 FixedTab 的 .fx-seg 樣式）
function Seg({ options, value, onChange, label, className = '' }) {
  return (
    <div className={`fx-seg an-seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          aria-label={o.aria} title={o.aria}
          className={`fx-seg-btn${value === o.value ? ' is-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.icon ? <i className={o.icon} aria-hidden="true"></i> : o.label}
        </button>
      ))}
    </div>
  );
}

const SHAPES = [
  { value: 'pie', icon: 'fa-solid fa-chart-pie', aria: '圓餅圖' },
  { value: 'bar', icon: 'fa-solid fa-chart-simple', aria: '長條圖' },
];
const PERIODS = [
  { value: 'month', label: '按月' },
  { value: 'year',  label: '按年' },
];
const RANGES = [3, 6, 12, 24].map(n => ({ value: n, label: `${n} 個月`, aria: `近 ${n} 個月` }));

// ── Main AnalysisTab ──────────────────────────────────────────────────────────
export default function AnalysisTab() {
  const {
    items, categories, lifeExpenses, lifeCategories,
    setActiveTab, setLifeCurrentMonth, setLifePendingCatId,
    projects, projectExpenses, theme
  } = useAppStore();

  const now    = new Date();
  const initYm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const [ym,          setYm]          = useState(initYm);
  const [chartType,   setChartType]   = useState('month'); // 'year' | 'month'
  const [chartShape,  setChartShape]  = useState('pie');   // 'pie'  | 'bar'
  const [chartYear,   setChartYear]   = useState(now.getFullYear());
  const [trendRange,  setTrendRange]  = useState(6);
  const expChartRef  = useRef(null);
  const lifeCatRef   = useRef(null);
  const trendRef     = useRef(null);
  const annualCompareRef = useRef(null);
  const expChart     = useChart(expChartRef);
  const lifeCatChart = useChart(lifeCatRef);
  const trendChart   = useChart(trendRef);
  const annualCompareChart = useChart(annualCompareRef);

  const chartYears = useMemo(() => buildChartYears(items), [items]);
  const uniqueYears = useMemo(() => getUniqueYears(items, lifeExpenses, projects, projectExpenses), [items, lifeExpenses, projects, projectExpenses]);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = () => isDark() ? '#F0EDE8' : '#1A1A1A';
  const gc = () => isDark() ? 'rgba(221,230,237,0.1)' : '#E8E5E0';
  const teal = () => isDark() ? '#5BA3B5' : '#2A6475'; // 暗色底上原深青色對比不足
  const yScale = (extra = {}) => ({
    beginAtZero: true, min: 0, ...extra,
    ticks: { color: tc(), callback: fmtTick, maxTicksLimit: 6 },
    grid: { color: gc() },
    border: { display: false },
  });
  const xScale = (extra = {}) => ({ ...extra, ticks: { color: tc() }, grid: { display: false } });

  // ── Month navigation ──
  const changeMonth = (delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  };
  const isThisMonth = ym === initYm;

  // ── Expense Chart：先算資料，再依資料決定畫圖或顯示空狀態 ──
  const [expData, setExpData] = useState(null);
  const buildExpData = useCallback(async () => {
    const dataMap = {};
    const details = [];
    if (chartType === 'year') {
      const pairs = Array.from({ length: 12 }, (_, i) => [chartYear, i + 1]);
      await prefetchFXRates(items, pairs);
      items.forEach(item => {
        const cost = calculateExpenseForYear(item, chartYear);
        if (cost > 0) {
          const cat = categories.find(c => c.id === item.categoryId) || categories[categories.length - 1];
          if (!dataMap[cat.id]) dataMap[cat.id] = { label: cat.name, amount: 0, color: cat.color };
          dataMap[cat.id].amount += cost;
          details.push({ name: item.name, cost, color: cat.color });
        }
      });
    } else {
      const [y, m] = ym.split('-').map(Number);
      await prefetchFXRates(items, [[y, m]]);
      items.forEach(item => {
        const cost = calculateExpenseForMonth(item, y, m);
        if (cost > 0) {
          const cat = categories.find(c => c.id === item.categoryId) || categories[categories.length - 1];
          if (!dataMap[cat.id]) dataMap[cat.id] = { label: cat.name, amount: 0, color: cat.color };
          dataMap[cat.id].amount += cost;
          details.push({ name: item.name, cost, color: cat.color });
        }
      });
    }
    const labels = [], data = [], colors = [];
    Object.values(dataMap).forEach(d => { labels.push(d.label); data.push(d.amount); colors.push(d.color); });
    const title = chartType === 'year' ? `${chartYear} 年度支出（${labels.length} 分類）` : `月度支出（${labels.length} 分類）`;
    return { labels, data, colors, title, details: details.sort((a, b) => b.cost - a.cost) };
  }, [chartType, chartYear, ym, items, categories]);

  useEffect(() => {
    let alive = true;
    buildExpData().then(r => { if (alive) setExpData(r); });
    return () => { alive = false; };
  }, [buildExpData]);

  const expEmpty = !!expData && expData.data.length === 0;
  useEffect(() => {
    if (!expData || expData.data.length === 0) { expChart.destroy(); return; }
    const { labels, data, colors, title } = expData;
    if (chartShape === 'pie') {
      expChart.create({ type: 'pie', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#fff', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: tc(), boxWidth: 12, padding: 14 } }, title: { display: true, text: title, color: tc(), font: { size: 14 } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtNT(ctx.raw)}` } } },
        },
      });
    } else {
      expChart.create({ type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: title, color: tc(), font: { size: 14 } },
            tooltip: { callbacks: { label: ctx => fmtNT(ctx.raw) } },
          },
          scales: { y: yScale(), x: xScale() },
        },
      });
    }
  }, [expData, chartShape, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Life Category Chart ──
  const lifeCatData = useMemo(() => {
    const labels = [], data = [], colors = [];
    lifeCategories.forEach(cat => {
      const s = lifeExpenses.filter(e => e.categoryId === cat.id && (e.date || '').startsWith(ym) && e.type !== 'income').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      if (s > 0) { labels.push(cat.name); data.push(s); colors.push(cat.color); }
    });
    return { labels, data, colors };
  }, [ym, lifeExpenses, lifeCategories]);
  const lifeEmpty = lifeCatData.data.length === 0;

  useEffect(() => {
    const { labels, data, colors } = lifeCatData;
    if (data.length === 0) { lifeCatChart.destroy(); return; }
    lifeCatChart.create({
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: { callbacks: { label: ctx => fmtNT(ctx.raw) } },
        },
        scales: { y: yScale(), x: xScale() },
        onClick: (_, elements) => {
          if (!elements?.length) return;
          const cat = lifeCategories.find(c => c.name === labels[elements[0].index]);
          if (!cat) return;
          setLifePendingCatId(cat.id);
          setLifeCurrentMonth(ym);
          setActiveTab('life');
        },
      },
    });
  }, [lifeCatData, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trend Chart ──
  const [trendData, setTrendData] = useState(null);
  const buildTrendData = useCallback(async () => {
    const months = [];
    for (let i = trendRange - 1; i >= 0; i--) {
      const t = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'));
    }
    const pairs = months.map(m => m.split('-').map(Number));
    await prefetchFXRates(items, pairs);
    const labels  = months.map(m => m.split('-')[1] + '月');
    const subData = months.map(m => Math.round(getMonthlyFixedTotal(items, m)));
    const lifeData = months.map(m => getLifeExpForMonth(lifeExpenses, m));
    return { labels, subData, lifeData };
  }, [trendRange, items, lifeExpenses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    buildTrendData().then(r => { if (alive) setTrendData(r); });
    return () => { alive = false; };
  }, [buildTrendData]);

  const trendEmpty = !!trendData && [...trendData.subData, ...trendData.lifeData].every(v => !v);
  useEffect(() => {
    if (!trendData || trendEmpty) { trendChart.destroy(); return; }
    const { labels, subData, lifeData } = trendData;
    trendChart.create({
      type: 'line',
      data: { labels, datasets: [
        { label: '固定支出', data: subData,  borderColor: teal(), backgroundColor: teal() + '18', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true },
        { label: '生活費',   data: lifeData, borderColor: '#C17B2E', backgroundColor: '#C17B2E18', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: tc(), boxWidth: 12, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtNT(ctx.raw) } },
        },
        scales: { y: yScale(), x: xScale() },
      },
    });
  }, [trendData, trendEmpty, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Annual compare（圖表與表格共用同一套年度數字）──
  const annualRows = useMemo(() => uniqueYears.map(year => {
    let annualFixed = 0;
    for (let m = 1; m <= 12; m++) {
      for (const item of items) {
        annualFixed += calculateExpenseForMonth(item, year, m);
      }
    }
    const annualLife = lifeExpenses
      .filter(e => e.type !== 'income' && e.date && e.date.startsWith(String(year)))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const annualProject = sumProjectExpenses(projects, projectExpenses, year);
    return { year, fixed: annualFixed, life: annualLife, project: annualProject, total: annualFixed + annualLife + annualProject };
  }), [uniqueYears, items, lifeExpenses, projects, projectExpenses]);

  const [annualData, setAnnualData] = useState(null);
  const buildAnnualData = useCallback(async () => {
    if (!uniqueYears.length) return null;
    const pairs = [];
    uniqueYears.forEach(y => { for (let m = 1; m <= 12; m++) pairs.push([y, m]); });
    await prefetchFXRates(items, pairs);

    const fixedData = [], lifeData = [], projectData = [];
    uniqueYears.forEach(year => {
      let annualFixed = 0;
      for (let m = 1; m <= 12; m++) {
        for (const item of items) annualFixed += calculateExpenseForMonth(item, year, m);
      }
      fixedData.push(Math.round(annualFixed));
      lifeData.push(lifeExpenses
        .filter(e => e.type !== 'income' && e.date && e.date.startsWith(String(year)))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
      projectData.push(sumProjectExpenses(projects, projectExpenses, year));
    });
    return { labels: uniqueYears.map(y => `${y} 年`), fixedData, lifeData, projectData };
  }, [uniqueYears, items, lifeExpenses, projects, projectExpenses]);

  useEffect(() => {
    let alive = true;
    buildAnnualData().then(r => { if (alive) setAnnualData(r || { labels: [], fixedData: [], lifeData: [], projectData: [] }); });
    return () => { alive = false; };
  }, [buildAnnualData]);

  const annualEmpty = !!annualData && [...annualData.fixedData, ...annualData.lifeData, ...annualData.projectData].every(v => !v);
  useEffect(() => {
    if (!annualData || annualEmpty) { annualCompareChart.destroy(); return; }
    const { labels, fixedData, lifeData, projectData } = annualData;
    annualCompareChart.create({
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '固定支出', data: fixedData,   backgroundColor: teal() + 'CC', borderColor: teal(), borderWidth: 1, borderRadius: 4 },
          { label: '生活費',   data: lifeData,    backgroundColor: '#C17B2ECC', borderColor: '#C17B2E', borderWidth: 1, borderRadius: 4 },
          { label: '專案支出', data: projectData, backgroundColor: '#8B5CF6CC', borderColor: '#8B5CF6', borderWidth: 1, borderRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: tc(), boxWidth: 12, padding: 14 } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmtNT(ctx.raw)}`,
              footer: tooltipItems => {
                let sum = 0;
                tooltipItems.forEach(x => { sum += x.raw; });
                return '總消費: NT$ ' + sum.toLocaleString();
              }
            }
          }
        },
        scales: { x: xScale({ stacked: true }), y: yScale({ stacked: true }) },
      }
    });
  }, [annualData, annualEmpty, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // 月對月：生活費較上月
  const mom = (() => {
    const [y, m] = ym.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevYm = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
    const currLife = getLifeExpForMonth(lifeExpenses, ym);
    const prevLife = getLifeExpForMonth(lifeExpenses, prevYm);
    if (!prevLife) return null;
    const delta = currLife - prevLife;
    return { delta, pct: Math.round(Math.abs(delta / prevLife) * 100), up: delta > 0 };
  })();

  const loadingBox = (h) => <div className="an-chart-wait" style={{ height: h }} aria-hidden="true" />;

  return (
    <div className="tab-content an-page">
      {/* 月份切換列 */}
      <div className="an-toolbar">
        <div className="an-month" role="group" aria-label="選擇月份">
          <button type="button" className="an-month-step" onClick={() => changeMonth(-1)} aria-label="上個月"><i className="fa-solid fa-chevron-left"></i></button>
          <input type="month" className="an-month-input" id="analysisGlobalMonth" value={ym} onChange={e => e.target.value && setYm(e.target.value)} aria-label="月份" />
          <button type="button" className="an-month-step" onClick={() => changeMonth(1)} aria-label="下個月"><i className="fa-solid fa-chevron-right"></i></button>
        </div>
        <button type="button" className="an-today" onClick={() => setYm(initYm)} disabled={isThisMonth} title="回到本月">
          <i className="fa-solid fa-calendar-day" aria-hidden="true"></i> 本月
        </button>
        {mom && (
          <div className={`an-mom ${mom.up ? 'is-up' : 'is-down'}`}>
            <i className={`fa-solid fa-arrow-trend-${mom.up ? 'up' : 'down'}`} aria-hidden="true"></i>
            生活費較上月 {mom.up ? '+' : '-'}{mom.pct}%（{mom.up ? '+' : '-'}NT$ {Math.abs(Math.round(mom.delta)).toLocaleString()}）
          </div>
        )}
      </div>

      <div className="an-dual">
        {/* 訂閱分類 */}
        <section className="an-card">
          <div className="an-card-head">
            <h3><i className="fa-solid fa-circle-dot" aria-hidden="true"></i>訂閱分類分析</h3>
            <div className="an-controls">
              <Seg options={PERIODS} value={chartType} onChange={setChartType} label="統計期間" />
              {chartType === 'year' && (
                <select id="chartYearSelect" className="an-select" aria-label="年度" value={chartYear} onChange={e => setChartYear(Number(e.target.value))}>
                  {chartYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                </select>
              )}
              <Seg options={SHAPES} value={chartShape} onChange={setChartShape} label="圖表類型" className="an-seg-icon" />
            </div>
          </div>
          {!expData ? loadingBox(300) : expEmpty ? (
            <ChartEmpty icon="fa-solid fa-chart-pie" title={chartType === 'year' ? `${chartYear} 年沒有固定支出` : '這個月沒有固定支出'}
              hint="在「固定」分頁新增訂閱或帳單後，這裡會依分類拆解。" />
          ) : (
            <>
              <div className="an-chart" style={{ height: 300 }}><canvas ref={expChartRef}></canvas></div>
              <ul id="expenseChartList" className="an-list">
                {expData.details.map((di, i) => (
                  <li key={i}>
                    <i style={{ background: di.color }} aria-hidden="true"></i>
                    <span className="an-list-name">{di.name}</span>
                    <span className="an-list-amt">{fmtNT(di.cost)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 生活費分類 */}
        <section className="an-card">
          <div className="an-card-head">
            <h3><i className="fa-solid fa-bars" aria-hidden="true"></i>生活費分類分析</h3>
          </div>
          {lifeEmpty ? (
            <ChartEmpty icon="fa-solid fa-wallet" title="這個月還沒有生活費支出" hint="在「生活」分頁記帳後，這裡會顯示各分類花費。" />
          ) : (
            <>
              <div className="an-chart is-clickable" style={{ height: 300 }}><canvas ref={lifeCatRef}></canvas></div>
              <p className="an-note">
                <i className="fa-solid fa-hand-pointer" aria-hidden="true"></i>
                點擊長條，可跳轉至生活費分頁並篩選該分類明細
              </p>
            </>
          )}
        </section>
      </div>

      {/* 收支趨勢 */}
      <section className="an-card">
        <div className="an-card-head">
          <h3><i className="fa-solid fa-chart-line" aria-hidden="true"></i>收支趨勢</h3>
          <div className="an-controls">
            <Seg options={RANGES} value={trendRange} onChange={setTrendRange} label="期間" className="an-seg-range" />
          </div>
        </div>
        {!trendData ? loadingBox(260) : trendEmpty ? (
          <ChartEmpty icon="fa-solid fa-chart-line" title={`近 ${trendRange} 個月沒有支出紀錄`} hint="有固定支出或生活費後，就能看到每月變化。" />
        ) : (
          <div className="an-chart" style={{ height: 260 }}><canvas ref={trendRef}></canvas></div>
        )}
      </section>

      {/* 年度消費對比 */}
      <section className="an-card">
        <div className="an-card-head">
          <h3><i className="fa-solid fa-chart-bar" aria-hidden="true"></i>年度消費對比</h3>
        </div>
        {!annualData ? loadingBox(280) : annualEmpty ? (
          <ChartEmpty icon="fa-solid fa-chart-column" title="還沒有年度消費資料" hint="固定支出、生活費與專案支出會依年份加總在這裡。" />
        ) : (
          <>
            <div className="an-chart" style={{ height: 280 }}><canvas ref={annualCompareRef}></canvas></div>
            <div className="an-table-wrap">
              <table className="an-table">
                <caption>金額單位：NT$</caption>
                <thead>
                  <tr>
                    <th scope="col">年份</th>
                    <th scope="col" className="num">固定</th>
                    <th scope="col" className="num">生活</th>
                    <th scope="col" className="num">專案</th>
                    <th scope="col" className="num">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {annualRows.map(r => (
                    <tr key={r.year}>
                      <th scope="row">{r.year}</th>
                      <td className="num">{Math.round(r.fixed).toLocaleString()}</td>
                      <td className="num">{Math.round(r.life).toLocaleString()}</td>
                      <td className="num">{Math.round(r.project).toLocaleString()}</td>
                      <td className="num is-total">{Math.round(r.total).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
