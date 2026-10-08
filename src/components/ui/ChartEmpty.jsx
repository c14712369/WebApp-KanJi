// 圖表無資料時的空狀態：不畫空座標軸，改一句提示
export default function ChartEmpty({ icon = 'fa-solid fa-chart-simple', title = '還沒有資料', hint }) {
  return (
    <div className="chart-empty" role="status">
      <i className={icon} aria-hidden="true"></i>
      <span className="chart-empty-title">{title}</span>
      {hint && <span className="chart-empty-hint">{hint}</span>}
    </div>
  );
}
