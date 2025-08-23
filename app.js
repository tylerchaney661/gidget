/* =========================================================
   Gidget · Hamster Tracker — app.js (calendar fixes, stable)
   - No optional chaining; works in strict TS checks
   - Wake & Steps calendars: click to open detail modal + edit
   - Month nav (Prev/Today/Next) + native month picker (iOS-safe)
   - Everything else unchanged (themes, tabs, trends, CSV, PWA)
========================================================= */

/* --------------------- helpers --------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.prototype.slice.call(r.querySelectorAll(s));

function closestEl(el, selector){
  // Safe closest() without optional chaining
  let n = el && el.nodeType === 1 ? el : (el && el.target) ? el.target : null;
  for (; n; n = n.parentElement) {
    if (n.matches && n.matches(selector)) return n;
  }
  return null;
}

function ymd(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function toMin(t){ if(!t) return null; const p=t.split(':'); return (+p[0])*60 + (+p[1]); }
function fromMin(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function setupCanvas(cv, cssH=260){
  cv.style.width='100%';
  cv.style.height=(innerWidth<=700?340:cssH)+'px';
  const dpr=window.devicePixelRatio||1;
  const rect=cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(rect.width*dpr));
  cv.height= Math.max(1, Math.round(parseFloat(cv.style.height)*dpr));
  return { W: rect.width, H: parseFloat(cv.style.height), dpr };
}

/* ---------------------- theme ---------------------- */
const MODE_KEY='gidget.theme.mode';
const ACC_KEY='gidget.theme.accent';
const ACCENTS={blue:'#0EA5E9',mint:'#6EE7B7',violet:'#8b5cf6',amber:'#f59e0b',rose:'#f43f5e'};

function applyTheme(mode,accent){
  const root=document.documentElement;
  if(mode==='light' || mode==='dark') root.setAttribute('data-mode',mode);
  else root.removeAttribute('data-mode');
  root.style.setProperty('--acc', ACCENTS[accent]||ACCENTS.blue);
}
function initTheme(){
  const m=localStorage.getItem(MODE_KEY)||'system';
  const a=localStorage.getItem(ACC_KEY)||'blue';
  applyTheme(m,a);

  const lightBtn = $('#themeLight');
  const sysBtn   = $('#themeSystem');
  const darkBtn  = $('#themeDark');
  if(lightBtn) lightBtn.onclick = function(){ localStorage.setItem(MODE_KEY,'light');  applyTheme('light',  localStorage.getItem(ACC_KEY)||'blue'); };
  if(sysBtn)   sysBtn.onclick   = function(){ localStorage.setItem(MODE_KEY,'system'); applyTheme('system', localStorage.getItem(ACC_KEY)||'blue'); };
  if(darkBtn)  darkBtn.onclick  = function(){ localStorage.setItem(MODE_KEY,'dark');   applyTheme('dark',   localStorage.getItem(ACC_KEY)||'blue'); };

  $$('.swatch').forEach(function(s){
    s.onclick = function(){
      const acc=s.getAttribute('data-accent');
      localStorage.setItem(ACC_KEY, acc);
      applyTheme(localStorage.getItem(MODE_KEY)||'system', acc);
    };
  });
}

/* --------------- header hide/shrink ---------------- */
function bindHeaderHide(){
  const bar=$('#topbar'); if(!bar) return;
  let last=0, ticking=false;
  function onScroll(){
    if(ticking) return; ticking=true;
    requestAnimationFrame(function(){
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y>10) bar.classList.add('shrink'); else bar.classList.remove('shrink');
      if (y>last && y>40) bar.classList.add('hide'); else bar.classList.remove('hide');
      last=y; ticking=false;
    });
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
}

/* ------------------ tabs / panels ------------------ */
function activateTab(name){
  $$('#tabs .tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab')===name); });
  $$('.tabpanel').forEach(function(p){ p.hidden = (p.id !== ('panel-'+name)); });
}
function bindTabs(){
  const tabs = $('#tabs'); if(!tabs) return;
  tabs.addEventListener('click', function(e){
    const tab = closestEl(e, '.tab'); if(!tab) return;
    const id = tab.getAttribute('data-tab');
    activateTab(id);
    if(id==='trends') drawWakeChart();
    if(id==='calendar') renderWakeCalendar();
    if(id==='entries') renderWakeTable(loadWake());
    if(id==='steps-trends') drawStepsChart();
    if(id==='steps-calendar') renderStepsCalendar();
    if(id==='steps-entries') renderStepsTable(loadSteps());
  });
}

