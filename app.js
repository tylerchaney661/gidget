/* =========================================================
   Gidget · Hamster Tracker — app.js (v23)
   - Adds: tooltips, Enter-to-save, compact notes popout, FAB
   - Color-coded calendars, search, axis labels
   - Remembered chart settings, auto JSON backup (manual toggle-ready)
   - Install banner, improved a11y/ARIA, Esc to close
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
function activateTab(name){
  $$('#tabs .tab').forEach(t=>{
    const is = t.getAttribute('data-tab')===name;
    t.classList.toggle('active', is);
    t.setAttribute('aria-selected', is ? 'true' : 'false');
  });
  $$('.tabpanel').forEach(p=>p.hidden=(p.id!==('panel-'+name)));
}
function bindTabs(){
  const tabs=$('#tabs'); if(!tabs) return;
  tabs.addEventListener('click',(e)=>{
    const tab=closestEl(e,'.tab'); if(!tab) return; const id=tab.getAttribute('data-tab'); activateTab(id);
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
  input.addEventListener('change', ()=>{ if(!input.value) return; const a=input.value.split('-'); const yy=+a[0],mm=+a[1]; setRef(new Date(yy,mm-1,1)); });
}

/* ---------------------- storage -------------------- */
const WAKE_KEY='gidget_site_v1', STEPS_KEY='gidget_steps_v1';
const WRANGE_KEY='gidget.wake.range', WSMOOTH_KEY='gidget.wake.smooth';
const SRANGE_KEY='gidget.steps.range', SSMOOTH_KEY='gidget.steps.smooth';

function loadWake(){ try{ return JSON.parse(localStorage.getItem(WAKE_KEY))||[]; }catch{ return []; } }
function saveWake(rows){ localStorage.setItem(WAKE_KEY, JSON.stringify(rows)); }
function loadSteps(){ try{ return JSON.parse(localStorage.getItem(STEPS_KEY))||[]; }catch{ return []; } }
function saveSteps(rows){ localStorage.setItem(STEPS_KEY, JSON.stringify(rows)); }

/* ------------------ search helpers ------------------ */
function filterRowsWake(rows, q){
  if(!q) return rows;
  q = q.toLowerCase();
  return rows.filter(r =>
    (r.date||'').toLowerCase().includes(q) ||
    (r.wake||'').toLowerCase().includes(q) ||
    (r.mood||'').toLowerCase().includes(q) ||
    String(r.weight||'').toLowerCase().includes(q) ||
    String(r.notes||'').toLowerCase().includes(q)
  );
}
function filterRowsSteps(rows, q){
  if(!q) return rows;
  q = q.toLowerCase();
  return rows.filter(r =>
    (r.date||'').toLowerCase().includes(q) ||
    String(r.steps||'').toLowerCase().includes(q) ||
    String(r.notes||'').toLowerCase().includes(q)
  );
}

/* ------------------ modals ------------------ */
function openModal(title, html){
  const m = $('#modal'); if(!m) return;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  m.hidden = false;
}
$('#modalClose').onclick = ()=>$('#modal').hidden = true;
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') $('#modal').hidden = true;
});

/* ------------------ dashboard ------------------ */
function renderDash(){
  const w = loadWake(), s = loadSteps(), iso = ymd(new Date());
  const tw = w.find(r=>r.date===iso), ts = s.find(r=>r.date===iso);
  const w7 = (()=>{const d=new Date(); d.setDate(d.getDate()-6); const cut=ymd(d); const xs=w.filter(r=>r.date>=cut&&r.wake).map(r=>toMin(r.wake)); return xs.length? fromMin(Math.round(xs.reduce((a,b)=>a+b,0)/xs.length)) : '—';})();
  const s7 = (()=>{const d=new Date(); d.setDate(d.getDate()-6); const cut=ymd(d); const xs=s.filter(r=>r.date>=cut&&r.steps).map(r=>+r.steps); return xs.length? Math.round(xs.reduce((a,b)=>a+b,0)/xs.length) : '—';})();
  const wTxt = tw? (tw.wake||'—') : '—';
  const sTxt = ts? (ts.steps||'—') : '—';
  const dw = (w7!=='—' && tw&&tw.wake)? ` (avg ${w7})` : '';
  const ds = (s7!=='—' && ts&&ts.steps)? ` (avg ${s7})` : '';
  const dwEl=$('#dashWake'), dsEl=$('#dashSteps');
  if(dwEl) dwEl.textContent = wTxt + (dw||'');
  if(dsEl) dsEl.textContent = sTxt + (ds||'');
}

