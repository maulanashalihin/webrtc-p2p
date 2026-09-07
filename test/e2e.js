// E2E v2: lobby -> prejoin -> call, 2 browser, nama tampil di chat.
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
  const room = 'e2e' + Date.now().toString(36);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  async function join(p, name, cam) {
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.fill('#name', name);
    await p.fill('#room', room);
    await p.click(cam ? '#btnCam' : '#btnChat');
    await p.waitForSelector('#screen-prejoin', { state: 'visible' });
    await p.click('#btnMasuk');
    await p.waitForSelector('#screen-call', { state: 'visible' });
  }

  await join(pa, 'Ani', true);
  await join(pb, 'Budi', true);

  async function state(p) {
    return p.evaluate(() => ({
      ok: pcs.size === 1 && [...pcs.values()].every((s) => s.pc.connectionState === 'connected'),
      status: document.getElementById('qtxt').textContent,
    }));
  }

  let ok = false;
  for (let i = 0; i < 30; i++) {
    const [sa, sb] = [await state(pa), await state(pb)];
    if (sa.ok && sb.ok) {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('A:', JSON.stringify(await state(pa)));
  console.log('B:', JSON.stringify(await state(pb)));
  if (!ok) {
    await pa.screenshot({ path: '/tmp/e2e/fail-a.png' });
    await pb.screenshot({ path: '/tmp/e2e/fail-b.png' });
    console.log('E2E_CONNECT_FAIL');
    await browser.close();
    process.exit(1);
  }

  await pa.fill('#msg', 'halo dari Ani');
  await pa.click('#btnSend');
  await pb.waitForFunction(
    () => document.getElementById('chatLog').textContent.includes('Ani') &&
         document.getElementById('chatLog').textContent.includes('halo dari Ani'),
    { timeout: 10000 },
  );
  console.log('E2E_CHAT_OK');
  console.log('E2E_PASS');
  await browser.close();
})().catch((e) => {
  console.error('E2E_ERROR', e.message);
  process.exit(1);
});
