const LKEY='p800_v6',UKEY='p800_users_v6',SKEY='p800_session_v6';
const DEF_BUDGET=12000000;
// 23-month plan: Aug 2026 → Jun 2028
const NMONTHS=11;
const MNAMES=["Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
const MYEARS=[2026,2026,2026,2026,2026,2027,2027,2027,2027,2027,2027];
const MABBR= ["A","S","O","N","D","J","F","M","A","M","J"];
const MLABEL=i=>MNAMES[i]+' '+MYEARS[i]; // e.g. "Aug 2026"
const COLORS=['#1E3A8A','#0B7A53','#FFC352','#E9695F','#F17833','#7C3AED','#0891B2','#DB2777','#2d4fa8','#15803d','#b45309','#0f766e'];

const DEFAULT_LOVS={
  owners:['Ranjith','Arathi','Deepthi','Gopal','Nikhita','Vinodh','TBD'],
  exec:['Zamstars','Tatva','Zamstars + Tatva'],
  types:['Digital','Offline','Media','School Activity','School Event','Partner'],
  channels:['Adbeets','Banners','Cinemas','Community','Corporate Offices','Dhobhis','Digital','Email','Email + WhatsApp','Facebook','Google Ads','Hoardings','Instagram','Jioads','LinkedIn','Meta(FB+Insta)','Milk Vendors','Multi-channel','Other Schools','Paid Collaboration','Platform Ads','Preschools','Print','Radio','Reddit','Research','Residential Societies','SMS','School','Schools Portal','TOI','Tatva Website','Transit Media','Website','WhatsApp/WATI','YouTube/Social'],
  mainBuckets:['Paid Digital','Organic Digital','Organic Social','Organic / Paid Digital','Content Marketing','PR & Media','OOH Campaigns','Offline Activation','Community Outreach','Direct Outreach','Events & Fests','Holiday Campaigns','Influencer','Digital + Community']
};

// Users are managed via Supabase Auth + profiles table (see supabase/migrations/001_schema.sql)

let RAW=[];  // Loaded from Supabase on init

let S=null,CURRENT_USER=null;
let sortCol='no',sortDir=1,CHARTS={},modalSaveCallback=null,activeOwner='',activeCalMonth=0;
let activeBMMode='month',activeDashTab='overview',bmTaskId=null;

// ── PERMISSIONS ────────────────────────────────────
const ROLE_PERMS={
  admin:['editActivity','editBudget','addActivity','deleteActivity','manageLovs','manageUsers','viewAll','admin'],
  master:['editActivity','editBudget','addActivity','viewAll'],
  editor:['editActivity','viewAll']
};
function can(p){ return CURRENT_USER?(ROLE_PERMS[CURRENT_USER.role]||[]).includes(p):false; }

// ── USERS ──────────────────────────────────────────
function getUsers(){ return S?.users||[]; }

// ── AUTH ───────────────────────────────────────────
async function doLogin(){
  const email=(document.getElementById('l-email').value||'').trim().toLowerCase();
  const pass=document.getElementById('l-password').value||'';
  const err=document.getElementById('l-error');
  const contact=document.getElementById('login-contact');
  const btn=document.getElementById('btn-login');
  contact.classList.add('hidden');
  if(!email||!pass){err.textContent='Please enter your email and password.';return;}
  btn.disabled=true; btn.textContent='Signing in…';
  try{
    const {data,error}=await window._sb.auth.signInWithPassword({email,password:pass});
    if(error){
      err.textContent=error.message==='Invalid login credentials'?'Incorrect email or password.':error.message;
      contact.classList.remove('hidden');
      btn.disabled=false; btn.textContent='Sign In';
      return;
    }
    const {data:profile}=await window._sb.from('profiles').select('*').eq('id',data.user.id).single();
    if(!profile){err.textContent='Account exists but has no profile. Contact admin.';btn.disabled=false;btn.textContent='Sign In';return;}
    CURRENT_USER={...profile,email:data.user.email,id:data.user.id};
    err.textContent=''; contact.classList.add('hidden');
    btn.disabled=false; btn.textContent='Sign In';
    showApp();
  }catch(e){
    err.textContent='Login failed: '+e.message;
    btn.disabled=false; btn.textContent='Sign In';
  }
}
async function doLogout(){
  CURRENT_USER=null;
  await window._sb.auth.signOut();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('app-footer').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-email').value='';
  document.getElementById('l-password').value='';
  document.getElementById('l-error').textContent='';
}
function openChangePasswordModal(){
  if(!CURRENT_USER?.email){showToast('Not signed in','err');return;}
  document.getElementById('modal-title').textContent='Change Password';
  document.getElementById('modal-tabs').classList.add('hidden');
  const saveBtn=document.getElementById('modal-save-btn');
  saveBtn.classList.remove('hidden');
  saveBtn.textContent='Update Password';
  document.getElementById('modal-body').innerHTML=`<div class="crm-overview-grid">
    <div class="field-wrap req" style="grid-column:1/-1"><label>Current password</label><input id="pw-current" type="password" autocomplete="current-password"></div>
    <div class="field-wrap req"><label>New password</label><input id="pw-new" type="password" autocomplete="new-password"></div>
    <div class="field-wrap req"><label>Confirm new password</label><input id="pw-confirm" type="password" autocomplete="new-password"></div>
  </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  modalSaveCallback=async()=>{
    const current=document.getElementById('pw-current').value;
    const next=document.getElementById('pw-new').value;
    const confirm=document.getElementById('pw-confirm').value;
    if(!current||!next||!confirm){showToast('All fields required','err');return;}
    if(next.length<6){showToast('New password must be at least 6 characters','err');return;}
    if(next!==confirm){showToast('New passwords do not match','err');return;}
    if(next===current){showToast('New password must be different','err');return;}
    const {error:authErr}=await window._sb.auth.signInWithPassword({email:CURRENT_USER.email,password:current});
    if(authErr){showToast('Current password is incorrect','err');return;}
    const {error}=await window._sb.auth.updateUser({password:next});
    if(error){showToast(error.message,'err');return;}
    closeModal();showToast('Password updated','ok');
  };
}
async function checkSession(){
  try{
    const {data:{session}}=await window._sb.auth.getSession();
    if(!session) return false;
    const {data:profile}=await window._sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(!profile) return false;
    CURRENT_USER={...profile,email:session.user.email,id:session.user.id};
    return true;
  }catch(e){return false;}
}
function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app-footer').classList.remove('hidden');
  applyPermissions(); init();
}
function applyPermissions(){
  const r=CURRENT_USER?.role||'editor';
  document.getElementById('u-name').textContent=CURRENT_USER?.name||'';
  const roleEl=document.getElementById('u-role');
  roleEl.textContent=r.charAt(0).toUpperCase()+r.slice(1);
  roleEl.className='u-role ur-'+r;
  const hasBudget=can('editBudget');
  document.getElementById('master-budget-input').disabled=!hasBudget;
  document.getElementById('btn-redist').disabled=!hasBudget;
  document.getElementById('btn-add-act').classList.toggle('hidden',!can('addActivity'));
  if(!can('manageLovs')&&!can('manageUsers')) document.getElementById('nav-settings').classList.add('hidden');
}

// ── STATE ──────────────────────────────────────────
async function init(){
  document.getElementById('save-badge').textContent='⏳ Loading…';
  try{
    const [{data:acts,error:aErr},{data:settings},{data:profiles}]=await Promise.all([
      window._sb.from('activities').select('*,sub_tasks(*),moms(*),assets(*)').order('no'),
      window._sb.from('app_settings').select('*'),
      window._sb.from('profiles').select('*')
    ]);
    if(aErr) throw aErr;

    function settVal(key,def){ const s=settings?.find(x=>x.key===key); return s?s.value?.value??s.value:def; }
    const lovsSetting=settings?.find(x=>x.key==='lovs');

    S={
      masterBudget: settVal('master_budget',12000000),
      admissions:   settVal('admissions',0),
      targetAdmissions: settVal('target_admissions',800),
      lovs: lovsSetting?.value||JSON.parse(JSON.stringify(DEFAULT_LOVS)),
      activities: (acts||[]).map(a=>({
        id:a.id, no:a.no, name:a.name, details:a.details||'',
        need:a.need, type:a.type, channel:a.channel||'', paid:a.paid,
        mainBucket:a.main_bucket||'', subBucket:a.sub_bucket||'',
        exec:a.exec, owner:a.owner,
        lastSpend:a.last_spend||0, budget:a.budget||0, notes:a.notes||'',
        months:a.months||Array(NMONTHS).fill(0),
        monthBudget:a.month_budget||{}, monthSpent:a.month_spent||{}, remarks:a.remarks||{},
        status:a.status, lastYr:a.last_yr||false,
        stage:a.stage||'Planning',
        driveDocId:a.drive_doc_id||'', driveDocUrl:a.drive_doc_url||'',
        nextSubTaskId:a.next_sub_task_id||1,
        nextMOMId:a.next_mom_id||1,
        nextAssetId:a.next_asset_id||1,
        subTasks:(a.sub_tasks||[]).map(t=>({id:t.local_id,title:t.title,desc:t.description||'',owner:t.owner||'',dueDate:t.due_date||'',status:t.status||'To Do',budget:t.budget||0,spent:t.spent||0})),
        moms:(a.moms||[]).map(m=>({id:m.local_id,date:m.date,attendees:m.attendees||'',discussion:m.discussion||'',actionItems:m.action_items||'',owner:m.owner||'',deadline:m.deadline||''})),
        assets:(a.assets||[]).map(as=>({id:as.local_id,name:as.name||'',url:as.url||'',type:as.type||'',addedDate:as.added_date||''}))
      })),
      nextId: Math.max(...(acts||[]).map(a=>a.id),999)+1,
      monthOutcomes:{},
      users: mapProfiles(profiles)
    };

    // ── Trim monthOutcomes to valid indices
    if(S.monthOutcomes){
      const f={};Object.entries(S.monthOutcomes).forEach(([k,v])=>{if(parseInt(k)<NMONTHS)f[k]=v;});S.monthOutcomes=f;
    }
  }catch(e){
    console.error('Supabase load error:',e);
    showToast('Error loading data: '+e.message,'err');
    S={masterBudget:12000000,admissions:0,targetAdmissions:800,lovs:JSON.parse(JSON.stringify(DEFAULT_LOVS)),activities:[],nextId:1000,monthOutcomes:{},users:[]};
  }

  document.getElementById('master-budget-input').value=fmtBare(S.masterBudget);
  activeOwner='All'; activeCalMonth=0;
  initCalMonthSel();
  updateBudgetBar(); populateFilters(); renderTable();
}
let _saveDebounce=null;
function saveState(){
  const b=document.getElementById('save-badge');
  b.textContent='💾 Saving…';
  clearTimeout(_saveDebounce);
  _saveDebounce=setTimeout(async()=>{
    try{
      // Save all activities
      const actRows=S.activities.map(a=>({
        id:a.id, no:a.no, name:a.name, details:a.details||'',
        need:a.need, type:a.type, channel:a.channel||'', paid:a.paid,
        main_bucket:a.mainBucket||'', sub_bucket:a.subBucket||'',
        exec:a.exec, owner:a.owner,
        last_spend:a.lastSpend||0, budget:a.budget||0, notes:a.notes||'',
        months:a.months||Array(NMONTHS).fill(0),
        month_budget:a.monthBudget||{}, month_spent:a.monthSpent||{}, remarks:a.remarks||{},
        status:a.status, last_yr:a.lastYr||false, stage:a.stage||'Planning',
        drive_doc_id:a.driveDocId||'', drive_doc_url:a.driveDocUrl||'',
        next_sub_task_id:a.nextSubTaskId||1,
        next_mom_id:a.nextMOMId||1, next_asset_id:a.nextAssetId||1
      }));
      const {error:aErr}=await window._sb.from('activities').upsert(actRows,{onConflict:'no'});
      if(aErr) throw aErr;

      // Save sub-tasks, moms, assets per activity
      for(const a of S.activities){
        if(a.subTasks?.length){
          await window._sb.from('sub_tasks').upsert(
            a.subTasks.map(t=>({activity_id:a.id,local_id:t.id,title:t.title,description:t.desc||'',owner:t.owner||'',due_date:t.dueDate||null,status:t.status||'To Do',budget:t.budget||0,spent:t.spent||0})),
            {onConflict:'activity_id,local_id'}
          );
        }
        if(a.moms?.length){
          await window._sb.from('moms').upsert(
            a.moms.map(m=>({activity_id:a.id,local_id:m.id,date:m.date,attendees:m.attendees||'',discussion:m.discussion||'',action_items:m.actionItems||'',owner:m.owner||'',deadline:m.deadline||null})),
            {onConflict:'activity_id,local_id'}
          );
        }
        if(a.assets?.length){
          await window._sb.from('assets').upsert(
            a.assets.map(as=>({activity_id:a.id,local_id:as.id,name:as.name||'',url:as.url||'',type:as.type||'',added_date:as.addedDate||null})),
            {onConflict:'activity_id,local_id'}
          );
        }
      }

      // Save settings
      await window._sb.from('app_settings').upsert([
        {key:'master_budget',value:{value:S.masterBudget}},
        {key:'admissions',value:{value:S.admissions}},
        {key:'lovs',value:S.lovs}
      ],{onConflict:'key'});

      b.textContent='✔ Saved '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      setTimeout(()=>b.textContent='● Cloud sync',3000);
    }catch(e){
      console.error('Save error:',e);
      b.textContent='⚠ Save failed – '+e.message.substring(0,40);
      showToast('Save error: '+e.message,'err');
    }
  },700);
}

// ── UTILS ──────────────────────────────────────────
function fmt(n){
  if(n>=10000000) return '₹'+(n/10000000).toFixed(2).replace(/\.?0+$/,'')+'Cr';
  if(n>=100000) return '₹'+(n/100000).toFixed(1).replace(/\.?0+$/,'')+'L';
  if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K';
  return '₹'+n;
}
function fmtBare(n){ return Number(n||0).toLocaleString('en-IN'); }
function parseBudget(v){
  v=String(v).replace(/[₹, ]/g,'').trim();
  if(/cr$/i.test(v)) return Math.round(parseFloat(v)*1e7);
  if(/l$/i.test(v)) return Math.round(parseFloat(v)*1e5);
  if(/k$/i.test(v)) return Math.round(parseFloat(v)*1e3);
  return parseInt(v)||0;
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escQ(s){ return String(s||'').replace(/"/g,'&quot;'); }
function showToast(msg,type){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=(type==='err'?'err':type==='ok'?'ok':'')+' show';
  setTimeout(()=>t.className='',2600);
}
function updateBudgetBar(){
  const total=S.activities.reduce((s,a)=>s+(a.budget||0),0);
  const active=S.activities.filter(a=>a.status==='Active').length;
  document.getElementById('stat-alloc').textContent=fmt(total);
  document.getElementById('stat-rem').textContent=fmt(Math.max(0,S.masterBudget-total));
  document.getElementById('stat-acts').textContent=S.activities.length;
  document.getElementById('stat-active').textContent=active;
}
function redistributeBudget(){
  if(!can('editBudget')){showToast('Budget editing requires Master or Admin access','err');return;}
  const newB=parseBudget(document.getElementById('master-budget-input').value);
  if(!newB||newB<100000){showToast('Enter a valid budget','err');return;}
  const oldB=S.masterBudget; S.masterBudget=newB;
  if(oldB>0) S.activities.forEach(a=>{a.budget=Math.round((a.budget/oldB)*newB/1000)*1000;});
  saveState();updateBudgetBar();renderTable();showToast('Redistributed to '+fmt(newB),'ok');
}

// ── PANELS ─────────────────────────────────────────
function switchPanel(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='dashboard') setTimeout(renderDashboard,60);
  if(id==='budget') renderBudget();
  if(id==='calview') renderCalView();
  if(id==='owners') renderOwnersView();
  if(id==='taskview') setTimeout(initTaskView,40);
  if(id==='budgetmgr') setTimeout(initBudgetMgr,40);
  if(id==='settings') renderSettings();
}

// ── FILTERS ────────────────────────────────────────
function populateFilters(){
  function pop(id,arr){ const s=document.getElementById(id);const c=s.value;while(s.options.length>1)s.remove(1);arr.forEach(v=>s.add(new Option(v,v)));if(c)s.value=c; }
  pop('f-owner',S.lovs.owners); pop('f-type',S.lovs.types); pop('f-bucket',S.lovs.mainBuckets);
}
function clearFilters(){
  ['f-search','f-owner','f-type','f-bucket','f-status','f-need'].forEach(id=>{ const el=document.getElementById(id);if(el)el.value=''; });
  renderTable();
}
function clickSort(col){
  if(sortCol===col)sortDir*=-1;else{sortCol=col;sortDir=1;}
  document.querySelectorAll('th.sortable').forEach(th=>{th.classList.remove('sorted');const si=th.querySelector('.sort-icon');if(si)si.textContent='↕';});
  event.currentTarget.classList.add('sorted');
  const si=event.currentTarget.querySelector('.sort-icon');if(si)si.textContent=sortDir>0?'↑':'↓';
  renderTable();
}
function getFiltered(){
  const q=(document.getElementById('f-search').value||'').toLowerCase();
  const fO=document.getElementById('f-owner').value,fT=document.getElementById('f-type').value;
  const fB=document.getElementById('f-bucket').value,fS=document.getElementById('f-status').value;
  const fN=document.getElementById('f-need').value;
  let list=S.activities.filter(a=>{
    if(q&&!(a.name||'').toLowerCase().includes(q)&&!(a.details||'').toLowerCase().includes(q)&&!(a.owner||'').toLowerCase().includes(q)) return false;
    if(fO&&a.owner!==fO) return false; if(fT&&a.type!==fT) return false;
    if(fB&&a.mainBucket!==fB) return false; if(fS&&a.status!==fS) return false;
    if(fN&&a.need!==fN) return false; return true;
  });
  list.sort((a,b)=>{ let va=a[sortCol]||'',vb=b[sortCol]||'';
    if(sortCol==='budget'||sortCol==='no'){va=+(va||0);vb=+(vb||0);}
    return va<vb?-sortDir:va>vb?sortDir:0; });
  return list;
}

// ── TABLE ──────────────────────────────────────────
function mkOpts(arr,cur){ return arr.map(v=>`<option value="${escQ(v)}"${v===cur?' selected':''}>${esc(v)}</option>`).join(''); }
function scls(s){ return {Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'}[s]||'s-planned'; }

function renderTable(){
  const list=getFiltered(),tb=document.getElementById('tbl-body');
  const ea=can('editActivity'),eb=can('editBudget'),da=can('deleteActivity');
  if(!list.length){tb.innerHTML='<tr><td colspan="13" class="no-rows">No activities match current filters.</td></tr>';document.getElementById('row-count').textContent='0 activities';return;}
  const la=!ea?'disabled':'',lb=!eb?'disabled':'';
  tb.innerHTML=list.map(a=>{
    const id=a.id;
    const months=(a.months||Array(NMONTHS).fill(0)).map((on,i)=>`<div class="m-cell${on?' on':''}${!ea?' locked':''}" title="${MNAMES[i]}"${ea?` onclick="toggleMonth(${id},${i})"`:''} >${MABBR[i]}</div>`).join('');
    return `<tr class="${a.status==='Done'?'done-row':''}">
      <td style="font:700 12px var(--fn);color:var(--mid)">${a.no}</td>
      <td class="act-name-cell" onclick="openDetailModal(${id})" title="Click to open activity detail">
        <div class="act-name-main" style="font:600 13px var(--fn)">${esc(a.name)}</div>
        ${a.driveDocUrl?`<div class="act-doc-badge">📄 Google Doc linked</div>`:''}
        ${a.details?`<div style="font-size:11px;color:var(--mid);margin-top:2px">${esc((a.details||'').substring(0,55))}${(a.details||'').length>55?'…':''}</div>`:''}
      </td>
      <td><select class="lov" onchange="upd(${id},'need',this.value)" ${la}>${mkOpts(['Must','Explore'],a.need)}</select></td>
      <td><select class="lov" onchange="upd(${id},'type',this.value)" ${la}>${mkOpts(S.lovs.types,a.type)}</select></td>
      <td><select class="lov" onchange="upd(${id},'channel',this.value)" ${la}>${mkOpts(S.lovs.channels,a.channel)}</select></td>
      <td><select class="lov" onchange="upd(${id},'paid',this.value)" ${la}>${mkOpts(['Paid','Organic'],a.paid)}</select></td>
      <td><select class="lov" onchange="upd(${id},'exec',this.value)" ${la}>${mkOpts(S.lovs.exec,a.exec)}</select></td>
      <td><select class="lov ov" onchange="upd(${id},'owner',this.value)" ${la}>${mkOpts(S.lovs.owners,a.owner)}</select></td>
      <td><input type="text" class="tbl-inp budget" value="${fmtBare(a.budget||0)}" onchange="updBudget(${id},this.value)" onblur="this.value=fmtBare((S.activities.find(x=>x.id===${id})||{}).budget||0)" ${lb}></td>
      <td><div class="m-grid">${months}</div></td>
      <td><select class="lov sv ${scls(a.status)}" onchange="updStatus(${id},this.value,this)" ${la}>${mkOpts(['Active','Planned','Done','Paused'],a.status)}</select></td>
      <td><input type="text" class="tbl-inp" value="${escQ(a.notes||'')}" placeholder="Notes…" onchange="upd(${id},'notes',this.value)" ${la}></td>
      <td style="white-space:nowrap">
        <button class="act-btn edit" title="Activity Detail" onclick="openDetailModal(${id})">📋</button>
        ${a.driveDocUrl?`<button class="act-btn edit" title="Open Google Doc" style="color:var(--g)" onclick="openDetailOnTab(${id},'drive')">📄</button>`:''}
        <button class="act-btn edit" title="Edit" onclick="openEditModal(${id})">✏️</button>
        ${da?`<button class="act-btn del" onclick="delAct(${id})">🗑</button>`:''}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('row-count').textContent=`Showing ${list.length} of ${S.activities.length} · ${fmt(list.reduce((s,a)=>s+(a.budget||0),0))}`;
  updateBudgetBar();
}

function upd(id,field,val){
  if(!can('editActivity')){showToast('No permission','err');return;}
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  a[field]=val;saveState();updateBudgetBar();
}
function updStatus(id,val,el){
  if(!can('editActivity')){showToast('No permission','err');return;}
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  a.status=val;el.className=`lov sv ${scls(val)}`;saveState();showToast('Status → '+val,'ok');
}
function updBudget(id,val){
  if(!can('editBudget')){showToast('Budget editing requires Master or Admin','err');return;}
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  a.budget=parseBudget(val);saveState();updateBudgetBar();showToast('Budget saved','ok');
}
function toggleMonth(id,idx){
  if(!can('editActivity'))return;
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  if(!a.months)a.months=Array(NMONTHS).fill(0);
  a.months[idx]=a.months[idx]?0:1;
  // remove monthBudget for deactivated month, keep for activated
  if(!a.months[idx]){ if(a.monthBudget) delete a.monthBudget[String(idx)]; }
  saveState();
  event.target.classList.toggle('on',!!a.months[idx]);
}
function delAct(id){
  if(!can('deleteActivity')){showToast('Only Admin can delete','err');return;}
  if(!confirm('Delete this activity?'))return;
  S.activities=S.activities.filter(x=>x.id!==id);saveState();renderTable();showToast('Deleted');
}

// ── CALENDAR VIEW ──────────────────────────────────
function initCalMonthSel(){
  // cv-month-sel removed — calendar now shows full grid; this is a no-op
}

function autoAllocateBudget(a){
  const actv=(a.months||[]).map((v,i)=>v?i:-1).filter(i=>i>=0);
  if(!actv.length) return;
  const per=Math.round(a.budget/actv.length/100)*100;
  if(!a.monthBudget) a.monthBudget={};
  actv.forEach(i=>{a.monthBudget[String(i)]=per;});
}
function autoAllocateAll(){
  if(!can('editBudget')){showToast('Requires Master or Admin','err');return;}
  S.activities.forEach(a=>autoAllocateBudget(a));
  saveState(); renderCalView();
  showToast('Budgets distributed equally across active months ✔','ok');
}

function renderCalView(){
  // Show grid, hide detail
  document.getElementById('cv-grid').style.display='';
  document.getElementById('cv-task-detail').style.display='none';
  document.getElementById('cv-task-detail').innerHTML='';

  const STATUS_DOT={Active:'mc-active',Done:'mc-done',Planned:'mc-planned',Paused:'mc-paused'};
  const STATUS_COLOR={Active:'#1E3A8A',Done:'#16a34a',Planned:'#f59e0b',Paused:'#f97316'};

  document.getElementById('cv-grid').innerHTML=MNAMES.map((mn,i)=>{
    const mi=String(i);
    const yr=MYEARS[i];
    const acts=S.activities.filter(a=>a.months&&a.months[i]);
    const planTotal=acts.reduce((s,a)=>s+((a.monthBudget||{})[mi]||0),0);
    const spentTotal=acts.reduce((s,a)=>s+((a.monthSpent||{})[mi]||0),0);
    const variance=planTotal-spentTotal;
    const pct=planTotal>0?Math.min(100,Math.round(spentTotal/planTotal*100)):0;
    const oc=S.monthOutcomes[mi]||{};
    const barClr=pct>=100?'var(--coral)':pct>=70?'var(--amber)':'var(--g)';

    // Status counts for mini legend
    const sc={Active:0,Done:0,Planned:0,Paused:0};
    acts.forEach(a=>{if(sc[a.status]!==undefined)sc[a.status]++;});

    // Up to 5 activity rows — stop propagation so card-click doesn't fire
    const shown=acts.slice(0,5);
    const more=acts.length-shown.length;
    const actRows=shown.map(a=>{
      const mPlan=(a.monthBudget||{})[mi]||0;
      return `<div class="cv-act-row" onclick="event.stopPropagation();openCalTask(${a.id},${i})" title="Open task detail">
        <span class="cv-act-dot" style="background:${STATUS_COLOR[a.status]||'#aaa'}"></span>
        <span class="cv-act-name" title="${esc(a.name)}">${esc(a.name)}</span>
        <span class="cv-act-budget">${mPlan?fmt(mPlan):'—'}</span>
        <span class="cv-act-arrow">›</span>
      </div>`;
    }).join('');

    const hasOc=oc.leads||oc.admissions||oc.visits;
    return `<div class="cv-month-card${acts.length?'':' cv-card-empty'}" onclick="openCalMonth(${i})" title="Click to view all ${acts.length} tasks in ${mn}">
      <div class="cv-mc-head">
        <div><div class="cv-mc-month">${mn}</div><div class="cv-mc-yr">${yr}</div></div>
        <div style="text-align:right">
          <div class="cv-mc-count">${acts.length}</div>
          <div class="cv-mc-count-lbl">tasks</div>
        </div>
      </div>
      ${planTotal?`<div class="cv-mc-bar-track"><div class="cv-mc-bar" style="width:${pct}%;background:${barClr}"></div></div>
      <div class="cv-mc-summary">
        <span>${fmt(planTotal)}</span>
        <span style="color:${variance>=0?'var(--g)':'var(--coral)'};font-weight:700">${variance>=0?'✓ ':'▲ '}${fmt(Math.abs(variance))}</span>
      </div>`:'<div style="height:4px"></div>'}
      <div class="cv-mc-acts" onclick="event.stopPropagation()">${actRows}
        ${more?`<div class="cv-act-more" onclick="event.stopPropagation();openCalMonth(${i})">+${more} more →</div>`:''}
        ${!acts.length?'<div class="cv-no-acts">No activities</div>':''}
      </div>
      <div class="cv-mc-open-hint" onclick="event.stopPropagation();openCalMonth(${i})">
        📋 View &amp; edit all tasks →
      </div>
      ${hasOc?`<div class="cv-mc-footer" onclick="event.stopPropagation()">
        <span>🎯 ${oc.leads||0} leads</span>
        <span class="cv-mc-oc-chip">✅ ${oc.admissions||0} adm</span>
        ${oc.visits?`<span>🏫 ${oc.visits}</span>`:''}
      </div>`:''}
    </div>`;
  }).join('');

}

// ── Open task detail from calendar card ─────────────
function openCalTask(aId,mi){
  document.getElementById('cv-grid').style.display='none';
  const detail=document.getElementById('cv-task-detail');
  detail.style.display='';
  renderCalTask(aId,mi);
}
function closeCalTask(){
  document.getElementById('cv-grid').style.display='';
  document.getElementById('cv-task-detail').style.display='none';
  document.getElementById('cv-task-detail').innerHTML='';
}

// ── Month detail view (click card header) ──────────
function openCalMonth(mi){
  document.getElementById('cv-grid').style.display='none';
  const detail=document.getElementById('cv-task-detail');
  detail.style.display='';
  renderCalMonth(mi);
}
function renderCalMonth(mi){
  const mis=String(mi);
  const mLabel=MLABEL(mi);
  const acts=S.activities.filter(a=>a.months&&a.months[mi]);
  const planTotal=acts.reduce((s,a)=>s+((a.monthBudget||{})[mis]||0),0);
  const spentTotal=acts.reduce((s,a)=>s+((a.monthSpent||{})[mis]||0),0);
  const variance=planTotal-spentTotal;
  const oc=S.monthOutcomes[mis]||{};
  const ea=can('editActivity'),eb=can('editBudget');
  const la=ea?'':'disabled',lb=eb?'':'disabled';
  const pct=planTotal>0?Math.min(100,Math.round(spentTotal/planTotal*100)):0;
  const barClr=pct>=100?'var(--coral)':pct>=70?'var(--amber)':'var(--g)';

  // Prev/next month nav
  const prevMi=mi>0?mi-1:null;
  const nextMi=mi<11?mi+1:null;
  const STATUS_COLOR={Active:'#1E3A8A',Done:'#16a34a',Planned:'#f59e0b',Paused:'#f97316'};
  const sClass={Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'};

  const actRows=acts.map(a=>{
    const mPlan=(a.monthBudget||{})[mis]||0;
    const mSpent=(a.monthSpent||{})[mis]||0;
    const mVar=mPlan-mSpent;
    const rem=escQ((a.remarks||{})[mis]||'');
    const vCls=mVar>=0?'var-pos':'var-neg';
    const rowPct=mPlan>0?Math.min(100,Math.round(mSpent/mPlan*100)):0;
    return `<tr>
      <td style="font:700 11px var(--fn);color:var(--mid)">${a.no}</td>
      <td>
        <div style="font:600 13px var(--fn);color:var(--dark)">${esc(a.name)}</div>
        <div style="font-size:10px;color:var(--mid)">${esc(a.type)} · ${esc(a.owner)}</div>
      </td>
      <td><span class="sv ${sClass[a.status]||'s-planned'}" style="font-size:10px;padding:2px 8px">${a.status}</span></td>
      <td style="text-align:right;color:var(--mid);font-size:12px">${fmt(a.budget||0)}</td>
      <td><input class="cv-bd-inp" type="number" style="width:100px;font-size:13px;padding:5px 8px"
          value="${mPlan||''}" placeholder="0" ${lb}
          onchange="saveCalPlan(${a.id},'${mis}',this.value);renderCalMonth(${mi})"></td>
      <td><input class="cv-bd-inp act" type="number" style="width:100px;font-size:13px;padding:5px 8px"
          value="${mSpent||''}" placeholder="0" ${la}
          onchange="saveCalSpent(${a.id},'${mis}',this.value);renderCalMonth(${mi})"></td>
      <td style="text-align:right">
        <span class="${vCls}" style="font-size:12px;font-weight:700">${mPlan||mSpent?(mVar>=0?'+':'')+fmt(Math.abs(mVar)):'—'}</span>
        ${mPlan?`<div style="height:4px;background:var(--bd);border-radius:2px;margin-top:3px;overflow:hidden;width:60px">
          <div style="height:100%;width:${rowPct}%;background:${mSpent>mPlan?'var(--coral)':'var(--g)'};border-radius:2px"></div></div>`:''}
      </td>
      <td><input type="text" style="width:100%;border:1.5px solid var(--bd);border-radius:7px;padding:5px 8px;font:400 11px var(--fn);outline:none"
          value="${rem}" placeholder="Remarks…" ${la}
          onchange="saveCalRemark(${a.id},'${mis}',this.value)"></td>
      <td><button class="btn-sm btn-ghost" style="padding:4px 10px;font-size:11px"
          onclick="openCalTask(${a.id},${mi})" title="Full task detail">🔍</button></td>
    </tr>`;
  }).join('');

  document.getElementById('cv-task-detail').innerHTML=`
    <!-- Nav bar -->
    <div class="cv-td-back">
      <button class="btn-sm" onclick="closeCalTask()">← All Months</button>
      <div class="cv-td-month-nav">
        ${prevMi!==null?`<button class="btn-sm" onclick="renderCalMonth(${prevMi})">◀ ${MNAMES[prevMi]}</button>`:'<span></span>'}
        <span class="cv-td-cur-month">📅 ${mLabel}</span>
        ${nextMi!==null?`<button class="btn-sm" onclick="renderCalMonth(${nextMi})">${MNAMES[nextMi]} ▶</button>`:'<span></span>'}
      </div>
    </div>

    <!-- Summary strip -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">
      <div class="cv-sbox"><div class="cv-sl">Activities</div><div class="cv-sv">${acts.length}</div><div class="cv-sub">${acts.filter(a=>a.status==='Active').length} active</div></div>
      <div class="cv-sbox amber"><div class="cv-sl">Month Plan</div><div class="cv-sv">${fmt(planTotal)}</div><div class="cv-sub">Allocated</div></div>
      <div class="cv-sbox teal"><div class="cv-sl">Actual Spent</div><div class="cv-sv">${fmt(spentTotal)}</div><div class="cv-sub">${pct}% used</div></div>
      <div class="cv-sbox ${variance>=0?'green':'coral'}"><div class="cv-sl">Variance</div><div class="cv-sv ${variance>=0?'var-pos':'var-neg'}">${variance>=0?'+':''}${fmt(Math.abs(variance))}</div><div class="cv-sub">${variance>=0?'Under':'Over'} budget</div></div>
      <div class="cv-sbox purple"><div class="cv-sl">🎯 Leads</div><div class="cv-sv">${oc.leads||0}</div><div class="cv-sub">${oc.visits||0} visits</div></div>
      <div class="cv-sbox green"><div class="cv-sl">✅ Admissions</div><div class="cv-sv">${oc.admissions||0}</div><div class="cv-sub">${oc.leads?((oc.admissions||0)/oc.leads*100).toFixed(0)+'% conv':'—'}</div></div>
    </div>

    <!-- Budget bar -->
    <div style="height:8px;background:var(--bd);border-radius:4px;margin-bottom:14px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${barClr};border-radius:4px;transition:width .4s"></div>
    </div>

    <!-- Month Outcomes -->
    <div class="card" style="margin-bottom:14px;border-top:4px solid var(--g)">
      <h3 style="font:700 14px var(--fh);color:var(--t);margin-bottom:12px">📊 ${mLabel} Outcomes</h3>
      <div class="cv-oc-grid">
        <div class="cv-oc-f"><label>💰 Total Spent ₹</label><input type="number" value="${oc.spent||''}" placeholder="0" ${la} onchange="saveCalOutcome('${mis}','spent',this.value)"></div>
        <div class="cv-oc-f"><label>🎯 Leads</label><input type="number" value="${oc.leads||''}" placeholder="0" ${la} onchange="saveCalOutcome('${mis}','leads',this.value)"></div>
        <div class="cv-oc-f"><label>🏫 School Visits</label><input type="number" value="${oc.visits||''}" placeholder="0" ${la} onchange="saveCalOutcome('${mis}','visits',this.value)"></div>
        <div class="cv-oc-f"><label>✅ Admissions</label><input type="number" value="${oc.admissions||''}" placeholder="0" ${la} onchange="saveCalOutcome('${mis}','admissions',this.value)"></div>
        <div class="cv-oc-f"><label>📡 Brand Reach</label><input type="number" value="${oc.reach||''}" placeholder="0" ${la} onchange="saveCalOutcome('${mis}','reach',this.value)"></div>
        <div class="cv-oc-f span2"><label>📝 Notes</label><textarea ${la} placeholder="Campaign results, brand visibility, feedback…" onchange="saveCalOutcome('${mis}','notes',this.value)">${oc.notes||''}</textarea></div>
      </div>
    </div>

    <!-- Activities table -->
    <div class="card" style="border-top:4px solid var(--t)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="font:700 14px var(--fh);color:var(--t)">📋 ${acts.length} Activities in ${mLabel}</h3>
        <span style="font-size:11px;color:var(--mid)">Click 🔍 for full task detail</span>
      </div>
      ${acts.length?`<div class="tbl-wrap"><table>
        <thead><tr>
          <th style="width:36px">#</th>
          <th>Activity</th>
          <th style="width:90px">Status</th>
          <th style="width:100px;text-align:right">Total Bgt</th>
          <th style="width:110px;text-align:right">Month Plan ₹</th>
          <th style="width:110px;text-align:right">Actual Spent ₹</th>
          <th style="width:110px;text-align:right">Variance</th>
          <th>Remarks</th>
          <th style="width:50px"></th>
        </tr></thead>
        <tbody>${actRows}</tbody>
      </table></div>`
      :'<div class="no-rows" style="padding:24px;text-align:center;color:var(--mid)">No activities planned for '+mLabel+'</div>'}
    </div>`;
}

function renderCalTask(aId,mi){
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  const mis=String(mi);
  const mLabel=MLABEL(mi);
  const plan=(a.monthBudget||{})[mis]||0;
  const spent=(a.monthSpent||{})[mis]||0;
  const variance=plan-spent;
  const remarks=escQ((a.remarks||{})[mis]||'');
  const oc=S.monthOutcomes[mis]||{};
  const eb=can('editBudget'),ea=can('editActivity');
  const lb=eb?'':'disabled',la=ea?'':'disabled';
  const pct=plan>0?Math.min(100,Math.round(spent/plan*100)):0;

  // Prev / Next active months for this task
  const activeMths=(a.months||[]).map((v,i)=>v?i:-1).filter(i=>i>=0);
  const idx=activeMths.indexOf(mi);
  const prevMi=idx>0?activeMths[idx-1]:null;
  const nextMi=idx<activeMths.length-1?activeMths[idx+1]:null;
  const sClass={Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'}[a.status]||'s-planned';

  // Conv metrics
  const convRate=oc.leads>0?((oc.admissions||0)/oc.leads*100).toFixed(0)+'%':'—';
  const cpl=oc.leads&&oc.spent?fmt(Math.round(oc.spent/oc.leads)):'—';
  const cpa=oc.admissions&&oc.spent?fmt(Math.round(oc.spent/oc.admissions)):'—';

  document.getElementById('cv-task-detail').innerHTML=`
    <!-- Nav bar -->
    <div class="cv-td-back">
      <button class="btn-sm" onclick="closeCalTask()">← All Months</button>
      <div class="cv-td-month-nav">
        ${prevMi!==null?`<button class="btn-sm" onclick="renderCalTask(${aId},${prevMi})">◀ ${MNAMES[prevMi]}</button>`:'<span></span>'}
        <span class="cv-td-cur-month">📅 ${mLabel}</span>
        ${nextMi!==null?`<button class="btn-sm" onclick="renderCalTask(${aId},${nextMi})">${MNAMES[nextMi]} ▶</button>`:'<span></span>'}
      </div>
    </div>

    <div class="cv-td-body">

      <!-- Task info -->
      <div class="card cv-td-info">
        <div class="cv-td-title">${esc(a.name)}</div>
        <div class="cv-td-meta">
          <span>${esc(a.type)}</span>
          <span>${esc(a.channel||'')}</span>
          <span>👤 ${esc(a.owner)}</span>
          <span>💰 ${fmt(a.budget||0)} total</span>
          <span class="sv ${sClass}" style="font-size:10px;padding:3px 10px">${a.status}</span>
        </div>
        ${a.details?`<div class="cv-td-details">${esc(a.details)}</div>`:''}
        <div style="margin-top:10px;font:600 10px var(--fn);color:var(--mid);text-transform:uppercase;letter-spacing:.5px">Active months</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">
          ${activeMths.map(m=>`<span onclick="renderCalTask(${aId},${m})"
            style="padding:3px 10px;border-radius:6px;font:600 10px var(--fn);cursor:pointer;
            background:${m===mi?'var(--t)':'var(--tll)'};color:${m===mi?'#fff':'var(--t)'}">
            ${MNAMES[m]}
          </span>`).join('')}
        </div>
      </div>

      <!-- Budget for this month -->
      <div class="card cv-td-budget">
        <h3>💰 Budget — ${mLabel}</h3>
        <div class="cv-bd-grid">
          <div class="cv-bd-field">
            <label>Month Plan ₹</label>
            <input class="cv-bd-inp" type="number" id="ctd-plan" value="${plan||''}" placeholder="0" ${lb}
              onchange="saveCalPlan(${aId},'${mis}',this.value)">
          </div>
          <div class="cv-bd-field">
            <label>Actual Spent ₹</label>
            <input class="cv-bd-inp act" type="number" id="ctd-spent" value="${spent||''}" placeholder="0" ${la}
              onchange="saveCalSpent(${aId},'${mis}',this.value)">
          </div>
          <div class="cv-bd-field">
            <label>Variance</label>
            <div class="cv-bd-var ${variance>=0?'var-pos':'var-neg'}" id="ctd-var">${variance>=0?'+':''}${fmt(Math.abs(variance))}</div>
          </div>
        </div>
        <div class="cv-bd-pct-lbl">${pct}% of plan used</div>
        <div class="cv-bd-bar-wrap">
          <div class="cv-bd-bar" id="ctd-bar" style="width:${pct}%;background:${spent>plan&&plan>0?'var(--coral)':'var(--g)'}"></div>
        </div>
        <div class="cv-bd-remark" style="margin-top:10px">
          <label>Month Remarks</label>
          <input type="text" value="${remarks}" placeholder="Notes for ${mLabel} execution…" ${la}
            onchange="saveCalRemark(${aId},'${mis}',this.value)">
        </div>
      </div>

      <!-- Month outcomes (spans full width) -->
      <div class="card cv-td-outcomes">
        <h3>📊 ${mLabel} Outcomes <span style="font-size:11px;font-weight:400;color:var(--mid)">(month totals across all activities)</span></h3>
        <div class="cv-oc-grid">
          <div class="cv-oc-f"><label>💰 Total Spent ₹</label>
            <input type="number" value="${oc.spent||''}" placeholder="0" ${la}
              onchange="saveCalOutcome('${mis}','spent',this.value)"></div>
          <div class="cv-oc-f"><label>🎯 Leads Generated</label>
            <input type="number" value="${oc.leads||''}" placeholder="0" ${la}
              onchange="saveCalOutcome('${mis}','leads',this.value)"></div>
          <div class="cv-oc-f"><label>🏫 School Visits</label>
            <input type="number" value="${oc.visits||''}" placeholder="0" ${la}
              onchange="saveCalOutcome('${mis}','visits',this.value)"></div>
          <div class="cv-oc-f"><label>✅ Admissions</label>
            <input type="number" value="${oc.admissions||''}" placeholder="0" ${la}
              onchange="saveCalOutcome('${mis}','admissions',this.value)"></div>
          <div class="cv-oc-f"><label>📡 Brand Reach</label>
            <input type="number" value="${oc.reach||''}" placeholder="0" ${la}
              onchange="saveCalOutcome('${mis}','reach',this.value)"></div>
          <div class="cv-oc-f span2"><label>📝 Notes / Observations</label>
            <textarea ${la} placeholder="Document results, brand visibility, campaign outcomes…"
              onchange="saveCalOutcome('${mis}','notes',this.value)">${oc.notes||''}</textarea></div>
        </div>
        ${oc.leads||oc.spent?`<div class="cv-oc-summary">
          <span>Conv rate: ${convRate}</span>
          <span>Cost/Lead: ${cpl}</span>
          <span>Cost/Admission: ${cpa}</span>
        </div>`:''}
      </div>

    </div>`;
}

// ── Calendar save helpers ───────────────────────────
function saveCalPlan(aId,mi,val){
  if(!can('editBudget')){showToast('Requires Master or Admin','err');return;}
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  if(!a.monthBudget)a.monthBudget={};
  a.monthBudget[mi]=parseInt(val)||0;
  saveState();
  const p=a.monthBudget[mi],sp=(a.monthSpent||{})[mi]||0,v=p-sp;
  const vEl=document.getElementById('ctd-var');
  if(vEl){vEl.textContent=(v>=0?'+':'')+fmt(Math.abs(v));vEl.className='cv-bd-var '+(v>=0?'var-pos':'var-neg');}
  const pct=p>0?Math.min(100,Math.round(sp/p*100)):0;
  const bar=document.getElementById('ctd-bar');
  if(bar){bar.style.width=pct+'%';bar.style.background=sp>p&&p>0?'var(--coral)':'var(--g)';}
  showToast('Plan saved ✔','ok');
}
function saveCalSpent(aId,mi,val){
  if(!can('editActivity')){showToast('No permission','err');return;}
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  if(!a.monthSpent)a.monthSpent={};
  a.monthSpent[mi]=parseInt(val)||0;
  saveState();
  const p=(a.monthBudget||{})[mi]||0,sp=a.monthSpent[mi],v=p-sp;
  const vEl=document.getElementById('ctd-var');
  if(vEl){vEl.textContent=(v>=0?'+':'')+fmt(Math.abs(v));vEl.className='cv-bd-var '+(v>=0?'var-pos':'var-neg');}
  const pct=p>0?Math.min(100,Math.round(sp/p*100)):0;
  const bar=document.getElementById('ctd-bar');
  if(bar){bar.style.width=pct+'%';bar.style.background=sp>p&&p>0?'var(--coral)':'var(--g)';}
  showToast('Spend saved ✔','ok');
}
function saveCalRemark(aId,mi,val){
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  if(!a.remarks)a.remarks={};a.remarks[mi]=val;saveState();
}
function saveCalOutcome(mi,field,val){
  if(!can('editActivity')){showToast('No permission','err');return;}
  if(!S.monthOutcomes)S.monthOutcomes={};
  if(!S.monthOutcomes[mi])S.monthOutcomes[mi]={};
  S.monthOutcomes[mi][field]=(['spent','leads','visits','admissions','reach'].includes(field))?(parseInt(val)||0):val;
  saveState();showToast('Outcome saved ✔','ok');
}
// Legacy aliases (used in Budget Manager)
function saveMonthBudget(id,mi,val){ saveCalPlan(id,mi,val); }
function saveMonthSpent(id,mi,val){ saveCalSpent(id,mi,val); }
function saveRemark(id,mi,val){ saveCalRemark(id,mi,val); }

// ── OWNER'S VIEW ───────────────────────────────────
function renderOwnersView(){
  const owners=['All',...S.lovs.owners];
  document.getElementById('owner-tabs').innerHTML=owners.map(o=>
    `<button class="owner-tab${activeOwner===o?' active':''}" onclick="setOwner('${escQ(o)}')">${esc(o)}</button>`
  ).join('');
  const acts=activeOwner==='All'?S.activities:S.activities.filter(a=>a.owner===activeOwner);
  const total=acts.reduce((s,a)=>s+(a.budget||0),0);
  const st={Active:0,Planned:0,Done:0,Paused:0};
  acts.forEach(a=>{if(st[a.status]!==undefined)st[a.status]++;});
  document.getElementById('ov-stats').innerHTML=`
    <div class="ov-stat"><div class="sv">${acts.length}</div><div class="sl">Total</div></div>
    <div class="ov-stat g"><div class="sv">${fmt(total)}</div><div class="sl">Budget</div></div>
    <div class="ov-stat g"><div class="sv">${st.Active}</div><div class="sl">Active</div></div>
    <div class="ov-stat"><div class="sv">${st.Planned}</div><div class="sl">Planned</div></div>
    <div class="ov-stat a"><div class="sv">${st.Paused}</div><div class="sl">Paused</div></div>
    <div class="ov-stat c"><div class="sv">${st.Done}</div><div class="sl">Done</div></div>`;
  const ea=can('editActivity');const la=!ea?'disabled':'';
  document.getElementById('ov-body').innerHTML=acts.length?acts.map(a=>`<tr class="${a.status==='Done'?'done-row':''}">
    <td style="font:700 12px var(--fn);color:var(--mid)">${a.no}</td>
    <td><div style="font:600 13px var(--fn)">${esc(a.name)}</div><div style="font-size:11px;color:var(--mid)">${esc((a.details||'').substring(0,50))}${(a.details||'').length>50?'…':''}</div></td>
    <td><select class="lov" onchange="upd(${a.id},'type',this.value)" ${la}>${mkOpts(S.lovs.types,a.type)}</select></td>
    <td><select class="lov" onchange="upd(${a.id},'exec',this.value)" ${la}>${mkOpts(S.lovs.exec,a.exec)}</select></td>
    <td style="font:700 13px var(--fn);color:var(--t)">${fmt(a.budget||0)}</td>
    <td><select class="lov sv ${scls(a.status)}" onchange="updStatus(${a.id},this.value,this);setTimeout(renderOwnersView,100)" ${la}>${mkOpts(['Active','Planned','Done','Paused'],a.status)}</select></td>
    <td><textarea class="remarks-inp" placeholder="Notes / Remarks…" ${la}
         onchange="upd(${a.id},'notes',this.value)">${escQ(a.notes||'')}</textarea></td>
    <td><button class="act-btn edit" onclick="openEditModal(${a.id})">✏️</button></td>
  </tr>`).join(''):`<tr><td colspan="8" class="no-rows">No activities for this owner.</td></tr>`;
}
function setOwner(o){activeOwner=o;renderOwnersView();}

// ── MODAL ──────────────────────────────────────────
function modalSave(){if(modalSaveCallback)modalSaveCallback();}
function buildModalHTML(a,roBudget){
  const months=(a.months||Array(NMONTHS).fill(0)).map((on,i)=>`<div class="mm${on?' on':''}" onclick="this.classList.toggle('on')">${MNAMES[i]}</div>`).join('');
  const db=roBudget?'disabled':'';
  return `
    <div class="field-wrap req full"><label>Activity Name</label><input id="m-name" value="${escQ(a.name||'')}"></div>
    <div class="field-wrap full"><label>Details</label><textarea id="m-details">${esc(a.details||'')}</textarea></div>
    <div class="field-wrap"><label>Type</label><select id="m-type">${mkOpts(S.lovs.types,a.type)}</select></div>
    <div class="field-wrap"><label>Need</label><select id="m-need">${mkOpts(['Must','Explore'],a.need)}</select></div>
    <div class="field-wrap"><label>Channel</label><select id="m-channel">${mkOpts(S.lovs.channels,a.channel)}</select></div>
    <div class="field-wrap"><label>Paid / Organic</label><select id="m-paid">${mkOpts(['Paid','Organic'],a.paid)}</select></div>
    <div class="field-wrap"><label>Main Bucket</label><select id="m-mainBucket">${mkOpts(S.lovs.mainBuckets,a.mainBucket)}</select></div>
    <div class="field-wrap"><label>Sub Bucket</label><input id="m-subBucket" value="${escQ(a.subBucket||'')}"></div>
    <div class="field-wrap"><label>Execution</label><select id="m-exec">${mkOpts(S.lovs.exec,a.exec)}</select></div>
    <div class="field-wrap"><label>Owner</label><select id="m-owner">${mkOpts(S.lovs.owners,a.owner)}</select></div>
    <div class="field-wrap"><label>Budget ₹${roBudget?' <span style="color:var(--coral);font-size:10px">(Master/Admin only)</span>':''}</label><input id="m-budget" type="number" value="${a.budget||0}" ${db}></div>
    <div class="field-wrap"><label>Last Yr Spend ₹</label><input id="m-lastSpend" type="number" value="${a.lastSpend||0}" ${db}></div>
    <div class="field-wrap"><label>Status</label><select id="m-status">${mkOpts(['Active','Planned','Done','Paused'],a.status)}</select></div>
    <div class="field-wrap"><label>Last Year?</label><select id="m-lastYr"><option value="0"${!a.lastYr?' selected':''}>No</option><option value="1"${a.lastYr?' selected':''}>Yes</option></select></div>
    <div class="field-wrap full"><label>Notes</label><input id="m-notes" value="${escQ(a.notes||'')}"></div>
    <div class="field-wrap full"><label>Active Months (Aug 2026 – Jun 2027)</label><div class="modal-months" id="m-months">${months}</div></div>`;
}
function collectModal(a){
  a.name=document.getElementById('m-name').value.trim();
  a.details=document.getElementById('m-details').value.trim();
  a.type=document.getElementById('m-type').value;a.need=document.getElementById('m-need').value;
  a.channel=document.getElementById('m-channel').value;a.paid=document.getElementById('m-paid').value;
  a.mainBucket=document.getElementById('m-mainBucket').value;
  a.subBucket=document.getElementById('m-subBucket').value.trim();
  a.exec=document.getElementById('m-exec').value;a.owner=document.getElementById('m-owner').value;
  if(can('editBudget')){a.budget=parseInt(document.getElementById('m-budget').value)||0;a.lastSpend=parseInt(document.getElementById('m-lastSpend').value)||0;}
  a.status=document.getElementById('m-status').value;a.lastYr=document.getElementById('m-lastYr').value==='1';
  a.notes=document.getElementById('m-notes').value.trim();
  a.months=[...document.querySelectorAll('#m-months .mm')].map(el=>el.classList.contains('on')?1:0);
}
function _openSimpleModal(title,bodyHTML,saveFn){
  document.getElementById('modal-title').innerHTML=title;
  document.getElementById('modal-tabs').classList.add('hidden');
  document.getElementById('modal-body').innerHTML=`<div class="crm-overview-grid">${bodyHTML}</div>`;
  document.getElementById('modal-save-btn').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.add('open');
  modalSaveCallback=saveFn;
}
function openAddModal(){
  if(!can('addActivity')){showToast('No permission','err');return;}
  const a={id:++S.nextId,no:S.activities.length+1,name:'',details:'',need:'Must',type:'Digital',channel:'Social Media',paid:'Paid',mainBucket:'Digital Marketing',subBucket:'',exec:'Zamstars',owner:S.lovs.owners[0]||'TBD',lastSpend:0,budget:50000,notes:'',months:Array(NMONTHS).fill(0),status:'Planned',lastYr:false,remarks:{},subTasks:[],moms:[],assets:[],stage:'Planning',nextSubTaskId:1,nextMOMId:1,nextAssetId:1,driveDocId:'',driveDocUrl:''};
  _openSimpleModal('Add Activity',buildModalHTML(a,!can('editBudget')),()=>{
    collectModal(a);if(!a.name){showToast('Name required','err');return;}
    S.activities.push(a);saveState();closeModal();renderTable();showToast('Activity added!','ok');
  });
}
function openEditModal(id){
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  const copy=JSON.parse(JSON.stringify(a));
  _openSimpleModal('Edit Activity',buildModalHTML(copy,!can('editBudget')),()=>{
    collectModal(copy);if(!copy.name){showToast('Name required','err');return;}
    Object.assign(a,copy);saveState();closeModal();renderTable();showToast('Saved!','ok');
  });
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-box').classList.remove('drive-expanded');
  document.getElementById('modal-save-btn').textContent='Save Changes';
  modalSaveCallback=null;
}
document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this)closeModal();});

