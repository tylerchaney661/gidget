/* =========================================================
   Gidget · Hamster Tracker — clean app.js
   - Theme + header behavior
   - Tabs + month pickers
   - Wake module (form, table, trends, calendar)
   - Steps module (form, table, trends, calendar)
   - CSV import/export
   - PWA registration (uses sw.js v17)
========================================================= */

/* --------------------- tiny helpers -------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const ymd = (d) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};
const toMin   = (t) => t ? t.split(':').map(Number).reduce((h,m)=>h*60+m) : null;
const fromMin = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
function setupCanvas(cv, cssH=260){
  cv.style.width='100%'; cv.style.height=(innerWidth<=700?340:cssH)+'px';
  const dpr=devicePixelRatio||1, rect=cv.getBoundingClientRect();
  cv.width=Math.max(1,Math.round(rect.width*dpr)); cv.height=Math.max(1,Math.round(parseFloat(cv.style.height)*dpr));
  return { W: rect.width, H: parseFloat(cv.style.height), dpr };
}

/* ----------------------- theme ------------------------- */
const MODE_KEY='gidget.theme.mode', ACC_KEY='gidget.theme.accent';
const ACCENTS={blue:'#0EA5E9',mint:'#6EE7B7',violet:'#8b5cf6',amber:'#f59e0b',rose:'#f43f5e'};
function applyTheme(mode,accent){
  const root=document.documentElement;
  if(mode==='light'||mode==='dark') root.setAttribute('data-mode',mode); else root.removeAttribute('data-mode');
  root.style.setProperty('--acc', ACCENTS[accent]||ACCENTS.blue);
}
function initTheme(){
  const m=localStorage.getItem(MODE_KEY)||'system', a=localStorage.getItem(ACC_KEY)||'blue';
  applyTheme(m,a);
  $('#themeLight').onclick = ()=>{ localStorage.setItem(MODE_KEY,'light');  applyTheme('light',localStorage.getItem(ACC_KEY)||'blue'); };
  $('#themeSystem').onclick= ()=>{ localStorage.setItem(MODE_KEY,'system'); applyTheme('system',localStorage.getItem(ACC_KEY)||'blue'); };
  $('#themeDark').onclick  = ()=>{ localStorage.setItem(MODE_KEY,'dark');   applyTheme('dark',localStorage.getItem(ACC_KEY)||'blue'); };
  $$('.swatch').forEach(s=> s.onclick=()=>{ localStorage.setItem(ACC_KEY,s.dataset.accent); applyTheme(localStorage.getItem(MODE_KEY)||'system', s.dataset.accent); });
}

/* ------------------- header behavior ------------------- */
function bindHeaderHide(){
  const bar=$('#topbar'); let lastY=0, ticking=false;
  function onScroll(){
    if(ticking) return; ticking=true;
    requestAnimationFrame(()=>{
      const y=scrollY||document.documentElement.scrollTop||0;
      bar.classList.toggle('shrink', y>10);
      if(y>lastY && y>40) bar.classList.add('hide'); else bar.classList.remove('hide');
      lastY=y; ticking=false;
    });
  }
  addEventListener('scroll', onScroll, {passive:true});
  onScroll();
}

/* ---------------------- tabs/nav ----------------------- */
function activateTab(name){
  $$('#tabs .tab').forEach(t=> t.classList.toggle('active', t.dataset.tab===name));
  $$('.tabpanel').forEach(p=> p.hidden = (p.id !== 'panel-'+name));
}
function bindTabs(){
  $('#tabs').addEventListener('click', (ev)=>{
    const tab=ev.target.closest('.tab'); if(!tab) return;
    const id=tab.dataset.tab; activateTab(id);
    if(id==='trends') drawWakeChart();
    if(id==='calendar') renderWakeCalendar();
    if(id==='entries') renderWakeTable(loadWake());
    if(id==='steps-trends') drawStepsChart();
    if(id==='steps-calendar') renderStepsCalendar();
    if(id==='steps-entries') renderStepsTable(loadSteps());
  });
}

