'use client';

// Renders the task side panel from the URL (?task=<id> or ?task=new, see
// src/shared/navigation/taskPanel.ts) on medium screens and up. An
// existing task opens as its Notion page in a side peek (TaskPeek, edited
// in place); a new task, or ?form=1, opens the task form (TaskEditScreen,
// drawn as a right panel by WebFormPanel). On a phone, a link like that
// goes to the full page instead; phones never show panels.

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { TASK_PARAM, PREFILL_PARAMS, taskPageHref, withoutTaskPanel } from '@/src/shared/navigation/taskPanel';
import {
  DEBT_FORM_PARAM,
  DEBT_ID_PARAM,
  DEBT_PREFILL_PARAMS,
  debtFormPageHref,
  isDebtFormKind,
  withoutDebtForm,
  type DebtFormKind,
} from '@/src/shared/navigation/debtForms';
import dynamic from 'next/dynamic';

// Loaded only when a panel actually opens.
const TaskEditScreen = dynamic(() => import('@/src/screens/TaskEdit/TaskEditScreen').then((m) => m.TaskEditScreen), { ssr: false });
const TaskPeek = dynamic(() => import('@/src/screens/TaskPage/TaskPage').then((m) => m.TaskPeek), { ssr: false });
const DebtFormScreen = dynamic(() => import('@/src/screens/DebtForms/DebtFormScreen').then((m) => m.DebtFormScreen), { ssr: false });
const RepaymentFormScreen = dynamic(() => import('@/src/screens/DebtForms/RepaymentFormScreen').then((m) => m.RepaymentFormScreen), { ssr: false });
const PlanFormScreen = dynamic(() => import('@/src/screens/DebtForms/PlanFormScreen').then((m) => m.PlanFormScreen), { ssr: false });
const WalletEffectFormScreen = dynamic(() => import('@/src/screens/DebtForms/WalletEffectFormScreen').then((m) => m.WalletEffectFormScreen), { ssr: false });

export function PanelHost() {
  return (
    <>
      <TaskPanelHost />
      <DebtFormHost />
    </>
  );
}

function DebtFormHost() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { isWide, deviceClass } = useLayout();
  const kindParam = params.get(DEBT_FORM_PARAM);
  const kind = isDebtFormKind(kindParam) ? kindParam : null;
  const debtId = params.get(DEBT_ID_PARAM);

  // A phone opening a peek link: the form's own page.
  useEffect(() => {
    if (!kind || isWide) return;
    if (window.matchMedia('(min-width: 768px)').matches) return;
    const prefill: Record<string, string> = {};
    for (const p of DEBT_PREFILL_PARAMS) {
      const v = params.get(p);
      if (v) prefill[p] = v;
    }
    router.replace(debtFormPageHref(kind, debtId, prefill));
  }, [kind, debtId, isWide, params, router, deviceClass]);

  if (!kind || !isWide || (kind !== 'new' && !debtId)) return null;
  const close = () => router.replace(withoutDebtForm(pathname, params.toString()), { scroll: false });
  const exits = {
    inPanel: true,
    onClose: close,
    // A new debt opens its page; any other form returns to where it opened.
    onSaved: (id: string) => (kind === 'new' ? router.replace(`/debts/${encodeURIComponent(id)}`) : close()),
    onSwitch: (next: DebtFormKind, id: string, extra?: Record<string, string>) => {
      const sp = new URLSearchParams(withoutDebtForm(pathname, params.toString()).split('?')[1] ?? '');
      sp.set(DEBT_FORM_PARAM, next);
      sp.set(DEBT_ID_PARAM, id);
      for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
  };
  const key = `${kind}:${debtId ?? ''}`;
  if (kind === 'new' || kind === 'edit') return <DebtFormScreen key={key} debtId={kind === 'new' ? null : debtId} {...exits} />;
  if (kind === 'repay') return <RepaymentFormScreen key={key} debtId={debtId!} prefillAmount={params.get('amount')} {...exits} />;
  if (kind === 'plan') return <PlanFormScreen key={key} debtId={debtId!} {...exits} />;
  return <WalletEffectFormScreen key={key} debtId={debtId!} prefillTo={params.get('to')} {...exits} />;
}

function TaskPanelHost() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { isWide, deviceClass } = useLayout();
  const task = params.get(TASK_PARAM);

  // A phone opening a panel link: the full page, same as tapping the task.
  useEffect(() => {
    if (!task || isWide) return;
    const prefill: Record<string, string> = {};
    for (const p of PREFILL_PARAMS) {
      const v = params.get(p);
      if (v) prefill[p] = v;
    }
    // Hydration reports 'compact' everywhere for one render — check the
    // real width before sending a tablet away.
    if (window.matchMedia('(min-width: 768px)').matches) return;
    router.replace(taskPageHref(task, prefill));
  }, [task, isWide, params, router, deviceClass]);

  if (!task || !isWide) return null;
  const close = () => router.replace(withoutTaskPanel(pathname, params.toString()), { scroll: false });
  if (task !== 'new' && !params.get('form')) {
    const sp = new URLSearchParams(params.toString());
    sp.set('form', '1');
    return <TaskPeek key={task} taskId={task} onClose={close} fullHref={taskPageHref(task)} formHref={`${pathname}?${sp.toString()}`} />;
  }
  return <TaskEditScreen key={task} taskId={task === 'new' ? null : task} onClose={close} />;
}
