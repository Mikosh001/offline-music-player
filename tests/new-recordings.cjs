const {chromium}=require('playwright');
const assert=require('node:assert/strict');

async function checkMediaArtwork(page, base, track, path, type) {
  const src = new URL(path, base).href;
  await page.waitForFunction(({ title, src, type }) => {
    const metadata = navigator.mediaSession?.metadata;
    return metadata?.title === title && metadata.artwork[0]?.src === src &&
      metadata.artwork[0]?.type === type;
  }, { title: track.title, src, type });
  const image = await page.evaluate(async (src) => {
    const response = await fetch(src);
    const image = new Image();
    image.src = src;
    await image.decode();
    return [response.status, response.headers.get("content-type"), image.naturalWidth, image.naturalHeight];
  }, src);
  assert.equal(image[0], 200);
  assert.equal(image[1].split(";")[0], type);
  assert.deepEqual(image.slice(2), [512, 512]);
}

(async()=>{
  let browser;
  try{browser=await chromium.launch();}catch{browser=await chromium.launch({channel:'msedge'});}
  try{
    const base=process.env.SAZ_TEST_URL || 'http://127.0.0.1:4173/';
    const context=await browser.newContext();
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'#catalog');
    await page.locator('#availabilityFilter').waitFor();
    assert.match(await page.locator('.availability-strip').textContent(),/325 толық аудио/);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const songs=await page.evaluate(async()=>{
      const declaration=await(await fetch('./permissions/additional-audio-20261122.json')).json();
      const catalog=await(await fetch('./catalog.json')).json();
      return catalog.tracks.filter(t=>declaration.tracks.some(p=>p.trackId===t.id));
    });
    assert.equal(songs.length,25);
    await page.goto(base+'#home');
    assert.match(await page.locator('[data-latest-additions]').textContent(),/25 толық ән/);
    await page.locator('[data-latest-additions] a').click();
    await page.getByRole('heading',{name:'Жаңа қосылғандар',exact:true}).waitFor();
    assert.equal(await page.locator('.track-row').count(),25);
    assert.deepEqual(new Set(await page.locator('.track-row').evaluateAll(rows=>rows.map(r=>r.dataset.trackId))),new Set(songs.map(t=>t.id)));
    for(const artist of ['darkhan','ayau','dequine','kalifarniya','kazybek']){
      const t=songs.find(t=>t.artistId===artist);assert.ok(t);
      await page.goto(base+'#artist/'+artist);
      await page.locator(`[data-track-id="${t.id}"] .track-title`).click();
      await page.waitForFunction(id=>document.querySelector('#playerTitle').textContent===id&&!document.querySelector('#audio').paused,t.title);
      assert.equal(new URL(await page.locator('#audio').getAttribute('src'),base).origin,new URL(base).origin);
      await checkMediaArtwork(page, base, t, t.poster, "image/jpeg");
    }
    const selected=['ayau','kazybek'].map(artist=>songs.find(t=>t.artistId===artist));
    for(const t of selected){
      await page.goto(base+'#artist/'+t.artistId);
      await page.locator(`[data-track-id="${t.id}"] [data-action="download"]`).click();
      await page.locator(`[data-track-id="${t.id}"] .offline-text`).waitFor({timeout:60000});
      const hash=await page.evaluate(async id=>{
        const DB=await import('./db.js');const item=await DB.get('audio',id);
        const digest=await crypto.subtle.digest('SHA-256',await item.blob.arrayBuffer());
        return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      },t.id);
      assert.equal(hash,t.sha256);
    }
    await page.goto(base+'#downloads');
    await page.locator(`[data-track-id="${selected[0].id}"] .track-title`).click();
    await page.waitForFunction(()=>!document.querySelector('#audio').paused);
    await page.locator('#audio').evaluate(a=>a.currentTime=18.25);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#audio').currentTime>=18);
    assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true);
    await context.setOffline(true);await page.reload();
    await page.locator('#playBtn').click();
    await page.waitForFunction(()=>!document.querySelector('#audio').paused);
    await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
    await page.waitForFunction(title=>document.querySelector('#playerTitle').textContent===title&&!document.querySelector('#audio').paused,selected[1].title);
    assert.match(await page.locator('#audio').getAttribute('src'),/^blob:/);
    await checkMediaArtwork(page, base, selected[1], selected[1].poster, "image/jpeg");
    // An older saved song may have no JPEG yet. Its vector cover must still work offline.
    await page.evaluate(async (src) => {
      for (const name of await caches.keys()) await (await caches.open(name)).delete(src);
    }, new URL(selected[0].poster, base).href);
    await page.locator(`[data-track-id="${selected[0].id}"] .track-title`).click();
    await checkMediaArtwork(page, base, selected[0], selected[0].artwork, "image/svg+xml");
    await page.goto(base+'#collection/latest');
    await page.getByRole('heading',{name:'Жаңа қосылғандар',exact:true}).waitFor();
    assert.equal(await page.locator('.track-row').count(),2,'latest collection offers only downloaded tracks offline');
    await page.goto(base+'permissions/additional-audio-20261122.html');
    await page.getByRole('heading',{name:'Қосымша 25 толық ән',exact:true}).waitFor();
    assert.equal(await page.locator('tbody tr').count(),25);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({url:base,newSongs:25,fullSongs:325,newArtistPlayback:5,verifiedOfflineFiles:selected.map(t=>t.id),latestCollection:true,exactSavedHashes:true,resume:true,offlineEndedNext:true,offlineSourceRegistry:true,mediaArtwork:true,errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