/* -------------------- month pickers -------------------- */
function monthPicker(titleSel, inputSel, getRef, setRef){
  const title=$(titleSel), input=$(inputSel); if(!title||!input) return;
  function open(){
    const r=getRef(); input.value = `${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,'0')}`;
    try{ if(input.showPicker) input.showPicker(); else input.click(); }catch{ input.click(); }
  }
  title.addEventListener('click', open);
  title.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); }});
  input.addEventListener('change', ()=>{ if(!input.value) return; const [yy,mm]=input.value.split('-').map(Number); setRef(new Date(yy,mm-1,1)); });
}

/* ----------------------- storage ---------------------- */
const WAKE_KEY='gidget_site_v1', STEPS_KEY='gidget_steps_v1';
const loadWake = () => { try{return JSON.parse(localStorage.getItem(WAKE_KEY))||[]}catch{return[]} };
const saveWake = (rows) => localStorage.setItem(WAKE_KEY, JSON.stringify(rows));
const loadSteps= () => { try{return JSON.parse(localStorage.getItem(STEPS_KEY))||[]}catch{return[]} };
const saveSteps= (rows) => localStorage.setItem(STEPS_KEY, JSON.stringify(rows));

/* ===================== Wake module ===================== */
const todayISO = ymd(new Date());
let calRef = new Date();

function initWakeForm(){
  $('#date').value = todayISO;
  $('#nowBtn').onclick = ()=>{ const n=new Date(); $('#wake').value=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; };
  $('#save').onclick = ()=>{
    const row={date:$('#date').value||todayISO, wake:$('#wake').value||'', weight:$('#weight').value||'', mood:$('#mood').value||'', notes:$('#notes').value||''};
    const rows=loadWake().filter(r=>r.date!==row.date); rows.push(row); rows.sort((a,b)=>a.date.localeCompare(b.date));
    saveWake(rows); afterWakeChange(rows);
  };
  $('#clearForm').onclick = ()=>{ $('#date').value=todayISO; $('#wake').value=''; $('#weight').value=''; $('#mood').value=''; $('#notes').value=''; };

  $('#applyFilter').onclick = ()=> renderWakeTable(loadWake());
  $('#resetFilter').onclick  = ()=>{ $('#filterFrom').value=''; $('#filterTo').value=''; renderWakeTable(loadWake()); };
}