/* ------------------ month pickers ------------------ */
function monthPicker(titleSel,inputSel,getRef,setRef){
  const title=$(titleSel), input=$(inputSel); if(!title||!input) return;

  function open(){
    const r=getRef();
    const y=r.getFullYear();
    const m=String(r.getMonth()+1).padStart(2,'0');
    input.value = `${y}-${m}`;
    try{
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    }catch(_){ input.click(); }
  }

  title.addEventListener('click', open);
  title.addEventListener('keydown', function(e){
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); }
  });

  input.addEventListener('change', function(){
    if(!input.value) return;
    const parts=input.value.split('-');
    const yy=+parts[0], mm=+parts[1];
    setRef(new Date(yy,mm-1,1));
  });
}

/* ---------------------- storage -------------------- */
const WAKE_KEY='gidget_site_v1';
const STEPS_KEY='gidget_steps_v1';

function loadWake(){ try{ return JSON.parse(localStorage.getItem(WAKE_KEY))||[]; }catch(_){ return []; } }
function saveWake(rows){ localStorage.setItem(WAKE_KEY, JSON.stringify(rows)); }
function loadSteps(){ try{ return JSON.parse(localStorage.getItem(STEPS_KEY))||[]; }catch(_){ return []; } }
function saveSteps(rows){ localStorage.setItem(STEPS_KEY, JSON.stringify(rows)); }

/* =================== Wake module =================== */
const todayISO=ymd(new Date());
let calRef = new Date();

function initWakeForm(){
  const date=$('#date'), nowBtn=$('#nowBtn'), save=$('#save'), clear=$('#clearForm');
  if(date) date.value=todayISO;

  if(nowBtn) nowBtn.onclick=function(){
    const n=new Date();
    $('#wake').value = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  };

  if(save) save.onclick=function(){
    const row={
      date: $('#date').value || todayISO,
      wake: $('#wake').value || '',
      weight: $('#weight').value || '',
      mood: $('#mood').value || '',
      notes: $('#notes').value || ''
    };
    const rows=loadWake().filter(function(r){ return r.date!==row.date; });
    rows.push(row);
    rows.sort(function(a,b){ return a.date.localeCompare(b.date); });
    saveWake(rows);
    afterWake(rows);
  };

  if(clear) clear.onclick=function(){
    $('#date').value=todayISO; $('#wake').value=''; $('#weight').value=''; $('#mood').value=''; $('#notes').value='';
  };

  const apply=$('#applyFilter'), reset=$('#resetFilter');
  if(apply) apply.onclick=function(){ renderWakeTable(loadWake()); };
  if(reset) reset.onclick=function(){ $('#filterFrom').value=''; $('#filterTo').value=''; renderWakeTable(loadWake()); };
}

function renderWakeToday(rows){
  const t=rows.find(function(r){ return r.date===todayISO; });
  $('#todayBox').textContent = t ? `Today ${t.date}: wake ${t.wake||'—'} · weight ${t.weight||'—'}g · mood ${t.mood||'—'}` : 'No entry for today yet.';
}
function renderWakeStats(rows){
  let s=0, d=new Date();
  while(rows.some(function(r){ return r.date===ymd(d); })){ s++; d.setDate(d.getDate()-1); }
  $('#streak').textContent = `Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const ts=rows.filter(function(r){ return r.date>=iso && r.wake; }).map(function(r){ return toMin(r.wake); });
  $('#avg7').textContent = `7‑day avg: ${ts.length? fromMin(Math.round(ts.reduce(function(a,b){return a+b;},0)/ts.length)) : '—'}`;
}
function renderWakeTable(rows){
  const tb=$('#table tbody'); if(!tb) return;
  tb.innerHTML='';
  const f1=$('#filterFrom').value||'', f2=$('#filterTo').value||'';
  rows
    .filter(function(r){ return (!f1||r.date>=f1) && (!f2||r.date<=f2); })
    .sort(function(a,b){ return b.date.localeCompare(a.date); })
    .forEach(function(r){
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${r.date}</td><td>${r.wake||'—'}</td><td>${r.weight||'—'}</td><td>${r.mood||'—'}</td><td>${r.food||'—'}</td><td>${r.sand||'—'}</td><td>${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-del="${r.date}">Delete</button></td>`;
      tb.appendChild(tr);
    });

  tb.onclick=function(e){
    const t=e.target;
    const d = (t && t.getAttribute) ? t.getAttribute('data-del') : null;
    if(!d) return;
    const left=loadWake().filter(function(r){ return r.date!==d; });
    saveWake(left); afterWake(left);
  };
}

