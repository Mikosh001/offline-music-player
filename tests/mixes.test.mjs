import test from 'node:test';
import assert from 'node:assert/strict';
import {personalMixes} from '../mixes.js';
const now=Date.UTC(2026,10,21),day=86400000;
const song=(id,artistId='a',extra={})=>({id,artistId,title:id,audioUrl:`assets/${id}.mp3`,downloadable:true,license:'Permission',styles:['indie'],...extra});

test('new listener gets a diverse stable introduction and truthful empty rediscovery',()=>{
 const tracks=['a','b','c'].flatMap(a=>Array.from({length:12},(_,i)=>song(a+i,a)));
 const mixes=personalMixes(tracks,{now});
 assert.equal(mixes[0].tracks.length,24);
 assert.equal(mixes[1].tracks.length,0);
 assert.equal(mixes[0].learned,false);
 assert.equal(new Set(mixes[0].tracks.map(t=>t.id)).size,24);
 assert.ok(mixes[0].tracks.slice(1).every((t,i)=>t.artistId!==mixes[0].tracks[i].artistId));
 assert.deepEqual(mixes,personalMixes(tracks,{now:now+1000}));
});
test('favorites teach affinity; discovery includes only unheard recordings and rediscovery requires a week',()=>{
 const tracks=[song('fav','a',{favorite:true,plays:7,lastPlayed:now-day}),song('related','a'),song('other','b',{styles:['dance']}),song('old','b',{plays:4,lastPlayed:now-20*day}),song('recent','c',{plays:3,lastPlayed:now-2*day})];
 const m=personalMixes(tracks,{now});
 assert.equal(m[0].tracks[0].id,'fav');
 assert.equal(m[2].tracks[0].id,'related');
 assert.deepEqual(new Set(m[2].tracks.map(t=>t.id)),new Set(['related','other']));
 assert.deepEqual(m[1].tracks.map(t=>t.id),['old']);
});
test('offline and offline-only mixes contain only saved audio, including local imports',()=>{
 const tracks=[song('online'),song('saved','a',{downloaded:true}),song('local','local',{audioUrl:'',downloadable:false,downloaded:true}),song('demo','a',{demo:true,downloaded:true})];
 for(const options of [{online:false},{offlineOnly:true}]){
  const mixes=personalMixes(tracks,{now,...options});
  assert.deepEqual(new Set(mixes[0].tracks.map(t=>t.id)),new Set(['saved','local']));
  assert.ok(mixes.flatMap(m=>m.tracks).every(t=>t.downloaded&&!t.demo));
 }
});
test('reissues share a recording, preserve learned listening state, and prefer the available offline copy',()=>{
 const tracks=[song('original','a',{sha256:'a'.repeat(64),plays:3,lastPlayed:now-30*day}),song('reissue','a',{sha256:'a'.repeat(64),downloaded:true,favorite:true})];
 const mixes=personalMixes(tracks,{now,online:false});
 assert.equal(mixes[0].tracks.length,1);
 assert.equal(mixes[0].tracks[0].id,'reissue');
 assert.equal(mixes[1].tracks.length,1);
 assert.equal(mixes[2].tracks.length,0);
});
