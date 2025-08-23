/* =========================================================
   Gidget · Hamster Tracker — app.js (v22 + tidy upgrades)
   - No optional chaining; stable across TS configs
   - Wake & Steps: log, trends, calendar (modal details + edit)
   - Undo delete toasts; Save success toast; inline validation
   - JSON export/import (merge by date)
   - Status-dot online/offline; SW update toast
========================================================= */

/* --------------------- helpers --------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.prototype.slice.call(r.querySelectorAll(s));

function closestEl(el, selector){
  let n = el && el.nodeType === 1 ? el : (el && el.target) ? el.target : null;
  for (; n; n = n.parentElement) { if (n.matches && n.matches(selector)) return n; }
  return null;
}
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function toMin(t){ if(!t) return null; const p=t.split(':'); return (+p[0])*60 + (+p[1]); }
function fromMin(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function setupCanvas(cv, cssH=260){
  cv.style.width='100%'; cv.style.height=(innerWidth<=700?340:cssH)+'px';
  const dpr=window.devicePixelRatio||1, rect=cv.getBoundingClientRect();
  cv.width=Math.max(1,Math.round(rect.width*dpr)); cv.height=Math.max(1,Math.round(parseFloat(cv.style.height)*dpr));
  return { W: rect.width, H: parseFloat(cv.style.height), dpr };
}

/* Toast */
function toast(msg, actionsHtml){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `<span>${msg}</span>` + (actionsHtml||'');
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>{ t.classList.remove('show'); }, 5000);
}

/* ---------------------- theme ---------------------- */
const MODE_KEY='gidget.theme.mode', ACC_KEY='gidget.theme.accent';
const ACCENTS={blue:'#0EA5E9',mint:'#6EE7B7',violet:'#8b5cf6',amber:'#f59e0b',rose:'#f43f5e'};
function applyTheme(mode,accent){ const root=document.documentElement; if(mode==='light'||mode==='dark') root.setAttribute('data-mode',mode); else root.removeAttribute('data-mode'); root.style.setProperty('--acc', ACCENTS[accent]||ACCENTS.blue); }
function initTheme(){
  const m=localStorage.getItem(MODE_KEY)||'system', a=localStorage.getItem(ACC_KEY)||'blue'; applyTheme(m,a);
  const lightBtn=$('#themeLight'), sysBtn=$('#themeSystem'), darkBtn=$('#themeDark');
  if(lightBtn) lightBtn.onclick=()=>{ localStorage.setItem(MODE_KEY,'light');  applyTheme('light',  localStorage.getItem(ACC_KEY)||'blue'); };
  if(sysBtn)   sysBtn.onclick  =()=>{ localStorage.setItem(MODE_KEY,'system'); applyTheme('system', localStorage.getItem(ACC_KEY)||'blue'); };
  if(darkBtn)  darkBtn.onclick =()=>{ localStorage.setItem(MODE_KEY,'dark');   applyTheme('dark',   localStorage.getItem(ACC_KEY)||'blue'); };
  $$('.swatch').forEach(s=> s.onclick=()=>{ const acc=s.getAttribute('data-accent'); localStorage.setItem(ACC_KEY,acc); applyTheme(localStorage.getItem(MODE_KEY)||'system',acc); });
}

/* --------------- header hide/shrink ---------------- */
function bindHeaderHide(){
  const bar=$('#topbar'); if(!bar) return;
  let last=0,ticking=false;
  function onScroll(){
    if(ticking) return; ticking=true;
    requestAnimationFrame(()=>{ const y=window.scrollY||document.documentElement.scrollTop||0; if(y>10) bar.classList.add('shrink'); else bar.classList.remove('shrink'); if(y>last&&y>40) bar.classList.add('hide'); else bar.classList.remove('hide'); last=y; ticking=false; });
  }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
}

