// Runs the real backend/Code.gs against an in-memory fake of Google Sheets.
const fs = require('fs');
const vm = require('vm');
const REPO = require('path').join(__dirname, '..', '..');

function makeContext() {
  const sheets = {};
  const mkSheet = name => {
    const data = [];
    const sh = {
      name, data,
      getName: () => name,
      getRange(r, c, nr, nc) {
        return {
          setValues(vals) {
            for (let i = 0; i < nr; i++) {
              data[r - 1 + i] = data[r - 1 + i] || [];
              for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j];
            }
            return this;
          },
          setFontWeight() { return this; },
          getValue() { return (data[r - 1] || [])[c - 1] ?? ''; },
          setValue(v) { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; return this; },
          setDataValidation(v) { sh.validation = { r, c, nr, nc, v }; return this; },
          getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((data[r - 1 + i] || [])[c - 1 + j] ?? ''))); }
        };
      },
      getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
      appendRow(row) { data.push(row.slice()); },
      setFrozenRows() {}
    };
    return sh;
  };
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = mkSheet(n))
  };
  const ctx = {
    console, JSON, Math, Date, Number, String, Array, Object, isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newDataValidation() {
        const v = {};
        const b = { requireValueInList(list, show) { v.list = list; v.show = show; return b; }, setAllowInvalid(a) { v.allowInvalid = a; return b; }, build: () => v };
        return b;
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ body: s, setMimeType() { return this; } })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(REPO + '/backend/Code.gs', 'utf8'), ctx);
  ctx.__sheets = sheets;
  return ctx;
}

module.exports = { makeContext, REPO };
