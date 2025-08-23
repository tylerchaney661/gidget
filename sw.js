/Users/tyler/gidget-site/index.html

<script>
/* TABS (robust delegated handler) */
document.addEventListener('DOMContentLoaded', ()=>{
  const tabsBar = document.querySelector('.tabs');
  if(!tabsBar) return;
  tabsBar.addEventListener('click', (ev)=>{
    const tab = ev.target.closest('.tab');
    if(!tab || !tabsBar.contains(tab)) return;

    // set active tab
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');

    // swap panels
    const id = tab.getAttribute('data-tab');
    document.querySelectorAll('.tabpanel').forEach(p=> p.hidden = true);
    const panel = document.getElementById('panel-'+id);
    if(panel){
      panel.hidden = false;
      panel.classList.add('anim-in');
      panel.addEventListener('animationend', ()=> panel.classList.remove('anim-in'), {once:true});
    }

    // lazy renders
    try{
      if(id==='trends') drawChart();
      if(id==='calendar') renderCalendar();
      if(id==='entries') renderTable(load());
      if(id==='steps-trends') drawStepsChart();
      if(id==='steps-calendar') renderStepsCalendar();
      if(id==='steps-entries') renderStepsTable(loadSteps());
    }catch(e){ /* ignore to avoid breaking tab clicks */ }
  });
});
</script>