/* =================== Wake module =================== */
let calRef=new Date();

function initWakeForm(){
  const d = $('#date'); if(d) d.value = ymd(new Date());
  const nowBtn = $('#nowBtn'); if(nowBtn) nowBtn.onclick = ()=> $('#wake').value = new Date().toTimeString().slice(0,5);

  // Enter to save
  ['#wake','#weight','#mood','#notes'].forEach(sel=>{
    const el = $(sel); if(el) el.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); const sv=$('#save'); if(sv) sv.click(); }
    });
  });

  const save=$('#save'); if(save) save.onclick = ()=>{
    if(!$('#date').value) return toast('Date is required');
    const row={date:$('#date').value,wake:$('#wake').value,weight:$('#weight').value,mood:$('#mood').value,notes:$('#notes').value};
    const rows=loadWake().filter(r=>r.date!==row.date).concat([row]).sort((a,b)=>a.date.localeCompare(b.date));
    saveWake(rows); afterWake(rows);
    toast('Wake saved ✓');
  };
  const clear=$('#clearForm'); if(clear) clear.onclick=()=>{$('#wake').value=$('#weight').value=$('#mood').value=$('#notes').value='';};
}

function renderWakeToday(rows){
  const t=rows.find(r=>r.date===ymd(new Date()));
  const box=$('#todayBox'); if(!box) return;
  box.textContent = t?`Today ${t.date}: wake ${t.wake||'—'} · weight ${t.weight||'—'}g · mood ${t.mood||'—'}`:'No entry for today yet.';
}
function renderWakeStats(rows){
  let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)}
  const streak=$('#streak'); if(streak) streak.textContent=`Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const ts=rows.filter(r=>r.date>=iso && r.wake).map(r=>toMin(r.wake));
  const avg7=$('#avg7'); if(avg7) avg7.textContent=`7-day avg: ${ts.length?fromMin(Math.round(ts.reduce((a,b)=>a+b,0)/ts.length)):'—'}`;
}

function renderWakeTable(rows){
  const tb = $('#table tbody'); if(!tb) return; tb.innerHTML='';
  // ensure search input exists
  ensureSearchInput('#panel-entries', '#wakeSearch', term=>renderWakeTable(loadWake()));
  const q = ($('#wakeSearch') && $('#wakeSearch').value) || '';
  const data = filterRowsWake(rows, q);
  data.sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.date}</td><td>${r.wake||'—'}</td><td>${r.weight||'—'}</td><td>${r.mood||'—'}</td>
      <td class="notesCell"><button class="noteIcon">ℹ</button></td>
      <td><button class="btn small" data-del="${r.date}">Delete</button></td>`;
    tr.querySelector('.noteIcon').onclick=()=>openModal('Notes', r.notes ? String(r.notes).replace(/</g,'&lt;') : '—');
    tb.appendChild(tr);
  });
  tb.onclick = (e)=>{
    const d=e.target && e.target.getAttribute ? e.target.getAttribute('data-del') : null;
    if(!d) return;
    const all=loadWake(), deleted=all.find(r=>r.date===d), left=all.filter(r=>r.date!==d);
    saveWake(left); afterWake(left);
    toast(`Deleted wake entry ${d}`, `<button class="btn small" id="undoWake">Undo</button>`);
    const u=$('#undoWake');
    if(u) u.onclick=()=>{ const rows=loadWake().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date)); saveWake(rows); afterWake(rows); };
  };
}