/* ------------------ tabs / panels ------------------ */
function activateTab(name){ $$('#tabs .tab').forEach(t=>t.classList.toggle('active', t.getAttribute('data-tab')===name)); $$('.tabpanel').forEach(p=>p.hidden=(p.id!==('panel-'+name))); }
function bindTabs(){
  const tabs=$('#tabs'); if(!tabs) return;
  tabs.addEventListener('click',(e)=>{ const tab=closestEl(e,'.tab'); if(!tab) return; const id=tab.getAttribute('data-tab'); activateTab(id);
    if(id==='trends') drawWakeChart(); if(id==='calendar') renderWakeCalendar(); if(id==='entries') renderWakeTable(loadWake());
    if(id==='steps-trends') drawStepsChart(); if(id==='steps-calendar') renderStepsCalendar(); if(id==='steps-entries') renderStepsTable(loadSteps());
  });
}

/* ------------------ month pickers ------------------ */
function monthPicker(titleSel,inputSel,getRef,setRef){
  const title=$(titleSel), input=$(inputSel); if(!title||!input) return;
  function open(){ const r=getRef(); input.value=`${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,'0')}`; try{ if(typeof input.showPicker==='function') input.showPicker(); else input.click(); }catch{ input.click(); } }
  title.addEventListener('click', open);
  title.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); }});
  input.addEventListener('change', ()=>{ if(!input.value) return; const [yy,mm]=input.value.split('-').map(Number); setRef(new Date(yy,mm-1,1)); });
}

/* ---------------------- storage -------------------- */
const WAKE_KEY='gidget_site_v1', STEPS_KEY='gidget_steps_v1';
function loadWake(){ try{ return JSON.parse(localStorage.getItem(WAKE_KEY))||[]; }catch{ return []; } }
function saveWake(rows){ localStorage.setItem(WAKE_KEY, JSON.stringify(rows)); }
function loadSteps(){ try{ return JSON.parse(localStorage.getItem(STEPS_KEY))||[]; }catch{ return []; } }
function saveSteps(rows){ localStorage.setItem(STEPS_KEY, JSON.stringify(rows)); }

/* =================== Wake module =================== */
const todayISO=ymd(new Date()); let calRef=new Date();

function validateWake(){
  const d=$('#date'), t=$('#wake'), w=$('#weight');
  [d,t,w].forEach(el=>el && el.classList.remove('error'));
  if(!d.value){ d.classList.add('error'); toast('Date is required'); return false; }
  if(t.value && !/^\d{2}:\d{2}$/.test(t.value)){ t.classList.add('error'); toast('Time must be HH:MM'); return false; }
  if(w.value !== '' && (+w.value<0)){ w.classList.add('error'); toast('Weight must be ≥ 0'); return false; }
  return true;
}

function initWakeForm(){
  const date=$('#date'), nowBtn=$('#nowBtn'), save=$('#save'), clear=$('#clearForm'); if(date) date.value=todayISO;
  if(nowBtn) nowBtn.onclick=()=>{ const n=new Date(); $('#wake').value=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; };
  if(save) save.onclick=()=>{ if(!validateWake()) return;
    const row={date:$('#date').value||todayISO,wake:$('#wake').value||'',weight:$('#weight').value||'',mood:$('#mood').value||'',notes:$('#notes').value||''};
    const rows=loadWake().filter(r=>r.date!==row.date); rows.push(row); rows.sort((a,b)=>a.date.localeCompare(b.date)); saveWake(rows); afterWake(rows); toast('Saved wake entry ✓');
  };
  if(clear) clear.onclick=()=>{ $('#date').value=todayISO; $('#wake').value=''; $('#weight').value=''; $('#mood').value=''; $('#notes').value=''; };
  const apply=$('#applyFilter'), reset=$('#resetFilter');
  if(apply) apply.onclick=()=>renderWakeTable(loadWake());
  if(reset) reset.onclick=()=>{ $('#filterFrom').value=''; $('#filterTo').value=''; renderWakeTable(loadWake()); };
}

