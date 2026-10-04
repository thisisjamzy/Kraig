'use client';

// Planning — the Budget section: a month selector all three tabs share,
// then the Budget / Payments / History switcher. The page has no header of
// its own — the app bar carries the current tab's action (Edit / Plan new
// payment / Add transaction), swapping as the tab changes.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react';
import { useAppBarAction } from '@/src/shared/appBar/appBarAction';
import { useLogic, type PlanningTab } from '@/src/logic/planning/useLogic';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { monthCaption, monthTitle } from '@/src/viewmodels/planning';
import { BudgetTab } from '@/src/phone/screens/Planning/BudgetTab';
import { PaymentsTab } from '@/src/phone/screens/Planning/PaymentsTab';
import { HistoryTab } from '@/src/phone/screens/Planning/HistoryTab';
import styles from '@/src/phone/screens/Planning/Planning.module.css';
import tabStyles from '@/src/phone/screens/Planning/PlanningTabs.module.css';

const TABS: { id: PlanningTab; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'payments', label: 'Payments' },
  { id: 'history', label: 'History' },
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function PlanningScreen({ defaultTab = 'budget' }: { defaultTab?: PlanningTab }) {
  const router = useRouter();
  const { tab, setTab, month, setMonth, previousMonth, nextMonth, bucketFilter, setBucketFilter, categoryFilter, clearFilters, data } =
    useLogic(defaultTab);
  const [pickerYear, setPickerYear] = useState<number | null>(null);
  const [planPicker, setPlanPicker] = useState(false);
  const [year, monthNum] = month.split('-').map(Number);

  useAppBarAction(
    tab === 'budget'
      ? { key: 'planning-budget', label: 'Edit budget', icon: SlidersHorizontal, href: '/buckets' }
      : tab === 'payments'
        ? { key: 'planning-payments', label: 'Plan new payment', icon: CalendarPlus, onClick: () => setPlanPicker(true) }
        : {
            key: 'planning-history',
            label: 'Add transaction',
            icon: Plus,
            href: `/add-transaction?month=${monthNum - 1}&year=${year}`,
          }
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.srOnly}>Planning</h1>
      <div className={styles.monthRow}>
        <button type="button" className={styles.monthButton} onClick={previousMonth} aria-label="Previous month">
          <ChevronLeft size={20} strokeWidth={2.25} />
        </button>
        <button type="button" className={styles.monthCenter} onClick={() => setPickerYear(year)} aria-label="Choose month">
          <span className={styles.monthTitle}>{monthTitle(month)}</span>
          <span className={styles.monthCaption}>{monthCaption(month, new Date())}</span>
        </button>
        <button type="button" className={styles.monthButton} onClick={nextMonth} aria-label="Next month">
          <ChevronRight size={20} strokeWidth={2.25} />
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Planning">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <ScreenState loading={data.loading} />

      {!data.loading && (
        <div key={tab} className={tabStyles.fade}>
          {tab === 'budget' && <BudgetTab month={month} data={data} />}
          {tab === 'payments' && <PaymentsTab month={month} data={data} onMonth={setMonth} bucket={bucketFilter} setBucket={setBucketFilter} />}
          {tab === 'history' && <HistoryTab month={month} data={data} bucket={bucketFilter} category={categoryFilter} onClearFilters={clearFilters} />}
        </div>
      )}

      {pickerYear !== null && (
        <Modal title="Choose month" onClose={() => setPickerYear(null)}>
          <div className={tabStyles.yearRow}>
            <button type="button" className={styles.monthButton} onClick={() => setPickerYear(pickerYear - 1)} aria-label="Previous year">
              <ChevronLeft size={18} strokeWidth={2.25} />
            </button>
            <span className={tabStyles.yearValue}>{pickerYear}</span>
            <button type="button" className={styles.monthButton} onClick={() => setPickerYear(pickerYear + 1)} aria-label="Next year">
              <ChevronRight size={18} strokeWidth={2.25} />
            </button>
          </div>
          <div className={tabStyles.monthGrid}>
            {MONTH_SHORT.map((name, i) => {
              const key = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={key === month}
                  onClick={() => {
                    setMonth(key);
                    setPickerYear(null);
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {planPicker && (
        <Modal title="Plan a payment in…" onClose={() => setPlanPicker(false)}>
          <p className={tabStyles.sheetHint}>A payment is a bucket item with a due date. Pick its bucket.</p>
          <div className={tabStyles.sheetList}>
            {data.buckets
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <button key={b.id} type="button" onClick={() => router.push(`/add-bucket-item/${b.id}`)}>
                  {b.name}
                  <ChevronRight size={16} strokeWidth={2} aria-hidden />
                </button>
              ))}
            <button type="button" onClick={() => router.push('/buckets/new')}>
              <span className={tabStyles.sheetNew}>
                <Plus size={15} strokeWidth={2.5} aria-hidden /> New bucket
              </span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
