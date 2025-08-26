/* =========================================================
   Gidget · Hamster Tracker — app.js (v26)
   - Revolutions (km/mi) + Wake
   - Trend charts with grid, axis labels, and tooltips (hover/tap)
   - Keeps v24 features: calendars w/ edit/delete, FAB, SW, JSON/CSV
========================================================= */

/* --------------------- helpers --------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.prototype.slice.call(r.querySelectorAll(s));
function closestEl(el, selector){ let n = el && el.nodeType === 1 ? el : (el && el.target) ? el.target : null; for (; n; n = n.parentElement) { if (n.matches && n.matches(selector)) return n; } return null; }
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function toMin(t){ if(!t) return null; const p=t.split(':'); return (+p[0])*60 + (+p[1]); }
function fromMin(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function setupCanvas(cv, cssH=260){
  cv.style.width='100%'; cv.style.height=(innerWidth<=700?320:cssH)+'px';
  const dpr=window.devicePixelRatio||1, rect=cv.getBoundingClientRect();
  cv.width=Math.max(1,Math.round(rect.width*dpr)); cv.height=Math.max(1,Math.round(parseFloat(cv.style.height)*dpr));
  return { W: rect.width, H: parseFloat(cv.style.height), dpr };
}
function getCSS(name){ return getComputedStyle(document.body).getPropertyValue(name).trim(); }
function movingAvg(arr, n){ if(n<=1) return arr.slice(); const out=[], len=arr.length; let s=0; for(let i=0;i<len;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; out[i]= s/Math.min(n,i+1); } return out; }

/* Tiny tooltip element (shared by charts) */
function ensureTip(){
  let tip = $('#chartTip');
  if(!tip){
    tip = document.createElement('div');
    tip.id = 'chartTip';
    tip.style.position='fixed';
    tip.style.zIndex='9999';
    tip.style.pointerEvents='none';
    tip.style.padding='8px 10px';
    tip.style.border='1px solid var(--line)';
    tip.style.borderRadius='10px';
    tip.style.background='var(--card)';
    tip.style.boxShadow='var(--shadow)';
    tip.style.color='var(--fg)';
    tip.style.fontSize='12px';
    tip.style.opacity='0';
    tip.style.transition='opacity .12s ease, transform .12s ease';
    document.body.appendChild(tip);
  }
  return tip;
}
function showTip(x, y, html){
  const tip = ensureTip();
  tip.innerHTML = html;
  const pad=12;
  let tx=x+pad, ty=y+pad;
  // keep in viewport
  const rect = tip.getBoundingClientRect();
  if(tx+rect.width>innerWidth-8) tx = x - rect.width - pad;
  if(ty+rect.height>innerHeight-8) ty = y - rect.height - pad;
  tip.style.left = tx+'px';
  tip.style.top  = ty+'px';
  tip.style.opacity='1';
  tip.style.transform='translateY(0)';
}
function hideTip(){
  const tip = ensureTip();
  tip.style.opacity='0';
  tip.style.transform='translateY(4px)';
}

/* Toast */
function toast(msg, actionsHtml){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.innerHTML = `<span>${msg}</span>` + (actionsHtml||'');
  t.hidden = false; t.classList.add('show');
  clearTimeout(toast._timer); toast._timer = setTimeout(()=>{ t.classList.remove('show'); }, 5000);
}

/* ---------------------- theme & units ---------------------- */
const MODE_KEY='gidget.theme.mode', ACC_KEY='gidget.theme.accent';
const UNIT_KEY='gidget.units'; // 'km' | 'mi'
const ACCENTS={blue:'#0EA5E9',mint:'#6EE7B7',violet:'#8b5cf6',amber:'#f59e0b',rose:'#f43f5e'};
function applyTheme(mode,accent){ const root=document.documentElement; if(mode==='light'||mode==='dark') root.setAttribute('data-mode',mode); else root.removeAttribute('data-mode'); root.style.setProperty('--acc', ACCENTS[accent]||ACCENTS.blue); }
function initTheme(){
  const m=localStorage.getItem(MODE_KEY)||'system', a=localStorage.getItem(ACC_KEY)||'blue'; applyTheme(m,a);
  $('#themeLight')?.addEventListener('click',()=>{ localStorage.setItem(MODE_KEY,'light');  applyTheme('light',  localStorage.getItem(ACC_KEY)||'blue'); });
  $('#themeSystem')?.addEventListener('click',()=>{ localStorage.setItem(MODE_KEY,'system'); applyTheme('system', localStorage.getItem(ACC_KEY)||'blue'); });
  $('#themeDark')?.addEventListener('click',()=>{ localStorage.setItem(MODE_KEY,'dark');   applyTheme('dark',   localStorage.getItem(ACC_KEY)||'blue'); });
  $$('.swatch').forEach(s=> s.onclick=()=>{ const acc=s.getAttribute('data-accent'); localStorage.setItem(ACC_KEY,acc); applyTheme(localStorage.getItem(MODE_KEY)||'system',acc); });
}
function initUnits(){
  const u = localStorage.getItem(UNIT_KEY) || 'km';
  const km=$('#unitKm'), mi=$('#unitMi');
  function setU(val){ localStorage.setItem(UNIT_KEY,val); km && km.classList.toggle('solid', val==='km'); mi && mi.classList.toggle('solid', val==='mi'); afterRevs(loadRevs()); drawRevsChart(); }
  km && (km.onclick=()=>setU('km'));
  mi && (mi.onclick=()=>setU('mi'));
  setU(u);
}
const UNIT_MULT = { km: 0.00091, mi: 0.000565 }; // 1 rev = 0.91 m ≈ 0.00091 km ≈ 0.000565 mi

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
    if(id==='revs-trends') drawRevsChart(); if(id==='revs-calendar') renderRevsCalendar(); if(id==='revs-entries') renderRevsTable(loadRevs());
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
const WAKE_KEY='gidget.wake';
const REVS_KEY='gidget.revs';
const WRANGE_KEY='gidget.wake.range', WSMOOTH_KEY='gidget.wake.smooth';
const RRANGE_KEY='gidget.revs.range', RSMOOTH_KEY='gidget.revs.smooth';

