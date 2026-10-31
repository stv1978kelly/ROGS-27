// Builds backend/ROGS-2027-Tour-Rules.docx. Keep the data below in step with the app.
// Run:  cd backend/rulesdoc && npm install && node make_rules.js ../ROGS-2027-Tour-Rules.docx
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel,
  WidthType, ShadingType, BorderStyle, LevelFormat, Footer, PageNumber, TableLayoutType
} = require('docx');

const NAVY = '1A2A5C', GOLD = 'D4A017', LIGHT = 'F5F7FC', CREAM = 'FDF6E0';
const FONT = 'Arial';
const W = 9026; // A4 text width at 1" margins (DXA)

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: 120 }, ...opts.para,
  children: (Array.isArray(text) ? text : [text]).map(t => typeof t === 'string' ? new TextRun({ text: t, font: FONT, size: 21 }) : t)
});
const b = t => new TextRun({ text: t, bold: true, font: FONT, size: 21 });
const r = t => new TextRun({ text: t, font: FONT, size: 21 });
const h1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 2 } },
  children: [new TextRun({ text: t, bold: true, font: FONT, size: 30, color: NAVY })] });
const h2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 },
  children: [new TextRun({ text: t, bold: true, font: FONT, size: 24, color: NAVY })] });
const bullet = runs => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 },
  children: (Array.isArray(runs) ? runs : [runs]).map(t => typeof t === 'string' ? r(t) : t) });
const note = runs => new Paragraph({ spacing: { before: 60, after: 160 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: CREAM },
  border: { left: { style: BorderStyle.SINGLE, size: 24, color: GOLD, space: 8 } }, indent: { left: 160 },
  children: (Array.isArray(runs) ? runs : [runs]).map(t => typeof t === 'string' ? r(t) : t) });

function table(headers, rows, widths, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C8CFE0' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, w, head, i, align) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: head ? NAVY : (i % 2 ? LIGHT : 'FFFFFF') },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: String(text), font: FONT, size: opts.size || 19, bold: head, color: head ? 'FFFFFF' : '222222' })] })]
  });
  const align = c => (opts.leftCols || [0]).includes(c) ? AlignmentType.LEFT : AlignmentType.CENTER;
  return new Table({
    width: { size: widths.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, c) => cell(h, widths[c], true, 0, align(c))) })]
      .concat(rows.map((row, i) => new TableRow({ children: row.map((v, c) => cell(v, widths[c], false, i, align(c))) })))
  });
}
const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

// ── Data (matches the live app) ──
const COURSES = [
  ['1', 'Golf Torrequebrada', 72, '5,766 m', '70.9', '139'],
  ['2', 'Calanova Golf Club', 72, '5,773 m', '71.5', '136'],
  ['3', 'Cabopino Golf Marbella', 71, '5,193 m', '69.1', '130'],
  ['4', 'La Cala Resort - Asia', 72, '5,401 m', '69.1', '139'],
  ['5', 'Santana Golf', 72, '5,654 m', '70.0', '132']
];
const CR = [[70.9, 139, 72], [71.5, 136, 72], [69.1, 130, 71], [69.1, 139, 72], [70.0, 132, 72]];
const PLAYERS = [['Ally McKinlay', 6], ['Anthony Parkinson', 2], ['Bernie Brennan', 17], ['Brian McSherry', 12], ['Bryan Bennett', 2],
  ['Jim Chadwick', 15], ['John Douglas', 7], ['Karl Atkinson', 7], ['Neil Sanderson', 6], ['Owen Evans', 30], ['Paddy Swan', 13],
  ['Paul Simpson', 5], ['Rick Kennedy', 9], ['Robbie Strange', 10], ['Steve Kelly', 9], ['Titch Walton', 21]];
const ch = (h, [cr, sl, par]) => { const x = h * sl / 113 + (cr - par); return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5); };
const fmt = v => (v < 0 ? '+' + (-v) : String(v));

