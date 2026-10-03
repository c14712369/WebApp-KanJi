import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { TABS } from '../../lib/constants';
import { supabase } from '../../lib/supabaseClient';
import AuthModal from './AuthModal';
import IdentityModal, { applyStoredIdentity } from './IdentityModal';

export default function Header() {
  const { activeTab, setActiveTab, isPrivacyMode, togglePrivacy, theme, setTheme, currentUser, isSyncing } = useAppStore();
  const [showAuth, setShowAuth]         = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);

  useEffect(() => { applyStoredIdentity(); }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleAuthClick = () => currentUser ? handleLogout() : setShowAuth(true);

  return (
    <>
      {/* 桌面：左側固定側欄（品牌、分頁、設定），主畫面不再被頂部 header 吃掉高度 */}
      <aside className="app-sidebar" aria-label="主選單">
        <div className="sidebar-brand">
          <span className="sidebar-logo"><i className="fa-solid fa-vault"></i></span>
          <div className="sidebar-brand-text">
            <span className="sidebar-name">Kanji</span>
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
            <button className="sidebar-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="切換主題">
              <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            <button className="sidebar-icon-btn" onClick={() => setShowIdentity(true)} title="系統設置">
              <i className="fa-solid fa-palette"></i>
            </button>
            {isSyncing && <i className="fa-solid fa-rotate fa-spin sidebar-sync" title="同步中"></i>}
          </div>
          <button className="sidebar-auth-btn" onClick={handleAuthClick} title={currentUser ? '登出' : '登入 / 註冊'}>
            {currentUser
              ? <><i className="fa-solid fa-right-from-bracket"></i><span>登出</span></>
              : <><i className="fa-solid fa-user"></i><span>登入 / 註冊</span></>}
          </button>
        </div>
      </aside>

      {/* 手機/平板：沿用原本頂部 header，分頁切換交給 BottomNav */}
      <header className="mobile-header">
        <div className="header-title">
          <h1>
            <i className="fa-solid fa-vault title-icon"></i>
            <span id="appDisplayName">Kanji</span>
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
              <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="切換主題">
                <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} id="themeIcon"></i>
              </button>
              <button className="icon-btn" onClick={() => setShowIdentity(true)} title="系統設置" style={{ fontSize: '1.2rem' }}>
                <i className="fa-solid fa-palette"></i>
              </button>
            </div>
          </div>
          <button className="btn btn-outline btn-sm" id="authLoginBtn" onClick={handleAuthClick}>
            {currentUser
              ? <><i className="fa-solid fa-right-from-bracket"></i> 登出</>
              : <><i className="fa-solid fa-user"></i> 登入 / 註冊</>}
          </button>
        </div>
      </header>

      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)} />}
      {showIdentity && <IdentityModal onClose={() => setShowIdentity(false)} />}
    </>
  );
}