function renderWakeCalendar(){
  const rows=loadWake(); const box=$('#calendar'); if(!box) return; box.innerHTML='';
  const title=$('#calTitle'); if(title) title.textContent=calRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=calRef.getFullYear(), m=calRef.getMonth(); const first=new Date(y,m,1);
  const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45;
    if(rec&&rec.wake){ const mins=toMin(rec.wake); if(mins<1200)cell.classList.add('cell-early'); else if(mins<1380)cell.classList.add('cell-mid'); else cell.classList.add('cell-late'); }
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.wake?rec.wake:'—'}</div>`;
    cell.onclick=()=>{ let html=''; if(rec){ html=`<div><b>Date</b>: ${iso}</div><div><b>Wake</b>: ${rec.wake||'—'}</div><div><b>Weight</b>: ${rec.weight||'—'} g</div><div><b>Mood</b>: ${rec.mood||'—'}</div><div class="mt"><b>Notes</b>: ${rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—'}</div>`; } else { html=`<div>No wake entry for ${iso}.</div>`; } openModal('Wake • '+iso, html); };
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
  }
}

/* =================== Steps module =================== */
let stepsCalRef=new Date();

function initStepsForm(){
  const d=$('#stepsDate'); if(d) d.value=ymd(new Date());
  const todayBtn=$('#stepsTodayBtn'); if(todayBtn) todayBtn.onclick=()=>{ $('#stepsDate').value=ymd(new Date()); };
  ['#stepsCount','#stepsNotes'].forEach(sel=>{
    const el=$(sel); if(el) el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const b=$('#stepsSave'); if(b) b.click(); }});
  });
  const save=$('#stepsSave'); if(save) save.onclick=()=>{
    if(!$('#stepsDate').value) return toast('Date is required');
    const row={date:$('#stepsDate').value,steps:$('#stepsCount').value,notes:$('#stepsNotes').value};
    const rows=loadSteps().filter(r=>r.date!==row.date).concat([row]).sort((a,b)=>a.date.localeCompare(b.date));
    saveSteps(rows); afterSteps(rows); toast('Steps saved ✓');
  };
  const clr=$('#stepsClear'); if(clr) clr.onclick=()=>{ $('#stepsCount').value=''; $('#stepsNotes').value=''; };
}

function renderStepsToday(rows){
  const t=rows.find(r=>r.date===ymd(new Date())); const box=$('#stepsTodayBox'); if(!box) return;
  box.textContent=t?`This morning ${t.date}: ${t.steps||'—'} steps`:'No steps entry for today yet.';
}
function renderStepsStats(rows){
  let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)}
  const streak=$('#stepsStreak'); if(streak) streak.textContent=`Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const vals=rows.filter(r=>r.date>=iso&&r.steps).map(r=>+r.steps);
  const avg7=$('#stepsAvg7'); if(avg7) avg7.textContent=`7-day avg: ${vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):'—'}`;
}

function renderStepsTable(rows){
  const tb=$('#stepsTable tbody'); if(!tb) return; tb.innerHTML='';
  ensureSearchInput('#panel-steps-entries', '#stepsSearch', term=>renderStepsTable(loadSteps()));
  const q=($('#stepsSearch')&&$('#stepsSearch').value)||'';
  const data=filterRowsSteps(rows, q);
  data.sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.date}</td><td>${r.steps||'—'}</td>
      <td class="notesCell"><button class="noteIcon">ℹ</button></td>
      <td><button class="btn small" data-sdel="${r.date}">Delete</button></td>`;
    tr.querySelector('.noteIcon').onclick=()=>openModal('Notes', r.notes ? String(r.notes).replace(/</g,'&lt;'):'—');
    tb.appendChild(tr);
  });
  tb.onclick=(e)=>{
    const d=e.target && e.target.getAttribute ? e.target.getAttribute('data-sdel') : null;
    if(!d) return;
    const all=loadSteps(), deleted=all.find(r=>r.date===d), left=all.filter(r=>r.date!==d);
    saveSteps(left); afterSteps(left);
    toast(`Deleted steps ${d}`, `<button class="btn small" id="undoSteps">Undo</button>`);
    const u=$('#undoSteps');
    if(u) u.onclick=()=>{ const rows=loadSteps().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date)); saveSteps(rows); afterSteps(rows); };
  };
}