function loadWake(){ try{ return JSON.parse(localStorage.getItem(WAKE_KEY))||[]; }catch{ return []; } }
function saveWake(rows){ localStorage.setItem(WAKE_KEY, JSON.stringify(rows)); }
function loadRevs(){ try{ return JSON.parse(localStorage.getItem(REVS_KEY))||[]; }catch{ return []; } }
function saveRevs(rows){ localStorage.setItem(REVS_KEY, JSON.stringify(rows)); }

/* ------------------ search helpers ------------------ */
function filterRowsWake(rows, q){
  if(!q) return rows; q=q.toLowerCase();
  return rows.filter(r => (r.date||'').toLowerCase().includes(q) || (r.wake||'').toLowerCase().includes(q) ||
                          (r.mood||'').toLowerCase().includes(q) || String(r.weight||'').toLowerCase().includes(q) ||
                          String(r.notes||'').toLowerCase().includes(q));
}
function filterRowsRevs(rows, q){
  if(!q) return rows; q=q.toLowerCase();
  return rows.filter(r => (r.date||'').toLowerCase().includes(q) ||
                          String(r.revs||'').toLowerCase().includes(q) ||
                          String(r.notes||'').toLowerCase().includes(q));
}

/* ------------------ modals ------------------ */
function openModal(title, html){
  let m = $('#modal');
  if(!m){
    m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal';
    m.hidden = true;
    m.innerHTML = `
      <div class="modal-content">
        <button id="modalClose" class="modal-close" aria-label="Close">✕</button>
        <h3 id="modalTitle"></h3>
        <div id="modalBody"></div>
      </div>`;
    document.body.appendChild(m);
    $('#modalClose').onclick = ()=>$('#modal').hidden = true;
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') $('#modal').hidden = true; });
  }
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  m.hidden = false;
}

/* ------------------ dashboard ------------------ */
function renderDash(){
  const w = loadWake(), r = loadRevs(), iso = ymd(new Date());
  const tw = w.find(x=>x.date===iso), tr = r.find(x=>x.date===iso);
  const unit=localStorage.getItem(UNIT_KEY)||'km';
  const mult=UNIT_MULT[unit];
  const dwEl=$('#dashWake'), dsEl=$('#dashSteps');
  if(dwEl) dwEl.textContent = tw? (tw.wake||'—') : '—';
  if(dsEl) dsEl.textContent = tr? ( (+tr.revs*mult).toFixed(2)+' '+unit ) : '—';
}

/* =================== Wake module =================== */
let calRef=new Date();