// ── CRM DETAIL MODAL ──────────────────────────────
function computeProgress(a){
  if(!a.subTasks||!a.subTasks.length) return 0;
  const done=a.subTasks.filter(st=>st.status==='Done').length;
  return Math.round((done/a.subTasks.length)*100);
}
function openDetailModal(id){
  const a=S.activities.find(x=>x.id===id);if(!a)return;
  const ea=can('editActivity'),eb=can('editBudget');
  // Build header
  const prog=computeProgress(a);
  document.getElementById('modal-title').innerHTML=`
    <div class="crm-hero">
      <div>
        <div style="font:600 10px var(--fn);opacity:.7;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Activity #${a.no}</div>
        <div class="crm-hero-title">${esc(a.name)}</div>
        <div class="crm-hero-meta">
          <span class="crm-hero-chip">${esc(a.type)}</span>
          <span class="crm-hero-chip">👤 ${esc(a.owner)}</span>
          <span class="crm-hero-chip">${esc(a.exec)}</span>
          <span class="crm-hero-chip sv ${scls(a.status)}" style="font-size:10px">${a.status}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <div class="crm-hero-prog">
          <div class="crm-prog-bar-wrap"><div class="crm-prog-bar" style="width:${prog}%"></div></div>
          <span class="crm-prog-pct">${prog}%</span>
        </div>
        ${a.driveDocUrl?`<a href="${a.driveDocUrl}" target="_blank" class="crm-drive-btn">📄 Open Doc</a>`:''}
      </div>
    </div>`;
  // Build tabs
  const tabsEl=document.getElementById('modal-tabs');
  tabsEl.classList.remove('hidden');
  tabsEl.innerHTML=`
    <button class="crm-tab active" onclick="switchCRMTab('overview',this)">📋 Overview</button>
    <button class="crm-tab" onclick="switchCRMTab('subtasks',this)">✅ Sub-Tasks (${(a.subTasks||[]).length})</button>
    <button class="crm-tab" onclick="switchCRMTab('mom',this)">🗒 MOM (${(a.moms||[]).length})</button>
    <button class="crm-tab" onclick="switchCRMTab('assets',this)">🔗 Assets (${(a.assets||[]).length})</button>
    <button class="crm-tab drive-tab" onclick="switchCRMTab('drive',this)">📄 Google Doc</button>`;
  // Render overview tab
  document.getElementById('modal-body').innerHTML=`
    <div class="crm-pane active crm-pane-overview-wrap" id="crm-pane-overview">
      <div class="crm-overview-grid">${buildModalHTML(a,!eb)}</div>
    </div>
    <div class="crm-pane" id="crm-pane-subtasks">${buildSubTasksPane(a,ea)}</div>
    <div class="crm-pane" id="crm-pane-mom">${buildMOMPane(a,ea)}</div>
    <div class="crm-pane" id="crm-pane-assets">${buildAssetsPane(a,ea)}</div>
    <div class="crm-pane" id="crm-pane-drive">${buildDrivePane(a,ea)}</div>`;
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-save-btn').classList.remove('hidden');
  modalSaveCallback=()=>{
    collectModal(a);if(!a.name){showToast('Name required','err');return;}
    saveState();closeModal();renderTable();showToast('Saved!','ok');
  };
}
// Open detail modal and immediately switch to a specific tab
function openDetailOnTab(id,tabName){
  openDetailModal(id);
  // Switch to the requested tab after modal renders
  setTimeout(()=>{
    const btn=document.querySelector(`.crm-tab[onclick*="'${tabName}'"]`);
    switchCRMTab(tabName,btn);
  },50);
}
function switchCRMTab(name,btn){
  document.querySelectorAll('.crm-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.crm-tab').forEach(t=>t.classList.remove('active'));
  const p=document.getElementById('crm-pane-'+name);if(p)p.classList.add('active');
  if(btn)btn.classList.add('active');
  // Expand modal for Drive tab; restore for others
  const mb=document.getElementById('modal-box');
  if(mb){
    if(name==='drive'){mb.classList.add('drive-expanded');}
    else{mb.classList.remove('drive-expanded');}
  }
  // Hide save button on non-overview tabs
  const saveBtn=document.getElementById('modal-save-btn');
  if(saveBtn)saveBtn.classList.toggle('hidden',name!=='overview');
}
// ── SUB-TASKS PANE ──
function buildSubTasksPane(a,editable){
  const sts=a.subTasks||[];
  const totalBudget=sts.reduce((s,st)=>s+(st.budget||0),0);
  const totalSpent=sts.reduce((s,st)=>s+(st.spent||0),0);
  const done=sts.filter(st=>st.status==='Done').length;
  const prog=sts.length?Math.round((done/sts.length)*100):0;
  const stRows=sts.map(st=>{
    const scls2={'To Do':'st-status-todo','In Progress':'st-status-wip','Done':'st-status-done','Blocked':'st-status-blocked'}[st.status]||'';
    return `<tr>
      <td><div style="font:600 12px var(--fn)">${esc(st.title)}</div><div style="font:400 11px var(--fn);color:var(--mid);margin-top:2px">${esc(st.desc||'')}</div></td>
      <td>${esc(st.owner||'')}</td>
      <td>${st.dueDate||'—'}</td>
      <td><span class="${scls2}">${st.status}</span></td>
      <td style="text-align:right">${fmtBare(st.budget||0)}</td>
      <td style="text-align:right">${fmtBare(st.spent||0)}</td>
      ${editable?`<td><button class="crm-del-btn" onclick="crmDelSubTask(${a.id},${st.id})">✕</button></td>`:'<td></td>'}
    </tr>`;
  }).join('');
  const addRow=editable?`
    <div class="crm-add-row" id="st-add-row-${a.id}">
      <div><label>Title *</label><input class="crm-inp" id="st-new-title" placeholder="Task title"></div>
      <div><label>Owner</label><select class="crm-sel" id="st-new-owner">${S.lovs.owners.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>
      <div><label>Due Date</label><input type="date" class="crm-inp" id="st-new-due"></div>
      <div><label>Status</label><select class="crm-sel" id="st-new-status"><option>To Do</option><option>In Progress</option><option>Done</option><option>Blocked</option></select></div>
      <div><label>Budget ₹</label><input type="number" class="crm-inp" id="st-new-budget" placeholder="0"></div>
      <div><label>Spent ₹</label><input type="number" class="crm-inp" id="st-new-spent" placeholder="0"></div>
      <div style="display:flex;align-items:flex-end"><button class="btn-sm btn-grn" onclick="crmAddSubTask(${a.id})" style="white-space:nowrap">+ Add</button></div>
    </div>
    <div style="margin-top:8px"><label style="font:700 9px var(--fn);text-transform:uppercase;letter-spacing:.5px;color:var(--mid)">Description (optional)</label><textarea class="crm-inp" id="st-new-desc" rows="2" placeholder="Task description…" style="margin-top:4px;resize:vertical"></textarea></div>`:
    '<div style="font:400 12px var(--fn);color:var(--mid);padding:10px 0">View only — contact an editor to add tasks.</div>';
  return `
    <div class="crm-summary-strip">
      <div class="crm-summary-item"><div class="crm-summary-val">${sts.length}</div><div class="crm-summary-lbl">Tasks</div></div>
      <div class="crm-summary-item"><div class="crm-summary-val" style="color:var(--g)">${done}</div><div class="crm-summary-lbl">Done</div></div>
      <div class="crm-summary-item"><div class="crm-summary-val" style="color:var(--coral)">${sts.filter(st=>st.status==='Blocked').length}</div><div class="crm-summary-lbl">Blocked</div></div>
      <div class="crm-summary-item"><div class="crm-summary-val">${prog}%</div><div class="crm-summary-lbl">Progress</div></div>
      <div class="crm-summary-item"><div class="crm-summary-val" style="color:var(--amber2)">${fmt(totalBudget)}</div><div class="crm-summary-lbl">Budget</div></div>
      <div class="crm-summary-item"><div class="crm-summary-val" style="color:var(--t)">${fmt(totalSpent)}</div><div class="crm-summary-lbl">Spent</div></div>
    </div>
    ${sts.length?`<div class="tbl-wrap"><table class="crm-st-table">
      <thead><tr><th>Task</th><th>Owner</th><th>Due Date</th><th>Status</th><th>Budget ₹</th><th>Spent ₹</th><th></th></tr></thead>
      <tbody>${stRows}</tbody>
    </table></div>`:'<div class="no-rows" style="padding:20px 0;text-align:center;color:var(--mid)">No sub-tasks yet.</div>'}
    <div style="margin-top:12px"><div style="font:700 12px var(--fn);color:var(--t);margin-bottom:6px">Add Sub-Task</div>${addRow}</div>`;
}
function crmAddSubTask(aId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  const title=document.getElementById('st-new-title').value.trim();
  if(!title){showToast('Title required','err');return;}
  if(!a.subTasks)a.subTasks=[];if(!a.nextSubTaskId)a.nextSubTaskId=1;
  a.subTasks.push({
    id:a.nextSubTaskId++,
    title,
    desc:document.getElementById('st-new-desc').value.trim(),
    owner:document.getElementById('st-new-owner').value,
    dueDate:document.getElementById('st-new-due').value,
    status:document.getElementById('st-new-status').value,
    budget:parseInt(document.getElementById('st-new-budget').value)||0,
    spent:parseInt(document.getElementById('st-new-spent').value)||0,
  });
  saveState();
  // Re-render sub-tasks pane
  document.getElementById('crm-pane-subtasks').innerHTML=buildSubTasksPane(a,can('editActivity'));
  // Update tab badge
  const tab=document.querySelector('.crm-tab:nth-child(2)');if(tab)tab.textContent=`✅ Sub-Tasks (${a.subTasks.length})`;
  // Update progress in header
  const pEl=document.querySelector('.crm-prog-bar');const ppEl=document.querySelector('.crm-prog-pct');
  const prog=computeProgress(a);if(pEl)pEl.style.width=prog+'%';if(ppEl)ppEl.textContent=prog+'%';
  showToast('Sub-task added!','ok');
}
function crmDelSubTask(aId,stId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  if(!confirm('Delete this sub-task?'))return;
  a.subTasks=a.subTasks.filter(st=>st.id!==stId);
  saveState();
  document.getElementById('crm-pane-subtasks').innerHTML=buildSubTasksPane(a,can('editActivity'));
  const tab=document.querySelector('.crm-tab:nth-child(2)');if(tab)tab.textContent=`✅ Sub-Tasks (${a.subTasks.length})`;
  showToast('Deleted','ok');
}
// ── MOM PANE ──
function buildMOMPane(a,editable){
  const moms=(a.moms||[]).slice().reverse();
  const momCards=moms.map(m=>`
    <div class="crm-mom-entry">
      <div class="crm-mom-header">
        <div>
          <div class="crm-mom-date">📅 ${m.date||'—'}</div>
          <div class="crm-mom-attendees">👥 ${esc(m.attendees||'')}</div>
        </div>
        ${editable?`<button class="crm-del-btn" onclick="crmDelMOM(${a.id},${m.id})">✕</button>`:''}
      </div>
      <div class="crm-mom-grid">
        <div><div class="crm-mom-label">Discussion</div><div class="crm-mom-text">${esc(m.discussion||'')}</div></div>
        <div><div class="crm-mom-label">Action Items</div><div class="crm-mom-text">${esc(m.actions||'')}</div></div>
      </div>
    </div>`).join('');
  const addForm=editable?`
    <div class="crm-add-row" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div><label>Date</label><input type="date" class="crm-inp" id="mom-new-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div><label>Attendees</label><input class="crm-inp" id="mom-new-att" placeholder="Names, separated by commas"></div>
      <div class="full" style="grid-column:1/-1"><label>Discussion / Notes</label><textarea class="crm-inp" id="mom-new-disc" rows="3" placeholder="Key discussion points…"></textarea></div>
      <div class="full" style="grid-column:1/-1"><label>Action Items (one per line)</label><textarea class="crm-inp" id="mom-new-act" rows="3" placeholder="Action 1&#10;Action 2…"></textarea></div>
      <div style="grid-column:1/-1"><button class="btn-sm btn-grn" onclick="crmAddMOM(${a.id})">+ Add MOM</button></div>
    </div>`:'';
  return `
    ${moms.length?momCards:'<div class="no-rows" style="padding:20px 0;text-align:center;color:var(--mid)">No meeting minutes yet.</div>'}
    <div style="margin-top:12px;border-top:1px solid var(--bd);padding-top:14px"><div style="font:700 12px var(--fn);color:var(--t);margin-bottom:8px">Add Minutes of Meeting</div>${addForm}</div>`;
}
function crmAddMOM(aId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  const discussion=document.getElementById('mom-new-disc').value.trim();
  if(!discussion){showToast('Discussion required','err');return;}
  if(!a.moms)a.moms=[];if(!a.nextMOMId)a.nextMOMId=1;
  a.moms.push({
    id:a.nextMOMId++,
    date:document.getElementById('mom-new-date').value,
    attendees:document.getElementById('mom-new-att').value.trim(),
    discussion,
    actions:document.getElementById('mom-new-act').value.trim(),
  });
  saveState();
  document.getElementById('crm-pane-mom').innerHTML=buildMOMPane(a,can('editActivity'));
  const tab=document.querySelector('.crm-tab:nth-child(3)');if(tab)tab.textContent=`🗒 MOM (${a.moms.length})`;
  showToast('MOM added!','ok');
}
function crmDelMOM(aId,mId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  if(!confirm('Delete this MOM entry?'))return;
  a.moms=a.moms.filter(m=>m.id!==mId);
  saveState();
  document.getElementById('crm-pane-mom').innerHTML=buildMOMPane(a,can('editActivity'));
  const tab=document.querySelector('.crm-tab:nth-child(3)');if(tab)tab.textContent=`🗒 MOM (${a.moms.length})`;
  showToast('Deleted','ok');
}
// ── ASSETS PANE ──
function buildAssetsPane(a,editable){
  const assets=a.assets||[];
  const rows=assets.map(as=>`
    <div class="crm-asset-row">
      <span class="crm-asset-name">📎 ${esc(as.name)}</span>
      <a class="crm-asset-url" href="${as.url}" target="_blank" title="${escQ(as.url)}">${esc(as.url)}</a>
      ${editable?`<button class="crm-del-btn" onclick="crmDelAsset(${a.id},${as.id})">✕</button>`:''}
    </div>`).join('');
  const addRow=editable?`
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <input class="crm-inp" id="as-new-name" placeholder="Asset name / label" style="flex:1;min-width:160px">
      <input class="crm-inp" id="as-new-url" placeholder="https://…" style="flex:3;min-width:200px">
      <button class="btn-sm btn-grn" onclick="crmAddAsset(${a.id})">+ Add</button>
    </div>`:'';
  return `
    <div style="font:700 13px var(--fn);color:var(--t);margin-bottom:10px">📎 Assets & Links (${assets.length})</div>
    ${assets.length?rows:'<div class="no-rows" style="padding:16px 0;text-align:center;color:var(--mid)">No assets linked yet.</div>'}
    ${addRow}`;
}
function crmAddAsset(aId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  const name=document.getElementById('as-new-name').value.trim();
  const url=document.getElementById('as-new-url').value.trim();
  if(!name||!url){showToast('Name and URL required','err');return;}
  if(!a.assets)a.assets=[];if(!a.nextAssetId)a.nextAssetId=1;
  a.assets.push({id:a.nextAssetId++,name,url});
  saveState();
  document.getElementById('crm-pane-assets').innerHTML=buildAssetsPane(a,can('editActivity'));
  const tab=document.querySelector('.crm-tab:nth-child(4)');if(tab)tab.textContent=`🔗 Assets (${a.assets.length})`;
  showToast('Asset added!','ok');
}
function crmDelAsset(aId,asId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  a.assets=a.assets.filter(as=>as.id!==asId);
  saveState();
  document.getElementById('crm-pane-assets').innerHTML=buildAssetsPane(a,can('editActivity'));
  const tab=document.querySelector('.crm-tab:nth-child(4)');if(tab)tab.textContent=`🔗 Assets (${a.assets.length})`;
  showToast('Deleted','ok');
}
// ── DRIVE PANE ──
function buildDrivePane(a,editable){
  if(a.driveDocUrl){
    const docId=a.driveDocId;
    // Use /edit?embedded=true so logged-in users can edit inside the iframe
    const embedUrl=`https://docs.google.com/document/d/${docId}/edit?usp=sharing&embedded=true`;
    const previewUrl=`https://docs.google.com/document/d/${docId}/preview`;
    const editUrl=a.driveDocUrl;
    return `
      <div class="drive-toolbar">
        <div class="drive-toolbar-left">
          <span style="font-size:22px">📄</span>
          <div>
            <div style="font:700 13px var(--fn);color:var(--g)">Live Google Doc</div>
            <div style="font:400 10px var(--fn);color:var(--mid)">Sign in to Google in your browser to edit inline</div>
          </div>
        </div>
        <div class="drive-toolbar-right">
          <select id="drive-view-mode" onchange="switchDriveMode('${docId}')" style="border:1px solid var(--bd);border-radius:6px;padding:4px 8px;font:600 11px var(--fn);cursor:pointer;outline:none">
            <option value="edit">✏️ Edit mode</option>
            <option value="preview">👁 Preview mode</option>
          </select>
          <button class="drive-reload-btn" onclick="reloadDriveFrame()">⟳ Reload</button>
          <a href="${editUrl}" target="_blank" class="drive-edit-btn">↗ Open in Docs</a>
        </div>
      </div>
      <iframe id="drive-iframe" src="${embedUrl}" class="drive-iframe" frameborder="0" allowfullscreen></iframe>
      <div class="sync-strip">
        <strong>⚡ How it works:</strong>
        <span>🟦 <strong>This app</strong> = live tracking — status, budget, spend, sub-tasks, MOM</span>
        <span>•</span>
        <span>📄 <strong>Google Doc</strong> = the formatted brief — creative notes, stakeholder version, history</span>
        <span>•</span>
        <span>Edit the doc inline above → changes auto-save → click Reload to refresh preview</span>
      </div>`;
  }
  return `<div style="padding:24px">
    <div class="crm-no-doc">
      <div style="font-size:36px;margin-bottom:8px">📄</div>
      <div style="font:700 14px var(--fn);color:var(--dark);margin-bottom:6px">No Google Doc linked</div>
      <div style="font:400 12px var(--fn);color:var(--mid);margin-bottom:14px">This activity does not have a Google Doc yet.</div>
      ${editable?`<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <input class="crm-inp" id="drive-new-url" placeholder="https://docs.google.com/document/d/…" style="max-width:400px">
        <button class="btn-sm btn-grn" onclick="crmSetDriveUrl(${a.id})">Link Doc</button>
      </div>`:''}
    </div>
  </div>`;
}
function reloadDriveFrame(){
  const f=document.getElementById('drive-iframe');if(!f)return;
  const s=f.src;f.src='';setTimeout(()=>{f.src=s;},50);
}
function switchDriveMode(docId){
  const mode=document.getElementById('drive-view-mode').value;
  const f=document.getElementById('drive-iframe');if(!f)return;
  if(mode==='edit'){
    f.src=`https://docs.google.com/document/d/${docId}/edit?usp=sharing&embedded=true`;
  } else {
    f.src=`https://docs.google.com/document/d/${docId}/preview`;
  }
}
function crmSetDriveUrl(aId){
  const a=S.activities.find(x=>x.id===aId);if(!a)return;
  if(!can('editActivity')){showToast('No permission','err');return;}
  const url=document.getElementById('drive-new-url').value.trim();
  if(!url){showToast('URL required','err');return;}
  a.driveDocUrl=url;
  const m=url.match(/\/d\/([a-zA-Z0-9_-]+)/);a.driveDocId=m?m[1]:'';
  saveState();
  document.getElementById('crm-pane-drive').innerHTML=buildDrivePane(a,can('editActivity'));
  showToast('Drive doc linked!','ok');
}

