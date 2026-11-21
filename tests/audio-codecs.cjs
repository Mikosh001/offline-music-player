const { chromium }=require('playwright');
(async()=>{
 let browser;try{browser=await chromium.launch();}catch{browser=await chromium.launch({channel:'msedge'});}
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/legal/site-policy.html');
 const result=await page.evaluate(async()=>{
  const catalog=await(await fetch('/catalog.json')).json();
  const songs=[...new Map(catalog.tracks.filter(t=>t.sha256).map(t=>[t.audioUrl,t])).values()];
  const failed=[];let checked=0;
  for(const track of songs){
   const audio=new Audio();audio.preload='auto';audio.muted=true;
   const outcome=await new Promise(resolve=>{
    const timer=setTimeout(()=>finish('timeout'),10000);let done=false;
    function finish(error){if(done)return;done=true;clearTimeout(timer);audio.oncanplay=null;audio.onerror=null;
     const duration=audio.duration;audio.removeAttribute('src');audio.load();
     resolve(error||(!Number.isFinite(duration)||duration<=0?'invalid duration':Math.abs(duration-track.duration)>2?'duration mismatch '+duration:''));}
    audio.onerror=()=>finish('media error '+audio.error?.code);audio.oncanplay=()=>finish('');audio.src='/'+track.audioUrl;
   });
   if(outcome)failed.push([track.id,outcome]);checked++;
  }
  return{checked,failed};
 });console.log(JSON.stringify(result));await browser.close();if(result.failed.length)process.exit(1);
})().catch(error=>{console.error(error);process.exit(1)});
