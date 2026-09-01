# Dreda Ledger — setup

Everything here is meant to be doable in one sitting. Total time: 15 to 20 minutes.

## 1. Turn the workbook into a Google Sheet

`Dreda-Ledger.xlsx` is a real Excel file, formulas included, but Apps Script needs it to
actually be a Google Sheet to bind to it.

1. Go to [drive.google.com](https://drive.google.com), click **New → File upload**, pick
   `Dreda-Ledger.xlsx`.
2. Once it's uploaded, double-click it, then **File → Save as Google Sheets** (or right-click
   the file in Drive and choose **Open with → Google Sheets**, then save a copy). Either way
   you end up with a native Sheet, not an `.xlsx` sitting in Drive.
3. Open it, check the **Instructions** tab loaded and the **Accounts** tab shows your 7
   seeded accounts with balances matching their starting balances (nothing's happened yet,
   so Current Balance should equal Starting Balance on every row).

## 2. Attach the script

1. In the Sheet, **Extensions → Apps Script**. A new tab opens with a default
   `Code.gs` containing a `myFunction` stub.
2. Select all of that stub's content and delete it. Paste in the contents of this
   project's `Code.gs`.
3. Click the disk icon (or Cmd/Ctrl+S) to save the project. Name it "Dreda Ledger Backend"
   or similar when prompted.

## 3. Generate the shared secret

1. Still in the Apps Script editor, use the function dropdown at the top (next to Debug)
   and select `generateSharedSecret`.
2. Click **Run**. The first run asks you to authorize the script, since it needs
   permission to read and write the spreadsheet, click through Google's "unverified app"
   warning (it's unverified because it's yours, not published), this is expected.
3. Once it finishes, **View → Logs** (or Ctrl+Enter). Copy the UUID it printed, that's your
   shared secret. Keep this tab open, or re-run the function later if you lose it, it just
   overwrites the stored value.

## 4. Deploy as a web app

1. Top right, **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Description: anything. **Execute as: Me**. **Who has access: Anyone**. (Access control
   is handled by the shared secret inside the request body, not by this setting, Apps Script
   web apps don't support a narrower option here.)
4. Click **Deploy**, authorize again if asked, then copy the **Web app URL** it gives you,
   it ends in `/exec`.

## 5. Wire up the Next.js app

In `app/.env.local` (copy from `.env.local.example` if you haven't already):

```
APPS_SCRIPT_WEB_APP_URL=<the /exec URL from step 4>
APPS_SCRIPT_SHARED_SECRET=<the UUID from step 3>
```

Restart `npm run dev` if it was already running, so it picks up the new env vars.

## 6. Smoke test

Before touching the app, confirm the backend works on its own:

```bash
curl -s -X POST '<your /exec URL>' \
  -H 'Content-Type: application/json' \
  -d '{"action":"reference.bootstrap","token":"<your shared secret>"}' | python3 -m json.tool
```

You should get back `{"ok": true, "data": {"accounts": [...7 accounts...], "categories": [...]}}`.
Then try creating a transaction:

```bash
curl -s -X POST '<your /exec URL>' \
  -H 'Content-Type: application/json' \
  -d '{
        "action": "transactions.create",
        "token": "<your shared secret>",
        "payload": {
          "clientId": "test-1",
          "type": "Expense",
          "description": "Netflix",
          "amount": 6000,
          "date": "2026-08-08",
          "accountId": "acc_momo",
          "categoryId": "cat_subscriptions"
        }
      }' | python3 -m json.tool
```

Check the Sheet, a row should appear in Transactions, and Accounts → MOMO's Current
Balance should have dropped by 6,000. Run the exact same curl command again: because the
`clientId` repeats, it should return the same transaction rather than creating a second
one, that's the idempotency check working. Then try `budgets.listRules` with
`{"month": 8, "year": 2026}` and confirm it shows the 6,000 against Subscriptions' spent.

Now the currency switch:

```bash
curl -s -X POST '<your /exec URL>' \
  -H 'Content-Type: application/json' \
  -d '{"action":"settings.setDisplayCurrency","token":"<your shared secret>","payload":{"currency":"USD"}}' \
  | python3 -m json.tool
```

Re-run the `accounts.list` and `budgets.listRules` calls from above (no changes to the
payload), everything should come back in USD now, MOMO's balance and the 6,000 XAF
Subscriptions spend both converted at the day's rate. Switch back with
`{"currency":"XAF"}` and confirm the numbers return to exactly what they were, nothing on
the sheet moved, only the display conversion changed. `currencies.list` returns the
`ExchangeRates` tab if you want to see what's configured, `currencies.upsertRate` with
`{"currency":"EUR","rateToBase":655.957,"notes":"fixed peg"}` adds or updates one.

## Updating Code.gs after this feature was added

If you already completed steps 1 through 5 before this currency feature existed: paste
the new `Code.gs` over the old one in the Apps Script editor, save, then **Deploy → Manage
deployments**, click the pencil on your existing deployment, and choose **New version**
under Version, then **Deploy**. This keeps the same `/exec` URL, so nothing in
`.env.local` needs to change, it just picks up the new code. A fresh "New deployment"
instead of "New version" would give you a second, different URL, not what you want here.

## No auth setup needed here

This Sheet never held a password and no longer holds a PIN hash either — all user data
(identity, the PIN, whether someone's access is revoked) lives solely in Firebase
Authentication and Firestore, see `PRD-AUTH-FIREBASE.md`. There's no `Users` tab and no
`auth.*` action in `Code.gs`. If you're setting this up fresh, this Sheet is the ledger
only: accounts, categories, transactions, transfers, budgets, currency rates.

## Testing Code.gs changes before deploying

`sheets/test/` runs the ledger action catalog against a mocked Apps Script runtime, no
live Sheet or deployment needed:

```bash
cd sheets && npm test
```

It loads `Code.gs` verbatim into a Node `vm` context standing in for `SpreadsheetApp`,
`Utilities`, `LockService`, `PropertiesService`, and `ContentService`, backed by an
in-memory sheet (see `test/support/gasEnv.js`). Extend this pattern for new actions rather
than hand-testing every change against the live Sheet.

## What this does and doesn't cover yet

Done: the database, the full ledger action catalog (accounts, categories, transactions,
transfers, budget rules with real recurrence, budget/home/statistics/upcoming-payments
aggregation), multi-currency display conversion (switch `DisplayCurrency`, every read
converts, nothing stored ever gets rewritten), the shared-secret auth on every request,
and the two small repo edits (`env.ts`, `appsScriptClient.ts`) needed to send that secret.

Not done here: user accounts, PIN, sign-in — entirely Firebase's job now, see
`PRD-AUTH-FIREBASE.md`, no Apps Script setup involved. Also not done: pushing any of this
to Notion, that's a later iteration per the decision to build Sheets-first — the schema
here doesn't assume Notion is coming, it also doesn't foreclose it, `BudgetRules`,
`Categories`, and `Accounts` all map cleanly onto the databases already audited in Notion
if that bridge gets built later.
