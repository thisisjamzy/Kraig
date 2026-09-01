/**
 * Kraig Ledger — Apps Script backend
 *
 * Bound to the Kraig-Ledger Google Sheet. Serves the same {action, payload}
 * contract the Next.js app's appsScriptClient.ts already speaks, reading and
 * writing the sheet instead of Notion. See SETUP.md for deployment steps.
 *
 * Every write is guarded by a shared secret carried in the request body
 * (not a header — doPost(e) in Apps Script has no reliable access to custom
 * request headers, so the token travels inside the JSON payload instead).
 *
 * Currency: every account keeps its own recorded (native) currency, nothing
 * on the sheet ever gets rewritten into a different currency. Settings!
 * DisplayCurrency is the toggle — every *read* (accounts.list, transactions.
 * list, budgets, the dashboards) converts its amounts into that currency on
 * the way out, live, using the ExchangeRates tab. Switch it and everything
 * the app reads back changes currency; the ledger underneath doesn't move.
 * Write actions (transactions.create, etc.) always echo back in the native
 * currency of what was actually written, never converted.
 */

// ------------------------------------------------------------- Entry points

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut_(errEnvelope_('VALIDATION', 'Empty request body'));
    }
    var body = JSON.parse(e.postData.contents);
    var secret = getSharedSecret_();
    if (secret && body.token !== secret) {
      return jsonOut_(errEnvelope_('UNAUTHORIZED', 'Invalid or missing token'));
    }
    var payload = body.payload || {};
    var clientId = payload.clientId || body.clientId || null;
    var data = routeAction_(body.action, payload, clientId);
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    var code = (err && err.code) ? err.code : 'UPSTREAM_ERROR';
    var message = (err && err.message) ? err.message : String(err);
    return jsonOut_(errEnvelope_(code, message));
  }
}

function doGet(e) {
  return jsonOut_({ ok: true, message: 'Kraig Apps Script is running. POST an action to use it.' });
}

function routeAction_(action, payload, clientId) {
  switch (action) {
    case 'reference.bootstrap':
      return {
        accounts: listAccounts_(payload),
        categories: listCategories_({}),
        settings: getSettings_(),
        currencies: listCurrencies_(),
      };
    case 'accounts.list':
      return listAccounts_(payload);
    case 'categories.list':
      return listCategories_(payload);
    case 'transactions.list':
      return listTransactions_(payload);
    case 'transactions.create':
      return createTransaction_(payload, clientId);
    case 'transactions.update':
      return updateTransaction_(payload);
    case 'transactions.delete':
      return deleteTransaction_(payload);
    case 'transfers.list':
      return listTransfers_(payload);
    case 'transfers.create':
      return createTransfer_(payload, clientId);
    case 'budgets.listRules':
      return listBudgetsForMonth_(payload);
    case 'budgets.upsertRule':
      return upsertBudgetRule_(payload);
    case 'budgets.getRule':
      return getBudgetRule_(payload);
    case 'budgets.deleteRule':
      return deleteBudgetRule_(payload);
    case 'budgets.summary':
      return budgetsSummary_(payload);
    case 'budgets.upcoming':
      return upcomingBudgetPayments_(payload);
    case 'home.dashboard':
      return homeDashboard_(payload);
    case 'statistics.dashboard':
      return statisticsDashboard_(payload);
    case 'settings.get':
      return getSettings_();
    case 'settings.setDisplayCurrency':
      return setDisplayCurrency_(payload);
    case 'settings.setTotalBudget':
      return setTotalBudget_(payload);
    case 'currencies.list':
      return listCurrencies_();
    case 'currencies.upsertRate':
      return upsertExchangeRate_(payload);
    default:
      throw mkErr_('VALIDATION', 'Unknown action: ' + action);
  }
}

// ---------------------------------------------------------------- One-time setup

/**
 * Run this once from the Apps Script editor (Select function → generateSharedSecret
 * → Run), then check View → Logs for the value. Paste it into APPS_SCRIPT_SHARED_SECRET
 * in the Next.js app's .env.local. Re-running replaces the stored secret.
 */
function generateSharedSecret() {
  var token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('SHARED_SECRET', token);
  Logger.log('Shared secret (copy into APPS_SCRIPT_SHARED_SECRET): ' + token);
  return token;
}

function getSharedSecret_() {
  return PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kraig')
    .addItem('Refresh Budget Progress', 'refreshBudgetProgress')
    .addToUi();
}

// ------------------------------------------------------------------ Accounts

function listAccounts_(payload) {
  var ctx = buildCurrencyContext_(payload);
  return readTable_(getSheet_('Accounts'))
    .filter(function (r) { return !r.Archived; })
    .map(function (r) { return mapAccountDisplay_(r, ctx); });
}

