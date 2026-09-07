// E2E mesh: 3 browser, semua pasangan connected, chat broadcast nyampe semua.
const { chromium } = require('playwright');

const URL = process.env.E2E_URL || 'http://127.0.0.1:8090/';

(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const room = 'mesh' + Date.now().toString(36);
  const pages = [];
  for (const name of ['Ani', 'Budi', 'Cici']) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.fill('#name', name);
    await p.fill('#room', room);
    await p.click('#btnCam');
    await p.waitForSelector('#screen-prejoin', { state: 'visible' });
    await p.click('#btnMasuk');
    await p.waitForSelector('#screen-call', { state: 'visible' });
    pages.push([name, p]);
    console.log(name, 'masuk', room);
  }

  const meshOk = (p) =>
    p.evaluate(() => [...pcs.values()].every((s) => s.pc.connectionState === 'connected') && pcs.size === 2);

  let ok = false;
  for (let i = 0; i < 40; i++) {
    const st = await Promise.all(pages.map(([, p]) => meshOk(p)));
    if (i % 5 === 0) console.log('t=' + i + 's', st.join('/'));
    if (st.every(Boolean)) {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) {
    console.log('E2E_MESH_CONNECT_FAIL');
    await browser.close();
    process.exit(1);
  }
  console.log('E2E_MESH_CONNECTED');

  const [, pa] = pages[0];
  await pa.waitForFunction(() => [...pcs.values()].every((s) => s.dc?.readyState === 'open') && pcs.size === 2, { timeout: 20000 });
  console.log('E2E_DC_OPEN');

  await pa.fill('#msg', 'halo mesh');
  await pa.click('#btnSend');
  for (const [name, p] of pages.slice(1)) {
    await p.waitForFunction(
      () => document.getElementById('chatLog').textContent.includes('halo mesh'),
      { timeout: 10000 },
    );
    console.log('chat nyampe di', name);
  }
  console.log('E2E_MESH_PASS');
  await browser.close();
})().catch((e) => {
  console.error('E2E_ERROR', e.message);
  process.exit(1);
});
