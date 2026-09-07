// E2E alur: raise hand, daftar orang, leave -> ringkasan -> gabung lagi.
const { chromium } = require('playwright');
const URL = process.env.E2E_URL || 'http://127.0.0.1:8090/';
(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const room = 'ux' + Date.now().toString(36);
  async function join(name) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.fill('#name', name);
    await p.fill('#room', room);
    await p.click('#btnCam');
    await p.waitForSelector('#screen-prejoin', { state: 'visible' });
    await p.click('#btnMasuk');
    await p.waitForSelector('#screen-call', { state: 'visible' });
    return p;
  }
  const pa = await join('Ani');
  const pb = await join('Budi');
  await pa.waitForFunction(() => [...pcs.values()].every((s) => s.pc.connectionState === 'connected') && pcs.size === 1, { timeout: 30000 });
  console.log('CONNECTED');

  // raise hand terlihat lawan
  await pa.click('#btnHand');
  await pb.waitForSelector('.tile.raised', { timeout: 10000 });
  console.log('HAND_OK');

  // daftar orang ada kedua nama
  await pb.click('#tabPeople');
  await pb.waitForFunction(() => document.getElementById('panePeople').textContent.includes('Ani'), { timeout: 5000 });
  console.log('PEOPLE_OK');

  // leave -> ringkasan -> gabung lagi
  await pa.click('#btnLeave');
  await pa.waitForSelector('#screen-ended', { state: 'visible' });
  const who = await pa.textContent('#endWho');
  const cnt = await pa.textContent('#endCount');
  console.log('ENDED:', JSON.stringify(who), 'count=' + cnt.trim());
  if (!who.includes('Budi') || cnt.trim() !== '2') { console.log('SUMMARY_FAIL'); process.exit(1); }
  await pa.click('#btnRejoin');
  await pa.waitForSelector('#screen-call', { state: 'visible' });
  await pa.waitForFunction(() => [...pcs.values()].every((s) => s.pc.connectionState === 'connected') && pcs.size === 1, { timeout: 30000 });
  console.log('REJOIN_OK');
  console.log('E2E_UX_PASS');
  await browser.close();
})().catch((e) => { console.error('E2E_ERROR', e.message); process.exit(1); });
