import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { supabase } from '../../lib/supabaseClient';
import { showToast } from '../../lib/utils';
import CategoryManageModal from '../modals/CategoryManageModal';
import IdentityModal from './IdentityModal';
import { APP_VERSION, useAppUpdate, checkForUpdate, applyUpdate } from '../../lib/appUpdate';

const VERSION_HINT = {
  idle: '檢查中…',
  checking: '檢查中…',
  latest: '已是最新版本',
  outdated: '有新版本可用',
  error: '無法檢查，請稍後再試',
};

// iOS 分組列表的一列：圖示 + 標題（+ 副標）+ 右側附件
function Row({ icon, iconBg, label, hint, accessory, onClick, danger, ...aria }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`settings-row${danger ? ' is-danger' : ''}`} onClick={onClick} {...aria}>
      {icon && (
        <span className="settings-row-icon" style={{ background: iconBg }} aria-hidden="true">
          <i className={`fa-solid ${icon}`}></i>
        </span>
      )}
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </span>
      {accessory}
    </Tag>
  );
}

const Chevron = <i className="fa-solid fa-chevron-right settings-row-chevron" aria-hidden="true"></i>;

export default function SettingsModal({ onClose, onLogin }) {
  const {
    theme, setTheme, currentUser,
    lifeCategories, setLifeCategories,
    categories, setCategories, setItems,
  } = useAppStore();
  // 子畫面：null = 設定列表；關閉子畫面回到列表（像 iOS 的 push / back）
  const [sub, setSub] = useState(null);
  const updateStatus = useAppUpdate(s => s.status);
  const isOutdated = updateStatus === 'outdated';

  const vibrate = () => { if (navigator.vibrate) navigator.vibrate(20); };
  const open = (key) => { vibrate(); setSub(key); };
  const back = () => setSub(null);

  // 固定支出分類被刪除時，原本屬於它的項目改歸「其他」（沿用 FixedTab 原邏輯）。
  // 讀最新 store 而非 render 閉包：刪除確認框開著時若雲端同步更新了 items，不能拿舊快照整份蓋回去。
  const saveFixedCategories = (cats) => {
    const cur = useAppStore.getState().items;
    const fallbackId = cats.some(c => c.id === 'cat_other') ? 'cat_other' : cats.at(-1)?.id;
    const reassigned = cur.map(i => cats.find(c => c.id === i.categoryId) || !fallbackId ? i : { ...i, categoryId: fallbackId });
    if (reassigned.some((item, idx) => item !== cur[idx])) setItems(reassigned);
    setCategories(cats);
    showToast('分類已儲存');
  };

  const handleLogout = async () => {
    vibrate();
    onClose();
    await supabase.auth.signOut();
  };

  if (sub === 'life') {
    return <CategoryManageModal title="生活支出分類" categories={lifeCategories} type="expense" onClose={back} onSave={setLifeCategories} />;
  }
  if (sub === 'fixed') {
    return <CategoryManageModal title="固定支出分類" categories={categories} type="expense" onClose={back} onSave={saveFixedCategories} />;
  }
  if (sub === 'identity') {
    return <IdentityModal onClose={back} />;
  }

  const isDark = theme === 'dark';

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div className="settings-grabber" aria-hidden="true"></div>
        <div className="settings-head">
          <h2 id="settingsTitle">設定</h2>
          <button type="button" className="settings-done" onClick={onClose}>完成</button>
        </div>

        <div className="settings-group-label">分類</div>
        <div className="settings-group">
          <Row icon="fa-leaf" iconBg="#5B8C5A" label="生活支出分類" hint={`${lifeCategories.length} 個分類`} accessory={Chevron} onClick={() => open('life')} />
          <Row icon="fa-money-bill-wave" iconBg="#C17B2E" label="固定支出分類" hint={`${categories.length} 個分類`} accessory={Chevron} onClick={() => open('fixed')} />
        </div>

        <div className="settings-group-label">外觀</div>
        <div className="settings-group">
          <Row
            icon="fa-moon" iconBg="#4B5A7A" label="深色模式"
            onClick={() => { vibrate(); setTheme(isDark ? 'light' : 'dark'); }}
            role="switch" aria-checked={isDark}
            accessory={<span className={`settings-switch${isDark ? ' is-on' : ''}`} aria-hidden="true"><span /></span>}
          />
          <Row icon="fa-palette" iconBg="#8A5A9E" label="主題色與 App 圖示" hint="含雲端同步診斷" accessory={Chevron} onClick={() => open('identity')} />
        </div>

        <div className="settings-group-label">帳號</div>
        <div className="settings-group">
          {currentUser ? (
            <>
              <Row icon="fa-user" iconBg="#6B7A8F" label={currentUser.email} hint="已登入，資料自動同步" />
              <Row label="登出" danger onClick={handleLogout} />
            </>
          ) : (
            <Row icon="fa-user" iconBg="#6B7A8F" label="登入 / 註冊" hint="登入後資料可跨裝置同步" accessory={Chevron} onClick={() => { vibrate(); onClose(); onLogin(); }} />
          )}
        </div>

        <div className="settings-group-label">關於</div>
        <div className="settings-group">
          <Row
            icon="fa-circle-info" iconBg="#526D82"
            label={<>Kakei <span className="settings-version-code">{APP_VERSION}</span></>}
            hint={VERSION_HINT[updateStatus]}
            onClick={() => { vibrate(); isOutdated ? applyUpdate() : checkForUpdate(); }}
            accessory={
              <span className={`settings-version-btn${isOutdated ? ' is-update' : ''}`}>
                <i className={`fa-solid fa-rotate${updateStatus === 'checking' ? ' fa-spin' : ''}`} aria-hidden="true"></i>
                {isOutdated ? '立即更新' : '檢查更新'}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}