function renderStepsCalendar(){
  const rows=loadSteps(); const box=$('#stepsCalendar'); if(!box) return; box.innerHTML='';
  const title=$('#stepsCalTitle'); if(title) title.textContent=stepsCalRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const y=stepsCalRef.getFullYear(), m=stepsCalRef.getMonth(); const first=new Date(y,m,1);
  const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45;
    if(rec&&rec.steps){ const v=+rec.steps; if(v<5000)cell.classList.add('cell-low'); else if(v<12000)cell.classList.add('cell-mid'); else cell.classList.add('cell-high'); }
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.steps?rec.steps:'—'}</div>`;
    cell.onclick=()=>{ let html=''; if(rec){ html=`<div><b>Date</b>: ${iso}</div><div><b>Steps</b>: ${rec.steps||'—'}</div><div class="mt"><b>Notes</b>: ${rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—'}</div>`; } else { html=`<div>No steps entry for ${iso}.</div>`; } openModal('Steps • '+iso, html); };
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
  }
}

/* ------------------ charts ------------------ */
let wakeRange = +(localStorage.getItem(WRANGE_KEY)||7);
let wakeSmooth= +(localStorage.getItem(WSMOOTH_KEY)||1);
let stepsRange= +(localStorage.getItem(SRANGE_KEY)||7);
let stepsSmooth=+(localStorage.getItem(SSMOOTH_KEY)||1);

function bindChartControls(){
  const smooth=$('#smooth'); if(smooth){ smooth.value=String(wakeSmooth); smooth.addEventListener('change',()=>{ wakeSmooth=+smooth.value; localStorage.setItem(WSMOOTH_KEY,String(wakeSmooth)); drawWakeChart(); }); }
  $$('.rangeBtn').forEach(b=> b.addEventListener('click',()=>{ wakeRange=+b.getAttribute('data-range'); localStorage.setItem(WRANGE_KEY,String(wakeRange)); drawWakeChart(); }));

  const sSmooth=$('#stepsSmooth'); if(sSmooth){ sSmooth.value=String(stepsSmooth); sSmooth.addEventListener('change',()=>{ stepsSmooth=+sSmooth.value; localStorage.setItem(SSMOOTH_KEY,String(stepsSmooth)); drawStepsChart(); }); }
  $$('.stepsRangeBtn').forEach(b=> b.addEventListener('click',()=>{ stepsRange=+b.getAttribute('data-range'); localStorage.setItem(SRANGE_KEY,String(stepsRange)); drawStepsChart(); }));
}

function movingAvg(arr, n){
  if(n<=1) return arr.slice();
  const out=[], len=arr.length; let s=0;
  for(let i=0;i<len;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out[i]= i>=n-1 ? s/Math.min(n,i+1) : arr[i]; }
  return out;
}

function drawWakeChart(){
  const rows=loadWake().filter(r=>r.wake);
  const cv=$('#chart'); if(!cv) return;
  const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const end=new Date(); const start=new Date(end); start.setDate(end.getDate()-wakeRange+1);
  const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,m:toMin(r.wake)})).sort((a,b)=>a.d.localeCompare(b.d));
  const padL=50,padR=10,padT=12,padB=34;
  cx.strokeStyle=getCSS('--line'); cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  cx.fillStyle=getCSS('--muted'); cx.textAlign='left'; cx.fillText("Time (HH:MM)", padL, H-10);

  const min=900,max=1800;
  const x=i => padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const y=m => padT + (1-((m-min)/(max-min)))*(H-padT-padB);

  // grid labels
  cx.textAlign='right'; cx.textBaseline='middle';
  [18*60,21*60,0,3*60].forEach(t=>{ const yv=y((t+1440)%1440<900 ? (t+1440) : t); cx.fillText(fromMin((t+1440)%1440), padL-6, yv); cx.beginPath(); cx.moveTo(padL,yv); cx.lineTo(W-padR,yv); cx.stroke(); });

  if(!data.length) return;

  const vals = data.map(d=>{let v=d.m; if(v<900) v+=1440; return v;});
  const sm = movingAvg(vals, wakeSmooth);

  // line
  cx.strokeStyle=getCSS('--acc'); cx.lineWidth=2; cx.beginPath();
  sm.forEach((v,i)=>{ const yv=padT+(1-((v-900)/(1800-900)))*(H-padT-padB); const xv=x(i); if(i) cx.lineTo(xv,yv); else cx.moveTo(xv,yv); });
  cx.stroke();

  // points & interaction
  const pts=[]; cx.fillStyle=getCSS('--acc');
  data.forEach((p,i)=>{ const X=x(i), Y=y(p.m<900?p.m+1440:p.m); pts.push({X,Y,date:p.d}); cx.beginPath(); cx.arc(X,Y,2.5,0,Math.PI*2); cx.fill(); });

  function getPos(e){ const r=cv.getBoundingClientRect(); const p=(e.touches&&e.touches[0])||e; return {x:p.clientX-r.left,y:p.clientY-r.top}; }
  function handle(e){ if(!pts.length) return; const pos=getPos(e); let best=null,d2=1e12; for(const p of pts){ const dx=pos.x-p.X, dy=pos.y-p.Y, dd=dx*dx+dy*dy; if(dd<d2){ d2=dd; best=p; } } if(best && d2<=18*18){ const r=loadWake().find(z=>z.date===best.date)||{}; openModal(`Wake • ${best.date}`, `<div><b>Wake</b>: ${r.wake||'—'}</div><div><b>Weight</b>: ${r.weight||'—'} g</div><div><b>Mood</b>: ${r.mood||'—'}</div><div class="mt"><b>Notes</b>: ${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</div>`); } }
  cv.onclick=handle; cv.addEventListener('touchstart', handle, {passive:true});

  // x labels
  const ticks=[]; const labelDay=s=>{const d=new Date(s+'T00:00:00'); return d.toLocaleDateString(undefined,{day:'2-digit',month:'short'});};
  const step=Math.max(1, Math.floor(data.length/6));
  for(let i=0;i<data.length;i+=step){ ticks.push({i,text:labelDay(data[i].d)}); }
  cx.textAlign='center'; cx.textBaseline='top'; cx.fillStyle=getCSS('--muted');
  ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));
}

