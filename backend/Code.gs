// ╔══════════════════════════════════════════════════════════════╗
// ║  ROGS 2027 - score card backend (Google Apps Script)        ║
// ║  Bound to the ROGS Google Sheet. Setup guide: SETUP.md      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Tabs (created automatically on first use):
//   Players  - Player | Handicap        (handicap 0 = gross Stableford)
//   Settings - Setting | Value          (Allowance, e.g. 1 = 100%, 0.95 = 95%)
//   Schedule - Day | Course | Date      (Date optional: only needed if a
//                                        course is played on two days)
//   Cards    - one row per submitted card, newest wins for a player/course/date
//   Notifications - Posted | Message   (type a Message; Posted stamps itself)
//
// Endpoints:
//   POST  body = JSON {player, course, submittedBy, scores:[18], pin}
//         -> {ok:true} or {ok:false, error, pinRejected?}
//
// Card PIN: kept in Script Properties as CARD_PIN (Project Settings > Script
// Properties), never in this file - the repo is public.
//   GET   ?action=leaderboard -> {ok:true, days:[...], notifications:[...],
//                                 handicaps:{player: hcp}, allowance}

// ── Course data: par and stroke index per hole (holes 1-18) ──
// Keep in step with COURSES in index.html.
const COURSES = {
  "Torrequebrada": {
    par: [5,4,3,4,4,5,4,4,3, 4,3,5,3,5,4,4,4,4],
    si:  [8,6,18,10,14,4,12,2,16, 3,15,5,17,7,11,1,9,13]
  },
  "Calanova": {
    par: [5,4,4,4,4,3,4,3,5, 5,4,4,3,5,4,4,3,4],
    si:  [9,5,13,11,1,7,15,17,3, 6,4,18,12,2,8,10,16,14]
  },
  "Cabopino": {
    par: [4,4,4,4,4,4,3,4,4, 4,4,5,3,5,3,4,4,4],
    si:  [11,12,13,9,1,10,15,6,3, 7,2,5,18,4,17,14,16,8]
  },
  "La Cala Asia": {
    par: [4,4,3,4,5,4,3,4,5, 5,3,4,4,4,4,5,3,4],
    si:  [12,16,18,2,10,4,14,8,6, 1,13,3,5,17,11,7,15,9]
  },
  "Santana": {
    par: [4,3,4,5,4,4,3,5,4, 5,4,3,4,4,5,3,4,4],
    si:  [13,9,7,3,11,17,5,1,15, 4,8,10,14,18,6,16,12,2]
  }
};

// Day 1-5 in order. Filled into the Schedule tab while it has no valid courses.
const DEFAULT_SCHEDULE = ["Torrequebrada", "Calanova", "Cabopino", "La Cala Asia", "Santana"];

const PLAYERS = [
  "Ally McKinlay", "Anthony Parkinson", "Bernie Brennan", "Brian McSherry",
  "Bryan Bennett", "Jim Chadwick", "John Douglas", "Karl Atkinson",
  "Neil Sanderson", "Owen Evans", "Paddy Swan", "Paul Simpson",
  "Rick Kennedy", "Robbie Strange", "Steve Kelly", "Titch Walton"
];

const DAYS = 5;
const TZ = "Europe/Madrid";
const CARD_HEADERS = ["Timestamp", "Date", "Player", "Course", "Submitted By"]
  .concat(Array.from({length: 18}, (_, i) => "H" + (i + 1)))
  .concat(["Gross", "Pts Front", "Pts Back", "Pts Total"]);