let wakeRange=7, wakePts=[];
document.addEventListener('click', function(e){
  const b = closestEl(e, '.rangeBtn');
  if(b){ wakeRange = +b.getAttribute('data-range'); drawWakeChart(); }
});
(function(){ const el=$('#smooth'); if(el) el.addEventListener('change', drawWakeChart); })();

function drawWakeChart(){
  const rows=loadWake().filter(function(r){ return r.wake; });
  const cv=$('#chart'); if(!cv) return;
  const dims=setupCanvas(cv,260), W=dims.W, H=dims.H, dpr=dims.dpr;
  const cx=cv.getContext('2d');
  cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H); wakePts=[];

  const start=new Date(); start.setDate(start.getDate()-wakeRange+1);
  const data=rows
    .filter(function(r){ return r.date>=ymd(start); })
    .map(function(r){ return {d:r.date, m:toMin(r.wake)}; })
    .sort(function(a,b){ return a.d.localeCompare(b.d); });

  const chartMeta=$('#chartMeta'); if(chartMeta) chartMeta.textContent=data.length?`${data.length} points`:'No data in range';

  const padL=50,padR=12,padT=12,padB=28;
  const cs=getComputedStyle(document.body);
  const line=cs.getPropertyValue('--line').trim();
  const acc =cs.getPropertyValue('--acc').trim();
  const muted=cs.getPropertyValue('--muted').trim();

  cx.strokeStyle=line; cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();

  function yMap(mins){
    var v=mins; if(v<900) v+=1440; // allow post-midnight wrap
    var min=900, max=1800;
    var t=(v-min)/(max-min);
    return padT + (1-t)*(H-padT-padB);
  }

  cx.fillStyle=muted; cx.textAlign='right'; cx.textBaseline='middle'; cx.font='12px system-ui';
  [18*60,21*60,0,3*60].forEach(function(t){
    const y=yMap(t);
    cx.fillText(fromMin((t+1440)%1440), padL-6, y);
    cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke();
  });

  if(!data.length) return;

  const x=function(i){ return padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR); };

  function dayLabel(s){
    const d=new Date(s+'T00:00:00');
    return (wakeRange<=14) ? d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'})
                           : d.toLocaleDateString(undefined,{day:'2-digit',month:'short'});
  }
  function monthLabel(s){
    const d=new Date(s+'T00:00:00');
    return d.toLocaleDateString(undefined,{month:'short',year:wakeRange>365?'2-digit':'numeric'});
  }

  var ticks=[];
  if(wakeRange<=14){
    for(var i=0;i<data.length;i++){ if(i===0||i===data.length-1||i%2===0) ticks.push({i:i, text:dayLabel(data[i].d)}); }
  } else if(wakeRange<=90){
    var last=-1;
    for(var j=0;j<data.length;j++){
      var d=new Date(data[j].d+'T00:00:00');
      var nm=d.getMonth()!==last;
      if(nm||j%5===0||j===data.length-1){ ticks.push({i:j,text:monthLabel(data[j].d)}); last=d.getMonth(); }
    }
  } else {
    var seen={};
    for(var k=0;k<data.length;k++){
      var dd=new Date(data[k].d+'T00:00:00');
      var key=dd.getFullYear()+'-'+dd.getMonth();
      if(!seen[key]){ seen[key]=true; ticks.push({i:k, text:dd.toLocaleDateString(undefined,{month:'short'})}); }
    }
  }

  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top';
  ticks.forEach(function(t){ cx.fillText(t.text, x(t.i), H-padB+6); });

  // points
  cx.fillStyle=acc;
  data.forEach(function(p,i){
    const X=x(i), Y=yMap(p.m);
    wakePts.push({X:X,Y:Y,date:p.d});
    cx.beginPath(); cx.arc(X,Y,2.5,0,Math.PI*2); cx.fill();
  });

  // smoothed line
  var smoothEl = $('#smooth');
  var k = smoothEl ? +smoothEl.value : 1;
  var vals=data.map(function(d){ var v=d.m; if(v<900)v+=1440; return v; });
  function movingAvg(arr,n){
    if(n<=1) return arr.slice();
    var out=[], s=0;
    for(var i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i]); }
    return out;
  }
  var sm=movingAvg(vals,k);
  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath();
  sm.forEach(function(v,i){
    const X=x(i);
    const Y=padT+(1-((v-900)/(1800-900)))*(H-padT-padB);
    if(i) cx.lineTo(X,Y); else cx.moveTo(X,Y);
  });
  cx.stroke();

  // tap to inspect
  function getXY(e){
    const r=cv.getBoundingClientRect();
    const p = (e && e.touches && e.touches[0]) ? e.touches[0] : e;
    return {x:p.clientX-r.left, y:p.clientY-r.top};
  }
  function handle(e){
    if(!wakePts.length) return;
    const pos=getXY(e);
    var best=null, d2=1e12;
    for(var i=0;i<wakePts.length;i++){
      const p=wakePts[i], dx=pos.x-p.X, dy=pos.y-p.Y, dd=dx*dx+dy*dy;
      if(dd<d2){ d2=dd; best=p; }
    }
    if(best && d2<=16*16){
      const r = loadWake().find(function(z){ return z.date===best.date; }) || {};
      openModal('Wake • '+best.date,
        '<div><b>Wake</b>: '+(r.wake||'—')+'</div>'+
        '<div><b>Weight</b>: '+(r.weight||'—')+' g</div>'+
        '<div><b>Mood</b>: '+(r.mood||'—')+'</div>'+
        '<div class="mt"><b>Notes</b>: '+(r.notes? String(r.notes).replace(/</g,'&lt;'):'—')+'</div>');
    }
  }
  cv.onclick=handle;
  cv.addEventListener('touchstart', handle, {passive:true});
}