function renderWakeToday(rows){ const t=rows.find(r=>r.date===todayISO); $('#todayBox').textContent=t?`Today ${t.date}: wake ${t.wake||'—'} · weight ${t.weight||'—'}g · mood ${t.mood||'—'}`:'No entry for today yet.' }
function renderWakeStats(rows){ let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)} $('#streak').textContent=`Streak: ${s} ${s===1?'day':'days'}`; const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut); const ts=rows.filter(r=>r.date>=iso && r.wake).map(r=>toMin(r.wake)); $('#avg7').textContent=`7‑day avg: ${ts.length?fromMin(Math.round(ts.reduce((a,b)=>a+b,0)/ts.length)):'—'}` }
function renderWakeTable(rows){
  const tb=$('#table tbody'); if(!tb) return; tb.innerHTML='';
  const f1=$('#filterFrom').value||'', f2=$('#filterTo').value||'';
  rows.filter(r=>(!f1||r.date>=f1)&&(!f2||r.date<=f2)).sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.date}</td><td>${r.wake||'—'}</td><td>${r.weight||'—'}</td><td>${r.mood||'—'}</td><td>${r.food||'—'}</td><td>${r.sand||'—'}</td><td>${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-del="${r.date}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick = (e) => {
    const btn = e.target;
    const d = (btn && btn.getAttribute) ? btn.getAttribute('data-del') : null;
    if (!d) return;
    const all = loadWake();
    const deleted = all.find(r => r.date === d);
    const left = all.filter(r => r.date !== d);
    saveWake(left); afterWake(left);
    toast(`Deleted wake entry ${d}`, `<button class="btn small" id="undoWake">Undo</button>`);
    const u = document.getElementById('undoWake');
    if (u) u.onclick = () => {
      const rows = loadWake().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date));
      saveWake(rows); afterWake(rows);
    };
  };
}

let wakeRange=7, wakePts=[];
document.addEventListener('click', (e)=>{ const b=closestEl(e,'.rangeBtn'); if(b){ wakeRange=+b.getAttribute('data-range'); drawWakeChart(); }});
{ const el=$('#smooth'); if(el) el.addEventListener('change', drawWakeChart); }

