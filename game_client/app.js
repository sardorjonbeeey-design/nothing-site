(() => {
const root=document.getElementById('app');
const cfg=window.ZAMIN_GAME_CONFIG||{};
const state={token:null,user:null,clubs:[],club:null,squad:[],market:[],lineup:null,lineupDraft:[],missions:[],fixtures:[],table:[],ledger:[],dpLedger:[],tab:'overview',crestData:'',lastMatch:null,matchLoading:false};
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v)=>{try{return new Intl.NumberFormat('en-US').format(BigInt(v||0))+' UZS';}catch{return '0 UZS';}};
const $=(s)=>root.querySelector(s);
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}
async function api(path,options={}){
 const headers={'content-type':'application/json',...(options.headers||{})};
 if(state.token)headers.authorization='Bearer '+state.token;
 if(!state.token&&cfg.devUserId)headers['x-dev-user-id']=String(cfg.devUserId);
 const response=await fetch((cfg.apiBase||'')+path,{...options,headers,body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({error:'Invalid server response'}));
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data;
}
function shell(body){
 root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><div class="top-right">'+(state.clubs.length>1?'<select id="club-switcher">'+state.clubs.map(x=>'<option value="'+x.id+'" '+(x.id===state.club.id?'selected':'')+'>'+esc(x.short_name)+' · '+esc(x.name)+'</option>').join('')+'</select>':'')+'<div class="club-context">'+miniCrest(state.club)+'<span>'+esc(state.club.name)+'</span></div><span class="tag">CLUB MANAGEMENT</span></div></header><div class="layout"><nav class="nav">'+
 [['overview','Overview'],['squad','Squad'],['market','Transfer market'],['missions','Missions'],['fixtures','Fixtures'],['league','League']].map(x=>'<button data-tab="'+x[0]+'" class="'+(state.tab===x[0]?'active':'')+'">'+x[1]+'</button>').join('')+
 '<div class="nav-foot">ISOLATED GAME CLIENT<br>NOT CONNECTED TO LIVE SYSTEMS</div></nav><main class="content">'+body+'</main></div><footer class="footer"><span>ZAMIN FK · MANAGEMENT GAME</span><span>ISOLATED BUILD 0.1</span></footer></div>';
}
function pageHead(kicker,title,sub,action){return '<div class="hero"><div><div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="sub">'+sub+'</p></div>'+(action||'')+'</div>';}
function crest(club,large){const style='style="--accent:'+esc(club.primary_colour||'#167a55')+'"';return '<div class="crest" '+style+'>'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="Club crest">':esc(club.short_name||'ZFK'))+'</div>';}
function miniCrest(club){return '<span class="mini-crest" style="--accent:'+esc(club.primary_colour||'#167a55')+'">'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="">':esc(club.short_name||'ZFK'))+'</span>';}
function overview(){
 const c=state.club;
 return pageHead('CLUB CONTROL CENTRE',esc(c.name),'Your club is ready. Build the squad, develop players and compete.', '<div class="actions"><button class="btn secondary" data-action="edit-identity">Edit identity</button><button class="btn ghost" data-action="new-club">New club</button></div>')+
 '<section class="panel club-card">'+crest(c,true)+'<div><div class="eyebrow">CLUB PROFILE</div><h2>'+esc(c.name)+' <span class="muted">· '+esc(c.short_name)+'</span></h2><p>Identity established · '+new Date(c.created_at).toLocaleDateString()+'</p></div></section>'+
 '<div class="stats"><div class="stat"><div class="label">CLUB BUDGET</div><strong>'+money(c.budget_uzs)+'</strong><p>Transfer funds</p></div><div class="stat"><div class="label">DEVELOPMENT POINTS</div><strong>'+esc(c.development_points)+'</strong><p>Player progression</p></div><div class="stat"><div class="label">SQUAD SIZE</div><strong>'+state.squad.length+'</strong><p>Registered players</p></div></div>'+
 '<section class="panel"><div class="row"><div><h2>Club development</h2><p>Choose where to focus next.</p></div></div><div class="grid2"><button class="btn secondary" data-tab="squad">Manage squad →</button><button class="btn secondary" data-tab="market">Explore transfers →</button><button class="btn secondary" data-tab="missions">Complete missions →</button><button class="btn secondary" data-tab="fixtures">View fixtures →</button></div></section>'+
 (state.lastMatch?'<section class="panel"><div class="eyebrow">LATEST MATCH</div><h2>'+esc(state.lastMatch.home_name||'Home')+' '+state.lastMatch.home_goals+' — '+state.lastMatch.away_goals+' '+esc(state.lastMatch.away_name||'Away')+'</h2><p>Match simulation completed.</p></section>':'')+'<section class="panel"><h2>Recent finances</h2><p>Club money movements in Uzbek so\'m.</p>'+(state.ledger.length?state.ledger.slice(0,6).map(t=>'<div class="fixture"><div><strong>'+esc(t.reason.replaceAll('_',' '))+'</strong><div class="meta">'+new Date(t.created_at).toLocaleDateString()+'</div></div><div class="score">'+(BigInt(t.amount_uzs)>=0n?'+':'')+money(t.amount_uzs)+'</div></div>').join(''):'<div class="empty">No transactions yet.</div>')+'</section>'+'<section class="panel"><h2>Development Points history</h2><p>Match rewards, missions and player upgrades.</p>'+(state.dpLedger.length?state.dpLedger.slice(0,6).map(t=>'<div class="fixture"><div><strong>'+esc(t.reason.replaceAll('_',' '))+'</strong><div class="meta">'+new Date(t.created_at).toLocaleDateString()+'</div></div><div class="score">'+(Number(t.amount_dp)>=0?'+':'')+esc(t.amount_dp)+' DP</div></div>').join(''):'<div class="empty">No Development Point activity yet.</div>')+'</section>';
}
function squadPage(){
 const c=state.club;
 const players=state.squad;
 const starterIds=state.lineupDraft;
 const cards=players.map(p=>'<article class="player"><div class="player-top"><span class="pill">'+esc(p.quality)+'</span><span class="rating">'+esc(p.overall)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs · Potential '+esc(p.potential)+'</div><div class="bars">'+['pace','shooting','passing','defending','physical','dribbling'].map(k=>'<div><div class="attr">'+k.slice(0,3).toUpperCase()+' '+esc(p.attributes[k])+'</div><div class="bar"><i style="width:'+Math.min(100,Number(p.attributes[k]))+'%"></i></div></div>').join('')+'</div><div class="meta">'+(starterIds.includes(p.id)?'STARTING XI':'SQUAD')+' · Value '+money(p.market_value_uzs)+'</div><div class="actions"><button class="btn '+(starterIds.includes(p.id)?'gold':'secondary')+'" data-action="toggle-starter" data-player="'+p.id+'">'+(starterIds.includes(p.id)?'Remove XI':'Add to XI')+'</button>'+['pace','shooting','passing','dribbling','defending','physical'].map(k=>'<button class="btn secondary" data-action="upgrade" data-player="'+p.id+'" data-attr="'+k+'">+'+k.slice(0,3)+'</button>').join('')+'<button class="btn danger" data-action="sell" data-player="'+p.id+'">Sell</button></div></article>').join('');
 return pageHead('THE SQUAD','Build your team','Upgrade attributes with Development Points. Potential limits each attribute.')+
 '<section class="panel"><div class="row"><div><h2>Lineup · '+starterIds.length+'/11 selected</h2><p>Choose your Starting XI and formation.</p></div><div class="actions"><button class="btn secondary" data-action="save-formation">Save formation</button><button class="btn" data-action="auto-lineup">Auto-pick XI</button></div></div><div class="field"><label>FORMATION</label><select id="formation-select">'+['4-3-3','4-4-2','4-2-3-1','3-5-2','4-1-4-1'].map(x=>'<option '+((state.lineup?.formation||'4-3-3')===x?'selected':'')+'>'+x+'</option>').join('')+'</select></div><p class="sub">Tap Add to XI or Remove XI on player cards. The lineup saves automatically when 11 players are selected.</p></section>'+
 '<div class="row" style="margin:18px 0 10px"><div class="eyebrow">REGISTERED PLAYERS · '+players.length+'</div><div class="meta">Upgrade cost increases with attribute level</div></div><div class="players">'+(cards||'<div class="empty">No players in the squad yet.</div>')+'</div>';
}
function marketPage(){
 const cards=state.market.map(p=>'<article class="player"><div class="player-top"><span class="pill">'+esc(p.quality)+'</span><span class="rating">'+esc(p.overall)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs · Potential '+esc(p.potential)+'</div><p class="sub">Market value: <strong>'+money(p.market_value_uzs)+'</strong></p><button class="btn" data-action="sign" data-player="'+p.id+'" '+(BigInt(state.club.budget_uzs)>=BigInt(p.market_value_uzs)?'':'disabled')+'>Sign player</button></article>').join('');
 return pageHead('TRANSFER MARKET','Find your next player','Sign available fictional players using your club budget.')+'<div class="players">'+(cards||'<div class="empty">No free agents available.</div>')+'</div>';
}
function missionsPage(){
 const cards=state.missions.map(m=>{const progress=Math.min(Number(m.target),Number(m.progress||0)),pct=Math.round(progress/Number(m.target)*100);return '<div class="mission"><div class="symbol">✦</div><div class="mission-main"><strong>'+esc(m.title)+'</strong><small>'+esc(m.description)+' · Reward '+esc(m.reward_dp)+' DP</small><div class="progress"><i style="width:'+pct+'%"></i></div><small>'+progress+' / '+m.target+(m.completed_at?' · COMPLETED':'')+'</small></div><span class="pill">'+(m.completed_at?'DONE':'ACTIVE')+'</span></div>';}).join('');
 return pageHead('CLUB OBJECTIVES','Missions','Earn Development Points through matches and varied objectives.')+'<section class="panel">'+(cards||'<div class="empty">Missions will appear after the game data is initialized.</div>')+'</section>';
}
function pitchMarkup(){
 const home=[[10,20],[25,14],[25,31],[25,50],[25,69],[44,22],[44,42],[44,61],[68,20],[68,50],[80,38]];
 const away=[[90,20],[75,14],[75,31],[75,50],[75,69],[56,22],[56,42],[56,61],[32,20],[32,50],[20,38]];
 const dots=home.map(p=>'<i class="dot home" style="left:'+p[0]+'%;top:'+p[1]+'%"></i>').join('')+away.map(p=>'<i class="dot away" style="left:'+p[0]+'%;top:'+p[1]+'%"></i>').join('');
 return '<div class="pitch"><div class="pitch-mid"></div><div class="pitch-circle"></div><div class="pitch-box left"></div><div class="pitch-box right"></div><div class="pitch-goal left"></div><div class="pitch-goal right"></div>'+dots+'</div>';
}
function fixturesPage(){
 const cards=state.fixtures.map(f=>'<div class="fixture"><div><div class="fixture-teams">'+miniCrest({short_name:f.home_short_name,crest_url:f.home_crest_url,primary_colour:f.home_colour})+'<strong>'+esc(f.home_name)+'</strong><span class="muted">vs</span>'+miniCrest({short_name:f.away_short_name,crest_url:f.away_crest_url,primary_colour:f.away_colour})+'<strong>'+esc(f.away_name)+'</strong></div><div class="meta">ROUND '+esc(f.round_number)+' · '+esc(f.status)+'</div></div><div class="row">'+(f.status==='played'?'<span class="score">'+f.home_goals+' : '+f.away_goals+'</span>':'<button class="btn" data-action="play" data-fixture="'+f.id+'">Play match</button>')+'</div></div>').join('');
 const match=state.matchLoading?'<div class="panel"><div class="eyebrow">LIVE SIMULATION · FAST FORWARD</div><h2>Match in progress…</h2>'+pitchMarkup()+'<p class="sub">Calculating chances, goals and match events.</p></div>':state.lastMatch?'<div class="panel"><div class="eyebrow">MATCH REPORT · FINAL SCORE</div><h2>'+esc(state.lastMatch.home_name||'Home')+' '+state.lastMatch.home_goals+' — '+state.lastMatch.away_goals+' '+esc(state.lastMatch.away_name||'Away')+'</h2>'+pitchMarkup()+'<div class="event-list">'+(state.lastMatch.events||[]).map(e=>'<div><span>'+e.minute+"'</span> "+esc(e.text)+(e.type==='goal'?' · '+e.homeScore+':'+e.awayScore:'')+'</div>').join('')+'</div></div>':'';
 return pageHead('COMPETITION','Fixtures','Watch accelerated match simulations and collect Development Points.')+match+'<section class="panel">'+(cards||'<div class="empty">The league starts after at least 10 clubs have been created. Your fixtures will appear here.</div>')+'</section>';
}
function leaguePage(){
 const rows=state.table.map((r,i)=>'<tr><td class="rank">'+(i+1)+'</td><td>'+miniCrest({short_name:r.short_name,crest_url:r.crest_url,primary_colour:r.primary_colour})+' <strong>'+esc(r.short_name)+'</strong> '+esc(r.name)+'</td><td>'+r.played+'</td><td>'+r.wins+'</td><td>'+r.draws+'</td><td>'+r.losses+'</td><td>'+r.goals_for+':'+r.goals_against+'</td><td><strong>'+r.points+'</strong></td></tr>').join('');
 return pageHead('LEAGUE','The table','League creation is triggered when the game reaches 10 clubs.')+'<section class="panel table-wrap">'+(rows?'<table><thead><tr><th>#</th><th>CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF:GA</th><th>PTS</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">No active league yet. It will be generated automatically when 10 clubs exist.</div>')+'</section>';
}
function createPage(){
 return '<div class="create">'+pageHead('NEW CLUB','Create your club','Choose your identity. Your starter squad will be assigned automatically.')+'<form id="club-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required placeholder="e.g. Tashkent United"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required placeholder="TUN"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="#167a55"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="#f0c75e"></div><div class="field"><label>CLUB CREST · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">PNG, JPG or WEBP · Maximum 2 MB</small></div><div class="field"><label>EDITABLE CREST GENERATION PROMPT</label><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></div><div class="notice">Opening budget is currently set to 0 UZS because the starting amount has not been approved. You can adjust the game balance before launch.</div><button class="btn" type="submit">Create club →</button></form></div>';
}
function identityPage(){
 const c=state.club;
 return '<div class="create">'+pageHead('CLUB SETTINGS','Edit identity','Update your name, colours and club crest.')+'<form id="identity-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required value="'+esc(c.name)+'"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required value="'+esc(c.short_name)+'"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="'+esc(c.primary_colour)+'"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="'+esc(c.secondary_colour)+'"></div><div class="field"><label>REPLACE CREST · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">Leave empty to keep the current crest.</small></div><div class="field"><label>EDITABLE CREST GENERATION PROMPT</label><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></div><div class="actions"><button class="btn" type="submit">Save identity</button><button class="btn ghost" type="button" data-tab="overview">Cancel</button></div></form></div>';
}
function render(){
 if(!state.club){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><span class="tag">ISOLATED BUILD</span></header>'+createPage()+'</div>';return;}
 let body=state.tab==='identity'?identityPage():state.tab==='overview'?overview():state.tab==='squad'?squadPage():state.tab==='market'?marketPage():state.tab==='missions'?missionsPage():state.tab==='fixtures'?fixturesPage():leaguePage();
 shell(body);
}
async function loadAll(){
 const c=await api('/api/clubs');state.clubs=c.clubs||[];
 if(!state.clubs.length){state.club=null;render();return;}
 state.club=state.club?state.clubs.find(x=>x.id===state.club.id)||state.clubs[0]:state.clubs[0];
 const id=state.club.id;
 const results=await Promise.all([
  api('/api/clubs/'+id+'/squad'),api('/api/clubs/'+id+'/lineup'),api('/api/clubs/'+id+'/missions'),api('/api/clubs/'+id+'/fixtures'),api('/api/clubs/'+id+'/league'),api('/api/market'),api('/api/clubs/'+id+'/ledger'),api('/api/clubs/'+id+'/development-ledger')
 ]);
 state.squad=results[0].players||[];state.lineup=results[1].lineup;state.lineupDraft=state.lineup?.starters?.slice()||[];state.missions=results[2].missions||[];state.fixtures=results[3].fixtures||[];state.table=results[4].table||[];state.market=results[5].players||[];state.ledger=results[6].transactions||[];state.dpLedger=results[7].transactions||[];
 render();
}
async function uploadCrest(file){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Choose a PNG, JPG or WEBP image under 2 MB.');
 const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read crest image'));reader.readAsDataURL(file);});
 return (await api('/api/uploads/crest',{method:'POST',body:{dataUrl}})).crestUrl;
}
function bestXI(formation='4-3-3'){
 const remaining=state.squad.slice(),chosen=[];
 const layouts={'4-3-3':[['GK',1],['CB',2],['LB',1],['RB',1],['DM',1],['CM',2],['LW',1],['RW',1],['ST',1]],'4-4-2':[['GK',1],['CB',2],['LB',1],['RB',1],['CM',2],['LW',1],['RW',1],['ST',2]],'4-2-3-1':[['GK',1],['CB',2],['LB',1],['RB',1],['DM',2],['AM',1],['LW',1],['RW',1],['ST',1]],'3-5-2':[['GK',1],['CB',3],['DM',1],['CM',2],['LW',1],['RW',1],['ST',2]],'4-1-4-1':[['GK',1],['CB',2],['LB',1],['RB',1],['DM',1],['CM',2],['LW',1],['RW',1],['ST',1]]};
 const requirements=layouts[formation]||layouts['4-3-3'];
 for(const [position,count] of requirements)for(let i=0;i<count;i++){remaining.sort((a,b)=>b.overall-a.overall);const ix=remaining.findIndex(p=>p.position===position);if(ix>=0)chosen.push(remaining.splice(ix,1)[0]);}
 remaining.sort((a,b)=>b.overall-a.overall);
 while(chosen.length<11&&remaining.length)chosen.push(remaining.shift());
 return {starters:chosen.map(p=>p.id),substitutes:remaining.slice(0,7).map(p=>p.id),formation};
}
root.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;render();return;}
 const b=e.target.closest('[data-action]');if(!b)return;
 try{
  const action=b.dataset.action;
  if(action==='new-club'){state.club=null;render();return;}
  if(action==='cancel-create'){state.club=state.clubs[0]||null;state.tab='overview';render();return;}
  if(action==='edit-identity'){state.tab='identity';render();return;}
  if(action==='copy-prompt'){const prompt=$('#crest-prompt')?.value||'';if(!prompt)throw new Error('Prompt is empty');if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(prompt);else{const area=$('#crest-prompt');area.select();document.execCommand('copy');}toast('Crest prompt copied');return;}
  if(action==='toggle-starter'){const id=b.dataset.player,draft=state.lineupDraft.slice(),index=draft.indexOf(id);if(index>=0)draft.splice(index,1);else{if(draft.length>=11)throw new Error('Your Starting XI already has 11 players. Remove one first.');draft.push(id);}state.lineupDraft=draft;if(draft.length===11){const subs=state.squad.filter(p=>!draft.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,7).map(p=>p.id);await api('/api/clubs/'+state.club.id+'/lineup',{method:'POST',body:{formation:$('#formation-select')?.value||state.lineup?.formation||'4-3-3',starters:draft,substitutes:subs}});toast('Starting XI saved');await loadAll();}else{render();toast(draft.length+' / 11 selected');}return;}
  if(action==='save-formation'){if(state.lineupDraft.length!==11)throw new Error('Select exactly 11 starters first');const subs=state.squad.filter(p=>!state.lineupDraft.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,7).map(p=>p.id);await api('/api/clubs/'+state.club.id+'/lineup',{method:'POST',body:{formation:$('#formation-select')?.value||'4-3-3',starters:state.lineupDraft,substitutes:subs}});toast('Formation saved');await loadAll();return;}
  if(action==='auto-lineup'){const lineup=bestXI($('#formation-select')?.value||'4-3-3');await api('/api/clubs/'+state.club.id+'/lineup',{method:'POST',body:lineup});toast('Starting XI saved');await loadAll();return;}
  if(action==='upgrade'){await api('/api/clubs/'+state.club.id+'/players/upgrade',{method:'POST',body:{playerId:b.dataset.player,attribute:b.dataset.attr,levels:1}});toast('Player upgraded');await loadAll();return;}
  if(action==='sell'){if(!confirm('Sell this player for 80% of market value?'))return;await api('/api/clubs/'+state.club.id+'/players/sell',{method:'POST',body:{playerId:b.dataset.player}});toast('Player sold');await loadAll();return;}
  if(action==='sign'){await api('/api/clubs/'+state.club.id+'/players/sign',{method:'POST',body:{playerId:b.dataset.player}});toast('Player signed');await loadAll();return;}
  if(action==='play'){state.matchLoading=true;state.tab='fixtures';render();let result;try{const response=api('/api/fixtures/'+b.dataset.fixture+'/play',{method:'POST',body:{}});[result]=await Promise.all([response,new Promise(resolve=>setTimeout(resolve,2400))]);}catch(error){state.matchLoading=false;render();throw error;}const f=result.fixture;state.matchLoading=false;const meta=state.fixtures.find(x=>x.id===f.id)||{};state.lastMatch={home_name:meta.home_name,home_short_name:meta.home_short_name,home_crest_url:meta.home_crest_url,home_colour:meta.home_colour,away_name:meta.away_name,away_short_name:meta.away_short_name,away_crest_url:meta.away_crest_url,away_colour:meta.away_colour,home_goals:f.home_goals,away_goals:f.away_goals,events:f.events||result.simulation?.events||[]};toast('Match completed: '+f.home_goals+' — '+f.away_goals);await loadAll();state.tab='fixtures';render();return;}
 }catch(err){toast(err.message||'Action failed');b.disabled=false;}
});
root.addEventListener('change',async e=>{if(e.target.id==='club-switcher'){state.club=state.clubs.find(x=>x.id===e.target.value)||state.club;state.tab='overview';await loadAll();}});
root.addEventListener('submit',async e=>{
 if(e.target.id!=='club-form'&&e.target.id!=='identity-form')return;e.preventDefault();
 const form=e.target,data=new FormData(form),button=form.querySelector('button[type=submit]');button.disabled=true;
 try{
  const file=$('#crest-file')?.files?.[0],crestUrl=file?await uploadCrest(file):undefined;
  const body={name:data.get('name'),shortName:data.get('shortName'),primaryColour:data.get('primaryColour'),secondaryColour:data.get('secondaryColour')};
  if(crestUrl)body.crestUrl=crestUrl;
  if(form.id==='identity-form'){
   const result=await api('/api/clubs/'+state.club.id+'/identity',{method:'POST',body});
   state.club=result.club;state.tab='overview';toast('Club identity updated');await loadAll();
  }else{
   if(crestUrl)body.crestUrl=crestUrl;
   const result=await api('/api/clubs',{method:'POST',body});
   state.club=result.club;state.tab='overview';toast('Club created');await loadAll();
  }
 }catch(err){toast(err.message||'Could not save club');button.disabled=false;}
});
async function boot(){
 try{
  const tg=window.Telegram&&window.Telegram.WebApp;
  if(tg&&tg.initData){tg.ready();tg.expand();const login=await api('/api/auth/telegram',{method:'POST',body:{initData:tg.initData}});state.token=login.token;state.user=login.user;}
  else if(!cfg.devUserId){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><span class="tag">ISOLATED BUILD</span></header><section class="panel create"><h1>Game client ready</h1><p class="sub">Open this client inside the configured Telegram Mini App, or set a local development user ID in config.js and enable development authentication on the isolated server.</p><div class="notice">This client is not connected to the live ZAMIN FK Mini App or production database.</div></section></div>';return;}
  await loadAll();
 }catch(err){root.innerHTML='<div class="shell"><section class="panel create"><h1>Connection unavailable</h1><p class="sub">'+esc(err.message)+'</p><p class="sub">Check the isolated game server URL, database migration and authentication settings.</p></section></div>';}
}
boot();
})();
