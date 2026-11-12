const base='http://127.0.0.1:8787/api';let cookie='';
async function req(p,m='GET',b){const h={Origin:'http://127.0.0.1:8787'};if(cookie)h.Cookie=cookie;if(b!==undefined)h['Content-Type']='application/json';const r=await fetch(base+p,{method:m,headers:h,body:b===undefined?undefined:JSON.stringify(b)});for(const sc of (r.headers.getSetCookie?r.headers.getSetCookie():[])){const t=sc.match(/^wr_session=([^;]*)/);if(t)cookie='wr_session='+t[1];}let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d}}
async function sess(id){cookie='';await req('/session','POST',{staffId:id})}
await sess('nurse-asha');
const w=await req('/ward');
const keys=Object.keys(w.data.patients[0].day||{});
console.log('day keys',keys.join(','));
const needs=w.data.patients.filter(p=>p.day && p.day.measurement && p.day.measurement.needed);
console.log('needs',needs.length, needs.slice(0,5).map(p=>p.id+':'+p.bed).join(','));
if(needs[0]){const a=await req('/reading','POST',{patientId:needs[0].id,value:37.0});console.log('reading',a.status,JSON.stringify(a.data).slice(0,120));const d=await req('/reading','POST',{patientId:needs[0].id,value:37.5});console.log('dup',d.status,JSON.stringify(d.data).slice(0,160));}
await sess('doctor-neha');
const au=await req('/audit');
const acts=[...new Set(au.data.entries.map(e=>e.action))];console.log('actions',acts.join(','));
const f1=await req('/audit?action='+encodeURIComponent(acts[0]));console.log('filter action',acts[0],f1.status,f1.data?.entries?.length);
const pat=au.data.entries.find(e=>e.patientId)?.patientId;
const f2=await req('/audit?patient='+pat);console.log('filter patient',pat,f2.status,f2.data?.entries?.length);
const f3=await req('/audit?actor=doctor-rao');console.log('filter actor',f3.status,f3.data?.entries?.length);
