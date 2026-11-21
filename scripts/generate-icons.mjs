import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),svg=await readFile(new URL('icon.svg',root),'utf8');
let browser;
try{browser=await chromium.launch();}
catch{browser=await chromium.launch({channel:'msedge'});}
try{
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const size of [180,192,512]){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>
      html, body { margin: 0; width: 100%; height: 100%; }
      body {
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, #f2e2ff, #d5bbfc 54%, #ae96ed);
      }
      svg { width: 72%; height: 72%; }
      .ribbon-light { stop-color: #29183e; }
      .ribbon-dark { stop-color: #503275; }
    </style>${svg}`);
    await page.screenshot({path:fileURLToPath(new URL(`icon-${size}.png`,root))});
  }
}finally{await browser.close();}
console.log('Generated 180, 192 and 512 pixel SAZ icons from icon.svg');
