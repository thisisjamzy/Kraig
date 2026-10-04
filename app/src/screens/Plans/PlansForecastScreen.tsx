'use client';

// Plan and forecast (src/logic/plansForecast): a planning sandbox.
//   Properties: Horizon (3, 6 or 12 months), Scenario, Safety cushion,
//   Lowest balance ahead, Plan status, Cushion streak. One neutral callout;
//   problems are in Notifications.
//   Toolbar: need and priority filter, types shown (expenses, savings;
//   transfers never), search, view settings, Auto-allocate, Want to buy;
//   with a draft, Discard draft and Apply plan at the right end.
//   Web and tablet landscape: the forecast chart across the top, the month
//   board (about 70%) and the backlog (about 30%, collapsible to a strip)
//   below, each scrolling on its own. Tablet portrait: the backlog opens in
//   a side peek. Phone: a month switcher (Backlog last), moves through
//   "Move to month", Apply and Discard in a sticky bottom bar.
//   Dragging a card over a month previews it live (chart, bars, footers);
//   a drop below the cushion opens the friction popover.

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react';
import { useLogic } from '@/src/logic/plansForecast/useLogic';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useNotifications } from '@/src/shared/hooks/useNotifications';
import { inView } from '@/src/shared/notifications/inbox';
import { runEngine, type EngineScenario } from '@/src/viewmodels/plans/engine';
import { monthWord, type DropEffect } from '@/src/viewmodels/plans/allocate';
import type { PlanLine } from '@/src/viewmodels/plans/planDraft';
import { Callout, NotionPage } from '@/src/widgets/Database/NotionPage';
import { SidePeek } from '@/src/widgets/Database/SidePeek';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatMoney } from '@/src/widgets/Money/Money';
import { showToast } from '@/src/widgets/Toast/Toast';
import { ForecastChart } from './ForecastChart';
import { PlanCard, type CardActions } from './PlanCard';
import { BacklogPanel, FrictionDialog, MonthColumn, ScopeDialog, SplitDialog, StateIcon, WantToBuyDialog } from './BoardParts';
import styles from './PlanBoard.module.css';

const FORECAST_TYPES = new Set(['forecast_below_cushion', 'forecast_below_zero', 'forecast_month_short', 'auto_allocate_ready', 'want_to_buy_fits']);
const SCENARIO_LABEL: Record<EngineScenario, string> = { cautious: 'Cautious', expected: 'Expected', optimistic: 'Optimistic' };
type NeedFilter = 'all' | 'must' | 'nice' | 'High' | 'Medium' | 'Low';
const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

type Pending =
  | { kind: 'friction'; line: PlanLine; toMonth: string; scope?: 'month' | 'future'; effect: DropEffect }
  | { kind: 'scope'; line: PlanLine; toMonth: string }
  | { kind: 'split'; line: PlanLine }
  | { kind: 'want' }
  | { kind: 'fixed'; line: PlanLine; toMonth: string | null }
  | null;