/** Converted for display — every account's balance shown in ctx.display. */
function mapAccountDisplay_(r, ctx) {
  var native = r.Currency || ctx.base;
  return {
    id: r.ID,
    name: r.Name,
    type: r.Type,
    currency: ctx.display,
    nativeCurrency: native,
    startingBalance: toDisplay_(ctx, Number(r.StartingBalance) || 0, native),
    currentBalance: toDisplay_(ctx, Number(r.CurrentBalance) || 0, native),
    notes: r.Notes || '',
  };
}

// ---------------------------------------------------------------- Categories

function listCategories_(payload) {
  payload = payload || {};
  var rows = readTable_(getSheet_('Categories')).filter(function (r) { return !r.Archived; });
  if (payload.type) rows = rows.filter(function (r) { return r.TransactionType === payload.type; });
  return rows.map(function (r) {
    return { id: r.ID, name: r.Name, transactionType: r.TransactionType, group: r.Group };
  });
}

function categoryLookup_() {
  var map = {};
  readTable_(getSheet_('Categories')).forEach(function (r) {
    map[r.ID] = { name: r.Name, type: r.TransactionType };
  });
  return map;
}

// -------------------------------------------------------------- Transactions

function listTransactions_(payload) {
  payload = payload || {};
  var ctx = buildCurrencyContext_(payload);
  var rows = readTable_(getSheet_('Transactions'));
  if (payload.from) rows = rows.filter(function (r) { return isoDate_(r.Date) >= payload.from; });
  if (payload.to) rows = rows.filter(function (r) { return isoDate_(r.Date) <= payload.to; });
  if (payload.accountId) rows = rows.filter(function (r) { return r.AccountID === payload.accountId; });
  if (payload.categoryId) rows = rows.filter(function (r) { return r.CategoryID === payload.categoryId; });
  if (payload.type) rows = rows.filter(function (r) { return r.Type === payload.type; });
  rows.sort(function (a, b) { return isoDate_(b.Date).localeCompare(isoDate_(a.Date)); });

  var limit = payload.limit || 200;
  var offset = payload.offset || 0;
  var page = rows.slice(offset, offset + limit);
  return {
    items: page.map(function (r) { return mapTransactionDisplay_(r, ctx); }),
    total: rows.length,
    nextOffset: offset + limit < rows.length ? offset + limit : null,
  };
}

/** Write-echo shape: native currency, unconverted, "what you sent is what you get". */
function mapTransaction_(r) {
  return {
    id: r.ID,
    date: isoDate_(r.Date),
    type: r.Type,
    description: r.Description,
    accountId: r.AccountID,
    categoryId: r.CategoryID,
    amount: Number(r.Amount) || 0,
    direction: r.Direction,
  };
}

/** Read shape: converted into ctx.display, native amount kept alongside for transparency. */
function mapTransactionDisplay_(r, ctx) {
  var native = txnCurrency_(ctx, r.AccountID);
  var nativeAmount = Number(r.Amount) || 0;
  return {
    id: r.ID,
    date: isoDate_(r.Date),
    type: r.Type,
    description: r.Description,
    accountId: r.AccountID,
    categoryId: r.CategoryID,
    amount: toDisplay_(ctx, nativeAmount, native),
    currency: ctx.display,
    nativeAmount: nativeAmount,
    nativeCurrency: native,
    direction: r.Direction,
  };
}

function createTransaction_(payload, clientId) {
  requireFields_(payload, ['type', 'description', 'amount', 'date', 'accountId', 'categoryId']);
  var sheet = getSheet_('Transactions');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (clientId) {
      var existingRow = findRowByValue_(sheet, 2, clientId);
      if (existingRow > 0) return mapTransaction_(rowToObj_(sheet, existingRow));
    }
    var direction = payload.direction || (payload.type === 'Income' ? 'Inflow' : 'Outflow');
    var id = 'txn_' + Utilities.getUuid().slice(0, 8);
    var row = findFirstEmptyRow_(sheet, 1);
    sheet.getRange(row, 1, 1, 9).setValues([[
      id, clientId || '', new Date(payload.date), payload.type, payload.description,
      payload.accountId, payload.categoryId, Number(payload.amount), direction,
    ]]);
    sheet.getRange(row, 12).setValue(new Date());
    return mapTransaction_({
      ID: id, Date: new Date(payload.date), Type: payload.type, Description: payload.description,
      AccountID: payload.accountId, CategoryID: payload.categoryId, Amount: payload.amount, Direction: direction,
    });
  } finally {
    lock.releaseLock();
  }
}

