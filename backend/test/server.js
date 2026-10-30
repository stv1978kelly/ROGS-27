// Stand-in for the Apps Script web app + a copy of the page pointed at it.
// /exec behaves like the deployed script (CORS open, JSON replies).
const http = require('http');
const fs = require('fs');
const vm = require('vm');
const { makeContext, REPO } = require('./harness');

const PORT = 8812;
const ctx = makeContext();
vm.runInContext('ensureSheets()', ctx);
['Torrequebrada', 'Calanova', 'Cabopino', '', ''].forEach((c, i) => (ctx.__sheets.Schedule.data[i + 1][1] = c));   // Days 1-3 scheduled; 4-5 left TBC for the demo
// Demo notifications: one fresh (bannered), one three days old (listed only).
ctx.__sheets.Notifications.data.push([new Date(Date.now() - 3 * 3600e3), 'Bus to Torrequebrada leaves the hotel at 8:15 sharp.']);
ctx.__sheets.Notifications.data.push([new Date(Date.now() - 72 * 3600e3), 'Welcome to ROGS 2027 - scores go in after every round.']);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/exec') {
    const reply = out => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.body);
    };
    if (req.method === 'GET') return reply(ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }));
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      console.log('POST', req.headers['content-type'], body);
      reply(ctx.doPost({ postData: { contents: body } }));
    });
    return;
  }
  if (url.pathname === '/cards') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(ctx.__sheets.Cards.data));
  }
  const page = fs.readFileSync(REPO + '/index.html', 'utf8')
    .replace(/const WEBAPP_URL = "[^"]*";/, 'const WEBAPP_URL = "http://127.0.0.1:' + PORT + '/exec";');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page);
}).listen(PORT, '127.0.0.1', () => console.log('test server on ' + PORT));
