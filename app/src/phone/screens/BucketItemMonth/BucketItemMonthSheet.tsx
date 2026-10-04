'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Check, Plus, Undo2 } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic, type SheetInput } from '@/src/logic/bucketItemMonth/useLogic';
import { monthLabel } from '@/src/shared/budget/monthBudget';
import { useStrings } from '@/src/strings/useStrings';
import styles from '@/src/phone/screens/BucketItemMonth/BucketItemMonthSheet.module.css';

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

// PRD-BUDGETS-V2.md section 6.2 — the item-month sheet: one occurrence of
// one bucket item in one month. Read top to bottom it answers, in order:
// how much is left, how that figure was reached (planned ± moves − spent),
// what to do about it, where the extra money came from or went, and which
// payments were spent against it.
export function BucketItemMonthSheet(props: SheetInput & { onClose: () => void }) {
  const strings = useStrings();
  const s = strings.bucketItemMonth;
  const { entry, month, onClose } = props;
  const logic = useLogic(props);
  const { currency } = logic;
  const isIncome = entry.type === 'Income';
  const over = !isIncome && entry.remaining < 0;
  const status = isIncome ? 'income' : over ? 'over' : 'ok';
  const heroLabel = isIncome ? s.received : over ? s.overspent : s.remaining;
  const heroValue = isIncome ? entry.actual : Math.abs(entry.remaining);
  // Over budget: the bar fills red and a tick marks where "available" was,
  // so the overshoot is visible as the stretch past the tick.
  const fill = entry.available > 0 ? Math.min(100, (entry.actual / entry.available) * 100) : entry.actual > 0 ? 100 : 0;
  const availableTick = over && entry.actual > 0 ? (entry.available / entry.actual) * 100 : null;
  const isMoving = logic.mode === 'cover' || logic.mode === 'reallocate';

  return (
    <Modal title={entry.name} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.meta}>
          <span>{monthLabel(month)}</span>
          <span className={styles.metaDot} aria-hidden />
          <span>{entry.kind === 'Fixed' ? strings.budget.fixedBadge : strings.budget.plannedBadge}</span>
          <span className={styles.metaDot} aria-hidden />
          <span className={styles.metaTruncate}>
            {entry.bucketName} · {entry.categoryName}
          </span>
        </p>

        <section className={styles.hero} data-status={status}>
          <span className={styles.heroLabel}>{heroLabel}</span>
          <span className={styles.heroValue}>
            {formatAmount(heroValue)} <span className={styles.heroCurrency}>{currency}</span>
          </span>
          <div className={styles.meter} aria-hidden>
            <div className={styles.meterFill} data-status={status} style={{ width: `${fill}%` }} />
            {availableTick !== null && <div className={styles.meterTick} style={{ left: `${availableTick}%` }} />}
          </div>
          <span className={styles.heroSub}>
            {formatAmount(entry.actual)} {strings.budget.spentActionLabels[entry.type].toLowerCase()} {strings.budget.ofLabel}{' '}
            {formatAmount(entry.available)} {s.available.toLowerCase()}
          </span>
          {entry.unfunded > 0 && (
            <span className={styles.unfundedChip}>
              {formatAmount(entry.unfunded)} {s.unfunded.toLowerCase()}
            </span>
          )}
        </section>

        <dl className={styles.tiles}>
          <div className={styles.tile}>
            <dt>{s.planned}</dt>
            <dd>{formatAmount(entry.planned)}</dd>
            {entry.isOverride && <span className={styles.tileTag}>{strings.budget.overrideBadge}</span>}
          </div>
          {entry.allocatedIn > 0 && (
            <div className={styles.tile}>
              <dt>{s.allocatedIn}</dt>
              <dd data-tone="in">+{formatAmount(entry.allocatedIn)}</dd>
            </div>
          )}
          {entry.allocatedOut > 0 && (
            <div className={styles.tile}>
              <dt>{s.allocatedOut}</dt>
              <dd data-tone="out">−{formatAmount(entry.allocatedOut)}</dd>
            </div>
          )}
          <div className={styles.tile}>
            <dt>{strings.budget.spentActionLabels[entry.type]}</dt>
            <dd>{formatAmount(entry.actual)}</dd>
          </div>
        </dl>

        {logic.mode === 'view' && (
          <div className={styles.actions}>
            <div className={styles.actionsPrimary}>
              <Link href={logic.recordPaymentHref} className={styles.primaryAction}>
                <Plus size={16} strokeWidth={2.25} />
                {s.recordPayment}
              </Link>
              {logic.canCover ? (
                <button type="button" className={styles.dangerAction} onClick={() => logic.start('cover')}>
                  {s.coverOverspend}
                </button>
              ) : logic.canReallocate ? (
                <button type="button" className={styles.secondaryAction} onClick={() => logic.start('reallocate')}>
                  {s.reallocate}
                </button>
              ) : null}
            </div>
            <div className={styles.actionsQuiet}>
              <button type="button" className={styles.quietAction} onClick={() => logic.start('override')}>
                {s.changeThisMonth}
              </button>
              <span className={styles.metaDot} aria-hidden />
              <button
                type="button"
                className={styles.quietAction}
                onClick={() => logic.skip(onClose)}
                disabled={logic.hasPayments || logic.busy}
                title={logic.hasPayments ? s.skipBlocked : undefined}
              >
                {s.skipMonth}
              </button>
            </div>
            {logic.hasPayments && <p className={styles.hint}>{s.skipBlocked}</p>}
          </div>
        )}

        {isMoving && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              logic.confirmMove();
            }}
          >
            <fieldset className={styles.optionGroup}>
              <legend className={styles.formLegend}>{logic.mode === 'cover' ? s.takeFrom : s.moveTo}</legend>
              <div className={styles.optionList} role="radiogroup">
                {logic.options.map((option) => {
                  const checked = option.id === logic.optionId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={styles.optionCard}
                      onClick={() => logic.chooseOption(option.id)}
                    >
                      <span className={styles.optionRadio} aria-hidden>
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className={styles.optionLabel}>{option.label}</span>
                      {option.available != null && (
                        <span className={styles.optionAvailable}>
                          {formatAmount(option.available)}
                          <span>{s.availablePrefix}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {logic.selected?.isSavings && (
              <label className={styles.field}>
                <span>{s.landsIn}</span>
                <select value={logic.landsInAccountId} onChange={(event) => logic.setLandsInAccountId(event.target.value)}>
                  {logic.spendingAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={styles.field}>
              <span>
                {s.amount} ({currency})
              </span>
              <span className={styles.amountRow}>
                <input
                  inputMode="decimal"
                  value={logic.amountString}
                  onChange={(event) => logic.setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
                />
                <button
                  type="button"
                  className={styles.maxChip}
                  onClick={() => logic.setAmountString(String(logic.maxAmount))}
                  disabled={logic.maxAmount <= 0}
                >
                  {s.max} {formatAmount(logic.maxAmount)}
                </button>
              </span>
            </label>

            <label className={styles.field}>
              <span>{s.note}</span>
              <input value={logic.note} onChange={(event) => logic.setNote(event.target.value)} maxLength={120} />
            </label>

            {logic.error && <p className={styles.error}>{logic.error}</p>}
            <div className={styles.formButtons}>
              <button type="button" className={styles.ghostAction} onClick={() => logic.setMode('view')}>
                {s.cancel}
              </button>
              <button type="submit" className={styles.primaryAction} disabled={logic.busy || !logic.selected}>
                {s.confirmMove}
              </button>
            </div>
          </form>
        )}

        {logic.mode === 'override' && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              logic.saveOverride(Number(logic.amountString));
            }}
          >
            <label className={styles.field}>
              <span>
                {s.overrideAmount} ({currency})
              </span>
              <input
                inputMode="decimal"
                value={logic.amountString}
                onChange={(event) => logic.setAmountString(event.target.value.replace(/[^0-9.]/g, ''))}
              />
            </label>
            {logic.error && <p className={styles.error}>{logic.error}</p>}
            <div className={styles.formButtons}>
              {entry.isOverride && (
                <button type="button" className={styles.ghostAction} onClick={() => logic.saveOverride(null)}>
                  {s.resetThisMonth}
                </button>
              )}
              <button type="button" className={styles.ghostAction} onClick={() => logic.setMode('view')}>
                {s.cancel}
              </button>
              <button type="submit" className={styles.primaryAction} disabled={logic.busy}>
                {s.save}
              </button>
            </div>
          </form>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{s.fundingTrail}</h3>
          {logic.fundingTrail.length === 0 ? (
            <p className={styles.empty}>{s.noFunding}</p>
          ) : (
            <ol className={styles.timeline}>
              {logic.fundingTrail.map((row) => (
                <li key={row.id} className={styles.timelineRow}>
                  <span className={styles.timelineIcon} data-direction={row.incoming ? 'in' : 'out'} aria-hidden>
                    {row.incoming ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  </span>
                  <span className={styles.listMain}>
                    <span className={styles.listTitle}>
                      {row.incoming ? s.fromLabel : s.toLabel} {row.counterpart}
                    </span>
                    <span className={styles.listSub}>
                      {row.date ? `${formatDate(row.date)} · ` : ''}
                      {s.reasons[row.reason]}
                      {row.note ? ` · ${row.note}` : ''}
                    </span>
                  </span>
                  <span className={styles.listAmount} data-direction={row.incoming ? 'in' : 'out'}>
                    {row.incoming ? '+' : '−'}
                    {formatAmount(row.amount)}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={s.undo}
                    onClick={() => logic.setConfirmUndoId(row.id)}
                  >
                    <Undo2 size={14} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{s.payments}</h3>
          {logic.payments.length === 0 ? (
            <p className={styles.empty}>{s.noPayments}</p>
          ) : (
            <ul className={styles.list}>
              {logic.payments.map((row) => (
                <li key={row.id}>
                  <Link href={row.href} className={styles.paymentRow}>
                    <span className={styles.paymentDate}>{formatDate(row.date)}</span>
                    <span className={styles.listMain}>
                      <span className={styles.listTitle}>{row.description || entry.name}</span>
                      <span className={styles.listSub}>{row.account}</span>
                    </span>
                    <span className={styles.listAmount}>{formatAmount(row.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {logic.confirmUndoId && (
        <ConfirmDialog
          title={s.undoConfirmTitle}
          message={
            logic.fundingTrail.find((row) => row.id === logic.confirmUndoId)?.hasTransfer
              ? s.undoSavingsConfirmMessage
              : s.undoConfirmMessage
          }
          confirmLabel={s.undo}
          cancelLabel={s.cancel}
          onConfirm={() => logic.undo(logic.confirmUndoId!)}
          onCancel={() => logic.setConfirmUndoId(null)}
        />
      )}
    </Modal>
  );
}