function drawWakeChart(){
  const rows=loadWake().filter(r=>r.wake), cv=$('#chart'); if(!cv) return;
  const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H); wakePts=[];
  const start=new Date(); start.setDate(start.getDate()-wakeRange+1);
  const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,m:toMin(r.wake)})).sort((a,b)=>a.d.localeCompare(b.d));
  const chartMeta=$('#chartMeta'); if(chartMeta) chartMeta.textContent=data.length?`${data.length} points`:'No data in range';
  const padL=50,padR=12,padT=12,padB=28; const cs=getComputedStyle(document.body); const line=cs.getPropertyValue('--line').trim(), acc=cs.getPropertyValue('--acc').trim(), muted=cs.getPropertyValue('--muted').trim();
  cx.strokeStyle=line; cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  function yMap(mins){ let v=mins; if(v<900) v+=1440; const min=900,max=1800; const t=(v-min)/(max-min); return padT+(1-t)*(H-padT-padB) }
  cx.fillStyle=muted; cx.textAlign='right'; cx.textBaseline='middle'; cx.font='12px system-ui';
  [18*60,21*60,0,3*60].forEach(t=>{const y=yMap(t); cx.fillText(fromMin((t+1440)%1440),padL-6,y); cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke();});
  if(!data.length) return;
  const x=(i)=> padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const dayLabel=s=>{const d=new Date(s+'T00:00:00'); return (wakeRange<=14)? d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'}) : d.toLocaleDateString(undefined,{day:'2-digit',month:'short'})};
  const monthLabel=s=>{const d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',year:wakeRange>365?'2-digit':'numeric'})};
  let ticks=[];
  if(wakeRange<=14){for(let i=0;i<data.length;i++){if(i===0||i===data.length-1||i%2===0) ticks.push({i,text:dayLabel(data[i].d)});}}
  else if(wakeRange<=90){let last=-1; for(let i=0;i<data.length;i++){const d=new Date(data[i].d+'T00:00:00'); const nm=d.getMonth()!==last; if(nm||i%5===0||i===data.length-1){ticks.push({i,text:monthLabel(data[i].d)}); last=d.getMonth();}}}
  else{let seen={}; for(let i=0;i<data.length;i++){const d=new Date(data[i].d+'T00:00:00'); const k=`${d.getFullYear()}-${d.getMonth()}`; if(!seen[k]){seen[k]=true; ticks.push({i,text:d.toLocaleDateString(undefined,{month:'short'})});}}}
  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top'; ticks.forEach(t=>cx.fillText(t.text,x(t.i),H-padB+6));
  cx.fillStyle=acc; data.forEach((p,i)=>{const X=x(i),Y=yMap(p.m); wakePts.push({X,Y,date:p.d}); cx.beginPath(); cx.arc(X,Y,2.5,0,Math.PI*2); cx.fill();});
  const k=+( ($('#smooth')&&$('#smooth').value) || 1 ); const vals=data.map(d=>{let v=d.m; if(v<900)v+=1440; return v}); const sm=((arr,n)=>{if(n<=1)return arr.slice();const out=[];let s=0;for(let i=0;i<arr.length;i++){s+=arr[i]; if(i>=n)s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i])} return out})(vals,k);
  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath(); sm.forEach((v,i)=>{const X=x(i),Y=padT+(1-((v-900)/(1800-900)))*(H-padT-padB); i?cx.lineTo(X,Y):cx.moveTo(X,Y)}); cx.stroke();
  function getXY(e){const r=cv.getBoundingClientRect(); const p=(e&&e.touches&&e.touches[0])?e.touches[0]:e; return {x:p.clientX-r.left,y:p.clientY-r.top}}
  function handle(e){ if(!wakePts.length) return; const pos=getXY(e); let best=null,d2=1e12; for(const p of wakePts){const dx=pos.x-p.X,dy=pos.y-p.Y,dd=dx*dx+dy*dy; if(dd<d2){d2=dd;best=p}} if(best && d2<=16*16){ const r=loadWake().find(z=>z.date===best.date)||{}; openModal(`Wake • ${best.date}`, `<div><b>Wake</b>: ${r.wake||'—'}</div><div><b>Weight</b>: ${r.weight||'—'} g</div><div><b>Mood</b>: ${r.mood||'—'}</div><div class="mt"><b>Notes</b>: ${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</div>`);} }
  cv.onclick=handle; cv.addEventListener('touchstart', handle, {passive:true});
}

function renderWakeCalendar(){
  const rows=loadWake(); const box=$('#calendar'); if(!box) return; box.innerHTML='';
  const title=$('#calTitle'); if(title) title.textContent=calRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=calRef.getFullYear(), m=calRef.getMonth(); const first=new Date(y,m,1); const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45; cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.wake?rec.wake:'—'}</div>`;
    cell.onclick=()=>{ let html=''; if(rec){ html=`<div><b>Date</b>: ${iso}</div><div><b>Wake</b>: ${rec.wake||'—'}</div><div><b>Weight</b>: ${rec.weight||'—'} g</div><div><b>Mood</b>: ${rec.mood||'—'}</div><div class="mt"><b>Notes</b>: ${rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—'}</div><div class="row mt end"><button id="editDayBtn" class="btn solid">Edit this day</button></div>`; }
      else { html=`<div>No wake entry for ${iso}.</div><div class="row mt end"><button id="editDayBtn" class="btn solid">Add entry</button></div>`; }
      openModal('Wake • '+iso, html);
      const edit=$('#editDayBtn'); if(edit){ edit.onclick=()=>{ activateTab('log'); $('#date').value=iso; $('#wake').value=(rec&&rec.wake)||''; $('#weight').value=(rec&&rec.weight)||''; $('#mood').value=(rec&&rec.mood)||''; $('#notes').value=(rec&&rec.notes)||''; $('#modal').hidden=true; }; }
    };
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
  }
}

/* =================== Steps module =================== */
let stepsCalRef=new Date(), stepsRange=7;

