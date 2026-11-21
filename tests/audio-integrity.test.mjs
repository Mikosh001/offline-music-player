import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
test('all 297 hosted MP3 files have exactly the declared byte size and SHA-256', async () => {
  const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
  const paths=new Set();
  for (const track of catalog.tracks.filter(t=>t.sha256)) {
    if(paths.has(track.audioUrl))continue;
    paths.add(track.audioUrl);
    const hash=createHash('sha256');let size=0;
    for await(const chunk of createReadStream(new URL('../'+track.audioUrl,import.meta.url))){hash.update(chunk);size+=chunk.length;}
    assert.equal(size,track.size,track.id+' size');
    assert.equal(hash.digest('hex'),track.sha256,track.id+' checksum');
  }
  assert.equal(paths.size,297);
});
