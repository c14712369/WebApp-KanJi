import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '../../store/appStore';
import { formatAmount, prefetchFXRates, calculateExpenseForMonth } from '../../lib/utils';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';
import ChartEmpty from '../ui/ChartEmpty';
import { projectExpensesByMonth, projectExpenseYears, nearestYear } from '../../lib/projectSpend';

Chart.register(...registerables);

// 圖表文字/格線色取自 tokens，亮暗模式一致
function chartColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k, fb) => cs.getPropertyValue(k).trim() || fb;
  return { text: v('--text-muted', '#4D687D'), grid: v('--border-color', '#B5C8D4'), card: v('--card-bg', '#fff') };
}

function getYears(items, lifeExpenses, projects, projectExpenses) {
  const years = new Set([String(new Date().getFullYear())]);
  items.forEach(i => { if (i.startDate) years.add(i.startDate.slice(0, 4)); if (i.endDate) years.add(i.endDate.slice(0, 4)); });
  lifeExpenses.forEach(e => { if (e.date) years.add(e.date.slice(0, 4)); });
  projectExpenseYears(projects, projectExpenses).forEach(y => years.add(y));
  return Array.from(years).sort().reverse();
}

export default function AnnualTab() {
  const { items, lifeExpenses, projects, projectExpenses, estimatedIncome, theme } = useAppStore();
  const thisYear = String(new Date().getFullYear());
  const years = useMemo(() => getYears(items, lifeExpenses, projects, projectExpenses), [items, lifeExpenses, projects, projectExpenses]);
  const [pickedYear, setYear] = useState(thisYear);
  // 選中年份的資料被刪光而從清單消失時，落到最接近的年份，下拉才不會顯示錯年份
  const year = nearestYear(years, pickedYear, thisYear);
  useEffect(() => { if (year !== pickedYear) setYear(year); }, [year, pickedYear]);

  const barRef   = useRef(null);
  const pieRef   = useRef(null);
  const barChart = useRef(null);
  const pieChart = useRef(null);

  const [totals,  setTotals]  = useState({ income: 0, expense: 0, balance: 0 });
  const [monthly, setMonthly] = useState([]);

  const compute = useCallback(async (isAlive = () => true) => {
    const yearInt = parseInt(year);
    const pairs   = Array.from({ length: 12 }, (_, i) => [yearInt, i + 1]);
    await prefetchFXRates(items, pairs);
    if (!isAlive()) return;
    const projByMonth = projectExpensesByMonth(projects, projectExpenses, yearInt);

    let totalIncome = 0, totalFixed = 0, totalLife = 0, totalProject = 0;
    const md = Array.from({ length: 12 }, () => ({ income: 0, fixed: 0, life: 0, project: 0, balance: 0 }));
    const estInc = parseFloat(estimatedIncome) || 0;

    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      let fixedExp = 0;
      for (const item of items) fixedExp += calculateExpenseForMonth(item, yearInt, m);
      md[m - 1].fixed = Math.round(fixedExp);
      totalFixed += Math.round(fixedExp);

      let lifeExp = 0, lifeInc = 0;
      lifeExpenses.forEach(e => {
        if (!(e.date || '').startsWith(ym)) return;
        if (e.type === 'income') lifeInc += Number(e.amount) || 0;
        else lifeExp += Number(e.amount) || 0;
      });
      md[m - 1].life = lifeExp;
      totalLife += lifeExp;

      const finalInc = lifeInc > 0 ? lifeInc : estInc;
      md[m - 1].income = finalInc;
      totalIncome += finalInc;

      const projExp = projByMonth[m - 1];
      md[m - 1].project = projExp;
      totalProject += projExp;

      md[m - 1].balance = finalInc - (md[m - 1].fixed + lifeExp + projExp);
    }

    const totalExp = totalFixed + totalLife + totalProject;
    setTotals({ income: totalIncome, expense: totalExp, balance: totalIncome - totalExp });
    setMonthly(md);
  }, [year, items, lifeExpenses, projects, projectExpenses, estimatedIncome]);

  useEffect(() => {
    let alive = true;
    compute(() => alive);
    return () => { alive = false; };
  }, [compute]);

  const hasLine = monthly.some(d => d.income || d.fixed || d.life || d.project);
  const expenseSum = monthly.reduce((s, d) => s + d.fixed + d.life + d.project, 0);
  const hasPie  = expenseSum > 0;

  // ── Line Chart ──（全年皆 0 時不畫空座標軸，改顯示 ChartEmpty；canvas 卸載前先 destroy）
  useEffect(() => {
    if (!hasLine || !barRef.current) { barChart.current?.destroy(); barChart.current = null; return; }
    const { text: textColor, grid: gridColor } = chartColors();
    const labels    = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

    barChart.current?.destroy();
    barChart.current = new Chart(barRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '收入',     data: monthly.map(d => d.income),  borderColor: '#3D7A5A', backgroundColor: '#3D7A5A18', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
          { label: '固定支出', data: monthly.map(d => d.fixed),   borderColor: '#2A6475', backgroundColor: '#2A647518', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
          { label: '生活花費', data: monthly.map(d => d.life),    borderColor: '#C17B2E', backgroundColor: '#C17B2E18', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
          { label: '企劃支出', data: monthly.map(d => d.project), borderColor: '#8b5cf6', backgroundColor: '#8b5cf618', borderWidth: 2, pointRadius: 4, tension: 0.3, fill: true },
          { label: '總結餘',   data: monthly.map(d => d.balance), borderColor: '#10b981', backgroundColor: '#10b98118', borderWidth: 3, pointRadius: 5, tension: 0.3, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true, boxWidth: 8, padding: 14 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: NT$ ${Math.round(ctx.raw).toLocaleString()}` } },
        },
        scales: {
          x: { ticks: { color: textColor, maxRotation: 0 }, grid: { display: false } },
          // 從 0 起算；結餘為負時 beginAtZero 仍會往下延伸，不會裁掉負值
          y: { beginAtZero: true, ticks: { color: textColor, callback: v => 'NT$' + v.toLocaleString() }, grid: { color: gridColor } },
        },
      },
    });
  }, [monthly, hasLine, theme]);

  // ── Pie Chart ──
  useEffect(() => {
    if (!hasPie || !pieRef.current) { pieChart.current?.destroy(); pieChart.current = null; return; }
    const { text: textColor, card: cardColor } = chartColors();
    const totalFixed   = monthly.reduce((s, d) => s + d.fixed,   0);
    const totalLife    = monthly.reduce((s, d) => s + d.life,    0);
    const totalProject = monthly.reduce((s, d) => s + d.project, 0);

    pieChart.current?.destroy();
    pieChart.current = new Chart(pieRef.current, {
      type: 'doughnut',
      data: {
        labels: ['固定支出', '生活花費', '企劃支出'],
        datasets: [{ data: [totalFixed, totalLife, totalProject], backgroundColor: ['#2A6475', '#C17B2E', '#8b5cf6'], borderWidth: 2, borderColor: cardColor }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 20, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                return ` NT$ ${ctx.raw.toLocaleString()} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }, [monthly, hasPie, theme]);

  // cleanup on unmount
  useEffect(() => () => { barChart.current?.destroy(); pieChart.current?.destroy(); }, []);

  const prevYear = () => { const i = years.indexOf(year); if (i < years.length - 1) setYear(years[i + 1]); };
  const nextYear = () => { const i = years.indexOf(year); if (i > 0) setYear(years[i - 1]); };

  const yearIdx = years.indexOf(year);
  const ready   = monthly.length > 0;
  const neg     = totals.balance < 0;

  return (
    <div className="tab-content ar-page">
      {/* 年份切換（不設頁面大標，靠底部導覽辨識） */}
      <div className="ar-yearbar">
        <button type="button" className="ar-year-btn" onClick={prevYear} disabled={yearIdx >= years.length - 1} aria-label="上一年" title="上一年"><i className="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <select id="annualReportYear" className="ar-year-select" value={year} onChange={e => setYear(e.target.value)} aria-label="選擇年份">
          {years.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <button type="button" className="ar-year-btn" onClick={nextYear} disabled={yearIdx <= 0} aria-label="下一年" title="下一年"><i className="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>

      {/* 年度總計：一列 3 格 */}
      <section className="ar-summary" aria-label={`${year} 年度總計`}>
        <AnimatePresence mode="popLayout">
          <motion.div key="annual-income" className="ar-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="ar-stat-label">總收入</div>
            <div className="ar-stat-value is-pos" id="annualTotalIncome">
              <span className="ar-cur">NT$</span><span className="ar-num"><AnimatedNumber value={Math.round(totals.income)} format={v => formatAmount(v, 'income')} /></span>
            </div>
          </motion.div>
          <motion.div key="annual-expense" className="ar-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <div className="ar-stat-label">總支出</div>
            <div className="ar-stat-value is-neg" id="annualTotalExpense">
              <span className="ar-cur">NT$</span><span className="ar-num"><AnimatedNumber value={Math.round(totals.expense)} /></span>
            </div>
          </motion.div>
          <motion.div key="annual-balance" className="ar-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="ar-stat-label">總結餘</div>
            <div className={`ar-stat-value ${neg ? 'is-neg' : 'is-pos'}`} id="annualTotalBalance">
              <span className="ar-cur">{neg ? '−NT$' : 'NT$'}</span><span className="ar-num"><AnimatedNumber value={Math.abs(Math.round(totals.balance))} format={v => formatAmount(v, 'income')} /></span>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Line chart */}
      <div className="chart-section ar-card">
        <div className="ar-card-head">
          <h3><i className="fa-solid fa-chart-line" aria-hidden="true"></i> 各月收支</h3>
        </div>
        {ready && !hasLine
          ? <ChartEmpty icon="fa-solid fa-chart-line" title={`${year} 年還沒有收支`} hint="記一筆生活費或固定支出後，這裡會畫出每月走勢" />
          : (
            <div className="chart-container ar-chart-line">
              <div id="annualReportChartInner" style={{ height: '100%', width: '100%' }}>
                {ready && <canvas ref={barRef}></canvas>}
              </div>
            </div>
          )}
      </div>

      {/* Pie chart */}
      <div className="chart-section ar-card">
        <div className="ar-card-head">
          <h3><i className="fa-solid fa-chart-pie" aria-hidden="true"></i> 支出分佈</h3>
        </div>
        {ready && !hasPie
          ? <ChartEmpty icon="fa-solid fa-chart-pie" title={`${year} 年還沒有支出`} hint="有支出後會依固定、生活、企劃三類顯示占比" />
          : (
            <div className="chart-container ar-chart-pie">
              {ready && <canvas ref={pieRef}></canvas>}
            </div>
          )}
      </div>
    </div>
  );
}
