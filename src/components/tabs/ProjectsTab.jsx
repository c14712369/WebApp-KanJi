import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { showToast, formatAmount, autoFocusDesktop } from '../../lib/utils';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';

// ── Project Modal ─────────────────────────────────────────────────────────────
function ProjectModal({ initial, onClose, onSave }) {
  const [name,      setName]      = useState(initial?.name      || '');
  const [budget,    setBudget]    = useState(initial?.budget    || '');
  const [startDate, setStartDate] = useState(initial?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate,   setEndDate]   = useState(initial?.endDate   || '');
  const [status,    setStatus]    = useState(initial?.status    || 'active');
  const isEdit = !!initial?.id;

  const handleSave = () => {
    if (!name.trim()) { showToast('請填寫專案名稱', 'error'); return; }
    onSave({ id: initial?.id || crypto.randomUUID(), name: name.trim(), budget: parseFloat(budget) || 0, startDate, endDate, status, createdAt: initial?.createdAt || new Date().toISOString() });
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }} onPointerDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="projectModalTitle">{isEdit ? '編輯企劃專案' : '新增企劃專案'}</h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="form-group">
          <label className="form-label">專案名稱</label>
          <input className="form-input" autoFocus={autoFocusDesktop} value={name} onChange={e => setName(e.target.value)} placeholder="旅遊、活動…" />
        </div>
        <div className="form-group">
          <label className="form-label">預算（NT$）</label>
          <input className="form-input" type="number" inputMode="decimal" min="0" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">出發 / 目標日期</label>
          <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">結束日期（選填）</label>
          <input className="form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">狀態</label>
          <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="active">進行中</option>
            <option value="ended">已結束</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '建立'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Detail Modal ──────────────────────────────────────────────────────
