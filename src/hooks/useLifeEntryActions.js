import { useAppStore } from '../store/appStore';
import { showToast, confirmDialog } from '../lib/utils';
import { isImportedId } from '../lib/syncMerge';

/**
 * 明細的存檔與刪除：生活頁、旅程頁共用，規則只寫一份
 * （自動薪資改過金額/分類要做記號、刷卡匯入改分類要學起來）。
 * 一律從 getState() 取最新資料，不怕元件裡的舊快照。
 */
export function useLifeEntryActions() {
  /** 存一筆（新增或更新）。viewYm：目前看的月份，新增到別的月時 toast 會講是幾月 */
  const saveEntry = (entry, { viewYm } = {}) => {
    const {
      lifeExpenses, lifeCategories,
      addLifeExpense, updateLifeExpense, learnLifeCategory,
    } = useAppStore.getState();
    const prev = entry.id && lifeExpenses.find(e => e.id === entry.id);

    if (prev) {
      // 手動改過金額/分類的自動薪資做記號，之後改薪資設定時不覆蓋
      const salaryManual = (prev._autoSalary || prev._salaryDefault)
        && (Number(entry.amount) !== Number(prev.amount) || entry.categoryId !== prev.categoryId)
        ? { _salaryManual: true } : {};
      updateLifeExpense(entry.id, { ...entry, ...salaryManual });
      // 刷卡匯入列改分類 → 記住這家店，同店其他「其他」一起改，之後匯入自動套用
      if (isImportedId(prev.id) && entry.type !== 'income' && prev.categoryId !== entry.categoryId) {
        const n = learnLifeCategory(entry.id, entry.categoryId);
        const catName = lifeCategories.find(c => c.id === entry.categoryId)?.name || '';
        showToast(n > 0 ? `已更新，同店另外 ${n} 筆也改成「${catName}」` : `已更新，之後這家店自動歸「${catName}」`);
      } else {
        showToast('已更新');
      }
      return;
    }

    addLifeExpense(entry);
    const entryYm = (entry.date || '').slice(0, 7);
    showToast(!viewYm || entryYm === viewYm ? '已儲存' : `已儲存到 ${Number(entryYm.slice(5, 7))} 月`);
  };

  /** 刪一筆；回傳是否真的刪了，讓編輯視窗決定要不要關閉 */
  const deleteEntry = async (id) => {
    if (!await confirmDialog({ title: '刪除明細', message: '確定要刪除這筆紀錄嗎？此動作無法復原。', confirmText: '刪除' })) return false;
    if (navigator.vibrate) navigator.vibrate(50);
    useAppStore.getState().deleteLifeExpense(id);
    showToast('已刪除');
    return true;
  };

  return { saveEntry, deleteEntry };
}
