'use client';

// Plan on a phone (/baskets/forecast), mobile first in the BASELINE style,
// on the same plan logic as the web board (src/logic/plansForecast):
//   1. Today: cash in your accounts, still to pay this month, still expected.
//   2. Spend per day: today's allowance, spent today, left today.
//   3. A month switcher (this month first).
//   4. The month: income, planned out, left, the lowest balance and its date;
//      then its items as Must have and Nice to have, fixed lines folded into
//      "Fixed (6) · 395,000". Tapping an item opens it; "..." moves it to
//      another month or the backlog, splits it, or says why to wait.
//   5. Backlog, with Want to buy.
// "Show chart" opens a compact chart and the months compared, full screen.
// Auto-allocate is in the header menu; its suggestions and the friction
// message open as small bottom sheets. With a draft, a bar at the bottom:
// "4 changes", Discard and Apply. No board, properties grid or side peek.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, LineChart, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { useLogic } from '@/src/logic/plansForecast/useLogic';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { useDailyGuide } from '@/src/shared/hooks/useDailyGuide';
import { useGoBack } from '@/src/shared/navigation/useGoBack';
import { monthWord, type DropEffect } from '@/src/viewmodels/plans/allocate';
import type { PlanLine } from '@/src/viewmodels/plans/planDraft';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { showToast } from '@/src/widgets/Toast/Toast';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/Plan/PlanScreen.module.css';

const money = (n: number) => (n < 0 ? `−${Math.round(-n).toLocaleString('en-US')}` : Math.round(n).toLocaleString('en-US'));
const dayMonth = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const chipOf = (l: PlanLine) => `${l.need === 'must' ? 'Must have' : 'Nice to have'} · ${l.priority}`;

type Sheet =
  | { kind: 'item'; line: PlanLine }
  | { kind: 'move'; line: PlanLine }
  | { kind: 'scope'; line: PlanLine; toMonth: string }
  | { kind: 'friction'; line: PlanLine; toMonth: string; scope?: 'month' | 'future'; effect: DropEffect; confirmZero?: boolean }
  | { kind: 'split'; line: PlanLine }
  | { kind: 'why'; line: PlanLine; text: string }
  | { kind: 'want' }
  | { kind: 'suggestions' }
  | null;