function updateTransaction_(payload) {
  requireFields_(payload, ['id']);
  var sheet = getSheet_('Transactions');
  var row = findRowById_(sheet, payload.id);
  if (row < 0) throw mkErr_('NOT_FOUND', 'Transaction not found: ' + payload.id);
  var patch = payload.patch || {};
  var colMap = { date: 3, type: 4, description: 5, accountId: 6, categoryId: 7, amount: 8, direction: 9 };
  Object.keys(patch).forEach(function (k) {
    if (!colMap[k]) return;
    var v = patch[k];
    if (k === 'date') v = new Date(v);
    if (k === 'amount') v = Number(v);
    sheet.getRange(row, colMap[k]).setValue(v);
  });
  return mapTransaction_(rowToObj_(sheet, row));
}

function deleteTransaction_(payload) {
  requireFields_(payload, ['id']);
  var sheet = getSheet_('Transactions');
  var row = findRowById_(sheet, payload.id);
  if (row < 0) throw mkErr_('NOT_FOUND', 'Transaction not found: ' + payload.id);
  sheet.getRange(row, 1, 1, 9).clearContent();
  sheet.getRange(row, 12).clearContent();
  return { ok: true };
}

// ----------------------------------------------------------------- Transfers

function listTransfers_(payload) {
  payload = payload || {};
  var ctx = buildCurrencyContext_(payload);
  var rows = readTable_(getSheet_('Transfers'));
  if (payload.from) rows = rows.filter(function (r) { return isoDate_(r.Date) >= payload.from; });
  if (payload.to) rows = rows.filter(function (r) { return isoDate_(r.Date) <= payload.to; });
  rows.sort(function (a, b) { return isoDate_(b.Date).localeCompare(isoDate_(a.Date)); });
  return rows.map(function (r) { return mapTransferDisplay_(r, ctx); });
}

/** Write-echo shape: native currency, unconverted. */
function mapTransfer_(r) {
  return {
    id: r.ID,
    date: isoDate_(r.Date),
    description: r.Description,
    fromAccountId: r.FromAccountID,
    toAccountId: r.ToAccountID,
    amount: Number(r.Amount) || 0,
    kind: r.Kind || '',
    notes: r.Notes || '',
  };
}

/**
 * Read shape: converted into ctx.display. Assumes the transfer is recorded
 * in the FromAccount's currency (a transfer between two accounts held in
 * different currencies isn't specially reconciled, see SCHEMA.md).
 */
function mapTransferDisplay_(r, ctx) {
  var native = txnCurrency_(ctx, r.FromAccountID);
  var nativeAmount = Number(r.Amount) || 0;
  return {
    id: r.ID,
    date: isoDate_(r.Date),
    description: r.Description,
    fromAccountId: r.FromAccountID,
    toAccountId: r.ToAccountID,
    amount: toDisplay_(ctx, nativeAmount, native),
    currency: ctx.display,
    nativeAmount: nativeAmount,
    nativeCurrency: native,
    kind: r.Kind || '',
    notes: r.Notes || '',
  };
}

