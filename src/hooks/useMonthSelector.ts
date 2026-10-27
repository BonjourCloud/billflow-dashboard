import { useMemo, useState } from 'react';
import { MonthKey, currentMonthKey, formatMonthLabel, isSameMonth, shiftMonth } from '@/lib/billMonth';

/** Month picker state shared by the Budget pages. Starts on the current month. */
export function useMonthSelector() {
  const [selected, setSelected] = useState<MonthKey>(() => currentMonthKey());

  return useMemo(
    () => ({
      selected,
      label: formatMonthLabel(selected),
      isCurrent: isSameMonth(selected, currentMonthKey()),
      prev: () => setSelected((m) => shiftMonth(m, -1)),
      next: () => setSelected((m) => shiftMonth(m, 1)),
      today: () => setSelected(currentMonthKey()),
    }),
    [selected],
  );
}
