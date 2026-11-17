(() => {
const root=document.getElementById('app');
const cfg=window.ZAMIN_GAME_CONFIG||{};
const state={token:null,user:null,clubs:[],club:null,squad:[],market:[],lineup:null,lineupDraft:[],missions:[],fixtures:[],table:[],ledger:[],dpLedger:[],tab:'overview',crestData:'',results:[],newResults:0,resultIndex:0,opening:false,report:null,friendlies:[],opponents:[],youth:[],academy:[],peerListings:[],ownListings:[],affordableOnly:false,overviewFilter:'squad',profilePlayer:null,marketQuery:'',marketPosition:'all',marketClub:'all',season:null,previousSeason:null,squadLimits:{min:13,max:26,required:18,minimumGoalkeepers:2},formations:[],formationInfo:null,formationDraft:null};
let loadInFlight=false,loadAgain=false,initialLoadDone=false,refreshTimer=null;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v)=>{try{return new Intl.NumberFormat('en-US').format(BigInt(v||0))+' UZS';}catch{return '0 UZS';}};
const $=(s)=>root.querySelector(s);
const TZ='Asia/Tashkent';
// Tabs that belong to the Season destination (table, fixtures, objectives, challenges).
const SEASON_TABS=['league','fixtures','missions','friendlies','results'];
const whenFormat=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const when=(v)=>v?whenFormat.format(new Date(v))+t(' · Tashkent time'):'Date not recorded';
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}
async function api(path,options={}){
 // Trades and lineup changes are saved on the server, so they are refused while offline.
 if((options.method||'GET')!=='GET'&&navigator.onLine===false)throw new Error(t('No connection. Trades need internet.'));
 const headers={'content-type':'application/json',...(options.headers||{})};
 if(state.token)headers.authorization='Bearer '+state.token;
 if(!state.token&&cfg.devUserId)headers['x-dev-user-id']=String(cfg.devUserId);
 const response=await fetch((cfg.apiBase||'')+path,{...options,headers,body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({error:t('Invalid server response')}));
 if(response.status===401&&state.token&&!(window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initData)){localStorage.removeItem('zamin-token');location.reload();}
 if(!response.ok)throw new Error(data.error||'Request failed');
 return data;
}
// Offline banner and button state: read-only screens keep working from the last sync.
function syncOnline(){
 const offline=navigator.onLine===false;
 document.body.classList.toggle('offline',offline);
 let bar=document.getElementById('offline-bar');
 if(offline&&!bar){bar=document.createElement('div');bar.id='offline-bar';bar.className='offline-bar';bar.textContent=t('Offline. You can view your club, but trades and lineup changes need internet.');document.body.prepend(bar);}
 if(!offline&&bar)bar.remove();
}
window.addEventListener('offline',syncOnline);
window.addEventListener('online',()=>{syncOnline();if(state.token||cfg.devUserId)loadAll().catch(()=>{});});
function shell(body){
 root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><div class="top-right">'+(state.clubs.length>1?'<select id="club-switcher">'+state.clubs.map(x=>'<option value="'+x.id+'" '+(x.id===state.club.id?'selected':'')+'>'+esc(x.short_name)+' · '+esc(x.name)+'</option>').join('')+'</select>':'')+'<button class="club-context" data-action="edit-identity">'+miniCrest(state.club)+'<span>'+esc(state.club.name)+'</span></button><button class="lang-toggle" data-action="lang">'+(window.ZAMIN_LANG==='ru'?'RU':'UZ')+'</button><span class="budget-chip">'+money(state.club.budget_uzs)+'</span></div></header><div class="layout"><nav class="nav">'+
 [['overview',t('Match')],['squad',t('Squad')],['market',t('Transfers')],['league',t('Season')]].map(x=>'<button data-tab="'+x[0]+'" class="'+(state.tab===x[0]||(x[0]==='league'&&SEASON_TABS.includes(state.tab))?'active':'')+'">'+x[1]+'</button>').join('')+
 '<div class="nav-foot">ISOLATED GAME CLIENT<br>NOT CONNECTED TO LIVE SYSTEMS</div></nav><main class="content">'+body+'</main></div><footer class="footer"><span>ZAMIN FK · MANAGEMENT GAME</span><span>ISOLATED BUILD 0.1</span></footer></div>';
}
function pageHead(kicker,title,sub,action){return '<div class="hero"><div><div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="sub">'+sub+'</p></div>'+(action||'')+'</div>';}
function crest(club,large){const style='style="--accent:'+esc(club.primary_colour||'#167a55')+'"';return '<div class="crest" '+style+'>'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="Club crest">':esc(club.short_name||'ZFK'))+'</div>';}
function miniCrest(club){return '<span class="mini-crest" style="--accent:'+esc(club.primary_colour||'#167a55')+'">'+(club.crest_url?'<img src="'+esc((cfg.apiBase||'')+club.crest_url)+'" alt="">':esc(club.short_name||'ZFK'))+'</span>';}
const tierNames={academy:t('PROSPECT'),developing:'DEVELOPING',established:'ESTABLISHED',elite:'ELITE'};
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
 else if(keepers<1)problem=t('Your Starting XI must include a goalkeeper.');
 else if(keepers>1&&!unchanged)problem='A Starting XI needs exactly one goalkeeper.';
 return {slots,natural,cover,wrong,fit:natural+cover/2,problem};
}
const draftPlayers=()=>state.lineupDraft.map(id=>state.squad.find(p=>p.id===id)).filter(Boolean);
const signed=n=>(n>=0?'+':'')+Number(n).toFixed(2);
// The 12 formations as a grid of numbers. Under each: the strength of the best XI this squad can field in it and its formation fit.
function formationPicker(){
 return '<div class="formations" role="listbox" aria-label="Formation">'+state.formations.map(f=>{
  const active=f.id===state.formationDraft,saved=f.id===state.lineup?.formation;
  return '<button type="button" role="option" aria-selected="'+active+'" class="formation'+(active?' active':'')+(saved?' saved':'')+(f.best.valid?'':' unfit')+'" data-action="pick-formation" data-formation="'+esc(f.id)+'"><strong>'+esc(f.id)+'</strong><small class="f-strength">Best XI '+esc(Number(f.best.strength).toFixed(1))+'</small><small class="f-fit">'+(f.best.valid?t('Fit ')+signed(f.best.fitBonus):f.best.outOfPosition+' out of position')+'</small>'+(saved?'<em>SAVED</em>':'')+'</button>';
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
 return '<section class="panel lineup"><div class="row"><div><h2>Lineup · '+state.lineupDraft.length+'/11 selected</h2><p>Choose your Starting XI and formation.</p></div><span class="pill '+(unsaved?'unsaved':'')+'" id="lineup-state">'+(unsaved?'Not saved':t('Saved · ')+esc(saved.formation))+'</span></div>'+
  '<div class="field"><label>FORMATION · '+esc(def.id)+'</label>'+formationPicker()+'</div>'+
  '<p class="sub" id="formation-note">'+esc(def.note)+'</p>'+status+roleList(arranged)+
  '<div class="actions"><button class="btn secondary" data-action="save-formation">Save formation</button><button class="btn" data-action="auto-lineup">Auto-pick XI</button></div>'+
  '<p class="sub">Formation fit runs from −'+rule.max+' to +'+rule.max+' and is added to your XI strength: +'+rule.max+' with eleven natural roles, less for cover roles and players out of position. Tap a formation to preview it, then Save formation or Auto-pick XI. Add to XI or Remove XI on player cards; an XI of 11 saves automatically.</p></section>';
}
async function saveLineup(formation,starters,substitutes,message){
 await api('/api/clubs/'+state.club.id+'/lineup',{method:'POST',body:{formation,starters,substitutes}});toast(message);await loadAll();
}
const draftBench=()=>state.squad.filter(p=>!state.lineupDraft.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,7).map(p=>p.id);
// Anonymous player avatar: a generic silhouette tinted by position, never a real photo.
function avatar(p){const g="#2d3331";return '<span class="avatar" style="--avatar:'+g+'"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5"/><path d="M6 39c1.5-9 7-13.5 14-13.5S32.5 30 34 39z"/></svg></span>';}
function squadPage(){
 const c=state.club;
 const players=state.squad;
 const starterIds=state.lineupDraft;
 const cards=players.map(p=>'<article class="player">'+avatar(p)+'<div class="player-top"><span class="pill">'+tier(p)+'</span><span class="rating">'+esc(p.overall)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs · Potential '+esc(p.potential)+'</div><div class="bars">'+['pace','shooting','passing','defending','physical','dribbling'].map(k=>'<div><div class="attr">'+k.slice(0,3).toUpperCase()+' '+esc(p.attributes[k])+'</div><div class="bar"><i style="width:'+Math.min(100,Number(p.attributes[k]))+'%"></i></div></div>').join('')+'</div><div class="meta">'+(starterIds.includes(p.id)?'STARTING XI':'SQUAD')+' · Value '+money(p.market_value_uzs)+'</div><div class="meta">'+(resaleRate(p)===50?t('ACADEMY PRODUCT · first sale pays 50%'):'Sale pays 80%')+'</div><div class="actions"><button class="btn '+(starterIds.includes(p.id)?'gold':'secondary')+'" data-action="toggle-starter" data-player="'+p.id+'">'+(starterIds.includes(p.id)?t('Remove XI'):'Add to XI')+'</button>'+['pace','shooting','passing','dribbling','defending','physical'].map(k=>'<button class="btn secondary" data-action="upgrade" data-player="'+p.id+'" data-attr="'+k+'">+'+k.slice(0,3)+'</button>').join('')+'<button class="btn secondary" data-action="list-transfer" data-player="'+p.id+'">List for transfer</button><button class="btn danger" data-action="sell" data-player="'+p.id+'" data-rate="'+resaleRate(p)+'">Sell</button></div></article>').join('');
 return pageHead(t('THE SQUAD'),'Build your team','Upgrade attributes with Development Points. Potential limits each attribute.')+squadPitch()+
 lineupPanel()+
 '<div class="row" style="margin:18px 0 10px"><div class="eyebrow">REGISTERED PLAYERS · '+players.length+' · MIN '+state.squadLimits.min+' · MAX '+state.squadLimits.max+'</div><div class="meta">Upgrade cost increases with attribute level</div></div><div class="players">'+(cards||'<div class="empty">No players in the squad yet.</div>')+'</div>';
}
// ---- Transfers: Market (the list), Scout (placeholder until the server supports scouting), Assistant (gap filler).
const SQUAD_NEEDS={GK:2,CB:3,LB:1,RB:1,DM:2,CM:3,AM:1,LW:1,RW:1,ST:3};
function marketTabs(){
 const tabs=[['market',t('Market')],['scout','Scout'],['assistant','Assistant']];
 return '<nav class="segments" aria-label="Transfer sections">'+tabs.map(([k,l])=>'<button data-action="market-tab" data-market-tab="'+k+'" class="'+((state.marketTab||'market')===k?'active':'')+'">'+l+'</button>').join('')+'</nav>';
}
function scoutPanel(){
 const tier=(name,cost,detail)=>'<div class="scout-tier"><strong>'+name+'</strong><span>'+cost+'</span><small>'+detail+'</small></div>';
 return '<section class="panel"><div class="eyebrow">'+t('SCOUT')+'</div><h2>Find players by profile</h2><p class="sub">Set a position and age range, then send a scout. Scouting is not open yet; this is how it will work.</p>'+
  '<div class="grid2"><div class="field"><label>POSITION</label><select disabled><option>Any position</option></select></div><div class="field"><label>AGE RANGE</label><select disabled><option>16 – 45</option></select></div></div>'+
  '<div class="scout-tiers">'+tier(t('Normal scout'),'Cheaper','Slower search, standard quality')+tier(t('Advanced scout'),'Mid cost','Faster, better chance of quality')+tier(t('Top scout'),'Highest cost','Fastest, best chance of stars')+'</div>'+
  '<button class="btn" disabled>'+t('Send scout · coming soon')+'</button></section>';
}
// Assistant: for each position the squad is short of, the best affordable players in that position.
function assistantPanel(){
 const counts={};for(const p of state.squad)counts[p.position]=(counts[p.position]||0)+1;
 const budget=BigInt(state.club.budget_uzs);
 const gaps=Object.entries(SQUAD_NEEDS).map(([pos,need])=>[pos,Math.max(0,need-(counts[pos]||0))]).filter(([,n])=>n>0);
 if(!gaps.length)return '<section class="panel"><div class="eyebrow">'+t('ASSISTANT')+'</div><h2>Your squad covers every position</h2><p class="sub">Use Market to upgrade a starter.</p></section>';
 const sections=gaps.map(([pos,n])=>{
  const options=state.market.filter(p=>p.position===pos&&BigInt(p.market_value_uzs)<=budget).sort((a,b)=>b.overall-a.overall).slice(0,3);
  const rows=options.map(p=>'<div class="assist-row">'+avatar(p)+'<div><strong>'+esc(p.full_name)+'</strong><div class="meta">'+esc(p.real_club_name||t('Generated'))+' · '+esc(p.age)+' yrs</div></div><span class="rating">'+esc(p.overall)+'</span><span class="price">'+money(p.market_value_uzs)+'</span><button class="btn" data-action="sign" data-player="'+p.id+'" '+(state.squad.length>=state.squadLimits.max?'disabled':'')+'>'+t('Sign')+'</button></div>').join('');
  return '<section class="panel"><div class="eyebrow">NEED '+n+' · '+pos+'</div>'+(rows||'<div class="empty">'+t('Nothing affordable in this position. Sell a player or check Market.')+'</div>')+'</section>';
 });
 return '<section class="panel"><div class="eyebrow">'+t('ASSISTANT')+'</div><h2>'+t('Positions to fill')+'</h2><p class="sub">The best players you can afford for each position your squad is short of.</p></section>'+sections.join('');
}
function marketPage(){
 const tab=state.marketTab||'market';
 return marketTabs()+(tab==='scout'?scoutPanel():tab==='assistant'?assistantPanel():marketList());
}
function marketList(){
 const full=state.squad.length>=state.squadLimits.max;
 const realPlayers=state.market.filter(p=>p.real_club_name);
 const filtered=realPlayers.filter(p=>(state.marketPosition==='all'||p.position===state.marketPosition)&&(state.marketClub==='all'||p.real_club_key===state.marketClub)&&(!state.marketQuery||p.full_name.toLowerCase().includes(state.marketQuery.toLowerCase())));
 const clubs=[...new Map(realPlayers.map(p=>[p.real_club_key,{key:p.real_club_key,name:p.real_club_name}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const card=p=>'<article class="market-player">'+avatar(p)+'<div class="market-main"><div class="market-club"><span class="mini-crest" style="--accent:#167a55">'+esc(String(p.real_club_name).slice(0,3).toUpperCase())+'</span><span>'+esc(p.real_club_name)+'</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs</div></div><div class="market-rating"><strong>'+esc(p.overall)+'</strong><span>OVR</span></div><div class="market-price">'+money(p.market_value_uzs)+'</div><div class="market-actions"><button class="btn secondary" data-action="player-profile" data-player="'+p.id+'">Profile</button><button class="btn" data-action="sign" data-player="'+p.id+'" '+(!full&&BigInt(state.club.budget_uzs)>=BigInt(p.market_value_uzs)?'':'disabled')+'>'+t('Sign')+'</button></div></article>';
 const youthCard=p=>'<article class="market-player">'+avatar(p)+'<div class="market-main"><div class="market-club"><span>ACADEMY PROSPECT</span></div><h3>'+esc(p.full_name)+'</h3><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs</div></div><div class="market-rating"><strong>'+esc(p.overall)+'</strong><span>OVR</span></div><div class="market-price">'+money(p.market_value_uzs)+'</div><div class="market-actions"><button class="btn" data-action="sign" data-player="'+p.id+'" '+(!full&&BigInt(state.club.budget_uzs)>=BigInt(p.market_value_uzs)?'':'disabled')+'>'+t('Sign')+'</button></div></article>';
 const peerCards=state.peerListings.filter(l=>l.seller_club_id!==state.club.id).map(l=>'<article class="market-player">'+avatar(l)+'<div class="market-main"><div class="market-club">PLAYER TRANSFER · '+esc(l.seller_club_short_name)+'</div><h3>'+esc(l.full_name)+'</h3><div class="meta">'+esc(l.position)+' · '+esc(l.age)+' yrs</div></div><div class="market-rating"><strong>'+esc(l.overall)+'</strong><span>OVR</span></div><div class="market-price">'+money(l.asking_price_uzs)+'</div><div class="market-actions"><button class="btn" data-action="buy-transfer" data-listing="'+l.listing_id+'" '+(state.squad.length>=state.squadLimits.max||BigInt(state.club.budget_uzs)<BigInt(l.asking_price_uzs)?'disabled':'')+'>Buy</button></div></article>').join('');
 const ownActive=state.ownListings.filter(l=>l.status==='listed').map(l=>'<div class="fixture"><div><strong>'+esc(l.full_name)+' · '+esc(l.position)+' '+esc(l.overall)+'</strong><div class="meta">Asking '+money(l.asking_price_uzs)+' · Listed '+when(l.listed_at)+'</div></div><button class="btn danger" data-action="cancel-transfer" data-listing="'+l.listing_id+'">Cancel</button></div>').join('');
 const profile=state.profilePlayer?'<div class="profile-backdrop"><section class="panel player-profile"><button class="btn secondary profile-close" data-action="close-profile">Close ×</button><div class="eyebrow">PLAYER PROFILE</div><h2>'+esc(state.profilePlayer.full_name)+'</h2><p>'+esc(state.profilePlayer.real_club_name||'')+' · '+esc(state.profilePlayer.position)+' · '+esc(state.profilePlayer.age)+' years old</p><div class="profile-overall">'+esc(state.profilePlayer.overall)+' <small>OVR</small></div><div class="profile-attributes">'+['pace','shooting','passing','dribbling','defending','physical'].map(k=>'<div><span>'+k.toUpperCase()+'</span><b>'+esc(state.profilePlayer.attributes?.[k]??'—')+'</b><i><em style="width:'+Math.max(0,Math.min(100,Number(state.profilePlayer.attributes?.[k]||0)))+'%"></em></i></div>').join('')+'</div><p>Potential '+esc(state.profilePlayer.potential)+' · Game value '+money(state.profilePlayer.market_value_uzs)+'</p><p class="meta">Club record checked: '+esc(state.profilePlayer.real_roster_checked_at||'date not supplied')+' · Source: '+esc(state.profilePlayer.real_roster_source||'not recorded')+'</p><button class="btn" data-action="sign" data-player="'+state.profilePlayer.id+'" '+(!full&&BigInt(state.club.budget_uzs)>=BigInt(state.profilePlayer.market_value_uzs)?'':'disabled')+'>Sign player · '+money(state.profilePlayer.market_value_uzs)+'</button></section></div>':'';
 const filters='<section class="market-filters"><input id="market-search" value="'+esc(state.marketQuery)+'" placeholder="Search player name"><select id="market-position"><option value="all">All positions</option>'+['GK',t('CB'),'LB','RB','DM','CM','AM','LW','RW','ST'].map(p=>'<option value="'+p+'" '+(state.marketPosition===p?'selected':'')+'>'+p+'</option>').join('')+'</select><select id="market-club"><option value="all">All real clubs</option>'+clubs.map(c=>'<option value="'+esc(c.key)+'" '+(state.marketClub===c.key?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></section>';
 return pageHead('SCOUTING & TRANSFERS',t('Real players'),'2026 Super League · '+realPlayers.length+' real players across '+clubs.length+' clubs · Budget '+money(state.club.budget_uzs))+
 '<p class="meta">Unofficial management game. Not affiliated with, endorsed by or sponsored by the Uzbekistan Professional Football League, any club or any player. Club names are used only to identify rosters. Club and age data are roster-based. OVR, potential and game prices are balancing values, not official ratings or transfer fees.</p>'+
 (state.squad.length<(state.squadLimits.required||14)?'<section class="panel build-reminder"><strong>Build your first team</strong><p>'+t('Recruit at least {n} players to enter the league.').replace('{n}',state.squadLimits.required||14)+'</p><span>'+state.squad.length+' / '+(state.squadLimits.required||14)+' players</span></section>':'')+
 '<section class="squad-strip"><div><span class="eyebrow">SQUAD</span><strong>'+state.squad.length+' / '+(state.squadLimits.required||14)+'</strong></div><div><span class="eyebrow">BUDGET</span><strong>'+money(state.club.budget_uzs)+'</strong></div><div><span class="eyebrow">NEXT</span><strong>'+(state.squad.length<(state.squadLimits.required||14)?'Sign '+((state.squadLimits.required||14)-state.squad.length)+' more':'Squad ready')+'</strong></div></section>'+
 (full?'<div class="notice">Your squad is full. Sell a player before signing another.</div>':'')+filters+
 '<div class="market-list">'+(filtered.map(card).join('')||'<div class="empty">No verified Super League players match these filters yet.</div>')+'</div>'+
 '<section class="panel" style="margin-top:18px"><div class="eyebrow">ACADEMY PROSPECTS · '+((state.academy||[]).length+(state.youth||[]).length)+' AVAILABLE</div><p class="meta">Generated prospects replenish when signed; sold academy players return here at their game price.</p><div class="market-list">'+([...(state.academy||[]),...(state.youth||[])].map(youthCard).join('')||'<div class="empty">No academy prospects are available right now.</div>')+'</div></section>'+
 '<section class="panel" style="margin-top:18px"><div class="eyebrow">CLUB-TO-CLUB TRANSFERS</div>'+(peerCards||'<div class="empty">No players are currently listed by other managers.</div>')+'</section>'+
 '<section class="panel" style="margin-top:18px"><div class="eyebrow">YOUR TRANSFER LISTINGS</div>'+(ownActive||'<div class="empty">'+t('No active listings.')+'</div>')+'</section>'+profile;
}
function missionsPage(){
 const cards=state.missions.map(m=>{const progress=Math.min(Number(m.target),Number(m.progress||0)),pct=Math.round(progress/Number(m.target)*100);return '<div class="mission"><div class="symbol">✦</div><div class="mission-main"><strong>'+esc(m.title)+'</strong><small>'+esc(m.description)+' · Reward '+esc(m.reward_dp)+' DP</small><div class="progress"><i style="width:'+pct+'%"></i></div><small>'+progress+' / '+m.target+(m.completed_at?' · COMPLETED':'')+'</small></div><span class="pill">'+(m.completed_at?'DONE':'ACTIVE')+'</span></div>';}).join('');
 return pageHead(t('CLUB OBJECTIVES'),'Missions','Earn Development Points through matches and varied objectives.')+'<section class="panel">'+(cards||'<div class="empty">Missions will appear after the game data is initialized.</div>')+'</section>';
}
function side(f,which){return {name:f[which+'_name'],short_name:f[which+'_short_name'],crest_url:f[which+'_crest_url'],primary_colour:f[which+'_colour']};}
function teamsMarkup(f){return '<div class="fixture-teams">'+miniCrest(side(f,'home'))+'<strong>'+esc(f.home_name)+'</strong><span class="muted">vs</span>'+miniCrest(side(f,'away'))+'<strong>'+esc(f.away_name)+'</strong></div>';}
function competition(f){return f.kind==='friendly'?t('FRIENDLY'):'LEAGUE · '+(f.season_number?'SEASON '+esc(f.season_number)+' · ':'')+'MATCHDAY '+esc(f.day_number??f.round_number);}
function eventList(r){const events=r.events||[];return '<div class="event-list">'+(events.length?events.map(e=>'<div><span>'+esc(e.minute)+"'</span> "+esc(t(e.text))+(e.type==='goal'?' · '+esc(e.homeScore)+':'+esc(e.awayScore):'')+'</div>').join(''):'<div>No match events were recorded.</div>')+'</div>';}
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
 return '<div class="create opening">'+pageHead(fresh?t('NEW RESULT'):'LATEST RESULT',fresh?'Your match has been played':'Your last match',state.newResults>1?state.newResults+' results came in while you were away. Newest first.':t('Matches are played automatically by the server at their kick-off time.'))+
 '<section class="panel">'+resultCard(r)+'<div class="actions result-actions">'+(report?'':'<button class="btn" data-action="watch-replay" data-fixture="'+r.id+'">'+t('Watch replay')+'</button><button class="btn secondary" data-action="open-report" data-fixture="'+r.id+'">Full match report</button>')+(i<n-1?'<button class="btn ghost" data-action="result-older">← Previous result</button>':'')+(i>0?'<button class="btn ghost" data-action="result-newer">Newer result →</button>':'')+'</div>'+report+'<div class="meta result-count">Result '+(i+1)+' of '+n+'</div></section><button class="btn" data-action="continue-dashboard">Continue to dashboard →</button></div>';
}
function fixturesPage(){
 const cards=state.fixtures.map(f=>'<div class="fixture"><div>'+teamsMarkup(f)+'<div class="meta">'+competition(f)+' · '+when(f.kickoff_at)+'</div></div><div class="row">'+(f.phase==='played'?'<span class="score">'+f.home_goals+' : '+f.away_goals+'</span><button class="btn secondary" data-action="open-report" data-fixture="'+f.id+'">Report</button>':f.phase==='live'?'<span class="pill live">LIVE</span>':f.phase==='cancelled'?'<span class="pill">CANCELLED</span>':'<span class="pill">UPCOMING</span>')+'</div></div>').join('');
 return pageHead(t('COMPETITION'),t('Fixtures'),'League matches kick off at 20:00 Tashkent time, last one minute and are settled automatically by the server.','<button class="btn secondary" data-action="refresh">Refresh</button>')+reportPanel()+'<section class="panel">'+(cards||'<div class="empty">'+t('The league starts after at least 10 clubs have been created. Your fixtures will appear here.')+'</div>')+'</section>'+resultRowsSection();
}
function resultsPage(){
 const cards=state.results.map(r=>'<div class="fixture"><div>'+teamsMarkup(r)+'<div class="meta">'+competition(r)+' · '+when(r.kickoff_at||r.played_at)+(r.viewed?'':' · NEW')+'</div></div><div class="row"><span class="pill outcome '+esc(r.outcome)+'">'+esc(String(r.outcome).toUpperCase())+'</span><span class="score">'+r.home_goals+' : '+r.away_goals+'</span><button class="btn secondary" data-action="open-report" data-fixture="'+r.id+'">Report</button></div></div>').join('');
 return pageHead('MATCH HISTORY','Results','Every completed match of your club, newest first.','<button class="btn secondary" data-action="refresh">Refresh</button>')+reportPanel()+'<section class="panel">'+(cards||'<div class="empty">'+t('Your club has not played a match yet.')+'</div>')+'</section>';
}
function friendliesPage(){
 const id=state.club.id,pending=state.friendlies.filter(r=>r.status==='pending'),rest=state.friendlies.filter(r=>r.status!=='pending');
 const line=(r,buttons)=>{const other=r.direction==='incoming'?'from':'to';return '<div class="fixture"><div><div class="fixture-teams">'+miniCrest({short_name:r[other+'_short_name'],crest_url:r[other+'_crest_url'],primary_colour:r[other+'_colour']})+'<strong>'+esc(r[other+'_name'])+'</strong></div><div class="meta">'+(r.direction==='incoming'?t('RECEIVED'):'SENT')+' · '+when(r.proposed_kickoff_at)+'</div></div><div class="row">'+buttons+'</div></div>';};
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
function leaderList(rows,unit){
 return rows.length?rows.map((r,i)=>'<div class="assist-row"><span class="rank">'+(i+1)+'</span><div><strong>'+esc(r.name)+'</strong><div class="meta">'+esc(r.club)+'</div></div><span class="rating">'+esc(r.count)+'</span></div>').join(''):'<div class="empty">'+t('No goals yet.')+'</div>';
}
function leadersSection(){
 const L=state.leaders||{scorers:[],assists:[]};
 return '<div class="eyebrow" style="margin:22px 0 10px">'+t('TOP SCORERS')+'</div><section class="panel table-wrap" id="league-scorers">'+leaderList(L.scorers)+'</section>'+
  '<div class="eyebrow" style="margin:22px 0 10px">'+t('TOP ASSISTS')+'</div><section class="panel table-wrap" id="league-assists">'+leaderList(L.assists)+'</section>';
}
function leaguePage(){
 const prev=state.previousSeason;
 return pageHead(t('LEAGUE'),state.season?'Season '+esc(state.season.number):'The table','The league starts when the game reaches 10 clubs. Standings update automatically after each matchday; a new season starts two days after the last one ends.')+
 '<section class="panel table-wrap" id="league-current">'+(state.table.length?leagueTable(state.table):'<div class="empty">'+(state.leagueExists&&state.season===null?'Your club is not in a league yet. While you wait, it receives the same income as league clubs on every league matchday.':t('No active league yet. It will be generated automatically when 10 clubs exist.'))+'</div>')+'</section>'+
 (state.table.length?leadersSection():'')+
 (prev?'<div class="eyebrow" style="margin:22px 0 10px">SEASON '+esc(prev.season.number)+' · FINAL TABLE</div><section class="panel table-wrap" id="league-previous">'+leagueTable(prev.table)+'</section>':'');
}
function createPage(){
 return '<div class="create">'+pageHead(t('NEW CLUB'),'Create your club','Create your club identity. Then recruit your own players and build your team.')+'<form id="club-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required placeholder="e.g. Tashkent United"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required placeholder="TUN"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="#167a55"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="#f0c75e"></div><div class="field"><label>CLUB CREST · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">PNG, JPG or WEBP · Maximum 2 MB</small></div><details class="field"><summary>Crest prompt · optional</summary><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></details><div class="notice">You start with 30,000,000 UZS. Recruit at least 14 players to enter the league. Each user manages one club.</div><button class="btn" type="submit">Create club →</button></form></div>';
}
function identityPage(){
 const c=state.club;
 return '<div class="create">'+pageHead(t('CLUB SETTINGS'),'Edit identity','Update your name, colours and club crest.')+'<form id="identity-form" class="panel"><div class="field"><label>CLUB NAME</label><input name="name" maxlength="28" required value="'+esc(c.name)+'"></div><div class="grid2"><div class="field"><label>SHORT NAME</label><input name="shortName" maxlength="5" required value="'+esc(c.short_name)+'"></div><div class="field"><label>PRIMARY COLOUR</label><input name="primaryColour" type="color" value="'+esc(c.primary_colour)+'"></div></div><div class="field"><label>SECONDARY COLOUR</label><input name="secondaryColour" type="color" value="'+esc(c.secondary_colour)+'"></div><div class="field"><label>CLUB PHOTO · OPTIONAL</label><input id="crest-file" type="file" accept="image/png,image/jpeg,image/webp"><small class="meta">'+t('Leave empty to keep the current crest.')+'</small></div><details class="field"><summary>Crest prompt · optional</summary><textarea id="crest-prompt" rows="4">Create an original professional football club crest for [club name]. Use [primary colour] as the main colour and [secondary colour] as the accent. Design a distinctive shield with a memorable central symbol, clean vector geometry, strong contrast and readable initials. Do not copy any existing club badge. Transparent background, flat colours, suitable for a mobile football management game.</textarea><button class="btn secondary" type="button" data-action="copy-prompt">Copy prompt</button></details><div class="actions"><button class="btn" type="submit">Save identity</button><button class="btn ghost" type="button" data-tab="overview">Cancel</button></div></form></div>';
}
// ---- Match home: the next kick-off, the last result with its replay, and a first-run sample match.
function matchHome(){
 const c=state.club,required=state.squadLimits.required||18,minKeepers=state.squadLimits.minimumGoalkeepers||2;
 const keepers=state.squad.filter(p=>p.position==='GK').length,xi=state.lineup?.starters?.length||0;
 const ready=state.squad.length>=required&&keepers>=minKeepers&&xi===11;
 const next=state.fixtures.filter(f=>f.phase==='upcoming'||f.phase==='live').sort((a,b)=>Date.parse(a.kickoff_at)-Date.parse(b.kickoff_at))[0];
 const last=state.results[0];
 const progress=Math.min(100,Math.round((state.squad.length/required)*100));
 let line,action;
 if(next){
  line=(next.phase==='live'?t('Live now · ')+esc(next.home_short_name)+' v '+esc(next.away_short_name):t('Next kick-off · ')+when(next.kickoff_at));
  action='<button class="btn big" data-tab="squad">'+t('Set your XI')+'</button>';
 }else if(last){
  line=t('Next match is being scheduled');
  action='<button class="btn big" data-action="watch-replay" data-fixture="'+last.id+'">'+t('Watch last match')+'</button>';
 }else{
  line=ready?t('Your team is ready for kick-off'):t('Build your squad to start playing');
  action='<button class="btn big" data-action="watch-sample">'+t('Watch sample match')+'</button>';
 }
 const secondary='<button class="btn ghost stage-ghost" data-tab="squad">'+t('Squad')+'</button>';
 const stage='<section class="stage"><div class="stage-body"><div class="stage-kicker">'+t('MATCHDAY ')+esc(c.short_name)+'</div><h1 class="stage-title">'+esc(c.name)+'</h1><p class="stage-line">'+line+'</p><div class="stage-actions">'+action+secondary+'</div></div><div class="stage-progress"><i style="width:'+progress+'%"></i><span>'+state.squad.length+' / '+required+' '+t('players')+' · '+t('XI ')+xi+'/11</span></div></section>';
 const score=last?'<section class="scoreboard" data-action="watch-replay" data-fixture="'+last.id+'"><div class="sb-team"><span class="mini-crest" style="--accent:'+esc(last.home_colour||'#167a55')+'">'+esc(last.home_short_name)+'</span><small>'+esc(last.home_name)+'</small></div><div class="sb-score">'+last.home_goals+' — '+last.away_goals+'</div><div class="sb-team"><span class="mini-crest" style="--accent:'+esc(last.away_colour||'#7c8b84')+'">'+esc(last.away_short_name)+'</span><small>'+esc(last.away_name)+'</small></div><div class="sb-play">'+t('Replay')+' ▶</div></section>':'';
 return stage+score+reportPanel();
}
// ---- Season: one destination with segments for table, fixtures, objectives and challenges.
function resultRowsSection(){
 const rows=state.results.map(r=>'<div class="fixture"><div>'+teamsMarkup(r)+'<div class="meta">'+competition(r)+' · '+when(r.kickoff_at||r.played_at)+(r.viewed?'':' · NEW')+'</div></div><div class="row"><span class="pill outcome '+esc(r.outcome)+'">'+esc(String(r.outcome).toUpperCase())+'</span><span class="score">'+r.home_goals+' : '+r.away_goals+'</span><button class="btn secondary" data-action="watch-replay" data-fixture="'+r.id+'">Replay</button></div></div>').join('');
 return '<section class="panel"><div class="eyebrow">RESULTS</div>'+(rows||'<div class="empty">'+t('Your club has not played a match yet.')+'</div>')+'</section>';
}
function seasonPage(){
 const subs=[['league',t('Table')],['fixtures',t('Fixtures')],['missions','Objectives'],['friendlies','Challenges']];
 const active=state.tab==='results'?'fixtures':state.tab;
 const seg='<nav class="segments" aria-label="Season sections">'+subs.map(([k,l])=>'<button data-tab="'+k+'" class="'+(active===k?'active':'')+'">'+l+'</button>').join('')+'</nav>';
 const body=active==='fixtures'?fixturesPage():active==='missions'?missionsPage():active==='friendlies'?friendliesPage():leaguePage();
 return seg+body;
}
// ---- Pitch: positions come from the formation's position codes; the away side is mirrored to face the home side.
// The pitch is horizontal: x runs goal to goal (home attacks right), y runs touchline to touchline.
// The formation string (e.g. 4-3-3) sets how many players stand on each line; players are sorted from back to front.
const FORM_DEPTH={GK:0,CB:1,LB:1,RB:1,DM:2,CM:2.5,AM:3,LW:3.5,RW:3.5,ST:4};
function formationLines(f){const n=String(f||'').split('-').map(Number);return n.length>=2&&n.every(x=>x>0)&&n.reduce((a,b)=>a+b,0)===10?n:[4,3,3];}
function lineWidths(n){return n===1?[50]:n===2?[35,65]:n===3?[18,50,82]:Array.from({length:n},(_,j)=>12+j*(76/(n-1)));}
function placeOnPitch(list,away,formation){
 const lines=formationLines(formation);
 const gk=list.filter(p=>p.position==='GK').slice(0,1);
 const outfield=list.filter(p=>!gk.includes(p)).map((p,i)=>({p,i}));
 outfield.sort((a,b)=>((FORM_DEPTH[a.p.position]??2.5)-(FORM_DEPTH[b.p.position]??2.5))||a.i-b.i);
 const lane=p=>['LB','LW'].includes(p.position)?0:['RB','RW'].includes(p.position)?2:1;
 const rows=[gk];let idx=0;
 for(const n of lines){const group=outfield.slice(idx,idx+n).map(x=>x.p);idx+=n;group.sort((a,b)=>lane(a)-lane(b));rows.push(group);}
 if(idx<outfield.length)rows[rows.length-1].push(...outfield.slice(idx).map(x=>x.p));
 const out=[];
 rows.forEach((row,i)=>{
  if(!row.length)return;
  const depth=7+i*(73/lines.length),widths=lineWidths(row.length);
  row.forEach((p,j)=>{const x=away?100-depth:depth,y=away?100-widths[j]:widths[j];out.push({p,x,y,bx:x,by:y,side:away?'away':'home',role:p.position});});
 });
 return out;
}
function dotMarkup(placed,colour,pickable){
 const p=placed.p,parts=String(p.full_name||p.fullName||'').trim().split(/\s+/),label=esc((parts[parts.length-1]||'').slice(0,4).toUpperCase());
 return '<div class="dot" data-pid="'+esc(p.id)+'" data-bx="'+placed.bx+'" data-by="'+placed.y+'" data-role="'+esc(placed.role)+'" data-side="'+placed.side+'"'+(pickable?' data-action="xi-slot" data-player="'+esc(p.id)+'"':'')+' style="left:'+placed.x+'%;top:'+placed.y+'%;--accent:'+esc(colour||'#167a55')+'"><span>'+label+'</span></div>';
}
const POS_GROUP={GK:"GK",CB:"DEF",LB:"DEF",RB:"DEF",DM:"MID",CM:"MID",AM:"MID",LW:"ATT",RW:"ATT",ST:"ATT"};
// Trial check: would this Starting XI be accepted for the current formation? Same arrangement rule as the server.
function xiProblem(starters,def){if(!def)return "Formations not loaded";const saved=state.lineupDraft;state.lineupDraft=starters;try{return arrangeXI(def,draftPlayers()).problem;}finally{state.lineupDraft=saved;}}
function xiPickerMarkup(out,players){
 const def=formationDef(state.lineup.formation),ids=players.map(p=>p.id);
 const cands=state.squad.filter(p=>!ids.includes(p.id)&&POS_GROUP[p.position]===POS_GROUP[out.position]).sort((a,b)=>b.overall-a.overall).filter(p=>!xiProblem(ids.map(id=>id===out.id?p.id:id),def));
 return '<div class="xi-picker"><div class="eyebrow">'+t('CHANGE')+' · '+esc(out.position)+'</div><h3>'+esc(out.full_name)+'</h3>'+
  (cands.length?cands.map(p=>'<div class="assist-row">'+avatar(p)+'<div><strong>'+esc(p.full_name)+'</strong><div class="meta">'+esc(p.position)+' · '+esc(p.age)+' yrs</div></div><span class="rating">'+esc(p.overall)+'</span><button class="btn" data-action="xi-swap" data-player="'+esc(p.id)+'" data-out="'+esc(out.id)+'">'+t('Put in')+'</button></div>').join(''):'<p class="sub">'+t('No available player for this position.')+'</p>')+
  '<button class="btn secondary" data-action="xi-close">'+t('Close')+'</button></div>';
}
function squadPitch(){
 const ids=state.lineup?.starters||[];
 if(ids.length!==11)return '<section class="panel pitch-panel"><div class="eyebrow">'+t('PITCH')+'</div><p class="sub">'+t('Name 11 starters below to see your team on the pitch.')+'</p></section>';
 const players=ids.map(id=>state.squad.find(p=>p.id===id)).filter(Boolean);
 const pick=state.xiPick?players.find(p=>p.id===state.xiPick):null;
 return '<section class="panel pitch-panel"><div class="eyebrow">STARTING XI · '+esc(state.lineup.formation)+'</div><div class="match-pitch static-pitch">'+placeOnPitch(players,false,state.lineup.formation).map(d=>dotMarkup(d,state.club.primary_colour,true)).join('')+'</div><p class="meta">'+t('Tap a player to change him.')+'</p>'+(pick?xiPickerMarkup(pick,players):'')+'</section>';
}
// ---- Replay: a stored match played back on the pitch in about fourteen seconds.
const REPLAY_MS=14000;
function matchFromReport(r){
 const L=r.lineups||{};
 const side=s=>({name:r[s+'_name'],short:r[s+'_short_name'],colour:r[s+'_colour'],formation:s==='home'?L.homeFormation:L.awayFormation,players:(s==='home'?L.home:L.away)||[]});
 return {home:side('home'),away:side('away'),homeGoals:r.home_goals,awayGoals:r.away_goals,events:r.events||[],title:competition(r)+' · '+when(r.kickoff_at||r.played_at),demo:false};
}
async function openReplay(fixtureId){
 const data=await api('/api/clubs/'+state.club.id+'/results/'+fixtureId);
 const r=data.result;markViewed(state.results.find(x=>x.id===r.id));
 clearReplay();state.replay=matchFromReport(r);render();
}
async function openSample(){
 const data=await api('/api/demo-match');
 const side=(s,colour)=>({name:s.name,short:s.short_name,colour,formation:s.formation,players:s.players});
 clearReplay();
 state.replay={home:side(data.home,'#167a55'),away:side(data.away,'#7c8b84'),homeGoals:data.result.homeGoals,awayGoals:data.result.awayGoals,events:data.result.events,title:t('Sample match · one-minute preview'),demo:true};
 render();
}
// Telegram Main Button: the single primary action on the full-time card.
let mainButtonHandler=null;
function tgWebApp(){return window.Telegram&&window.Telegram.WebApp;}
function hideMainButton(){const tg=tgWebApp();if(!tg||!tg.MainButton)return;if(mainButtonHandler){tg.MainButton.offClick(mainButtonHandler);mainButtonHandler=null;}tg.MainButton.hide();}
function showMainButton(text,onTap){const tg=tgWebApp();if(!tg||!tg.MainButton)return;hideMainButton();mainButtonHandler=onTap;tg.MainButton.setText(text);tg.MainButton.onClick(onTap);tg.MainButton.show();}
function clearReplay(){const m=state.replay;if(m&&m.timers){m.timers.forEach(clearTimeout);m.timers=[];}hideMainButton();}
function replayScreen(){
 const m=state.replay,home=m.home,away=m.away;
 const awayColour=(away.colour||'').toLowerCase()===(home.colour||'').toLowerCase()?'#8a9a92':away.colour;
 const dots=[...placeOnPitch(home.players||[],false,home.formation).map(d=>dotMarkup(d,home.colour)),...placeOnPitch(away.players||[],true,away.formation).map(d=>dotMarkup(d,awayColour))].join('');
 return '<div class="replay"><header class="replay-top"><button class="btn ghost" data-action="replay-close">Close</button><span class="eyebrow">'+esc(m.title)+'</span><span></span></header>'+
  '<div class="replay-score"><span class="team-tag" style="--accent:'+esc(home.colour||'#167a55')+'">'+esc(home.short||home.name)+'</span><strong id="replay-score">0 — 0</strong><span class="team-tag" style="--accent:'+esc(away.colour||'#7c8b84')+'">'+esc(away.short||away.name)+'</span></div>'+
  '<div class="match-pitch replay-pitch"><div class="pitch-centre"></div>'+dots+'<div class="ball" id="replay-ball"></div></div>'+
  '<div class="timeline"><i id="replay-progress"></i></div><div class="feed" id="replay-feed"><div class="feed-line">'+t('Kick-off')+'</div></div><div id="replay-end"></div></div>';
}
function haptic(type){const h=window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.HapticFeedback;if(h&&h.notificationOccurred)h.notificationOccurred(type);}
// How strongly each position follows the ball: strikers and wingers move the most, goalkeepers stay.
const ROLE_FOLLOW={GK:.03,CB:.22,LB:.36,RB:.36,DM:.42,CM:.58,AM:.7,LW:.8,RW:.8,ST:.9};
function startReplay(){
 const m=state.replay;if(!m)return;
 m.timers=[];
 const at=(ms,fn)=>{m.timers.push(setTimeout(fn,ms));};
 const ball=$('#replay-ball'),feed=$('#replay-feed'),score=$('#replay-score'),bar=$('#replay-progress');
 if(!ball)return;
 const dots=[...root.querySelectorAll('.replay .dot')];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const pos={bx:50,by:50};
 // Every player moves on his own: he follows the ball by role, the line shifts forward or back with play, and a small wobble keeps no two players in step.
 const layout=()=>{
  for(const d of dots){
   const home=d.dataset.side==='home',f=ROLE_FOLLOW[d.dataset.role]??.4;
   // Horizontal pitch: pos.bx is the ball's goal-to-goal position, pos.by its touchline-to-touchline position.
   const lineShift=home?Math.max(0,pos.bx-50)*.15:-Math.max(0,50-pos.bx)*.15;
   const x=+d.dataset.bx+(pos.bx-(+d.dataset.bx))*.3*f+lineShift+(Math.random()-.5)*3;
   const y=+d.dataset.by+(pos.by-50)*.45*f+(Math.random()-.5)*3;
   d.style.left=clamp(x,4,96)+'%';d.style.top=clamp(y,6,94)+'%';
  }
 };
 const moveBall=(x,y)=>{pos.bx=x;pos.by=y;ball.style.left=x+'%';ball.style.top=y+'%';layout();};
 const dotAt=pid=>{const el=root.querySelector('[data-pid="'+CSS.escape(String(pid))+'"]');return el?{x:parseFloat(el.style.left),y:parseFloat(el.style.top),el}:null;};
 const line=(cls,html)=>{feed.insertAdjacentHTML('beforeend','<div class="feed-line '+cls+'">'+html+'</div>');feed.scrollTop=feed.scrollHeight;};
 let hg=0,ag=0;
 const play=e=>{
  const minute=Number(e.minute)||0;
  if(e.type==='forfeit'){line('gold',t('Forfeit · owner inactivity'));return;}
  if(e.type==='goal'){
   if(e.side==='home')hg++;else ag++;
   const goalX=e.side==='home'?93:7,scorer=dotAt(e.scorerId);
   if(scorer){moveBall(scorer.x,scorer.y);scorer.el.classList.add('pulse');at(700,()=>moveBall(goalX,50));}
   else moveBall(goalX,50);
   score.textContent=hg+' — '+ag;
   const banner=document.createElement('div');banner.className='goal-banner';banner.innerHTML='<small>'+t('GOAL')+' · '+minute+"'</small><strong>"+esc(e.scorerName||t('Goal'))+'</strong>';root.querySelector('.replay')?.appendChild(banner);at(1800,()=>banner.remove());
   const flash=document.createElement('div');flash.className='goal-flash';root.querySelector('.replay')?.appendChild(flash);at(1100,()=>flash.remove());
   score.classList.remove('pop');void score.offsetWidth;score.classList.add('pop');
   line('goal','<b>'+minute+"'</b> ⚽ "+esc(e.scorerName||t('Goal'))+(e.assistName?' <span class="muted">· '+t('assist')+' '+esc(e.assistName)+'</span>':''));
   haptic('success');
   return;
  }
  moveBall(e.side==='away'?28:72,50);
  line('','<b>'+minute+"'</b> "+esc(t(e.text||'')));
 };
 layout();
 const started=Date.now();
 const ticker=()=>{if(Date.now()-started>REPLAY_MS+500)return;layout();at(450,ticker);};
 at(450,ticker);
 const events=(m.events||[]).slice().sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0));
 for(const e of events)at(Math.min(REPLAY_MS-900,(Number(e.minute)||0)/90*REPLAY_MS),()=>play(e));
 const tick=()=>{const f=Math.min(1,(Date.now()-started)/REPLAY_MS);bar.style.width=(f*100)+'%';if(f<1)at(100,tick);};
 tick();
 at(REPLAY_MS,()=>{
  score.textContent=m.homeGoals+' — '+m.awayGoals;
  const end=$('#replay-end');
  if(m.demo)showMainButton(t('Build your squad'),()=>root.querySelector('[data-action="replay-build"]')?.click());
  end.innerHTML='<section class="panel replay-final"><div class="eyebrow">'+t('Full time')+'</div><h2>'+esc(m.home.name)+' '+m.homeGoals+' — '+m.awayGoals+' '+esc(m.away.name)+'</h2>'+(m.demo?'<p class="sub">'+t('Sample match · one-minute preview')+'</p>':'')+'<div class="actions">'+(m.demo?'<button class="btn" data-action="replay-build">'+t('Build your squad')+' →</button>':'')+'<button class="btn secondary" data-action="replay-again">'+t('Watch again')+'</button><button class="btn ghost" data-action="replay-close">'+t('Close')+'</button></div></section>';
 });
}
function render(){
 // While a replay is open it owns the screen. Background refreshes must not restart it.
 if(state.replay){if(!state.replay.started){state.replay.started=true;root.innerHTML=replayScreen();startReplay();}return;}
 if(!state.club){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><span class="tag">ISOLATED BUILD</span></header>'+createPage()+'</div>';return;}
 if(state.opening&&state.results.length){root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div><button class="club-context" data-action="edit-identity">'+miniCrest(state.club)+'<span>'+esc(state.club.name)+'</span></button></header>'+openingPage()+'</div>';return;}
 let body=state.tab==='identity'?identityPage():state.tab==='overview'?matchHome():state.tab==='squad'?squadPage():state.tab==='market'?marketPage():seasonPage();
 shell(body);
}
async function loadAll(){
 if(loadInFlight){loadAgain=true;return;}
 loadInFlight=true;
 const previousResultIds=new Set(state.results.map(r=>r.id));
 try{
  const c=await api('/api/clubs');state.clubs=c.clubs||[];
  if(!state.clubs.length){state.club=null;render();initialLoadDone=true;return;}
  state.club=state.club?state.clubs.find(x=>x.id===state.club.id)||state.clubs[0]:state.clubs[0];
  const id=state.club.id;
  const results=await Promise.all([
   api('/api/clubs/'+id+'/squad'),api('/api/clubs/'+id+'/activity'),api('/api/clubs/'+id+'/lineup'),api('/api/clubs/'+id+'/missions'),api('/api/clubs/'+id+'/fixtures'),api('/api/clubs/'+id+'/league'),api('/api/market'+(state.affordableOnly?'?maxValue='+encodeURIComponent(state.club.budget_uzs):'')),api('/api/clubs/'+id+'/ledger'),api('/api/clubs/'+id+'/development-ledger'),api('/api/clubs/'+id+'/results?limit=30'),api('/api/clubs/'+id+'/friendlies'),api('/api/clubs/'+id+'/opponents'),api('/api/clubs/'+id+'/formations'),api('/api/transfers?limit=100'),api('/api/clubs/'+id+'/transfers')
  ]);
  state.squad=results[0].players||[];state.activity=results[1].activity||null;state.lineup=results[2].lineup;state.lineupDraft=state.lineup?.starters?.slice()||[];state.missions=results[3].missions||[];state.fixtures=results[4].fixtures||[];state.table=results[5].table||[];state.leaders=results[5].leaders||{scorers:[],assists:[]};state.leagueExists=Boolean(results[5].leagueExists);state.season=results[5].season||null;state.previousSeason=results[5].previous||null;state.market=results[6].players||[];state.youth=results[6].youth||[];state.academy=results[6].academy||[];state.squadLimits=results[6].squadLimits||state.squadLimits;state.ledger=results[7].transactions||[];state.dpLedger=results[8].transactions||[];state.results=results[9].results||[];state.newResults=results[9].unviewedCount||0;state.friendlies=results[10].requests||[];state.opponents=results[11].clubs||[];state.formations=results[12].formations||[];state.formationInfo=results[12];state.formationDraft=state.lineup?.formation||'4-3-3';state.peerListings=results[13].listings||[];state.ownListings=results[14].listings||[];
  // A result created since the previous refresh is shown once, without treating a page open or polling as match activity.
  if(initialLoadDone&&!state.opening){
   const freshIndex=state.results.findIndex(r=>!r.viewed&&!previousResultIds.has(r.id));
   if(freshIndex>=0){state.opening=true;state.resultIndex=freshIndex;state.report=null;}
  }
  initialLoadDone=true;
  render();
 }finally{
  loadInFlight=false;
  if(loadAgain){loadAgain=false;void loadAll().catch(()=>{});}
 }
}
function startAutoRefresh(){
 if(refreshTimer)clearInterval(refreshTimer);
 // Refresh only while the app is visible and the manager is not editing a form. Hidden/background polling is avoided.
 const refresh=()=>{
  if(document.visibilityState!=='visible'||state.opening||state.replay)return;
  if(document.activeElement?.closest?.('form'))return;
  void loadAll().catch(()=>{});
 };
 refreshTimer=setInterval(refresh,30000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
 window.addEventListener('focus',refresh);
}
async function uploadCrest(file){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Choose a PNG, JPG or WEBP image under 2 MB.');
 const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error(t('Could not read crest image')));reader.readAsDataURL(file);});
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
  if(action==='xi-slot'){state.xiPick=b.dataset.player;render();return;}
  if(action==='xi-close'){state.xiPick=null;render();return;}
  if(action==='xi-swap'){
   const out=b.dataset.out,starters=state.lineup.starters.map(id=>id===out?b.dataset.player:id),problem=xiProblem(starters,formationDef(state.lineup.formation));
   if(problem){render();toast('Not saved. '+problem);return;}
   const subs=state.squad.filter(p=>!starters.includes(p.id)).sort((a,b)=>b.overall-a.overall).slice(0,7).map(p=>p.id);
   state.xiPick=null;
   try{await saveLineup(state.lineup.formation,starters,subs,t('Player changed'));}catch(error){render();toast('Not saved. '+error.message);}
   return;
  }
  if(action==='pick-formation'){state.formationDraft=b.dataset.formation;render();return;}
  if(action==='toggle-starter'){
   const id=b.dataset.player,draft=state.lineupDraft.slice(),index=draft.indexOf(id);
   if(index>=0)draft.splice(index,1);else{if(draft.length>=11)throw new Error(t('Your Starting XI already has 11 players. Remove one first.'));draft.push(id);}
   state.lineupDraft=draft;
   if(draft.length===11){const problem=arrangeXI(formationDef(state.formationDraft),draftPlayers()).problem;if(problem){render();toast('Not saved. '+problem);return;}try{await saveLineup(state.formationDraft,draft,draftBench(),'Starting XI saved');}catch(error){render();toast('Not saved. '+error.message);}}
   else{render();toast(draft.length+' / 11 selected');}
   return;
  }
  if(action==='save-formation'){const problem=arrangeXI(formationDef(state.formationDraft),draftPlayers()).problem;if(problem)throw new Error(problem);await saveLineup(state.formationDraft,state.lineupDraft,draftBench(),t('Formation saved'));return;}
  if(action==='auto-lineup'){const def=formationDef(state.formationDraft);if(def.best.starters.length!==11)throw new Error('Your squad cannot field eleven players.');await saveLineup(def.id,def.best.starters,def.best.substitutes,'Starting XI saved');return;}
  if(action==='upgrade'){await api('/api/clubs/'+state.club.id+'/players/upgrade',{method:'POST',body:{playerId:b.dataset.player,attribute:b.dataset.attr,levels:1}});toast(t('Player upgraded'));await loadAll();return;}
  if(action==='sell'){if(!confirm('Sell this player for '+(b.dataset.rate||'80')+'% of market value?'))return;const sold=await api('/api/clubs/'+state.club.id+'/players/sell',{method:'POST',body:{playerId:b.dataset.player}});toast('Player sold for '+money(sold.feeUzs)+(sold.promoted?.length?' · '+sold.promoted.map(x=>x.full_name).join(', ')+' promoted to the XI':''));await loadAll();return;}
  if(action==='toggle-affordable'){state.affordableOnly=!state.affordableOnly;await loadAll();return;}
  if(action==='overview-filter'){state.overviewFilter=b.dataset.filter||'squad';render();return;}
  if(action==='player-profile'){state.profilePlayer=state.market.find(p=>p.id===b.dataset.player)||null;render();return;}
  if(action==='close-profile'){state.profilePlayer=null;render();return;}
  if(action==='list-transfer'){const price=prompt('Enter your asking price in UZS (integer):');if(price===null)return;if(!/^\d{1,18}$/.test(price)||BigInt(price)<=0n)throw new Error(t('Enter a positive whole-number UZS asking price'));await api('/api/clubs/'+state.club.id+'/transfers',{method:'POST',body:{playerId:b.dataset.player,askingPriceUzs:price}});toast(t('Player listed for transfer'));await loadAll();return;}
  if(action==='buy-transfer'){if(!confirm('Buy this player at the displayed asking price?'))return;await api('/api/clubs/'+state.club.id+'/transfers/'+b.dataset.listing+'/buy',{method:'POST',body:{}});toast(t('Player transferred to your club'));await loadAll();return;}
  if(action==='cancel-transfer'){if(!confirm('Cancel this player listing?'))return;await api('/api/clubs/'+state.club.id+'/transfers/'+b.dataset.listing+'/cancel',{method:'POST',body:{}});toast('Listing cancelled');await loadAll();return;}
  if(action==='sign'){await api('/api/clubs/'+state.club.id+'/players/sign',{method:'POST',body:{playerId:b.dataset.player}});state.profilePlayer=null;toast(t('Player signed'));await loadAll();return;}
  if(action==='watch-replay'){await openReplay(b.dataset.fixture);return;}
  if(action==='watch-sample'){await openSample();return;}
  if(action==='replay-close'){clearReplay();state.replay=null;render();return;}
  if(action==='replay-again'){clearReplay();state.replay.started=false;render();return;}
  if(action==='replay-build'){clearReplay();state.replay=null;state.tab='market';render();return;}
  if(action==='lang'){window.setZaminLang(window.ZAMIN_LANG==='ru'?'uz':'ru');return;}
  if(action==='market-tab'){state.marketTab=b.dataset.marketTab;render();return;}
  if(action==='refresh'){await loadAll();toast('Updated');return;}
  if(action==='open-report'){const data=await api('/api/clubs/'+state.club.id+'/results/'+b.dataset.fixture);state.report=data.result;markViewed(state.results.find(x=>x.id===data.result.id));render();$('#match-report')?.scrollIntoView({block:'start'});return;}
  if(action==='close-report'){state.report=null;render();return;}
  if(action==='result-older'||action==='result-newer'){state.resultIndex=Math.max(0,Math.min(state.results.length-1,state.resultIndex+(action==='result-older'?1:-1)));state.report=null;render();return;}
  if(action==='continue-dashboard'){state.opening=false;state.report=null;state.tab='overview';if(state.newResults>0){const data=await api('/api/clubs/'+state.club.id+'/results/viewed',{method:'POST',body:{all:true}});state.newResults=data.unviewedCount;state.results.forEach(x=>{x.viewed=true;});}render();return;}
  if(action==='friendly-accept'||action==='friendly-decline'||action==='friendly-cancel'){const verb=action.slice(9);await api('/api/clubs/'+state.club.id+'/friendlies/'+b.dataset.request+'/'+verb,{method:'POST',body:{}});toast(verb==='accept'?'Friendly scheduled':verb==='decline'?'Request declined':'Request cancelled');await loadAll();return;}
 }catch(err){toast(err.message||t('Action failed'));b.disabled=false;}
});
root.addEventListener('input',e=>{if(e.target.id==='market-search'){state.marketQuery=e.target.value;const pos=$('#market-position')?.value||state.marketPosition,club=$('#market-club')?.value||state.marketClub;state.marketPosition=pos;state.marketClub=club;const focused=e.target.selectionStart;render();const next=$('#market-search');if(next){next.focus();next.setSelectionRange(focused,focused);}}});
root.addEventListener('change',async e=>{if(e.target.id==='market-position'){state.marketPosition=e.target.value;render();return;}if(e.target.id==='market-club'){state.marketClub=e.target.value;render();return;}if(e.target.id==='club-switcher'){state.club=state.clubs.find(x=>x.id===e.target.value)||state.club;state.tab='overview';state.report=null;await loadAll();}});
root.addEventListener('submit',async e=>{
 if(e.target.id!=='friendly-form')return;e.preventDefault();
 const data=new FormData(e.target),button=e.target.querySelector('button[type=submit]');button.disabled=true;
 try{
  const local=String(data.get('kickoff')||'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local))throw new Error('Choose a kick-off date and time');
  // The entered wall-clock time is Tashkent time (UTC+5, no daylight saving), whatever the device timezone is.
  await api('/api/clubs/'+state.club.id+'/friendlies',{method:'POST',body:{opponentClubId:data.get('opponent'),kickoffAt:local.slice(0,16)+':00+05:00'}});
  toast('Challenge sent');await loadAll();
 }catch(err){toast(err.message||t('Could not send the challenge'));button.disabled=false;}
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
// Browser / PWA sign-in: the Telegram Login Widget returns a signed user, which the server exchanges for a session token.
const TELEGRAM_LOGIN_BOT='zamingame_bot';
window.onTelegramAuth=async function(user){
 try{
  const login=await fetch((cfg.apiBase||'')+'/api/auth/telegram-widget',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(user)});
  const data=await login.json().catch(()=>({}));
  if(!login.ok)throw new Error(data.error||'Telegram sign-in failed');
  localStorage.setItem('zamin-token',data.token);
  location.reload();
 }catch(err){toast(err.message);}
};
function showTelegramSignIn(){
 root.innerHTML='<div class="shell"><header class="top"><div class="brand"><span class="mark">Z</span><span>ZAMIN FK</span></div></header><section class="panel create"><h1>'+t('Sign in')+'</h1><p class="sub">'+t('Sign in with Telegram to open your club.')+'</p><div id="tg-login"></div></section></div>';
 const s=document.createElement('script');
 s.async=true;s.src='https://telegram.org/js/telegram-widget.js?22';
 s.setAttribute('data-telegram-login',TELEGRAM_LOGIN_BOT);s.setAttribute('data-size','large');
 s.setAttribute('data-onauth','onTelegramAuth(user)');s.setAttribute('data-request-access','write');
 document.getElementById('tg-login').appendChild(s);
}
async function boot(){
 try{
  const tg=window.Telegram&&window.Telegram.WebApp;
  if(tg&&tg.initData){tg.ready();tg.expand();const login=await api('/api/auth/telegram',{method:'POST',body:{initData:tg.initData}});state.token=login.token;state.user=login.user;}
  else if(!cfg.devUserId){
   const saved=localStorage.getItem('zamin-token');
   if(saved){state.token=saved;}
   else{showTelegramSignIn();return;}
  }
  await loadAll();
  startAutoRefresh();
  // Opening the game only reads stored results; it never starts or settles a match.
  if(state.club&&state.results.length){const firstNew=state.results.findIndex(r=>!r.viewed);state.resultIndex=firstNew>=0?firstNew:0;state.opening=true;render();}
 }catch(err){root.innerHTML='<div class="shell"><section class="panel create"><h1>Connection unavailable</h1><p class="sub">'+esc(err.message)+'</p><p class="sub">Check the isolated game server URL, database migration and authentication settings.</p></section></div>';}
}
syncOnline();boot();
})();