function createTransfer_(payload, clientId) {
  requireFields_(payload, ['description', 'amount', 'date', 'fromAccountId', 'toAccountId']);
  var sheet = getSheet_('Transfers');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (clientId) {
      var existingRow = findRowByValue_(sheet, 2, clientId);
      if (existingRow > 0) return mapTransfer_(rowToObj_(sheet, existingRow));
    }
    var id = 'trf_' + Utilities.getUuid().slice(0, 8);
    var row = findFirstEmptyRow_(sheet, 1);
    sheet.getRange(row, 1, 1, 9).setValues([[
      id, clientId || '', new Date(payload.date), payload.description,
      payload.fromAccountId, payload.toAccountId, Number(payload.amount),
      payload.kind || '', payload.notes || '',
    ]]);
    sheet.getRange(row, 10).setValue(new Date());
    return mapTransfer_({
      ID: id, Date: new Date(payload.date), Description: payload.description,
      FromAccountID: payload.fromAccountId, ToAccountID: payload.toAccountId,
      Amount: payload.amount, Kind: payload.kind || '', Notes: payload.notes || '',
    });
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------- Budgets & recurrence

function listBudgetRulesRaw_() {
  return readTable_(getSheet_('BudgetRules'))
    .filter(function (r) { return !r.Archived; })
    .map(mapRule_);
}

function mapRule_(r) {
  return {
    id: r.ID,
    categoryId: r.CategoryID,
    description: r.Description,
    budgetedAmount: Number(r.BudgetedAmount) || 0,
    frequency: r.Frequency || 'Monthly',
    interval: Number(r.Interval) || 1,
    anchorDate: isoDate_(r.AnchorDate),
    endCondition: r.EndCondition || 'Never',
    endOccurrences: r.EndOccurrences ? Number(r.EndOccurrences) : null,
    endDate: r.EndDate ? isoDate_(r.EndDate) : null,
    accountId: r.AccountID || null,
    tag: r.Tag || '',
  };
}

function upsertBudgetRule_(payload) {
  requireFields_(payload, ['categoryId', 'budgetedAmount', 'frequency', 'anchorDate']);
  var sheet = getSheet_('BudgetRules');
  var row, id;
  if (payload.id) {
    row = findRowById_(sheet, payload.id);
    if (row < 0) throw mkErr_('NOT_FOUND', 'Budget rule not found: ' + payload.id);
    id = payload.id;
  } else {
    id = 'rule_' + Utilities.getUuid().slice(0, 8);
    row = findFirstEmptyRow_(sheet, 1);
  }
  sheet.getRange(row, 1, 1, 13).setValues([[
    id, payload.categoryId, payload.description || '', Number(payload.budgetedAmount),
    payload.frequency, Number(payload.interval) || 1, new Date(payload.anchorDate),
    payload.endCondition || 'Never', payload.endOccurrences || '',
    payload.endDate ? new Date(payload.endDate) : '', payload.accountId || '',
    payload.tag || '', false,
  ]]);
  return mapRule_(rowToObj_(sheet, row));
}

function deleteBudgetRule_(payload) {
  requireFields_(payload, ['id']);
  var sheet = getSheet_('BudgetRules');
  var row = findRowById_(sheet, payload.id);
  if (row < 0) throw mkErr_('NOT_FOUND', 'Budget rule not found: ' + payload.id);
  sheet.getRange(row, 13).setValue(true); // archive in place, keep history
  return { ok: true };
}

/**
 * budgets.getRule — the raw row (anchorDate, endCondition, endDate, etc.),
 * unlike budgets.listRules' display shape (see mapRule_ vs
 * listBudgetsForMonth_'s output). The Budget screen fetches this before
 * editing a rule's amount, since upsertBudgetRule_ re-writes the whole row
 * and needs every field, not just the one being changed.
 */
function getBudgetRule_(payload) {
  requireFields_(payload, ['id']);
  var sheet = getSheet_('BudgetRules');
  var row = findRowById_(sheet, payload.id);
  if (row < 0) throw mkErr_('NOT_FOUND', 'Budget rule not found: ' + payload.id);
  var r = rowToObj_(sheet, row);
  if (r.Archived) throw mkErr_('NOT_FOUND', 'Budget rule not found: ' + payload.id);
  return mapRule_(r);
}

/**
 * The whole point of the pivot: does `rule` apply to (year, month), and if
 * so, what occurrence number is it and how many times does it land that
 * month (only >1 for a Weekly rule viewed at month granularity)?
 * Returns null when the rule has not started, has ended, or simply doesn't
 * land in that month.
 */
function ruleForMonth_(rule, year, month) {
  var anchor = dateParts_(rule.anchorDate);
  var anchorMonths = anchor.y * 12 + (anchor.m - 1);
  var targetMonths = year * 12 + (month - 1);
  if (targetMonths < anchorMonths) return null;

  var freq = rule.frequency;
  var interval = Math.max(1, rule.interval || 1);
  var occ = null;

  if (freq === 'Once') {
    occ = (targetMonths === anchorMonths) ? { occurrenceIndex: 1, multiplier: 1 } : null;
  } else if (freq === 'Monthly') {
    var diffM = targetMonths - anchorMonths;
    occ = (diffM % interval === 0) ? { occurrenceIndex: diffM / interval + 1, multiplier: 1 } : null;
  } else if (freq === 'Quarterly') {
    var stepQ = interval * 3;
    var diffQ = targetMonths - anchorMonths;
    occ = (diffQ % stepQ === 0) ? { occurrenceIndex: diffQ / stepQ + 1, multiplier: 1 } : null;
  } else if (freq === 'Yearly') {
    var stepY = interval * 12;
    var diffY = targetMonths - anchorMonths;
    occ = (diffY % stepY === 0) ? { occurrenceIndex: diffY / stepY + 1, multiplier: 1 } : null;
  } else if (freq === 'Weekly') {
    occ = weeklyOccurrencesInMonth_(anchor, interval, year, month);
  }

  if (!occ) return null;

  if (rule.endCondition === 'After Occurrences' && rule.endOccurrences) {
    if (occ.occurrenceIndex > rule.endOccurrences) return null;
  }
  if (rule.endCondition === 'On Date' && rule.endDate) {
    var monthStart = new Date(year, month - 1, 1);
    if (monthStart > new Date(rule.endDate)) return null;
  }
  return occ;
}

function weeklyOccurrencesInMonth_(anchor, interval, year, month) {
  var monthStart = new Date(year, month - 1, 1);
  var monthEnd = new Date(year, month, 0);
  var cursor = new Date(anchor.y, anchor.m - 1, anchor.d);
  var idx = 1, count = 0, firstIndex = null, guard = 0;
  while (cursor <= monthEnd && guard < 3000) {
    if (cursor >= monthStart && cursor <= monthEnd) {
      count++;
      if (firstIndex === null) firstIndex = idx;
    }
    cursor = new Date(cursor.getTime() + interval * 7 * 24 * 3600 * 1000);
    idx++;
    guard++;
  }
  return count > 0 ? { occurrenceIndex: firstIndex, multiplier: count } : null;
}

function toAppRecurrence_(rule) {
  if (rule.frequency === 'Once') return { recurrence: 'once', recurrenceMonths: undefined };
  if (rule.endCondition === 'After Occurrences' && rule.endOccurrences) {
    return { recurrence: 'limited', recurrenceMonths: rule.endOccurrences };
  }
  return { recurrence: 'monthly', recurrenceMonths: undefined };
}

/**
 * budgets.listRules — computes every rule's budgeted/spent for one month
 * live, on request. Nothing is materialized in the sheet; this is the
 * "Mode B, virtual" approach from the architecture doc, and with Sheets
 * there is no reason to ever add the Notion-style "Mode A, materialized
 * row per period" on top, SUMIFS over the whole Transactions tab is cheap.
 */
function listBudgetsForMonth_(payload) {
  payload = payload || {};
  var now = new Date();
  var year = payload.year || now.getFullYear();
  var month = payload.month || (now.getMonth() + 1);
  var monthStr = year + '-' + (month < 10 ? '0' + month : String(month));

  var ctx = buildCurrencyContext_(payload);
  var catLookup = categoryLookup_();
  var txns = readTable_(getSheet_('Transactions'));
  var rules = listBudgetRulesRaw_();

  var out = [];
  rules.forEach(function (rule) {
    var occ = ruleForMonth_(rule, year, month);
    if (!occ) return;
    var matching = txns.filter(function (t) {
      return t.CategoryID === rule.categoryId && String(t.Month) === monthStr;
    });
    // Each transaction converts through its own account's native currency —
    // matters as soon as two accounts feeding the same category aren't in
    // the same currency, harmless (a no-op conversion) when they are.
    var spent = matching.reduce(function (sum, t) {
      var native = txnCurrency_(ctx, t.AccountID);
      return sum + toDisplay_(ctx, Math.abs(Number(t.SignedAmount) || 0), native);
    }, 0);
    var ruleNative = rule.accountId ? txnCurrency_(ctx, rule.accountId) : ctx.base;
    var bucket = toAppRecurrence_(rule);
    var cat = catLookup[rule.categoryId];
    out.push({
      id: rule.id,
      category: cat ? cat.name : rule.categoryId,
      description: rule.description,
      budgeted: toDisplay_(ctx, rule.budgetedAmount * occ.multiplier, ruleNative),
      spent: round2_(spent),
      currency: ctx.display,
      transactionsCount: matching.length,
      recurrence: bucket.recurrence,
      recurrenceMonths: bucket.recurrenceMonths,
    });
  });
  return out;
}

function budgetsSummary_(payload) {
  var ctx = buildCurrencyContext_(payload);
  var rules = listBudgetsForMonth_(payload);
  var totalBudgeted = rules.reduce(function (s, r) { return s + r.budgeted; }, 0);
  var totalSpent = rules.reduce(function (s, r) { return s + r.spent; }, 0);
  var settings = readTable_(getSheet_('Settings'));
  var totalBudgetSetting = settings.filter(function (s) { return s.Key === 'TotalBudget'; })[0];
  var totalBudgetNative = totalBudgetSetting ? Number(totalBudgetSetting.Value) || 0 : null;
  var totalBudget = totalBudgetNative !== null
    ? toDisplay_(ctx, totalBudgetNative, ctx.base)
    : round2_(totalBudgeted);
  return {
    totalBudget: totalBudget,
    totalBudgeted: round2_(totalBudgeted),
    totalSpent: round2_(totalSpent),
    currency: ctx.display,
    leftToBudget: Math.max(totalBudget - totalBudgeted, 0),
    categories: rules.map(function (r) {
      return { category: r.category, spent: r.spent, total: r.budgeted, transactions: r.transactionsCount };
    }),
  };
}

/**
 * budgets.upcoming — Payments Calendar's data source (PRD-BACKEND.md section
 * 10 flagged this screen as not obviously covered by an existing action;
 * this reuses BudgetRules rather than adding a whole new recurring-bills
 * model, since a rule already *is* a recurring or one-off planned payment).
 * For each rule, finds its next occurrence on or after `payload.from`
 * (default: today), within `payload.horizonDays` (default 60) days, and
 * returns them sorted soonest-first. Independent of any particular month,
 * unlike listBudgetsForMonth_, so it walks occurrences directly off each
 * rule's own AnchorDate/Frequency/Interval instead of reusing ruleForMonth_.
 */
function upcomingBudgetPayments_(payload) {
  payload = payload || {};
  var ctx = buildCurrencyContext_(payload);
  var from = payload.from ? new Date(payload.from) : new Date();
  var horizonDays = payload.horizonDays || 60;
  var until = new Date(from.getTime() + horizonDays * 24 * 3600 * 1000);
  var catLookup = categoryLookup_();

  var out = [];
  listBudgetRulesRaw_().forEach(function (rule) {
    var due = nextRuleOccurrence_(rule, from, until);
    if (!due) return;
    var cat = catLookup[rule.categoryId];
    var native = rule.accountId ? txnCurrency_(ctx, rule.accountId) : ctx.base;
    out.push({
      id: rule.id,
      title: rule.description || (cat ? cat.name : rule.categoryId),
      category: cat ? cat.name : rule.categoryId,
      categoryId: rule.categoryId,
      accountId: rule.accountId || null,
      amount: toDisplay_(ctx, rule.budgetedAmount, native),
      currency: ctx.display,
      dueDate: isoDate_(due),
      recurring: rule.frequency !== 'Once',
    });
  });
  out.sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  return out;
}

/**
 * Walks a rule's occurrences forward from its AnchorDate (occurrence 0, 1,
 * 2, ...) looking for the first one that lands on or after `from` and no
 * later than `until`, honoring EndCondition along the way. Returns null if
 * the rule has already ended, or its next occurrence falls beyond `until`.
 */
function nextRuleOccurrence_(rule, from, until) {
  var anchor = stripTime_(new Date(rule.anchorDate));
  var fromDay = stripTime_(from);
  var interval = Math.max(1, rule.interval || 1);

  for (var occ = 0; occ < 600; occ++) {
    var candidate;
    if (rule.frequency === 'Weekly') {
      candidate = new Date(anchor.getTime() + occ * interval * 7 * 24 * 3600 * 1000);
    } else if (rule.frequency === 'Once') {
      if (occ > 0) return null;
      candidate = anchor;
    } else {
      var stepMonths =
        rule.frequency === 'Monthly' ? interval :
        rule.frequency === 'Quarterly' ? interval * 3 :
        rule.frequency === 'Yearly' ? interval * 12 : null;
      if (stepMonths == null) return null; // unrecognized frequency, nothing to schedule
      candidate = new Date(anchor.getFullYear(), anchor.getMonth() + stepMonths * occ, anchor.getDate());
    }
    if (candidate > until) return null;

    var occurrenceNumber = occ + 1;
    if (rule.endCondition === 'After Occurrences' && rule.endOccurrences && occurrenceNumber > rule.endOccurrences) {
      return null;
    }
    if (rule.endCondition === 'On Date' && rule.endDate && candidate > new Date(rule.endDate)) {
      return null;
    }
    if (candidate >= fromDay) return candidate;
  }
  return null;
}

function stripTime_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Menu-driven, human-facing snapshot. Not read by the app, just for eyeballing in the sheet. */
function refreshBudgetProgress() {
  var rules = listBudgetsForMonth_({});
  var sheet = getSheet_('BudgetProgress');
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
  if (rules.length) {
    var rows = rules.map(function (r) { return [r.id, r.category, r.description, r.budgeted, r.spent]; });
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  sheet.getRange(2, 8).setValue(new Date());
}

// ------------------------------------------------------------- Dashboards

function homeDashboard_(payload) {
  payload = payload || {};
  var ctx = buildCurrencyContext_(payload);
  var period = payload.period || 'month';
  var accounts = listAccounts_(payload); // already in ctx.display
  var totalBalance = accounts.reduce(function (s, a) { return s + a.currentBalance; }, 0);
  var txns = readTable_(getSheet_('Transactions'));
  var now = new Date();
  var budgets = listBudgetsForMonth_(merge_(payload, { year: now.getFullYear(), month: now.getMonth() + 1 }));
  return {
    balance: { currency: ctx.display, total: round2_(totalBalance), spendable: round2_(totalBalance) },
    spendingBreakdown: spendingBreakdown_(txns, period, ctx),
    budgetsPreview: budgets.slice(0, 3).map(function (b) {
      return { category: b.category, spent: b.spent, total: b.budgeted };
    }),
    accounts: accounts,
  };
}

function merge_(a, b) {
  var out = {};
  Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; });
  return out;
}

