import { useAppStore } from '../../store/appStore';
import { TABS } from '../../lib/constants';

// 中間「＋」左右各兩個分頁（參考圖的版型）
const LEFT_TABS = TABS.slice(0, 2);
const RIGHT_TABS = TABS.slice(2);

export default function BottomNav() {
  const { activeTab, setActiveTab, setPendingAdd } = useAppStore();

  const handleTabClick = (id) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setActiveTab(id);
  };

  // 在固定支出頁 → 新增固定支出；其他頁一律「記一筆生活費」（必要時先切到生活頁）
  const handleAdd = () => {
    if (navigator.vibrate) navigator.vibrate(30);
    if (activeTab === 'fixed') {
      setPendingAdd('fixed');
      return;
    }
    if (activeTab !== 'life') setActiveTab('life');
    setPendingAdd('life');
  };

  const addLabel = activeTab === 'fixed' ? '新增固定支出' : '記一筆生活費';

  const renderTab = (tab) => (
    <button
      key={tab.id}
      type="button"
      className={`nav-item${activeTab === tab.id ? ' active' : ''}`}
      aria-current={activeTab === tab.id ? 'page' : undefined}
      onClick={() => handleTabClick(tab.id)}
    >
      <i className={tab.icon} aria-hidden="true"></i>
      <span>{tab.mobileLabel}</span>
    </button>
  );

  return (
    <nav className="bottom-nav" aria-label="主選單">
      {LEFT_TABS.map(renderTab)}
      <div className="nav-add-slot">
        <button type="button" className="nav-add-btn" onClick={handleAdd} aria-label={addLabel} title={addLabel}>
          <i className="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>
      {RIGHT_TABS.map(renderTab)}
    </nav>
  );
}