function drawStepsChart(){
  const rows=loadSteps().filter(r=>r.steps);
  const cv=$('#stepsChart'); if(!cv) return;
  const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const end=new Date(); const start=new Date(end); start.setDate(end.getDate()-stepsRange+1);
  const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,v:+r.steps})).sort((a,b)=>a.d.localeCompare(b.d));
  const padL=50,padR=10,padT=12,padB=34;
  cx.strokeStyle=getCSS('--line'); cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  cx.fillStyle=getCSS('--muted'); cx.textAlign='left'; cx.fillText("Steps", padL, H-10);

  if(!data.length) return;

  const vals=data.map(d=>d.v); const yMin=Math.max(0, Math.floor(Math.min.apply(null, vals)*0.95)); const yMax=Math.max(1, Math.ceil(Math.max.apply(null, vals)*1.05));
  const sm = movingAvg(vals, stepsSmooth);

  const x=i => padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const y=v => padT + (1-((v-yMin)/(yMax-yMin)))*(H-padT-padB);

  // horizontal grid labels
  cx.textAlign='right'; cx.textBaseline='middle'; cx.fillStyle=getCSS('--muted');
  for(let i=0;i<=4;i++){ const t=i/4; const yv=padT+(1-t)*(H-padT-padB); const v=Math.round(yMin + t*(yMax-yMin)); cx.fillText(String(v), padL-6, yv); cx.beginPath(); cx.moveTo(padL,yv); cx.lineTo(W-padR,yv); cx.strokeStyle=getCSS('--line'); cx.stroke(); }

  // line
  cx.strokeStyle=getCSS('--acc'); cx.lineWidth=2; cx.beginPath();
  sm.forEach((v,i)=>{ const xv=x(i), yv=y(v); if(i) cx.lineTo(xv,yv); else cx.moveTo(xv,yv); });
  cx.stroke();

  // x labels
  const ticks=[]; const step=Math.max(1, Math.floor(data.length/6));
  for(let i=0;i<data.length;i+=step){ const d=new Date(data[i].d+'T00:00:00'); ticks.push({i,text:d.toLocaleDateString(undefined,{day:'2-digit',month:'short'})}); }
  cx.textAlign='center'; cx.textBaseline='top'; cx.fillStyle=getCSS('--muted');
  ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));
}

function getCSS(name){ return getComputedStyle(document.body).getPropertyValue(name).trim(); }

