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
import { SETTINGS_PARAM, settingsHref, settingsPageHref, withoutSettings } from '@/src/shared/navigation/settingsLink';
import { isSettingsSection } from '@/src/logic/settingsCenter/sections';
import { PEEK_PARAM, formPageHref, isFormKind, peekParams, withoutFormPeek, type FormKind } from '@/src/shared/navigation/formPeek';
import { FormPeekContext } from '@/src/widgets/FormFrame/FormFrame';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';

// Loaded only when a panel actually opens.
const TaskEditScreen = dynamic(() => import('@/src/screens/TaskEdit/TaskEditScreen').then((m) => m.TaskEditScreen), { ssr: false });
const TaskPeek = dynamic(() => import('@/src/screens/TaskPage/TaskPage').then((m) => m.TaskPeek), { ssr: false });
const DebtFormScreen = dynamic(() => import('@/src/screens/DebtForms/DebtFormScreen').then((m) => m.DebtFormScreen), { ssr: false });
const RepaymentFormScreen = dynamic(() => import('@/src/screens/DebtForms/RepaymentFormScreen').then((m) => m.RepaymentFormScreen), { ssr: false });
const PlanFormScreen = dynamic(() => import('@/src/screens/DebtForms/PlanFormScreen').then((m) => m.PlanFormScreen), { ssr: false });
const ScheduleFormScreen = dynamic(() => import('@/src/screens/DebtForms/ScheduleFormScreen').then((m) => m.ScheduleFormScreen), { ssr: false });
const WalletEffectFormScreen = dynamic(() => import('@/src/screens/DebtForms/WalletEffectFormScreen').then((m) => m.WalletEffectFormScreen), { ssr: false });

// The forms that open as a side peek from ?peek=<kind> (formPeek.ts). A kind
// not listed here opens its own page instead.
const BasketItemForm = dynamic(() => import('@/src/forms/BasketItemForm/BasketItemForm').then((m) => m.BasketItemForm), { ssr: false });
const AreaFormScreen = dynamic(() => import('@/src/screens/AreaForm/AreaFormScreen').then((m) => m.AreaFormScreen), { ssr: false });
const ProjectFormScreen = dynamic(() => import('@/src/screens/ProjectForm/ProjectFormScreen').then((m) => m.ProjectFormScreen), { ssr: false });
const CoverScreen = dynamic(() => import('@/src/screens/PlanningFlows/CoverScreen').then((m) => m.CoverScreen), { ssr: false });
const ReallocateScreen = dynamic(() => import('@/src/screens/PlanningFlows/ReallocateScreen').then((m) => m.ReallocateScreen), { ssr: false });
const AddTransactionScreen = dynamic(() => import('@/src/screens/AddTransaction/AddTransactionScreen').then((m) => m.AddTransactionScreen), { ssr: false });
const EditTransactionScreen = dynamic(() => import('@/src/screens/EditTransaction/EditTransactionScreen').then((m) => m.EditTransactionScreen), { ssr: false });
const EditTransferScreen = dynamic(() => import('@/src/screens/EditTransfer/EditTransferScreen').then((m) => m.EditTransferScreen), { ssr: false });
const CreateBucketScreen = dynamic(() => import('@/src/screens/CreateBucket/CreateBucketScreen').then((m) => m.CreateBucketScreen), { ssr: false });
const CreateCategoryScreen = dynamic(() => import('@/src/screens/CreateCategory/CreateCategoryScreen').then((m) => m.CreateCategoryScreen), { ssr: false });
const CategoryEditScreen = dynamic(() => import('@/src/screens/CategoryEdit/CategoryEditScreen').then((m) => m.CategoryEditScreen), { ssr: false });
const WalletEditScreen = dynamic(() => import('@/src/screens/WalletEdit/WalletEditScreen').then((m) => m.WalletEditScreen), { ssr: false });
const TemplateFormScreen = dynamic(
  () => import('@/src/screens/CreateTransactionTemplate/CreateTransactionTemplateScreen').then((m) => m.CreateTransactionTemplateScreen),
  { ssr: false }
);
const ImportDataScreen = dynamic(() => import('@/src/screens/ImportData/ImportDataScreen').then((m) => m.ImportDataScreen), { ssr: false });
const SectionEditScreen = dynamic(() => import('@/src/screens/SectionEdit/SectionEditScreen').then((m) => m.SectionEditScreen), { ssr: false });
const CreateSectionScreen = dynamic(() => import('@/src/screens/CreateSection/CreateSectionScreen').then((m) => m.CreateSectionScreen), { ssr: false });

