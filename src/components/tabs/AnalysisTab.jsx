import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '../../store/appStore';
import { calculateExpenseForMonth, prefetchFXRates, showToast } from '../../lib/utils';

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

function getUniqueYears(items, lifeExpenses, projects) {
  const years = new Set([new Date().getFullYear()]);
  items.forEach(i => {
    if (i.startDate) years.add(new Date(i.startDate).getFullYear());
    if (i.endDate) years.add(new Date(i.endDate).getFullYear());
  });
  lifeExpenses.forEach(e => {
    if (e.date) years.add(new Date(e.date).getFullYear());
  });
  if (projects) {
    projects.forEach(p => (p.expenses || []).forEach(e => { if (e.date) years.add(new Date(e.date).getFullYear()); }));
  }
  return Array.from(years).sort();
}

// ── Chart hook ───────────────────────────────────────────────────────────────
function useChart(ref) {
  const inst = useRef(null);
  const destroy = useCallback(() => { inst.current?.destroy(); inst.current = null; }, []);
  const create  = useCallback((config) => {
    if (!ref.current) return;
    destroy();
    inst.current = new Chart(ref.current, config);
  }, [ref, destroy]);
  useEffect(() => () => destroy(), [destroy]);
  return { create, destroy };
}

// ── Main AnalysisTab ──────────────────────────────────────────────────────────
export default function AnalysisTab() {
  const {
    items, categories, lifeExpenses, lifeCategories,
    setActiveTab, setLifeCurrentMonth, setLifePendingCatId,
    projects
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
  const uniqueYears = useMemo(() => getUniqueYears(items, lifeExpenses, projects), [items, lifeExpenses, projects]);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = () => isDark() ? '#F0EDE8' : '#1A1A1A';
  const gc = () => isDark() ? '#2D2B28' : '#E8E5E0';

  // ── Month navigation ──
  const changeMonth = (delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  };

  // ── Expense Chart ──
  const [expItemList, setExpItemList] = useState([]);
  const buildExpChart = useCallback(async () => {
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
    if (data.length > 0) {
      if (chartShape === 'pie') {
        expChart.create({ type: 'pie', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1 }] },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: tc() } }, title: { display: true, text: title, color: tc(), font: { size: 15 } } },
          },
        });
      } else {
        expChart.create({ type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: title, color: tc(), font: { size: 15 } },
              tooltip: { callbacks: { label: ctx => 'NT$ ' + Math.round(ctx.raw).toLocaleString() } },
            },
            scales: { y: { ticks: { color: tc(), callback: v => 'NT$' + v.toLocaleString() }, grid: { color: gc() } }, x: { ticks: { color: tc() }, grid: { display: false } } },
          },
        });
      }
    } else {
      expChart.destroy();
    }
    setExpItemList(details.sort((a, b) => b.cost - a.cost));
  }, [chartType, chartShape, chartYear, ym, items, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buildExpChart(); }, [buildExpChart]);

  // ── Life Category Chart ──
  const buildLifeCatChart = useCallback(() => {
    const labels = [], data = [], colors = [];
    lifeCategories.forEach(cat => {
      const s = lifeExpenses.filter(e => e.categoryId === cat.id && (e.date || '').startsWith(ym) && e.type !== 'income').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      if (s > 0) { labels.push(cat.name); data.push(s); colors.push(cat.color); }
    });
    if (data.length === 0) { lifeCatChart.destroy(); return; }
    lifeCatChart.create({
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: { callbacks: { label: ctx => 'NT$ ' + ctx.raw.toLocaleString() } },
        },
        scales: { y: { ticks: { color: tc(), callback: v => 'NT$' + v.toLocaleString() }, grid: { color: gc() } }, x: { ticks: { color: tc() }, grid: { display: false } } },
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
  }, [ym, lifeExpenses, lifeCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buildLifeCatChart(); }, [buildLifeCatChart]);

  // ── Trend Chart ──
  const buildTrendChart = useCallback(async () => {
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
    trendChart.create({
      type: 'line',
      data: { labels, datasets: [
        { label: '固定支出', data: subData,  borderColor: '#2A6475', backgroundColor: '#2A647518', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
        { label: '生活費',   data: lifeData, borderColor: '#C17B2E', backgroundColor: '#C17B2E18', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: tc(), boxWidth: 12, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': NT$ ' + ctx.raw.toLocaleString() } },
        },
        scales: { y: { ticks: { color: tc(), callback: v => 'NT$' + v.toLocaleString() }, grid: { color: gc() } }, x: { ticks: { color: tc() }, grid: { display: false } } },
      },
    });
  }, [trendRange, items, lifeExpenses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buildTrendChart(); }, [buildTrendChart]);

  const buildAnnualCompareChart = useCallback(async () => {
    if (!uniqueYears.length) { annualCompareChart.destroy(); return; }

    const pairs = [];
    uniqueYears.forEach(y => {
      for (let m = 1; m <= 12; m++) pairs.push([y, m]);
    });
    await prefetchFXRates(items, pairs);

    const fixedData = [];
    const lifeData = [];
    const projectData = [];

    uniqueYears.forEach(year => {
      let annualFixed = 0;
      for (let m = 1; m <= 12; m++) {
        for (const item of items) {
          annualFixed += calculateExpenseForMonth(item, year, m);
        }
      }
      fixedData.push(Math.round(annualFixed));

      const annualLife = lifeExpenses
        .filter(e => e.type !== 'income' && e.date && e.date.startsWith(String(year)))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      lifeData.push(annualLife);

      let annualProject = 0;
      if (projects) {
        projects.forEach(p => {
          (p.expenses || []).forEach(e => {
            if (e.date && e.date.startsWith(String(year))) {
              annualProject += Number(e.amount) || 0;
            }
          });
        });
      }
      projectData.push(annualProject);
    });

    const labels = uniqueYears.map(y => `${y} 年`);

    annualCompareChart.create({
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '固定支出', data: fixedData,   backgroundColor: '#2A6475CC', borderColor: '#2A6475', borderWidth: 1, borderRadius: 4 },
          { label: '生活費',   data: lifeData,    backgroundColor: '#C17B2ECC', borderColor: '#C17B2E', borderWidth: 1, borderRadius: 4 },
          { label: '專案支出', data: projectData, backgroundColor: '#8B5CF6CC', borderColor: '#8B5CF6', borderWidth: 1, borderRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: tc() } },
          title: { display: true, text: '年度消費總額對比', color: tc(), font: { size: 15 } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: NT$ ${Math.round(ctx.raw).toLocaleString()}`,
              footer: tooltipItems => {
                let sum = 0;
                tooltipItems.forEach(x => { sum += x.raw; });
                return '總消費: NT$ ' + sum.toLocaleString();
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: tc() }, grid: { display: false } },
          y: { stacked: true, ticks: { color: tc(), callback: v => 'NT$' + v.toLocaleString() }, grid: { color: gc() } }
        }
      }
    });
  }, [uniqueYears, items, lifeExpenses, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { buildAnnualCompareChart(); }, [buildAnnualCompareChart]);

  return (
    <div className="tab-content">
      {/* Header with title + month nav */}
      <div className="analysis-header" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 0 }}>
        <div className="analysis-title-group" style={{ alignItems: 'center' }}>
          <h2><i className="fa-solid fa-chart-pie" style={{ color: 'var(--primary-color)', marginRight: 8 }}></i>收支分析</h2>
          <div className="analysis-subtitle">月度固定支出、生活費與預算追蹤</div>
        </div>
        <div className="analysis-month-nav">
          <button className="icon-btn" onClick={() => changeMonth(-1)}><i className="fa-solid fa-chevron-left"></i></button>
          <input type="month" className="form-input" id="analysisGlobalMonth" value={ym} onChange={e => setYm(e.target.value)} />
          <button className="icon-btn" onClick={() => changeMonth(1)}><i className="fa-solid fa-chevron-right"></i></button>
        </div>
        {/* 月對月趨勢比較（固定高度，不影響下方容器） */}
        <div style={{ minHeight: '1.6rem', marginTop: 6 }}>
          {(() => {
            const [y, m] = ym.split('-').map(Number);
            const prev = new Date(y, m - 2, 1);
            const prevYm = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
            const currLife = getLifeExpForMonth(lifeExpenses, ym);
            const prevLife = getLifeExpForMonth(lifeExpenses, prevYm);
            if (!prevLife) return null;
            const delta = currLife - prevLife;
            const pct   = Math.round(Math.abs(delta / prevLife) * 100);
            const up    = delta > 0;
            return (
              <div style={{ fontSize: '0.8rem', color: up ? 'var(--danger-color)' : 'var(--success-color)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className={`fa-solid fa-arrow-trend-${up ? 'up' : 'down'}`}></i>
                生活費較上月 {up ? '+' : '-'}{pct}%（{up ? '+' : '-'}NT$ {Math.abs(Math.round(delta)).toLocaleString()}）
              </div>
            );
          })()}
        </div>
      </div>

      {/* Charts row: expense + life category side by side */}
      <div className="chart-dual">
        {/* Expense chart */}
        <div className="chart-section">
          <div className="chart-header">
            <div className="chart-header-title">
              <h3><i className="fa-solid fa-circle-dot"></i> 訂閱分類分析</h3>
            </div>
            <div className="chart-controls">
              <div className="type-toggle">
                <button id="chartShapePieBtn" className={`type-btn${chartShape === 'pie' ? ' active' : ''}`} onClick={() => setChartShape('pie')} title="圓餅圖"><i className="fa-solid fa-chart-pie"></i></button>
                <button id="chartShapeBarBtn" className={`type-btn${chartShape === 'bar' ? ' active' : ''}`} onClick={() => setChartShape('bar')} title="長條圖"><i className="fa-solid fa-chart-simple"></i></button>
              </div>
              <div style={{ width: 90, flexShrink: 0 }}>
                {chartType === 'year' && (
                  <select id="chartYearSelect" className="form-select chart-select" style={{ width: '100%', margin: 0 }} value={chartYear} onChange={e => setChartYear(Number(e.target.value))}>
                    {chartYears.map(y => <option key={y} value={y}>{y} 年</option>)}
                  </select>
                )}
              </div>
              <div className="type-toggle">
                <button id="chartTypeYearBtn" className={`type-btn${chartType === 'year'  ? ' active' : ''}`} onClick={() => setChartType('year')}>按年</button>
                <button id="chartTypeMonthBtn" className={`type-btn${chartType === 'month' ? ' active' : ''}`} onClick={() => setChartType('month')}>按月</button>
              </div>
            </div>
          </div>
          <div className="chart-container"><canvas ref={expChartRef}></canvas></div>
          <div id="expenseChartList" style={{ marginTop: 20, maxHeight: 250, overflowY: 'auto' }}>
            {expItemList.length === 0
              ? <div style={{ textAlign: 'center', padding: 10, color: 'var(--text-muted)' }}>本期無分類支出明細</div>
              : expItemList.map((di, i) => (
                  <div key={i} className="expense-list-row">
                    <div className="expense-list-info">
                      <div className="expense-list-color" style={{ backgroundColor: di.color }}></div>
                      <span style={{ fontWeight: 500 }}>{di.name}</span>
                    </div>
                    <div className="expense-list-amount">NT$ {Math.round(di.cost).toLocaleString()}</div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Life category chart */}
        <div className="chart-section">
          <div className="chart-header">
            <h3><i className="fa-solid fa-bars"></i> 生活費分類分析</h3>
          </div>
          <div className="chart-container" style={{ cursor: 'pointer' }}><canvas ref={lifeCatRef}></canvas></div>
          <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="fa-solid fa-hand-pointer" style={{ color: 'var(--primary-color)', opacity: 0.7 }}></i>
            點擊長條，可跳轉至生活費分頁並篩選該分類明細
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="chart-section">
        <div className="chart-header">
          <h3><i className="fa-solid fa-chart-line"></i> 收支趨勢</h3>
          <select className="form-select chart-select" id="trendRangeSelect" value={trendRange}
            onChange={e => setTrendRange(Number(e.target.value))}>
            <option value={3}>近 3 個月</option>
            <option value={6}>近 6 個月</option>
            <option value={12}>近 12 個月</option>
            <option value={24}>近 24 個月</option>
          </select>
        </div>
        <div className="chart-container" style={{ height: 260 }}><canvas ref={trendRef}></canvas></div>
      </div>

      {/* Annual Compare chart */}
      <div className="chart-section" style={{ marginTop: 24 }}>
        <div className="chart-header">
          <h3><i className="fa-solid fa-chart-bar"></i> 年度消費對比</h3>
        </div>
        <div className="chart-container" style={{ height: 280 }}><canvas ref={annualCompareRef}></canvas></div>
        <div style={{ marginTop: 20, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', color: 'var(--text-main)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>年份</th>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>固定支出</th>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>生活費</th>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>專案支出</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>總消費</th>
              </tr>
            </thead>
            <tbody>
              {uniqueYears.map((year) => {
                let annualFixed = 0;
                for (let m = 1; m <= 12; m++) {
                  for (const item of items) {
                    annualFixed += calculateExpenseForMonth(item, year, m);
                  }
                }
                const annualLife = lifeExpenses
                  .filter(e => e.type !== 'income' && e.date && e.date.startsWith(String(year)))
                  .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                
                let annualProject = 0;
                if (projects) {
                  projects.forEach(p => {
                    (p.expenses || []).forEach(e => {
                      if (e.date && e.date.startsWith(String(year))) {
                        annualProject += Number(e.amount) || 0;
                      }
                    });
                  });
                }
                const total = annualFixed + annualLife + annualProject;
                return (
                  <tr key={year} style={{ borderBottom: '1px solid var(--border-color)', opacity: 0.9 }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{year} 年</td>
                    <td style={{ padding: '10px 8px' }}>NT$ {Math.round(annualFixed).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px' }}>NT$ {Math.round(annualLife).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px' }}>NT$ {Math.round(annualProject).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'right', color: 'var(--primary-color)' }}>NT$ {Math.round(total).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
