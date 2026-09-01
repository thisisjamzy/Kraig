// Security Rules tests (firestore.rules) — the real access boundary now
// (PRD-FIREBASE.md section 9), so this is the thing actually worth testing,
// not any particular screen's code. Run against the Firestore emulator via
// `npm run test:rules` at the repo root (spins the emulator up and down via
// `firebase emulators:exec`).
//
// Every ledger collection (accounts, categories, transactions, transfers,
// budgetRules, settings, exchangeRates, stats*) is a subcollection of
// users/{uid} — each account's data is private, never shared with any other
// account (see firestore.rules' and refs.ts's headers). Every test below
// reaches into a specific uid's own subtree, `users/{uid}/accounts/...`
// etc., never a top-level collection.

import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'dreda-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const ACTIVE_UID = 'active-user';
const ARCHIVED_UID = 'archived-user';
const OTHER_UID = 'other-user';

async function seedActiveUser(uid: string, archived = false) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      email: `${uid}@example.com`,
      name: 'Test User',
      archived,
    });
  });
}

async function seedAccount(uid: string, id: string, extra: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid, 'accounts', id), {
      name: 'Wallet',
      type: 'Wallet',
      currency: 'XAF',
      startingBalance: 0,
      currentBalance: 1000,
      notes: '',
      archived: false,
      ...extra,
    });
  });
}

describe('activeUser() gate — signed out / not yet an active user', () => {
  it('denies every read and write with no auth at all', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1')));
    await assertFails(setDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1'), { name: 'x' }));
  });

  it('denies reads/writes for a signed-in user with no users/{uid} doc yet', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1')));
    await assertFails(
      setDoc(doc(db, 'users', ACTIVE_UID, 'transactions', 'txn1'), {
        amount: 10,
        direction: 'Outflow',
        accountId: 'acc1',
        createdBy: ACTIVE_UID,
      })
    );
  });

  it('denies everything for an archived user', async () => {
    await seedActiveUser(ARCHIVED_UID, true);
    await seedAccount(ARCHIVED_UID, 'acc1');
    const db = testEnv.authenticatedContext(ARCHIVED_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', ARCHIVED_UID, 'accounts', 'acc1')));
  });
});

describe('per-user isolation — one account can never reach another\'s subtree', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
    await seedActiveUser(OTHER_UID);
  });

  it('denies reading another user\'s accounts/categories/transactions/budgetRules', async () => {
    await seedAccount(OTHER_UID, 'acc1');
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'accounts', 'acc1')));
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'categories', 'cat1')));
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'transactions', 'txn1')));
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'budgetRules', 'rule1')));
  });

  it('denies writing into another user\'s accounts, even though the caller is active', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', OTHER_UID, 'accounts', 'acc1'), {
        name: 'Hijacked',
        type: 'Wallet',
        currency: 'XAF',
        startingBalance: 0,
        currentBalance: 0,
        notes: '',
        archived: false,
      })
    );
  });
});

describe('accounts', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
  });

  it('lets an active user read and create their own', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1'), {
        name: 'Wallet',
        type: 'Wallet',
        currency: 'XAF',
        startingBalance: 0,
        currentBalance: 0,
        notes: '',
        archived: false,
      })
    );
    await assertSucceeds(getDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1')));
  });

  it('allows a client update that changes currentBalance (Spark plan: client-maintained, see firestore.rules header)', async () => {
    await seedAccount(ACTIVE_UID, 'acc1', { currentBalance: 1000 });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1'), { currentBalance: 2000 }));
  });

  it('never allows delete, even for the account\'s own active user', async () => {
    await seedAccount(ACTIVE_UID, 'acc1');
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'users', ACTIVE_UID, 'accounts', 'acc1')));
  });
});

describe('transactions', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
  });

  it('rejects create with amount <= 0', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', ACTIVE_UID, 'transactions', 'txn1'), {
        amount: 0,
        direction: 'Outflow',
        accountId: 'acc1',
        createdBy: ACTIVE_UID,
      })
    );
  });

  it('rejects create where createdBy is not the caller', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', ACTIVE_UID, 'transactions', 'txn1'), {
        amount: 10,
        direction: 'Outflow',
        accountId: 'acc1',
        createdBy: OTHER_UID,
      })
    );
  });

  it('accepts a well-formed create, deliberately without signedAmount/month', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', ACTIVE_UID, 'transactions', 'txn1'), {
        amount: 10,
        direction: 'Outflow',
        accountId: 'acc1',
        categoryId: 'cat1',
        createdBy: ACTIVE_UID,
      })
    );
  });

  it('allows delete for the account\'s own active user', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ACTIVE_UID, 'transactions', 'txn1'), {
        amount: 10,
        direction: 'Outflow',
        accountId: 'acc1',
        createdBy: ACTIVE_UID,
      });
    });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'users', ACTIVE_UID, 'transactions', 'txn1')));
  });
});

