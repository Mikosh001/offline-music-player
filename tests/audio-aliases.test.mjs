import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize,validateCatalog} from '../core.js';
test('recording aliases use an existing exact artist/version recording and permission',async()=>{
 const raw=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
 const catalog=validateCatalog(raw);
 const registry=JSON.parse(await readFile(new URL('../permissions/audio-aliases.json',import.meta.url),'utf8'));
 assert.equal(registry.aliases.length,2);
 for(const alias of registry.aliases){
  const target=catalog.tracks.find(t=>t.id===alias.trackId),source=catalog.tracks.find(t=>t.id===alias.recordingAliasOf);
  assert.equal(target.recordingAliasOf,source.id);
  assert.equal(target.artistId,source.artistId);
  assert.equal(normalize(target.title),normalize(source.title));
  for(const key of ['audioUrl','sha256','size','duration','permissionRef'])assert.equal(target[key],source[key],key);
  assert.equal(target.sha256,alias.sha256);
 }
});