// ── ADMISSIONS ─────────────────────────────────────
function saveAdmissions(v){
  S.admissions=Math.max(0,Math.min(800,parseInt(v)||0));
  saveState(); renderDashboard();

  // Persist to Supabase
  window._sb.from('app_settings').upsert({key:'admissions',value:{value:S.admissions}},{onConflict:'key'});
}

// ── DASHBOARD TABS ─────────────────────────────────
function switchDashTab(tab,el){
  activeDashTab=tab;
  document.querySelectorAll('.dt').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  const op=document.getElementById('overview-pane');
  const sp=document.getElementById('sub-pane');
  if(tab==='overview'){
    if(op)op.style.display='';
    if(sp){sp.style.display='none';sp.innerHTML='';}
    renderDashboard();
  } else {
    if(op)op.style.display='none';
    if(sp){sp.style.display='';
      if(tab==='tasks')sp.innerHTML=renderDashTasksHTML();
      else sp.innerHTML=renderDashByGroupHTML(tab);
    }
  }
}

function renderDashTasksHTML(){
  const acts=S.activities;
  const fState={status:'',owner:'',type:'',channel:''};
  const allOwners=[...new Set(acts.map(a=>a.owner))].filter(Boolean).sort();
  const allTypes=[...new Set(acts.map(a=>a.type))].filter(Boolean).sort();
  const allCh=[...new Set(acts.map(a=>a.channel))].filter(Boolean).sort();
  const mkSel=(id,opts,placeholder)=>`<select class="rpt-filter" id="${id}" onchange="applyTaskFilter()">
    <option value="">— ${placeholder} —</option>${opts.map(o=>`<option>${esc(o)}</option>`).join('')}</select>`;
  const MCOLS=MNAMES; // Aug–Jun labels aligned with NMONTHS
  const rows=acts.map(a=>{
    const plan=Object.values(a.monthBudget||{}).reduce((s,v)=>s+(v||0),0);
    const spent=Object.values(a.monthSpent||{}).reduce((s,v)=>s+(v||0),0);
    const rem=plan-spent; const pct=plan>0?Math.min(100,Math.round(spent/plan*100)):0;
    const allLeads=Object.values(S.monthOutcomes||{}).reduce((s,o)=>s+(parseInt(o.leads)||0),0);
    const allVisits=Object.values(S.monthOutcomes||{}).reduce((s,o)=>s+(parseInt(o.visits)||0),0);
    const allAdm=S.admissions||0;
    const acMonths=(a.months||[]).map((v,i)=>v?MCOLS[i]:null).filter(Boolean).join(', ');
    const sClass={Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'}[a.status]||'s-planned';
    return {a,plan,spent,rem,pct,acMonths,sClass};
  });
  const tbl=rows.map(({a,plan,spent,rem,pct,acMonths,sClass})=>`<tr>
    <td style="font:700 11px var(--fn);color:var(--mid)">${a.no}</td>
    <td style="min-width:160px;font-weight:600">${esc(a.name)}</td>
    <td style="font-size:11px">${esc(a.type)}</td>
    <td style="font-size:11px">${esc(a.channel)}</td>
    <td style="font-size:11px">${esc(a.owner)}</td>
    <td><span class="sv ${sClass}" style="font-size:10px;padding:2px 8px 2px 6px">${a.status}</span></td>
    <td style="text-align:right">${fmt(plan)}</td>
    <td style="text-align:right;color:var(--coral)">${fmt(spent)}</td>
    <td style="text-align:right;color:${rem>=0?'var(--g)':'var(--coral)'}">${fmt(Math.abs(rem))}${rem<0?' ▲':' ▼'}</td>
    <td style="text-align:right">
      <div class="rpt-prog"><div style="height:100%;width:${pct}%;background:${pct>=100?'var(--coral)':pct>=70?'var(--amber)':'var(--g)'};border-radius:3px;transition:width .3s"></div></div>
      <span style="font-size:10px;color:var(--mid)">${pct}%</span>
    </td>
    <td style="font-size:11px;color:var(--mid)">${acMonths||'—'}</td>
  </tr>`).join('');
  return `<div class="rpt-filter-row">
    ${mkSel('rf-status',['Active','Done','Planned','Paused'],'Status')}
    ${mkSel('rf-owner',allOwners,'Owner')}
    ${mkSel('rf-type',allTypes,'Type')}
    ${mkSel('rf-channel',allCh,'Channel')}
    <button class="btn-sm btn-ghost" onclick="clearTaskFilters()">✕ Clear</button>
    <span style="font-size:11px;color:var(--mid);margin-left:8px" id="rpt-count">${acts.length} activities</span>
  </div>
  <div class="tbl-wrap"><table class="rpt-tbl" id="rpt-task-tbl">
    <thead><tr>
      <th>#</th><th>Activity</th><th>Type</th><th>Channel</th><th>Owner</th><th>Status</th>
      <th style="text-align:right">Budget Plan</th><th style="text-align:right">Spent</th>
      <th style="text-align:right">Remaining</th><th style="min-width:90px">% Used</th><th>Months</th>
    </tr></thead>
    <tbody id="rpt-task-body">${tbl}</tbody>
  </table></div>`;
}
function applyTaskFilter(){
  const s=document.getElementById('rf-status')?.value||'';
  const ow=document.getElementById('rf-owner')?.value||'';
  const ty=document.getElementById('rf-type')?.value||'';
  const ch=document.getElementById('rf-channel')?.value||'';
  const rows=[...document.querySelectorAll('#rpt-task-body tr')];
  let vis=0;
  rows.forEach(tr=>{
    const cells=[...tr.querySelectorAll('td')].map(td=>td.textContent.trim());
    const ok=(!s||cells[5]===s)&&(!ow||cells[4]===ow)&&(!ty||cells[2]===ty)&&(!ch||cells[3]===ch);
    tr.style.display=ok?'':'none'; if(ok)vis++;
  });
  const c=document.getElementById('rpt-count');if(c)c.textContent=vis+' activities';
}
function clearTaskFilters(){
  ['rf-status','rf-owner','rf-type','rf-channel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  applyTaskFilter();
}

function renderDashByGroupHTML(field){
  const label={type:'Activity Type',channel:'Channel',owner:'Owner'}[field]||field;
  const acts=S.activities;
  const groups={};
  acts.forEach(a=>{
    const k=a[field]||'(Unset)';
    if(!groups[k])groups[k]={key:k,acts:[],plan:0,spent:0,leads:0,visits:0,adm:0};
    const g=groups[k];
    g.acts.push(a);
    g.plan+=Object.values(a.monthBudget||{}).reduce((s,v)=>s+(v||0),0);
    g.spent+=Object.values(a.monthSpent||{}).reduce((s,v)=>s+(v||0),0);
  });
  // aggregate outcomes
  Object.values(S.monthOutcomes||{}).forEach(oc=>{
    // month-level totals aggregated globally (can't split by group)
  });
  const gArr=Object.values(groups).sort((a,b)=>b.plan-a.plan);
  const totalPlan=gArr.reduce((s,g)=>s+g.plan,0)||1;
  const COLORS2=['#1E3A8A','#0B7A53','#f59e0b','#f97316','#7C3AED','#E9695F','#0d9262','#2d4fa8','#b45309','#15803d'];
  const rows=gArr.map((g,i)=>{
    const rem=g.plan-g.spent; const pct=g.plan>0?Math.min(100,Math.round(g.spent/g.plan*100)):0;
    const share=Math.round(g.plan/totalPlan*100);
    return `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS2[i%COLORS2.length]};margin-right:6px"></span>${esc(g.key)}</td>
      <td style="text-align:center">${g.acts.length}</td>
      <td style="text-align:right">${fmt(g.plan)}</td>
      <td style="text-align:right;color:var(--coral)">${fmt(g.spent)}</td>
      <td style="text-align:right;color:${rem>=0?'var(--g)':'var(--coral)'}">${rem>=0?'':'-'}${fmt(Math.abs(rem))}</td>
      <td>
        <div class="rpt-prog"><div style="height:100%;width:${pct}%;background:${COLORS2[i%COLORS2.length]};border-radius:3px"></div></div>
        <span style="font-size:10px;color:var(--mid)">${pct}%</span>
      </td>
      <td style="text-align:right;font-size:11px;color:var(--mid)">${share}%</td>
      <td style="font-size:11px;color:var(--mid)">${g.acts.map(a=>`<span style="color:${g.spent>g.plan?'var(--coral)':'var(--mid)'}">${esc(a.status==='Done'?'✓':'●')}</span>`).join('')}</td>
    </tr>`;
  }).join('');
  const canvasId='ch-grp-'+field;
  setTimeout(()=>{
    const ctx=document.getElementById(canvasId);if(!ctx)return;
    if(CHARTS[canvasId])CHARTS[canvasId].destroy();
    CHARTS[canvasId]=new Chart(ctx,{type:'bar',
      data:{labels:gArr.map(g=>g.key),datasets:[
        {label:'Budget Plan',data:gArr.map(g=>Math.round(g.plan/1000)),backgroundColor:'rgba(30,58,138,.7)',borderRadius:4},
        {label:'Spent',data:gArr.map(g=>Math.round(g.spent/1000)),backgroundColor:'rgba(233,105,95,.7)',borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11}}},
        tooltip:{callbacks:{label:c=>' ₹'+c.parsed.y.toLocaleString()+'K'}}},
        scales:{y:{grid:{color:'#eee'},ticks:{callback:v=>'₹'+v+'K',font:{size:11}}},x:{ticks:{font:{size:10}}}}}});
  },80);
  return `<div class="grp-hdr"><h3>📊 By ${label}</h3></div>
  <div class="chart-grid-2">
    <div class="card" style="grid-column:1/-1"><h3>Budget Plan vs Spent — by ${label}</h3><div style="height:220px"><canvas id="${canvasId}"></canvas></div></div>
  </div>
  <div class="tbl-wrap" style="margin-top:16px"><table class="rpt-tbl">
    <thead><tr><th>${label}</th><th style="text-align:center">Activities</th>
      <th style="text-align:right">Plan ₹</th><th style="text-align:right">Spent ₹</th>
      <th style="text-align:right">Remaining</th><th style="min-width:90px">% Used</th>
      <th style="text-align:right">Budget Share</th><th>Status Mix</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── DASHBOARD ──────────────────────────────────────
function renderDashboard(){
  const acts=S.activities;
  const adm=S.admissions||0, target=S.targetAdmissions||800;
  const totalBudget=S.masterBudget;
  const allocBudget=acts.reduce((s,a)=>s+(a.budget||0),0);
  const spentBudget=acts.filter(a=>a.status==='Done').reduce((s,a)=>s+(a.budget||0),0);

  // Status counts
  const st={Active:0,Done:0,Planned:0,Paused:0};
  acts.forEach(a=>{if(st[a.status]!==undefined)st[a.status]++;});
  const total=acts.length;

  // ── Admissions bar
  const admPct=Math.min(100,(adm/target*100));
  const admInput=document.getElementById('adm-input');
  if(admInput) admInput.value=adm||'';
  const fill=document.getElementById('adm-bar-fill');
  if(fill) fill.style.width=admPct.toFixed(1)+'%';
  const left=document.getElementById('adm-bar-left');
  if(left) left.textContent=adm+' admissions secured ('+admPct.toFixed(1)+'%)';

  // ── KPI cards
  const cpa=adm>0?Math.round(spentBudget/adm):0;
  const budgetPct=Math.min(100,(allocBudget/totalBudget*100));
  const donePct=Math.min(100,(st.Done/total*100));
  const activePct=Math.min(100,((st.Active)/total*100));
  document.getElementById('kpi-row').innerHTML=`
    <div class="kpi-card kc-blue">
      <div class="kpi-lbl">🎯 Admissions Secured</div>
      <div class="kpi-val">${adm}</div>
      <div class="kpi-sub">${(admPct).toFixed(1)}% of ${target} target</div>
      <div class="kpi-prog"><div class="kpi-prog-fill" style="width:${admPct}%"></div></div>
    </div>
    <div class="kpi-card kc-green">
      <div class="kpi-lbl">✅ Activities Done</div>
      <div class="kpi-val">${st.Done}<span style="font-size:14px;font-weight:500;color:var(--mid)"> / ${total}</span></div>
      <div class="kpi-sub">${donePct.toFixed(0)}% completion rate</div>
      <div class="kpi-prog"><div class="kpi-prog-fill" style="width:${donePct}%"></div></div>
    </div>
    <div class="kpi-card kc-amber">
      <div class="kpi-lbl">💰 Budget Allocated</div>
      <div class="kpi-val" style="font-size:20px">${fmt(allocBudget)}</div>
      <div class="kpi-sub">${budgetPct.toFixed(0)}% of ${fmt(totalBudget)} total</div>
      <div class="kpi-prog"><div class="kpi-prog-fill" style="width:${budgetPct}%"></div></div>
    </div>
    <div class="kpi-card kc-coral">
      <div class="kpi-lbl">📊 Cost per Admission</div>
      <div class="kpi-val" style="font-size:${cpa>99999?'16px':'22px'}">${adm>0?fmt(cpa):'—'}</div>
      <div class="kpi-sub">${adm>0?'Based on ₹'+fmtBare(spentBudget)+' spent (Done tasks)':'Update admissions count above'}</div>
      <div class="kpi-prog"><div class="kpi-prog-fill" style="width:${adm>0?Math.min(100,cpa/5000):'0'}%"></div></div>
    </div>`;

  // ── Status breakdown
  const stDef=[
    {key:'Active',cls:'st-active',icon:'🔵',label:'In Progress'},
    {key:'Done',cls:'st-done',icon:'✅',label:'Completed'},
    {key:'Planned',cls:'st-planned',icon:'🟡',label:'Planned'},
    {key:'Paused',cls:'st-paused',icon:'🟠',label:'Paused / On Hold'}
  ];
  document.getElementById('status-row').innerHTML=stDef.map(d=>`
    <div class="st-card ${d.cls}">
      <div class="st-lbl">${d.icon} ${d.label}</div>
      <div class="st-count">${st[d.key]}</div>
      <div style="font-size:11px;color:var(--mid)">${total?((st[d.key]/total)*100).toFixed(0):0}% of all activities</div>
      <div class="st-pbar"><div class="st-pbar-fill" style="width:${total?(st[d.key]/total*100).toFixed(0):0}%"></div></div>
    </div>`).join('');

  // ── Monthly distribution
  const byMonth=Array(NMONTHS).fill(null).map(()=>({Active:0,Done:0,Planned:0,Paused:0,total:0}));
  acts.forEach(a=>{
    (a.months||[]).forEach((on,i)=>{
      if(on){ byMonth[i][a.status]=(byMonth[i][a.status]||0)+1; byMonth[i].total++; }
    });
  });
  document.getElementById('month-grid-dash').innerHTML=MNAMES.map((m,i)=>{
    const d=byMonth[i]; const t=d.total||1;
    return `<div class="month-col">
      <div class="m-name">${m}</div>
      <div class="m-count">${d.total}</div>
      <div class="month-stack">
        ${d.Done?`<div class="ms-done" style="flex:${d.Done}"></div>`:''}
        ${d.Active?`<div class="ms-active" style="flex:${d.Active}"></div>`:''}
        ${d.Planned?`<div class="ms-planned" style="flex:${d.Planned}"></div>`:''}
        ${d.Paused?`<div class="ms-paused" style="flex:${d.Paused}"></div>`:''}
        ${!d.total?`<div style="flex:1;background:var(--bd);border-radius:4px"></div>`:''}
      </div>
      <div style="font-size:9px;color:var(--mid);margin-top:4px;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
        ${d.Done?`<span style="color:#16a34a">✓${d.Done}</span>`:''}
        ${d.Active?`<span style="color:#1E3A8A">▶${d.Active}</span>`:''}
        ${d.Planned?`<span style="color:#b45309">◆${d.Planned}</span>`:''}
        ${d.Paused?`<span style="color:#f97316">⏸${d.Paused}</span>`:''}
      </div>
    </div>`;
  }).join('');

  // ── Activity progress list (active + done, sorted by budget desc)
  const stPct={Active:60,Done:100,Planned:20,Paused:35};
  const stFill={Active:'#1E3A8A',Done:'#16a34a',Planned:'#f59e0b',Paused:'#f97316'};
  const stBadge={Active:'apl-active',Done:'apl-done',Planned:'apl-planned',Paused:'apl-paused'};
  const sorted=[...acts].sort((a,b)=>(b.budget||0)-(a.budget||0)).slice(0,20);
  document.getElementById('act-progress-list').innerHTML=sorted.map(a=>`
    <div class="apl-row">
      <div class="apl-name" title="${esc(a.name)}">${esc(a.name)}</div>
      <span class="apl-badge ${stBadge[a.status]||'apl-planned'}">${a.status}</span>
      <div class="apl-bar"><div class="apl-fill" style="width:${stPct[a.status]||20}%;background:${stFill[a.status]||'#f59e0b'}"></div></div>
      <div class="apl-pct">${stPct[a.status]||20}%</div>
    </div>`).join('');

  // ── Charts
  const byType={},byBuck={},byOwner={};
  let paidT=0,orgT=0;
  acts.forEach(a=>{
    byType[a.type]=(byType[a.type]||0)+a.budget;
    byBuck[a.mainBucket]=(byBuck[a.mainBucket]||0)+a.budget;
    byOwner[a.owner]=(byOwner[a.owner]||0)+1;
    if(a.paid==='Paid')paidT+=a.budget;else orgT+=a.budget;
  });
  mkChart('ch-type','doughnut',Object.keys(byType),Object.values(byType).map(v=>Math.round(v/1000)));
  mkChart('ch-bucket','doughnut',Object.keys(byBuck),Object.values(byBuck).map(v=>Math.round(v/1000)));
  mkChart('ch-owner','bar',Object.keys(byOwner),Object.values(byOwner));
  mkChart('ch-paid','bar',['Paid','Organic'],[Math.round(paidT/1000),Math.round(orgT/1000)]);
}
function mkChart(id,type,labels,data){
  const ctx=document.getElementById(id);if(!ctx)return;
  if(CHARTS[id])CHARTS[id].destroy();
  CHARTS[id]=new Chart(ctx,{type,data:{labels,datasets:[{data,backgroundColor:COLORS,borderWidth:1,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:type==='doughnut'?'right':'bottom',labels:{font:{size:11},boxWidth:12}},
        tooltip:{callbacks:{label:c=>' ₹'+c.parsed.toLocaleString()+'K'}}},
      scales:type==='bar'?{y:{grid:{color:'#eee'},ticks:{font:{size:11}}},x:{ticks:{font:{size:10}}}}:{}}});
}

// ── BUDGET VIEW ────────────────────────────────────
function renderBudget(){
  const acts=S.activities,byBuck={};
  acts.forEach(a=>{byBuck[a.mainBucket]=(byBuck[a.mainBucket]||0)+a.budget;});
  const total=acts.reduce((s,a)=>s+a.budget,0);
  document.getElementById('bud-cards').innerHTML=Object.entries(byBuck).map(([k,v])=>`
    <div class="bud-card"><div class="bc-name">${esc(k)}</div><div class="bc-amt">${fmt(v)}</div><div class="bc-pct">${total?(v/total*100).toFixed(1):0}% of total</div></div>`).join('');
  document.getElementById('bud-body').innerHTML=acts.map(a=>`<tr>
    <td style="font:700 12px var(--fn);color:var(--mid)">${a.no}</td><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${esc(a.owner)}</td>
    <td style="text-align:right;color:var(--mid)">₹${fmtBare(a.lastSpend||0)}</td>
    <td style="text-align:right;font-weight:700;color:var(--t)">₹${fmtBare(a.budget||0)}</td>
    <td style="font-size:12px;color:var(--mid)">${esc(a.notes||'')}</td>
  </tr>`).join('');
}

// ── SETTINGS ───────────────────────────────────────
function mapProfiles(rows){
  return (rows||[]).map(p=>({
    id:p.id,
    name:p.name||'',
    role:p.role||'editor',
    email:p.email||(p.id===CURRENT_USER?.id?(CURRENT_USER.email||''):'')
  }));
}
async function loadUsers(){
  if(!window._sb){S.users=S.users||[];return;}
  const {data,error}=await window._sb.from('profiles').select('*');
  if(error){console.error('profiles load error:',error);S.users=S.users||[];return;}
  S.users=mapProfiles(data);
}
async function renderSettings(){
  const g=document.getElementById('settings-grid');
  if(!g)return;
  if(can('manageUsers')) await loadUsers();
  if(!can('manageLovs')&&!can('manageUsers')){
    g.innerHTML=`<div class="access-denied"><div class="icon">🔒</div><h3 style="font-family:var(--fh);color:var(--t);margin-bottom:8px">Access Restricted</h3><p>Only Admin users can manage settings.</p></div>`;return;
  }
  const lovDefs=[{key:'owners',label:'Owners',icon:'👤'},{key:'exec',label:'Execution Options',icon:'⚡'},{key:'types',label:'Activity Types',icon:'🏷️'},{key:'mainBuckets',label:'Main Buckets',icon:'📦'},{key:'channels',label:'Channels',icon:'📡'}];
  const fmap={owners:'owner',exec:'exec',types:'type',mainBuckets:'mainBucket',channels:'channel'};
  let html='';
  if(can('manageLovs')){
    html+=lovDefs.map(def=>`
      <div class="lov-section">
        <div class="sec-hdr"><h3>${def.icon} ${esc(def.label)}</h3><button class="btn-sm btn-pri" onclick="addLov('${def.key}')">+ Add</button></div>
        <table class="lov-table"><thead><tr><th>Value</th><th>Used In</th><th style="width:60px">Del</th></tr></thead>
        <tbody>${S.lovs[def.key].map((v,i)=>`<tr>
          <td><input value="${escQ(v)}" onchange="renameLov('${def.key}',${i},this.value,'${escQ(v)}')" onblur="renderSettings()"></td>
          <td style="font-size:11px;color:var(--mid)">${S.activities.filter(a=>a[fmap[def.key]]===v).length}</td>
          <td><button class="btn-sm btn-coral" onclick="removeLov('${def.key}',${i},'${escQ(v)}')">✕</button></td>
        </tr>`).join('')}</tbody></table>
      </div>`).join('');
  }
  if(can('manageUsers')){
    html+=`<div class="lov-section lov-span">
      <div class="sec-hdr"><h3>👤 User Management</h3><button class="btn-sm btn-pri" onclick="openAddUserModal()">+ Add User</button></div>
      <div id="user-list">${renderUserList()}</div></div>`;
  }
  if(can('admin')){
    html+=`<div class="lov-section lov-span" style="border:2px solid var(--coral);background:var(--coral3)">
      <div class="sec-hdr"><h3 style="color:var(--coral)">⚠️ Data Management</h3></div>
      <p style="font-size:12px;color:var(--mid);margin-bottom:12px">Reset reloads all activity data from the master Excel seed (budgets, months, spend data will be wiped). Useful after re-importing updated Excel data.</p>
      <button class="btn-sm" style="background:var(--coral);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600"
        onclick="resetToMaster()">↺ Reset to Master Data</button>
    </div>`;
  }
  g.innerHTML=html;
}
function renderUserList(){
  const rcls={admin:'rb-admin',master:'rb-master',editor:'rb-editor',viewer:'rb-editor'};
  const users=getUsers();
  if(!users.length){
    return `<p class="user-empty">No users yet. Use + Add User to create a login.</p>`;
  }
  return users.map(u=>`
    <div class="user-card">
      <div class="user-avatar">${esc((u.name||u.email||'?').charAt(0).toUpperCase())}</div>
      <div class="user-info-block"><div class="u-n">${esc(u.name||'Unnamed')}${u.id===CURRENT_USER?.id?' <span style="font-size:10px;color:var(--mid)">(you)</span>':''}</div><div class="u-e">${esc(u.email||'—')}</div></div>
      <span class="role-badge ${rcls[u.role]||'rb-editor'}">${esc(u.role)}</span>
      ${u.id!==CURRENT_USER?.id?`
        <select class="btn-sm btn-ghost" onchange="changeUserRole('${u.id}',this.value)" style="cursor:pointer">
          ${['admin','master','editor','viewer'].map(r=>`<option value="${r}"${u.role===r?' selected':''}>${r}</option>`).join('')}
        </select>
        <button class="btn-sm btn-coral" onclick="deleteUser('${u.id}')">Delete</button>
      `:'<span style="font-size:11px;color:var(--mid);padding:4px 8px">Current user</span>'}
    </div>`).join('');
}
async function adminUserRequest(method, body){
  const {data:{session}}=await window._sb.auth.getSession();
  if(!session) throw new Error('Not signed in');
  const res=await fetch('/api/users',{
    method,
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
    body:body?JSON.stringify(body):undefined
  });
  const json=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(json.error||('Request failed ('+res.status+')'));
  return json;
}
async function changeUserRole(uid,role){
  if(!can('manageUsers')){showToast('No permission','err');return;}
  try{
    await adminUserRequest('PATCH',{id:uid,role});
    const u=getUsers().find(x=>x.id===uid);if(u)u.role=role;
    renderSettings();showToast('Role updated','ok');
  }catch(e){showToast(e.message,'err');}
}
async function deleteUser(uid){
  if(!can('manageUsers')){showToast('No permission','err');return;}
  if(uid===CURRENT_USER?.id){showToast('Cannot delete yourself','err');return;}
  if(!confirm('Delete this user? They will no longer be able to sign in.'))return;
  try{
    await adminUserRequest('DELETE',{id:uid});
    renderSettings();showToast('User deleted','ok');
  }catch(e){showToast(e.message,'err');}
}
function openAddUserModal(){
  document.getElementById('modal-title').textContent='Add User';
  document.getElementById('modal-tabs').classList.add('hidden');
  document.getElementById('modal-save-btn').classList.remove('hidden');
  document.getElementById('modal-body').innerHTML=`<div class="crm-overview-grid">
    <div class="field-wrap req"><label>Full Name</label><input id="nu-name" placeholder="Jane Doe"></div>
    <div class="field-wrap req"><label>Email</label><input id="nu-email" type="email" placeholder="jane@zamstars.com"></div>
    <div class="field-wrap req"><label>Password</label><input id="nu-pass" type="password" placeholder="Min 6 chars"></div>
    <div class="field-wrap"><label>Role</label><select id="nu-role">
      <option value="editor">Editor — edit activity details</option>
      <option value="master">Master — also manage budgets</option>
      <option value="admin">Admin — full access</option>
      <option value="viewer">Viewer — read only</option>
    </select></div></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  modalSaveCallback=async()=>{
    const name=document.getElementById('nu-name').value.trim();
    const email=document.getElementById('nu-email').value.trim().toLowerCase();
    const pass=document.getElementById('nu-pass').value;
    const role=document.getElementById('nu-role').value;
    if(!name||!email||!pass){showToast('All fields required','err');return;}
    if(pass.length<6){showToast('Password min 6 chars','err');return;}
    try{
      await adminUserRequest('POST',{name,email,password:pass,role});
      closeModal();renderSettings();showToast('User created: '+name,'ok');
    }catch(e){showToast(e.message,'err');}
  };
}
function addLov(key){
  const val=prompt('Add new value:');if(!val||!val.trim())return;
  if(S.lovs[key].includes(val.trim())){showToast('Already exists','err');return;}
  S.lovs[key].push(val.trim());saveState();renderSettings();populateFilters();renderTable();showToast('Added: '+val.trim(),'ok');
}
function renameLov(key,idx,nv,ov){
  nv=nv.trim();if(!nv)return;
  const fmap={owners:'owner',exec:'exec',types:'type',mainBuckets:'mainBucket',channels:'channel'};
  const f=fmap[key];if(f)S.activities.forEach(a=>{if(a[f]===ov)a[f]=nv;});
  S.lovs[key][idx]=nv;saveState();populateFilters();renderTable();showToast('Renamed','ok');
}
function removeLov(key,idx,val){
  const fmap={owners:'owner',exec:'exec',types:'type',mainBuckets:'mainBucket',channels:'channel'};
  const used=S.activities.filter(a=>a[fmap[key]]===val).length;
  if(used>0&&!confirm('"'+val+'" used in '+used+' activities. Remove anyway?'))return;
  S.lovs[key].splice(idx,1);saveState();renderSettings();populateFilters();renderTable();showToast('Removed: '+val);
}

