const fs = require('fs');
const vm = require('vm');
const assert0 = require('assert');
const plain = v => JSON.parse(JSON.stringify(v));
const assert = Object.assign((...a) => assert0(...a), assert0, { deepStrictEqual: (a, b, m) => assert0.deepStrictEqual(plain(a), plain(b), m) });
const { makeContext, REPO } = require('./harness');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };

// 1. Par/SI in Code.gs must match the page's COURSES exactly.
const html = fs.readFileSync(REPO + '/index.html', 'utf8');
const pageCourses = vm.runInNewContext(html.match(/const COURSES = (\{[\s\S]*?\n\});/)[1].replace(/^/, '(') + ')');
const ctx = makeContext();
const gsCourses = vm.runInContext('COURSES', ctx);
t('course par/SI match the page', () => {
  assert.deepStrictEqual(Object.keys(gsCourses), Object.keys(pageCourses));
  for (const k of Object.keys(pageCourses)) {
    assert.deepStrictEqual(gsCourses[k].par, pageCourses[k].holes.map(h => h[2]), k + ' par');
    assert.deepStrictEqual(gsCourses[k].si, pageCourses[k].holes.map(h => h[3]), k + ' si');
    const sis = gsCourses[k].si.slice().sort((a, b) => a - b);
    assert.deepStrictEqual(sis, Array.from({ length: 18 }, (_, i) => i + 1), k + ' SI is 1-18 once each');
  }
});
t('page course data matches the official card totals (yellow metres, par)', () => {
  // [out, in, total, par] as printed on each club's scorecard
  const official = { 'Torrequebrada': [2835, 2931, 5766, 72], 'Calanova': [2925, 2848, 5773, 72], 'Cabopino': [2510, 2683, 5193, 71],
                     'La Cala Asia': [2609, 2792, 5401, 72], 'Santana': [2958, 2696, 5654, 72] };
  assert.deepStrictEqual(Object.keys(pageCourses), Object.keys(official));
  for (const [k, [o, i, tot, par]] of Object.entries(official)) {
    const m = pageCourses[k].holes.map(h => h[1]);
    const sum = a => a.reduce((x, y) => x + y, 0);
    assert.deepStrictEqual([sum(m.slice(0, 9)), sum(m.slice(9)), sum(m), sum(pageCourses[k].holes.map(h => h[2]))], [o, i, tot, par], k);
    assert.deepStrictEqual(pageCourses[k].holes.map(h => h[0]), Array.from({ length: 18 }, (_, n) => n + 1), k + ' hole numbers');
  }
});
t('course dropdown on the page = the courses, in day order', () => {
  const opts = html.match(/<select id="coursePlayed">([\s\S]*?)<\/select>/)[1].match(/<option>([^<]+)<\/option>/g).map(o => o.replace(/<\/?option>/g, ''));
  assert.deepStrictEqual(opts, Object.keys(pageCourses));
  assert.deepStrictEqual(vm.runInContext('DEFAULT_SCHEDULE', ctx), opts);
});
t('players match the page dropdown', () => {
  const opts = html.match(/<select id="playerName">([\s\S]*?)<\/select>/)[1].match(/<option>([^<]+)<\/option>/g).map(o => o.replace(/<\/?option>/g, ''));
  assert.deepStrictEqual(vm.runInContext('PLAYERS', ctx), opts);
});

// 2. Stableford maths.
const shots = vm.runInContext('shotsOnHole', ctx);
t('shots received', () => {
  assert.strictEqual(shots(0, 1), 0);
  assert.strictEqual(shots(18, 18), 1);
  assert.strictEqual(shots(10, 10), 1);
  assert.strictEqual(shots(10, 11), 0);
  assert.strictEqual(shots(20, 2), 2);
  assert.strictEqual(shots(20, 3), 1);
  assert.strictEqual(shots(-2, 17), -1);
  assert.strictEqual(shots(-2, 16), 0);
});