function ProjectDetailModal({ project, projectExpenses, projectCategories, onClose, onAddExp, onDeleteExp }) {
  const [expName,   setExpName]   = useState('');
  const [expAmt,    setExpAmt]    = useState('');
  const [expDate,   setExpDate]   = useState(new Date().toISOString().split('T')[0]);
  const [expCatId,  setExpCatId]  = useState(projectCategories[0]?.id || '');

  const exps  = projectExpenses.filter(e => e.projectId === project.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const spent = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const rem   = (Number(project.budget) || 0) - spent;
  const pct   = project.budget > 0 ? Math.min(100, (spent / project.budget) * 100) : 0;

  const handleAddExp = () => {
    if (!expName.trim() || !(parseFloat(expAmt) > 0)) { showToast('請填寫名稱與金額', 'error'); return; }
    if (navigator.vibrate) navigator.vibrate(50);
    onAddExp({ id: crypto.randomUUID(), projectId: project.id, categoryId: expCatId, name: expName.trim(), amount: parseFloat(expAmt), date: expDate, createdAt: new Date().toISOString() });
    setExpName(''); setExpAmt('');
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }} onPointerDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="projectDetailTitle">{project.name} — 專案明細</h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        {/* Budget summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
          <span>已花費：<b id="detailProjectSpent" style={{ fontFamily: 'var(--font-serif)' }}>NT$ <AnimatedNumber value={spent} /></b></span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-serif)' }}>總預算：NT$ <AnimatedNumber value={Number(project.budget) || 0} /></span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: 4 }}>
          <div id="detailProjectProgress" style={{ height: '100%', borderRadius: 3, width: pct + '%', background: pct >= 100 ? 'var(--danger-color)' : 'var(--primary-color)', transition: 'width .3s' }}></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 16 }}>
          <span id="detailProjectPct" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-serif)' }}>支出 <AnimatedNumber value={Math.round((spent / (project.budget || 1)) * 100)} />%</span>
          <span id="detailProjectRemain" style={{ color: rem < 0 ? 'var(--danger-color)' : 'var(--text-color)', fontFamily: 'var(--font-serif)' }}>剩餘：NT$ <AnimatedNumber value={rem} /></span>
        </div>

        {/* Add expense form */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>新增明細</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6, marginBottom: 6 }}>
            <input className="form-input" placeholder="項目名稱…" value={expName} onChange={e => setExpName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddExp()} />
            <input className="form-input" type="number" inputMode="decimal" placeholder="金額" min="0" value={expAmt} onChange={e => setExpAmt(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
            <select className="form-select" id="projectExpCat" value={expCatId} onChange={e => setExpCatId(e.target.value)}>
              {projectCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="form-input" type="date" id="projectExpDate" value={expDate} onChange={e => setExpDate(e.target.value)} />
            <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={handleAddExp}>
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>

        {/* Expense list */}
        <div id="projectDetailExpList" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {exps.length === 0
            ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>尚無明細支出</div>
            : exps.map(e => {
                const cat = projectCategories.find(c => c.id === e.categoryId);
                return (
                  <div key={e.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="item-info">
                      <div className="item-name" style={{ fontWeight: 500, marginBottom: 4 }}>{e.name}</div>
                      <div className="item-tags" style={{ display: 'flex', gap: 6, fontSize: '0.78rem' }}>
                        {cat && <span className="tag" style={{ color: cat.color }}><i className="fa-solid fa-circle" style={{ fontSize: 7, marginRight: 3 }}></i>{cat.name}</span>}
                        <span className="tag" style={{ color: 'var(--text-muted)' }}><i className="fa-regular fa-calendar" style={{ marginRight: 3 }}></i>{e.date}</span>
                      </div>
                    </div>
                    <div className="item-cost" style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--danger-color)', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>NT$ {(Number(e.amount) || 0).toLocaleString()}</span>
                      <button className="icon-btn delete" onClick={() => { if (confirm('確定刪除？')) { if (navigator.vibrate) navigator.vibrate(50); onDeleteExp(e.id); } }} title="刪除">
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}

// ── Main ProjectsTab ──────────────────────────────────────────────────────────
export default function ProjectsTab() {
  const {
    projects, projectExpenses, projectCategories,
    setProjects, setProjectExpenses, setProjectCategories,
  } = useAppStore();

  const [filter,      setFilter]      = useState('all');
  const [projModal,   setProjModal]   = useState(null);  // null | {} (new) | project (edit)
  const [detailProj,  setDetailProj]  = useState(null);  // null | project

  const filtered = projects
    .filter(p => filter === 'all' || (p.status || 'active') === filter)
    .sort((a, b) => new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));

  // ── Savings recommendations ──
  const savingsItems = (() => {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth();
    return projects
      .filter(p => (p.status === 'active' || !p.status) && p.startDate)
      .map(p => {
        const exps = projectExpenses.filter(e => e.projectId === p.id);
        const spent = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const remain = (Number(p.budget) || 0) - spent;
        if (remain <= 0) return null;
        const d = new Date(p.startDate);
        const monthsLeft = (d.getFullYear() - curY) * 12 + (d.getMonth() - curM);
        const monthlySave = monthsLeft > 0 ? Math.ceil(remain / monthsLeft) : remain;
        const infoText = monthsLeft > 0 ? `距出發約 ${monthsLeft} 個月` : monthsLeft < 0 ? '已出發 / 進行中' : '當月出發';
        return { ...p, remain, monthlySave, infoText };
      })
      .filter(Boolean);
  })();

  const handleSaveProject = (data) => {
    const exists = projects.find(p => p.id === data.id);
    if (exists) {
      setProjects(projects.map(p => p.id === data.id ? data : p));
      showToast('專案已更新');
    } else {
      setProjects([...projects, data]);
      showToast('專案已建立');
    }
    setProjModal(null);
  };

  const handleDeleteProject = (id) => {
    if (!confirm('確定要刪除此專案嗎？相關的支出明細也會一併刪除。')) return;
    if (navigator.vibrate) navigator.vibrate(50);
    setProjects(projects.filter(p => p.id !== id));
    setProjectExpenses(projectExpenses.filter(e => e.projectId !== id));
    showToast('專案已刪除');
    if (detailProj?.id === id) setDetailProj(null);
  };

  const handleAddExp = (exp) => {
    setProjectExpenses([...projectExpenses, exp]);
    showToast('明細已新增');
    // refresh detail view
    if (detailProj) setDetailProj(projects.find(p => p.id === detailProj.id) || detailProj);
  };

  const handleDeleteExp = (expId) => {
    setProjectExpenses(projectExpenses.filter(e => e.id !== expId));
    showToast('已刪除');
  };

  return (
    <div className="tab-content">
      {/* Project Savings Recommendations */}
      {savingsItems.length > 0 && (
        <div className="chart-section" style={{ marginBottom: 28, background: 'transparent', border: 'none', padding: 0 }}>
          <div className="chart-header" style={{ marginBottom: 16 }}>
            <h3><i className="fa-solid fa-piggy-bank"></i> 專案預備金總覽 (每月應存)</h3>
          </div>
          <div className="items-grid">
            <AnimatePresence mode="popLayout">
              {savingsItems.map((s, idx) => (
                <motion.div 
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className="stat-card category-card" 
                  style={{ padding: 20 }}
                >
                  <div className="stat-title" style={{ marginBottom: 12, fontSize: '1.1rem', fontWeight: 'bold' }}>{s.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>{s.startDate} ({s.infoText})</div>
                  <div style={{ fontSize: '0.9rem', marginBottom: 12 }}>資金缺口：<b style={{ fontFamily: 'var(--font-serif)' }}>NT$ <AnimatedNumber value={s.remain} effect="scroll" /></b></div>
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '1.6rem', color: 'var(--primary-color)', fontWeight: 'bold', fontFamily: 'var(--font-serif)' }}>NT$ <AnimatedNumber value={s.monthlySave} effect="scroll" /></span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: 4 }}>/月</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 12px', alignItems: 'center' }}>
        <select className="form-select" id="projectStatusFilter" style={{ width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">全部</option>
          <option value="active">進行中</option>
          <option value="ended">已結束</option>
        </select>
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setProjModal({}); }}>
          <i className="fa-solid fa-plus"></i> 新增企劃專案
        </button>
      </div>

      {/* Project grid */}
      <div id="projectList" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, padding: '0 16px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            目前沒有專案。點擊上方「新增企劃專案」開始建立。
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((p, idx) => {
              const exps  = projectExpenses.filter(e => e.projectId === p.id);
              const spent = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
              const rem   = (Number(p.budget) || 0) - spent;
              const pct   = p.budget > 0 ? Math.min(100, (spent / p.budget) * 100) : 0;
              return (
                <motion.div 
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className="stat-card category-card" style={{ cursor: 'pointer', position: 'relative' }}
                  onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setDetailProj(p); }}
                >
                  {/* Actions (stop propagation) */}
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" title="編輯" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setProjModal(p); }}><i className="fa-solid fa-pen"></i></button>
                    <button className="icon-btn delete" title="刪除" onClick={() => handleDeleteProject(p.id)}><i className="fa-solid fa-trash-can"></i></button>
                  </div>
                  <div className="stat-title" style={{ marginBottom: 8, fontSize: '1.05rem', fontWeight: 'bold', paddingRight: 60 }}>
                    {p.name}
                    <span className={`status-badge${p.status === 'ended' ? ' ended' : ''}`} style={{ marginLeft: 8 }}>{p.status === 'ended' ? '已結束' : '進行中'}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                    {p.startDate}{p.endDate ? ` ~ ${p.endDate}` : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.88rem' }}>
                    <span>已花費：<b style={{ fontFamily: 'var(--font-serif)' }}>NT$ <AnimatedNumber value={spent} /></b></span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-serif)' }}>總預算：NT$ <AnimatedNumber value={Number(p.budget) || 0} /></span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: 4 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: pct + '%', background: pct >= 100 ? 'var(--danger-color)' : 'var(--primary-color)' }}></div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.78rem', color: rem < 0 ? 'var(--danger-color)' : 'var(--text-muted)', fontFamily: 'var(--font-serif)' }}>
                    剩餘：NT$ <AnimatedNumber value={rem} />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setProjModal({}); }}>
        <i className="fa-solid fa-plus"></i>
      </button>

      {/* Modals */}
      {projModal !== null && (
        <ProjectModal
          initial={projModal.id ? projModal : null}
          onClose={() => setProjModal(null)}
          onSave={handleSaveProject}
        />
      )}
      {detailProj && (
        <ProjectDetailModal
          project={detailProj}
          projectExpenses={projectExpenses}
          projectCategories={projectCategories}
          onClose={() => setDetailProj(null)}
          onAddExp={handleAddExp}
          onDeleteExp={handleDeleteExp}
        />
      )}
    </div>
  );
}
