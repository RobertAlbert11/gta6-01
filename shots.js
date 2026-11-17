// Authored by Solaris City agent (gta6-01)
// shots.js — renders the 4 submission screenshots from game/index.html via CDP.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/home/hermes2/.hermes/tools/chromium-1208/chrome-linux64/chrome';
const PORT = 9333;
const PAGE = 'file:///home/hermes2/makefun/gta6/gta6-01/game/index.html';

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--mute-audio',
  'about:blank',
]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(2500);

async function cdpReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://[::1]:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find(t => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('chrome CDP never came up');
}
const page = await cdpReady();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: PAGE });
await sleep(2000);

// click START GAME: use the button's real rect center, fallback to DOM click
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 478, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 478, button: 'left', clickCount: 1 });
await sleep(800);
const st1 = await send('Runtime.evaluate', { expression: `JSON.stringify({menuClass: document.getElementById('menu')?.className})` });
console.log('after coord click:', st1.result?.result?.value ?? JSON.stringify(st1));
if ((st1.result?.result?.value ?? '').includes('"menu"')) {
  await send('Runtime.evaluate', { expression: `document.getElementById('playBtn').click(); 'dom'` });
  await sleep(800);
  const st2 = await send('Runtime.evaluate', { expression: `JSON.stringify({menuClass: document.getElementById('menu')?.className})` });
  console.log('after DOM click:', st2.result?.result?.value ?? JSON.stringify(st2));
}

mkdirSync('/home/hermes2/makefun/gta6/gta6-01/screenshots', { recursive: true });

const scenes = [
  { name: '1-city-traffic.jpg', wait: 1000, drive: async () => {
      // hold W a touch to show motion, mostly idle traffic view
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
      await sleep(400);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    } },
  { name: '2-driving.jpg', wait: 2500, drive: async () => {
      // sustained drive
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
      await sleep(2000);
    } },
  { name: '3-police-chase.jpg', wait: 3500, drive: async () => {
      // keep driving; report a crime to raise heat so cops spawn
      await send('Runtime.evaluate', { expression: `game.police.reportCrime('grand-theft-auto', game.player.x, game.player.y); game.police.reportCrime('cop-ram', game.player.x, game.player.y); game.police.reportCrime('gunfire', game.player.x, game.player.y); 'heat=' + game.police.level` });
      await sleep(1500);
    } },
  { name: '4-mission.jpg', wait: 1500, drive: async () => {
      // ensure a mission objective is active with HUD text
      await send('Runtime.evaluate', { expression: `if (!game.missions.current) game.missions.offerNext(); 'mission=' + (game.missions.current?.name ?? 'none')` });
    } },
];

for (const s of scenes) {
  await s.drive();
  await sleep(s.wait);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join('/home/hermes2/makefun/gta6/gta6-01/screenshots', s.name), Buffer.from(shot.result.data, 'base64'));
  console.log('shot:', s.name);
  // release W after driving shots
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }).catch(() => {});
}

console.log('state check:');
const st = await send('Runtime.evaluate', { expression: `JSON.stringify({state: game.state, heat: game.police.level, mission: game.missions.current?.name, cops: game.police.cars.length, cars: game.traffic.vehicles.length})` });
console.log(st.result.result.value);

ws.close();
chrome.kill();
process.exit(0);