vm.runInContext('ensureSheets()', ctx);
const sp = (course, scores) => vm.runInContext('stablefordPoints', ctx)(course, scores, vm.runInContext('handicapFor', ctx)('Steve Kelly'));
const cabPar = gsCourses.Cabopino.par;
t('gross: all pars = 36 pts', () => assert.strictEqual(sp('Cabopino', cabPar).total, 36));
t('gross: birdie 3, bogey 1, double 0, triple still 0', () => {
  const s = cabPar.slice(); s[0] -= 1; s[1] += 1; s[2] += 2; s[3] += 3;
  const r = sp('Cabopino', s);
  assert.deepStrictEqual(r.perHole.slice(0, 4), [3, 1, 0, 0]);
  assert.strictEqual(r.total, 36 + 1 - 1 - 2 - 2);
});
t('handicap 18 at 100%: all bogeys = 36 pts', () => {
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 18;
  assert.strictEqual(sp('Cabopino', cabPar.map(p => p + 1)).total, 36);
});
t('allowance 95 (typed as 95) gives PH 17: SI 18 hole loses its shot', () => {
  ctx.__sheets.Settings.data[1][1] = 95;
  const r = sp('Cabopino', cabPar.map(p => p + 1));
  const si18 = gsCourses.Cabopino.si.indexOf(18);
  assert.strictEqual(r.perHole[si18], 1);
  assert.strictEqual(r.total, 35);
  ctx.__sheets.Settings.data[1][1] = 1;
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 0;
});

// 3. Endpoints.
const post = body => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(body) } }).body);
const get = () => JSON.parse(vm.runInContext('doGet', ctx)({ parameter: { action: 'leaderboard' } }).body);
const TEST_PIN = '4321';   // dummy - the real PIN lives only in Script Properties
const card = (player, course, scores, by = 'Paddy Swan', pin = TEST_PIN) => ({ player, course, submittedBy: by, scores, pin });