function spendingBreakdown_(txns, period, ctx) {
  var now = new Date();
  var rangeStart, bucketFn;
  if (period === 'week') {
    rangeStart = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
    bucketFn = function (d) { return Utilities.formatDate(d, TZ_(), 'EEE').toUpperCase(); };
  } else if (period === 'quarter') {
    rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    bucketFn = function (d) { return Utilities.formatDate(d, TZ_(), 'MMM').toUpperCase(); };
  } else {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    bucketFn = function (d) { return 'WK ' + Math.ceil(d.getDate() / 7); };
  }
  var buckets = {}, order = [];
  txns.forEach(function (t) {
    if (!t.Date) return;
    var d = t.Date instanceof Date ? t.Date : new Date(t.Date);
    if (d < rangeStart || d > now) return;
    var key = bucketFn(d);
    if (!buckets[key]) { buckets[key] = { day: key, income: 0, expense: 0 }; order.push(key); }
    var amt = toDisplay_(ctx, Number(t.Amount) || 0, txnCurrency_(ctx, t.AccountID));
    if (t.Direction === 'Inflow') buckets[key].income += amt; else buckets[key].expense += amt;
  });
  return order.map(function (k) {
    var b = buckets[k];
    return { day: b.day, income: round2_(b.income), expense: round2_(b.expense) };
  });
}