/* --------- WAKE calendar (with pop-out modal) -------- */
function renderWakeCalendar(){
  const rows=loadWake();
  const box=$('#calendar'); if(!box) return; box.innerHTML='';
  const title=$('#calTitle'); if(title) title.textContent=calRef.toLocaleString(undefined,{month:'long',year:'numeric'});

  const y=calRef.getFullYear(), m=calRef.getMonth();
  const first=new Date(y,m,1);
  const start=new Date(first);
  const lead=(first.getDay()+6)%7; // Monday-first grid
  start.setDate(1-lead);

  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const iso=ymd(d);
    const rec=rows.find(function(r){ return r.date===iso; });

    const cell=document.createElement('div');
    cell.className='cell';
    cell.style.opacity = (d.getMonth()===m)?1:.45;
    cell.innerHTML = '<div class="d">'+d.getDate()+'</div><div class="tiny mt">'+(rec&&rec.wake?rec.wake:'—')+'</div>';

    cell.onclick=function(){
      var html = '';
      if(rec){
        html =
          '<div><b>Date</b>: '+iso+'</div>'+
          '<div><b>Wake</b>: '+(rec.wake||'—')+'</div>'+
          '<div><b>Weight</b>: '+(rec.weight||'—')+' g</div>'+
          '<div><b>Mood</b>: '+(rec.mood||'—')+'</div>'+
          '<div class="mt"><b>Notes</b>: '+(rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—')+'</div>'+
          '<div class="row mt end"><button id="editDayBtn" class="btn solid">Edit this day</button></div>';
      } else {
        html =
          '<div>No wake entry for '+iso+'.</div>'+
          '<div class="row mt end"><button id="editDayBtn" class="btn solid">Add entry</button></div>';
      }

      openModal('Wake • '+iso, html);

      var edit=document.getElementById('editDayBtn');
      if(edit){
        edit.onclick=function(){
          activateTab('log');
          $('#date').value=iso;
          $('#wake').value=(rec&&rec.wake)||'';
          $('#weight').value=(rec&&rec.weight)||'';
          $('#mood').value=(rec&&rec.mood)||'';
          $('#notes').value=(rec&&rec.notes)||'';
          $('#modal').hidden=true;
        };
      }
    };

    // keyboard accessibility
    cell.tabIndex = 0;
    cell.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); cell.click(); }});

    box.appendChild(cell);
  }
}

/* ====== Steps module (unchanged except calendar pop-out) ====== */
let stepsCalRef=new Date();
let stepsRange=7;