// ── Web endpoints ──
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    ensureSheets();
    const card = JSON.parse(e.postData.contents);
    const pin = PropertiesService.getScriptProperties().getProperty("CARD_PIN");
    if (!pin) return json({ok: false, error: "Card PIN isn't set up on the scores sheet yet."});
    if (String(card.pin || "") !== String(pin)) return json({ok: false, error: "Wrong PIN.", pinRejected: true});
    const err = validateCard(card);
    if (err) return json({ok: false, error: err});
    saveCard(card);
    return json({ok: true});
  } catch (ex) {
    return json({ok: false, error: String(ex)});
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    ensureSheets();
    const action = (e && e.parameter && e.parameter.action) || "leaderboard";
    if (action === "leaderboard") return json({ok: true, days: leaderboard(), notifications: notifications(),
                                                handicaps: handicaps(), allowance: allowance()});
    return json({ok: false, error: "Unknown action: " + action});
  } catch (ex) {
    return json({ok: false, error: String(ex)});
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet setup (safe to run repeatedly) ──
function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  makeSheet(ss, "Players", ["Player", "Handicap"], PLAYERS.map(p => [p, 0]));
  makeSheet(ss, "Settings", ["Setting", "Value"], [["Allowance", 1]]);
  const created = makeSheet(ss, "Schedule", ["Day", "Course", "Date"],
    Array.from({length: DAYS}, (_, i) => ["Day " + (i + 1), "", ""]));
  makeSheet(ss, "Cards", CARD_HEADERS, []);
  makeSheet(ss, "Notifications", ["Posted", "Message"], []);
  refreshSchedule(ss.getSheetByName("Schedule"), !!created);
}

// When no Schedule course is a current course (new sheet, or one still on an
// old course list), reset to DEFAULT_SCHEDULE and the current course dropdown.
// Once any valid course is set, the Schedule is left alone.
function refreshSchedule(sh, force) {
  const courses = sh.getRange(2, 2, DAYS, 1).getValues().map(r => String(r[0]).trim());
  if (!force && courses.some(c => COURSES[c])) return;
  // Dropdown first, so the old course list can't reject the new names.
  sh.getRange(2, 2, DAYS, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(COURSES), true).setAllowInvalid(false).build())
    .setValues(DEFAULT_SCHEDULE.map(c => [c]));
}

// Creates the tab if missing and returns it; returns null if it already existed.
function makeSheet(ss, name, headers, rows) {
  if (ss.getSheetByName(name)) return null;
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

function rows(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh.getDataRange().getValues().slice(1);
}

// ── Cards ──
function validateCard(c) {
  if (!c || PLAYERS.indexOf(c.player) < 0) return "Unknown player.";
  if (!COURSES[c.course]) return "Unknown course.";
  if (PLAYERS.indexOf(c.submittedBy) < 0) return "Unknown submitter.";
  if (c.submittedBy === c.player) return "You cannot submit your own score card!";
  if (!Array.isArray(c.scores) || c.scores.length !== 18) return "All 18 holes are needed.";
  for (let i = 0; i < 18; i++) {
    const s = Number(c.scores[i]);
    if (!Number.isInteger(s) || s < 1 || s > 15) return "Hole " + (i + 1) + " score is not valid.";
  }
  return "";
}

function saveCard(c) {
  const now = new Date();
  const scores = c.scores.map(Number);
  const pts = stablefordPoints(c.course, scores, handicapFor(c.player));
  const gross = scores.reduce((a, b) => a + b, 0);
  const row = [now, Utilities.formatDate(now, TZ, "yyyy-MM-dd"), c.player, c.course, c.submittedBy]
    .concat(scores)
    .concat([gross, pts.front, pts.back, pts.total]);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards").appendRow(row);
}

// ── Stableford ──
function allowance() {
  const r = rows("Settings").find(r => r[0] === "Allowance");
  const v = r ? Number(r[1]) : 1;
  return isNaN(v) || v <= 0 ? 1 : (v > 1.5 ? v / 100 : v);   // accepts 95 or 0.95
}

function handicapFor(player) {
  const r = rows("Players").find(r => r[0] === player);
  const h = r ? Number(r[1]) : 0;
  return isNaN(h) ? 0 : h;
}

// {player: handicap} for the score card's live Stableford points.
function handicaps() {
  return rows("Players").reduce((m, r) => {
    if (r[0]) { const h = Number(r[1]); m[r[0]] = isNaN(h) ? 0 : h; }
    return m;
  }, {});
}

// Shots received on a hole of stroke index si for playing handicap ph.
function shotsOnHole(ph, si) {
  if (ph >= 0) return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0);
  const p = -ph;   // plus handicap: gives shots back on the easiest holes
  const n = Math.floor(p / 18) + (si > 18 - p % 18 ? 1 : 0);
  return n ? -n : 0;
}

