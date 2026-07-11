import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { showToast } from '../../lib/utils';
import { APP_IDENTITY_KEY } from '../../lib/constants';
import { supabase } from '../../lib/supabaseClient';

const DEFAULT_COLOR = '#C17B2E';

function drawVaultPath(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = color;
  const p = new Path2D('M448 80c8.8 0 16 7.2 16 16V416c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V96c0-8.8 7.2-16 16-16H448zM0 96V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64C28.7 32 0 60.7 0 96zM192 256a64 64 0 1 0 128 0 64 64 0 1 0 -128 0zm64-32c17.7 0 32 14.3 32 32s-14.3 32-32 32s-32-14.3-32-32s14.3-32 32-32z');
  ctx.fill(p);
  ctx.restore();
}

function generateIconDataUrl(identity) {
  return new Promise((resolve) => {
    const SIZE = 192;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    if (identity.customIcon) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.beginPath();
        ctx.roundRect(0, 0, SIZE, SIZE, 40);
        ctx.clip();
        const scale = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = identity.customIcon;
    } else {
      ctx.clearRect(0, 0, SIZE, SIZE);
      drawVaultPath(ctx, SIZE / 2, SIZE / 2, 110, identity.themeColor || DEFAULT_COLOR);
      resolve(canvas.toDataURL('image/png'));
    }
  });
}

function applyIdentityToDOM(identity) {
  // Theme color meta
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', identity.themeColor || DEFAULT_COLOR);

  generateIconDataUrl(identity).then(dataUrl => {
    // Favicon + apple-touch-icon
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.href = dataUrl;
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) appleIcon.href = dataUrl;

    // Dynamic manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;
    fetch(manifestLink.href)
      .then(r => r.json())
      .then(manifest => {
        manifest.theme_color = identity.themeColor || DEFAULT_COLOR;
        manifest.icons = [
          { src: dataUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: dataUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ];
        const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        manifestLink.setAttribute('href', URL.createObjectURL(blob));
      })
      .catch(() => {});
  });
}

export function applyStoredIdentity() {
  const stored = localStorage.getItem(APP_IDENTITY_KEY);
  if (!stored) return;
  try { applyIdentityToDOM(JSON.parse(stored)); } catch {}
}