function initWakeForm(){
  const d = $('#date'); if(d) d.value = ymd(new Date());
  const nowBtn = $('#nowBtn'); if(nowBtn) nowBtn.onclick = ()=> $('#wake').value = new Date().toTimeString().slice(0,5);
  ['#wake','#weight','#mood','#notes'].forEach(sel=>{
    const el=$(sel); if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); const sv=$('#save'); if(sv) sv.click(); }});
  });
  const save=$('#save'); if(save) save.onclick=()=>{
    if(!$('#date').value) return toast('Date is required');
    const row={date:$('#date').value,wake:$('#wake').value,weight:$('#weight').value,mood:$('#mood').value,notes:$('#notes').value};
    const rows=loadWake().filter(r=>r.date!==row.date).concat([row]).sort((a,b)=>a.date.localeCompare(b.date));
    saveWake(rows); afterWake(rows); toast('Wake saved ✓');
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
  ensureSearchInput('#panel-entries', '#wakeSearch', ()=>renderWakeTable(loadWake()));
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
    const u=$('#undoWake'); if(u) u.onclick=()=>{ const rows=loadWake().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date)); saveWake(rows); afterWake(rows); };
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
    if(rec&&rec.wake){ const mins=toMin(rec.wake); if(mins<1200)cell.classList.add('cell-low'); else if(mins<1380)cell.classList.add('cell-mid'); else cell.classList.add('cell-high'); }
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.wake?rec.wake:'—'}</div>`;
    cell.setAttribute('data-date', iso);
    cell.setAttribute('role', 'button');
    cell.style.cursor = 'pointer';
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
  }
}
function openWakeDayModal(iso){
  const rows = loadWake();
  const rec  = rows.find(r=>r.date===iso);
  const formHtml = `
    <form id="wakeEditForm" class="col">
      <div class="row">
        <div class="col">
          <label>Date</label>
          <input id="we_date" type="date" value="${iso}" disabled />
        </div>
        <div class="col">
          <label>Wake-Up</label>
          <input id="we_wake" type="time" value="${rec? (rec.wake||''):''}" />
        </div>
      </div>
      <div class="row mt">
        <div class="col">
          <label>Weight (g)</label>
          <input id="we_weight" type="number" min="0" step="1" value="${rec? (rec.weight||''):''}" />
        </div>
        <div class="col">
          <label>Mood</label>
          <input id="we_mood" type="text" value="${rec? (rec.mood||''):''}" />
        </div>
      </div>
      <label class="mt">Notes</label>
      <textarea id="we_notes">${rec? (String(rec.notes||'').replace(/</g,'&lt;')):''}</textarea>
      <div class="row mt end">
        ${rec ? '<button id="we_delete" type="button" class="btn">Delete</button>' : ''}
        <button id="we_save" type="submit" class="btn solid">${rec? 'Save' : 'Add'}</button>
      </div>
    </form>`;
  openModal('Wake • '+iso, formHtml);
  const form = document.getElementById('wakeEditForm');
  if(!form) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const updated = {
      date: iso,
      wake: document.getElementById('we_wake').value || '',
      weight: document.getElementById('we_weight').value || '',
      mood: document.getElementById('we_mood').value || '',
      notes: document.getElementById('we_notes').value || ''
    };
    const next = rows.filter(r=>r.date!==iso).concat([updated]).sort((a,b)=>a.date.localeCompare(b.date));
    saveWake(next); afterWake(next); document.getElementById('modal').hidden = true; toast('Saved ✓');
  });
  const delBtn = document.getElementById('we_delete');
  if(delBtn){
    delBtn.addEventListener('click', ()=>{
      if(!confirm(`Delete wake entry for ${iso}?`)) return;
      const next = rows.filter(r=>r.date!==iso);
      saveWake(next); afterWake(next); document.getElementById('modal').hidden = true; toast('Deleted');
    });
  }
}

/* =================== Revolutions module =================== */
let revsCalRef=new Date();
let revsRange = +(localStorage.getItem(RRANGE_KEY)||7);
let revsSmooth= +(localStorage.getItem(RSMOOTH_KEY)||1);

function initRevsForm(){
  const d=$('#revsDate'); if(d) d.value=ymd(new Date());
  $('#revsTodayBtn')?.addEventListener('click', ()=>{ $('#revsDate').value=ymd(new Date()); });
  ['#revsCount','#revsNotes'].forEach(sel=>{
    const el=$(sel); if(el) el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const b=$('#revsSave'); if(b) b.click(); }});
  });
  const save=$('#revsSave'); if(save) save.onclick=()=>{
    if(!$('#revsDate').value) return toast('Date is required');
    const row={date:$('#revsDate').value,revs:$('#revsCount').value,notes:$('#revsNotes').value};
    const rows=loadRevs().filter(r=>r.date!==row.date).concat([row]).sort((a,b)=>a.date.localeCompare(b.date));
    saveRevs(rows); afterRevs(rows); toast('Revolutions saved ✓');
  };
  const clr=$('#revsClear'); if(clr) clr.onclick=()=>{ $('#revsCount').value=''; $('#revsNotes').value=''; };
}
function renderRevsToday(rows){
  const t=rows.find(r=>r.date===ymd(new Date())); const box=$('#revsTodayBox'); if(!box) return;
  const unit=localStorage.getItem(UNIT_KEY)||'km', mult=UNIT_MULT[unit];
  box.textContent=t?`This morning ${t.date}: ${t.revs||'—'} revs • ${(t.revs? (+t.revs*mult).toFixed(2):'—')} ${unit}`:'No revolutions entry for today yet.';
}
function renderRevsStats(rows){
  let s=0,d=new Date(); while(rows.some(r=>r.date===ymd(d))){s++; d.setDate(d.getDate()-1)}
  const streak=$('#revsStreak'); if(streak) streak.textContent=`Streak: ${s} ${s===1?'day':'days'}`;
  const cut=new Date(); cut.setDate(cut.getDate()-6); const iso=ymd(cut);
  const vals=rows.filter(r=>r.date>=iso&&r.revs).map(r=>+r.revs);
  const avg7=$('#revsAvg7'); if(avg7) avg7.textContent=`7-day avg: ${vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):'—'} revs`;
}
function renderRevsTable(rows){
  const tb=$('#revsTable tbody'); if(!tb) return; tb.innerHTML='';
  ensureSearchInput('#panel-revs-entries', '#revsSearch', ()=>renderRevsTable(loadRevs()));
  const q=($('#revsSearch')&&$('#revsSearch').value)||'';
  const data=filterRowsRevs(rows, q);
  const unit=localStorage.getItem(UNIT_KEY)||'km', mult=UNIT_MULT[unit];
  data.sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
    const dist = r.revs ? (+r.revs*mult).toFixed(2)+' '+unit : '—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.date}</td><td>${r.revs||'—'}</td><td>${dist}</td>
      <td class="notesCell"><button class="noteIcon">ℹ</button></td>
      <td><button class="btn small" data-rdel="${r.date}">Delete</button></td>`;
    tr.querySelector('.noteIcon').onclick=()=>openModal('Notes', r.notes ? String(r.notes).replace(/</g,'&lt;'):'—');
    tb.appendChild(tr);
  });
  tb.onclick=(e)=>{
    const d=e.target && e.target.getAttribute ? e.target.getAttribute('data-rdel') : null; if(!d) return;
    const all=loadRevs(), deleted=all.find(r=>r.date===d), left=all.filter(r=>r.date!==d);
    saveRevs(left); afterRevs(left);
    toast(`Deleted revolutions ${d}`, `<button class="btn small" id="undoRevs">Undo</button>`);
    const u=$('#undoRevs'); if(u) u.onclick=()=>{ const rows=loadRevs().filter(r=>r.date!==deleted.date).concat([deleted]).sort((a,b)=>a.date.localeCompare(b.date)); saveRevs(rows); afterRevs(rows); };
  };
}
function renderRevsCalendar(){
  const rows=loadRevs(); const box=$('#revsCalendar'); if(!box) return; box.innerHTML='';
  const title=$('#revsCalTitle'); if(title) title.textContent=revsCalRef.toLocaleString(undefined,{month:'long',year:'numeric'});
  const unit=localStorage.getItem(UNIT_KEY)||'km', mult=UNIT_MULT[unit];
  const y=revsCalRef.getFullYear(), m=revsCalRef.getMonth(); const first=new Date(y,m,1);
  const start=new Date(first); const lead=(first.getDay()+6)%7; start.setDate(1-lead);
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const iso=ymd(d); const rec=rows.find(r=>r.date===iso);
    const cell=document.createElement('div'); cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?1:.45;
    let dist=0; if(rec&&rec.revs) dist=+rec.revs*mult;
    if(dist>0){ if(dist<0.5)cell.classList.add('cell-low'); else if(dist<2)cell.classList.add('cell-mid'); else cell.classList.add('cell-high'); }
    cell.innerHTML=`<div class="d">${d.getDate()}</div><div class="tiny mt">${rec&&rec.revs? (dist.toFixed(2)+' '+unit):'—'}</div>`;
    cell.setAttribute('data-date', iso);
    cell.setAttribute('role', 'button');
    cell.style.cursor = 'pointer';
    cell.tabIndex=0; cell.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cell.click(); }});
    box.appendChild(cell);