// ── TASK VIEW ──────────────────────────────────────
function initTaskView(){
  const sel=document.getElementById('tv-task-sel');
  if(!sel)return;
  const prev=sel.value;
  sel.innerHTML=S.activities.map(a=>`<option value="${a.id}">${a.no}: ${esc(a.name)}</option>`).join('');
  if(prev)sel.value=prev;
  renderTaskView();
}

function renderTaskView(){
  const sel=document.getElementById('tv-task-sel');
  if(!sel||!sel.value)return;
  const a=S.activities.find(x=>x.id===parseInt(sel.value));
  if(!a)return;

  const ea=can('editActivity'),eb=can('editBudget');
  const la=ea?'':'disabled',lb=eb?'':'disabled';
  const MONTHS_ACTIVE=(a.months||[]).map((v,i)=>v?i:-1).filter(i=>i>=0);
  const STATUS_COLOR={Active:'#1E3A8A',Done:'#16a34a',Planned:'#f59e0b',Paused:'#f97316'};
  const STATUS_BG={Active:'rgba(30,58,138,.25)',Done:'rgba(22,163,74,.25)',Planned:'rgba(245,158,11,.25)',Paused:'rgba(249,115,22,.25)'};

  // ── Totals
  const totalPlan=Object.values(a.monthBudget||{}).reduce((s,v)=>s+(v||0),0);
  const totalSpent=Object.values(a.monthSpent||{}).reduce((s,v)=>s+(v||0),0);
  const totalVar=totalPlan-totalSpent;
  const budgetPct=totalPlan>0?Math.min(100,Math.round(totalSpent/totalPlan*100)):0;
  // Aggregate month outcomes for months this task is active
  let totLeads=0,totVisits=0,totAdm=0,totReach=0;
  MONTHS_ACTIVE.forEach(i=>{
    const oc=S.monthOutcomes[String(i)]||{};
    totLeads+=(oc.leads||0); totVisits+=(oc.visits||0);
    totAdm+=(oc.admissions||0); totReach+=(oc.reach||0);
  });
  const sClass={Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'}[a.status]||'s-planned';

  // ── Hero
  const heroHTML=`
    <div class="tv-hero">
      <div class="tv-hero-no">Activity ${a.no} · ${esc(a.mainBucket||'')}</div>
      <div class="tv-hero-title">${esc(a.name)}</div>
      <div class="tv-hero-meta">
        <span class="tv-hero-chip">🏷️ ${esc(a.type)}</span>
        <span class="tv-hero-chip">📡 ${esc(a.channel||'')}</span>
        <span class="tv-hero-chip">👤 ${esc(a.owner)}</span>
        <span class="tv-hero-chip">⚡ ${esc(a.exec||'')}</span>
        <span class="tv-hero-chip">${a.paid||'Paid'}</span>
        <span class="sv ${sClass}" style="font-size:11px;padding:4px 14px;align-self:center">${a.status}</span>
      </div>
      <div class="tv-hero-bottom">
        <div class="tv-stat"><div class="tv-stat-val">${fmt(a.budget||0)}</div><div class="tv-stat-lbl">Total Budget</div></div>
        <div class="tv-divider"></div>
        <div class="tv-stat"><div class="tv-stat-val">${fmt(totalPlan)}</div><div class="tv-stat-lbl">Planned Across Months</div></div>
        <div class="tv-divider"></div>
        <div class="tv-stat"><div class="tv-stat-val">${fmt(totalSpent)}</div><div class="tv-stat-lbl">Total Spent</div></div>
        <div class="tv-divider"></div>
        <div class="tv-stat"><div class="tv-stat-val" style="color:${totalVar>=0?'#86efac':'#fca5a5'}">${totalVar>=0?'+':''}${fmt(Math.abs(totalVar))}</div><div class="tv-stat-lbl">Variance</div></div>
        <div class="tv-divider"></div>
        <div class="tv-stat"><div class="tv-stat-val">${MONTHS_ACTIVE.length}</div><div class="tv-stat-lbl">Active Months</div></div>
        <div class="tv-divider"></div>
        <div class="tv-stat"><div class="tv-stat-val">${budgetPct}%</div><div class="tv-stat-lbl">Budget Used</div></div>
      </div>
      ${a.details?`<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.2);font:400 12px var(--fn);color:rgba(255,255,255,.85);line-height:1.6">${esc(a.details)}</div>`:''}
    </div>`;

  // ── KPI strip
  const cpl=totLeads&&totalSpent?fmt(Math.round(totalSpent/totLeads)):'—';
  const cpa=totAdm&&totalSpent?fmt(Math.round(totalSpent/totAdm)):'—';
  const convRate=totLeads?((totAdm/totLeads)*100).toFixed(1)+'%':'—';
  const kpiHTML=`<div class="tv-kpi-strip">
    <div class="tv-kpi a"><div class="tv-kpi-lbl">Total Planned</div><div class="tv-kpi-val">${fmt(totalPlan)}</div><div class="tv-kpi-sub">${MONTHS_ACTIVE.length} months</div></div>
    <div class="tv-kpi c"><div class="tv-kpi-lbl">Total Spent</div><div class="tv-kpi-val">${fmt(totalSpent)}</div><div class="tv-kpi-sub">${budgetPct}% of plan</div></div>
    <div class="tv-kpi ${totalVar>=0?'g':'c'}"><div class="tv-kpi-lbl">Variance</div><div class="tv-kpi-val">${totalVar>=0?'+':''}${fmt(Math.abs(totalVar))}</div><div class="tv-kpi-sub">${totalVar>=0?'Under':'Over'} budget</div></div>
    <div class="tv-kpi p"><div class="tv-kpi-lbl">Leads (months)</div><div class="tv-kpi-val">${totLeads}</div><div class="tv-kpi-sub">Cost/lead: ${cpl}</div></div>
    <div class="tv-kpi t"><div class="tv-kpi-lbl">School Visits</div><div class="tv-kpi-val">${totVisits}</div><div class="tv-kpi-sub">Conv: ${convRate}</div></div>
    <div class="tv-kpi g"><div class="tv-kpi-lbl">Admissions</div><div class="tv-kpi-val">${totAdm}</div><div class="tv-kpi-sub">Cost/adm: ${cpa}</div></div>
  </div>`;

  // ── Chart + Notes side panel
  const chartId='ch-tv-'+a.id;
  const _chartAct=a; // capture for setTimeout closure
  const _chartActMths=MONTHS_ACTIVE;

  const mainHTML=`<div class="tv-main">
    <div class="tv-chart-card">
      <h3>📈 Budget Burn — Plan vs Actual (₹K)</h3>
      <div style="height:200px"><canvas id="${chartId}"></canvas></div>
      <div style="height:1px;background:var(--bd);margin:12px 0"></div>
      <h3>🎯 Leads Generated by Month</h3>
      <div style="height:120px"><canvas id="${chartId}-leads"></canvas></div>
    </div>
    <div class="tv-notes-card">
      <h3>📝 Activity Notes</h3>
      <div style="font:700 9px var(--fn);color:var(--mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Overall Notes</div>
      <textarea class="tv-mc-remark" style="min-height:80px" ${la} placeholder="General notes, strategy, context…"
        onchange="upd(${a.id},'notes',this.value)">${esc(a.notes||'')}</textarea>
      <div style="height:10px"></div>
      <div style="font:700 9px var(--fn);color:var(--mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Activity Details</div>
      <textarea class="tv-mc-remark" style="min-height:80px" ${la} placeholder="Detailed description of the activity…"
        onchange="upd(${a.id},'details',this.value)">${esc(a.details||'')}</textarea>
      <div style="height:10px"></div>
      <div style="font:700 9px var(--fn);color:var(--mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Last Year Spend</div>
      <input type="number" class="cv-bd-inp" style="font-size:14px;padding:6px 10px" value="${a.lastSpend||''}" placeholder="0" ${lb}
        onchange="upd(${a.id},'lastSpend',parseInt(this.value)||0)">
      <div style="margin-top:10px;font:600 11px var(--fn);color:var(--mid)">
        ${a.lastYr?'✅ Executed last year':'○ New this year'} &nbsp;·&nbsp;
        Need: <strong>${a.need||'—'}</strong>
      </div>
    </div>
  </div>`;

  // ── 12-month timeline
  const timelineHTML=`<h3 style="font:700 15px var(--fh);color:var(--t);margin-bottom:12px">📅 Month-by-Month Timeline</h3>
  <div class="tv-timeline">
  ${MNAMES.map((mn,i)=>{
    const mi=String(i);
    const yr=MYEARS[i];
    const isActive=(a.months||[])[i];
    const plan=(a.monthBudget||{})[mi]||0;
    const spent=(a.monthSpent||{})[mi]||0;
    const variance2=plan-spent;
    const pct2=plan>0?Math.min(100,Math.round(spent/plan*100)):0;
    const barClr=pct2>=100?'var(--coral)':pct2>=70?'var(--amber)':'var(--g)';
    const rem=esc((a.remarks||{})[mi]||'');
    const oc=S.monthOutcomes[mi]||{};

    if(!isActive){
      return `<div class="tv-mc inactive-month">
        <div class="tv-mc-head inactive-head">
          <div><div class="tv-mc-month inactive">${mn}</div><div class="tv-mc-yr inactive">${yr}</div></div>
          <span class="tv-mc-badge" style="background:#e0e0e0;color:#999">Not Planned</span>
        </div>
        <div class="tv-mc-body">
          <div style="font-size:11px;color:var(--mid);text-align:center;padding:4px 0">Not scheduled</div>
          ${ea?`<button class="tv-activate-btn" onclick="tvActivateMonth(${a.id},${i})">+ Activate Month</button>`:''}
        </div>
      </div>`;
    }

    const sColor=STATUS_COLOR[a.status]||'#888';
    const sBg=STATUS_BG[a.status]||'rgba(0,0,0,.1)';
    return `<div class="tv-mc active-month">
      <div class="tv-mc-head active-head">
        <div><div class="tv-mc-month">${mn}</div><div class="tv-mc-yr">${yr}</div></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="tv-mc-badge" style="background:${sBg};color:#fff">${a.status}</span>
          <button class="tv-mc-detail-btn" onclick="switchPanel('taskview',null);openCalTask(${a.id},${i})" title="Full detail">↗</button>
        </div>
      </div>
      <div class="tv-mc-body">
        ${plan?`<div class="tv-mc-bar-wrap"><div class="tv-mc-bar" style="width:${pct2}%;background:${barClr}"></div></div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div class="tv-mc-field">
            <label>Plan ₹</label>
            <input type="number" value="${plan||''}" placeholder="0" ${lb}
              onchange="saveCalPlan(${a.id},'${mi}',this.value);document.querySelectorAll('#tv-content .tv-mc.active-month').forEach(()=>{})">
          </div>
          <div class="tv-mc-field">
            <label>Spent ₹</label>
            <input type="number" class="act" value="${spent||''}" placeholder="0" ${la}
              onchange="saveCalSpent(${a.id},'${mi}',this.value)">
          </div>
        </div>
        <div class="tv-mc-var ${variance2>=0?'pos':'neg'}">${plan||spent?(variance2>=0?'✓ +':'▲ ')+fmt(Math.abs(variance2)):'No budget set'}</div>
        ${oc.leads||oc.admissions||oc.visits?
          `<div class="tv-mc-oc-row">
            <span>🎯 ${oc.leads||0} leads</span>
            <span>🏫 ${oc.visits||0} vis</span>
            <span>✅ ${oc.admissions||0} adm</span>
          </div>`:''}
        <textarea class="tv-mc-remark" rows="2" placeholder="Month remarks…" ${la}
          onchange="saveCalRemark(${a.id},'${mi}',this.value)">${rem}</textarea>
        ${ea?`<button class="tv-activate-btn" style="border-color:var(--coral);color:var(--coral)"
          onclick="tvDeactivateMonth(${a.id},${i})">× Remove Month</button>`:''}
      </div>
    </div>`;
  }).join('')}
  </div>`;

  document.getElementById('tv-content').innerHTML=heroHTML+kpiHTML+mainHTML+timelineHTML;

  // Draw charts after DOM is ready
  setTimeout(()=>{
    const cLabels=_chartActMths.map(i=>MNAMES[i]);
    const cPlan=_chartActMths.map(i=>Math.round(((_chartAct.monthBudget||{})[String(i)]||0)/1000));
    const cSpent=_chartActMths.map(i=>Math.round(((_chartAct.monthSpent||{})[String(i)]||0)/1000));
    const cLeads=_chartActMths.map(i=>(S.monthOutcomes[String(i)]||{}).leads||0);
    const ctx=document.getElementById(chartId);
    if(ctx){
      if(CHARTS[chartId])CHARTS[chartId].destroy();
      CHARTS[chartId]=new Chart(ctx,{type:'bar',
        data:{labels:cLabels,datasets:[
          {label:'Planned (₹K)',data:cPlan,backgroundColor:'rgba(30,58,138,.7)',borderRadius:4},
          {label:'Spent (₹K)',data:cSpent,backgroundColor:'rgba(233,105,95,.7)',borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:10}},
            tooltip:{callbacks:{label:c=>' ₹'+c.parsed.y+'K'}}},
          scales:{y:{grid:{color:'#eee'},ticks:{callback:v=>'₹'+v+'K',font:{size:10}}},
            x:{ticks:{font:{size:10}}}}}});
    }
    const lCtx=document.getElementById(chartId+'-leads');
    if(lCtx){
      if(CHARTS[chartId+'-leads'])CHARTS[chartId+'-leads'].destroy();
      CHARTS[chartId+'-leads']=new Chart(lCtx,{type:'bar',
        data:{labels:cLabels,datasets:[
          {label:'Leads',data:cLeads,backgroundColor:'rgba(124,58,237,.65)',borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false}},
          scales:{y:{grid:{color:'#eee'},ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}}});
    }
  },80);
}

function tvActivateMonth(aId,mi){
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  if(!a.months)a.months=Array(NMONTHS).fill(0);
  a.months[mi]=1;saveState();
  showToast(MNAMES[mi]+' activated ✔','ok');
  renderTaskView();
}
function tvDeactivateMonth(aId,mi){
  const a=S.activities.find(x=>x.id===parseInt(aId));if(!a)return;
  const hasSpend=((a.monthSpent||{})[String(mi)]||0)>0;
  if(hasSpend&&!confirm('This month has recorded spend. Remove anyway?'))return;
  a.months[mi]=0;
  delete (a.monthBudget||{})[String(mi)];
  redistributeTaskBudget(a);
  saveState();
  showToast(MNAMES[mi]+' removed — budget redistributed','ok');
  renderTaskView();
}

// ── BUDGET MANAGER ─────────────────────────────────
function switchBMMode(mode){
  activeBMMode=mode;
  document.getElementById('bm-btn-month').classList.toggle('active',mode==='month');
  document.getElementById('bm-btn-task').classList.toggle('active',mode==='task');
  document.getElementById('bm-month-sel').style.display=mode==='month'?'block':'none';
  document.getElementById('bm-task-sel').style.display=mode==='task'?'block':'none';
  document.getElementById('bm-redist-btn').style.display=mode==='task'?'inline-flex':'none';
  renderBudgetMgr();
}

function initBudgetMgr(){
  // Populate month selector
  const ms=document.getElementById('bm-month-sel');
  if(!ms)return;
  ms.innerHTML=MNAMES.map((m,i)=>{
    const yr=MYEARS[i];
    return `<option value="${i}">${m} ${yr}</option>`;
  }).join('');

  // Populate task selector
  const ts=document.getElementById('bm-task-sel');
  if(!ts)return;
  ts.innerHTML=S.activities.map(a=>`<option value="${a.id}">${a.no}: ${esc(a.name)}</option>`).join('');

  // Set mode visuals
  switchBMMode(activeBMMode);
}

function renderBudgetMgr(){
  if(activeBMMode==='month') renderBMMonth();
  else renderBMTask();
}

function renderBMMonth(){
  const mi=String(document.getElementById('bm-month-sel')?.value||'0');
  const mIdx=parseInt(mi);
  const mName=MLABEL(mIdx);
  const acts=S.activities.filter(a=>a.months&&a.months[mIdx]);
  const eb=can('editBudget'),ea=can('editActivity');

  // Strip totals
  const planTotal=acts.reduce((s,a)=>s+((a.monthBudget||{})[mi]||0),0);
  const spentTotal=acts.reduce((s,a)=>s+((a.monthSpent||{})[mi]||0),0);
  const variance=planTotal-spentTotal;
  const oc=S.monthOutcomes[mi]||{};
  document.getElementById('bm-strip').innerHTML=`
    <div class="bm-stat"><div class="bm-st-lbl">📋 Activities</div><div class="bm-st-val">${acts.length}</div></div>
    <div class="bm-stat amber"><div class="bm-st-lbl">Month Plan ₹</div><div class="bm-st-val">${fmt(planTotal)}</div></div>
    <div class="bm-stat teal"><div class="bm-st-lbl">Actual Spent ₹</div><div class="bm-st-val">${fmt(spentTotal)}</div></div>
    <div class="bm-stat ${variance>=0?'green':'coral'}"><div class="bm-st-lbl">Variance</div><div class="bm-st-val ${variance>=0?'var-pos':'var-neg'}">${variance>=0?'+':''}${fmt(Math.abs(variance))}</div></div>
    <div class="bm-stat purple"><div class="bm-st-lbl">🎯 Leads</div><div class="bm-st-val">${oc.leads||0}</div></div>
    <div class="bm-stat green"><div class="bm-st-lbl">✅ Admissions</div><div class="bm-st-val">${oc.admissions||0}</div></div>`;

  // Outcomes panel
  document.getElementById('bm-outcomes').innerHTML=`
    <div class="bm-oc-title">📊 ${mName} Outcomes</div>
    <div class="bm-oc-grid">
      <div class="bm-oc-f"><label>💰 Actual Spent ₹</label><input type="number" value="${oc.spent||''}" placeholder="0" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','spent',this.value)"></div>
      <div class="bm-oc-f"><label>🎯 Leads Generated</label><input type="number" value="${oc.leads||''}" placeholder="0" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','leads',this.value)"></div>
      <div class="bm-oc-f"><label>🏫 School Visits</label><input type="number" value="${oc.visits||''}" placeholder="0" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','visits',this.value)"></div>
      <div class="bm-oc-f"><label>✅ Admissions</label><input type="number" value="${oc.admissions||''}" placeholder="0" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','admissions',this.value)"></div>
      <div class="bm-oc-f"><label>📡 Brand Reach</label><input type="number" value="${oc.reach||''}" placeholder="0" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','reach',this.value)"></div>
      <div class="bm-oc-f span2"><label>📝 Notes</label><textarea placeholder="Document results, campaign outcomes, brand visibility…" ${ea?'':'disabled'} oninput="saveBMOutcome('${mi}','notes',this.value)">${oc.notes||''}</textarea></div>
    </div>`;

  // Table
  const lb=eb?'':'disabled', la=ea?'':'disabled';
  document.getElementById('bm-thead').innerHTML=`
    <th style="width:36px">#</th><th style="min-width:180px">Activity</th>
    <th>Owner</th><th style="text-align:right">Total Budget</th>
    <th style="text-align:right">Month Plan ₹</th><th style="text-align:right">Actual Spent ₹</th>
    <th style="text-align:right">Variance</th><th>Status</th><th style="min-width:140px">Remarks</th>`;
  document.getElementById('bm-body').innerHTML=acts.map(a=>{
    const plan=(a.monthBudget||{})[mi]||0;
    const spent=(a.monthSpent||{})[mi]||0;
    const rem=plan-spent;
    const remarks=(a.remarks||{})[mi]||'';
    const sClass={Active:'s-active',Done:'s-done',Planned:'s-planned',Paused:'s-paused'}[a.status]||'s-planned';
    return `<tr>
      <td style="font:700 11px var(--fn);color:var(--mid)">${a.no}</td>
      <td style="font-weight:600">${esc(a.name)}</td>
      <td style="font-size:11px">${esc(a.owner)}</td>
      <td style="text-align:right;color:var(--mid)">${fmt(a.budget||0)}</td>
      <td><input class="bm-inp" type="number" value="${plan||''}" placeholder="0" ${lb}
          onchange="saveBMPlan('${a.id}','${mi}',this.value)"></td>
      <td><input class="bm-inp" type="number" value="${spent||''}" placeholder="0" ${la}
          onchange="saveBMSpent('${a.id}','${mi}',this.value)"></td>
      <td style="text-align:right;font-weight:700;color:${rem>=0?'var(--g)':'var(--coral)'}">${rem>=0?'+':''}${fmt(Math.abs(rem))}</td>
      <td><span class="sv ${sClass}" style="font-size:10px;padding:2px 8px 2px 6px">${a.status}</span></td>
      <td><input class="bm-inp" style="width:100%" type="text" value="${escQ(remarks)}" placeholder="Notes…" ${la}
          onchange="saveBMRemarks('${a.id}','${mi}',this.value)"></td>
    </tr>`;
  }).join('');
  const pct=planTotal>0?Math.min(100,Math.round(spentTotal/planTotal*100)):0;
  document.getElementById('bm-footer').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--mid)">
      <strong>${acts.length} activities in ${mName}</strong>
      <span>Plan: ${fmt(planTotal)}</span>
      <span>Spent: ${fmt(spentTotal)}</span>
      <span style="color:${variance>=0?'var(--g)':'var(--coral)'}">Variance: ${variance>=0?'+':''}${fmt(Math.abs(variance))}</span>
      <div style="flex:1;height:6px;background:var(--bd);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--coral)':'var(--t)'};border-radius:3px;transition:width .3s"></div>
      </div>
      <span>${pct}% used</span>
    </div>`;
}

function renderBMTask(){
  const taskId=parseInt(document.getElementById('bm-task-sel')?.value)||0;
  bmTaskId=taskId;
  const a=S.activities.find(x=>x.id===taskId);
  if(!a){ document.getElementById('bm-strip').innerHTML='<div class="bm-stat"><div class="bm-st-lbl">Select a task above</div></div>'; return; }
  const eb=can('editBudget'),ea=can('editActivity');
  const totalPlan=Object.values(a.monthBudget||{}).reduce((s,v)=>s+(v||0),0);
  const totalSpent=Object.values(a.monthSpent||{}).reduce((s,v)=>s+(v||0),0);
  const variance=totalPlan-totalSpent;
  const activeMonths=(a.months||[]).filter(Boolean).length;

  document.getElementById('bm-strip').innerHTML=`
    <div class="bm-stat"><div class="bm-st-lbl">Task Budget</div><div class="bm-st-val">${fmt(a.budget||0)}</div></div>
    <div class="bm-stat amber"><div class="bm-st-lbl">Total Plan</div><div class="bm-st-val">${fmt(totalPlan)}</div></div>
    <div class="bm-stat teal"><div class="bm-st-lbl">Total Spent</div><div class="bm-st-val">${fmt(totalSpent)}</div></div>
    <div class="bm-stat ${variance>=0?'green':'coral'}"><div class="bm-st-lbl">Variance</div><div class="bm-st-val ${variance>=0?'var-pos':'var-neg'}">${variance>=0?'+':''}${fmt(Math.abs(variance))}</div></div>
    <div class="bm-stat purple"><div class="bm-st-lbl">Active Months</div><div class="bm-st-val">${activeMonths}</div></div>
    <div class="bm-stat"><div class="bm-st-lbl">Status</div><div class="bm-st-val" style="font-size:13px">${a.status}</div></div>`;

  document.getElementById('bm-outcomes').innerHTML=`
    <div class="bm-oc-title">📋 ${esc(a.name)} — <span style="color:var(--mid);font-size:13px">${esc(a.type)} · ${esc(a.owner)}</span></div>
    <div style="font-size:12px;color:var(--mid);padding:8px 0 4px">
      Toggle months on/off below. Use <strong>⚖ Redistribute Budget</strong> to re-split the remaining budget equally across months with no spend.
    </div>`;

  // Build 12-month table
  document.getElementById('bm-thead').innerHTML=`
    <th style="width:100px">Month</th><th style="width:80px;text-align:center">Active</th>
    <th style="text-align:right;width:120px">Plan ₹</th><th style="text-align:right;width:120px">Actual ₹</th>
    <th style="text-align:right;width:100px">Variance</th>
    <th style="width:80px;text-align:right">Leads</th><th style="width:80px;text-align:right">Visits</th><th style="width:80px;text-align:right">Adm</th>
    <th style="min-width:140px">Notes</th>`;
  document.getElementById('bm-body').innerHTML=MNAMES.map((mn,i)=>{
    const mi=String(i); const yr=MYEARS[i];
    const isActive=(a.months||[])[i]?1:0;
    const plan=(a.monthBudget||{})[mi]||0;
    const spent=(a.monthSpent||{})[mi]||0;
    const rem=plan-spent;
    const oc=S.monthOutcomes[mi]||{};
    const hasSpend=spent>0;
    const lb=eb?'':'disabled', la=ea?'':'disabled';
    return `<tr style="opacity:${isActive?1:.45}">
      <td style="font-weight:600;color:var(--t)">${mn} ${yr}</td>
      <td style="text-align:center">
        <label class="bm-toggle">
          <input type="checkbox" ${isActive?'checked':''} onchange="toggleBMMonth('${a.id}',${i},this.checked)">
          <span class="bm-tog-track"><span class="bm-tog-thumb"></span></span>
        </label>
      </td>
      <td><input class="bm-inp" type="number" value="${plan||''}" placeholder="—" ${isActive?lb:'disabled'}
          onchange="saveBMPlan('${a.id}','${mi}',this.value)"></td>
      <td><input class="bm-inp" type="number" value="${spent||''}" placeholder="—" ${isActive?la:'disabled'}
          onchange="saveBMSpent('${a.id}','${mi}',this.value)"></td>
      <td style="text-align:right;font-weight:700;color:${rem>=0?'var(--g)':'var(--coral)'}">${isActive?(rem>=0?'+':'')+(rem>=0?fmt(rem):fmt(-rem)):'—'}</td>
      <td style="text-align:right;font-size:12px">${oc.leads||''}</td>
      <td style="text-align:right;font-size:12px">${oc.visits||''}</td>
      <td style="text-align:right;font-size:12px">${oc.admissions||''}</td>
      <td><input class="bm-inp" style="width:100%" type="text" value="${escQ((a.remarks||{})[mi]||'')}" placeholder="Notes…" ${isActive?la:'disabled'}
          onchange="saveBMRemarks('${a.id}','${mi}',this.value)"></td>
    </tr>`;
  }).join('');
  const totPct=totalPlan>0?Math.min(100,Math.round(totalSpent/totalPlan*100)):0;
  document.getElementById('bm-footer').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--mid)">
      <strong>${activeMonths} active months</strong>
      <span>Total Plan: ${fmt(totalPlan)}</span>
      <span>Total Spent: ${fmt(totalSpent)}</span>
      <span style="color:${variance>=0?'var(--g)':'var(--coral)'}">Variance: ${variance>=0?'+':''}${fmt(Math.abs(variance))}</span>
      <div style="flex:1;height:6px;background:var(--bd);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${totPct}%;background:${totPct>=100?'var(--coral)':'var(--t)'};border-radius:3px;transition:width .3s"></div>
      </div>
      <span>${totPct}% used</span>
    </div>`;
}

function toggleBMMonth(id,mi,checked){
  const a=S.activities.find(x=>x.id===parseInt(id));if(!a)return;
  if(!a.months)a.months=Array(NMONTHS).fill(0);
  const hadSpend=((a.monthSpent||{})[String(mi)]||0)>0;
  if(!checked&&hadSpend){if(!confirm('This month has recorded spend. Remove it anyway?'))return;}
  a.months[mi]=checked?1:0;
  if(!checked){delete (a.monthBudget||{})[String(mi)]; redistributeTaskBudget(a);}
  saveState(); renderBMTask();
  showToast(checked?'Month activated — redistribute to rebalance':'Month removed — budget redistributed across remaining months','ok');
}

function redistributeTaskBudget(a){
  if(!a||!a.budget)return;
  const actv=(a.months||[]).map((v,i)=>v?i:-1).filter(i=>i>=0);
  if(!actv.length){showToast('No active months to distribute to','err');return;}
  if(!a.monthBudget)a.monthBudget={};
  if(!a.monthSpent)a.monthSpent={};
  const locked=actv.filter(i=>(a.monthSpent[String(i)]||0)>0);
  const free=actv.filter(i=>(a.monthSpent[String(i)]||0)===0);
  if(!free.length){showToast('All active months have spend recorded — nothing to redistribute','err');return;}
  const lockedSum=locked.reduce((s,i)=>s+(a.monthBudget[String(i)]||0),0);
  const remaining=Math.max(0,(a.budget||0)-lockedSum);
  const perMonth=Math.round(remaining/free.length/100)*100;
  free.forEach(i=>{a.monthBudget[String(i)]=perMonth;});
  saveState();
}
function bmRedistribute(){
  if(!can('editBudget')){showToast('Requires Master or Admin','err');return;}
  const a=S.activities.find(x=>x.id===bmTaskId);if(!a){showToast('No task selected','err');return;}
  redistributeTaskBudget(a);
  renderBMTask();
  showToast('Budget redistributed across free months ✔','ok');
}

function saveBMPlan(id,mi,val){
  const a=S.activities.find(x=>x.id===parseInt(id));if(!a)return;
  if(!a.monthBudget)a.monthBudget={};
  a.monthBudget[mi]=parseInt(val)||0;
  saveState();
}
function saveBMSpent(id,mi,val){
  const a=S.activities.find(x=>x.id===parseInt(id));if(!a)return;
  if(!a.monthSpent)a.monthSpent={};
  a.monthSpent[mi]=parseInt(val)||0;
  saveState();
}
function saveBMRemarks(id,mi,val){
  const a=S.activities.find(x=>x.id===parseInt(id));if(!a)return;
  if(!a.remarks)a.remarks={};
  a.remarks[mi]=val;
  saveState();
}
function saveBMOutcome(mi,field,val){
  if(!S.monthOutcomes)S.monthOutcomes={};
  if(!S.monthOutcomes[mi])S.monthOutcomes[mi]={};
  S.monthOutcomes[mi][field]=(['spent','leads','visits','admissions','reach'].includes(field))?(parseInt(val)||0):val;
  saveState();
}

// ── RESET TO MASTER ─────────────────────────────────
function resetToMaster(){
  if(!can('admin')){showToast('Admin only','err');return;}
  if(!confirm('This will reset ALL activity data to the master Excel import.\n\nAll budget plans, spend entries, remarks and outcomes entered in this session will be lost.\n\nAre you sure?'))return;
  S.activities=RAW.map(r=>({...r,monthBudget:{},monthSpent:{},remarks:{}}));
  S.masterBudget=DEF_BUDGET;
  S.admissions=0;
  S.monthOutcomes={};
  S.nextId=1000;
  S.lovs=JSON.parse(JSON.stringify(DEFAULT_LOVS));
  saveState();
  renderTable();updateBudgetBar();
  showToast('Reset complete — '+RAW.length+' activities reloaded from master','ok');
}

// ── EXCEL EXPORT ────────────────────────────────────
function exportTrackerExcel(){
  if(typeof XLSX==='undefined'){showToast('Excel library not loaded yet — try again','err');return;}
  const acts=S.activities;

  // ── Sheet 1: Tracker Sheet ──────────────────────────
  const MONTH_LABELS=MNAMES.map((m,i)=>m+' '+MYEARS[i]); // ["Aug 2026"…"Jun 2027"]

  const headers=[
    'No','Activity Name','Activity Details','Type','Channel','Paid/Organic',
    'Main Bucket','Sub Bucket','Execution','Owner','Need','Last Year?',
    'Annual Budget (₹)','Last Yr Spend (₹)','Status','Notes',
    ...MONTH_LABELS,
    'Active Month Count',
    ...MONTH_LABELS.map(m=>'Plan ₹ '+m),
    ...MONTH_LABELS.map(m=>'Spent ₹ '+m),
    'Total Planned ₹','Total Spent ₹','Balance ₹'
  ];

  const rows=acts.map((a,idx)=>{
    const mths=a.months||Array(NMONTHS).fill(0);
    const mb=a.monthBudget||{};
    const ms=a.monthSpent||{};
    const totalPlan=Object.values(mb).reduce((s,v)=>s+(v||0),0);
    const totalSpent=Object.values(ms).reduce((s,v)=>s+(v||0),0);
    return [
      idx+1,
      a.name||'',
      a.details||'',
      a.type||'',
      a.channel||'',
      a.paid||'',
      a.mainBucket||'',
      a.subBucket||'',
      a.exec||'',
      a.owner||'',
      a.need||'',
      a.lastYr?'Yes':'No',
      a.budget||0,
      a.lastSpend||0,
      a.status||'',
      a.notes||'',
      ...mths.map(v=>v?'✓':''),
      mths.filter(v=>v).length,
      ...MONTH_LABELS.map((_,i)=>mb[String(i)]||0),
      ...MONTH_LABELS.map((_,i)=>ms[String(i)]||0),
      totalPlan, totalSpent, totalPlan-totalSpent
    ];
  });

  const ws1Data=[headers,...rows];
  const ws1=XLSX.utils.aoa_to_sheet(ws1Data);

  // Column widths
  const colW=[{wch:5},{wch:32},{wch:40},{wch:14},{wch:18},{wch:12},
              {wch:22},{wch:22},{wch:16},{wch:14},{wch:8},{wch:10},
              {wch:16},{wch:16},{wch:10},{wch:28},
              ...Array(NMONTHS).fill({wch:7}),{wch:14},
              ...Array(NMONTHS).fill({wch:14}),
              ...Array(NMONTHS).fill({wch:14}),
              {wch:16},{wch:14},{wch:14}];
  ws1['!cols']=colW;

  // Header row style (via cell format — works in xlsx)
  const range=XLSX.utils.decode_range(ws1['!ref']);
  for(let C=range.s.c;C<=range.e.c;C++){
    const addr=XLSX.utils.encode_cell({r:0,c:C});
    if(!ws1[addr]) continue;
    ws1[addr].s={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'1E3A8A'}},alignment:{horizontal:'center',wrapText:true}};
  }
  // Freeze first row
  ws1['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};

  // ── Sheet 2: Budget Summary ──────────────────────────
  const summaryHeaders=['Bucket','Activity Count','Annual Budget ₹','Total Planned ₹','Total Spent ₹','Balance ₹','% Utilised'];
  const bucketMap={};
  acts.forEach(a=>{
    const b=a.mainBucket||'Uncategorised';
    if(!bucketMap[b]) bucketMap[b]={count:0,budget:0,plan:0,spent:0};
    bucketMap[b].count++;
    bucketMap[b].budget+=(a.budget||0);
    bucketMap[b].plan+=Object.values(a.monthBudget||{}).reduce((s,v)=>s+(v||0),0);
    bucketMap[b].spent+=Object.values(a.monthSpent||{}).reduce((s,v)=>s+(v||0),0);
  });
  const summaryRows=Object.entries(bucketMap).sort((a,b)=>b[1].budget-a[1].budget).map(([bkt,d])=>[
    bkt,d.count,d.budget,d.plan,d.spent,d.plan-d.spent,
    d.plan>0?+(d.spent/d.plan*100).toFixed(1):0
  ]);
  const grandTotal=['TOTAL',acts.length,
    acts.reduce((s,a)=>s+(a.budget||0),0),
    acts.reduce((s,a)=>s+Object.values(a.monthBudget||{}).reduce((ss,v)=>ss+(v||0),0),0),
    acts.reduce((s,a)=>s+Object.values(a.monthSpent||{}).reduce((ss,v)=>ss+(v||0),0),0),0,0
  ];
  grandTotal[5]=grandTotal[3]-grandTotal[4];
  grandTotal[6]=grandTotal[3]>0?+(grandTotal[4]/grandTotal[3]*100).toFixed(1):0;
  const ws2Data=[summaryHeaders,...summaryRows,grandTotal];
  const ws2=XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols']=[{wch:28},{wch:14},{wch:18},{wch:18},{wch:16},{wch:14},{wch:12}];

  // ── Sheet 3: Monthly Budget Plan ──────────────────────
  const monthPlanHeaders=['Activity Name','Owner','Bucket','Annual Budget ₹',...MONTH_LABELS,'Total Planned ₹'];
  const monthPlanRows=acts.map(a=>{
    const mb=a.monthBudget||{};
    const rowMonths=MONTH_LABELS.map((_,i)=>mb[String(i)]||0);
    return [a.name,a.owner,a.mainBucket,a.budget||0,...rowMonths,rowMonths.reduce((s,v)=>s+v,0)];
  });
  // Totals row
  const mPlanTotals=['TOTAL','','',acts.reduce((s,a)=>s+(a.budget||0),0),
    ...MNAMES.map((_,i)=>acts.reduce((s,a)=>s+((a.monthBudget||{})[String(i)]||0),0)),
    acts.reduce((s,a)=>s+Object.values(a.monthBudget||{}).reduce((ss,v)=>ss+(v||0),0),0)
  ];
  const ws3Data=[monthPlanHeaders,...monthPlanRows,mPlanTotals];
  const ws3=XLSX.utils.aoa_to_sheet(ws3Data);
  ws3['!cols']=[{wch:32},{wch:14},{wch:22},{wch:16},...Array(NMONTHS).fill({wch:13}),{wch:16}];

  // ── Assemble workbook ──────────────────────────────
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws1,'Tracker Sheet');
  XLSX.utils.book_append_sheet(wb,ws2,'Budget Summary');
  XLSX.utils.book_append_sheet(wb,ws3,'Monthly Plan');

  const today=new Date();
  const stamp=today.getFullYear()+''+String(today.getMonth()+1).padStart(2,'0')+String(today.getDate()).padStart(2,'0');
  XLSX.writeFile(wb,'Tatva_P800_Tracker_'+stamp+'.xlsx');
  showToast('Excel exported ✔','ok');
}

// ── BOOT ────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveState();showToast('Saved!','ok');}
});
// Async startup: check Supabase session before rendering
(async()=>{
  if(!window._sb){
    await new Promise(r=>window.addEventListener('sb-ready',r,{once:true}));
  }
  if(await checkSession()) showApp();
  else document.getElementById('login-screen').classList.remove('hidden');
})();