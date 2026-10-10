'use client';

// Planning, the Budget section: one row with the month (a dropdown all
// three tabs share) and the Budget / Payments / History tabs as icons. The page has no header of
// its own — the app bar carries the current tab's action (Edit / Plan new
// payment / Add transaction), swapping as the tab changes.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CalendarPlus, ChevronRight, History, Plus, SlidersHorizontal, Wallet } from 'lucide-react';
import { useAppBarAction } from '@/src/shared/appBar/appBarAction';
import { useLogic, type PlanningTab } from '@/src/logic/planning/useLogic';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { BudgetTab } from '@/src/phone/screens/Planning/BudgetTab';
import { PaymentsTab } from '@/src/phone/screens/Planning/PaymentsTab';
import { HistoryTab } from '@/src/phone/screens/Planning/HistoryTab';
import styles from '@/src/phone/screens/Planning/Planning.module.css';
import tabStyles from '@/src/phone/screens/Planning/PlanningTabs.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';
import { MonthPicker } from '@/src/phone/screens/Planning/MinimalParts';

const TABS: { id: PlanningTab; label: string; icon: typeof Wallet }[] = [
  { id: 'budget', label: 'Budget', icon: Wallet },
  { id: 'payments', label: 'Payments', icon: CalendarDays },
  { id: 'history', label: 'History', icon: History },
];

export function PlanningScreen({ defaultTab = 'budget' }: { defaultTab?: PlanningTab }) {
  const router = useRouter();
  const { tab, setTab, month, setMonth, bucketFilter, setBucketFilter, categoryFilter, clearFilters, data } =
    useLogic(defaultTab);
  const [planPicker, setPlanPicker] = useState(false);
  const [year, monthNum] = month.split('-').map(Number);

  useAppBarAction(
    tab === 'budget'
      ? { key: 'planning-budget', label: 'Edit budget', icon: SlidersHorizontal, href: '/baskets' }
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
      {/* One row: the month (a dropdown) on the left, the tabs as icons on the right. */}
      <div className={m.headerRow}>
        <MonthPicker month={month} onMonth={setMonth} />

        <div className={m.iconTabs} role="tablist" aria-label="Planning">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-label={t.label} title={t.label} onClick={() => setTab(t.id)}>
              <t.icon size={18} strokeWidth={2.25} aria-hidden />
              {tab === t.id && <span>{t.label}</span>}
            </button>
          ))}
        </div>
      </div>

      <ScreenState loading={data.loading} />

      {!data.loading && (
        <div key={tab} className={tabStyles.fade}>
          {tab === 'budget' && <BudgetTab month={month} data={data} onOpenPayments={() => setTab('payments')} />}
          {tab === 'payments' && <PaymentsTab month={month} data={data} onMonth={setMonth} bucket={bucketFilter} setBucket={setBucketFilter} />}
          {tab === 'history' && <HistoryTab month={month} data={data} bucket={bucketFilter} category={categoryFilter} onClearFilters={clearFilters} />}
        </div>
      )}

      {planPicker && (
        <Modal title="Plan a payment in…" onClose={() => setPlanPicker(false)}>
          <p className={tabStyles.sheetHint}>A payment is a basket item with a due date. Pick its basket.</p>
          <div className={tabStyles.sheetList}>
            {data.buckets
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <button key={b.id} type="button" onClick={() => router.push(`/add-basket-item/${b.id}`)}>
                  {b.name}
                  <ChevronRight size={16} strokeWidth={2} aria-hidden />
                </button>
              ))}
            <button type="button" onClick={() => router.push('/baskets/new')}>
              <span className={tabStyles.sheetNew}>
                <Plus size={15} strokeWidth={2.5} aria-hidden /> New basket
              </span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