function bindCalendarClicks(){
  const cal = $('#calendar');
  if(cal){
    cal.addEventListener('click', (e)=>{
      const cell = closestEl(e, '.cell'); if(!cell) return;
      const iso = cell.getAttribute('data-date'); if(!iso) return;
      openWakeDayModal(iso);
    });
  }
  const rcal = $('#revsCalendar');
  if(rcal){
    rcal.addEventListener('click', (e)=>{
      const cell = closestEl(e, '.cell'); if(!cell) return;
      const iso = cell.getAttribute('data-date'); if(!iso) return;
      openRevsDayModal(iso);
    });
  }
}
  }
}
function openRevsDayModal(iso){
  const rows = loadRevs();
  const rec  = rows.find(r=>r.date===iso);
  const unit = localStorage.getItem(UNIT_KEY)||'km';
  const mult = UNIT_MULT[unit];
  const dist = rec && rec.revs ? ( (+rec.revs*mult).toFixed(2)+' '+unit ) : '—';

  const formHtml = `
    <form id="revsEditForm" class="col">
      <div class="row">
        <div class="col">
          <label>Date</label>
          <input id="re_date" type="date" value="${iso}" disabled />
        </div>
        <div class="col">
          <label>Revolutions</label>
          <input id="re_revs" type="number" min="0" step="1" value="${rec? (rec.revs||''):''}" />
        </div>
      </div>
      <div class="row mt">
        <div class="col">
          <label>Distance (${unit})</label>
          <input id="re_dist" type="text" value="${rec? dist:''}" disabled />
        </div>
      </div>
      <label class="mt">Notes</label>
      <textarea id="re_notes">${rec? (String(rec.notes||'').replace(/</g,'&lt;')):''}</textarea>
      <div class="row mt end">
        ${rec ? '<button id="re_delete" type="button" class="btn">Delete</button>' : ''}
        <button id="re_save" type="submit" class="btn solid">${rec? 'Save' : 'Add'}</button>
      </div>
    </form>`;

  openModal('Revolutions • '+iso, formHtml);

  const revInput = document.getElementById('re_revs');
  const distInput= document.getElementById('re_dist');
  if(revInput && distInput){ revInput.addEventListener('input', ()=>{ const v = +revInput.value||0; const unit=localStorage.getItem(UNIT_KEY)||'km'; const mult=UNIT_MULT[unit]; distInput.value = (v*mult).toFixed(2)+' '+unit; }); }

  const form = document.getElementById('revsEditForm');
  if(!form) return;

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const updated = { date: iso, revs: document.getElementById('re_revs').value || '', notes: document.getElementById('re_notes').value || '' };
    const next = rows.filter(r=>r.date!==iso).concat([updated]).sort((a,b)=>a.date.localeCompare(b.date));
    saveRevs(next); afterRevs(next); document.getElementById('modal').hidden = true; toast('Saved ✓');
  });

  const delBtn = document.getElementById('re_delete');
  if(delBtn){
    delBtn.addEventListener('click', ()=>{
      if(!confirm(`Delete revolutions entry for ${iso}?`)) return;
      const next = rows.filter(r=>r.date!==iso);
      saveRevs(next); afterRevs(next); document.getElementById('modal').hidden = true; toast('Deleted');
    });
  }
}