function initStepsForm(){
  const d=$('#stepsDate'); if(d) d.value=todayISO;

  const save=$('#stepsSave'); if(save) save.onclick=function(){
    const row={ date:$('#stepsDate').value||todayISO, steps:$('#stepsCount').value||'', notes:$('#stepsNotes').value||'' };
    const rows=loadSteps().filter(function(r){ return r.date!==row.date; });
    rows.push(row);
    rows.sort(function(a,b){ return a.date.localeCompare(b.date); });
    saveSteps(rows);
    afterSteps(rows);
  };

  const clr=$('#stepsClear'); if(clr) clr.onclick=function(){ $('#stepsDate').value=todayISO; $('#stepsCount').value=''; $('#stepsNotes').value=''; };

  (function(){ const el=$('#stepsSmooth'); if(el) el.addEventListener('change', drawStepsChart); })();

  document.addEventListener('click', function(e){
    const b = closestEl(e, '.stepsRangeBtn');
    if(b){ stepsRange = +b.getAttribute('data-range'); drawStepsChart(); }
  });
}

function renderStepsToday(rows){
  const t=rows.find(function(r){ return r.date===todayISO; });
  $('#stepsTodayBox').textContent = t ? `This morning ${t.date}: ${t.steps||'—'} steps` : 'No steps entry for today yet.';
}
function renderStepsStats(rows){
  let s=0, d=new Date();
  while(rows.some(function(r){ return r.date===ymd(d); })){ s++; d.setDate(d.getDate()-1); }
  $('#stepsStreak').textContent=`Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const vals=rows.filter(function(r){ return r.date>=iso && r.steps; }).map(function(r){ return +r.steps; });
  $('#stepsAvg7').textContent = `7‑day avg: ${vals.length? Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length) : '—'}`;
}
function renderStepsTable(rows){
  const tb=$('#stepsTable tbody'); if(!tb) return;
  tb.innerHTML='';
  rows.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(r){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.steps||'—'}</td><td>${r.notes? String(r.notes).replace(/</g,'&lt;'):'—'}</td><td><button class="btn small" data-sdel="${r.date}">Delete</button></td>`;
    tb.appendChild(tr);
  });
  tb.onclick=function(e){
    const t=e.target;
    const d = (t && t.getAttribute) ? t.getAttribute('data-sdel') : null;
    if(!d) return;
    const left=loadSteps().filter(function(r){ return r.date!==d; });
    saveSteps(left); afterSteps(left);
  };
}

