import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8'));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const dir=new URL('assets/artwork/',root);await mkdir(dir,{recursive:true});
const files=new Map();
for(const t of catalog.tracks.filter(t=>!t.demo)){
  const key=t.artistId+'|'+t.album,hash=createHash('sha256').update(key).digest('hex'),name=hash.slice(0,16)+'.svg';
  t.artwork='assets/artwork/'+name;
  if(files.has(name))continue;
  const artist=catalog.artists.find(a=>a.id===t.artistId),color=artist.color;
  const title=(t.album||t.title).replace(/\s*-\s*(Single|EP)$/i,'');
  const words=title.split(/\s+/),lines=[''];
  for(const word of words){if((lines.at(-1)+' '+word).length>17&&lines.at(-1))lines.push('');lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;}
  const tilt=parseInt(hash.slice(0,2),16)%80-40;
  if(lines.length>3){lines.splice(3);lines[2]=lines[2].slice(0,16)+'…';}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img"><title>${esc(t.artist+' — '+title)} · SAZ мұқабасы</title><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#25283e"/></linearGradient><radialGradient id="v"><stop stop-color="${color}"/><stop offset=".14" stop-color="#111522"/><stop offset=".99" stop-color="#171c29"/></radialGradient></defs><rect width="400" height="400" fill="#121726"/><path d="M0 0H400V400H0Z" fill="url(#g)" opacity=".78"/><g transform="rotate(${tilt} 280 140)"><circle cx="300" cy="100" r="162" fill="url(#v)"/><g fill="none" stroke="${color}" opacity=".22">${[52,68,88,108,128,148].map(r=>`<circle cx="300" cy="100" r="${r}"/>`).join('')}</g><circle cx="300" cy="100" r="23" fill="${color}"/><circle cx="300" cy="100" r="5" fill="#141827"/></g><path d="M0 235L400 172V400H0Z" fill="#101625" opacity=".9"/><text x="28" y="39" fill="#fff" opacity=".8" font-family="Arial,sans-serif" font-size="12" letter-spacing="4">SAZ / QAZAQ WAVE</text><rect x="28" y="239" width="35" height="3" rx="1.5" fill="${color}"/><g fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-weight="700" font-size="${lines.length>3?25:30}">${lines.slice(0,4).map((s,i)=>`<text x="28" y="${276+i*33}">${esc(s.length>24?s.slice(0,23)+'…':s)}</text>`).join('')}</g><text x="28" y="379" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="14">${esc(t.artist)}</text></svg>`;
  await writeFile(new URL(name,dir),svg);files.set(name,{file:t.artwork,artistId:t.artistId,album:t.album,sha256:createHash('sha256').update(svg).digest('hex')});
}
await writeFile(new URL('catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
await writeFile(new URL('index.json',dir),JSON.stringify(Object.fromEntries(await Promise.all([...files.values()].map(async f=>[f.file,await readFile(new URL(f.file,root),'utf8')]))))+'\n');
await writeFile(new URL('permissions/artwork-credit.json',root),JSON.stringify({kind:'Original SAZ editorial artwork; not official artist portraits or original release sleeves',license:'CC0-1.0',generator:'scripts/generate-artwork.mjs',files:[...files.values()]},null,2)+'\n');
console.log('Generated',files.size,'original lightweight album covers');