function statisticsDashboard_(payload) {
  payload = payload || {};
  var ctx = buildCurrencyContext_(payload);
  var now = new Date();
  var year = payload.year || now.getFullYear();
  var month = payload.month || now.getMonth() + 1;
  var monthStr = year + '-' + (month < 10 ? '0' + month : String(month));

  var catLookup = categoryLookup_();
  var txns = readTable_(getSheet_('Transactions')).filter(function (t) { return String(t.Month) === monthStr; });

  var income = 0, expense = 0;
  var byCategory = {};
  txns.forEach(function (t) {
    var amt = toDisplay_(ctx, Number(t.Amount) || 0, txnCurrency_(ctx, t.AccountID));
    if (t.Direction === 'Inflow') income += amt; else expense += amt;
    var cat = catLookup[t.CategoryID];
    var label = cat ? cat.name : t.CategoryID;
    byCategory[label] = (byCategory[label] || 0) + amt;
  });
  var topCategories = Object.keys(byCategory)
    .map(function (label) { return { label: label, amount: round2_(byCategory[label]) }; })
    .sort(function (a, b) { return b.amount - a.amount; })
    .slice(0, 5);
  var totalTop = topCategories.reduce(function (s, c) { return s + c.amount; }, 0) || 1;
  topCategories.forEach(function (c) { c.percent = Math.round((c.amount / totalTop) * 100); });

  var accounts = listAccounts_(payload);
  return {
    summary: {
      currency: ctx.display,
      acrossAllAccounts: round2_(accounts.reduce(function (s, a) { return s + a.currentBalance; }, 0)),
      spending: round2_(-expense),
      income: round2_(income),
      netSavings: round2_(income - expense),
      savingsRate: income ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
      activeAccounts: accounts.length,
    },
    topCategories: topCategories,
  };
}

