import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { TABS } from '../../lib/constants';
import AuthModal from './AuthModal';
import { applyStoredIdentity } from './IdentityModal';
import SettingsModal from './SettingsModal';

export default function Header() {
  const { activeTab, setActiveTab, isPrivacyMode, togglePrivacy, currentUser, isSyncing } = useAppStore();
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
            <button className="sidebar-icon-btn" onClick={togglePrivacy} title={isPrivacyMode ? '顯示金額' : '隱藏金額'}>
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

      {/* 手機/平板：沿用原本頂部 header，分頁切換交給 BottomNav */}
      <header className="mobile-header">
        <div className="header-title">
          <h1>
            <i className="fa-solid fa-vault title-icon"></i>
            <span id="appDisplayName">Kakei</span>
          </h1>
          <span className="subtitle">記錄每一筆固定支出與日常生活費</span>
        </div>

        <div className="header-controls">
          <div className="header-controls-top">
            {currentUser && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.85rem' }}>
                <span id="authUserEmail" style={{ fontWeight: 600 }}>{currentUser.email}</span>
              </div>
            )}
            <div className="header-icons">
              {isSyncing && <i className="fa-solid fa-rotate fa-spin" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}></i>}
              <button className="icon-btn" onClick={togglePrivacy} title={isPrivacyMode ? '顯示金額' : '隱藏金額'}>
                <i className={`fa-solid ${isPrivacyMode ? 'fa-eye-slash' : 'fa-eye'}`} id="privacyIcon"></i>
              </button>
              <button className="icon-btn" onClick={openSettings} title="設定" aria-label="設定">
                <i className="fa-solid fa-gear"></i>
              </button>
            </div>
          </div>
          {!currentUser && (
            <button className="btn btn-outline btn-sm" id="authLoginBtn" onClick={() => setShowAuth(true)}>
              <i className="fa-solid fa-user"></i> 登入 / 註冊
            </button>
          )}
        </div>
      </header>

      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onLogin={() => setShowAuth(true)} />}
    </>
  );
}
