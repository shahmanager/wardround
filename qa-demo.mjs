
const base = 'http://127.0.0.1:8787/api';
let cookie = '';
async function req(path, method='GET', body) {
  const h = { Origin: 'http://127.0.0.1:8787' };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(base+path, { method, headers: h, body: body===undefined?undefined:JSON.stringify(body) });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const s of sc) { const m = s.match(/^wr_session=([^;]*)/); if (m) cookie = 'wr_session='+m[1]; }
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function session(id){ cookie=''; const r = await req('/session','POST',{staffId:id}); console.log('signin', id, r.status, r.data?.staff?.name, r.data?.currentDay); return r; }
function log(label, r){ console.log(label, r.status, JSON.stringify(r.data).slice(0,220)); }
// nurse
await session('nurse-asha');
let ward = await req('/ward'); console.log('ward', ward.status, 'patients', ward.data?.patients?.length, 'occ', ward.data?.occupied);
const meas = ward.data.patients.filter(p=>p.day && p.day.needsMeasurement);
console.log('needMeasure', meas.map(p=>p.id+':'+p.bed).join(','));
const target = meas[0];
if (target) {
  const a = await req('/reading','POST',{patientId:target.id, value:37.0}); log('reading 37.0', a);
  const dup = await req('/reading','POST',{patientId:target.id, value:37.5}); log('duplicate', dup);
  const bad = await req('/reading','POST',{patientId:target.id, value:52}); log('52 guard', bad);
}
const nd = await req('/dashboard'); log('nurse dashboard', nd);
const na = await req('/audit'); log('nurse audit', na);
// doctor
await session('doctor-rao');
ward = await req('/ward');
const eligible = ward.data.patients.filter(p=>p.status==='DISCHARGE_APPROVED');
const ready = ward.data.patients.filter(p=>p.day && p.day.canApproveDischarge);
console.log('eligible now', ready.map(p=>p.id).join(','), 'alreadyApproved', eligible.map(p=>p.id).join(','));
const appr = await req('/discharge/approve','POST',{patientId:(ready[0]||{id:'p-006'}).id}); log('approve', appr);
// admin
await session('admin-priya');
let beds = await req('/beds'); console.log('beds', beds.status, 'free', beds.data?.freeBeds?.length, 'occ', beds.data?.occupiedBeds?.length);
const approved = (beds.data.occupiedBeds||[]).filter(o=>o.patient.status==='DISCHARGE_APPROVED');
console.log('approved patients', approved.map(o=>o.patient.id+':'+o.bed).join(','));
if (approved[0]) {
  const comp = await req('/discharge/complete','POST',{patientId:approved[0].patient.id}); log('complete', comp);
  beds = await req('/beds'); console.log('free after', beds.data?.freeBeds?.length);
  const admit = await req('/patient/admit','POST',{name:'Test Patient',age:30,sex:'M',bed:beds.data.freeBeds[0]}); log('admit', admit);
}
// head doctor
await session('doctor-neha');
const dash = await req('/dashboard'); console.log('dashboard', dash.status, JSON.stringify(dash.data?.mortality), 'closed', dash.data?.closedCases);
const audit = await req('/audit'); console.log('audit', audit.status, 'entries', audit.data?.entries?.length, 'first', JSON.stringify(audit.data?.entries?.[0]));
const audf = await req('/audit?action=reading.recorded'); console.log('audit filtered', audf.status, audf.data?.entries?.length);
// reset
const reset = await req('/demo/reset','POST',{}); log('reset', reset);
const w2 = await req('/ward'); console.log('after reset patients', w2.data?.patients?.length, 'occ', w2.data?.occupied);
