// 分頁懶載入時的骨架屏：模擬卡片 + 列表，避免切換分頁出現空白閃爍。
export default function TabSkeleton() {
  return (
    <div className="tab-content" aria-busy="true" aria-label="載入中">
      <div className="skel-card skel-shimmer" style={{ height: 132, marginBottom: 20 }} />
      <div className="skel-card" style={{ padding: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="skel-row">
            <div className="skel-shimmer" style={{ width: 38, height: 38, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skel-shimmer" style={{ width: '55%', height: 12, borderRadius: 6 }} />
              <div className="skel-shimmer" style={{ width: '32%', height: 10, borderRadius: 6 }} />
            </div>
            <div className="skel-shimmer" style={{ width: 64, height: 16, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
