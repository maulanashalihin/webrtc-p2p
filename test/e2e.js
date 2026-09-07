// E2E: 2 browser headless join room yang sama -> P2P connected + chat nyampe.
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
  pa.on('console', (m) => console.log('[A]', m.text().slice(0, 160)));
  pb.on('console', (m) => console.log('[B]', m.text().slice(0, 160)));

  async function join(p, tag) {
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.fill('#room', room);
    await p.click('#btnCam');
    await p.waitForSelector('#call', { state: 'visible' });
    console.log(tag, 'joined room', room);
  }

  await join(pa, 'A');
  await join(pb, 'B');

  async function state(p) {
    return p.evaluate(() => ({
      conn: pc.connectionState,
      sig: pc.signalingState,
      ice: pc.iceConnectionState,
      status: document.getElementById('status').textContent,
    }));
  }

  let ok = false;
  for (let i = 0; i < 30; i++) {
    const [sa, sb] = [await state(pa), await state(pb)];
    if (i % 5 === 0) console.log('t=' + i + 's A=', JSON.stringify(sa), 'B=', JSON.stringify(sb));
    if (sa.conn === 'connected' && sb.conn === 'connected') {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('A final:', JSON.stringify(await state(pa)));
  console.log('B final:', JSON.stringify(await state(pb)));
  if (!ok) {
    await pa.screenshot({ path: '/tmp/e2e/fail-a.png' });
    await pb.screenshot({ path: '/tmp/e2e/fail-b.png' });
    console.log('E2E_CONNECT_FAIL');
    await browser.close();
    process.exit(1);
  }

  // Chat P2P A -> B
  await pa.fill('#msg', 'halo dari A');
  await pa.click('#btnSend');
  await pb.waitForFunction(
    () => document.getElementById('chatLog').textContent.includes('halo dari A'),
    { timeout: 10000 },
  );
  console.log('E2E_CHAT_OK');
  console.log('E2E_PASS');
  await browser.close();
})().catch((e) => {
  console.error('E2E_ERROR', e.message);
  process.exit(1);
});