describe('budgetRules', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
  });

  it('rejects create with a bad frequency', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', ACTIVE_UID, 'budgetRules', 'rule1'), { budgetedAmount: 100, frequency: 'Daily' })
    );
  });

  it('never allows delete — archive in place instead', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ACTIVE_UID, 'budgetRules', 'rule1'), {
        budgetedAmount: 100,
        frequency: 'Monthly',
        archived: false,
      });
    });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'users', ACTIVE_UID, 'budgetRules', 'rule1')));
  });
});

describe('materialized stats — client-maintained (Spark plan, see firestore.rules header)', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
  });

  it('lets an active user read and write their own stats/statsMonthly/statsBudgetProgress', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID, 'stats', 'home'), { totalBalanceBase: 999 }));
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID, 'statsMonthly', '2026-08'), { totalIncome: 999 }));
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID, 'statsBudgetProgress', '2026-08'), { rule1: {} }));
  });

  it('denies reading or writing another user\'s stats', async () => {
    await seedActiveUser(OTHER_UID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OTHER_UID, 'stats', 'home'), { totalBalanceBase: 0 });
    });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'stats', 'home')));
    await assertFails(setDoc(doc(db, 'users', OTHER_UID, 'stats', 'home'), { totalBalanceBase: 999 }));
  });

  it('still blocks a non-active (archived) user from writing their own stats', async () => {
    await seedActiveUser(ARCHIVED_UID, true);
    const db = testEnv.authenticatedContext(ARCHIVED_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', ARCHIVED_UID, 'stats', 'home'), { totalBalanceBase: 999 }));
  });
});

describe('settings and exchangeRates', () => {
  beforeEach(async () => {
    await seedActiveUser(ACTIVE_UID);
  });

  it('lets an active user read/write their own settings/exchangeRates', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', ACTIVE_UID, 'settings', 'app'), {
        totalBudget: 0,
        defaultCurrency: 'XAF',
        displayCurrency: 'XAF',
        timezone: 'UTC',
        householdName: 'Test',
      })
    );
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID, 'exchangeRates', 'XAF'), { rateToBase: 1 }));
  });

  it('denies reading another user\'s settings', async () => {
    await seedActiveUser(OTHER_UID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OTHER_UID, 'settings', 'app'), { defaultCurrency: 'XAF' });
    });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'settings', 'app')));
  });
});

describe('users/{uid}', () => {
  it('lets a signed-in user read their own doc even before it exists', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', ACTIVE_UID)));
  });

  it('denies reading another user\'s doc', async () => {
    await seedActiveUser(OTHER_UID);
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_UID)));
  });

  it('lets a signed-in user create their own doc, non-archived only (Spark plan: no onCreate trigger, see src/shared/firestore/ensureUserDoc.ts)', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID), { email: 'x', name: 'x', archived: false }));
  });

  it('never lets a client create their own doc pre-archived', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', ACTIVE_UID), { email: 'x', name: 'x', archived: true }));
  });

  it('never lets a client create a doc for a different uid', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OTHER_UID), { email: 'x', name: 'x', archived: false }));
  });

  it('allows updating only name/lastLoginAt, never archived', async () => {
    await seedActiveUser(ACTIVE_UID);
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', ACTIVE_UID), { name: 'New Name' }));
    await assertFails(updateDoc(doc(db, 'users', ACTIVE_UID), { archived: true }));
  });

  it('denies updating a different user\'s doc', async () => {
    await seedActiveUser(OTHER_UID);
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', OTHER_UID), { name: 'Hijacked' }));
  });

  it('lets an active user read and write their own private/pin doc (Spark plan: client-side bcrypt now, see src/shared/config/pinCallable.ts)', async () => {
    await seedActiveUser(ACTIVE_UID);
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', ACTIVE_UID, 'private', 'pin'), { pinHash: 'x' }));
    await assertSucceeds(getDoc(doc(db, 'users', ACTIVE_UID, 'private', 'pin')));
  });

  it('denies reading or writing another user\'s private/pin doc', async () => {
    await seedActiveUser(ACTIVE_UID);
    await seedActiveUser(OTHER_UID);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OTHER_UID, 'private', 'pin'), { pinHash: 'x' });
    });
    const db = testEnv.authenticatedContext(ACTIVE_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OTHER_UID, 'private', 'pin')));
    await assertFails(setDoc(doc(db, 'users', OTHER_UID, 'private', 'pin'), { pinHash: 'y' }));
  });

  it('denies an archived user reading or writing even their own private/pin doc', async () => {
    await seedActiveUser(ARCHIVED_UID, true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ARCHIVED_UID, 'private', 'pin'), { pinHash: 'x' });
    });
    const db = testEnv.authenticatedContext(ARCHIVED_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', ARCHIVED_UID, 'private', 'pin')));
    await assertFails(setDoc(doc(db, 'users', ARCHIVED_UID, 'private', 'pin'), { pinHash: 'y' }));
  });
});