/** Settings!DefaultCurrency — the fixed anchor every ExchangeRates row is relative to. */
function defaultCurrency_() {
  var settings = readTable_(getSheet_('Settings'));
  var s = settings.filter(function (x) { return x.Key === 'DefaultCurrency'; })[0];
  return s ? s.Value : 'XAF';
}

// ------------------------------------------------------------- Currency & settings

function getExchangeRates_() {
  var map = {};
  readTable_(getSheet_('ExchangeRates')).forEach(function (r) {
    if (!r.Currency) return;
    map[r.Currency] = Number(r.RateToBase) || null;
  });
  return map;
}

function listCurrencies_() {
  return readTable_(getSheet_('ExchangeRates')).map(function (r) {
    return {
      code: r.Currency,
      rateToBase: Number(r.RateToBase) || null,
      updatedAt: isoDate_(r.UpdatedAt),
      notes: r.Notes || '',
    };
  });
}

function upsertExchangeRate_(payload) {
  requireFields_(payload, ['currency', 'rateToBase']);
  var sheet = getSheet_('ExchangeRates');
  var row = findRowByValue_(sheet, 1, payload.currency);
  if (row < 0) row = findFirstEmptyRow_(sheet, 1);
  sheet.getRange(row, 1, 1, 4).setValues([[
    payload.currency, Number(payload.rateToBase), new Date(), payload.notes || '',
  ]]);
  return listCurrencies_();
}

function displayCurrencySetting_() {
  var settings = readTable_(getSheet_('Settings'));
  var s = settings.filter(function (x) { return x.Key === 'DisplayCurrency'; })[0];
  return s && s.Value ? s.Value : defaultCurrency_();
}

function setDisplayCurrency_(payload) {
  requireFields_(payload, ['currency']);
  var rates = getExchangeRates_();
  if (rates[payload.currency] == null) {
    throw mkErr_('VALIDATION', 'No exchange rate configured for ' + payload.currency + '. Add a row to the ExchangeRates tab first.');
  }
  var sheet = getSheet_('Settings');
  var row = findRowByValue_(sheet, 1, 'DisplayCurrency');
  if (row < 0) throw mkErr_('NOT_FOUND', 'Settings row "DisplayCurrency" is missing.');
  sheet.getRange(row, 2).setValue(payload.currency);
  return getSettings_();
}

