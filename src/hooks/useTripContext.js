import { useAppStore } from '../store/appStore';
import { getTripContext } from '../lib/trips';

/** 取得目前明細與旅程例外名單組成的歸屬判斷 ctx（參照不變時回傳同一個物件） */
export function useTripContext() {
  const lifeExpenses = useAppStore(s => s.lifeExpenses);
  const tripExcludeMerchants = useAppStore(s => s.tripExcludeMerchants);
  return getTripContext(lifeExpenses, tripExcludeMerchants);
}
