import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { TABS } from '../../lib/constants';
import AuthModal from './AuthModal';
import { applyStoredIdentity } from './IdentityModal';
import SettingsModal from './SettingsModal';

export default function Header() {
  const { activeTab, setActiveTab, isPrivacyMode, togglePrivacy, currentUser, isSyncing, syncStatus } = useAppStore();
  const syncFailed = !!currentUser && !isSyncing && syncStatus.state === 'error';
  const settingsLabel = isSyncing ? '設定，資料同步中' : syncFailed ? '設定，雲端同步失敗' : !currentUser ? '設定，尚未登入' : '設定';
  const [showAuth, setShowAuth]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { applyStoredIdentity(); }, []);

  const openSettings = () => { if (navigator.vibrate) navigator.vibrate(20); setShowSettings(true); };

  return (
    <>
      {/* 桌面：左側固定側欄（品牌、分頁、設定），主畫面不再被頂部 header 吃掉高度 */}
      <aside className="app-sidebar" aria-label="主選單">
        <div className="sidebar-brand">
          <span className="sidebar-logo"><i className="fa-solid fa-vault"></i></span>
          <div className="sidebar-brand-text">
            <span className="sidebar-name">Kakei</span>
            <span className="sidebar-tagline">固定支出與日常生活費</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-link${activeTab === tab.id ? ' active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              title={tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={tab.icon}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {currentUser && <span className="sidebar-email" title={currentUser.email}>{currentUser.email}</span>}
          <div className="sidebar-actions">
            <button className="sidebar-icon-btn" onClick={togglePrivacy} title={isPrivacyMode ? '顯示收入' : '隱藏收入'}>
              <i className={`fa-solid ${isPrivacyMode ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
            <button className="sidebar-icon-btn" onClick={openSettings} title="設定">
              <i className="fa-solid fa-gear"></i>
            </button>
            {isSyncing && <i className="fa-solid fa-rotate fa-spin sidebar-sync" title="同步中"></i>}
          </div>
          {/* 登出收進「設定」；未登入時才在側欄露出登入入口 */}
          {!currentUser && (
            <button className="sidebar-auth-btn" onClick={() => setShowAuth(true)} title="登入 / 註冊">
              <i className="fa-solid fa-user"></i><span>登入 / 註冊</span>
            </button>
          )}
        </div>
      </aside>

      {/* 手機/平板：單列頁首（參考 MOZE）—— 左隱藏收入、中間標題/月份、右設定；分頁切換交給 BottomNav。
          中間的 #mobileHeaderSlot 由生活費頁把月份切換列 portal 進來，其他分頁顯示分頁名稱。
          登入入口收在「設定 → 帳號」。 */}
      <header className="mobile-header">
        <button
          type="button"
          className="icon-btn header-side-btn"
          onClick={() => { if (navigator.vibrate) navigator.vibrate(20); togglePrivacy(); }}
          title={isPrivacyMode ? '顯示收入' : '隱藏收入'}
          aria-label={isPrivacyMode ? '顯示收入' : '隱藏收入'}
          aria-pressed={isPrivacyMode}
        >
          <i className={`fa-solid ${isPrivacyMode ? 'fa-eye-slash' : 'fa-eye'}`} id="privacyIcon" aria-hidden="true"></i>
        </button>

        <div className="header-center">
          {activeTab !== 'life' && (
            <h1 className="header-tab-title">{TABS.find(t => t.id === activeTab)?.label || 'Kakei'}</h1>
          )}
          <div id="mobileHeaderSlot" className="header-slot"></div>
        </div>

        <button
          type="button"
          className={`icon-btn header-side-btn${isSyncing ? ' is-syncing' : ''}`}
          onClick={openSettings}
          title={settingsLabel}
          aria-label={settingsLabel}
        >
          <i className={`fa-solid ${isSyncing ? 'fa-rotate fa-spin' : 'fa-gear'}`} aria-hidden="true"></i>
          {!currentUser && <span className="header-badge" aria-hidden="true"></span>}
          {syncFailed && <span className="header-badge is-error" aria-hidden="true"></span>}
        </button>
      </header>

      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onLogin={() => setShowAuth(true)} />}
    </>
  );
}
