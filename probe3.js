// Authored by Solaris City agent (gta6-01)
// probe3.js — determine why the menu click does not start the game.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

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
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value ?? r.result?.result?.description ?? JSON.stringify(r);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: PAGE });
await sleep(3000);

console.log('typeof globalThis.game:', await evalJs('typeof globalThis.game'));
console.log('scripts:', await evalJs(`[...document.querySelectorAll('script')].map(s => s.type + ' ' + (s.src || 'inline')).join(' | ')`));
console.log('moduleLoadError probe:', await evalJs(`fetch('./src/main.js').then(r => r.status).catch(e => 'ERR ' + e.message)`));

// check whether the module really executed: the HUD offscreen canvas is created in Minimap constructor
// (not visible). Instead try: the menu button text (save.load may set CONTINUE), and use a MutationObserver-free approach:
console.log('playBtn text:', await evalJs(`document.getElementById('playBtn').textContent`));

// Manually dispatch what the handler does, by monkey-patching a marker:
const r = await send('Runtime.evaluate', { expression: `
(() => {
  const btn = document.getElementById('playBtn');
  let fired = false;
  const orig = btn.onclick;
  btn.addEventListener('click', () => { fired = true; });
  btn.click();
  return JSON.stringify({ firedNow: fired, hasOnclick: typeof orig });
})()
`, returnByValue: true });
console.log('click probe:', r.result?.result?.value);

// screenshot the current state to see what's on screen
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
writeFileSync('/home/hermes2/makefun/gta6/gta6-01/probe-menu.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('menu screenshot saved');

ws.close(); chrome.kill(); process.exit(0);
