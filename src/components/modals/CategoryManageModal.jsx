import { useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import IconRenderer, { AVAILABLE_ICONS } from '../../lib/IconRenderer';
import { showToast, confirmDialog } from '../../lib/utils';

export default function CategoryManageModal({ categories, onSave, onClose, type = 'expense' }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8B5CF6');
  const [iconColor, setIconColor] = useState('#ffffff');
  const [icon, setIcon] = useState('Gamepad2');

  const handleEdit = (cat) => {
    setEditingId(cat.id);
    setName(cat.name);
    setColor(cat.color);
    setIconColor(cat.iconColor || '#ffffff');
    setIcon(cat.icon || 'Gamepad2');
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setColor('#8B5CF6');
    setIconColor('#ffffff');
    setIcon('Gamepad2');
  };

  const handleSave = () => {
    if (!name || !name.trim()) {
      showToast('請輸入分類名稱', 'error');
      return;
    }
    
    let newCategories = [...categories];
    if (editingId) {
      newCategories = newCategories.map(c => 
        c.id === editingId ? { ...c, name: name.trim(), color, iconColor, icon } : c
      );
      showToast('已更新分類');
    } else {
      const newCat = {
        id: `cat_${crypto.randomUUID().slice(0, 8)}`,
        name: name.trim(),
        color,
        iconColor,
        icon
      };
      newCategories = [...newCategories, newCat];
      showToast('已新增分類');
    }
    
    const catsToSave = [...newCategories];
    resetForm();
    onSave(catsToSave);
  };

  const handleDelete = async (id) => {
    if (!await confirmDialog({ title: '刪除分類', message: '確定要刪除此分類嗎？\n這可能會影響已使用此分類的紀錄。', confirmText: '刪除' })) return;
    const newCategories = categories.filter(c => c.id !== id);
    if (editingId === id) resetForm();
    onSave(newCategories);
    showToast('已刪除分類');
  };

  return (
    <div className="modal-overlay active" style={{ alignItems: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div 
        className="modal" 
        style={{ maxWidth: 400, margin: '0 auto', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3>分類管理 ({type === 'income' ? '收入' : '支出'})</h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: 4, flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label className="form-label">{editingId ? '編輯分類' : '新增分類'}</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="輸入名稱..." />
            </div>
            
            <div className="form-group">
              <label className="form-label">背景顏色</label>
              <input type="color" className="form-input" value={color} onChange={e => setColor(e.target.value)} style={{ height: 40, padding: 4 }} />
            </div>

            <div className="form-group">
              <label className="form-label">圖示顏色</label>
              <input type="color" className="form-input" value={iconColor} onChange={e => setIconColor(e.target.value)} style={{ height: 40, padding: 4 }} />
            </div>

            <div className="form-group">
              <label className="form-label">圖示</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, maxHeight: 150, overflowY: 'auto', padding: 8, background: 'var(--bg-color)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                {AVAILABLE_ICONS.map(iconName => (
                  <button
                    key={iconName}
                    onClick={() => setIcon(iconName)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: icon === iconName ? color : 'transparent',
                      color: icon === iconName ? iconColor : 'var(--text-main)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <IconRenderer name={iconName} size={20} color={icon === iconName ? iconColor : 'currentColor'} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>
                {editingId ? '更新' : '新增'}
              </button>
              {editingId && (
                <button className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }} onClick={resetForm}>
                  取消
                </button>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, paddingBottom: 16 }}>
            <label className="form-label">現有分類 (拖曳圖示排序)</label>
            <Reorder.Group axis="y" values={categories} onReorder={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
              {categories.map((cat) => (
                <CategoryItem key={cat.id} cat={cat} handleEdit={handleEdit} handleDelete={handleDelete} />
              ))}
            </Reorder.Group>
          </div>
        </div>

      </div>
    </div>
  );
}

function CategoryItem({ cat, handleEdit, handleDelete }) {
  const controls = useDragControls();

  return (
    <Reorder.Item 
      value={cat} 
      dragListener={false} 
      dragControls={controls}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-color)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', userSelect: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div 
          onPointerDown={(e) => controls.start(e)}
          style={{ touchAction: 'none', cursor: 'grab', padding: '4px' }}
        >
          <i className="fa-solid fa-grip-vertical" style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}></i>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.iconColor || '#fff' }}>
          {cat.icon ? <IconRenderer name={cat.icon} size={16} color={cat.iconColor || '#fff'} /> : <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.iconColor || '#fff' }} />}
        </div>
        <span style={{ fontWeight: 500 }}>{cat.name}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="icon-btn" onClick={() => handleEdit(cat)} style={{ width: 32, height: 32 }}><i className="fa-solid fa-pen" style={{ fontSize: '0.9rem' }}></i></button>
        <button className="icon-btn delete" onClick={() => handleDelete(cat.id)} style={{ width: 32, height: 32 }}><i className="fa-solid fa-trash" style={{ fontSize: '0.9rem' }}></i></button>
      </div>
    </Reorder.Item>
  );
}

