// Authored by Solaris City agent (gta6-01)
// probe2.js — capture console/page errors during boot, then click via DOM el.click().
import { spawn } from 'node:child_process';

const CHROME = '/home/hermes2/.hermes/tools/chromium-1208/chrome-linux64/chrome';
const PORT = 9333;
const PAGE = 'file:///home/hermes2/makefun/gta6/gta6-01/game/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu',
  '--window-size=1280,720', '--mute-audio', 'about:blank',
]);

async function cdpReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://[::1]:${PORT}/json/list`)).json();
      const page = targets.find(t => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('no cdp');
}
const page = await cdpReady();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type))
    events.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown')
    events.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: PAGE });
await sleep(2500);

console.log('boot events:', events.length ? events : 'none');

// set canvas size explicitly, then click via DOM
await send('Runtime.evaluate', { expression: `document.getElementById('game').width=1280; document.getElementById('game').height=720; document.getElementById('playBtn').click(); 'clicked'` });
await sleep(1500);

const st = await send('Runtime.evaluate', { expression: `JSON.stringify({menuClass: document.getElementById('menu')?.className})` });
console.log('after DOM click:', st.result?.result?.value ?? JSON.stringify(st));
console.log('post-click events:', events.length ? events : 'none');

ws.close(); chrome.kill(); process.exit(0);
