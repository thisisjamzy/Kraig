// Minimal Apps Script runtime mock. Loads Code.gs as-is (no copy, no transpile)
// into a vm context that stands in for SpreadsheetApp/Utilities/LockService/
// PropertiesService/ContentService, backed by an in-memory sheet store. Every
// top-level `function` in Code.gs becomes a property on the returned context,
// so tests call e.g. context.upsertBudgetRule_({...}) directly.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const CODE_GS_PATH = path.join(__dirname, '..', '..', 'Code.gs');

/** A fixed-size, header-plus-blank-rows sheet, matching how the real Sheet
 * pre-fills rows (see SCHEMA.md "How inserts work"). Row 1 is the header. */
function createMockSheet(headers, blankRows = 50) {
  const data = [headers.slice()];
  for (let i = 0; i < blankRows; i++) data.push(headers.map(() => ''));

  return {
    _data: data,
    getRange(row, col, numRows = 1, numCols = 1) {
      const sheet = this;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const rowArr = [];
            for (let c = 0; c < numCols; c++) rowArr.push(sheet._data[row - 1 + r][col - 1 + c]);
            out.push(rowArr);
          }
          return out;
        },
        getValue() {
          return sheet._data[row - 1][col - 1];
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            for (let c = 0; c < values[r].length; c++) sheet._data[row - 1 + r][col - 1 + c] = values[r][c];
          }
        },
        setValue(v) {
          sheet._data[row - 1][col - 1] = v;
        },
        clearContent() {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) sheet._data[row - 1 + r][col - 1 + c] = '';
          }
        },
      };
    },
    getLastRow() {
      for (let r = this._data.length - 1; r >= 1; r--) {
        if (this._data[r].some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
      }
      return 1;
    },
    getLastColumn() {
      return this._data[0].length;
    },
    getMaxRows() {
      return this._data.length;
    },
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Just enough of Utilities.formatDate to satisfy Code.gs's own format strings. */
function formatDate(date, _tz, fmt) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (fmt.indexOf("HH:mm:ssXXX") >= 0) {
    return `${y}-${m}-${d}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}Z`;
  }
  if (fmt.indexOf('HH:mm') >= 0) {
    return `${y}-${m}-${d} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (fmt === 'EEE') return date.toDateString().slice(0, 3).toUpperCase();
  if (fmt === 'MMM') return date.toDateString().slice(4, 7).toUpperCase();
  return `${y}-${m}-${d}`;
}

/**
 * sheets: { SheetName: mockSheet }. Returns the vm context after running
 * Code.gs in it — call context.someFunction_(...) to exercise it directly.
 */
function loadCodeGs(sheets) {
  const scriptProperties = {};
  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName: (name) => sheets[name] || null,
          getSpreadsheetTimeZone: () => 'UTC',
        };
      },
      getUi() {
        return { createMenu: () => ({ addItem: () => ({ addToUi: () => {} }) }) };
      },
    },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 10),
      formatDate,
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProperties ? scriptProperties[k] : null),
        setProperty: (k, v) => { scriptProperties[k] = v; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ setMimeType: () => ({ getContent: () => text }) }),
    },
    Logger: { log: () => {} },
  };
  vm.createContext(context);
  const src = fs.readFileSync(CODE_GS_PATH, 'utf8');
  vm.runInContext(src, context, { filename: 'Code.gs' });
  return context;
}

module.exports = { createMockSheet, loadCodeGs };