function validateSteps(){
  const d=$('#stepsDate'), s=$('#stepsCount');
  [d,s].forEach(el=>el && el.classList.remove('error'));
  if(!d.value){ d.classList.add('error'); toast('Date is required'); return false; }
  if(s.value !== '' && (+s.value<0)){ s.classList.add('error'); toast('Steps must be ≥ 0'); return false; }
  return true;
}

function initStepsForm(){
  const d=$('#stepsDate'); if(d) d.value=todayISO;
  const todayBtn=$('#stepsTodayBtn'); if(todayBtn) todayBtn.onclick=()=>{ $('#stepsDate').value=todayISO; };
  const save=$('#stepsSave'); if(save) save.onclick=()=>{ if(!validateSteps()) return;
    const row={date:$('#stepsDate').value||todayISO,steps:$('#stepsCount').value||'',notes:$('#stepsNotes').value||''};
    const rows=loadSteps().filter(r=>r.date!==row.date); rows.push(row); rows.sort((a,b)=>a.date.localeCompare(b.date)); saveSteps(rows); afterSteps(rows); toast('Saved steps ✓');
  };
  const clr=$('#stepsClear'); if(clr) clr.onclick=()=>{ $('#stepsDate').value=todayISO; $('#stepsCount').value=''; $('#stepsNotes').value=''; };
  { const el=$('#stepsSmooth'); if(el) el.addEventListener('change', drawStepsChart); }
  document.addEventListener('click',(e)=>{ const b=closestEl(e,'.stepsRangeBtn'); if(b){ stepsRange=+b.getAttribute('data-range'); drawStepsChart(); }});
}