export function PlansForecastScreen() {
  const v = useLogic();
  const { deviceClass } = useLayout();
  const compact = deviceClass === 'compact';
  const portrait = deviceClass === 'medium';
  const { notifications } = useNotifications();
  const planUpdates = notifications.filter((n) => FORECAST_TYPES.has(n.type) && inView(n, 'inbox', new Date())).length;

  const [need, setNeed] = useState<NeedFilter>('all');
  const [types, setTypes] = useState({ expenses: true, savings: true });
  const [search, setSearch] = useState('');
  const [showPaid, setShowPaid] = useState(true);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [backlogPeek, setBacklogPeek] = useState(false);
  const [phoneMonth, setPhoneMonth] = useState<string | 'backlog' | null>(null);
  const [settings, setSettings] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [announce, setAnnounce] = useState('');
  const [unplaced, setUnplaced] = useState<{ key: string; reason: string; shortfall: number }[]>([]);
  const columnRefs = useRef(new Map<string, HTMLElement>());

  // ---- Filters ----
  const shown = (l: PlanLine) => {
    if (need === 'must' || need === 'nice') {
      if (l.need !== need) return false;
    } else if (need !== 'all' && l.priority !== need) return false;
    if (l.kind === 'savings' ? !types.savings : !types.expenses) return false;
    if (search.trim() && !l.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  };

  // ---- Drag and the live preview ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [active, setActive] = useState<PlanLine | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const blockedOver = active && over ? v.blockedReason(active, over) : null;
  const preview = useMemo(() => {
    if (!active || !over || blockedOver || over === active.month) return null;
    const others = v.draftInput.lines.filter((l) => l.key !== active.key);
    return runEngine({ ...v.draftInput, lines: [...others, { ...v.toEngineLine(active), month: over, due: null }] });
  }, [active, over, blockedOver, v]);
  const result = preview ?? v.forecast;

  const columns = useMemo(
    () =>
      v.board.map((c) => {
        const engine = preview?.months.find((m) => m.month === c.month) ?? c.engine;
        return { ...c, engine, open: c.open.filter(shown), paid: showPaid ? c.paid.filter(shown) : [], state: engine.lowest < v.cushion ? ('below' as const) : engine.lowest < v.cushion * 1.2 ? ('close' as const) : ('comfortable' as const) };
      }),
    // `shown` reads the filters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.board, preview, v.cushion, need, types, search, showPaid]
  );
  const backlog = v.backlog.filter(shown);
  const accountName = (id: string | null) => (id ? (v.accounts.find((a) => a.id === id)?.name ?? null) : null);

  function said(line: PlanLine, toMonth: string | null) {
    if (!toMonth) {
      setAnnounce(`${line.name} moved to the backlog.`);
      return;
    }
    const others = v.draftInput.lines.filter((l) => l.key !== line.key);
    const m = runEngine({ ...v.draftInput, lines: [...others, { ...v.toEngineLine(line), month: toMonth, due: null }] }).months.find((x) => x.month === toMonth);
    setAnnounce(`${line.name} moved to ${monthWord(toMonth)}. Lowest balance in ${monthWord(toMonth)} now ${formatMoney(m?.lowest ?? 0)}.`);
  }

  async function commit(line: PlanLine, toMonth: string | null, scope?: 'month' | 'future') {
    try {
      if (toMonth === null) await v.toBacklog(line.key);
      // From the backlog, it lands on the 15th.
      else await v.move(line.key, toMonth, { scope, date: line.month ? null : `${toMonth}-15` });
      said(line, toMonth);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'That card can’t move there.');
    }
  }

  function afterScope(line: PlanLine, toMonth: string, scope?: 'month' | 'future') {
    const effect = v.effectOf(line.key, toMonth);
    if (effect?.message) setPending({ kind: 'friction', line, toMonth, scope, effect });
    else void commit(line, toMonth, scope);
  }

  function drop(line: PlanLine, toMonth: string | null) {
    if (toMonth === line.month) return;
    if (line.movable === false) return setPending({ kind: 'fixed', line, toMonth });
    if (toMonth === null) return void commit(line, null);
    const blocked = v.blockedReason(line, toMonth);
    if (blocked) return showToast(blocked);
    if (line.recurring && line.month) return setPending({ kind: 'scope', line, toMonth });
    afterScope(line, toMonth);
  }

  function onDragStart(e: DragStartEvent) {
    setActive((e.active.data.current?.line as PlanLine) ?? null);
  }
  function onDragOver(e: DragOverEvent) {
    const month = e.over?.data.current?.month as string | null | undefined;
    // Previews are rendered on the next frame, at most once per frame.
    requestAnimationFrame(() => setOver(month === undefined ? null : month));
  }
  function onDragEnd(e: DragEndEvent) {
    const line = active;
    setActive(null);
    setOver(null);
    if (!line || !e.over) return;
    drop(line, (e.over.data.current?.month as string | null) ?? null);
  }

  const actions: CardActions = {
    months: v.months,
    accounts: v.accounts,
    moveTo: (line, month) => drop(line, month),
    toBacklog: (line) => drop(line, null),
    split: (line) => setPending({ kind: 'split', line }),
    setPriority: (line, patch) => void v.setPriority(line.key, patch),
    setAccount: (line, id) => void v.setAccount(line.key, id),
    setAmount: (line, amount) => void v.setAmount(line.key, amount, line.recurring ? 'month' : undefined),
    setDate: (line, iso) => {
      const toMonth = iso.slice(0, 7);
      const blocked = v.blockedReason(line, toMonth);
      if (blocked) return showToast(blocked);
      void v.setDate(line.key, iso);
    },
    moveThisMonthOnly: (line) => setPending({ kind: 'fixed', line, toMonth: v.months.find((m) => m > (line.month ?? '')) ?? null }),
    accept: (line) => void v.acceptSuggestions([line.key.split('#')[0]]),
    reject: (line) => void v.rejectSuggestions([line.key.split('#')[0]]),
    waitingText: v.waitingText,
  };
  const renderCard = (line: PlanLine, inBacklog = false) => (
    <PlanCard key={line.key} line={line} actions={actions} dip={v.dipping.get(line.key) ?? null} accountName={accountName(line.accountId)} inBacklog={inBacklog} now={v.today} />
  );

  async function autoAllocate() {
    const r = await v.runAutoAllocate();
    setUnplaced(r.unplaced);
    showToast(r.placements.length ? `${r.placements.length} ${r.placements.length === 1 ? 'suggestion' : 'suggestions'} ready` : 'Nothing in the backlog fits yet');
  }

  const lowest = v.lowest;
  const draftCount = v.changes.length;
  const scrollTo = (month: string) => {
    if (compact) setPhoneMonth(month);
    else columnRefs.current.get(month)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const toolbar = (
    <div className={styles.toolbar} role="toolbar" aria-label="Plan tools">
      <select value={need} onChange={(e) => setNeed(e.target.value as NeedFilter)} aria-label="Need and priority">
        <option value="all">All</option>
        <option value="must">Must have</option>
        <option value="nice">Nice to have</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <label className={styles.checkLabel}>
        <input type="checkbox" checked={types.expenses} onChange={(e) => setTypes((t) => ({ ...t, expenses: e.target.checked }))} />
        Expenses
      </label>
      <label className={styles.checkLabel}>
        <input type="checkbox" checked={types.savings} onChange={(e) => setTypes((t) => ({ ...t, savings: e.target.checked }))} />
        Savings
      </label>
      <input type="search" className={styles.search} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the plan" />
      <button type="button" className={styles.iconButton} aria-label="View settings" onClick={(e) => setSettings(e.currentTarget)}>
        <SlidersHorizontal size={15} strokeWidth={2} />
      </button>
      <button type="button" className={styles.toolButton} onClick={() => void autoAllocate()}>
        <Sparkles size={14} strokeWidth={2} aria-hidden /> Auto-allocate
      </button>
      <button type="button" className={styles.toolButton} onClick={() => setPending({ kind: 'want' })}>
        Want to buy
      </button>
      {v.hasDraft && !compact && (
        <span className={styles.draftButtons}>
          <button type="button" className={styles.secondary} onClick={() => void v.discard()} disabled={v.applying}>
            Discard draft
          </button>
          <button type="button" className={styles.primary} onClick={() => void v.apply()} disabled={v.applying}>
            {v.applying ? 'Applying…' : 'Apply plan'}
          </button>
        </span>
      )}
    </div>
  );

  const suggestionBar = v.suggestions.length > 0 && (
    <div className={styles.suggestBar} role="status">
      <p>
        Auto-allocate suggests {v.suggestions.length} {v.suggestions.length === 1 ? 'placement' : 'placements'}: {v.suggestions.map((s) => s.name).join(', ')}.
      </p>
      <span>
        <button type="button" className={styles.primary} onClick={() => void v.acceptSuggestions()}>
          Accept all
        </button>
        <button type="button" className={styles.secondary} onClick={() => void v.rejectSuggestions()}>
          Reject all
        </button>
      </span>
    </div>
  );

  const board = (
    <div className={styles.board} aria-label="Months">
      {(compact ? columns.filter((c) => c.month === (phoneMonth && phoneMonth !== 'backlog' ? phoneMonth : v.current)) : columns).map((c) => (
        <MonthColumn
          key={c.month}
          col={c}
          isCurrent={c.month === v.current}
          blocked={over === c.month ? blockedOver : null}
          renderCard={(l) => renderCard(l)}
          innerRef={(el) => {
            if (el) columnRefs.current.set(c.month, el);
          }}
        />
      ))}
    </div>
  );
  const backlogPanel = (
    <BacklogPanel lines={backlog} renderCard={(l) => renderCard(l, true)} onWantToBuy={() => setPending({ kind: 'want' })} collapsed={backlogCollapsed && !compact && !portrait} onCollapse={setBacklogCollapsed} />
  );

  return (
    <NotionPage
      title="Plan and forecast"
      icon={<TrendingUp strokeWidth={1.75} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Plan and forecast' }]}
      menu={[
        { label: 'Auto-allocate', onSelect: () => void autoAllocate() },
        { label: 'Want to buy', onSelect: () => setPending({ kind: 'want' }) },
        { label: 'Notifications', href: '/notifications' },
      ]}
      properties={[
        {
          id: 'horizon',
          label: 'Horizon',
          edit: { type: 'select', value: String(v.horizon), options: ['3', '6', '12'].map((h) => ({ value: h, label: `${h} months` })), onSave: (next) => v.setHorizon(Number(next) as 3 | 6 | 12) },
        },
        {
          id: 'scenario',
          label: 'Scenario',
          edit: { type: 'select', value: v.scenario, options: (Object.keys(SCENARIO_LABEL) as EngineScenario[]).map((s) => ({ value: s, label: SCENARIO_LABEL[s] })), onSave: (next) => v.setScenario(next as EngineScenario) },
        },
        {
          id: 'cushion',
          label: 'Safety cushion',
          display: formatMoney(v.cushion),
          sub: v.cushionIsDefault ? 'One month of must-haves' : 'Minimum balance to keep',
          edit: { type: 'currency', value: v.cushion, onSave: (next) => v.setCushion(next === null || next === '' ? null : Number(next)) },
        },
        {
          id: 'lowest',
          label: 'Lowest balance ahead',
          icon: <StateIcon state={v.lowestState} />,
          tone: v.lowestState === 'below' ? 'bad' : v.lowestState === 'close' ? 'watch' : 'good',
          display: formatMoney(lowest.balance),
          sub: short(lowest.date),
        },
        { id: 'status', label: 'Plan status', display: draftCount ? `Draft: ${draftCount} ${draftCount === 1 ? 'change' : 'changes'}` : 'No changes', tone: draftCount ? 'watch' : 'neutral' },
        { id: 'streak', label: 'Cushion streak', display: `${v.streak} ${v.streak === 1 ? 'month' : 'months'}` },
      ]}
    >
      {v.loading ? (
        <ScreenState loading />
      ) : (
        <>
          <Callout>
            <p>
              Your lowest point is {formatMoney(lowest.balance)} on {short(lowest.date)}.
              {planUpdates > 0 && (
                <>
                  {' '}
                  <Link href="/notifications">
                    {planUpdates} {planUpdates === 1 ? 'update' : 'updates'} about this plan in Notifications
                  </Link>
                  .
                </>
              )}
            </p>
          </Callout>

          {toolbar}
          {suggestionBar}
          {unplaced.length > 0 && (
            <p className={styles.unplaced}>
              {unplaced.map((u) => `${v.backlog.find((l) => l.key === u.key)?.name ?? 'An item'}: ${u.reason.toLowerCase()} (short ${formatMoney(u.shortfall)})`).join('. ')}.
            </p>
          )}

          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActive(null);
              setOver(null);
            }}
            accessibility={{
              announcements: {
                onDragStart: ({ active: a }) => `Picked up ${(a.data.current?.line as PlanLine | undefined)?.name ?? 'a card'}.`,
                onDragOver: ({ over: o }) => (o ? `Over ${o.data.current?.month ? monthWord(o.data.current.month as string) : 'the backlog'}.` : 'Not over a month.'),
                onDragEnd: () => '',
                onDragCancel: () => 'Move cancelled.',
              },
            }}
          >
            <div className={styles.chartSticky}>
              <ForecastChart result={result} before={preview ? v.forecast : null} cushion={v.cushion} compact={compact} onMonth={scrollTo} />
            </div>

            {compact && (
              <div className={styles.monthSwitch} role="tablist" aria-label="Month">
                {v.months.map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={(phoneMonth ?? v.current) === m} onClick={() => setPhoneMonth(m)}>
                    {monthWord(m).slice(0, 3)}
                  </button>
                ))}
                <button type="button" role="tab" aria-selected={phoneMonth === 'backlog'} onClick={() => setPhoneMonth('backlog')}>
                  Backlog
                </button>
              </div>
            )}

            {compact ? (
              phoneMonth === 'backlog' ? backlogPanel : board
            ) : portrait ? (
              <>
                <button type="button" className={styles.backlogStrip} onClick={() => setBacklogPeek(true)}>
                  Backlog ({backlog.length})
                </button>
                {board}
                {backlogPeek && (
                  <SidePeek title="Backlog" mode="side" onMode={() => undefined} onClose={() => setBacklogPeek(false)} fullHref={null}>
                    {backlogPanel}
                  </SidePeek>
                )}
              </>
            ) : (
              <div className={styles.panels} data-collapsed={backlogCollapsed || undefined}>
                {board}
                {backlogPanel}
              </div>
            )}

            <DragOverlay dropAnimation={null}>
              {active ? (
                <div className={styles.overlayCard}>
                  <strong>{active.name}</strong>
                  <span>{formatMoney(active.amount)}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <p className={styles.srOnly} aria-live="polite">
            {announce}
          </p>
        </>
      )}

      {compact && v.hasDraft && (
        <div className={styles.bottomBar}>
          <button type="button" className={styles.secondary} onClick={() => void v.discard()} disabled={v.applying}>
            Discard draft
          </button>
          <button type="button" className={styles.primary} onClick={() => void v.apply()} disabled={v.applying}>
            {v.applying ? 'Applying…' : `Apply plan (${draftCount})`}
          </button>
        </div>
      )}

      {settings && (
        <Popover anchor={settings} label="View settings" onClose={() => setSettings(null)}>
          <div className={styles.settingsMenu}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
              Show paid lines
            </label>
            {!compact && !portrait && (
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={!backlogCollapsed} onChange={(e) => setBacklogCollapsed(!e.target.checked)} />
                Show the backlog
              </label>
            )}
          </div>
        </Popover>
      )}

      {pending?.kind === 'friction' && (
        <FrictionDialog
          effect={pending.effect}
          splitPreview={v.splitPreview(pending.line.key, 3, pending.toMonth)}
          bestMonth={v.bestMonthFor(pending.line.key)}
          onPlace={() => {
            const p = pending;
            setPending(null);
            void commit(p.line, p.toMonth, p.scope);
          }}
          onSplit={() => {
            const p = pending;
            setPending(null);
            void v.split(p.line.key, 3, p.toMonth).then(() => setAnnounce(`${p.line.name} split into 3 payments from ${monthWord(p.toMonth)}.`));
          }}
          onBest={() => {
            const p = pending;
            setPending(null);
            void commit(p.line, v.bestMonthFor(p.line.key), p.scope);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'scope' && (
        <ScopeDialog
          line={pending.line}
          toMonth={pending.toMonth}
          onChoose={(scope) => {
            const p = pending;
            setPending(null);
            afterScope(p.line, p.toMonth, scope);
          }}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'split' && (
        <SplitDialog
          line={pending.line}
          months={v.months}
          preview={(count, start) => v.splitPreview(pending.line.key, count, start)}
          onSplit={(count, start) => {
            const p = pending;
            setPending(null);
            void v.split(p.line.key, count, start).then(() => setAnnounce(`${p.line.name} split into ${count} payments.`));
          }}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'want' && <WantToBuyDialog months={v.months} onSave={v.addWantToBuy} onClose={() => setPending(null)} />}
      {pending?.kind === 'fixed' && (
        <ConfirmDialog
          title={`Move ${pending.line.name} this month only?`}
          message={`It's a fixed recurring line. ${pending.line.month ? monthWord(pending.line.month) : 'This month'} skips it${pending.toMonth ? ` and ${monthWord(pending.toMonth)} pays it too` : ''}; every other month stays as it is.`}
          confirmLabel="Move this month only"
          cancelLabel="Cancel"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const p = pending;
            setPending(null);
            if (!p.toMonth) return void commit(p.line, null);
            const blocked = v.blockedReason(p.line, p.toMonth);
            if (blocked) return showToast(blocked);
            afterScope(p.line, p.toMonth, 'month');
          }}
        />
      )}
    </NotionPage>
  );
}