export default function IdentityModal({ onClose }) {
  const { 
    triggerSync, 
    currentUser, 
    lastLocalUpdate, 
    lifeExpenses, 
    items, 
    projects,
    loadFromCloud,
    setIsSyncing 
  } = useAppStore();

  const [diagnostics, setDiagnostics] = useState(null);
  const [checking, setChecking] = useState(false);

  const runDiagnostics = async () => {
    if (!currentUser) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('user_backups')
        .select('updated_at, app_data')
        .eq('user_id', currentUser.id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          setDiagnostics({ error: '雲端尚無此使用者的任何備份記錄' });
        } else {
          setDiagnostics({ error: error.message });
        }
      } else if (data) {
        const cloudData = data.app_data || {};
        const cloudCount = (cloudData.items?.length || 0) + (cloudData.lifeExpenses?.length || 0) + (cloudData.projects?.length || 0);
        setDiagnostics({
          cloudUpdatedAt: new Date(data.updated_at).toLocaleString(),
          cloudCount,
          cloudLifeCount: cloudData.lifeExpenses?.length || 0,
          cloudFixedCount: cloudData.items?.length || 0,
        });
      } else {
        setDiagnostics({ error: '無雲端備份記錄' });
      }
    } catch (e) {
      setDiagnostics({ error: e.message });
    } finally {
      setChecking(false);
    }
  };

  const handleForcePull = async () => {
    if (!currentUser) return;
    if (!window.confirm('確定要從雲端強制還原嗎？這會以雲端資料完全覆蓋本機目前的資料！')) return;
    
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('user_backups')
        .select('app_data')
        .eq('user_id', currentUser.id)
        .single();
      
      if (error) {
        showToast('強制還原失敗：' + error.message, 'error');
      } else if (data?.app_data) {
        loadFromCloud(data.app_data);
        showToast('已成功強制從雲端下載並還原帳本！', 'success');
        onClose();
      } else {
        showToast('雲端無備份資料可供還原', 'error');
      }
    } catch (e) {
      showToast('發生錯誤：' + e.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      runDiagnostics();
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(APP_IDENTITY_KEY)) || {}; } catch { return {}; }
  })();

  const [color, setColor]       = useState(stored.themeColor || DEFAULT_COLOR);
  const [customIcon, setCustomIcon] = useState(stored.customIcon || null);
  const fileRef = useRef(null);

  const preview = customIcon
    ? <img src={customIcon} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <i className="fa-solid fa-vault" style={{ fontSize: 40, color }}></i>;

  const handleColorChange = (e) => setColor(e.target.value);

  const handleIconUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { showToast('圖片太大 (限 500KB 以內)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCustomIcon(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleReset = () => { setColor(DEFAULT_COLOR); setCustomIcon(null); };

  const handleSave = () => {
    const identity = { themeColor: color, customIcon };
    localStorage.setItem(APP_IDENTITY_KEY, JSON.stringify(identity));
    applyIdentityToDOM(identity);
    if (typeof triggerSync === 'function') triggerSync();
    showToast('系統設置已儲存並套用');
    onClose();
  };

  return (
    <div className="modal-overlay active" id="identityModalOverlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <span>系統設置 / 應用程式個性化</span>
          <span className="close-modal" onClick={onClose}>&times;</span>
        </div>
        <div style={{ padding: '10px 0' }}>
          <div className="form-group">
            <label className="form-label">應用程式主題色 (PWA/網頁)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="color" className="form-input" value={color} onChange={handleColorChange}
                style={{ width: 50, height: 42, padding: 2, cursor: 'pointer' }} />
              <span id="identityColorValue" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{color.toUpperCase()}</span>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="form-label">應用程式圖示 (PWA/Favicon)</label>
            <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
              <div className="icon-preview-box" style={{ width: 80, height: 80, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                {preview}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  自定義您的標誌。您可以選擇顏色或上傳圖片。
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    <i className="fa-solid fa-upload"></i> 上傳圖片
                    <input type="file" ref={fileRef} hidden accept="image/*" onChange={handleIconUpload} />
                  </label>
                  <button className="btn btn-secondary btn-sm" onClick={handleReset}>重置</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: 12, background: 'rgba(193,123,46,0.1)', borderRadius: 8, border: '1px dashed var(--primary-color)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-color)', margin: 0 }}>
              💡 <strong>小提示：</strong> 更改圖示後，建議重新啟動或重新整理網頁。
            </p>
          </div>

          {currentUser && (
            <div className="form-group" style={{ marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
              <label className="form-label"><i className="fa-solid fa-cloud-arrow-down" style={{ marginRight: 6 }}></i>雲端同步診斷與強制還原</label>
              <div style={{ background: 'var(--bg-color)', padding: 12, borderRadius: 8, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>本地統計:</span>
                  <span style={{ fontWeight: 600 }}>生活費 {lifeExpenses.length} 筆 / 固定 {items.length} 筆</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>本地最後更新:</span>
                  <span style={{ fontWeight: 600 }}>{lastLocalUpdate > 0 ? new Date(lastLocalUpdate).toLocaleString() : '無記錄'}</span>
                </div>
                
                {checking ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 10 }}>
                    <i className="fa-solid fa-rotate fa-spin"></i> 正在獲取雲端備份狀態…
                  </div>
                ) : diagnostics ? (
                  <>
                    {diagnostics.error ? (
                      <div style={{ color: 'var(--error-color)', marginTop: 10, fontWeight: 600 }}>
                        ⚠️ 診斷提示：{diagnostics.error}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>雲端統計:</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>生活費 {diagnostics.cloudLifeCount} 筆 / 固定 {diagnostics.cloudFixedCount} 筆</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>雲端最後更新:</span>
                          <span style={{ fontWeight: 600 }}>{diagnostics.cloudUpdatedAt}</span>
                        </div>
                        
                        {diagnostics.cloudCount > 0 && (
                          <button 
                            className="btn btn-outline btn-sm" 
                            onClick={handleForcePull}
                            style={{ width: '100%', marginTop: 12, borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                          >
                            <i className="fa-solid fa-cloud-arrow-down"></i> 強制從雲端覆寫還原至地端
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 25 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> 儲存並套用系統設置
          </button>
        </div>
      </div>
    </div>
  );
}