function renderStepsToday(rows){ const t=rows.find(r=>r.date===todayISO); $('#stepsTodayBox').textContent=t?`This morning ${t.date}: ${t.steps||'—'} steps`:'No steps entry for today yet.' }
function renderStepsStats(rows){ let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)} $('#stepsStreak').textContent=`Streak: ${s} ${s===1?'day':'days'}`; const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut); const vals=rows.filter(r=>r.date>=iso && r.steps).map(r=>+r.steps); $('#stepsAvg7').textContent=`7‑day avg: ${vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):'—'}` }
function renderStepsTable(rows){ const tb=$('#stepsTable tbody'); if(!tb) return; tb.innerHTML=''; rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.date}</td><td>${r.steps||'—'}</td><td>${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-sdel="${r.date}">Delete</button></td>`; tb.appendChild(tr); });
  tb.onclick = (e) => {
    const btn = e.target;
    const d = (btn && btn.getAttribute) ? btn.getAttribute('data-sdel') : null;
    if (!d) return;
    const all = loadSteps();
    const deleted = all.find(r => r.date === d);
    const left = all.filter(r => r.date !== d);
    saveSteps(left); afterSteps(left);
    toast(`Deleted steps ${d}`, `<button class="btn small" id="undoSteps">Undo</button>`);
    const u = document.getElementById('undoSteps');
    if (u) u.onclick = () => {
      const rows = loadSteps().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date));
      saveSteps(rows); afterSteps(rows);
    };
  };
}

function drawStepsChart(){
  const rows=loadSteps().filter(r=>r.steps), cv=$('#stepsChart'); if(!cv) return; const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const start=new Date(); start.setDate(start.getDate()-stepsRange+1); const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,v:+r.steps})).sort((a,b)=>a.d.localeCompare(b.d));
  const meta=$('#stepsChartMeta'); if(meta) meta.textContent=data.length?`${data.length} points`:'No data in range';
  const padL=50,padR=12,padT=12,padB=28; const cs=getComputedStyle(document.body); const line=cs.getPropertyValue('--line').trim(), acc=cs.getPropertyValue('--acc').trim(), muted=cs.getPropertyValue('--muted').trim();
  cx.strokeStyle=line; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  if(!data.length) return;
  const x=(i)=> padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const mLabel=s=>{const d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',year:stepsRange>365?'2-digit':'numeric'})};
  let ticks=[];
  if(stepsRange<=14){for(let i=0;i<data.length;i++){ if(i===0||i===data.length-1||i%2===0){ const d=new Date(data[i].d+'T00:00:00'); ticks.push({i,text:d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'})}); }}}
  else if(stepsRange<=90){let last=-1; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const nm=d.getMonth()!==last; if(nm||i%5===0||i===data.length-1){ ticks.push({i,text:mLabel(data[i].d)}); last=d.getMonth(); }}}
  else{let seen={}; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const k=`${d.getFullYear()}-${d.getMonth()}`; if(!seen[k]){ seen[k]=true; ticks.push({i,text:d.toLocaleDateString(undefined,{month:'short'})}); }}}
  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top'; ticks.forEach(t=>cx.fillText(t.text,x(t.i),H-padB+6));
  const vals=data.map(p=>p.v), yMin=Math.max(0,Math.floor(Math.min.apply(null,vals)*0.95)), yMax=Math.ceil((Math.max.apply(null,vals)||1)*1.05);
  cx.textAlign='right'; cx.textBaseline='middle'; for(let i=0;i<=5;i++){const t=i/5; const y=padT+(1-t)*(H-padT-padB); const v=Math.round(yMin+t*(yMax-yMin)); cx.fillText(String(v),padL-6,y); cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke();}
  const k=+( ($('#stepsSmooth')&&$('#stepsSmooth').value) || 1 ); const sm=((arr,n)=>{if(n<=1)return arr.slice();const out=[];let s=0;for(let i=0;i<arr.length;i++){s+=arr[i]; if(i>=n)s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i])}return out})(vals,k);
  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath(); sm.forEach((v,i)=>{const X=x(i),Y=padT+(1-((v-yMin)/(yMax-yMin)))*(H-padT-padB); i?cx.lineTo(X,Y):cx.moveTo(X,Y)}); cx.stroke();
}

function renderStepsCalendar(){
  const rows=loadSteps(); const box=$('#stepsCalendar'); if(!box) return; box.innerHTML='';
  const title=$('#stepsCalTitle'); if(title) title.textContent=stepsCalRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=stepsCalRef.getFullYear(), m=stepsCalRef.getMonth(); const first=new Date(y,m,1); const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45; cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.steps?rec.steps:'—'}</div>`;
    cell.onclick=()=>{ let html=''; if(rec){ html=`<div><b>Date</b>: ${iso}</div><div><b>Steps</b>: ${rec.steps||'—'}</div><div class="mt"><b>Notes</b>: ${rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—'}</div><div class="row mt end"><button id="editStepsDayBtn" class="btn solid">Edit this day</button></div>`; }
      else { html=`<div>No steps entry for ${iso}.</div><div class="row mt end"><button id="editStepsDayBtn" class="btn solid">Add entry</button></div>`; }
      openModal('Steps • '+iso, html);
      const edit=$('#editStepsDayBtn'); if(edit){ edit.onclick=()=>{ activateTab('steps-log'); $('#stepsDate').value=iso; $('#stepsCount').value=(rec&&rec.steps)||''; $('#stepsNotes').value=(rec&&rec.notes)||''; $('#modal').hidden=true; }; }
    };
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
  }
}

function afterWake(rows){ renderWakeToday(rows); renderWakeStats(rows); renderWakeTable(rows); drawWakeChart(); renderWakeCalendar(); }
function afterSteps(rows){ renderStepsToday(rows); renderStepsStats(rows); renderStepsTable(rows); drawStepsChart(); renderStepsCalendar(); }

