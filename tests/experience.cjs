const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.SAZ_TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 let browser;try{browser=await chromium.launch();}catch{browser=await chromium.launch({channel:'msedge'});}
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(base+'#home');await page.locator('.mix-card').first().waitFor();
  assert.equal(await page.locator('.mix-card').count(),3);
  await page.locator('[data-action="mix"][data-id="rediscover"]').click();
  await page.getByRole('heading',{name:'Микс әлі толған жоқ'}).waitFor();
  const ids=await page.evaluate(async()=>{
   const DB=await import('./db.js'),c=await(await fetch('./catalog.json')).json(),now=Date.now(),day=86400000;
   const selected=[c.tracks.find(t=>t.artistId==='ernar'),c.tracks.find(t=>t.artistId==='moldanazar'),c.tracks.find(t=>t.artistId==='ayau')];
   const blob=await(await fetch('./assets/audio/qazaq-wave.wav')).blob();
   for(let i=0;i<selected.length;i++)await DB.saveAudio({...selected[i],audioSourceOverride:true,audioUrl:'assets/audio/qazaq-wave.wav',sha256:'',mime:'audio/wav',duration:24,favorite:i===0,plays:i<2?5:0,lastPlayed:i<2?now-(i+10)*day:0},blob);
   return selected.map(t=>t.id);
  });
  await page.reload();await page.locator('.track-row').first().waitFor();
  assert.equal(await page.locator('.track-row').count(),2);
  await page.locator(`[data-track-id="${ids[0]}"] .track-title`).click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('[data-action="queue"]:visible').first().click();
  assert.equal(await page.locator('.queue-item').count(),2);
  await page.locator('#audio').evaluate(a=>a.currentTime=a.duration-.15);
  await page.waitForFunction(id=>document.querySelector('.queue-item.current')?.dataset.queueId===id,ids[1]);
  await page.locator(`[data-action="queue-play"][data-id="${ids[1]}"]`).click();
  await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  let saved=await page.evaluate(async()=>{const DB=await import('./db.js');return(await DB.get('settings','playback')).value;});
  assert.deepEqual(saved.queue,ids.slice(0,2),'playing a queue row must preserve its queue');
  await page.locator('[data-action="queue"]:visible').first().click();await page.locator('[data-action="queue-mode"][data-id="all"]').click();
  await page.locator('[data-action="queue-play"]').first().click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('[data-action="queue"]:visible').first().click();await page.locator('[data-action="queue-clear"]').click();
  assert.equal(await page.locator('.queue-item').count(),1);await page.locator('[data-action="close-dialog"]').click();
  await page.goto(base+'#artist/moldanazar');await page.locator('.album-card').first().waitFor();
  assert.equal(await page.locator('.album-card').count(),6);await page.locator('[data-action="more-albums"]').click();assert.equal(await page.locator('.album-card').count(),12);await page.locator('[data-action="artist-sort"][data-id="popular"]').click();
  assert.equal(await page.locator('.track-row').first().getAttribute('data-track-id'),ids[1]);
  await page.locator('.album-card').first().click();await page.locator('.album-page-head').waitFor();
  assert.ok(await page.locator('.track-row').count()>0);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const art=await page.evaluate(async()=>{const cache=await caches.open((await caches.keys()).find(k=>k.startsWith(`saz-${new URL('./',location.href).pathname}-`)));const catalog=await(await fetch('./catalog.json')).json();return{actual:(await cache.keys()).filter(r=>r.url.includes('/assets/artwork/')&&r.url.endsWith('.svg')).length,expected:new Set(catalog.tracks.map(t=>t.artwork).filter(Boolean)).size};});
  assert.equal(art.actual,art.expected);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   for(const route of ['#home','#artist/moldanazar','#mix/for-you','#settings']){
    await page.goto(base+route);await page.locator('main h1').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} fits ${width}`);
   }
  }
  await page.setViewportSize({width:390,height:844});await context.setOffline(true);await page.goto(base+'#mix/discover');await page.reload();
  await page.locator('.track-row').first().waitFor();assert.equal(await page.locator('.track-row').count(),1);
  assert.equal(await page.locator('.track-row').getAttribute('data-track-id'),ids[2]);
  await page.locator('.track-title').click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.goto(base+'#artist/dequine');await page.waitForFunction(()=>[...document.querySelectorAll('.album-card img')].length>0&&[...document.querySelectorAll('.album-card img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.goto(base+'#settings');await page.locator('#personalMixes').uncheck();await page.reload();await page.locator('#personalMixes').waitFor();assert.equal(await page.locator('#personalMixes').isChecked(),false);await page.goto(base+'#home');await page.waitForFunction(()=>document.querySelectorAll('.mix-card').length===0);
  await page.goto(base+'#settings');await page.locator('[data-action="history-clear"]').click();await page.locator('[data-action="history-clear-confirm"]').click();
  await page.waitForFunction(async()=>{const DB=await import('./db.js');return(await DB.getAll('library')).every(t=>!t.plays&&!t.lastPlayed);});
  const retained=await page.evaluate(async()=>{const DB=await import('./db.js');const library=await DB.getAll('library');return{files:(await DB.getAll('audio')).length,favorites:library.filter(t=>t.favorite).length};});
  assert.deepEqual(retained,{files:3,favorites:1});await page.locator('#personalMixes').check();
  await page.goto(base+'legal/site-policy.html');await page.getByRole('heading',{level:1}).waitFor();
  assert.equal(await page.locator('.clause').count(),100);
  await page.locator('#policySearch').fill('9.3');await page.waitForFunction(()=>document.querySelectorAll('.clause:not([hidden])').length===1);
  assert.match(await page.locator('.clause:not([hidden])').textContent(),/осы құрылғыда/);
  await page.locator('#clearSearch').click();assert.equal(await page.locator('.clause:not([hidden])').count(),100);
  await page.locator('#policySearch').fill('zzzzmissing');await page.locator('#noResults').waitFor({state:'visible'});await page.locator('#clearSearch').click();
  await page.locator('#policyTheme').click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('light')),true);
  await page.reload();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('light')),true);
  await page.goto(base+'#%E0%A4%A');await page.locator('main h1').waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const touch=await browser.newContext({isMobile:true,hasTouch:true}),tp=await touch.newPage();
  for(const [width,height] of [[320,740],[390,844],[768,1024],[844,390]]){
    await tp.setViewportSize({width,height});await tp.goto(base+'#home');await tp.locator('.mix-card').first().waitFor();
    const geometry=await tp.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('.player button')].filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return{action:e.dataset.action,x:r.x,width:r.width,height:r.height};})}));
    assert.ok(geometry.scroll<=geometry.width);
    for(const c of geometry.controls){assert.ok(c.x>=0&&c.x+c.width<=geometry.width+1,JSON.stringify(c));assert.ok(c.width>=44&&c.height>=44,JSON.stringify(c));}
  }
  await touch.close();
  console.log('Experience passed: personal mixes and cold start, queue identity/clear, album navigation, 244 offline covers, four responsive widths, offline discovery/playback, preferences and history privacy, policy search/theme, malformed route, no external requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
