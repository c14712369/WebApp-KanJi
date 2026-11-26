import { useAppStore } from '../store/appStore';
import { NO_TRIP } from '../lib/trips';
import { exclusionNames, exclusionLabel } from '../lib/tripActions';
import { showToast } from '../lib/utils';

/** 旅程明細相關操作：待確認判定、移到日常後提示設為例外商家 */
export function useTripActions() {
  const offerExclusion = (entry) => {
    const names = exclusionNames(entry);
    if (!names.length) return;
    const label = exclusionLabel(entry) || names[0];
    showToast(`已移到日常。以後「${label}」在旅程期間也都算日常？`, 'success', {
      actionLabel: '好',
      onAction: () => {
        const { setTripExclusion } = useAppStore.getState();
        names.forEach(n => setTripExclusion(n, true));
      },
    });
  };

  const decide = (entry, trip, decision) => {
    if (!entry?.id) return;
    if (navigator.vibrate) navigator.vibrate(20);
    const { updateLifeExpense } = useAppStore.getState();
    if (decision === 'trip') {
      if (!trip?.id) return;
      updateLifeExpense(entry.id, { tripId: trip.id });
    } else if (decision === 'daily') {
      updateLifeExpense(entry.id, { tripId: NO_TRIP });
      offerExclusion(entry);
    }
  };

  return { offerExclusion, decide };
}