/* ------------------ charts with tooltips ------------------ */
let wakeRange = +(localStorage.getItem(WRANGE_KEY)||7);
let wakeSmooth= +(localStorage.getItem(WSMOOTH_KEY)||1);
function bindWakeChartControls(){
  const smooth=$('#smooth'); if(smooth){ smooth.value=String(wakeSmooth); smooth.addEventListener('change',()=>{ wakeSmooth=+smooth.value; localStorage.setItem(WSMOOTH_KEY,String(wakeSmooth)); drawWakeChart(); }); }
  $$('.rangeBtn').forEach(b=> b.addEventListener('click',()=>{ wakeRange=+b.getAttribute('data-range'); localStorage.setItem(WRANGE_KEY,String(wakeRange)); drawWakeChart(); }));
}
let revsRangeMem = +(localStorage.getItem(RRANGE_KEY)||7);
let revsSmoothMem= +(localStorage.getItem(RSMOOTH_KEY)||1);
function bindRevsChartControls(){
  const rs=$('#revsSmooth'); if(rs){ rs.value=String(revsSmoothMem); rs.addEventListener('change',()=>{ revsSmoothMem=+rs.value; localStorage.setItem(RSMOOTH_KEY,String(revsSmoothMem)); drawRevsChart(); }); }
  $$('.revsRangeBtn').forEach(b=> b.addEventListener('click',()=>{ revsRangeMem=+b.getAttribute('data-range'); localStorage.setItem(RRANGE_KEY,String(revsRangeMem)); drawRevsChart(); }));
}