function renderWakeToday(rows){
  const t=rows.find(r=>r.date===todayISO);
  $('#todayBox').textContent = t ? `Today ${t.date}: wake ${t.wake||'—'} · weight ${t.weight||'—'}g · mood ${t.mood||'—'}` : 'No entry for today yet.';
}
function renderWakeStats(rows){
  let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){ s++; d.setDate(d.getDate()-1); }
  $('#streak').textContent=`Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const ts=rows.filter(r=>r.date>=iso && r.wake).map(r=>toMin(r.wake));
  $('#avg7').textContent=`7‑day avg: ${ts.length? fromMin(Math.round(ts.reduce((a,b)=>a+b,0)/ts.length)) : '—'}`;
}
function renderWakeTable(rows){
  const tb=$('#table tbody'); tb.innerHTML='';
  const f1=$('#filterFrom').value||'', f2=$('#filterTo').value||'';
  rows.filter(r=>(!f1||r.date>=f1)&&(!f2||r.date<=f2)).sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.date}</td><td>${r.wake||'—'}</td><td>${r.weight||'—'}</td><td>${r.mood||'—'}</td><td>${r.food||'—'}</td><td>${r.sand||'—'}</td><td>${r.notes? r.notes.replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-del="${r.date}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick=(e)=>{ const d=e.target.getAttribute?.('data-del'); if(!d) return; const left=loadWake().filter(r=>r.date!==d); saveWake(left); afterWakeChange(left); };
}

let wakeRange=7, wakePts=[];
$('#smooth')?.addEventListener('change', drawWakeChart);
document.addEventListener('click', (e)=>{ const b=e.target.closest?.('.rangeBtn'); if(b){ wakeRange=+b.dataset.range; drawWakeChart(); }});

function drawWakeChart(){
  const rows=loadWake().filter(r=>r.wake);
  const cv=$('#chart'); const {W,H,dpr}=setupCanvas(cv,260); const cx=cv.getContext('2d');
  cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H); wakePts=[];
  const start=new Date(); start.setDate(start.getDate()-wakeRange+1);
  const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,m:toMin(r.wake)})).sort((a,b)=>a.d.localeCompare(b.d));
  $('#chartMeta').textContent=data.length?`${data.length} points`:'No data in range';

  const padL=50,padR=12,padT=12,padB=28; const cs=getComputedStyle(document.body);
  const line=cs.getPropertyValue('--line').trim(), acc=cs.getPropertyValue('--acc').trim(), muted=cs.getPropertyValue('--muted').trim();

  cx.strokeStyle=line; cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();

  const yMap=(mins)=>{ let v=mins; if(v<900) v+=1440; const min=900, max=1800; const t=(v-min)/(max-min); return padT+(1-t)*(H-padT-padB); };
  cx.fillStyle=muted; cx.textAlign='right'; cx.textBaseline='middle'; cx.font='12px system-ui';
  [18*60,21*60,0,3*60].forEach(t=>{ const y=yMap(t); cx.fillText(fromMin((t+1440)%1440), padL-6, y); cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke(); });

  if(!data.length) return;

  const x=(i)=> padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const dayLabel =(s)=>{ const d=new Date(s+'T00:00:00'); return (wakeRange<=14)? d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'}) : d.toLocaleDateString(undefined,{day:'2-digit',month:'short'}); };
  const monthLabel=(s)=>{ const d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',year:wakeRange>365?'2-digit':'numeric'}); };

  let ticks=[];
  if(wakeRange<=14){ for(let i=0;i<data.length;i++){ if(i===0||i===data.length-1||i%2===0) ticks.push({i,text:dayLabel(data[i].d)}); } }
  else if(wakeRange<=90){ let last=-1; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const nm=d.getMonth()!==last; if(nm||i%5===0||i===data.length-1){ ticks.push({i,text:monthLabel(data[i].d)}); last=d.getMonth(); } } }
  else { let seen={}; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const k=`${d.getFullYear()}-${d.getMonth()}`; if(!seen[k]){ seen[k]=true; ticks.push({i,text:d.toLocaleDateString(undefined,{month:'short'})}); } } }
  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top'; ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));

  // points + smoothed line
  cx.fillStyle=acc;
  data.forEach((p,i)=>{ const X=x(i), Y=yMap(p.m); wakePts.push({X,Y,date:p.d}); cx.beginPath(); cx.arc(X,Y,2.5,0,Math.PI*2); cx.fill(); });
  const k=+($('#smooth')?.value||1);
  const vals=data.map(d=>{let v=d.m; if(v<900)v+=1440; return v});
  const sm=(arr,n)=>{ if(n<=1) return arr.slice(); const out=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i]); } return out; }(vals,k);
  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath();
  sm.forEach((v,i)=>{ const X=x(i), Y=padT+(1-((v-900)/(1800-900)))*(H-padT-padB); i?cx.lineTo(X,Y):cx.moveTo(X,Y); }); cx.stroke();

  // click to open modal (wake)
  const getXY=(e)=>{ const r=cv.getBoundingClientRect(); const p=e.touches?e.touches[0]:e; return {x:p.clientX-r.left, y:p.clientY-r.top}; };
  function handle(e){
    if(!wakePts.length) return; const {x,y}=getXY(e); let best=null,d2=1e12;
    for(const p of wakePts){ const dx=x-p.X, dy=y-p.Y, dd=dx*dx+dy*dy; if(dd<d2){ d2=dd; best=p; } }
    if(best && d2<=16*16){ const r=loadWake().find(z=>z.date===best.date)||{}; openModal(`Wake • ${best.date}`, `<div><b>Wake</b>: ${r.wake||'—'}</div><div><b>Weight</b>: ${r.weight||'—'} g</div><div><b>Mood</b>: ${r.mood||'—'}</div><div class="mt"><b>Notes</b>: ${r.notes?String(r.notes).replace(/</g,'&lt;'):'—'}</div>`); }
  }
  cv.onclick=handle; cv.ontouchstart=(e)=>handle(e);
}

function renderWakeCalendar(){
  const rows=loadWake(); const box=$('#calendar'); box.innerHTML='';
  $('#calTitle').textContent=calRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=calRef.getFullYear(), m=calRef.getMonth();
  const first=new Date(y,m,1); const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45;
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec?.wake||'—'}</div>`;
    cell.onclick=()=>{ activateTab('log'); $('#date').value=iso; $('#wake').value=rec?.wake||''; $('#weight').value=rec?.weight||''; $('#mood').value=rec?.mood||''; $('#notes').value=rec?.notes||''; };
    box.appendChild(cell);
  }
}