/* ------------------ after save ------------------ */
function afterWake(rows){ renderWakeToday(rows); renderWakeStats(rows); renderWakeTable(rows); renderWakeCalendar(); drawWakeChart(); renderDash(); }
function afterSteps(rows){ renderStepsToday(rows); renderStepsStats(rows); renderStepsTable(rows); renderStepsCalendar(); drawStepsChart(); renderDash(); }

/* ------------------ search inputs (auto-add) ------- */
function ensureSearchInput(panelSel, inputIdSel, onInput){
  const panel=$(panelSel); if(!panel) return;
  let inp=$(inputIdSel);
  if(!inp){
    const h3=panel.querySelector('h3') || panel.querySelector('table') || panel.firstChild;
    const wrap=document.createElement('div'); wrap.className='row mt'; wrap.style.justifyContent='flex-end';
    inp=document.createElement('input'); inp.className='search'; inp.id=inputIdSel.replace('#',''); inp.placeholder='Search…';
    wrap.appendChild(inp);
    if(h3 && h3.parentNode) h3.parentNode.insertBefore(wrap, h3.nextSibling);
  }
  if(inp && onInput){ inp.oninput=()=> onInput(inp.value); }
}

/* ------------------ JSON Export/Import -------------- */
(function bindJson(){
  const exportJson = $('#exportJson');
  if (exportJson) exportJson.onclick = () => {
    const blob = new Blob([JSON.stringify({ wake: loadWake(), steps: loadSteps() }, null, 2)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='gidget_data_v23.json'; a.click();
  };
  const importJson = $('#importJson');
  if (importJson) importJson.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try{
      const data = JSON.parse(await f.text()) || {};
      const W = Array.isArray(data.wake)? data.wake : [];
      const S = Array.isArray(data.steps)? data.steps : [];
      const wMap = new Map(loadWake().map(r=>[r.date,r])); W.forEach(r=>wMap.set(r.date, r));
      const sMap = new Map(loadSteps().map(r=>[r.date,r])); S.forEach(r=>sMap.set(r.date, r));
      const wRows = Array.from(wMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
      const sRows = Array.from(sMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
      saveWake(wRows); saveSteps(sRows); afterWake(wRows); afterSteps(sRows);
      toast('Imported JSON and merged');
    }catch{ toast('Import failed: bad JSON'); }
  });
})();

/* ------------------ CSV Export/Import (keep) -------- */
(function bindCsv(){
  const exportBtn=$('#exportCsv');
  if(exportBtn) exportBtn.onclick=()=>{ 
    const wake=loadWake(), steps=loadSteps();
    const header='Type,Date,Wake-Up Time,Weight (g),Mood,Notes,Steps\n';
    const lines=[
      ...wake.map(r=>['wake',r.date,r.wake||'',r.weight||'',r.mood||'',JSON.stringify(r.notes||'').slice(1,-1),''].join(',')),
      ...steps.map(s=>['steps',s.date,'','','',JSON.stringify(s.notes||'').slice(1,-1),s.steps||''].join(','))
    ];
    const blob=new Blob([header+lines.join('\n')],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gidget_data.csv'; a.click();
  };
  const importEl=$('#importCsv');
  if(importEl) importEl.addEventListener('change',(e)=>{
    const f=e.target.files[0]; if(!f) return;
    f.text().then((text)=>{
      const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(',');
      const idxType=header.indexOf('Type'); const W=[],S=[];
      lines.forEach(ln=>{
        const p=ln.split(',');
        const type=(idxType>=0?p[idxType]:'wake');
        if(type==='steps'){ S.push({date:p[1],steps:p[6]||'',notes:p[5]||''}); }
        else { W.push({date:p[1],wake:p[2]||'',weight:p[3]||'',mood:p[4]||'',notes:p[5]||''}); }
      });
      saveWake(W); saveSteps(S); afterWake(W); afterSteps(S);
      toast('Imported CSV');
    });
  });
})();

/* ------------------ Online/offline + SW ------------- */
function updateDot(){ const d=document.querySelector('.status-dot'); if(!d) return; d.classList.toggle('off', !navigator.onLine); }
window.addEventListener('online', updateDot);
window.addEventListener('offline', updateDot);

/* SW register (respect ?nosw=1 like v22) */
function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  const qs=new URL(window.location.href).searchParams;
  if(qs.get('nosw')==='1') return;
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw.js?v=23').then(reg=>reg.update()).catch(()=>{}); });
  let reloaded=false; navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(reloaded) return; reloaded=true; window.location.reload(); });
  navigator.serviceWorker.addEventListener('message', (evt)=>{
    if (evt.data && evt.data.type === 'SW_ACTIVATED') {
      toast(`Updated to ${evt.data.version}`, `<button class="btn small" onclick="location.reload()">Reload</button>`);
    }
  });
}