function drawWakeChart(){
  const rows=loadWake().filter(r=>r.wake);
  const cv=$('#chart'); if(!cv) return;
  const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const end=new Date(); const start=new Date(end); start.setDate(end.getDate()-wakeRange+1);
  const raw=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,m:toMin(r.wake)})).sort((a,b)=>a.d.localeCompare(b.d));
  const data = raw.map(x=>({d:x.d,v:x.m<900?x.m+1440:x.m})); // unwrap around midnight
  const padL=50,padR=10,padT=12,padB=34;
  // axes
  cx.strokeStyle=getCSS('--line'); cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  cx.fillStyle=getCSS('--muted'); cx.textAlign='left'; cx.fillText("Time (HH:MM)", padL, H-10);
  // y grid (18:00, 21:00, 00:00, 03:00)
  const min=900, max=1800; // 15:00–30:00 (wrapped)
  const x=i => padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const y=val => padT + (1-((val-900)/(1800-900)))*(H-padT-padB);
  cx.textAlign='right'; cx.textBaseline='middle';
  [18*60,21*60,0,3*60].forEach(t=>{ const base=t<900?t+1440:t; const yv=y(base); cx.fillText(fromMin(t%1440), padL-6, yv); cx.beginPath(); cx.moveTo(padL,yv); cx.lineTo(W-padR,yv); cx.strokeStyle=getCSS('--line'); cx.stroke(); });
  if(!data.length) return;

  // smoothing
  const sm = movingAvg(data.map(d=>d.v), wakeSmooth);

  // line
  cx.strokeStyle=getCSS('--acc'); cx.lineWidth=2; cx.beginPath();
  sm.forEach((v,i)=>{ const xv=x(i), yv=y(v); if(i) cx.lineTo(xv,yv); else cx.moveTo(xv,yv); });
  cx.stroke();

  // x labels
  const ticks=[]; const step=Math.max(1, Math.floor(data.length/6));
  for(let i=0;i<data.length;i+=step){ const d=new Date(data[i].d+'T00:00:00'); ticks.push({i,text:d.toLocaleDateString(undefined,{day:'2-digit',month:'short'})}); }
  cx.textAlign='center'; cx.textBaseline='top'; cx.fillStyle=getCSS('--muted');
  ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));

  // points (for hit tests)
  const pts = data.map((p,i)=>({ x:x(i), y:y(p.v), d:p.d, raw:raw[i]}));
  cx.fillStyle=getCSS('--acc'); pts.forEach(p=>{ cx.beginPath(); cx.arc(p.x,p.y,2.5,0,Math.PI*2); cx.fill(); });

  // interactions
  function pos(e){ const r=cv.getBoundingClientRect(); const p=(e.touches&&e.touches[0])||e; return {x:p.clientX - r.left, y:p.clientY - r.top}; }
  function nearest(pt){ let best=null, bd=1e9; for(const p of pts){ const dx=pt.x-p.x, dy=pt.y-p.y, dd=dx*dx+dy*dy; if(dd<bd){ bd=dd; best=p; } } return (bd<=18*18)?best:null; }
  function tipHTML(p){ const time = fromMin(p.raw.m%1440); return `<b>${p.d}</b><br/>Wake: ${time}`; }
  function onMove(e){ const p=pos(e), n=nearest(p); if(n){ showTip((e.touches?e.touches[0].clientX:e.clientX),(e.touches?e.touches[0].clientY:e.clientY), tipHTML(n)); } else { hideTip(); } }
  cv.onmousemove = onMove; cv.ontouchstart = onMove; cv.ontouchmove = onMove; cv.onmouseleave = hideTip; cv.ontouchend = hideTip;
}

