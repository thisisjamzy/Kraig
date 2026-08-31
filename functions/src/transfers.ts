// onTransferWrite — transactions.ts's counterpart, but simpler: a transfer
// only ever moves money between two of the household's own accounts, it's
// never income or expense, so it touches account balances only, never
// stats/monthly or stats/home's income/expense fields. (It also doesn't
// change stats/home.totalBalanceBase in the common case — money leaving one
// of the household's own accounts and landing in another nets to zero
// across the two — except when they hold different currencies, where the
// same asymmetry sheets/SCHEMA.md already documented as a known limitation
// applies here too: the two legs aren't specially reconciled.)
//
// Same reverse-then-apply pattern as onTransactionWrite for the same
// reason: provably correct across create/edit/delete/move without having
// to special-case which fields changed.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { db } from './lib/firestore';

interface TransferContribution {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

function contributionOf(data: DocumentData | undefined): TransferContribution | null {
  if (!data || !data.fromAccountId || !data.toAccountId) return null;
  const amount = Number(data.amount) || 0;
  if (amount === 0) return null;
  return { fromAccountId: data.fromAccountId, toAccountId: data.toAccountId, amount };
}

export const onTransferWrite = onDocumentWritten('users/{uid}/transfers/{transferId}', async (event) => {
  const uid = event.params.uid;
  const beforeSnap = event.data?.before;
  const afterSnap = event.data?.after;
  const before = contributionOf(beforeSnap?.exists ? beforeSnap.data() : undefined);
  const after = contributionOf(afterSnap?.exists ? afterSnap.data() : undefined);
  if (!before && !after) return;

  const accounts = db.collection('users').doc(uid).collection('accounts');
  const batch = db.batch();
  for (const [c, sign] of [
    [before, -1],
    [after, 1],
  ] as const) {
    if (!c) continue;
    batch.update(accounts.doc(c.fromAccountId), {
      currentBalance: FieldValue.increment(-sign * c.amount),
    });
    batch.update(accounts.doc(c.toAccountId), {
      currentBalance: FieldValue.increment(sign * c.amount),
    });
  }
  await batch.commit();
});