/** Settings!TotalBudget, in ctx.base (native, unconverted — same convention
 * as every other write action, see the currency comment atop this file). */
function setTotalBudget_(payload) {
  requireFields_(payload, ['amount']);
  var sheet = getSheet_('Settings');
  var row = findRowByValue_(sheet, 1, 'TotalBudget');
  if (row < 0) throw mkErr_('NOT_FOUND', 'Settings row "TotalBudget" is missing.');
  sheet.getRange(row, 2).setValue(Number(payload.amount));
  return getSettings_();
}

function getSettings_() {
  var settings = readTable_(getSheet_('Settings'));
  var map = {};
  settings.forEach(function (s) { map[s.Key] = s.Value; });
  var ctx = buildCurrencyContext_({});
  return {
    totalBudget: toDisplay_(ctx, Number(map.TotalBudget) || 0, ctx.base),
    baseCurrency: ctx.base,
    displayCurrency: ctx.display,
    householdName: map.HouseholdName || '',
    timezone: map.Timezone || TZ_(),
  };
}

/**
 * Everything a request needs to convert amounts: the live rate table, the
 * base currency rates are quoted against, which currency to convert *into*
 * (an explicit payload.currency wins for a one-off request, otherwise
 * Settings!DisplayCurrency), and a lookup from account to its own recorded
 * currency (a transaction/transfer's currency is its account's currency).
 */
function buildCurrencyContext_(payload) {
  payload = payload || {};
  var rates = getExchangeRates_();
  var base = defaultCurrency_();
  var display = payload.currency || displayCurrencySetting_();
  if (rates[base] == null) {
    throw mkErr_('VALIDATION', 'No exchange rate row for base currency ' + base + '. Add it to ExchangeRates.');
  }
  if (rates[display] == null) {
    throw mkErr_('VALIDATION', 'No exchange rate configured for ' + display + '. Add it to the ExchangeRates tab before switching to it.');
  }
  return { rates: rates, base: base, display: display, accountCurrency: accountCurrencyMap_() };
}

function accountCurrencyMap_() {
  var map = {};
  readTable_(getSheet_('Accounts')).forEach(function (r) { map[r.ID] = r.Currency; });
  return map;
}

/** A transaction/transfer's own currency: its account's, falling back to the base. */
function txnCurrency_(ctx, accountId) {
  return ctx.accountCurrency[accountId] || ctx.base;
}

/** amount in `from` currency -> amount in `to` currency, via the base-anchored rate table. */
function convert_(amount, from, to, rates) {
  if (!from || !to || from === to) return amount;
  var rFrom = rates[from];
  var rTo = rates[to];
  if (rFrom == null) throw mkErr_('VALIDATION', 'No exchange rate configured for ' + from + '. Add it to the ExchangeRates tab.');
  if (rTo == null) throw mkErr_('VALIDATION', 'No exchange rate configured for ' + to + '. Add it to the ExchangeRates tab.');
  return amount * rFrom / rTo;
}

function toDisplay_(ctx, amount, nativeCurrency) {
  return round2_(convert_(amount, nativeCurrency, ctx.display, ctx.rates));
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// -------------------------------------------------------------- Sheet helpers

function getSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw mkErr_('NOT_FOUND', 'Sheet not found: ' + name);
  return sh;
}

function TZ_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function isoDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ_(), 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function dateParts_(v) {
  var d = v instanceof Date ? v : new Date(v);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

/** Reads every non-blank-ID row as {Header: value, _row: sheetRowNumber}. */
function readTable_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var rowVals = values[i];
    if (rowVals[0] === '' || rowVals[0] === null) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = rowVals[c];
    obj._row = i + 2;
    rows.push(obj);
  }
  return rows;
}

function rowToObj_(sheet, row) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  var obj = {};
  for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[c];
  return obj;
}

function findRowById_(sheet, id) {
  return findRowByValue_(sheet, 1, id);
}

function findRowByValue_(sheet, col, value) {
  if (!value) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var vals = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === value) return i + 2;
  }
  return -1;
}

/** First row (from row 2 down) whose ID column is blank — reuses the
 * pre-filled-formula rows in Transactions/Transfers/Accounts instead of
 * pushing past them the way sheet.appendRow() would. */
function findFirstEmptyRow_(sheet, idCol) {
  var maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    var vals = sheet.getRange(2, idCol, maxRows - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][0] === '' || vals[i][0] === null) return i + 2;
    }
  }
  return sheet.getLastRow() + 1;
}

function requireFields_(payload, fields) {
  fields.forEach(function (f) {
    if (payload[f] === undefined || payload[f] === null || payload[f] === '') {
      throw mkErr_('VALIDATION', 'Missing field: ' + f);
    }
  });
}

function mkErr_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errEnvelope_(code, message) {
  return { ok: false, code: code, message: message };
}