function drawRevsChart(){
  const rows=loadRevs().filter(r=>r.revs);
  const cv=$('#revsChart'); if(!cv) return;
  const {W,H,dpr}=setupCanvas(cv,260), cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0); cx.clearRect(0,0,W,H);
  const end=new Date(); const start=new Date(end); start.setDate(end.getDate()-revsRangeMem+1);
  const unit=localStorage.getItem(UNIT_KEY)||'km', mult=UNIT_MULT[unit];
  const data=rows.filter(r=>r.date>=ymd(start)).map(r=>({d:r.date,v:+r.revs*mult})).sort((a,b)=>a.d.localeCompare(b.d));
  const padL=50,padR=10,padT=12,padB=34;
  // axes
  cx.strokeStyle=getCSS('--line'); cx.lineWidth=1; cx.beginPath(); cx.moveTo(padL,padT); cx.lineTo(padL,H-padB); cx.lineTo(W-padR,H-padB); cx.stroke();
  cx.fillStyle=getCSS('--muted'); cx.textAlign='left'; cx.fillText(`Distance (${unit})`, padL, H-10);
  if(!data.length) return;

  const vals=data.map(d=>d.v);
  const yMin=Math.max(0, Math.floor(Math.min(...vals)*100)/100);
  const yMax=Math.max(0.01, Math.ceil(Math.max(...vals)*100)/100);

  const sm = movingAvg(vals, revsSmoothMem);
  const x=i => padL + (i/(Math.max(1,data.length-1)))*(W-padL-padR);
  const y=v => padT + (1-((v-yMin)/(yMax-yMin||1)))*(H-padT-padB);

  // horizontal grid
  cx.textAlign='right'; cx.textBaseline='middle'; cx.fillStyle=getCSS('--muted');
  for(let i=0;i<=4;i++){ const t=i/4; const yv=padT+(1-t)*(H-padT-padB); const v=(yMin + t*(yMax-yMin)); cx.fillText(String(v.toFixed(2)), padL-6, yv); cx.beginPath(); cx.moveTo(padL,yv); cx.lineTo(W-padR,yv); cx.strokeStyle=getCSS('--line'); cx.stroke(); }

  // line
  cx.strokeStyle=getCSS('--acc'); cx.lineWidth=2; cx.beginPath();
  sm.forEach((v,i)=>{ const xv=x(i), yv=y(v); if(i) cx.lineTo(xv,yv); else cx.moveTo(xv,yv); });
  cx.stroke();

  // x labels
  const ticks=[]; const step=Math.max(1, Math.floor(data.length/6));
  for(let i=0;i<data.length;i+=step){ const d=new Date(data[i].d+'T00:00:00'); ticks.push({i,text:d.toLocaleDateString(undefined,{day:'2-digit',month:'short'})}); }
  cx.textAlign='center'; cx.textBaseline='top'; cx.fillStyle=getCSS('--muted'); ticks.forEach(t=> cx.fillText(t.text, x(t.i), H-padB+6));

  // points for hit test
  const pts = data.map((p,i)=>({ x:x(i), y:y(sm[i]), d:p.d, dist:p.v }));
  cx.fillStyle=getCSS('--acc'); pts.forEach(p=>{ cx.beginPath(); cx.arc(p.x,p.y,2.5,0,Math.PI*2); cx.fill(); });

  // interactions
  function pos(e){ const r=cv.getBoundingClientRect(); const p=(e.touches&&e.touches[0])||e; return {x:p.clientX - r.left, y:p.clientY - r.top}; }
  function nearest(pt){ let best=null, bd=1e9; for(const p of pts){ const dx=pt.x-p.x, dy=pt.y-p.y, dd=dx*dx+dy*dy; if(dd<bd){ bd=dd; best=p; } } return (bd<=18*18)?best:null; }
  function tipHTML(p){ return `<b>${p.d}</b><br/>Distance: ${p.dist.toFixed(2)} ${unit}`; }
  function onMove(e){ const p=pos(e), n=nearest(p); if(n){ showTip((e.touches?e.touches[0].clientX:e.clientX),(e.touches?e.touches[0].clientY:e.clientY), tipHTML(n)); } else { hideTip(); } }
  cv.onmousemove = onMove; cv.ontouchstart = onMove; cv.ontouchmove = onMove; cv.onmouseleave = hideTip; cv.ontouchend = hideTip;
}

/* ------------------ after save ------------------ */
function afterWake(rows){ renderWakeToday(rows); renderWakeStats(rows); renderWakeTable(rows); renderWakeCalendar(); drawWakeChart(); renderDash(); }
function afterRevs(rows){ renderRevsToday(rows); renderRevsStats(rows); renderRevsTable(rows); renderRevsCalendar(); drawRevsChart(); renderDash(); }

/* ------------------ search inputs (auto-add) ------- */
function ensureSearchInput(panelSel, inputIdSel, onInput){
  const panel=$(panelSel); if(!panel) return;
  let inp=$(inputIdSel);
  if(!inp){
    const h = panel.querySelector('h3') || panel.querySelector('table') || panel.firstChild;
    const wrap=document.createElement('div'); wrap.className='row mt'; wrap.style.justifyContent='flex-end';
    inp=document.createElement('input'); inp.className='search'; inp.id=inputIdSel.replace('#',''); inp.placeholder='Search…';
    wrap.appendChild(inp);
    if(h && h.parentNode) h.parentNode.insertBefore(wrap, h.nextSibling);
  }
  if(inp && onInput){ inp.oninput=()=> onInput(inp.value); }
}

