const input=document.getElementById('policySearch'),clauses=[...document.querySelectorAll('.clause')],sections=[...document.querySelectorAll('.policy-section')];
const result=document.getElementById('searchResult'),normalize=s=>s.toLocaleLowerCase('kk').normalize('NFC').replace(/\s+/g,' ').trim();
const search=()=>{
  const query=normalize(input.value),words=query.split(' ').filter(Boolean);let count=0;
  for(const clause of clauses){const text=normalize(clause.textContent);clause.hidden=!words.every(w=>text.includes(w));if(!clause.hidden)count++;}
  for(const section of sections){section.hidden=![...section.querySelectorAll('.clause')].some(c=>!c.hidden);document.querySelector(`[data-toc="${section.id}"]`).hidden=section.hidden;}
  result.textContent=query?`${count} тармақ табылды`:'14 бөлім · 100 тармақ. Қажет сөзді немесе тармақ нөмірін ізде.';
  document.getElementById('noResults').hidden=count!==0;
};
let timer;input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,120);});
document.getElementById('clearSearch').addEventListener('click',()=>{clearTimeout(timer);input.value='';search();input.focus();});
input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';search();}});
const theme=document.getElementById('policyTheme');
function setTheme(light){document.body.classList.toggle('light',light);theme.textContent=light?'Қараңғы көрініс':'Жарық көрініс';theme.setAttribute('aria-pressed',String(light));}
try{setTheme(localStorage.getItem('saz-policy-theme')==='light');}catch{}
theme.addEventListener('click',()=>{const light=!document.body.classList.contains('light');setTheme(light);try{localStorage.setItem('saz-policy-theme',light?'light':'dark');}catch{}});
let scheduled=false;
function progress(){scheduled=false;const total=document.documentElement.scrollHeight-innerHeight;document.getElementById('readingProgress').style.width=`${total>0?Math.min(100,scrollY/total*100):100}%`;let active=sections.filter(s=>!s.hidden)[0];for(const section of sections)if(!section.hidden&&section.getBoundingClientRect().top<155)active=section;for(const link of document.querySelectorAll('[data-toc] a'))link.setAttribute('aria-current',String(link.getAttribute('href')==='#'+active?.id));}
addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(progress);}},{passive:true});addEventListener('resize',progress);progress();
addEventListener('beforeprint',()=>{input.value='';search();});