t('sheets created with the 2027 schedule', () => {
  assert.deepStrictEqual(Object.keys(ctx.__sheets).sort(), ['Cards', 'Notifications', 'Players', 'Schedule', 'Settings']);
  assert.strictEqual(ctx.__sheets.Players.data.length, 17);
  const lb = get();
  assert.ok(lb.ok);
  assert.deepStrictEqual(lb.days.map(d => [d.day, d.course]),
    [['Day 1', 'Torrequebrada'], ['Day 2', 'Calanova'], ['Day 3', 'Cabopino'], ['Day 4', 'La Cala Asia'], ['Day 5', 'Santana']]);
  lb.days.forEach(d => { assert.strictEqual(d.rows.length, 16); assert.ok(d.rows.every(r => r.total === null)); });
});
t('an old sheet (old courses or blank) is reset to the 2027 schedule', () => {
  for (const old of [['Cabopino-x', 'America', 'Chaparral', '', ''], ['', '', '', '', '']]) {
    const c2 = makeContext();
    vm.runInContext('ensureSheets()', c2);
    old.forEach((c, i) => (c2.__sheets.Schedule.data[i + 1][1] = c));
    c2.__sheets.Schedule.validation = null;
    vm.runInContext('ensureSheets()', c2);
    assert.deepStrictEqual(c2.__sheets.Schedule.data.slice(1).map(r => r[1]), ['Torrequebrada', 'Calanova', 'Cabopino', 'La Cala Asia', 'Santana']);
    assert.ok(c2.__sheets.Schedule.validation, 'dropdown refreshed');
  }
});
t('a schedule with any current course is left alone', () => {
  const c2 = makeContext();
  vm.runInContext('ensureSheets()', c2);
  ['', 'Santana', '', '', ''].forEach((c, i) => (c2.__sheets.Schedule.data[i + 1][1] = c));
  vm.runInContext('ensureSheets()', c2);
  assert.deepStrictEqual(c2.__sheets.Schedule.data.slice(1).map(r => r[1]), ['', 'Santana', '', '', '']);
});
t('schedule course column is a dropdown of the 5 courses', () => {
  const v = ctx.__sheets.Schedule.validation;
  assert.deepStrictEqual([v.r, v.c, v.nr, v.nc], [2, 2, 5, 1]);
  assert.deepStrictEqual(v.v.list, ['Torrequebrada', 'Calanova', 'Cabopino', 'La Cala Asia', 'Santana']);
  assert.strictEqual(v.v.allowInvalid, false);
});
t('ensureSheets twice is harmless', () => {
  vm.runInContext('ensureSheets()', ctx);
  assert.strictEqual(ctx.__sheets.Players.data.length, 17);
});
t('PIN: none set up -> every card refused, nothing written', () => {
  const r = post(card('Steve Kelly', 'Cabopino', cabPar));
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /PIN isn't set up/);
  assert.strictEqual(ctx.__sheets.Cards.data.length, 1);
  ctx.__props.CARD_PIN = TEST_PIN;
});
t('PIN: wrong or missing -> refused with pinRejected, nothing written', () => {
  for (const bad of ['0000', '', null, 4320, 'no pin field']) {
    const c = card('Steve Kelly', 'Cabopino', cabPar, 'Paddy Swan', bad);
    if (bad === 'no pin field') delete c.pin;
    const r = post(c);
    assert.deepStrictEqual([r.ok, r.pinRejected], [false, true], String(bad));
  }
  assert.strictEqual(ctx.__sheets.Cards.data.length, 1);
});
t('PIN: right PIN is checked before the card itself', () => {
  const r = post(card('Steve Kelly', 'Cabopino', cabPar, 'Steve Kelly'));   // right PIN, own card
  assert.strictEqual(r.error, 'You cannot submit your own score card!');
  assert.strictEqual(Number(post(card('Steve Kelly', 'Cabopino', cabPar, 'Paddy Swan', Number(TEST_PIN))).ok), 1);   // a number PIN works too
  ctx.__sheets.Cards.data.pop();
});
t('bad cards rejected', () => {
  assert.strictEqual(post(card('Steve Kelly', 'Cabopino', cabPar, 'Steve Kelly')).ok, false);
  assert.strictEqual(post(card('Nobody', 'Cabopino', cabPar)).ok, false);
  assert.strictEqual(post(card('Steve Kelly', 'Nowhere', cabPar)).ok, false);
  assert.strictEqual(post(card('Steve Kelly', 'Cabopino', cabPar.slice(0, 17))).ok, false);
  assert.strictEqual(post(card('Steve Kelly', 'Cabopino', cabPar.map((p, i) => i ? p : 0))).ok, false);
  assert.strictEqual(ctx.__sheets.Cards.data.length, 1);
});
t('good card saved with points', () => {
  assert.deepStrictEqual(post(card('Steve Kelly', 'Cabopino', cabPar)), { ok: true });
  const row = ctx.__sheets.Cards.data[1];
  assert.strictEqual(row[2], 'Steve Kelly');
  assert.deepStrictEqual(row.slice(23), [72 - 3 + 3, 18, 18, 36].map((v, i) => i ? v : cabPar.reduce((a, b) => a + b)));
});
t('a card shows on its course day only, and not once the day is cleared', () => {
  const days = get().days;
  days.forEach((d, i) => { if (i !== 2) assert.ok(d.rows.every(r => r.total === null)); });
  const d2 = days[2];   // Day 3 = Cabopino
  assert.strictEqual(d2.course, 'Cabopino');
  assert.strictEqual(d2.rows.length, 16);
  assert.deepStrictEqual(d2.rows[0], { player: 'Steve Kelly', front: 18, back: 18, total: 36, gross: cabPar.reduce((a, b) => a + b), pos: 1 });
  assert.ok(d2.rows.slice(1).every(r => r.total === null && r.pos === null));
  ctx.__sheets.Schedule.data[3][1] = '';
  assert.strictEqual(get().days[2].rows.length, 0);
  ctx.__sheets.Schedule.data[3][1] = 'Cabopino';
});
t('ranking, countback tie and joint position', () => {
  const s1 = cabPar.slice(); s1[0] -= 1;            // 37, front-9 birdie
  const s2 = cabPar.slice(); s2[17] -= 1;           // 37, back-9 birdie: wins countback
  const s3 = cabPar.slice(); s3[17] -= 1;           // same as s2: tied on both
  post(card('Ally McKinlay', 'Cabopino', s1));
  post(card('Owen Evans', 'Cabopino', s2));
  post(card('Titch Walton', 'Cabopino', s3));
  const rows = get().days[2].rows;
  assert.deepStrictEqual(rows.slice(0, 4).map(r => [r.player, r.total, r.pos]),
    [['Owen Evans', 37, 1], ['Titch Walton', 37, 1], ['Ally McKinlay', 37, 3], ['Steve Kelly', 36, 4]]);
});
t('resubmitting replaces the old card', () => {
  const s = cabPar.slice(); s[5] += 2;
  post(card('Steve Kelly', 'Cabopino', s));
  assert.strictEqual(get().days[2].rows.find(r => r.player === 'Steve Kelly').total, 34);
});
t('handicap added later recalculates old cards', () => {
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 18;
  assert.strictEqual(get().days[2].rows.find(r => r.player === 'Steve Kelly').total, 52);
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 0;
});
t('same course on two days split by Date', () => {
  ctx.__sheets.Schedule.data[3][2] = '2030-01-01';  // Day 3 dated in the future: no cards match
  assert.ok(get().days[2].rows.every(r => r.total === null));
  const today = ctx.__sheets.Cards.data[1][1];
  ctx.__sheets.Schedule.data[3][2] = new Date(today + 'T12:00:00Z');   // as Sheets would store it
  assert.strictEqual(get().days[2].rows[0].total, 37);
});