/* ------------------ FAB (+ Install banner) ---------- */
function ensureFab(){
  if($('#fab')) return;
  const b=document.createElement('button'); b.id='fab'; b.className='fab'; b.title='Add entry'; b.textContent='+';
  b.onclick=()=>{ const tab=$$('#tabs .tab').find(t=>t.classList.contains('active')); const id=tab?tab.getAttribute('data-tab'):'log';
    if(id==='steps-log'){ activateTab('steps-log'); const d=$('#stepsDate'); if(d) d.focus(); }
    else { activateTab('log'); const d=$('#date'); if(d) d.focus(); }
    window.scrollTo({top:0,behavior:'smooth'});
  };
  document.body.appendChild(b);
}
function showInstallBannerOnce(){
  if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  if(localStorage.getItem('gidget.install.dismissed')==='1') return;
  const wrap=document.createElement('div'); wrap.className='install'; wrap.innerHTML=
    `<span>Install Gidget on your phone for a full-screen app experience.</span>
     <button id="ibInstall" class="btn small">How?</button>
     <button id="ibClose" class="btn small">Close</button>`;
  document.body.appendChild(wrap);
  $('#ibInstall').onclick=()=>{ alert('On iPhone (Safari): • Tap Share • Add to Home Screen.\nOn Android (Chrome): • Menu ⋮ • Add to Home screen.'); };
  $('#ibClose').onclick=()=>{ localStorage.setItem('gidget.install.dismissed','1'); wrap.remove(); };
}

/* ------------------ Calendar month pickers ---------- */
function bindMonthPickers(){
  monthPicker('#calTitle',       '#monthPicker',      ()=>calRef,      (d)=>{calRef=d; renderWakeCalendar();});
  monthPicker('#stepsCalTitle',  '#stepsMonthPicker', ()=>stepsCalRef, (d)=>{stepsCalRef=d; renderStepsCalendar();});

  // prev/next/today buttons
  const prev=$('#prevMonth'), next=$('#nextMonth'), today=$('#todayMonth');
  if(prev)  prev.onclick = ()=>{ calRef.setMonth(calRef.getMonth()-1); renderWakeCalendar(); };
  if(next)  next.onclick = ()=>{ calRef.setMonth(calRef.getMonth()+1); renderWakeCalendar(); };
  if(today) today.onclick= ()=>{ calRef=new Date(); renderWakeCalendar(); };

  const sprev=$('#stepsPrevMonth'), snext=$('#stepsNextMonth'), stoday=$('#stepsTodayMonth');
  if(sprev)  sprev.onclick = ()=>{ stepsCalRef.setMonth(stepsCalRef.getMonth()-1); renderStepsCalendar(); };
  if(snext)  snext.onclick = ()=>{ stepsCalRef.setMonth(stepsCalRef.getMonth()+1); renderStepsCalendar(); };
  if(stoday) stoday.onclick= ()=>{ stepsCalRef=new Date(); renderStepsCalendar(); };
}

/* ------------------ Boot ---------------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  bindHeaderHide();
  bindTabs();
  bindChartControls();
  bindMonthPickers();
  initWakeForm();
  initStepsForm();

  afterWake(loadWake());
  afterSteps(loadSteps());
  renderDash();

  ensureSearchInput('#panel-entries',       '#wakeSearch',  ()=>renderWakeTable(loadWake()));
  ensureSearchInput('#panel-steps-entries', '#stepsSearch', ()=>renderStepsTable(loadSteps()));

  ensureFab();
  showInstallBannerOnce();
  updateDot();
  registerSW();

  const inst=$('#installInfo'); if(inst) inst.onclick=()=>alert('On iPhone: open in Safari → Share → Add to Home Screen.\nOn Android: Chrome menu → Add to Home screen.');
});