const children = [
  // Title block
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: 'ROGS 2027', bold: true, font: FONT, size: 56, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: 'MALAGA', bold: true, font: FONT, size: 26, color: GOLD, characterSpacing: 60 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } },
    children: [new TextRun({ text: 'Tour Rules', font: FONT, size: 30, color: NAVY })] }),

  h1('1. The Tour'),
  p('Five rounds of individual Stableford over five days, one course per day, all off the yellow tees. Every round counts towards the daily leaderboard for that day and towards the Overall leaderboard for the week.'),
  table(['Day', 'Course', 'Par', 'Yellow length', 'Course rating', 'Slope'], COURSES, [700, 3126, 800, 1600, 1500, 1300], { leftCols: [1] }),
  p('Course ratings and slopes are the yellow-tee (men’s) figures published by each club (La Cala Asia from published course listings). Scores are entered through the ROGS 2027 app: stv1978kelly.github.io/ROGS-27.', { para: { spacing: { before: 120, after: 120 } } }),

  h1('2. Handicaps'),
  h2('2.1 Starting handicap'),
  p('Before the tour every player supplies their certified handicap. This is entered once and is each player’s starting point for the week. It is never edited by hand during the tour; all changes come from the rules below.'),
  h2('2.2 Course handicap'),
  p('Each player’s handicap is converted into a course handicap for the course being played, using the World Handicap System formula:'),
  note([b('Course handicap = handicap × slope ÷ 113 + (course rating − par)')]),
  bullet('The handicap allowance is 100% (full course handicap).'),
  bullet('The result is rounded to the nearest whole number only at the end (a half rounds up).'),
  bullet('A course rated below par can give a low handicapper a plus course handicap (shown as +1, +2 ...).'),
  p([b('Example: '), r('Steve Kelly, handicap 9, at Torrequebrada: 9 × 139 ÷ 113 + (70.9 − 72) = 9.97, so a course handicap of 10.')]),
  p('Everyone’s starting course handicap for every course is listed in the Appendix.'),
  h2('2.3 Daily handicap adjustment (leagues)'),
  p('After each round, a player’s handicap moves according to their Stableford points for that day, at the rate for the league they were in going into the round:'),
  table(['League', 'Handicap', 'Each point over 32', 'Each point under 28'],
    [['League 1', '10 or below', 'cut 0.5', 'add 0.5'], ['League 2', '11 – 18', 'cut 0.8', 'add 0.8'], ['League 3', '19 – 28', 'cut 1', 'add 1']],
    [1600, 2026, 2700, 2700]),
  gap(),
  bullet([b('28 to 32 points: '), r('no change.')]),
  bullet([b('Adjustments start after Day 1. '), r('Day 1 is played off the starting handicap; each day after that is played off the adjusted handicap, so every player knows their course handicap before teeing off.')]),
  bullet([b('Leagues move with you. '), r('Your league for each day is set by your handicap going into that day, so a big cut or rise can move you into a different league for the next round.')]),
  bullet([b('Over 28: '), r('players above 28 are treated as League 3 (1 shot per point).')]),
  bullet([b('No card for a day: '), r('no change; the handicap carries over.')]),
  bullet([b('Part shots: '), r('handicaps keep one decimal place (e.g. 2.0, 11.6) and are only rounded when turned into a course handicap.')]),
  bullet([b('No limits: '), r('there is no maximum cut or rise, and a handicap can go into plus figures.')]),
  bullet([b('Corrections flow through: '), r('if a card is corrected, every later day’s handicaps and scores are recalculated automatically.')]),
  p([b('Worked example – Steve Kelly (start 9, League 1)')], { para: { spacing: { before: 160, after: 80 } } }),
  table(['Day', 'Played off', 'Points', 'Adjustment', 'Next day'],
    [['1', '9.0 (course 10)', '46', '14 over 32 × 0.5 = cut 7', '2.0'],
     ['2', '2.0 (course 2)', '18', '10 under 28 × 0.5 = add 5', '7.0'],
     ['3', '7.0 (course 6)', '–', '', '']],
    [800, 2000, 1000, 3426, 1800]),

  h1('3. Scoring – Stableford'),
  p('Shots are received on holes by stroke index (S.I.): a course handicap of 10 gives one shot on S.I. 1–10; 20 gives one shot on every hole plus a second on S.I. 1–2. A plus handicap gives shots back on the easiest holes (highest S.I.). Points per hole are based on the net score:'),
  table(['Net score', 'Points'], [['Net double bogey or worse', '0'], ['Net bogey', '1'], ['Net par', '2'], ['Net birdie', '3'], ['Net eagle', '4'], ['Net albatross', '5']], [5026, 4000], { leftCols: [0] }),

  h1('4. Daily Leaderboard'),
  bullet('Highest Stableford points wins the day.'),
  bullet('Ties are split on the back 9 points (countback). Players still level share the position.'),
  bullet('A day appears on the leaderboard once its course is set and at least one card is in.'),

  h1('5. Overall Leaderboard'),
  bullet([b('Your daily finishing position is your score for that day '), r('(1st = 1 point, 16th = 16 points). The lowest total over the week wins.')]),
  bullet([b('No card on a day that has been played: '), r('you score last place for that day (16).')]),
  bullet('Only days that have been played (course set and at least one card in) count.'),
  bullet('Level totals are split on total Stableford points over the week (higher wins); still level, players share the position.'),

  h1('Appendix – Starting Course Handicaps'),
  p('Course handicaps at 100% from each player’s starting handicap. From Day 2 onwards these change with the daily adjustments; the app always shows the current figure.'),
  table(['Player', 'Start', 'Day 1 Torrequebrada', 'Day 2 Calanova', 'Day 3 Cabopino', 'Day 4 La Cala Asia', 'Day 5 Santana'],
    PLAYERS.map(([n, h]) => [n, h].concat(CR.map(c => fmt(ch(h, c))))),
    [2226, 800, 1200, 1200, 1200, 1200, 1200], { leftCols: [0], size: 18 })
];

const doc = new Document({
  creator: 'ROGS 2027', title: 'ROGS 2027 Malaga - Tour Rules',
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'ROGS 2027 Malaga – Tour Rules   |   Page ', font: FONT, size: 16, color: '888888' }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '888888' })] })] }) },
    children
  }]
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(process.argv[2], buf); console.log('written', buf.length, 'bytes'); });
