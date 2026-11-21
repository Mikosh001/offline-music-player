const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4173';
(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'msedge' }); }
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Seed on a static document: the running player must not overwrite this fixture on pagehide.
  await page.goto(base + '/legal/site-policy.html');
  await page.evaluate(async () => {
    const db = await import('/db.js');
    const blob = await (await fetch('/assets/audio/qazaq-wave.wav')).blob();
    for (const [id, title] of [['reg-a','Regression A'], ['reg-b','Regression B'], ['reg-c','Regression C']]) {
      await db.saveAudio({ id, title, artist: 'Original test audio', artistId:'local', source:'local', duration:24 }, blob);
    }
    await db.saveAudio({ id:'reg-bad',title:'Damaged audio',artist:'Test fixture',artistId:'local',source:'local'},new Blob(['invalid audio'],{type:'audio/mpeg'}));
    await db.put('settings', { key:'playback', value:{currentId:'saz-wave',position:9.25,queue:['saz-wave','saz-evening'],queueOrder:['saz-wave','saz-evening'],repeat:'off',shuffle:false} });
  });
  let releaseMetadata;
  const metadataGate = new Promise(resolve => { releaseMetadata = resolve; });
  await page.route('**/assets/audio/qazaq-wave.wav', async route => { await metadataGate; await route.continue(); });
  await page.goto(base + '/#downloads');
  await page.waitForFunction(() => document.querySelector('#playerTitle').textContent === 'Өз ырғағың');
  // Flush a checkpoint while metadata is not available. The original implementation saved zero here.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  let checkpoint = await page.evaluate(async () => (await (await import('/db.js')).get('settings','playback')).value);
  assert.equal(checkpoint.position, 9.25, 'resume position survives delayed metadata and checkpoint');
  releaseMetadata();
  await page.waitForFunction(() => document.querySelector('#audio').currentTime > 9);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true,'reload never autoplays');
  await page.unroute('**/assets/audio/qazaq-wave.wav');
  // The last selection wins even when the previous IndexedDB read is blocked by a writer.
  await page.evaluate(async () => {
    const db = await (await import('/db.js')).openDB();
    const tx=db.transaction('audio','readwrite'), store=tx.objectStore('audio');
    const end=Date.now()+400;
    function hold(){ const req=store.get('reg-a');req.onsuccess=()=>{if(Date.now()<end)hold();}; }
    hold();
  });
  await page.locator('[data-track-id="reg-a"] .track-title').click();
  await page.locator('[data-track-id="reg-c"] .track-title').click();
  await page.waitForFunction(() => document.querySelector('#playerTitle').textContent === 'Regression C' && !document.querySelector('#audio').paused);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#playerTitle').textContent(), 'Regression C');
  // Pause during the pending read must cancel autoplay rather than start the old source.
  await page.evaluate(async () => {
    const db = await (await import('/db.js')).openDB();
    const store=db.transaction('audio','readwrite').objectStore('audio');const end=Date.now()+700;
    function hold(){const r=store.get('reg-a');r.onsuccess=()=>{if(Date.now()<end)hold();};}hold();
  });
  await page.locator('[data-track-id="reg-a"] .track-title').click();
  await page.locator('#playBtn').click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true,'pause while loading is respected');
  assert.equal(await page.locator('#playerTitle').textContent(),'Regression A');
  // Save a precise seek and reload immediately (without waiting for the old 350 ms debounce).
  await page.locator('#audio').evaluate(a=>a.currentTime=7.375);
  await page.locator('#seek').fill('37');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#audio').currentTime > 8);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true);
  // Queue fixtures are seeded between static pages so unload does not overwrite them.
  async function seed(queue,repeat='off', currentId=queue[0]) {
    await page.goto(base+'/legal/site-policy.html');
    await page.evaluate(async ({queue,repeat,currentId})=>{
      const db=await import('/db.js');
      localStorage.removeItem('saz-playback:/');
      await db.put('settings',{key:'playback',value:{currentId,position:0,queue,queueOrder:queue,repeat,shuffle:false,savedAt:Date.now()}});
    },{queue,repeat,currentId});
    await page.goto(base+'/#downloads');
    await page.waitForFunction(()=>document.querySelector('#audio').readyState>=1 || document.querySelector('#audio').error);
  }
  await seed(['reg-a','reg-b']);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'library' && value.plays > 0)
        throw new DOMException('Simulated statistics write failure', 'QuotaExceededError');
      return original.call(this, value, ...args);
    };
  });
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#playerTitle').textContent(), 'Regression A', 'statistics write failure cannot skip audio');
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused), false);
  await seed(['reg-a','reg-bad','reg-b']);
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  // Real ended event, rather than a synthetic dispatch.
  await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
  await page.waitForFunction(()=>document.querySelector('#playerTitle').textContent==='Regression B' && !document.querySelector('#audio').paused);
  assert.equal(await page.locator('#playerTitle').textContent(),'Regression B','bad middle file is skipped automatically');
  // Repeat one must restart, then repeat off must stop at the actual end of a queue.
  await seed(['reg-a'],'one');
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
  await page.waitForFunction(()=>!document.querySelector('#audio').paused && document.querySelector('#audio').currentTime < 2);
  await seed(['reg-a'],'off');
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
  await page.waitForFunction(()=>document.querySelector('#audio').ended && document.querySelector('#audio').paused);
  // A one-track broken queue with repeat-all terminates and stays responsive.
  await seed(['reg-bad'],'all');
  await page.locator('#playBtn').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true);
  assert.match(await page.locator('#toast').textContent(),/ойнатылмады/);
  await page.goto(base+'/#settings');
  await page.locator('#energySaving').waitFor();
  assert.equal(await page.locator('#energySaving').isChecked(),true);
  await page.locator('#energySaving').uncheck();
  await page.reload();
  await page.locator('#energySaving').waitFor();
  assert.equal(await page.locator('#energySaving').isChecked(),false,'energy preference persists');
  // Offline filtering preserves saved audio and still advances after a real ended event.
  await seed(['reg-a','reg-b']);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
  await page.waitForFunction(()=>document.querySelector('#playerTitle').textContent==='Regression B' && !document.querySelector('#audio').paused);
  assert.match(await page.locator('#audio').getAttribute('src'),/^blob:/);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Playback regressions passed: delayed metadata resume, rapid switching, pause during load, immediate reload checkpoint, real ended/next, corrupt-file skip, repeat one/off, bounded broken queue, energy preference, offline continuation.');
})().catch(error=>{console.error(error);process.exit(1);});