const PEEK_FORMS: Partial<Record<FormKind, ComponentType<{ params: Record<string, string> }>>> = {
  'basket-item': ({ params }) => <BasketItemForm goalId={params.basket} itemId={params.item || undefined} />,
  area: ({ params }) => <AreaFormScreen areaId={params.id || undefined} />,
  project: ({ params }) => <ProjectFormScreen projectId={params.id || undefined} />,
  section: ({ params }) => (params.id ? <SectionEditScreen bucketId={params.id} /> : <CreateSectionScreen areaId={params.areaId ?? ''} />),
  transaction: () => <AddTransactionScreen />,
  'edit-transaction': ({ params }) => <EditTransactionScreen transactionId={params.id} />,
  'edit-transfer': ({ params }) => <EditTransferScreen transferId={params.id} />,
  basket: () => <CreateBucketScreen />,
  category: () => <CreateCategoryScreen />,
  'edit-category': ({ params }) => <CategoryEditScreen categoryId={params.id} />,
  wallet: ({ params }) => <WalletEditScreen walletId={params.id} />,
  template: ({ params }) => <TemplateFormScreen templateId={params.id || undefined} />,
  cover: () => <CoverScreen />,
  import: () => <ImportDataScreen />,
  reallocate: () => <ReallocateScreen />,
};

const SettingsDialog = dynamic(() => import('./SettingsDialog').then((m) => m.SettingsDialog), { ssr: false });

export function PanelHost() {
  return (
    <>
      <TaskPanelHost />
      <DebtFormHost />
      <FormPeekHost />
      <SettingsHost />
    </>
  );
}

/** Settings from ?settings=<section>: the dialog on wide screens, the section's page on a phone. */
function SettingsHost() {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { isWide, deviceClass } = useLayout();
  const raw = search.get(SETTINGS_PARAM);
  const section = raw === null ? null : isSettingsSection(raw) ? raw : 'preferences';

  useEffect(() => {
    if (!section || isWide || window.matchMedia('(min-width: 768px)').matches) return;
    router.replace(settingsPageHref(section));
  }, [section, isWide, router, deviceClass]);

  if (!section || !isWide) return null;
  return (
    <SettingsDialog
      section={section}
      onSection={(next) => router.replace(settingsHref(pathname, search.toString(), next), { scroll: false })}
      onClose={() => router.replace(withoutSettings(pathname, search.toString()), { scroll: false })}
    />
  );
}

function FormPeekHost() {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { isWide, deviceClass } = useLayout();
  const kindParam = search.get(PEEK_PARAM);
  const kind = isFormKind(kindParam) ? kindParam : null;
  const params = peekParams(search);
  const Form = kind ? PEEK_FORMS[kind] : undefined;
  const pageHref = kind ? formPageHref(kind, params) : null;

  // A phone opening a peek link, or a form without a peek: its own page.
  useEffect(() => {
    if (!kind || !pageHref) return;
    if (Form && (isWide || window.matchMedia('(min-width: 768px)').matches)) return;
    router.replace(pageHref);
  }, [kind, Form, pageHref, isWide, router, deviceClass]);

  if (!kind || !Form || !isWide) return null;
  const close = () => router.replace(withoutFormPeek(pathname, search.toString()), { scroll: false });
  return (
    <WebFormPanel onClose={close}>
      <FormPeekContext.Provider value={{ peek: true, close, fullPageHref: pageHref }}>
        <Form key={search.toString()} params={params} />
      </FormPeekContext.Provider>
    </WebFormPanel>
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

  if (!kind || !isWide || (kind !== 'new' && kind !== 'schedule' && !debtId)) return null;
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
  const form =
    kind === 'new' || kind === 'edit' ? (
      <DebtFormScreen key={key} debtId={kind === 'new' ? null : debtId} {...exits} />
    ) : kind === 'repay' ? (
      <RepaymentFormScreen key={key} debtId={debtId!} prefillAmount={params.get('amount')} scheduledId={params.get('scheduled')} {...exits} />
    ) : kind === 'plan' ? (
      <PlanFormScreen key={key} debtId={debtId!} {...exits} />
    ) : kind === 'schedule' ? (
      <ScheduleFormScreen key={`${key}:${params.get('scheduled') ?? ''}`} debtId={debtId} scheduledId={params.get('scheduled')} {...exits} />
    ) : (
      <WalletEffectFormScreen key={key} debtId={debtId!} prefillTo={params.get('to')} {...exits} />
    );
  return <FormPeekContext.Provider value={{ peek: true, close, fullPageHref: debtFormPageHref(kind, debtId) }}>{form}</FormPeekContext.Provider>;
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
  return (
    <WebFormPanel onClose={close}>
      <FormPeekContext.Provider value={{ peek: true, close, fullPageHref: task === 'new' ? taskPageHref('new') : `/tasks/${encodeURIComponent(task)}/edit` }}>
        <TaskEditScreen key={task} taskId={task === 'new' ? null : task} onClose={close} />
      </FormPeekContext.Provider>
    </WebFormPanel>
  );
}
