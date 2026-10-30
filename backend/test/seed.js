// Seeds the demo server (server.js) with a 3-day scenario that has known answers.
// Expected overall: Steve 5, Ally 19, Owen 20, Bernie 34, Paddy 35,
// Karl 36 (6th, more Stableford) and Neil 36 (7th), everyone else 48 (joint 8th).
const vm = require('vm');
const { makeContext } = require('./harness');
const C = vm.runInContext('COURSES', makeContext());

// Par everywhere, then: birdies on the listed holes, bogeys on the listed holes.
const card = (course, birdies = [], bogeys = []) =>
  C[course].par.map((p, i) => p - (birdies.includes(i) ? 1 : 0) + (bogeys.includes(i) ? 1 : 0));
const range = n => Array.from({ length: n }, (_, i) => i);

const cards = [
  ['Ally McKinlay', 'Torrequebrada', card('Torrequebrada', [0])],                    // 37
  ['Owen Evans',    'Torrequebrada', card('Torrequebrada', [], range(12))],          // 24
  ['Steve Kelly',   'Torrequebrada', card('Torrequebrada', [], range(18))],          // 18
  ['Steve Kelly',   'Calanova',      card('Calanova', [0, 1, 9, 10])],               // 40
  ['Ally McKinlay', 'Calanova',      card('Calanova', [], [0, 1, 2, 9, 10, 11])],    // 30
  ['Owen Evans',    'Calanova',      card('Calanova', [], [3, 4, 5, 12, 13, 14])],   // 30, same back 9 = joint 2nd
  ['Karl Atkinson', 'Calanova',      card('Calanova', [], range(16))],               // 20
  ['Steve Kelly',   'Cabopino',      card('Cabopino', [0, 1, 9, 10])],                // 40
  ['Bernie Brennan','Cabopino',      card('Cabopino')],                               // 36
  ['Paddy Swan',    'Cabopino',      card('Cabopino', [], [0, 9])],                   // 34
  ['Neil Sanderson','Cabopino',      card('Cabopino', [], range(18))]                 // 18
];

(async () => {
  for (const [player, course, scores] of cards) {
    const res = await fetch('http://127.0.0.1:8812/exec', { method: 'POST', body: JSON.stringify({ player, course, submittedBy: 'Titch Walton', scores, pin: process.env.ROGS_DEMO_PIN }) });
    console.log(player.padEnd(16), course.padEnd(14), JSON.stringify(await res.json()));
  }
})();
