// Authored by Solaris City agent (gta6-01)
// probe.js — launch chrome, load game, report real state via Runtime.evaluate.
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
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });

await send('Page.enable');
await send('Page.navigate', { url: PAGE });
await sleep(2500);

// inspect the menu button geometry before clicking
const geom = await send('Runtime.evaluate', { expression: `JSON.stringify({btn: !!document.getElementById('playBtn'), rect: document.getElementById('playBtn')?.getBoundingClientRect(), menuHidden: document.getElementById('menu')?.className})` });
console.log('before click:', geom.result?.result?.value ?? JSON.stringify(geom));

// monkey-patch ui.play's onclick to record whether startGame actually runs
const patchResult = await send('Runtime.evaluate', { expression: `
(() => {
  const btn = document.getElementById('playBtn');
  window.__clicked = false;
  const prev = btn.onclick;
  btn.onclick = (e) => { window.__clicked = true; if (prev) try { prev(e); } catch (err) { window.__clickErr = String(err) + ' :: ' + (err.stack || ''); } };
  btn.click();
  return JSON.stringify({ clicked: window.__clicked, err: window.__clickErr ?? null, menuClass: document.getElementById('menu')?.className });
})()
`, returnByValue: true });
console.log('patched click:', patchResult.result?.result?.value ?? JSON.stringify(patchResult));

ws.close(); chrome.kill(); process.exit(0);