function stablefordPoints(course, scores, handicap) {
  const c = COURSES[course];
  const ph = Math.round(handicap * allowance());
  const perHole = scores.map((s, i) =>
    Math.max(0, 2 + c.par[i] + shotsOnHole(ph, c.si[i]) - s));
  const front = perHole.slice(0, 9).reduce((a, b) => a + b, 0);
  const back = perHole.slice(9).reduce((a, b) => a + b, 0);
  return {perHole: perHole, front: front, back: back, total: front + back};
}

// ── Leaderboard ──
function leaderboard() {
  const schedule = rows("Schedule");
  const cards = rows("Cards");
  const players = rows("Players").map(r => r[0]).filter(Boolean);

  return schedule.map(s => {
    const day = String(s[0]);
    const course = String(s[1] || "").trim();
    const date = s[2] ? dateKey(s[2]) : "";
    if (!course) return {day: day, course: "", rows: []};

    // Newest card per player wins (lets a wrong card be corrected by resubmitting).
    const latest = {};
    cards.forEach(c => {
      if (c[3] !== course) return;
      if (date && dateKey(c[1]) !== date) return;
      const ts = new Date(c[0]).getTime();
      if (!latest[c[2]] || ts >= latest[c[2]].ts) latest[c[2]] = {ts: ts, card: c};
    });

    const out = players.map(p => {
      const hit = latest[p];
      if (!hit) return {player: p, front: null, back: null, total: null, gross: null};
      // Recalculated live, so handicap or allowance changes apply to old cards too.
      const pts = stablefordPoints(course, hit.card.slice(5, 23).map(Number), handicapFor(p));
      return {player: p, front: pts.front, back: pts.back, total: pts.total, gross: Number(hit.card[23])};
    });

    // Points, then back-9 countback; players without a card go last.
    out.sort((a, b) => {
      if (a.total === null || b.total === null) return (a.total === null) - (b.total === null);
      return (b.total - a.total) || (b.back - a.back);
    });
    let pos = 0;
    out.forEach((r, i) => {
      if (r.total === null) { r.pos = null; return; }
      const prev = out[i - 1];
      if (!prev || prev.total !== r.total || prev.back !== r.back) pos = i + 1;
      r.pos = pos;
    });
    return {day: day, course: course, rows: out};
  });
}

function dateKey(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  return String(v).slice(0, 10);
}

// ── Notifications ──
// Simple trigger: typing a Message stamps Posted with the time (only if Posted is
// empty, so editing a message's wording later doesn't move its time).
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== "Notifications") return;
  const top = e.range.getRow(), left = e.range.getColumn();
  if (left > 2 || left + e.range.getNumColumns() - 1 < 2) return;
  for (let r = Math.max(top, 2); r < top + e.range.getNumRows(); r++) {
    const msg = String(sh.getRange(r, 2).getValue()).trim();
    const posted = sh.getRange(r, 1);
    if (msg && !posted.getValue()) posted.setValue(new Date());
  }
}

// Newest first. Rows without a message are ignored; rows without a time are listed
// but never bannered.
function notifications() {
  return rows("Notifications")
    .filter(r => String(r[1]).trim())
    .map(r => ({posted: r[0] instanceof Date ? r[0].toISOString() : (r[0] ? String(r[0]) : null),
                message: String(r[1]).trim()}))
    .sort((a, b) => (b.posted ? new Date(b.posted).getTime() : 0) - (a.posted ? new Date(a.posted).getTime() : 0))
    .slice(0, 30);
}
