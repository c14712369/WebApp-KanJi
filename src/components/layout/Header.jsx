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

  return (
    <>
      <header>
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
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} id="authUserUid">UID: {currentUser.id}</span>
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
          <button className="btn btn-outline btn-sm" id="authLoginBtn"
            onClick={() => currentUser ? handleLogout() : setShowAuth(true)}>
            {currentUser
              ? <><i className="fa-solid fa-right-from-bracket"></i> 登出</>
              : <><i className="fa-solid fa-user"></i> 登入 / 註冊</>}
          </button>
        </div>
      </header>

      <nav className="tabs-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)} />}
      {showIdentity && <IdentityModal onClose={() => setShowIdentity(false)} />}
    </>
  );
}
