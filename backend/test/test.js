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
const SCRATCH_AT_CABOPINO = 2;
ctx.__sheets.Players.data.slice(1).forEach(r => (r[1] = SCRATCH_AT_CABOPINO));
const sp = (course, scores) => vm.runInContext('stablefordPoints', ctx)(course, scores, vm.runInContext('handicapFor', ctx)('Steve Kelly'));
const cabPar = gsCourses.Cabopino.par;
t('gross: all pars = 36 pts', () => assert.strictEqual(sp('Cabopino', cabPar).total, 36));
t('gross: birdie 3, bogey 1, double 0, triple still 0', () => {
  const s = cabPar.slice(); s[0] -= 1; s[1] += 1; s[2] += 2; s[3] += 3;
  const r = sp('Cabopino', s);
  assert.deepStrictEqual(r.perHole.slice(0, 4), [3, 1, 0, 0]);
  assert.strictEqual(r.total, 36 + 1 - 1 - 2 - 2);
});
t('index 17.3 = course 18 at Cabopino: all bogeys = 36 pts', () => {
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 17.3;
  assert.strictEqual(sp('Cabopino', cabPar.map(p => p + 1)).total, 36);
});
t('allowance 95 (typed as 95) gives PH 17: SI 18 hole loses its shot', () => {
  ctx.__sheets.Settings.data[1][1] = 95;
  const r = sp('Cabopino', cabPar.map(p => p + 1));
  const si18 = gsCourses.Cabopino.si.indexOf(18);
  assert.strictEqual(r.perHole[si18], 1);
  assert.strictEqual(r.total, 35);
  ctx.__sheets.Settings.data[1][1] = 1;
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = SCRATCH_AT_CABOPINO;
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
  assert.deepStrictEqual(d2.rows[0], { player: 'Steve Kelly', hcp: SCRATCH_AT_CABOPINO, front: 18, back: 18, total: 36, gross: cabPar.reduce((a, b) => a + b), pos: 1 });
  assert.ok(d2.rows.slice(1).every(r => r.total === null && r.pos === null));
  ctx.__sheets.Schedule.data[3][1] = '';
  assert.strictEqual(get().days[2].rows.length, 0);
  ctx.__sheets.Schedule.data[3][1] = 'Cabopino';
});
t('ranking: level on points share the position, no back-9 countback', () => {
  const s1 = cabPar.slice(); s1[0] -= 1;            // 37, front-9 birdie
  const s2 = cabPar.slice(); s2[17] -= 1;           // 37, back-9 birdie: no longer wins anything
  const s3 = cabPar.slice(); s3[17] -= 1;           // same as s2
  post(card('Ally McKinlay', 'Cabopino', s1));
  post(card('Owen Evans', 'Cabopino', s2));
  post(card('Titch Walton', 'Cabopino', s3));
  const rows = get().days[2].rows;
  assert.deepStrictEqual(rows.slice(0, 4).map(r => [r.player, r.total, r.pos]),
    [['Ally McKinlay', 37, 1], ['Owen Evans', 37, 1], ['Titch Walton', 37, 1], ['Steve Kelly', 36, 4]]);
});
t('resubmitting replaces the old card', () => {
  const s = cabPar.slice(); s[5] += 2;
  post(card('Steve Kelly', 'Cabopino', s));
  assert.strictEqual(get().days[2].rows.find(r => r.player === 'Steve Kelly').total, 34);
});
t('handicap added later recalculates old cards', () => {
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 17.3;
  assert.strictEqual(get().days[2].rows.find(r => r.player === 'Steve Kelly').total, 52);
  ctx.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = SCRATCH_AT_CABOPINO;
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

// 5. Live points on the score card page must match the script.
const pageFns = vm.createContext({ Math, Number, isNaN });
vm.runInContext(['shotsOnHole', 'stablefordHole'].map(n => html.match(new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0]).join('\n'), pageFns);
t('page Stableford maths = script, every course, handicaps -4..40, allowance 100% and 95%', () => {
  const gsPoints = vm.runInContext('stablefordPoints', ctx);
  let checked = 0, seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const allowance of [1, 0.95]) {
    ctx.__sheets.Settings.data[1][1] = allowance;
    for (const k of Object.keys(gsCourses)) {
      for (let hcp = -4; hcp <= 40; hcp++) {
        const scores = gsCourses[k].par.map(p => Math.max(1, p + Math.floor(rnd() * 6) - 2));
        const gs = gsPoints(k, scores, hcp).perHole;
        const ph = Math.round(vm.runInContext('courseHandicapExact', ctx)(k, hcp) * allowance);
        const page = scores.map((sc, i) => pageFns.stablefordHole(gsCourses[k].par[i], gsCourses[k].si[i], ph, sc));
        assert.deepStrictEqual(page, gs, k + ' hcp ' + hcp + ' @' + allowance);
        checked++;
      }
    }
  }
  ctx.__sheets.Settings.data[1][1] = 1;
  assert.strictEqual(checked, 2 * 5 * 45);
});
t('leaderboard call carries handicaps and the allowance for the page', () => {
  ctx.__sheets.Players.data.find(r => r[0] === 'Owen Evans')[1] = 30;
  const lb = get();
  assert.strictEqual(lb.handicaps['Owen Evans'], 30);
  assert.strictEqual(Object.keys(lb.handicaps).length, 16);
  assert.strictEqual(lb.allowance, 1);
  ctx.__sheets.Players.data.find(r => r[0] === 'Owen Evans')[1] = 0;
});

// 6. Course handicaps = the clubs' published equivalence tables (yellow, men).
t('course handicap matches official table rows', () => {
  const ch = (course, idx, allow) => Math.round(vm.runInContext('courseHandicapExact', ctx)(course, idx) * allow);
  const rows = [
    // [course, index, allowance, playing handicap per the club's table]
    ['Torrequebrada', 8.6, 1, 9], ['Torrequebrada', 8.7, 1, 10], ['Torrequebrada', 9.0, 1, 10],   // 2023 table, informal 100%
    ['Torrequebrada', 9.0, 0.95, 9], ['Torrequebrada', 9.1, 0.95, 10],                            // same table, medal/stableford 95%
    ['Santana', 9.8, 1, 9], ['Santana', 9.9, 1, 10], ['Santana', 30.3, 1, 33], ['Santana', 30.4, 1, 34],
    ['Calanova', 9.1, 1, 10], ['Calanova', 9.2, 1, 11], ['Calanova', 30.0, 1, 36]
  ];
  rows.forEach(([c, i, a, want]) => assert.strictEqual(ch(c, i, a), want, c + ' ' + i + ' @' + a));
});
t('page course-handicap formula = script, every course and index', () => {
  const pageCH = vm.runInNewContext(html.match(/function courseHandicapExact\(course, hcp\) \{[\s\S]*?\n\}/)[0] + '; courseHandicapExact');
  for (const k of Object.keys(pageCourses))
    for (let i = -4; i <= 54; i += 0.1)
      assert.ok(Math.abs(pageCH(pageCourses[k], i) - vm.runInContext('courseHandicapExact', ctx)(k, i)) < 1e-9, k + ' ' + i);
});
t('day tabs playing handicap = script, every course, index and allowance', () => {
  const fns = vm.createContext({ Math, Number, isNaN, COURSES: pageCourses });
  vm.runInContext(['courseHandicapExact', 'allowanceFactor', 'dayPlayingHandicap']
    .map(n => html.match(new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0]).join('\n'), fns);
  for (const a of [1, 100, 0.95, 95, 0, -1, '', 'x']) {
    ctx.__sheets.Settings.data[1][1] = a;
    const allow = vm.runInContext('allowance', ctx)();
    assert.strictEqual(fns.allowanceFactor(a), allow, 'allowance ' + a);
    for (const k of Object.keys(gsCourses))
      for (let i = -40; i <= 540; i++)
        assert.strictEqual(fns.dayPlayingHandicap(k, i / 10, fns.allowanceFactor(a)),
          Math.round(vm.runInContext('courseHandicapExact', ctx)(k, i / 10) * allow), k + ' ' + i / 10 + ' @' + a);
  }
  ctx.__sheets.Settings.data[1][1] = 1;
  assert.strictEqual(fns.dayPlayingHandicap('', 9, 1), null);
});

// 7. Tour handicap adjustments (Steve's league rules).
t('league adjustment arithmetic', () => {
  const adj = vm.runInContext('adjustedHandicap', ctx);
  const cases = [
    [9, 46, 0, 5.4], [9, 34, 0, 9], [9, 30, 0, 9], [9, 28, 0, 9], [9, 35, 0, 8.7], [9, 27, 0, 9.3],   // League 1, 0.3; 28-34 no change
    [9.9, 22, 0, 11.7], [2, 46, 0, -1.6], [9, 50, 0, 5],                          // 9.9 is League 1; can go plus; 4.8 capped at 4
    [10, 22, 0, 13], [17.9, 22, 0, 20.9], [18, 22, 0, 22], [18, 26, 1, 20.4],    // band edges: 10 = League 2, 17.9 = League 2, 18 = League 3
    [17, 40, 0, 14], [12, 20, 0, 16], [10.5, 36, 0, 9.5], [17, 44, 0, 13],        // League 2, 0.5; 5 capped
    [21, 25, 0, 23.1], [28, 35, 0, 27.3], [30, 36, 0, 28.6], [19, 20, 0, 23], [30, 20, 0, 34],   // League 3, 0.7 (over 28 too); 5.6 capped
    [17, 40, -1, 13], [17, 44, -1, 13], [9, 30, -1, 8], [9, 30, 1, 10],           // winner -1 / last +1, inside the cap of 4
    [9, 22, 1, 11.8], [30, 20, 1, 34], [9, 50, -1, 5], [9, 30, 0, 9]
  ];
  cases.forEach(([h, pts, bonus, want]) => assert.strictEqual(adj(h, pts, bonus), want, h + ' @ ' + pts + ' bonus ' + bonus));
});
t('handicaps carry forward day by day; no card = no change; corrections flow through', () => {
  const c2 = makeContext();
  vm.runInContext('ensureSheets()', c2);
  c2.__props.CARD_PIN = TEST_PIN;
  c2.__sheets.Players.data.find(r => r[0] === 'Steve Kelly')[1] = 9;
  c2.__sheets.Players.data.find(r => r[0] === 'Ally McKinlay')[1] = 6;
  const C = vm.runInContext('COURSES', c2);
  const post2 = b => JSON.parse(vm.runInContext('doPost', c2)({ postData: { contents: JSON.stringify(b) } }).body);
  const get2 = () => JSON.parse(vm.runInContext('doGet', c2)({ parameter: { action: 'leaderboard' } }).body);
  const steve = (course, scores) => post2({ player: 'Steve Kelly', course, submittedBy: 'Paddy Swan', scores, pin: TEST_PIN });

  // Day 1 Torrequebrada, all pars off course 10 = 46 pts -> 9 - 0.3 x 12 = 5.4
  // (the only card is both winner and last, so the two shots cancel)
  assert.strictEqual(steve('Torrequebrada', C.Torrequebrada.par).ok, true);
  let lb = get2();
  assert.deepStrictEqual([lb.days[0].handicaps['Steve Kelly'], lb.days[0].rows[0].total, lb.days[1].handicaps['Steve Kelly']], [9, 46, 5.4]);
  // Day 2 Calanova off 5.4 (course 6): pars = 42 -> 5.4 - 0.3 x 8 = 3.0 for Day 3
  steve('Calanova', C.Calanova.par);
  lb = get2();
  assert.deepStrictEqual([lb.days[1].rows.find(r => r.player === 'Steve Kelly').total, lb.days[2].handicaps['Steve Kelly']], [42, 3]);
  // the stored card points use the day's handicap, not the starting one
  assert.strictEqual(c2.__sheets.Cards.data[2][26], 42);
  // Ally never played: 6 on every day
  lb.days.forEach(d => assert.strictEqual(d.handicaps['Ally McKinlay'], 6));
  // Day 1 card corrected to all bogeys (28 pts off 10 -> no change) -> Day 2 back on 9 and re-scored
  steve('Torrequebrada', C.Torrequebrada.par.map(p => p + 1));
  lb = get2();
  assert.deepStrictEqual([lb.days[0].rows.find(r => r.player === 'Steve Kelly').total, lb.days[1].handicaps['Steve Kelly']], [28, 9]);
  assert.strictEqual(lb.days[1].rows.find(r => r.player === 'Steve Kelly').total, 46);   // Calanova pars off course 10
  assert.strictEqual(lb.days[2].handicaps['Steve Kelly'], 5.4);
});
t('winner -1, last place +1 (shared too), whole move capped at 4', () => {
  const c2 = makeContext();
  vm.runInContext('ensureSheets()', c2);
  c2.__props.CARD_PIN = TEST_PIN;
  const P = c2.__sheets.Players.data;
  [['Steve Kelly', 9], ['Bernie Brennan', 17], ['Ally McKinlay', 6]].forEach(([p, h]) => (P.find(r => r[0] === p)[1] = h));
  const C = vm.runInContext('COURSES', c2);
  const post2 = (player, course, scores) => JSON.parse(vm.runInContext('doPost', c2)({ postData: { contents: JSON.stringify({ player, course, submittedBy: 'Paddy Swan', scores, pin: TEST_PIN }) } }).body);
  const get2 = () => JSON.parse(vm.runInContext('doGet', c2)({ parameter: { action: 'leaderboard' } }).body);
  const pts = (lb, d, p) => lb.days[d].rows.find(r => r.player === p).total;

  // Day 1 Torrequebrada
  post2('Steve Kelly', 'Torrequebrada', C.Torrequebrada.par);                     // course 10, pars = 46: winner
  post2('Bernie Brennan', 'Torrequebrada', C.Torrequebrada.par.map(p => p + 1));  // course 20, bogeys = 38
  post2('Ally McKinlay', 'Torrequebrada', C.Torrequebrada.par.map(p => p + 1));   // course 6, bogeys = 24: last
  let lb = get2();
  assert.deepStrictEqual(['Steve Kelly', 'Bernie Brennan', 'Ally McKinlay'].map(p => pts(lb, 0, p)), [46, 38, 24]);
  const h2 = lb.days[1].handicaps;
  assert.strictEqual(h2['Steve Kelly'], 5);       // 0.3 x 12 = 3.6, + 1 for the win = 4.6 -> capped at 4
  assert.strictEqual(h2['Bernie Brennan'], 15);   // 0.5 x 4 = 2.0 cut, no bonus
  assert.strictEqual(h2['Ally McKinlay'], 8.2);   // 0.3 x 4 = 1.2 add, + 1 for last = 2.2
  assert.strictEqual(h2['Karl Atkinson'], 0);     // no card, no change

  // Day 2 Calanova, all pars: Ally (course 9) 45 wins, Steve (course 6) 42, Karl and Neil (course 0) 36 share last
  ['Ally McKinlay', 'Steve Kelly', 'Karl Atkinson', 'Neil Sanderson'].forEach(p => post2(p, 'Calanova', C.Calanova.par));
  lb = get2();
  assert.deepStrictEqual(['Ally McKinlay', 'Steve Kelly', 'Karl Atkinson', 'Neil Sanderson'].map(p => [pts(lb, 1, p), lb.days[1].rows.find(r => r.player === p).pos]),
    [[45, 1], [42, 2], [36, 3], [36, 3]]);
  const h3 = lb.days[2].handicaps;
  assert.strictEqual(h3['Ally McKinlay'], 4.2);   // 0.3 x 11 = 3.3, + 1 = 4.3 -> capped at 4
  assert.strictEqual(h3['Steve Kelly'], 2.6);     // 0.3 x 8 = 2.4, no bonus
  assert.strictEqual(h3['Karl Atkinson'], 0.4);   // 0.3 x 2 = 0.6 cut, + 1 for shared last
  assert.strictEqual(h3['Neil Sanderson'], 0.4);
  assert.strictEqual(h3['Bernie Brennan'], 15);   // no card on Day 2
});

// 8. Overall leaderboard (page side): level for 1st = countback Day 5, 4, 3, 2, 1.
t('overall: tie for 1st on countback from the last day; other ties on week Stableford', () => {
  const players = ['A', 'B', 'C', 'D', 'E'];
  const els = {};
  const el = id => (els[id] = els[id] || { id, rows: [], textContent: '', set innerHTML(v) { this.rows = []; }, appendChild(r) { this.rows.push(r); } });
  els.playerName = { options: players.map(p => ({ value: p })) };
  const doc = {
    getElementById: el,
    createElement: () => ({ cells: [], className: '', textContent: '', appendChild(c) { this.cells.push(c.textContent); } })
  };
  const fn = html.match(/function renderOverall\(days\) \{[\s\S]*?\n\}/)[0];
  const render = vm.runInNewContext(fn + '; renderOverall', { document: doc, Math, Array });
  const day = scores => ({ course: 'x', rows: Object.entries(scores).map(([player, [pos, total]]) => ({ player, pos, total })) });
  const unplayed = { course: '', rows: [] };
  const table = () => els.overallBody.rows.map(r => [r.cells[0], r.cells[1], r.cells[7]]);

  // A and B level on 4 for 1st. A has more week Stableford (111 v 108), but the countback runs from the
  // latest day: Days 5 and 4 unplayed, Day 3 level on 34, Day 2 B 38 v A 33 -> B 1st, A 2nd.
  // C and D level on 10 (not 1st): week Stableford C 88 v D 84 -> C 3rd (a countback would have picked D: Day 3 29 v 28).
  // E has no cards: 5 (field) on each played day.
  render([
    day({ A: [1, 44], B: [2, 36], C: [3, 30], D: [4, 25] }),
    day({ A: [2, 33], B: [1, 38], C: [3, 30], D: [3, 30] }),
    day({ A: [1, 34], B: [1, 34], C: [4, 28], D: [3, 29] }),
    unplayed, unplayed
  ]);
  assert.deepStrictEqual(table(), [[1, 'B', 4], [2, 'A', 4], [3, 'C', 10], [4, 'D', 10], [5, 'E', 15]]);

  // Level for 1st on every day's points too: they share 1st.
  render([
    day({ A: [1, 36], B: [1, 36], C: [3, 30] }),
    day({ A: [1, 38], B: [1, 38], C: [3, 25] }),
    unplayed, unplayed, unplayed
  ]);
  assert.deepStrictEqual(table().slice(0, 3), [[1, 'A', 2], [1, 'B', 2], [3, 'C', 6]]);
});

console.log('\n' + pass + ' passed');
