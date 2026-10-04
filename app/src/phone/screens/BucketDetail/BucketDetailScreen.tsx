'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Archive, ArchiveRestore, Trash2, CheckCircle2, Wallet, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useLogic } from '@/src/logic/bucketDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { formatAmount } from '@/src/phone/screens/Buckets/BucketsScreen';
import { NECESSITY_LABEL } from '@/src/viewmodels/projects';
import { BucketItemMonthSheet } from '@/src/screens/BucketItemMonth/BucketItemMonthSheet';
import { itemMonthKey, monthLabel } from '@/src/shared/budget/monthBudget';
import styles from '@/src/phone/screens/BucketDetail/BucketDetailScreen.module.css';

export function BucketDetailScreen({ goalId }: { goalId: string }) {
  const strings = useStrings();
  const router = useRouter();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteBucket, setConfirmDeleteBucket] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [expandedSubItemsId, setExpandedSubItemsId] = useState<string | null>(null);
  const {
    bucket,
    isFixedBucket,
    currency,
    lineItems,
    amountCompleted,
    progress,
    amountRemaining,
    percent,
    deadline,
    accounts,
    categoryOptions,
    isTransferBucket,

    handleDeleteLineItem,
    itemActionError,
    handleAddToBudget,
    thisMonth,
    monthBudget,
    openItemMonthId,
    setOpenItemMonthId,
    toggleSubItemLive,

    currencyOptions,
    bucketEditOpen,
    setBucketEditOpen,
    openBucketEdit,
    bucketName,
    setBucketName,
    bucketDescription,
    setBucketDescription,
    bucketDeadline,
    setBucketDeadline,
    bucketCurrency,
    setBucketCurrency,
    bucketKind,
    setBucketKind,
    bucketTypeEdit,
    setBucketTypeEdit,
    hasNeed,
    savingBucket,
    bucketSaveError,
    handleSaveBucket,

    completeItemId,
    openRecordPayment,
    closeRecordPayment,
    completeAccountId,
    setCompleteAccountId,
    completeToAccountId,
    setCompleteToAccountId,
    completeCharges,
    setCompleteCharges,
    completeAmount,
    setCompleteAmount,
    completeFullyPaid,
    setCompleteFullyPaid,
    completeCategoryId,
    setCompleteCategoryId,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleRecordPayment,

    archiveBucket,
    archived,
    unarchiveBucket,
    deleteBucket,
    goBack,
    loading,
    error,
  } = useLogic(goalId);

  const completingItem = lineItems.find((item) => item.id === completeItemId) ?? null;
  // Every item on this page shares the one bucket's own kind — "Unclassified"
  // only for a bucket written before Fixed/Variable existed, not a per-item
  // distinction.
  const kindBadgeLabel =
    bucket?.kind === 'Fixed' ? strings.buckets.filterFixed : bucket?.kind === 'Variable' ? strings.buckets.filterVariable : strings.buckets.kindUnclassified;
  const kindBadgeClass =
    bucket?.kind === 'Fixed' ? styles.kindBadgeFixed : bucket?.kind === 'Variable' ? styles.kindBadgeVariable : styles.kindBadgeUnclassified;

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.bucketDetail.backLabel}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.bucketDetail.headerTitle}
        right={
          bucket && (
            <ActionMenu
              title={bucket.name}
              ariaLabel={`Actions for ${bucket.name}`}
              items={[
                {
                  key: 'edit',
                  label: strings.bucketDetail.editBucket,
                  icon: <Pencil size={16} strokeWidth={1.75} />,
                  onSelect: openBucketEdit,
                },
                archived
                  ? {
                      key: 'unarchive',
                      label: 'Unarchive bucket',
                      icon: <ArchiveRestore size={16} strokeWidth={1.75} />,
                      onSelect: () => unarchiveBucket(),
                    }
                  : {
                      key: 'archive',
                      label: strings.bucketDetail.archiveBucket,
                      icon: <Archive size={16} strokeWidth={1.75} />,
                      onSelect: () => setConfirmArchive(true),
                      danger: true,
                    },
                {
                  key: 'delete',
                  label: strings.bucketDetail.deleteBucket,
                  icon: <Trash2 size={16} strokeWidth={1.75} />,
                  onSelect: () => setConfirmDeleteBucket(true),
                  danger: true,
                },
              ]}
            />
          )
        }
      />

      {bucket && <p className={styles.bucketName}>{bucket.name}</p>}

      {archived && (
        <div className={styles.archivedBanner}>
          <Archive size={16} strokeWidth={2} aria-hidden />
          <span>Archived, its recorded payments still count in your history and payments calendar.</span>
          <button type="button" onClick={() => unarchiveBucket()}>
            Unarchive
          </button>
        </div>
      )}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && bucket && (
        <>
          <div className={styles.progressCard}>
            <p className={styles.progressHeadline}>
              {progress?.scope === 'month' && <span className={styles.progressScope}>{monthLabel(thisMonth)} · </span>}
              {progress?.doneCount ?? 0} / {progress?.itemCount ?? 0} {strings.buckets.itemsDone} ({percent}%)
            </p>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.amountRow}>
              <span className={styles.amountValue}>
                {formatAmount(amountCompleted)} {currency}
              </span>
              <span className={styles.amountValue}>
                {formatAmount(amountRemaining)} {currency}
              </span>
            </div>
            {deadline && (
              <p className={styles.deadlineRow}>
                {strings.bucketDetail.deadlinePrefix}{' '}
                {deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
              </p>
            )}
          </div>

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>{strings.bucketDetail.lineItemsTitle}</h2>
            <Link href={`/add-bucket-item/${goalId}`} className={styles.addIconButton} aria-label={strings.bucketDetail.addLineItem}>
              <Plus size={16} strokeWidth={2.25} />
            </Link>
          </div>

          {itemActionError && <p className={styles.errorText}>{itemActionError}</p>}

          {lineItems.length === 0 ? (
            <p className={styles.emptyText}>{strings.bucketDetail.emptyLineItems}</p>
          ) : (
            <div className={styles.list}>
              {lineItems.map((item) => (
                <div key={item.id} className={styles.lineItem}>
                  <div className={styles.lineItemHeaderRow}>
                    <div className={styles.lineItemHeaderLeft}>
                      <p className={styles.lineItemCategoryText}>{item.categoryName}</p>
                      {(isFixedBucket || item.dueDateObj) && (
                        <span className={styles.addedToBudgetTag}>{strings.bucketDetail.addedToBudgetTag}</span>
                      )}
                    </div>
                    <div className={styles.lineItemHeaderRight}>
                      <p className={item.dueDateObj ? styles.dueDateText : styles.dueDateTextPlaceholder}>
                        {item.dueDateObj
                          ? item.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                          : strings.bucketDetail.dueDateNone}
                      </p>
                      <ActionMenu
                        title={item.name}
                        ariaLabel={`Actions for ${item.name}`}
                        items={[
                          ...(!isFixedBucket && !item.completed && !item.dueDateObj
                            ? [
                                {
                                  key: 'addToBudget',
                                  label: strings.bucketDetail.addToBudget,
                                  icon: <Wallet size={16} strokeWidth={1.75} />,
                                  onSelect: () => handleAddToBudget(item.id),
                                },
                              ]
                            : []),
                          ...(!item.completed
                            ? [
                                {
                                  key: 'complete',
                                  label: item.isPartial ? strings.bucketDetail.recordAnotherPayment : strings.bucketDetail.recordPayment,
                                  icon: <CheckCircle2 size={16} strokeWidth={1.75} />,
                                  onSelect: () => openRecordPayment(item),
                                },
                              ]
                            : []),
                          {
                            key: 'edit',
                            label: strings.bucketDetail.editLineItem,
                            icon: <Pencil size={16} strokeWidth={1.75} />,
                            onSelect: () => router.push(`/edit-bucket-item/${goalId}/${item.id}`),
                          },
                          {
                            key: 'delete',
                            label: strings.bucketDetail.deleteLineItem,
                            icon: <Trash2 size={16} strokeWidth={1.75} />,
                            onSelect: () => setConfirmDeleteItemId(item.id),
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div className={styles.lineItemNameRow}>
                    <p className={styles.lineItemName}>{item.name}</p>
                    <p className={styles.lineItemAmount}>
                      {formatAmount(item.amount)} {currency}
                    </p>
                  </div>

                  {(() => {
                    const entry = monthBudget.budget.itemsByKey.get(itemMonthKey(item.id, thisMonth));
                    if (!entry) return null;
                    const isIncome = entry.type === 'Income';
                    const over = !isIncome && entry.remaining < 0;
                    const fill =
                      entry.available > 0 ? Math.min(100, (entry.actual / entry.available) * 100) : entry.actual > 0 ? 100 : 0;
                    return (
                      <button type="button" className={styles.thisMonthRow} onClick={() => setOpenItemMonthId(entry.key)}>
                        <span className={styles.thisMonthTop}>
                          <span className={styles.thisMonthLabel}>{monthLabel(thisMonth)}</span>
                          <span className={styles.thisMonthFigures}>
                            {formatAmount(entry.actual)} / {formatAmount(entry.available)} {currency}
                          </span>
                          <span className={over ? styles.thisMonthOver : styles.thisMonthOk}>
                            {isIncome
                              ? strings.budget.receivedLabel
                              : over
                                ? `${strings.budget.overLabel} ${formatAmount(-entry.remaining)}`
                                : `${formatAmount(Math.max(0, entry.remaining))} ${strings.budget.remainingLabel.toLowerCase()}`}
                          </span>
                        </span>
                        <span className={styles.thisMonthBar} aria-hidden>
                          <span
                            className={styles.thisMonthBarFill}
                            data-status={isIncome ? 'income' : over ? 'over' : 'ok'}
                            style={{ width: `${fill}%` }}
                          />
                        </span>
                      </button>
                    );
                  })()}

                  {/* Cumulative across every month — only meaningful for a
                      one-off (Planned) item; a Fixed item's own status is
                      per month, the row above. */}
                  {!isFixedBucket && (item.completed || item.spentAmount > 0) && (
                    <div className={styles.lineItemProgressSection}>
                      <div className={styles.lineItemProgressTrack}>
                        <div
                          className={styles.lineItemProgressFill}
                          style={{ width: `${Math.min(100, Math.round((item.displaySpentAmount / item.amount) * 100))}%` }}
                        />
                      </div>
                      <div className={styles.lineItemProgressRow}>
                        <span className={styles.lineItemProgressLabel}>
                          {strings.bucketDetail.spentSoFarPrefix} {formatAmount(item.displaySpentAmount)} {strings.bucketDetail.ofSuffix}{' '}
                          {formatAmount(item.amount)} {currency}
                        </span>
                        <div className={styles.lineItemPaymentsRow}>
                          {item.displayPayments.map((payment, index) => (
                            <Link
                              key={payment.id}
                              href={payment.kind === 'transfer' ? `/edit-transfer/${payment.id}` : `/edit-transaction/${payment.id}`}
                              className={styles.paymentChip}
                            >
                              {item.displayPayments.length > 1
                                ? `${strings.bucketDetail.paymentChipPrefix} ${index + 1}`
                                : formatAmount(payment.amount)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.lineItemTagRow}>
                    <span className={kindBadgeClass}>{kindBadgeLabel}</span>
                    {hasNeed && (
                      <>
                        <span className={styles.priorityTag}>{item.priority}</span>
                        <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
                          {NECESSITY_LABEL[item.necessity]}
                        </span>
                      </>
                    )}
                    {isFixedBucket ? null : item.completed ? (
                      <span className={styles.doneTag}>{strings.bucketDetail.completedTag}</span>
                    ) : item.isPartial ? (
                      <span className={styles.partialTag}>{strings.bucketDetail.partialTag}</span>
                    ) : (
                      <span className={item.hasFunds ? styles.fundsBadgeOk : styles.fundsBadgeShort}>
                        {item.hasFunds ? 'Possible' : 'Not possible'}
                      </span>
                    )}
                  </div>

                  {item.subItems.length > 0 && (
                    <div className={styles.subItemsSection}>
                      <button
                        type="button"
                        className={styles.subItemsSummaryRow}
                        onClick={() => setExpandedSubItemsId((current) => (current === item.id ? null : item.id))}
                      >
                        <span className={styles.subItemsSummaryText}>
                          {item.subItems.filter((s) => s.completed).length}/{item.subItems.length}{' '}
                          {strings.bucketDetail.subItemsLabel.toLowerCase()} &bull; {formatAmount(item.subItemsConsumed)}{' '}
                          {strings.bucketDetail.subItemsOfSuffix} {formatAmount(item.amount)}
                        </span>
                        {expandedSubItemsId === item.id ? (
                          <ChevronUp size={14} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={14} strokeWidth={2} />
                        )}
                      </button>
                      {expandedSubItemsId === item.id && (
                        <div className={styles.subItemsExpandedList}>
                          {item.subItems.map((subItem) => (
                            <label key={subItem.id} className={styles.subItemsExpandedRow}>
                              <input
                                type="checkbox"
                                checked={subItem.completed}
                                onChange={() => toggleSubItemLive(item.id, subItem.id)}
                              />
                              <span
                                className={`${styles.subItemsExpandedName} ${subItem.completed ? styles.subItemsExpandedNameDone : ''}`}
                              >
                                {subItem.name}
                              </span>
                              <span className={styles.subItemsExpandedAmount}>{formatAmount(subItem.amount)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {completingItem && (
        <Modal
          title={completingItem.isPartial ? strings.markLineItemComplete.titleAnother : strings.markLineItemComplete.title}
          onClose={closeRecordPayment}
        >
          {completingItem.spentAmount > 0 && (
            <p className={styles.formHint}>
              {strings.bucketDetail.spentSoFarPrefix} {formatAmount(completingItem.spentAmount)} {strings.bucketDetail.ofSuffix}{' '}
              {formatAmount(completingItem.amount)} {currency}
            </p>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-account">
              {isTransferBucket ? strings.markLineItemComplete.fromAccountLabel : strings.markLineItemComplete.accountLabel}
            </label>
            <select
              id="complete-account"
              className={styles.formInput}
              value={completeAccountId}
              onChange={(event) => setCompleteAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          {isTransferBucket && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="complete-to-account">
                {strings.markLineItemComplete.toAccountLabel}
              </label>
              <select
                id="complete-to-account"
                className={styles.formInput}
                value={completeToAccountId}
                onChange={(event) => setCompleteToAccountId(event.target.value)}
              >
                {accounts
                  .filter((account) => account.id !== completeAccountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-amount">
              {strings.markLineItemComplete.amountLabel}
            </label>
            <input
              id="complete-amount"
              inputMode="numeric"
              className={styles.formInput}
              value={completeAmount}
              onChange={(event) => setCompleteAmount(event.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.markLineItemComplete.statusLabel}</span>
            <div className={styles.statusToggle}>
              <button
                type="button"
                className={`${styles.statusToggleOption} ${completeFullyPaid ? styles.statusToggleOptionActive : ''}`}
                onClick={() => setCompleteFullyPaid(true)}
              >
                {strings.markLineItemComplete.fullyPaidLabel}
              </button>
              <button
                type="button"
                className={`${styles.statusToggleOption} ${!completeFullyPaid ? styles.statusToggleOptionActive : ''}`}
                onClick={() => setCompleteFullyPaid(false)}
              >
                {strings.markLineItemComplete.partiallyPaidLabel}
              </button>
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-category">
              {isTransferBucket ? strings.markLineItemComplete.transferTypeLabel : strings.markLineItemComplete.categoryLabel}
            </label>
            <select
              id="complete-category"
              className={styles.formInput}
              value={completeCategoryId}
              onChange={(event) => setCompleteCategoryId(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          {isTransferBucket && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="complete-charges">
                {strings.markLineItemComplete.chargesLabel}
              </label>
              <input
                id="complete-charges"
                inputMode="numeric"
                className={styles.formInput}
                value={completeCharges}
                onChange={(event) => setCompleteCharges(event.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-date">
              {strings.markLineItemComplete.dateLabel}
            </label>
            <input
              id="complete-date"
              type="date"
              className={styles.formInput}
              value={completeDate}
              onChange={(event) => setCompleteDate(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-description">
              {strings.markLineItemComplete.descriptionLabel}
            </label>
            <input
              id="complete-description"
              className={styles.formInput}
              value={completeDescription}
              onChange={(event) => setCompleteDescription(event.target.value)}
            />
          </div>
          {completingItem && !completingItem.hasFunds && (
            <p className={styles.errorText}>{strings.markLineItemComplete.frozenBlocked}</p>
          )}
          {completeError && <p className={styles.errorText}>{completeError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={
              !completeAccountId ||
              !(Number(completeAmount) > 0) ||
              completing ||
              (isTransferBucket && (!completeToAccountId || completeToAccountId === completeAccountId))
            }
            onClick={handleRecordPayment}
          >
            {completing ? strings.markLineItemComplete.saving : strings.markLineItemComplete.save}
          </button>
        </Modal>
      )}

      {bucketEditOpen && (
        <Modal title={strings.bucketDetail.editBucket} onClose={() => setBucketEditOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="bucket-name">
              {strings.createBucket.nameLabel}
            </label>
            <input
              id="bucket-name"
              className={styles.formInput}
              value={bucketName}
              onChange={(event) => setBucketName(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="bucket-description">
              {strings.createBucket.descriptionLabel}
            </label>
            <textarea
              id="bucket-description"
              className={styles.formTextarea}
              rows={2}
              value={bucketDescription}
              onChange={(event) => setBucketDescription(event.target.value)}
            />
          </div>
          {bucketKind !== 'Fixed' && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="bucket-deadline">
                {strings.createBucket.deadlineLabel}
              </label>
              <input
                id="bucket-deadline"
                type="date"
                className={styles.formInput}
                value={bucketDeadline}
                onChange={(event) => setBucketDeadline(event.target.value)}
              />
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="bucket-currency">
              {strings.createBucket.currencyLabel}
            </label>
            <select
              id="bucket-currency"
              className={styles.formInput}
              value={bucketCurrency}
              onChange={(event) => setBucketCurrency(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="bucket-type">
              {strings.createBucket.typeLabel}
            </label>
            <select
              id="bucket-type"
              className={styles.formInput}
              value={bucketTypeEdit}
              onChange={(event) => setBucketTypeEdit(event.target.value as typeof bucketTypeEdit)}
            >
              <option value="Expense">{strings.createBucket.typeExpense}</option>
              <option value="Income">{strings.createBucket.typeIncome}</option>
              <option value="Savings">{strings.createBucket.typeSavings}</option>
              <option value="Transfer">{strings.createBucket.typeTransfer}</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="bucket-kind">
              {strings.createBucket.kindLabel}
            </label>
            <select
              id="bucket-kind"
              className={styles.formInput}
              value={bucketKind}
              onChange={(event) => {
                const next = event.target.value as typeof bucketKind;
                setBucketKind(next);
                // A Fixed bucket repeats — its one-off target date field is
                // hidden above, so drop any value it held rather than
                // saving a stale deadline behind a hidden field.
                if (next === 'Fixed') setBucketDeadline('');
              }}
            >
              <option value="Variable">{strings.createBucket.kindVariable}</option>
              <option value="Fixed">{strings.createBucket.kindFixed}</option>
            </select>
          </div>
          <p className={styles.hintText}>{strings.bucketDetail.editKindTypeHint}</p>
          {bucketSaveError && <p className={styles.errorText}>{bucketSaveError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!bucketName.trim() || savingBucket}
            onClick={handleSaveBucket}
          >
            {savingBucket ? strings.bucketDetail.saving : strings.bucketDetail.save}
          </button>
        </Modal>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={strings.buckets.archiveBucketConfirmTitle}
          message={strings.buckets.archiveBucketConfirmMessage}
          confirmLabel={strings.bucketDetail.archiveBucket}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            setConfirmArchive(false);
            archiveBucket();
          }}
          onCancel={() => setConfirmArchive(false)}
        />
      )}

      {confirmDeleteBucket && (
        <ConfirmDialog
          title={strings.buckets.deleteBucketConfirmTitle}
          message={strings.buckets.deleteBucketConfirmMessage}
          confirmLabel={strings.buckets.deleteBucketAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            setConfirmDeleteBucket(false);
            deleteBucket();
          }}
          onCancel={() => setConfirmDeleteBucket(false)}
        />
      )}

      {confirmDeleteItemId && (
        <ConfirmDialog
          title={strings.bucketDetail.deleteLineItemConfirmTitle}
          message={strings.bucketDetail.deleteLineItemConfirmMessage}
          confirmLabel={strings.bucketDetail.deleteLineItem}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            handleDeleteLineItem(confirmDeleteItemId);
            setConfirmDeleteItemId(null);
          }}
          onCancel={() => setConfirmDeleteItemId(null)}
        />
      )}
      {openItemMonthId && monthBudget.budget.itemsByKey.get(openItemMonthId) && (
        <BucketItemMonthSheet
          entry={monthBudget.budget.itemsByKey.get(openItemMonthId)!}
          month={thisMonth}
          budget={monthBudget.budget}
          buckets={monthBudget.buckets}
          itemsByBucket={monthBudget.itemsByBucket}
          allocations={monthBudget.allocations}
          transactionsById={monthBudget.transactionsById}
          transfersById={monthBudget.transfersById}
          onClose={() => setOpenItemMonthId(null)}
        />
      )}
    </div>
  );
}