function afterWakeChange(rows){
  renderWakeToday(rows); renderWakeStats(rows); renderWakeTable(rows); drawWakeChart(); renderWakeCalendar();
}

/* ===================== Steps module ==================== */
let stepsCalRef = new Date(), stepsRange = 7;

function initStepsForm(){
  $('#stepsDate').value = todayISO;
  $('#stepsSave').onclick = ()=>{
    const row={date:$('#stepsDate').value||todayISO, steps:$('#stepsCount').value||'', notes:$('#stepsNotes').value||''};
    const rows=loadSteps().filter(r=>r.date!==row.date); rows.push(row); rows.sort((a,b)=>a.date.localeCompare(b.date));
    saveSteps(rows); afterStepsChange(rows);
  };
  $('#stepsClear').onclick = ()=>{ $('#stepsDate').value=todayISO; $('#stepsCount').value=''; $('#stepsNotes').value=''; };
  $('#stepsSmooth')?.addEventListener('change', drawStepsChart);
  document.addEventListener('click', (e)=>{ const b=e.target.closest?.('.stepsRangeBtn'); if(b){ stepsRange=+b.dataset.range; drawStepsChart(); }});
}

function renderStepsToday(rows){ const t=rows.find(r=>r.date===todayISO); $('#stepsTodayBox').textContent=t?`This morning ${t.date}: ${t.steps||'—'} steps`:'No steps entry for today yet.' }
function renderStepsStats(rows){ let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)} $('#stepsStreak').textContent=`Streak: ${s} ${s===1?'day':'days'}`; const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut); const vals=rows.filter(r=>r.date>=iso && r.steps).map(r=>+r.steps); $('#stepsAvg7').textContent=`7‑day avg: ${vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):'—'}` }
function renderStepsTable(rows){ const tb=$('#stepsTable tbody'); tb.innerHTML=''; [...rows].sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.date}</td><td>${r.steps||'—'}</td><td>${r.notes? r.notes.replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-sdel="${r.date}">Delete</button></td>`; tb.appendChild(tr); }); tb.onclick=(e)=>{ const d=e.target.getAttribute?.('data-sdel'); if(!d) return; const left=loadSteps().filter(r=>r.date!==d); saveSteps(left); afterStepsChange(left); }; }

function drawStepsChart(){
  const rows=loadSteps().filter(r=>r.steps); const cv=$('#stepsChart'); const {W,H,dpr}=setupCanvas(cv,260); const cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const start=new Date(); start.setDate(start.getDate()-stepsRange+1); const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,v:+r.steps})).sort((a,b)=>a.d.localeCompare(b.d));
  $('#stepsChartMeta').textContent=data.length?`${data.length} points`:'No data in range';
  const padL=50,padR=12,padT=12,padB=28; const cs=getComputedStyle(document.body); const line=cs.getPropertyValue('--line').trim(), acc=cs.getPropertyValue('--acc').trim(), muted=cs.getPropertyValue('--muted').trim();
  cx.strokeStyle=line; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  if(!data.length) return;
  const x=(i)=> padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const mLabel=(s)=>{ const d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',year:stepsRange>365?'2-digit':'numeric'}) };
  let ticks=[];
  if(stepsRange<=14){ for(let i=0;i<data.length;i++){ if(i===0||i===data.length-1||i%2===0){ const d=new Date(data[i].d+'T00:00:00'); ticks.push({i,text:d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'})}); } } }
  else if(stepsRange<=90){ let last=-1; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const nm=d.getMonth()!==last; if(nm||i%5===0||i===data.length-1){ ticks.push({i,text:mLabel(data[i].d)}); last=d.getMonth(); } } }
  else { let seen={}; for(let i=0;i<data.length;i++){ const d=new Date(data[i].d+'T00:00:00'); const k=`${d.getFullYear()}-${d.getMonth()}`; if(!seen[k]){ seen[k]=true; ticks.push({i,text:d.toLocaleDateString(undefined,{month:'short'})}); } } }
  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top'; ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));
  const vals=data.map(p=>p.v), yMin=Math.max(0,Math.floor(Math.min(...vals)*0.95)), yMax=Math.ceil(Math.max(...vals)*1.05)||1;
  cx.textAlign='right'; cx.textBaseline='middle'; for(let i=0;i<=5;i++){ const t=i/5; const y=padT+(1-t)*(H-padT-padB); const v=Math.round(yMin+t*(yMax-yMin)); cx.fillText(v, padL-6, y); cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke(); }
  const k=+($('#stepsSmooth')?.value||1);
  const sm=(arr,n)=>{ if(n<=1) return arr.slice(); const out=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i]); } return out; }(vals,k);
  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath(); sm.forEach((v,i)=>{ const X=x(i), Y=padT+(1-((v-yMin)/(yMax-yMin)))*(H-padT-padB); i?cx.lineTo(X,Y):cx.moveTo(X,Y) }); cx.stroke();
}

function renderStepsCalendar(){
  const rows=loadSteps(); const box=$('#stepsCalendar'); box.innerHTML='';
  $('#stepsCalTitle').textContent=stepsCalRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=stepsCalRef.getFullYear(), m=stepsCalRef.getMonth(); const first=new Date(y,m,1); const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45;
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec?.steps||'—'}</div>`;
    cell.onclick=()=>{ activateTab('steps-log'); $('#stepsDate').value=iso; $('#stepsCount').value=rec?.steps||''; $('#stepsNotes').value=rec?.notes||''; };
    box.appendChild(cell);
  }
}