function drawStepsChart(){
  const rows=loadSteps().filter(function(r){ return r.steps; });
  const cv=$('#stepsChart'); if(!cv) return;
  const dims=setupCanvas(cv,260), W=dims.W, H=dims.H, dpr=dims.dpr;
  const cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);

  const start=new Date(); start.setDate(start.getDate()-stepsRange+1);
  const data=rows.filter(function(r){ return r.date>=ymd(start); })
                 .map(function(r){ return {d:r.date, v:+r.steps}; })
                 .sort(function(a,b){ return a.d.localeCompare(b.d); });

  const meta=$('#stepsChartMeta'); if(meta) meta.textContent=data.length?`${data.length} points`:'No data in range';

  const padL=50,padR=12,padT=12,padB=28;
  const cs=getComputedStyle(document.body);
  const line=cs.getPropertyValue('--line').trim();
  const acc =cs.getPropertyValue('--acc').trim();
  const muted=cs.getPropertyValue('--muted').trim();

  cx.strokeStyle=line; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  if(!data.length) return;

  const x=function(i){ return padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR); };

  function mLabel(s){
    const d=new Date(s+'T00:00:00');
    return d.toLocaleDateString(undefined,{month:'short',year:stepsRange>365?'2-digit':'numeric'});
  }

  var ticks=[];
  if(stepsRange<=14){
    for(var i=0;i<data.length;i++){
      if(i===0||i===data.length-1||i%2===0){
        const d=new Date(data[i].d+'T00:00:00');
        ticks.push({i:i, text:d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'})});
      }
    }
  } else if(stepsRange<=90){
    var last=-1;
    for(var j=0;j<data.length;j++){
      var d=new Date(data[j].d+'T00:00:00');
      var nm=d.getMonth()!==last;
      if(nm||j%5===0||j===data.length-1){ ticks.push({i:j, text:mLabel(data[j].d)}); last=d.getMonth(); }
    }
  } else {
    var seen={};
    for(var k=0;k<data.length;k++){
      var dd=new Date(data[k].d+'T00:00:00');
      var key=dd.getFullYear()+'-'+dd.getMonth();
      if(!seen[key]){ seen[key]=true; ticks.push({i:k, text:dd.toLocaleDateString(undefined,{month:'short'})}); }
    }
  }

  cx.fillStyle=muted; cx.textAlign='center'; cx.textBaseline='top';
  ticks.forEach(function(t){ cx.fillText(t.text, x(t.i), H-padB+6); });

  const vals=data.map(function(p){ return p.v; });
  const yMin=Math.max(0, Math.floor(Math.min.apply(null, vals)*0.95));
  const yMax=Math.ceil((Math.max.apply(null, vals)||1)*1.05);

  cx.textAlign='right'; cx.textBaseline='middle';
  for(var g=0; g<=5; g++){
    const t=g/5;
    const y=padT+(1-t)*(H-padT-padB);
    const v=Math.round(yMin+t*(yMax-yMin));
    cx.fillText(String(v), padL-6, y);
    cx.beginPath(); cx.moveTo(padL,y); cx.lineTo(W-padR,y); cx.stroke();
  }

  var smoothEl=$('#stepsSmooth');
  var k = smoothEl ? +smoothEl.value : 1;
  function movingAvg(arr,n){
    if(n<=1) return arr.slice();
    var out=[], s=0;
    for(var i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out.push(i>=n-1? s/Math.min(n,i+1):arr[i]); }
    return out;
  }
  var sm=movingAvg(vals,k);

  cx.strokeStyle=acc; cx.lineWidth=2; cx.beginPath();
  sm.forEach(function(v,i){
    const X=x(i);
    const Y=padT+(1-((v-yMin)/(yMax-yMin)))*(H-padT-padB);
    if(i) cx.lineTo(X,Y); else cx.moveTo(X,Y);
  });
  cx.stroke();
}

/* -------- STEPS calendar (with pop-out modal) ------- */
function renderStepsCalendar(){
  const rows=loadSteps();
  const box=$('#stepsCalendar'); if(!box) return; box.innerHTML='';
  const title=$('#stepsCalTitle'); if(title) title.textContent=stepsCalRef.toLocaleString(undefined,{month:'long',year:'numeric'});

  const y=stepsCalRef.getFullYear(), m=stepsCalRef.getMonth();
  const first=new Date(y,m,1);
  const start=new Date(first);
  const lead=(first.getDay()+6)%7;
  start.setDate(1-lead);

  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const iso=ymd(d);
    const rec=rows.find(function(r){ return r.date===iso; });

    const cell=document.createElement('div');
    cell.className='cell';
    cell.style.opacity=(d.getMonth()===m)?1:.45;
    cell.innerHTML='<div class="d">'+d.getDate()+'</div><div class="tiny mt">'+(rec&&rec.steps?rec.steps:'—')+'</div>';

    cell.onclick=function(){
      var html='';
      if(rec){
        html =
          '<div><b>Date</b>: '+iso+'</div>'+
          '<div><b>Steps</b>: '+(rec.steps||'—')+'</div>'+
          '<div class="mt"><b>Notes</b>: '+(rec.notes? String(rec.notes).replace(/</g,'&lt;'):'—')+'</div>'+
          '<div class="row mt end"><button id="editStepsDayBtn" class="btn solid">Edit this day</button></div>';
      } else {
        html =
          '<div>No steps entry for '+iso+'.</div>'+
          '<div class="row mt end"><button id="editStepsDayBtn" class="btn solid">Add entry</button></div>';
      }

      openModal('Steps • '+iso, html);

      var edit=document.getElementById('editStepsDayBtn');
      if(edit){
        edit.onclick=function(){
          activateTab('steps-log');
          $('#stepsDate').value=iso;
          $('#stepsCount').value=(rec&&rec.steps)||'';
          $('#stepsNotes').value=(rec&&rec.notes)||'';
          $('#modal').hidden=true;
        };
      }
    };

    // keyboard accessibility
    cell.tabIndex = 0;
    cell.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); cell.click(); }});

    box.appendChild(cell);
  }
}