export function PlanScreen() {
  const v = useLogic();
  const goBack = useGoBack();
  const [now] = useState(() => new Date());
  const thisMonth = useMonthBudget(v.current);
  const guide = useDailyGuide(thisMonth, now);
  const [month, setMonth] = useState<string | null>(null);
  const [fixedOpen, setFixedOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [chart, setChart] = useState(false);

  const shownMonth = month ?? v.current;
  const col = v.board.find((c) => c.month === shownMonth) ?? null;
  const currentCol = v.board.find((c) => c.month === v.current) ?? null;
  const stillToPay = currentCol ? currentCol.open.reduce((s, l) => s + l.amount, 0) : 0;
  const stillExpected = currentCol ? currentCol.income.reduce((s, i) => s + i.amount, 0) : 0;

  const groups = useMemo(() => {
    const open = col?.open ?? [];
    const fixed = open.filter((l) => l.movable === false);
    const rest = open.filter((l) => l.movable !== false);
    return { fixed, must: rest.filter((l) => l.need === 'must'), nice: rest.filter((l) => l.need !== 'must') };
  }, [col]);

  async function commit(line: PlanLine, toMonth: string | null, scope?: 'month' | 'future') {
    try {
      if (toMonth === null) await v.toBacklog(line.key);
      else await v.move(line.key, toMonth, { scope, date: line.month ? null : `${toMonth}-15` });
      showToast(toMonth ? `${line.name} moved to ${monthWord(toMonth)}` : `${line.name} moved to the backlog`);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'That item can’t move there.');
    }
  }
  function afterScope(line: PlanLine, toMonth: string, scope?: 'month' | 'future') {
    const effect = v.effectOf(line.key, toMonth);
    if (effect?.message) setSheet({ kind: 'friction', line, toMonth, scope, effect });
    else {
      setSheet(null);
      void commit(line, toMonth, scope);
    }
  }
  function moveTo(line: PlanLine, toMonth: string | null) {
    if (toMonth === line.month) return setSheet(null);
    if (toMonth === null) {
      setSheet(null);
      return void commit(line, null);
    }
    const blocked = v.blockedReason(line, toMonth);
    if (blocked) {
      setSheet(null);
      return showToast(blocked);
    }
    if (line.recurring && line.month) return setSheet({ kind: 'scope', line, toMonth });
    afterScope(line, toMonth);
  }

  const row = (line: PlanLine) => (
    <div key={line.key} className={p.row}>
      <Link href={`/budget/item/${line.bucketId}/${line.itemId}?month=${line.month ?? v.current}`} className={styles.rowLink}>
        <span className={p.rowMain}>
          <span className={p.rowName}>{line.name}</span>
          <span className={styles.chip}>{chipOf(line)}</span>
          {line.changed && line.movedFrom && <span className={p.rowNote}>Moved from {monthWord(line.movedFrom)}</span>}
          {line.suggested && <span className={p.rowMethod}>Suggested · {line.suggested.reason}</span>}
        </span>
        <span className={p.rowSide}>
          <span className={p.rowAmount}>{money(line.amount)}</span>
          {line.due && <span className={p.rowWhen}>{dayMonth(line.due)}</span>}
        </span>
      </Link>
      {!line.paid && (
        <button type="button" className={styles.more} aria-label={`Options for ${line.name}`} onClick={() => setSheet({ kind: 'item', line })}>
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  if (chart) return <ChartPage v={v} onClose={() => setChart(false)} />;

  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`} data-draft={v.hasDraft || undefined}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={() => goBack('/baskets')} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Plan"
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={p.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              {
                key: 'auto',
                label: 'Auto-allocate',
                icon: <Sparkles size={14} strokeWidth={2} />,
                onSelect: () =>
                  void v.runAutoAllocate().then((r) => (r.placements.length ? setSheet({ kind: 'suggestions' }) : showToast('Nothing in the backlog fits yet'))),
              },
              { key: 'want', label: 'Want to buy', icon: <Plus size={14} strokeWidth={2} />, onSelect: () => setSheet({ kind: 'want' }) },
              { key: 'chart', label: 'Show chart', icon: <LineChart size={14} strokeWidth={2} />, onSelect: () => setChart(true) },
            ]}
          />
        }
      />

      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          <section className={p.card}>
            <h2 className={styles.cardTitle}>Today</h2>
            <div className={styles.figures}>
              <Figure label="Cash in accounts" value={money(v.startBalance)} />
              <Figure label="Still to pay this month" value={money(stillToPay)} />
              <Figure label="Still expected" value={money(stillExpected)} />
            </div>
          </section>

          <section className={p.card}>
            <h2 className={styles.cardTitle}>Spend per day</h2>
            {guide ? (
              <div className={styles.figures}>
                <Figure label="Today's allowance" value={money(guide.today.allowance)} />
                <Figure label="Spent today" value={money(guide.today.spent)} />
                <Figure label="Left today" value={money(guide.today.left)} tone={guide.today.left < 0 ? 'bad' : undefined} />
              </div>
            ) : (
              <p className={styles.muted}>No flexible spending is planned this month.</p>
            )}
          </section>

          <div className={styles.switcher} role="tablist" aria-label="Month">
            {v.months.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={shownMonth === m} onClick={() => setMonth(m)}>
                {monthWord(m).slice(0, 3)}
              </button>
            ))}
          </div>

          {col && (
            <>
              <section className={p.card}>
                <h2 className={styles.cardTitle}>{monthWord(col.month)}</h2>
                <div className={styles.figures}>
                  <Figure label="Income" value={money(col.engine.income)} />
                  <Figure label="Planned out" value={money(col.engine.fixed + col.engine.flexible + col.engine.savings + col.engine.fees)} />
                  <Figure label="Left" value={money(col.engine.free)} tone={col.engine.free < 0 ? 'bad' : undefined} />
                </div>
                <p className={styles.lowest} data-tone={col.engine.lowest < 0 ? 'bad' : col.engine.lowest < v.cushion ? 'watch' : undefined}>
                  Lowest balance {money(col.engine.lowest)} on {dayMonth(col.engine.lowestDate)}
                </p>
              </section>

              {groups.fixed.length > 0 && (
                <>
                  <button type="button" className={styles.groupHead} aria-expanded={fixedOpen} onClick={() => setFixedOpen((o) => !o)}>
                    <span>
                      Fixed ({groups.fixed.length}) · {money(groups.fixed.reduce((s, l) => s + l.amount, 0))}
                    </span>
                    <ChevronDown size={18} strokeWidth={2} data-open={fixedOpen || undefined} />
                  </button>
                  {fixedOpen && <div className={p.rows}>{groups.fixed.map(row)}</div>}
                </>
              )}
              {groups.must.length > 0 && (
                <>
                  <h3 className={styles.groupTitle}>Must have</h3>
                  <div className={p.rows}>{groups.must.map(row)}</div>
                </>
              )}
              {groups.nice.length > 0 && (
                <>
                  <h3 className={styles.groupTitle}>Nice to have</h3>
                  <div className={p.rows}>{groups.nice.map(row)}</div>
                </>
              )}
              {col.open.length === 0 && <p className={p.empty}>Nothing left to pay in {monthWord(col.month)}.</p>}
            </>
          )}

          <div className={styles.backlogHead}>
            <h3 className={styles.groupTitle}>
              Backlog ({v.backlog.length}) · {money(v.backlog.reduce((s, l) => s + l.amount, 0))}
            </h3>
            <button type="button" className={p.textButton} onClick={() => setSheet({ kind: 'want' })}>
              Want to buy
            </button>
          </div>
          {v.backlog.length > 0 ? <div className={p.rows}>{v.backlog.map(row)}</div> : <p className={p.empty}>Nothing waiting to be scheduled.</p>}
        </>
      )}

      {v.hasDraft && (
        <div className={p.sticky}>
          <span className={p.stickyAmount}>
            <span className={p.stickyLabel}>Draft</span>
            <span className={styles.draftCount}>
              {v.changes.length} {v.changes.length === 1 ? 'change' : 'changes'}
            </span>
          </span>
          <button type="button" className={p.squareButton} onClick={() => void v.discard()} disabled={v.applying}>
            Discard
          </button>
          <button type="button" className={`${p.fillButton} ${p.bigButton}`} onClick={() => void v.apply()} disabled={v.applying}>
            {v.applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}

      <Sheets sheet={sheet} setSheet={setSheet} v={v} moveTo={moveTo} afterScope={afterScope} commit={commit} />
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <span className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={styles.figureValue} data-tone={tone}>
        {value}
      </span>
    </span>
  );
}

type Logic = ReturnType<typeof useLogic>;

function Sheets({
  sheet,
  setSheet,
  v,
  moveTo,
  afterScope,
  commit,
}: {
  sheet: Sheet;
  setSheet: (s: Sheet) => void;
  v: Logic;
  moveTo: (line: PlanLine, toMonth: string | null) => void;
  afterScope: (line: PlanLine, toMonth: string, scope?: 'month' | 'future') => void;
  commit: (line: PlanLine, toMonth: string | null, scope?: 'month' | 'future') => Promise<void>;
}) {
  const [count, setCount] = useState(3);
  const [want, setWant] = useState({ name: '', amount: '', need: 'nice' as 'must' | 'nice', neededBy: '', splittable: false });
  if (!sheet) return null;
  const close = () => setSheet(null);

  if (sheet.kind === 'item') {
    const l = sheet.line;
    const why = v.waitingText(l);
    return (
      <Modal title={l.name} onClose={close}>
        <div className={styles.sheetList}>
          {l.movable !== false && (
            <button type="button" onClick={() => setSheet({ kind: 'move', line: l })}>
              Move to month
            </button>
          )}
          {l.month && l.movable !== false && (
            <button type="button" onClick={() => moveTo(l, null)}>
              Move to backlog
            </button>
          )}
          {l.movable !== false && (
            <button type="button" onClick={() => setSheet({ kind: 'split', line: l })}>
              Split into payments
            </button>
          )}
          <button type="button" onClick={() => setSheet({ kind: 'why', line: l, text: why ?? 'Paying it in its own month keeps the plan as it is; no later month leaves you more cushion.' })}>
            Why wait?
          </button>
        </div>
      </Modal>
    );
  }
  if (sheet.kind === 'move') {
    return (
      <Modal title={`Move ${sheet.line.name}`} onClose={close}>
        <div className={styles.sheetList}>
          {v.months.map((m) => {
            const blocked = v.blockedReason(sheet.line, m);
            return (
              <button key={m} type="button" disabled={Boolean(blocked) || m === sheet.line.month} onClick={() => moveTo(sheet.line, m)}>
                {monthWord(m)}
                {blocked ? <small>{blocked}</small> : null}
              </button>
            );
          })}
        </div>
      </Modal>
    );
  }
  if (sheet.kind === 'scope') {
    return (
      <Modal title="It repeats" onClose={close}>
        <p className={styles.sheetText}>Move only {monthWord(sheet.line.month ?? '')}&apos;s payment, or this and every month after?</p>
        <div className={styles.sheetList}>
          <button type="button" onClick={() => afterScope(sheet.line, sheet.toMonth, 'month')}>
            This month only
          </button>
          <button type="button" onClick={() => afterScope(sheet.line, sheet.toMonth, 'future')}>
            This and future months
          </button>
        </div>
      </Modal>
    );
  }
  if (sheet.kind === 'friction') {
    const s = sheet;
    return (
      <Modal title="Below your cushion" onClose={close}>
        <p className={styles.sheetText}>{s.effect.message}</p>
        {s.confirmZero && <p className={styles.sheetWarn}>That takes your balance below zero. Place it anyway?</p>}
        <div className={styles.sheetList}>
          <button
            type="button"
            onClick={() => {
              if (s.effect.belowZero && !s.confirmZero) return setSheet({ ...s, confirmZero: true });
              setSheet(null);
              void commit(s.line, s.toMonth, s.scope);
            }}
          >
            Place anyway
          </button>
          {s.line.splittable !== false && (
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                void v.split(s.line.key, 3, s.toMonth);
              }}
            >
              Split into 3 payments
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              void commit(s.line, v.bestMonthFor(s.line.key), s.scope);
            }}
          >
            Find the best month ({monthWord(v.bestMonthFor(s.line.key))})
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }
  if (sheet.kind === 'split') {
    const start = sheet.line.month ?? v.current;
    const preview = v.splitPreview(sheet.line.key, count, start);
    return (
      <Modal title={`Split ${sheet.line.name}`} onClose={close}>
        <div className={styles.splitCount}>
          <button type="button" onClick={() => setCount((c) => Math.max(2, c - 1))} aria-label="Fewer payments">
            −
          </button>
          <span>{count} payments</span>
          <button type="button" onClick={() => setCount((c) => Math.min(12, c + 1))} aria-label="More payments">
            +
          </button>
        </div>
        {preview && (
          <>
            <ul className={styles.splitList}>
              {preview.parts.map((part) => (
                <li key={part.month}>
                  <span>{monthWord(part.month)}</span>
                  <span>{money(part.amount)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.sheetText}>Lowest balance after: {money(preview.lowestAfter)}</p>
          </>
        )}
        <button
          type="button"
          className={`${p.fillButton} ${p.bigButton} ${styles.sheetPrimary}`}
          onClick={() => {
            setSheet(null);
            void v.split(sheet.line.key, count, start);
          }}
        >
          Split into {count} payments
        </button>
      </Modal>
    );
  }
  if (sheet.kind === 'why') {
    return (
      <Modal title="Why wait?" onClose={close}>
        <p className={styles.sheetText}>{sheet.text}</p>
      </Modal>
    );
  }
  if (sheet.kind === 'suggestions') {
    return (
      <Modal title="Auto-allocate" onClose={close}>
        <ul className={styles.splitList}>
          {v.suggestions.map((s) => (
            <li key={s.key}>
              <span>
                {s.name}
                <small>{s.reason}</small>
              </span>
              <span>{s.parts.map((part) => monthWord(part.month).slice(0, 3)).join(', ')}</span>
            </li>
          ))}
        </ul>
        <div className={styles.sheetList}>
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              void v.acceptSuggestions();
            }}
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              void v.rejectSuggestions();
            }}
          >
            Reject all
          </button>
        </div>
      </Modal>
    );
  }
  // Want to buy
  const amount = Number(want.amount);
  return (
    <Modal title="Want to buy" onClose={close}>
      <div className={styles.wantForm}>
        <input placeholder="What" value={want.name} onChange={(e) => setWant({ ...want, name: e.target.value })} />
        <input placeholder="Amount" inputMode="decimal" value={want.amount} onChange={(e) => setWant({ ...want, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
        <span className={styles.segmented} role="radiogroup" aria-label="Need">
          {(['nice', 'must'] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={want.need === n} onClick={() => setWant({ ...want, need: n })}>
              {n === 'must' ? 'Must have' : 'Nice to have'}
            </button>
          ))}
        </span>
        <label>
          Needed by
          <select value={want.neededBy} onChange={(e) => setWant({ ...want, neededBy: e.target.value })}>
            <option value="">No date</option>
            {v.months.map((m) => (
              <option key={m} value={m}>
                {monthWord(m)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={want.splittable} onChange={(e) => setWant({ ...want, splittable: e.target.checked })} /> Can be paid in parts
        </label>
        <button
          type="button"
          className={`${p.fillButton} ${p.bigButton}`}
          disabled={!want.name.trim() || !(amount > 0)}
          onClick={() => {
            void v.addWantToBuy({ name: want.name.trim(), amount, need: want.need, neededBy: want.neededBy || null, splittable: want.splittable }).then(close);
          }}
        >
          Add to backlog
        </button>
      </div>
    </Modal>
  );
}

/** "Show chart": month-end balances as points (tap one for details) and the months compared. */
function ChartPage({ v, onClose }: { v: Logic; onClose: () => void }) {
  const months = v.forecast.months;
  const [picked, setPicked] = useState<string | null>(null);
  const values = months.map((m) => m.endBalance);
  const max = Math.max(v.cushion, ...values, 1);
  const min = Math.min(0, ...values);
  const W = 320;
  const H = 150;
  const x = (i: number) => (months.length <= 1 ? W / 2 : 16 + (i * (W - 32)) / (months.length - 1));
  const y = (val: number) => 10 + ((max - val) / (max - min)) * (H - 20);
  const sel = months.find((m) => m.month === picked) ?? null;
  return (
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={onClose} aria-label="Back to the plan">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Forecast"
      />
      <section className={p.card}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label="Balance at each month end">
          <line x1="0" x2={W} y1={y(v.cushion)} y2={y(v.cushion)} className={styles.cushionLine} />
          <polyline points={months.map((m, i) => `${x(i)},${y(m.endBalance)}`).join(' ')} className={styles.line} />
          {months.map((m, i) => (
            <circle
              key={m.month}
              cx={x(i)}
              cy={y(m.endBalance)}
              r={picked === m.month ? 7 : 5}
              className={styles.point}
              data-tone={m.lowest < 0 ? 'bad' : m.lowest < v.cushion ? 'watch' : undefined}
              onClick={() => setPicked(m.month)}
            />
          ))}
        </svg>
        <p className={styles.muted}>Dashed line: your cushion of {money(v.cushion)}. Tap a month for details.</p>
        {sel && (
          <p className={styles.sheetText}>
            {monthWord(sel.month)}: income {money(sel.income)}, out {money(sel.fixed + sel.flexible + sel.savings + sel.fees)}, lowest {money(sel.lowest)} on {dayMonth(sel.lowestDate)}, month end{' '}
            {money(sel.endBalance)}.
          </p>
        )}
      </section>
      <div className={p.sectionHead}>
        <h2>Months compared</h2>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Month</th>
              <th data-num>Income</th>
              <th data-num>Out</th>
              <th data-num>Left</th>
              <th data-num>Lowest</th>
              <th>On</th>
              <th data-num>Month end</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthWord(m.month).slice(0, 3)}</td>
                <td data-num>{money(m.income)}</td>
                <td data-num>{money(m.fixed + m.flexible + m.savings + m.fees)}</td>
                <td data-num data-tone={m.free < 0 ? 'bad' : undefined}>
                  {money(m.free)}
                </td>
                <td data-num data-tone={m.lowest < 0 ? 'bad' : undefined}>
                  {money(m.lowest)}
                </td>
                <td>{dayMonth(m.lowestDate)}</td>
                <td data-num>{money(m.endBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
