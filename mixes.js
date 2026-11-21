import { hasFullAudio } from './core.js';

export const MIXES = [
  {id:'for-you',name:'Саған арналған',caption:'Ұнатқан әуендеріңе жақын әндер',color:'#c5b1f2',mark:'СЕНІҢ ТОЛҚЫНЫҢ'},
  {id:'rediscover',name:'Көптен тыңдамағандар',caption:'Таныс әуенге қайта орал',color:'#a9cfb5',mark:'ҚАЙТА ТАБЫСУ'},
  {id:'discover',name:'Жаңа әндермен танысу',caption:'Әлі тыңдамаған әндеріңді аш',color:'#e6ba96',mark:'ЖАҢА ДАУЫСТАР'},
];
const day = 86400000;
const number = n => Number.isFinite(Number(n)) ? Math.max(0,Number(n)) : 0;
const hash = text => [...text].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261)/4294967296;
const identity = t => t.sha256 || t.recordingAliasOf || t.id;

export function personalMixes(tracks,{now=Date.now(),online=true,offlineOnly=false,limit=24}={}) {
  const artists=new Map(), styles=new Map(), recordings=new Map();
  for(const t of tracks.filter(t=>!t.demo)){
    const strength=(t.favorite?5:0)+Math.log2(1+number(t.plays));
    artists.set(t.artistId,(artists.get(t.artistId)||0)+strength);
    for(const style of t.styles||[])styles.set(style,(styles.get(style)||0)+strength);
    const key=identity(t),old=recordings.get(key);
    if(!old)recordings.set(key,{...t,plays:number(t.plays),lastPlayed:number(t.lastPlayed)});
    else {
      // Reissues share one recording. Prefer its available offline copy.
      recordings.set(key,{...(t.downloaded&&!old.downloaded?t:old),favorite:old.favorite||t.favorite,plays:Math.max(old.plays,number(t.plays)),lastPlayed:Math.max(old.lastPlayed,number(t.lastPlayed))});
    }
  }
  const candidates=[...recordings.values()].filter(t=>t.downloaded || (online&&!offlineOnly&&hasFullAudio(t)));
  const learned=tracks.some(t=>!t.demo&&(t.favorite||number(t.plays)>0));
  const affinity=t=>Math.log2(1+(artists.get(t.artistId)||0))*2+(t.styles||[]).reduce((n,s)=>n+Math.log2(1+(styles.get(s)||0)),0)/Math.max(1,(t.styles||[]).length);
  const ages=t=>Math.max(0,(now-number(t.lastPlayed))/day);
  function select(items,score){
    const pool=items.map(t=>({t,score:score(t)})),out=[],counts=new Map();
    while(pool.length && out.length<limit){
      let best=-1,value=-Infinity;
      for(let i=0;i<pool.length;i++){
        const {t,score}=pool[i];
        const v=score-(counts.get(t.artistId)||0)*2-(out.at(-1)?.artistId===t.artistId?8:0);
        if(v>value){best=i;value=v;}
      }
      const t=pool.splice(best,1)[0].t;out.push(t);counts.set(t.artistId,(counts.get(t.artistId)||0)+1);
    }
    return out;
  }
  const daily=t=>hash(t.id+Math.floor(now/day))*2;
  return MIXES.map(m=>({...m,learned,tracks:m.id==='rediscover'
    ? select(candidates.filter(t=>t.plays>0&&t.lastPlayed>0&&ages(t)>=7),t=>Math.min(ages(t),180)/12+(t.favorite?3:0)+Math.log2(1+t.plays))
    : m.id==='discover'
      ? select(candidates.filter(t=>t.plays===0),t=>affinity(t)+daily(t))
      : select(candidates,t=>affinity(t)+(t.favorite?4:0)+Math.log2(1+t.plays)+daily(t)-(t.lastPlayed&&ages(t)<1?3:0))}));
}