/* ------------- Calendar NAV buttons (both) ---------- */
function bindCalendarNav(){
  // Wake calendar
  const prev=$('#prevMonth'), next=$('#nextMonth'), today=$('#todayMonth');
  if(prev)  prev.onclick = function(){ calRef = new Date(calRef.getFullYear(), calRef.getMonth()-1, 1); renderWakeCalendar(); };
  if(next)  next.onclick = function(){ calRef = new Date(calRef.getFullYear(), calRef.getMonth()+1, 1); renderWakeCalendar(); };
  if(today) today.onclick= function(){ calRef = new Date(); calRef.setDate(1); renderWakeCalendar(); };

  // Steps calendar
  const sprev=$('#stepsPrevMonth'), snext=$('#stepsNextMonth'), stoday=$('#stepsTodayMonth');
  if(sprev)  sprev.onclick = function(){ stepsCalRef = new Date(stepsCalRef.getFullYear(), stepsCalRef.getMonth()-1, 1); renderStepsCalendar(); };
  if(snext)  snext.onclick = function(){ stepsCalRef = new Date(stepsCalRef.getFullYear(), stepsCalRef.getMonth()+1, 1); renderStepsCalendar(); };
  if(stoday) stoday.onclick= function(){ stepsCalRef = new Date(); stepsCalRef.setDate(1); renderStepsCalendar(); };
}

/* ---------------- CSV import / export --------------- */
const exportBtn=$('#exportCsv');
if(exportBtn) exportBtn.onclick=function(){
  const wake=loadWake(), steps=loadSteps();
  const header='Type,Date,Wake-Up Time,Weight (g),Mood,Notes,Steps\n';
  const lines=[]
    .concat(wake.map(function(r){ return ['wake',r.date,r.wake||'',r.weight||'',r.mood||'',JSON.stringify(r.notes||'').slice(1,-1),''].join(','); }))
    .concat(steps.map(function(s){ return ['steps',s.date,'','','',JSON.stringify(s.notes||'').slice(1,-1),s.steps||''].join(','); }));
  const blob=new Blob([header+lines.join('\n')],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gidget_data.csv'; a.click();
};

const importEl=$('#importCsv');
if(importEl) importEl.addEventListener('change', function(e){
  const f=e.target.files[0]; if(!f) return;
  f.text().then(function(text){
    const lines=text.trim().split(/\r?\n/);
    const header=lines.shift().split(',');
    const idxType=header.indexOf('Type');
    const W=[], S=[];
    lines.forEach(function(ln){
      const p=ln.split(',');
      const type=(idxType>=0?p[idxType]:'wake');
      if(type==='steps'){ S.push({date:p[1],steps:p[6]||'',notes:p[5]||''}); }
      else { W.push({date:p[1],wake:p[2]||'',weight:p[3]||'',mood:p[4]||'',notes:p[5]||''}); }
    });
    saveWake(W); saveSteps(S);
    afterWake(W); afterSteps(S);
  });
});

/* --------------------- modal ----------------------- */
function openModal(title,html){
  const m=$('#modal'); if(!m) return;
  $('#modalTitle').textContent=title;
  $('#modalBody').innerHTML=html;
  m.hidden=false;
}
const modalClose=$('#modalClose');
if(modalClose) modalClose.onclick=function(){ $('#modal').hidden=true; };

/* ---------------------- boot ----------------------- */
document.addEventListener('DOMContentLoaded', function(){
  initTheme();
  bindHeaderHide();
  bindTabs();

  monthPicker('#calTitle',      '#monthPicker',      function(){return calRef;},      function(d){ calRef=d; renderWakeCalendar(); });
  monthPicker('#stepsCalTitle', '#stepsMonthPicker', function(){return stepsCalRef;}, function(d){ stepsCalRef=d; renderStepsCalendar(); });
  bindCalendarNav();

  initWakeForm();
  initStepsForm();

  afterWake(loadWake());
  afterSteps(loadSteps());

  // PWA (keeps your current sw.js version param)
  if('serviceWorker' in navigator){
    const qs=new URL(window.location.href).searchParams;
    if(!(qs.has('nosw') || qs.get('nosw')==='1')){
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('./sw.js?v=18').then(function(reg){ reg.update(); }).catch(function(){});
      });
      let reloaded=false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(reloaded) return; reloaded=true; window.location.reload();
      });
    }
  }

  const inst=$('#installInfo');
  if(inst) inst.onclick=function(){ alert('On iPhone: open in Safari → Share → Add to Home Screen.'); };
});