/* ------------------ JSON Export/Import -------------- */
(function bindJson(){
  const exportJson = $('#exportJson');
  if (exportJson) exportJson.onclick = () => {
    const blob = new Blob([JSON.stringify({ wake: loadWake(), revs: loadRevs() }, null, 2)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='gidget_data_v26.json'; a.click();
  };
  const importJson = $('#importJson');
  if (importJson) importJson.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try{
      const data = JSON.parse(await f.text()) || {};
      const R = Array.isArray(data.revs) ? data.revs : (Array.isArray(data.steps) ? data.steps.map(x=>({date:x.date,revs:x.steps,notes:x.notes})) : []);
      const W = Array.isArray(data.wake)? data.wake : [];
      const rMap = new Map(loadRevs().map(r=>[r.date,r])); R.forEach(r=>rMap.set(r.date, r));
      const wMap = new Map(loadWake().map(r=>[r.date,r])); W.forEach(r=>wMap.set(r.date, r));
      const rRows = Array.from(rMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
      const wRows = Array.from(wMap.values()).sort((a,b)=>a.date.localeCompare(b.date));
      saveRevs(rRows); saveWake(wRows); afterRevs(rRows); afterWake(wRows);
      toast('Imported JSON and merged');
    }catch{ toast('Import failed: bad JSON'); }
  });
})();

/* ------------------ CSV Export/Import -------------- */
(function bindCsv(){
  const exportBtn=$('#exportCsv');
  if(exportBtn) exportBtn.onclick=()=>{ 
    const wake=loadWake(), revs=loadRevs();
    const header='Type,Date,Wake-Up Time,Weight (g),Mood,Notes,Revolutions\n';
    const lines=[
      ...wake.map(r=>['wake',r.date,r.wake||'',r.weight||'',r.mood||'',JSON.stringify(r.notes||'').slice(1,-1),''].join(',')),
      ...revs.map(s=>['revs',s.date,'','','',JSON.stringify(s.notes||'').slice(1,-1),s.revs||''].join(','))
    ];
    const blob=new Blob([header+lines.join('\n')],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gidget_data.csv'; a.click();
  };
  const importEl=$('#importCsv');
  if(importEl) importEl.addEventListener('change',(e)=>{
    const f=e.target.files[0]; if(!f) return;
    f.text().then((text)=>{
      const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(',');
      const idxType=header.indexOf('Type'); const W=[],R=[];
      lines.forEach(ln=>{
        const p=ln.split(',');
        const type=(idxType>=0?p[idxType]:'wake');
        if(type==='revs' || type==='steps'){ R.push({date:p[1],revs:(type==='steps'?p[6]:p[6])||'',notes:p[5]||''}); }
        else { W.push({date:p[1],wake:p[2]||'',weight:p[3]||'',mood:p[4]||'',notes:p[5]||''}); }
      });
      saveWake(W); saveRevs(R); afterWake(W); afterRevs(R);
      toast('Imported CSV');
    });
  });
})();

/* ------------------ Online/offline + SW ------------- */
function updateDot(){ const d=document.querySelector('.status-dot'); if(!d) return; d.classList.toggle('off', !navigator.onLine); }
window.addEventListener('online', updateDot);
window.addEventListener('offline', updateDot);
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

/* ------------------ FAB + Install banner ------------- */
function ensureFab(){
  if($('#fab')) return;
  const b=document.createElement('button'); b.id='fab'; b.className='fab'; b.title='Add entry'; b.textContent='+';
  b.onclick=()=>{ const tab=$$('#tabs .tab').find(t=>t.classList.contains('active')); const id=tab?tab.getAttribute('data-tab'):'revs-log';
    if(id==='revs-log'){ activateTab('revs-log'); const d=$('#revsDate'); if(d) d.focus(); }
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

/* ------------------ Month pickers / nav ------------- */
function bindMonthPickers(){
  monthPicker('#calTitle',       '#monthPicker',      ()=>calRef,      (d)=>{calRef=d; renderWakeCalendar();});
  monthPicker('#revsCalTitle',   '#revsMonthPicker',  ()=>revsCalRef,  (d)=>{revsCalRef=d; renderRevsCalendar();});

  const prev=$('#prevMonth'), next=$('#nextMonth'), today=$('#todayMonth');
  prev && (prev.onclick = ()=>{ calRef.setMonth(calRef.getMonth()-1); renderWakeCalendar(); });
  next && (next.onclick = ()=>{ calRef.setMonth(calRef.getMonth()+1); renderWakeCalendar(); });
  today&& (today.onclick= ()=>{ calRef=new Date(); renderWakeCalendar(); });

  const rprev=$('#revsPrevMonth'), rnext=$('#revsNextMonth'), rtoday=$('#revsTodayMonth');
  rprev && (rprev.onclick = ()=>{ revsCalRef.setMonth(revsCalRef.getMonth()-1); renderRevsCalendar(); });
  rnext && (rnext.onclick = ()=>{ revsCalRef.setMonth(revsCalRef.getMonth()+1); renderRevsCalendar(); });
  rtoday&& (rtoday.onclick= ()=>{ revsCalRef=new Date(); renderRevsCalendar(); });
}

/* ------------------ Boot ---------------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme(); initUnits();
  bindHeaderHide(); bindTabs(); bindMonthPickers(); bindCalendarClicks(); bindWakeChartControls(); bindRevsChartControls();
  initWakeForm(); initRevsForm();

  afterWake(loadWake());
  afterRevs(loadRevs());
  renderDash();

  ensureSearchInput('#panel-entries',       '#wakeSearch',  ()=>renderWakeTable(loadWake()));
  ensureSearchInput('#panel-revs-entries',  '#revsSearch',  ()=>renderRevsTable(loadRevs()));

  ensureFab(); showInstallBannerOnce(); updateDot(); registerSW();

  const inst=$('#installInfo'); if(inst) inst.onclick=()=>alert('On iPhone: open in Safari → Share → Add to Home Screen.\nOn Android: Chrome menu → Add to Home screen.');

  // Ensure charts render at least once
  drawWakeChart();
  drawRevsChart();
});