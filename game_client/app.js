(() => {
const root=document.getElementById('app');
const cfg=window.ZAMIN_GAME_CONFIG||{};
const state={token:null,user:null,clubs:[],club:null,squad:[],market:[],lineup:null,lineupDraft:[],missions:[],fixtures:[],table:[],ledger:[],dpLedger:[],tab:'overview',crestData:'',results:[],newResults:0,resultIndex:0,opening:false,report:null,friendlies:[],opponents:[],youth:[],affordableOnly:false,season:null,previousSeason:null,squadLimits:{min:13,max:26},formations:[],formationInfo:null,formationDraft:null};
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v)=>{try{return new Intl.NumberFormat('en-US').format(BigInt(v||0))+' UZS';}catch{return '0 UZS';}};
const $=(s)=>root.querySelector(s);
const TZ='Asia/Tashkent';
const whenFormat=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const when=(v)=>v?whenFormat.format(new Date(v))+' · Tashkent time':'Date not recorded';
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
 [['overview','Overview'],['squad','Squad'],['market','Transfer market'],['missions','Missions'],['fixtures','Fixtures'],['results','Results'],['friendlies','Friendlies'],['league','League']].map(x=>'<button data-tab="'+x[0]+'" class="'+(state.tab===x[0]?'active':'')+'">'+x[1]+'</button>').join('')+
 '<div class="nav-foot">ISOLATED GAME CLIENT<br>NOT CONNECTED TO LIVE SYSTEMS</div></nav><main class="content">'+body+'</main></div><footer class="footer"><span>ZAMIN FK · MANAGEMENT GAME</span><span>ISOLATED BUILD 0.1</span></footer></div>';
}
function pageHead(kicker,title,sub,action){return '<div class="hero"><div><div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="sub">'+sub+'</p></div>'+(action||'')+'</div>';}
function crest(club,large){const style='style="--accent:'+esc(club.primary_colour||'#167a55')+'"';return '<div class="crest" '+style+'>'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="Club crest">':esc(club.short_name||'ZFK'))+'</div>';}
function miniCrest(club){return '<span class="mini-crest" style="--accent:'+esc(club.primary_colour||'#167a55')+'">'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="">':esc(club.short_name||'ZFK'))+'</span>';}
function overview(){
 const c=state.club;
 return pageHead('CLUB CONTROL CENTRE',esc(c.name),'Your club is ready. Build the squad, develop players and compete.', '<div class="actions"><button class="btn secondary" data-action="edit-identity">Edit identity</button></div>')+
 '<section class="panel club-card">'+crest(c,true)+'<div><div class="eyebrow">CLUB PROFILE</div><h2>'+esc(c.name)+' <span class="muted">· '+esc(c.short_name)+'</span></h2><p>Identity established · '+new Date(c.created_at).toLocaleDateString()+'</p></div></section>'+
 '<div class="stats"><div class="stat"><div class="label">CLUB BUDGET</div><strong>'+money(c.budget_uzs)+'</strong><p>Transfer funds</p></div><div class="stat"><div class="label">DEVELOPMENT POINTS</div><strong>'+esc(c.development_points)+'</strong><p>Player progression</p></div><div class="stat"><div class="label">SQUAD SIZE</div><strong>'+state.squad.length+'</strong><p>Registered players</p></div></div>'+
 '<section class="panel"><div class="row"><div><h2>Club development</h2><p>Choose where to focus next.</p></div></div><div class="grid2"><button class="btn secondary" data-tab="squad">Manage squad →</button><button class="btn secondary" data-tab="market">Explore transfers →</button><button class="btn secondary" data-tab="missions">Complete missions →</button><button class="btn secondary" data-tab="fixtures">View fixtures →</button></div></section>'+
 (state.results[0]?'<section class="panel"><div class="row"><div><div class="eyebrow">LATEST MATCH</div><h2>'+esc(state.results[0].home_name)+' '+state.results[0].home_goals+' — '+state.results[0].away_goals+' '+esc(state.results[0].away_name)+'</h2><p>'+when(state.results[0].kickoff_at)+'</p></div><button class="btn secondary" data-tab="results">All results →</button></div></section>':'')+'<section class="panel"><h2>Recent finances</h2><p>Club money movements in Uzbek so\'m.</p>'+(state.ledger.length?state.ledger.slice(0,6).map(t=>'<div class="fixture"><div><strong>'+esc(t.reason.replaceAll('_',' '))+'</strong><div class="meta">'+new Date(t.created_at).toLocaleDateString()+'</div></div><div class="score">'+(BigInt(t.amount_uzs)>=0n?'+':'')+money(t.amount_uzs)+'</div></div>').join(''):'<div class="empty">No transactions yet.</div>')+'</section>'+'<section class="panel"><h2>Development Points history</h2><p>Match rewards, missions and player upgrades.</p>'+(state.dpLedger.length?state.dpLedger.slice(0,6).map(t=>'<div class="fixture"><div><strong>'+esc(t.reason.replaceAll('_',' '))+'</strong><div class="meta">'+new Date(t.created_at).toLocaleDateString()+'</div></div><div class="score">'+(Number(t.amount_dp)>=0?'+':'')+esc(t.amount_dp)+' DP</div></div>').join(''):'<div class="empty">No Development Point activity yet.</div>')+'</section>';
}
const tierNames={academy:'PROSPECT',developing:'DEVELOPING',established:'ESTABLISHED',elite:'ELITE'};
function tier(p){return esc(tierNames[p.quality]||p.quality);}
function resaleRate(p){return p.origin==='academy'&&!p.first_sale_done?50:80;}
// ---- Formations. Definitions, suitability and the best XI per formation come from the server; the client only lists them.
const formationDef=id=>state.formations.find(f=>f.id===id)||state.formations[0]||null;
const slotFit=(slot,position)=>slot.natural.includes(position)?1:slot.cover.includes(position)?0.5:0;
// Same rule as the server: as many players as possible in a valid role, then as many natural roles as possible.
function arrangeXI(def,players){
 const n=Math.min(players.length,11),size=1<<11,best=new Int16Array(size).fill(-1),from=new Int8Array(size);best[0]=0;
 for(let mask=0;mask<size;mask++){
  if(best[mask]<0)continue;let k=0;for(let m=mask;m;m&=m-1)k++;if(k>=n)continue;
  for(let s=0;s<11;s++){const bit=1<<s;if(mask&bit)continue;const f=slotFit(def.slots[s],players[k].position),score=best[mask]+(f===1?34:f?33:0);if(score>best[mask|bit]){best[mask|bit]=score;from[mask|bit]=s;}}
 }
 let end=0,top=-1;for(let mask=0;mask<size;mask++){let k=0;for(let m=mask;m;m&=m-1)k++;if(k===n&&best[mask]>top){top=best[mask];end=mask;}}
 const slots=def.slots.map(slot=>({slot,player:null,fit:0}));
 for(let k=n-1,mask=end;k>=0;k--){const s=from[mask];slots[s].player=players[k];slots[s].fit=slotFit(def.slots[s],players[k].position);mask^=1<<s;}
 const placed=slots.filter(x=>x.player),natural=placed.filter(x=>x.fit===1).length,cover=placed.filter(x=>x.fit===0.5).length,wrong=placed.length-natural-cover;
 // Only the goalkeeper and the count are decided here. Whether players out of position are acceptable is the server's decision,
 // and so is the lineup the club already has: unchanged, it is sent as it is.
 const keepers=players.filter(p=>p.position==='GK').length,saved=state.lineup||{},unchanged=def.id===saved.formation&&players.length===11&&players.every(p=>(saved.starters||[]).includes(p.id));
 let problem='';
 if(players.length!==11)problem='Select exactly 11 starters ('+players.length+' selected).';
 else if(keepers<1)problem='Your Starting XI must include a goalkeeper.';
 else if(keepers>1&&!unchanged)problem='A Starting XI needs exactly one goalkeeper.';
 return {slots,natural,cover,wrong,fit:natural+cover/2,problem};
}
const draftPlayers=()=>state.lineupDraft.map(id=>state.squad.find(p=>p.id===id)).filter(Boolean);
const signed=n=>(n>=0?'+':'')+Number(n).toFixed(2);
// The 12 formations as a grid of numbers. Under each: the strength of the best XI this squad can field in it and its formation fit.
function formationPicker(){
 return '<div class="formations" role="listbox" aria-label="Formation">'+state.formations.map(f=>{
  const active=f.id===state.formationDraft,saved=f.id===state.lineup?.formation;
  return '<button type="button" role="option" aria-selected="'+active+'" class="formation'+(active?' active':'')+(saved?' saved':'')+(f.best.valid?'':' unfit')+'" data-action="pick-formation" data-formation="'+esc(f.id)+'"><strong>'+esc(f.id)+'</strong><small class="f-strength">Best XI '+esc(Number(f.best.strength).toFixed(1))+'</small><small class="f-fit">'+(f.best.valid?'Fit '+signed(f.best.fitBonus):f.best.outOfPosition+' out of position')+'</small>'+(saved?'<em>SAVED</em>':'')+'</button>';
 }).join('')+'</div>';
}
function roleList(arranged){
 const label={1:'Natural',0.5:'Cover',0:'Out of position'},kind={1:'natural',0.5:'cover',0:'wrong'};
 return '<ol class="roles">'+arranged.slots.map(x=>{const p=x.player;
  return '<li class="role '+(p?kind[x.fit]:'empty')+'"><b>'+esc(x.slot.id)+'</b><span>'+(p?esc(p.full_name):'Empty')+'</span><em>'+(p?esc(p.position)+' '+esc(p.overall):esc(x.slot.natural.join('/')))+'</em><i>'+(p?label[x.fit]:'—')+'</i></li>';
 }).join('')+'</ol>';
}
function lineupPanel(){
 const def=formationDef(state.formationDraft);
 if(!def)return '<section class="panel"><h2>Lineup</h2><p>Formations could not be loaded.</p></section>';
 const saved=state.lineup||{},arranged=arrangeXI(def,draftPlayers()),rule=state.formationInfo?.fitRule||{max:4,perPlayer:1.5};
 const sameXI=state.lineupDraft.length===(saved.starters||[]).length&&state.lineupDraft.every(id=>saved.starters.includes(id));
 const unsaved=def.id!==saved.formation||!sameXI,current=state.formationInfo?.current;
 const bonus=Math.max(-rule.max,Math.min(rule.max,rule.max-rule.perPlayer*(11-arranged.fit)));
 const status=arranged.problem?'<p class="fit-line bad" id="lineup-problem">'+esc(arranged.problem)+'</p>':'<p class="fit-line'+(arranged.wrong?' bad':'')+'" id="lineup-fit">Natural '+arranged.natural+' · Cover '+arranged.cover+' · Out of position '+arranged.wrong+' · Formation fit '+signed(bonus)+(!unsaved&&current?' · XI strength '+esc(current.strength.toFixed(1)):'')+'</p>';
 return '<section class="panel lineup"><div class="row"><div><h2>Lineup · '+state.lineupDraft.length+'/11 selected</h2><p>Choose your Starting XI and formation.</p></div><span class="pill '+(unsaved?'unsaved':'')+'" id="lineup-state">'+(unsaved?'Not saved':'Saved · '+esc(saved.formation))+'</span></div>'+
  '<div class="field"><label>FORMATION · '+esc(def.id)+'</label>'+formationPicker()+'</div>'+
  '<p class="sub" id="formation-note">'+esc(def.note)+'</p>'+status+roleList(arranged)+
  '<div class="actions"><button class="btn secondary" data-action="save-formation">Save formation</button><button class="btn" data-action="auto-lineup">Auto-pick XI</button></div>'+
  '<p class="sub">Formation fit runs from −'+rule.max+' to +'+rule.max+' and is added to your XI strength: +'+rule.max+' with eleven natural roles, less for cover roles and players out of position. Tap a formation to preview it, then Save formation or Auto-pick XI. Add to XI or Remove XI on player cards; an XI of 11 saves automatically.</p></section>';
}
async function saveLineup(formation,starters,substitutes,message){
 await api('/api/clubs/'+state.club.id+'/lineup',{method:'POST',body:{formation,starters,substitutes}});toast(message);await loadAll();
}
const draftBench=()=>state.squad.filter(p=>!state.lineupDraft.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,7).map(p=>p.id);
function squadPage(){
 const c=state.club;
 const players=state.squad;
 const starterIds=state.lineupDraft;
 const cards=players.map(p=>'<article class="player"><div class="player-top"><span class="pill">'+tier(p)+'</span><span class="rating">'+esc(p.overall)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs · Potential '+esc(p.potential)+'</div><div class="bars">'+['pace','shooting','passing','defending','physical','dribbling'].map(k=>'<div><div class="attr">'+k.slice(0,3).toUpperCase()+' '+esc(p.attributes[k])+'</div><div class="bar"><i style="width:'+Math.min(100,Number(p.attributes[k]))+'%"></i></div></div>').join('')+'</div><div class="meta">'+(starterIds.includes(p.id)?'STARTING XI':'SQUAD')+' · Value '+money(p.market_value_uzs)+'</div><div class="meta">'+(resaleRate(p)===50?'ACADEMY PRODUCT · first sale pays 50%':'Sale pays 80%')+'</div><div class="actions"><button class="btn '+(starterIds.includes(p.id)?'gold':'secondary')+'" data-action="toggle-starter" data-player="'+p.id+'">'+(starterIds.includes(p.id)?'Remove XI':'Add to XI')+'</button>'+['pace','shooting','passing','dribbling','defending','physical'].map(k=>'<button class="btn secondary" data-action="upgrade" data-player="'+p.id+'" data-attr="'+k+'">+'+k.slice(0,3)+'</button>').join('')+'<button class="btn danger" data-action="sell" data-player="'+p.id+'" data-rate="'+resaleRate(p)+'">Sell</button></div></article>').join('');
 return pageHead('THE SQUAD','Build your team','Upgrade attributes with Development Points. Potential limits each attribute.')+
 lineupPanel()+
 '<div class="row" style="margin:18px 0 10px"><div class="eyebrow">REGISTERED PLAYERS · '+players.length+' · MIN '+state.squadLimits.min+' · MAX '+state.squadLimits.max+'</div><div class="meta">Upgrade cost increases with attribute level</div></div><div class="players">'+(cards||'<div class="empty">No players in the squad yet.</div>')+'</div>';
}
function marketPage(){
 const full=state.squad.length>=state.squadLimits.max;
 const card=p=>'<article class="player"><div class="player-top"><span class="pill">'+tier(p)+'</span><span class="rating">'+esc(p.overall)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs · Potential '+esc(p.potential)+'</div><p class="sub">Market value: <strong>'+money(p.market_value_uzs)+'</strong></p><button class="btn" data-action="sign" data-player="'+p.id+'" '+(!full&&BigInt(state.club.budget_uzs)>=BigInt(p.market_value_uzs)?'':'disabled')+'>Sign player</button></article>';
 const cards=state.market.map(card).join(''),youth=state.youth.map(card).join('');
 return pageHead('TRANSFER MARKET','Find your next player','Budget '+money(state.club.budget_uzs)+' · Squad '+state.squad.length+' of '+state.squadLimits.max+'. All players are fictional.','<button class="btn secondary" data-action="toggle-affordable">'+(state.affordableOnly?'Show all players':'Show affordable only')+'</button>')+
 (full?'<div class="notice">Your squad is full. Sell a player before signing another.</div>':'')+
 '<div class="eyebrow" style="margin:6px 0 10px">'+(state.affordableOnly?'AFFORDABLE PLAYERS':'TOP AVAILABLE PLAYERS')+'</div><div class="players" id="market-list">'+(cards||'<div class="empty">No players available.</div>')+'</div>'+
 '<div class="eyebrow" style="margin:22px 0 10px">YOUTH INTAKE · ALWAYS AVAILABLE</div><div class="players" id="youth-list">'+(youth||'<div class="empty">No youth players listed.</div>')+'</div>';
}
function missionsPage(){
 const cards=state.missions.map(m=>{const progress=Math.min(Number(m.target),Number(m.progress||0)),pct=Math.round(progress/Number(m.target)*100);return '<div class="mission"><div class="symbol">✦</div><div class="mission-main"><strong>'+esc(m.title)+'</strong><small>'+esc(m.description)+' · Reward '+esc(m.reward_dp)+' DP</small><div class="progress"><i style="width:'+pct+'%"></i></div><small>'+progress+' / '+m.target+(m.completed_at?' · COMPLETED':'')+'</small></div><span class="pill">'+(m.completed_at?'DONE':'ACTIVE')+'</span></div>';}).join('');
 return pageHead('CLUB OBJECTIVES','Missions','Earn Development Points through matches and varied objectives.')+'<section class="panel">'+(cards||'<div class="empty">Missions will appear after the game data is initialized.</div>')+'</section>';
}
function side(f,which){return {name:f[which+'_name'],short_name:f[which+'_short_name'],crest_url:f[which+'_crest_url'],primary_colour:f[which+'_colour']};}
function teamsMarkup(f){return '<div class="fixture-teams">'+miniCrest(side(f,'home'))+'<strong>'+esc(f.home_name)+'</strong><span class="muted">vs</span>'+miniCrest(side(f,'away'))+'<strong>'+esc(f.away_name)+'</strong></div>';}
function competition(f){return f.kind==='friendly'?'FRIENDLY':'LEAGUE · '+(f.season_number?'SEASON '+esc(f.season_number)+' · ':'')+'MATCHDAY '+esc(f.day_number??f.round_number);}
function eventList(r){const events=r.events||[];return '<div class="event-list">'+(events.length?events.map(e=>'<div><span>'+esc(e.minute)+"'</span> "+esc(e.text)+(e.type==='goal'?' · '+esc(e.homeScore)+':'+esc(e.awayScore):'')+'</div>').join(''):'<div>No match events were recorded.</div>')+'</div>';}
function resultCard(r){
 return '<div class="result-card"><div class="result-side">'+crest(side(r,'home'))+'<strong>'+esc(r.home_name)+'</strong></div><div class="result-score"><div class="result-goals">'+esc(r.home_goals)+' — '+esc(r.away_goals)+'</div><span class="pill outcome '+esc(r.outcome)+'">'+esc(String(r.outcome).toUpperCase())+'</span></div><div class="result-side">'+crest(side(r,'away'))+'<strong>'+esc(r.away_name)+'</strong></div></div><p class="sub result-when">'+competition(r)+' · '+when(r.kickoff_at||r.played_at)+'</p>';
}
function reportPanel(){
 const r=state.report;if(!r)return '';
 return '<section class="panel" id="match-report"><div class="row"><div class="eyebrow">MATCH REPORT · FINAL SCORE</div><button class="btn ghost" data-action="close-report">Close</button></div>'+resultCard(r)+eventList(r)+'</section>';
}
function markViewed(r){if(!r||r.viewed)return;r.viewed=true;api('/api/clubs/'+state.club.id+'/results/viewed',{method:'POST',body:{fixtureIds:[r.id]}}).catch(()=>{r.viewed=false;});}
function openingPage(){
 const r=state.results[state.resultIndex],fresh=!r.viewed,i=state.resultIndex,n=state.results.length;
 markViewed(r);
 const report=state.report&&state.report.id===r.id?'<div class="eyebrow" style="margin-top:18px">MATCH REPORT</div>'+eventList(state.report):'';
 return '<div class="create opening">'+pageHead(fresh?'NEW RESULT':'LATEST RESULT',fresh?'Your match has been played':'Your last match',state.newResults>1?state.newResults+' results came in while you were away. Newest first.':'Matches are played automatically by the server at their kick-off time.')+
 '<section class="panel">'+resultCard(r)+'<div class="actions result-actions">'+(report?'':'<button class="btn secondary" data-action="open-report" data-fixture="'+r.id+'">Full match report</button>')+(i<n-1?'<button class="btn ghost" data-action="result-older">← Previous result</button>':'')+(i>0?'<button class="btn ghost" data-action="result-newer">Newer result →</button>':'')+'</div>'+report+'<div class="meta result-count">Result '+(i+1)+' of '+n+'</div></section><button class="btn" data-action="continue-dashboard">Continue to dashboard →</button></div>';
}
function fixturesPage(){
 const cards=state.fixtures.map(f=>'<div class="fixture"><div>'+teamsMarkup(f)+'<div class="meta">'+competition(f)+' · '+when(f.kickoff_at)+'</div></div><div class="row">'+(f.phase==='played'?'<span class="score">'+f.home_goals+' : '+f.away_goals+'</span><button class="btn secondary" data-action="open-report" data-fixture="'+f.id+'">Report</button>':f.phase==='live'?'<span class="pill live">LIVE</span>':f.phase==='cancelled'?'<span class="pill">CANCELLED</span>':'<span class="pill">UPCOMING</span>')+'</div></div>').join('');
 return pageHead('COMPETITION','Fixtures','League matches kick off at 20:00 Tashkent time, last one minute and are settled automatically by the server.','<button class="btn secondary" data-action="refresh">Refresh</button>')+reportPanel()+'<section class="panel">'+(cards||'<div class="empty">The league starts after at least 10 clubs have been created. Your fixtures will appear here.</div>')+'</section>';
}
function resultsPage(){
 const cards=state.results.map(r=>'<div class="fixture"><div>'+teamsMarkup(r)+'<div class="meta">'+competition(r)+' · '+when(r.kickoff_at||r.played_at)+(r.viewed?'':' · NEW')+'</div></div><div class="row"><span class="pill outcome '+esc(r.outcome)+'">'+esc(String(r.outcome).toUpperCase())+'</span><span class="score">'+r.home_goals+' : '+r.away_goals+'</span><button class="btn secondary" data-action="open-report" data-fixture="'+r.id+'">Report</button></div></div>').join('');
 return pageHead('MATCH HISTORY','Results','Every completed match of your club, newest first.','<button class="btn secondary" data-action="refresh">Refresh</button>')+reportPanel()+'<section class="panel">'+(cards||'<div class="empty">Your club has not played a match yet.</div>')+'</section>';
}
function friendliesPage(){
 const id=state.club.id,pending=state.friendlies.filter(r=>r.status==='pending'),rest=state.friendlies.filter(r=>r.status!=='pending');
 const line=(r,buttons)=>{const other=r.direction==='incoming'?'from':'to';return '<div class="fixture"><div><div class="fixture-teams">'+miniCrest({short_name:r[other+'_short_name'],crest_url:r[other+'_crest_url'],primary_colour:r[other+'_colour']})+'<strong>'+esc(r[other+'_name'])+'</strong></div><div class="meta">'+(r.direction==='incoming'?'RECEIVED':'SENT')+' · '+when(r.proposed_kickoff_at)+'</div></div><div class="row">'+buttons+'</div></div>';};
 const open=pending.map(r=>line(r,r.direction==='incoming'?'<button class="btn" data-action="friendly-accept" data-request="'+r.id+'">Accept</button><button class="btn danger" data-action="friendly-decline" data-request="'+r.id+'">Decline</button>':'<button class="btn ghost" data-action="friendly-cancel" data-request="'+r.id+'">Cancel</button>')).join('');
 const closed=rest.map(r=>line(r,'<span class="pill">'+esc(r.status.toUpperCase())+'</span>')).join('');
 const form=state.opponents.length?'<form id="friendly-form"><div class="grid2"><div class="field"><label>OPPONENT</label><select name="opponent" required>'+state.opponents.map(c=>'<option value="'+c.id+'">'+esc(c.short_name)+' · '+esc(c.name)+'</option>').join('')+'</select></div><div class="field"><label>KICK-OFF · TASHKENT TIME</label><input name="kickoff" type="datetime-local" required></div></div><button class="btn" type="submit">Send challenge →</button></form>':'<div class="empty">No other clubs exist yet.</div>';
 return pageHead('FRIENDLY MATCHES','Challenge a club','Propose a date and time. The match is scheduled only if the other club accepts. Friendlies never affect the league.')+
 '<section class="panel"><h2>New challenge</h2><p class="sub">A friendly lasts one minute and cannot overlap a league match or another friendly of either club.</p>'+form+'</section>'+
 '<section class="panel"><h2>Pending requests</h2>'+(open||'<div class="empty">No pending requests.</div>')+'</section>'+
 (closed?'<section class="panel"><h2>Earlier requests</h2>'+closed+'</section>':'');
}
function leagueTable(rows){
 return '<table><thead><tr><th>#</th><th>CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF:GA</th><th>PTS</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td class="rank">'+(i+1)+'</td><td>'+miniCrest({short_name:r.short_name,crest_url:r.crest_url,primary_colour:r.primary_colour})+' <strong>'+esc(r.short_name)+'</strong> '+esc(r.name)+'</td><td>'+r.played+'</td><td>'+r.wins+'</td><td>'+r.draws+'</td><td>'+r.losses+'</td><td>'+r.goals_for+':'+r.goals_against+'</td><td><strong>'+r.points+'</strong></td></tr>').join('')+'</tbody></table>';
}
function leaguePage(){
 const prev=state.previousSeason;
 return pageHead('LEAGUE',state.season?'Season '+esc(state.season.number):'The table','The league starts when the game reaches 10 clubs. Standings update automatically after each matchday; a new season starts two days after the last one ends.')+
 '<section class="panel table-wrap" id="league-current">'+(state.table.length?leagueTable(state.table):'<div class="empty">'+(state.leagueExists&&state.season===null?'Your club is not in a league yet. While you wait, it receives the same income as league clubs on every league matchday.':'No active league yet. It will be generated automatically when 10 clubs exist.')+'</div>')+'</section>'+
 (prev?'<div class="eyebrow" style="margin:22px 0 10px">SEASON '+esc(prev.season.number)+' · FINAL TABLE</div><section class="panel table-wrap" id="league-previous">'+leagueTable(prev.table)+'</section>':'');
}
function createPage(){
 return '<div class="create">'+pageHead('NEW CLUB','Create your club','Choose your identity. Your starter squad will be assigned automatically.')+'<form id="club-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required placeholder="e.g. Tashkent United"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required placeholder="TUN"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="#167a55"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="#f0c75e"></div><div class="field"><label>CLUB CREST · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">PNG, JPG or WEBP · Maximum 2 MB</small></div><div class="field"><label>EDITABLE CREST GENERATION PROMPT</label><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></div><div class="notice">Your club starts with 20,000,000 UZS and an 18-player academy squad. Each user manages one club.</div><button class="btn" type="submit">Create club →</button></form></div>';
}
function identityPage(){
 const c=state.club;
 return '<div class="create">'+pageHead('CLUB SETTINGS','Edit identity','Update your name, colours and club crest.')+'<form id="identity-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required value="'+esc(c.name)+'"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required value="'+esc(c.short_name)+'"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="'+esc(c.primary_colour)+'"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="'+esc(c.secondary_colour)+'"></div><div class="field"><label>REPLACE CREST · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">Leave empty to keep the current crest.</small></div><div class="field"><label>EDITABLE CREST GENERATION PROMPT</label><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></div><div class="actions"><button class="btn" type="submit">Save identity</button><button class="btn ghost" type="button" data-tab="overview">Cancel</button></div></form></div>';
}
function render(){
 if(!state.club){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><span class="tag">ISOLATED BUILD</span></header>'+createPage()+'</div>';return;}
 if(state.opening&&state.results.length){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><div class="club-context">'+miniCrest(state.club)+'<span>'+esc(state.club.name)+'</span></div></header>'+openingPage()+'</div>';return;}
 let body=state.tab==='identity'?identityPage():state.tab==='overview'?overview():state.tab==='squad'?squadPage():state.tab==='market'?marketPage():state.tab==='missions'?missionsPage():state.tab==='fixtures'?fixturesPage():state.tab==='results'?resultsPage():state.tab==='friendlies'?friendliesPage():leaguePage();
 shell(body);
}
async function loadAll(){
 const c=await api('/api/clubs');state.clubs=c.clubs||[];
 if(!state.clubs.length){state.club=null;render();return;}
 state.club=state.club?state.clubs.find(x=>x.id===state.club.id)||state.clubs[0]:state.clubs[0];
 const id=state.club.id;
 const results=await Promise.all([
  api('/api/clubs/'+id+'/squad'),api('/api/clubs/'+id+'/lineup'),api('/api/clubs/'+id+'/missions'),api('/api/clubs/'+id+'/fixtures'),api('/api/clubs/'+id+'/league'),api('/api/market'+(state.affordableOnly?'?maxValue='+encodeURIComponent(state.club.budget_uzs):'')),api('/api/clubs/'+id+'/ledger'),api('/api/clubs/'+id+'/development-ledger'),api('/api/clubs/'+id+'/results?limit=30'),api('/api/clubs/'+id+'/friendlies'),api('/api/clubs/'+id+'/opponents'),api('/api/clubs/'+id+'/formations')
 ]);
 state.squad=results[0].players||[];state.lineup=results[1].lineup;state.lineupDraft=state.lineup?.starters?.slice()||[];state.missions=results[2].missions||[];state.fixtures=results[3].fixtures||[];state.table=results[4].table||[];state.leagueExists=Boolean(results[4].leagueExists);state.season=results[4].season||null;state.previousSeason=results[4].previous||null;state.market=results[5].players||[];state.youth=results[5].youth||[];state.squadLimits=results[5].squadLimits||state.squadLimits;state.ledger=results[6].transactions||[];state.dpLedger=results[7].transactions||[];state.results=results[8].results||[];state.newResults=results[8].unviewedCount||0;state.friendlies=results[9].requests||[];state.opponents=results[10].clubs||[];state.formations=results[11].formations||[];state.formationInfo=results[11];state.formationDraft=state.lineup?.formation||'4-3-3';
 render();
}
async function uploadCrest(file){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Choose a PNG, JPG or WEBP image under 2 MB.');
 const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read crest image'));reader.readAsDataURL(file);});
 return (await api('/api/uploads/crest',{method:'POST',body:{dataUrl}})).crestUrl;
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
  if(action==='pick-formation'){state.formationDraft=b.dataset.formation;render();return;}
  if(action==='toggle-starter'){
   const id=b.dataset.player,draft=state.lineupDraft.slice(),index=draft.indexOf(id);
   if(index>=0)draft.splice(index,1);else{if(draft.length>=11)throw new Error('Your Starting XI already has 11 players. Remove one first.');draft.push(id);}
   state.lineupDraft=draft;
   if(draft.length===11){const problem=arrangeXI(formationDef(state.formationDraft),draftPlayers()).problem;if(problem){render();toast('Not saved. '+problem);return;}try{await saveLineup(state.formationDraft,draft,draftBench(),'Starting XI saved');}catch(error){render();toast('Not saved. '+error.message);}}
   else{render();toast(draft.length+' / 11 selected');}
   return;
  }
  if(action==='save-formation'){const problem=arrangeXI(formationDef(state.formationDraft),draftPlayers()).problem;if(problem)throw new Error(problem);await saveLineup(state.formationDraft,state.lineupDraft,draftBench(),'Formation saved');return;}
  if(action==='auto-lineup'){const def=formationDef(state.formationDraft);if(def.best.starters.length!==11)throw new Error('Your squad cannot field eleven players.');await saveLineup(def.id,def.best.starters,def.best.substitutes,'Starting XI saved');return;}
  if(action==='upgrade'){await api('/api/clubs/'+state.club.id+'/players/upgrade',{method:'POST',body:{playerId:b.dataset.player,attribute:b.dataset.attr,levels:1}});toast('Player upgraded');await loadAll();return;}
  if(action==='sell'){if(!confirm('Sell this player for '+(b.dataset.rate||'80')+'% of market value?'))return;const sold=await api('/api/clubs/'+state.club.id+'/players/sell',{method:'POST',body:{playerId:b.dataset.player}});toast('Player sold for '+money(sold.feeUzs)+(sold.promoted?.length?' · '+sold.promoted.map(x=>x.full_name).join(', ')+' promoted to the XI':''));await loadAll();return;}
  if(action==='toggle-affordable'){state.affordableOnly=!state.affordableOnly;await loadAll();return;}
  if(action==='sign'){await api('/api/clubs/'+state.club.id+'/players/sign',{method:'POST',body:{playerId:b.dataset.player}});toast('Player signed');await loadAll();return;}
  if(action==='refresh'){await loadAll();toast('Updated');return;}
  if(action==='open-report'){const data=await api('/api/clubs/'+state.club.id+'/results/'+b.dataset.fixture);state.report=data.result;markViewed(state.results.find(x=>x.id===data.result.id));render();$('#match-report')?.scrollIntoView({block:'start'});return;}
  if(action==='close-report'){state.report=null;render();return;}
  if(action==='result-older'||action==='result-newer'){state.resultIndex=Math.max(0,Math.min(state.results.length-1,state.resultIndex+(action==='result-older'?1:-1)));state.report=null;render();return;}
  if(action==='continue-dashboard'){state.opening=false;state.report=null;state.tab='overview';if(state.newResults>0){const data=await api('/api/clubs/'+state.club.id+'/results/viewed',{method:'POST',body:{all:true}});state.newResults=data.unviewedCount;state.results.forEach(x=>{x.viewed=true;});}render();return;}
  if(action==='friendly-accept'||action==='friendly-decline'||action==='friendly-cancel'){const verb=action.slice(9);await api('/api/clubs/'+state.club.id+'/friendlies/'+b.dataset.request+'/'+verb,{method:'POST',body:{}});toast(verb==='accept'?'Friendly scheduled':verb==='decline'?'Request declined':'Request cancelled');await loadAll();return;}
 }catch(err){toast(err.message||'Action failed');b.disabled=false;}
});
root.addEventListener('change',async e=>{if(e.target.id==='club-switcher'){state.club=state.clubs.find(x=>x.id===e.target.value)||state.club;state.tab='overview';state.report=null;await loadAll();}});
root.addEventListener('submit',async e=>{
 if(e.target.id!=='friendly-form')return;e.preventDefault();
 const data=new FormData(e.target),button=e.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  const local=String(data.get('kickoff')||'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local))throw new Error('Choose a kick-off date and time');
  // The entered wall-clock time is Tashkent time (UTC+5, no daylight saving), whatever the device timezone is.
  await api('/api/clubs/'+state.club.id+'/friendlies',{method:'POST',body:{opponentClubId:data.get('opponent'),kickoffAt:local.slice(0,16)+':00+05:00'}});
  toast('Challenge sent');await loadAll();
 }catch(err){toast(err.message||'Could not send the challenge');button.disabled=false;}
});
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
  // Opening the game only reads stored results; it never starts or settles a match.
  if(state.club&&state.results.length){const firstNew=state.results.findIndex(r=>!r.viewed);state.resultIndex=firstNew>=0?firstNew:0;state.opening=true;render();}
 }catch(err){root.innerHTML='<div class="shell"><section class="panel create"><h1>Connection unavailable</h1><p class="sub">'+esc(err.message)+'</p><p class="sub">Check the isolated game server URL, database migration and authentication settings.</p></section></div>';}
}
boot();
})();
