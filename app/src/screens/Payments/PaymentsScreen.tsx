'use client';

// Payments — every planned payment of a month on a calendar and as a list,
// as its own page (it used to be a tab of Planning): the page title, the
// month as a dropdown property, a New menu (Plan a debt repayment), then
// the payments.

import { useState } from 'react';
import { CalendarDays, ChevronDown, Landmark } from 'lucide-react';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useDebtForms } from '@/src/shared/navigation/useDebtForms';
import db from '@/src/widgets/Database/Database.module.css';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useMonthParam, useSearchParamOnce } from '@/src/shared/navigation/useMonthParam';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { MonthPicker } from '@/src/widgets/Database/MonthPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PaymentsTab } from '@/src/screens/Planning/PaymentsTab';
import planning from '@/src/screens/Planning/Planning.module.css';

export function PaymentsScreen() {
  const [month, setMonth] = useMonthParam();
  const [bucket, setBucket] = useState<string | null>(useSearchParamOnce('bucket'));
  const data = useMonthBudget(month);
  const debtForms = useDebtForms();
  return (
    <NotionPage
      title="Payments"
      icon={<CalendarDays strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Payments' }]}
      properties={[{ id: 'month', label: 'Month', display: <MonthPicker value={month} onChange={setMonth} /> }]}
    >
      {data.loading ? (
        <ScreenState loading />
      ) : (
        <div className={planning.tokens}>
          <div className={planning.pageActions}>
            <ActionMenu
              ariaLabel="New"
              triggerClassName={db.newButton}
              triggerIcon={
                <>
                  New <ChevronDown size={14} strokeWidth={2.5} />
                </>
              }
              items={[{ key: 'repayment', label: 'Plan a debt repayment', icon: <Landmark size={14} strokeWidth={2} />, onSelect: () => debtForms.open('schedule', null) }]}
            />
          </div>
          <PaymentsTab month={month} data={data} onMonth={setMonth} bucket={bucket} setBucket={setBucket} />
        </div>
      )}
    </NotionPage>
  );
}