// 4. Notifications.
const N = ctx.__sheets.Notifications;
const edit = (sheet, row, col, rows = 1, cols = 1) => vm.runInContext('onEdit', ctx)({
  range: { getSheet: () => sheet, getRow: () => row, getColumn: () => col, getNumRows: () => rows, getNumColumns: () => cols }
});
t('typing a message stamps Posted; header, other tabs and existing times are left alone', () => {
  assert.deepStrictEqual(N.data[0], ['Posted', 'Message']);
  N.data[1] = ['', 'Tee times moved to 9:30'];
  edit(N, 2, 2);
  assert.ok(N.data[1][0] instanceof ctx.Date || Object.prototype.toString.call(N.data[1][0]) === '[object Date]');
  const first = N.data[1][0];
  N.data[1][1] = 'Tee times moved to 9:40';         // reworded: keeps its original time
  edit(N, 2, 2);
  assert.strictEqual(N.data[1][0], first);
  edit(N, 1, 2);                                     // header row
  assert.strictEqual(N.data[0][0], 'Posted');
  ctx.__sheets.Players.data[1][1] = 5;               // edit on another tab: no stamping
  edit(ctx.__sheets.Players, 2, 2);
  assert.strictEqual(ctx.__sheets.Players.data[1][0], 'Ally McKinlay');
  ctx.__sheets.Players.data[1][1] = 0;
});
t('pasting several messages stamps each; a blank row stays blank', () => {
  N.data[2] = ['', 'Bus leaves 8am'];
  N.data[3] = ['', ''];
  N.data[4] = ['', 'Dinner at 8'];
  edit(N, 3, 1, 3, 2);
  assert.ok(N.data[2][0] && N.data[4][0]);
  assert.strictEqual(N.data[3][0], '');
});
t('feed is newest first, skips blank messages, lists untimed ones last, rides on the leaderboard call', () => {
  N.data[1][0] = new Date('2026-10-30T09:00:00Z');
  N.data[2][0] = new Date('2026-10-30T11:00:00Z');
  N.data[4][0] = new Date('2026-10-29T20:00:00Z');
  N.data[5] = ['', 'Typed straight in, no time'];
  N.data[6] = ['', '   '];
  const feed = get().notifications;
  assert.deepStrictEqual(feed, [
    { posted: '2026-10-30T11:00:00.000Z', message: 'Bus leaves 8am' },
    { posted: '2026-10-30T09:00:00.000Z', message: 'Tee times moved to 9:40' },
    { posted: '2026-10-29T20:00:00.000Z', message: 'Dinner at 8' },
    { posted: null, message: 'Typed straight in, no time' }
  ]);
});

console.log('\n' + pass + ' passed');
