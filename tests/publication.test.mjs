import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const json = async name => JSON.parse(await readFile(new URL('../'+name, import.meta.url), 'utf8'));

test('current publication records every song, new source provenance and unchanged historic declarations', async () => {
  const catalog = await json('catalog.json');
  const publication = await json('permissions/current-audio-publication.json');
  const declaration = await json('permissions/additional-audio-20261121.json');
  const addition = await json('permissions/additional-audio-20261122.json');
  assert.equal(addition.independentPermissionVerification, false);
  assert.equal(addition.permissionGrantDate, null);
  assert.equal(addition.tracks.length, 25);
  assert.equal(new Set(addition.tracks.map(t=>t.permissionRef)).size,25);
  assert.equal(publication.independentPermissionVerification, false);
  assert.equal(declaration.independentPermissionVerification, false);
  assert.equal(declaration.permissionGrantDate, null);
  assert.equal(declaration.tracks.length, 95);
  assert.equal(new Set(declaration.tracks.map(t=>t.permissionRef)).size, 95);
  assert.equal(publication.tracks.length, 325);
  assert.equal(publication.correctedExistingRecordings.length, 3);
  const files = new Map();
  for(const p of publication.tracks){
    const t = catalog.tracks.find(t=>t.id===p.trackId);
    assert.ok(t, p.trackId);
    assert.equal(p.audioUrl,t.audioUrl);
    assert.equal(p.sha256,t.sha256);
    assert.equal(p.bytes,t.size);
    assert.equal(p.permissionRef,t.permissionRef);
    assert.equal(p.durationSeconds,t.duration);
    const v=p.verification;
    assert.ok(v.method==='seven-band spectral envelope correlation' ? v.spectralCorrelation>=.83 : v.correlation>=.7, p.trackId+' recording comparison');
    files.set(p.audioUrl,p.bytes);
  }
  assert.equal(files.size,322);
  assert.equal([...files.values()].reduce((a,b)=>a+b,0),publication.totalHostedAudioBytes);
  for(const t of [...declaration.tracks,...addition.tracks]){
    const p=publication.tracks.find(p=>p.trackId===t.trackId);
    assert.equal(t.sourceUrl,p.source.sourceUrl);
    assert.match(t.sourceUrl,/^https:\/\//);
    assert.match(p.source.sourceSha256,/^[a-f0-9]{64}$/);
    assert.ok(p.source.sourceBytes>100000);
    assert.equal(p.permissionRef,t.permissionRef);
  }
  for(const p of addition.tracks){
    const t=catalog.tracks.find(t=>t.id===p.trackId);
    assert.equal(t.catalogAddedOn,'2026-11-22');
    assert.ok(t.duration>60,'full song rather than a short preview');
  }
  for(const original of publication.originalDocuments){
    const bytes=await readFile(new URL('../permissions/'+original.file,import.meta.url));
    assert.equal(bytes.length,original.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),original.sha256);
  }
});
