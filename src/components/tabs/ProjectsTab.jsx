import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { showToast, formatAmount, autoFocusDesktop, confirmDialog } from '../../lib/utils';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { motion, AnimatePresence } from 'framer-motion';

const vibrate = () => { if (navigator.vibrate) navigator.vibrate(50); };

// ── Project Modal（底部面板：名稱整寬；預算＋狀態、兩個日期各併一列）──────────────
function ProjectModal({ initial, onClose, onSave }) {
  const [name,      setName]      = useState(initial?.name      || '');
  const [budget,    setBudget]    = useState(initial?.budget    || '');
  const [startDate, setStartDate] = useState(initial?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate,   setEndDate]   = useState(initial?.endDate   || '');
  const [status,    setStatus]    = useState(initial?.status    || 'active');
  const isEdit = !!initial?.id;

  const handleSave = (e) => {
    e?.preventDefault();
    if (!name.trim()) { showToast('請填寫專案名稱', 'error'); return; }
    onSave({ id: initial?.id || crypto.randomUUID(), name: name.trim(), budget: parseFloat(budget) || 0, startDate, endDate, status, createdAt: initial?.createdAt || new Date().toISOString() });
  };

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fx-item-modal pj-modal" role="dialog" aria-modal="true" aria-labelledby="projectModalTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="projectModalTitle">{isEdit ? '編輯企劃專案' : '新增企劃專案'}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <form className="fx-item-form" onSubmit={handleSave} noValidate>
          <div className="fx-item-body">
            <div className="form-group">
              <label className="form-label" htmlFor="pjName">專案名稱</label>
              <input id="pjName" className="form-input" autoFocus={autoFocusDesktop} value={name} onChange={e => setName(e.target.value)} placeholder="旅遊、活動…" />
            </div>
            <div className="fx-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="pjBudget">預算（NT$）</label>
                <input id="pjBudget" className="form-input" type="number" inputMode="decimal" min="0" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pjStatus">狀態</label>
                <select id="pjStatus" className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="active">進行中</option>
                  <option value="ended">已結束</option>
                </select>
              </div>
            </div>
            <div className="fx-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="pjStart">出發／目標日</label>
                <input id="pjStart" className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pjEnd">結束日（選填）</label>
                <input id="pjEnd" className="form-input" type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="fx-item-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary fx-submit">
              <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '建立'}
            </button>
          </div>
        </form>
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
    vibrate();
    onAddExp({ id: crypto.randomUUID(), projectId: project.id, categoryId: expCatId, name: expName.trim(), amount: parseFloat(expAmt), date: expDate, createdAt: new Date().toISOString() });
    setExpName(''); setExpAmt('');
  };

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fx-item-modal pj-modal" role="dialog" aria-modal="true" aria-labelledby="projectDetailTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="projectDetailTitle" className="pj-detail-title">{project.name}<span>專案明細</span></h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <div className="fx-item-body">
          {/* Budget summary */}
          <div className="pj-sum">
            <div className="pj-sum-row">
              <span className="pj-sum-label">已花費</span>
              <span className="pj-sum-label">總預算 NT$ <AnimatedNumber value={Number(project.budget) || 0} /></span>
            </div>
            <div className="pj-sum-amt" id="detailProjectSpent">NT$ <AnimatedNumber value={spent} /></div>
            <div className="pj-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <span id="detailProjectProgress" className={pct >= 100 ? 'is-over' : ''} style={{ width: pct + '%' }}></span>
            </div>
            <div className="pj-sum-row">
              <span id="detailProjectPct" className="pj-sum-label">支出 <AnimatedNumber value={Math.round((spent / (project.budget || 1)) * 100)} />%</span>
              <span id="detailProjectRemain" className={`pj-remain${rem < 0 ? ' is-over' : ''}`}>剩餘 NT$ <AnimatedNumber value={rem} /></span>
            </div>
          </div>

          {/* Add expense form */}
          <div className="pj-add">
            <div className="pj-add-title">新增明細</div>
            <div className="pj-add-grid">
              <input className="form-input pj-add-name" aria-label="項目名稱" placeholder="項目名稱…" value={expName} onChange={e => setExpName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddExp()} />
              <input className="form-input" aria-label="金額" type="number" inputMode="decimal" placeholder="金額" min="0" value={expAmt} onChange={e => setExpAmt(e.target.value)} />
              <select className="form-select" id="projectExpCat" aria-label="分類" value={expCatId} onChange={e => setExpCatId(e.target.value)}>
                {projectCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="form-input" type="date" id="projectExpDate" aria-label="日期" value={expDate} onChange={e => setExpDate(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary pj-add-btn" onClick={handleAddExp}>
              <i className="fa-solid fa-plus"></i> 加入明細
            </button>
          </div>

          {/* Expense list */}
          <div id="projectDetailExpList" className="pj-exp-list">
            {exps.length === 0
              ? <div className="pj-exp-empty">尚無明細支出</div>
              : exps.map(e => {
                  const cat = projectCategories.find(c => c.id === e.categoryId);
                  return (
                    <div key={e.id} className="pj-exp-row">
                      <div className="pj-exp-main">
                        <div className="pj-exp-name">{e.name}</div>
                        <div className="pj-exp-meta">
                          {cat && <span style={{ color: cat.color }}><i className="fa-solid fa-circle" aria-hidden="true"></i>{cat.name}</span>}
                          <span>{e.date}</span>
                        </div>
                      </div>
                      <span className="pj-exp-amt">NT$ {(Number(e.amount) || 0).toLocaleString()}</span>
                      <button type="button" className="icon-btn delete pj-icon-btn" aria-label={`刪除 ${e.name}`} title="刪除"
                        onClick={async () => { if (await confirmDialog({ title: '刪除明細', message: '確定要刪除這筆支出嗎？', confirmText: '刪除' })) { vibrate(); onDeleteExp(e.id); } }}>
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: 'all',    label: '全部' },
  { value: 'active', label: '進行中' },
  { value: 'ended',  label: '已結束' },
];

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

  const counts = {
    all: projects.length,
    active: projects.filter(p => (p.status || 'active') === 'active').length,
    ended: projects.filter(p => (p.status || 'active') === 'ended').length,
  };

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
  const monthlyTotal = savingsItems.reduce((s, x) => s + x.monthlySave, 0);

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

  const handleDeleteProject = async (id) => {
    if (!await confirmDialog({ title: '刪除專案', message: '確定要刪除此專案嗎？\n相關的支出明細也會一併刪除，此動作無法復原。', confirmText: '刪除' })) return;
    vibrate();
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

  const openNew = () => { vibrate(); setProjModal({}); };
  const openDetail = (p) => { vibrate(); setDetailProj(p); };

  return (
    <div className="tab-content pj-page">
      {/* 專案預備金：每月應存是主角 */}
      {savingsItems.length > 0 && (
        <section className="fx-hero pj-hero" aria-label="專案預備金總覽">
          <div className="fx-hero-top">
            <div>
              <div className="fx-hero-label">專案預備金・每月應存</div>
              <div className="fx-hero-amount">NT$ <AnimatedNumber value={monthlyTotal} effect="scroll" /></div>
            </div>
            <div className="fx-hero-side">
              <span>{savingsItems.length} 個專案待存</span>
            </div>
          </div>
          <ul className="pj-save-list">
            <AnimatePresence initial={false}>
              {savingsItems.map(s => (
                <motion.li key={s.id} layout="position"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}>
                  <div className="pj-save-main">
                    <span className="pj-save-name">{s.name}</span>
                    <span className="pj-save-meta">{s.infoText}・<span className="pj-nowrap">缺口 NT$ <AnimatedNumber value={s.remain} effect="scroll" /></span></span>
                  </div>
                  <span className="pj-save-amt">NT$ <AnimatedNumber value={s.monthlySave} effect="scroll" /><small>／月</small></span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {/* 工具列：狀態篩選（新增改由 FAB 與空狀態 CTA 負責） */}
      {projects.length > 0 && (
        <div className="fx-toolbar pj-toolbar">
          <div className="fx-seg" role="radiogroup" aria-label="專案狀態" id="projectStatusFilter">
            {STATUS_FILTERS.map(o => (
              <button key={o.value} type="button" role="radio" aria-checked={filter === o.value}
                className={`fx-seg-btn${filter === o.value ? ' is-active' : ''}`} onClick={() => setFilter(o.value)}>
                {o.label}<span className="fx-seg-count">{counts[o.value]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project grid */}
      {projects.length === 0 ? (
        <div className="fx-empty pj-empty">
          <span className="fx-empty-icon" aria-hidden="true"><i className="fa-solid fa-plane-departure"></i></span>
          <strong>還沒有企劃專案</strong>
          <p>旅遊、婚禮、換手機……設好預算與日期，就會算出每月該存多少。</p>
          <button type="button" className="btn btn-primary" onClick={openNew}><i className="fa-solid fa-plus"></i> 新增第一個專案</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="fx-empty pj-empty">
          <strong>這個篩選下沒有專案</strong>
          <button type="button" className="fx-link" onClick={() => setFilter('all')}>顯示全部</button>
        </div>
      ) : (
        <div id="projectList" className="pj-grid">
          <AnimatePresence mode="popLayout">
            {filtered.map((p, idx) => {
              const exps  = projectExpenses.filter(e => e.projectId === p.id);
              const spent = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
              const rem   = (Number(p.budget) || 0) - spent;
              const pct   = p.budget > 0 ? Math.min(100, (spent / p.budget) * 100) : 0;
              const ended = p.status === 'ended';
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className={`pj-card${ended ? ' is-ended' : ''}`}
                  role="button" tabIndex={0} aria-label={`${p.name}，查看明細`}
                  onClick={() => openDetail(p)}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(p); } }}
                >
                  <div className="pj-card-head">
                    <div className="pj-card-title">
                      <span className="pj-card-name">{p.name}</span>
                      <span className={`pj-badge${ended ? ' is-ended' : ''}`}>{ended ? '已結束' : '進行中'}</span>
                    </div>
                    <div className="pj-card-actions" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                      <button type="button" className="icon-btn pj-icon-btn" title="編輯" aria-label={`編輯 ${p.name}`} onClick={() => { vibrate(); setProjModal(p); }}><i className="fa-solid fa-pen"></i></button>
                      <button type="button" className="icon-btn delete pj-icon-btn" title="刪除" aria-label={`刪除 ${p.name}`} onClick={() => handleDeleteProject(p.id)}><i className="fa-solid fa-trash-can"></i></button>
                    </div>
                  </div>
                  <div className="pj-card-date">
                    <i className="fa-regular fa-calendar" aria-hidden="true"></i>
                    {p.startDate}{p.endDate ? ` ~ ${p.endDate}` : ''}
                  </div>
                  <div className="pj-card-money">
                    <div>
                      <div className="pj-card-label">已花費</div>
                      <div className="pj-card-spent">NT$ <AnimatedNumber value={spent} /></div>
                    </div>
                    <div className="pj-card-budget">
                      <div className="pj-card-label">總預算</div>
                      <div>NT$ <AnimatedNumber value={Number(p.budget) || 0} /></div>
                    </div>
                  </div>
                  <div className="pj-bar" role="progressbar" aria-label="預算使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                    <span className={pct >= 100 ? 'is-over' : ''} style={{ width: pct + '%' }}></span>
                  </div>
                  <div className="pj-card-foot">
                    <span>{Math.round(pct)}%</span>
                    <span className={`pj-remain${rem < 0 ? ' is-over' : ''}`}>剩餘 NT$ <AnimatedNumber value={rem} /></span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* FAB：本頁唯一的「新增」入口（與固定支出頁一致） */}
      <button className="fab" onClick={openNew} aria-label="新增企劃專案">
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