function afterStepsChange(rows){
  renderStepsToday(rows); renderStepsStats(rows); renderStepsTable(rows); drawStepsChart(); renderStepsCalendar();
}

/* -------------------- CSV import/export ---------------- */
$('#exportCsv').onclick=()=>{
  const wake=loadWake(), steps=loadSteps();
  const header='Type,Date,Wake-Up Time,Weight (g),Mood,Notes,Steps\n';
  const lines=[
    ...wake.map(r=>['wake',r.date,r.wake||'',r.weight||'',r.mood||'',JSON.stringify(r.notes||'').slice(1,-1),''].join(',')),
    ...steps.map(s=>['steps',s.date,'','','',JSON.stringify(s.notes||'').slice(1,-1),s.steps||''].join(',')),
  ];
  const blob=new Blob([header+lines.join('\n')],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gidget_data.csv'; a.click();
};
$('#importCsv').addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return; const text=await f.text();
  const lines=text.trim().split(/\r?\n/); const header=lines.shift()?.split(',')||[]; const idxType=header.indexOf('Type');
  const W=[], S=[];
  for(const ln of lines){
    const p=ln.split(',');
    const type=(idxType>=0?p[idxType]:'wake');
    if(type==='steps'){ S.push({date:p[1],steps:p[6]||'',notes:p[5]||''}); }
    else { W.push({date:p[1],wake:p[2]||'',weight:p[3]||'',mood:p[4]||'',notes:p[5]||''}); }
  }
  saveWake(W); saveSteps(S); afterWakeChange(W); afterStepsChange(S);
});

/* ------------------------ modal ------------------------ */
function openModal(title,html){
  $('#modalTitle').textContent=title; $('#modalBody').innerHTML=html;
  $('#modal').hidden=false; $('#modalClose').onclick=()=>$('#modal').hidden=true;
}

/* ------------------------ boot ------------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  bindHeaderHide();
  bindTabs();

  monthPicker('#calTitle',       '#monthPicker',       ()=>calRef,       d=>{calRef=d;       renderWakeCalendar();});
  monthPicker('#stepsCalTitle',  '#stepsMonthPicker',  ()=>stepsCalRef,  d=>{stepsCalRef=d;  renderStepsCalendar();});

  initWakeForm();
  initStepsForm();

  // initial render
  afterWakeChange(loadWake());
  afterStepsChange(loadSteps());

  // PWA register (keep working v17)
  if('serviceWorker' in navigator){
    const qs=new URL(location.href).searchParams;
    if(!(qs.has('nosw')||qs.get('nosw')==='1')){
      addEventListener('load', async ()=>{ try{ const reg=await navigator.serviceWorker.register('./sw.js?v=17'); await reg.update(); }catch(e){} });
      let reloaded=false; navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(reloaded) return; reloaded=true; location.reload(); });
    }
  }
});