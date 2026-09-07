// Screenshot review: lobby, prejoin, call 2 peer + chat.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const room = 'shot' + Date.now().toString(36);
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await ctxA.newPage();
  await pa.goto('http://127.0.0.1:8090/', { waitUntil: 'domcontentloaded' });
  await pa.waitForTimeout(800);
  await pa.screenshot({ path: '/tmp/shot-lobby.png' });

  await pa.fill('#name', 'Ani');
  await pa.fill('#room', room);
  await pa.click('#btnCam');
  await pa.waitForSelector('#screen-prejoin', { state: 'visible' });
  await pa.waitForTimeout(1200);
  await pa.screenshot({ path: '/tmp/shot-prejoin.png' });
  await pa.click('#btnMasuk');

  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pb = await ctxB.newPage();
  await pb.goto('http://127.0.0.1:8090/', { waitUntil: 'domcontentloaded' });
  await pb.fill('#name', 'Budi');
  await pb.fill('#room', room);
  await pb.click('#btnCam');
  await pb.waitForSelector('#screen-prejoin', { state: 'visible' });
  await pb.click('#btnMasuk');
  await pa.waitForFunction(() => [...pcs.values()].every((s) => s.pc.connectionState === 'connected') && pcs.size === 1, { timeout: 30000 });
  await pa.fill('#msg', 'Halo, kedengeran jelas?');
  await pa.click('#btnSend');
  await pa.waitForTimeout(1500);
  await pa.screenshot({ path: '/tmp/shot-call.png' });
  console.log('SHOTS_OK');
  await browser.close();
})().catch((e) => { console.error('SHOT_FAIL', e.message); process.exit(1); });