/* ---------------- CSV export / import --------------- */
const exportBtn=$('#exportCsv'); if(exportBtn) exportBtn.onclick=()=>{ const wake=loadWake(), steps=loadSteps();
  const header='Type,Date,Wake-Up Time,Weight (g),Mood,Notes,Steps\n';
  const lines=[...wake.map(r=>['wake',r.date,r.wake||'',r.weight||'',r.mood||'',JSON.stringify(r.notes||'').slice(1,-1),''].join(',')), ...steps.map(s=>['steps',s.date,'','','',JSON.stringify(s.notes||'').slice(1,-1),s.steps||''].join(','))];
  const blob=new Blob([header+lines.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gidget_data.csv'; a.click(); };
const importEl=$('#importCsv'); if(importEl) importEl.addEventListener('change',(e)=>{ const f=e.target.files[0]; if(!f) return; f.text().then((text)=>{ const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(','); const idxType=header.indexOf('Type'); const W=[],S=[]; lines.forEach(ln=>{ const p=ln.split(','); const type=(idxType>=0?p[idxType]:'wake'); if(type==='steps'){ S.push({date:p[1],steps:p[6]||'',notes:p[5]||''}); } else { W.push({date:p[1],wake:p[2]||'',weight:p[3]||'',mood:p[4]||'',notes:p[5]||''}); } }); saveWake(W); saveSteps(S); afterWake(W); afterSteps(S); toast('Imported CSV'); }); });

/* ---------------- JSON export / import -------------- */
const exportJson = document.getElementById('exportJson');
if (exportJson) exportJson.onclick = () => {
  const blob = new Blob([JSON.stringify({ wake: loadWake(), steps: loadSteps() }, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='gidget_data_v22.json'; a.click();
};
const importJson = document.getElementById('importJson');
if (importJson) importJson.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  try{
    const data = JSON.parse(text) || {};
    const W = Array.isArray(data.wake)? data.wake : [];
    const S = Array.isArray(data.steps)? data.steps : [];
    const wMap = new Map(loadWake().map(r=>[r.date,r]));
    W.forEach(r=>wMap.set(r.date, r));
    const sMap = new Map(loadSteps().map(r=>[r.date,r]));
    S.forEach(r=>sMap.set(r.date, r));
    const wRows = Array.from(wMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
    const sRows = Array.from(sMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
    saveWake(wRows); saveSteps(sRows); afterWake(wRows); afterSteps(sRows);
    toast('Imported JSON and merged');
  }catch{
    toast('Import failed: bad JSON');
  }
});

/* --------------------- modal ----------------------- */
function openModal(title,html){ const m=$('#modal'); if(!m) return; $('#modalTitle').textContent=title; $('#modalBody').innerHTML=html; m.hidden=false; }
const modalClose=$('#modalClose'); if(modalClose) modalClose.onclick=()=>{ $('#modal').hidden=true; };

/* ---------------------- boot ----------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme(); bindHeaderHide(); bindTabs();
  monthPicker('#calTitle','#monthPicker',()=>calRef,(d)=>{calRef=d; renderWakeCalendar();});
  monthPicker('#stepsCalTitle','#stepsMonthPicker',()=>stepsCalRef,(d)=>{stepsCalRef=d; renderStepsCalendar();});

  initWakeForm(); initStepsForm();
  afterWake(loadWake()); afterSteps(loadSteps());

  // Online/offline dot
  function updateDot(){ const d=document.querySelector('.status-dot'); if(!d) return; d.classList.toggle('off', !navigator.onLine); }
  window.addEventListener('online', updateDot);
  window.addEventListener('offline', updateDot);
  updateDot();

  // PWA (v22)
  if('serviceWorker' in navigator){
    const qs=new URL(window.location.href).searchParams;
    if(!(qs.has('nosw')||qs.get('nosw')==='1')){
      window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js?v=22').then(reg=>reg.update()).catch(()=>{}); });
      let reloaded=false; navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(reloaded) return; reloaded=true; window.location.reload(); });
    }
    navigator.serviceWorker.addEventListener('message', (evt)=>{
      if (evt.data && evt.data.type === 'SW_ACTIVATED') {
        toast(`Updated to ${evt.data.version}`, `<button class="btn small" onclick="location.reload()">Reload</button>`);
      }
    });
  }

  const inst=$('#installInfo'); if(inst) inst.onclick=()=>alert('On iPhone: open in Safari → Share → Add to Home Screen.');
});