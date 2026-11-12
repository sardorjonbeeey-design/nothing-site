// Mobile browser smoke test for the game client, driven with Playwright (not a project dependency).
// Run only against a LOCAL development server started with NODE_ENV=development and ALLOW_DEV_AUTH=true
// on a freshly migrated and seeded throwaway LOCAL database.
// Usage: node scripts/mobile-smoke.cjs http://127.0.0.1:18181 postgresql://postgres@localhost:55432/zamin_game [screenshot-dir]
// The Telegram script is blocked and dev authentication is injected, so nothing external is contacted.
// Users cannot start matches, so the script moves kick-off times into the past directly in the local database
// and then waits for the server's own scheduler to settle them.
const {chromium,devices}=require('playwright');
const {Client}=require('pg');
const base=process.argv[2],dbUrl=process.argv[3]||'',shots=process.argv[4]||'';
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)){console.error('Pass a local base URL, e.g. http://127.0.0.1:18181');process.exit(2);}
let parsed;try{parsed=new URL(dbUrl);}catch{parsed=null;}
if(!parsed||!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/zamin_game'){console.error('Pass the LOCAL throwaway database URL (localhost, database zamin_game)');process.exit(2);}
const results=[];
const check=(name,pass,detail='')=>{results.push({name,pass});console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
async function api(dev,method,route,body){
 const res=await fetch(base+route,{method,headers:{'content-type':'application/json','x-dev-user-id':String(dev),'x-forwarded-for':'10.1.0.'+(dev%250)},body:body?JSON.stringify(body):undefined});
 if(!res.ok)throw new Error(method+' '+route+' -> '+res.status+' '+await res.text());return res.json();
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Wall-clock Tashkent time two days ahead, as typed into the datetime-local field.
function tashkentInput(hour){const d=new Date(Date.now()+5*3600000+2*86400000);return d.toISOString().slice(0,10)+'T'+String(hour).padStart(2,'0')+':00';}
(async()=>{
 const db=new Client({connectionString:dbUrl});await db.connect();
 const played=async where=>Number((await db.query("SELECT COUNT(*)::int AS n FROM fixtures WHERE status='played' AND "+where)).rows[0].n);
 const waitPlayed=async(where,n)=>{for(let i=0;i<150;i++){if(await played(where)>=n)return true;await sleep(200);}return false;};
 const browser=await chromium.launch();
 const fillers={};
 for(const [label,device] of [['Pixel 7',devices['Pixel 7']],['360px narrow',{viewport:{width:360,height:740},isMobile:true,hasTouch:true,userAgent:devices['Pixel 7'].userAgent}]]){
  const dev=label==='Pixel 7'?501:502,inLeague=dev===501;
  const context=await browser.newContext({...device});
  await context.route('**/telegram.org/**',route=>route.abort());
  await context.addInitScript(id=>{window.ZAMIN_GAME_CONFIG={apiBase:'',devUserId:id};},String(dev));
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/telegram|ERR_FAILED/i.test(m.text()))errors.push(m.text());});
  page.on('dialog',d=>d.accept());
  const noOverflow=async()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  const shot=async name=>{if(shots)await page.screenshot({path:shots+'/'+label.replace(/\W+/g,'-')+'-'+name+'.png',fullPage:true});};
  const tab=async name=>{await page.click('nav [data-tab="'+name+'"]');};
  const toast=async text=>page.waitForSelector('.toast:has-text("'+text+'")',{timeout:8000});
  const content=async()=>page.textContent('.content');
  const open=async()=>{await page.goto(base+'/');await page.waitForSelector('.club-card, .opening');return (await page.locator('.opening').count())>0;};

  await page.goto(base+'/');
  await page.waitForSelector('#club-form');
  check(label+': create-club form loads',true);
  check(label+': create form fits the viewport',await noOverflow());
  await page.fill('input[name=name]','Mobile Test '+dev);
  await page.fill('input[name=shortName]','MT'+String(dev).slice(-1));
  await page.click('#club-form button[type=submit]');
  await page.waitForSelector('.club-card');
  check(label+': club created and overview shown',(await page.textContent('.club-card')).includes('Mobile Test '+dev));
  check(label+': opening budget is 20,000,000 UZS',(await page.textContent('.stats')).includes('20,000,000 UZS'));
  check(label+': a second club cannot be started',(await page.locator('[data-action="new-club"]').count())===0);
  check(label+': squad size 18 shown',(await page.textContent('.stats')).includes('18'));
  check(label+': overview fits the viewport',await noOverflow());
  const club=(await api(dev,'GET','/api/clubs')).clubs[0];

  await tab('squad');await page.waitForSelector('.player');
  check(label+': squad lists 18 players',(await page.locator('.player').count())===18);
  check(label+': lineup shows 11/11',(await content()).includes('11/11 selected'));
  check(label+': squad limits and academy resale are shown',(await content()).includes('MIN 13 · MAX 26')&&(await page.locator('.player:has-text("ACADEMY PRODUCT · first sale pays 50%")').count())===18);
  check(label+': squad fits the viewport',await noOverflow());
  // ---- Formations: all 12 are shown, selectable and playable; nothing is saved by merely looking at one.
  const ALL=['4-3-3','4-2-3-1','4-4-2','4-1-4-1','4-4-1-1','3-5-2','3-4-3','3-4-2-1','5-3-2','5-4-1','4-2-2-2','4-3-2-1'];
  const chips=page.locator('.formations .formation');
  check(label+': all 12 formations are offered',JSON.stringify(await page.locator('.formations .formation strong').allTextContents())===JSON.stringify(ALL));
  check(label+': no pitch drawing is left in the formation interface',(await page.locator('.mini-pitch, .fpitch, .lineup svg, .lineup canvas, .lineup img, .structure').count())===0);
  check(label+': the formation number is the main element of every card',(await chips.evaluateAll(els=>els.every(el=>{const size=x=>parseFloat(getComputedStyle(x).fontSize),strong=el.querySelector('strong');return size(strong)>=15&&[...el.querySelectorAll('small')].every(x=>size(x)<size(strong))&&strong.scrollWidth<=el.clientWidth;}))));
  check(label+': every formation shows best XI strength and formation fit',(await page.locator('.formations .f-strength').allTextContents()).every(x=>/^Best XI \d+\.\d$/.test(x))&&(await page.locator('.formations .f-fit').allTextContents()).every(x=>/^Fit [+-]\d\.\d\d$/.test(x))&&(await page.locator('.formations .f-fit').count())===12);
  check(label+': formation cards are large enough to tap and form an even grid',(await chips.evaluateAll(els=>{const r=els.map(el=>el.getBoundingClientRect());return r.every(x=>x.width>=80&&x.height>=56&&x.left>=0&&x.right<=window.innerWidth)&&new Set(r.map(x=>Math.round(x.width))).size===1&&r.every((a,i)=>r.every((b,j)=>i>=j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));})));
  check(label+': exactly the saved formation is marked',(await page.locator('.formation.saved strong').allTextContents()).join()==='4-3-3'&&(await page.locator('.formation.saved em').textContent())==='SAVED');
  const savedLineup=async()=>(await api(dev,'GET','/api/clubs/'+club.id+'/lineup')).lineup;
  // The role list: eleven rows, one per slot, each with a player, inside the panel and never cut off sideways.
  const rolesOk=async()=>page.evaluate(()=>{
   const panel=document.querySelector('.lineup').getBoundingClientRect(),rows=[...document.querySelectorAll('.roles .role')];
   const inside=rows.every(el=>[el,...el.children].every(x=>{const r=x.getBoundingClientRect();return r.left>=panel.left-1&&r.right<=panel.right+1;}));
   const names=rows.map(el=>el.querySelector('span').textContent),labels=rows.map(el=>el.querySelector('b').textContent);
   return {count:rows.length,inside,unique:names.every(Boolean)&&new Set(labels).size===labels.length&&new Set(names).size===names.length,empty:document.querySelectorAll('.roles .role.empty').length,wrong:document.querySelectorAll('.roles .role.wrong').length};
  });
  let allOk=true,detail='',previous='4-3-3';
  for(const id of ALL){
   await page.click('.formation[data-formation="'+id+'"]');
   await page.waitForSelector('.formation.active[data-formation="'+id+'"]');
   const before=await savedLineup(),p=await rolesOk();
   const selected=(await page.locator('.formation.active strong').allTextContents()).join()===id&&(await page.textContent('.lineup .field label')).includes(id);
   const previewOnly=id===previous||((await page.textContent('#lineup-state')).includes('Not saved')&&before.formation===previous);
   await page.click('[data-action="auto-lineup"]');await toast('Starting XI saved');
   await page.waitForFunction(f=>document.querySelector('#lineup-state')?.textContent.includes('Saved · '+f),id);
   const after=await savedLineup(),q=await rolesOk();
   const marked=(await page.locator('.formation.saved strong').allTextContents()).join()===id;
   const fine=selected&&previewOnly&&marked&&p.count===11&&p.inside&&q.count===11&&q.inside&&q.unique&&q.empty===0&&q.wrong===0&&after.formation===id&&new Set(after.starters).size===11&&await noOverflow()&&(await page.locator('#lineup-fit').count())===1;
   if(!fine){allOk=false;detail+=id+' '+JSON.stringify({selected,previewOnly,p,q,saved:after.formation})+' ';}
   if(['3-4-2-1','5-3-2'].includes(id))await shot('formation-'+id);
   previous=id;await page.waitForFunction(()=>!document.querySelector('.toast'));
  }
  check(label+': each of the 12 formations previews, auto-picks 11 unique players in valid roles, saves and fits the screen',allOk,detail);
  await page.click('.formation[data-formation="4-4-2"]');await page.click('[data-action="auto-lineup"]');await toast('Starting XI saved');
  check(label+': auto-pick XI saves the lineup',(await savedLineup()).formation==='4-4-2');
  await page.reload();await page.waitForSelector('.club-card, .opening');await tab('squad');await page.waitForSelector('.roles');
  check(label+': the saved formation is shown after a reload',(await page.locator('.formation.active strong').allTextContents()).join()==='4-4-2'&&(await page.textContent('#lineup-state')).includes('Saved · 4-4-2'));
  // Manual changes: removing a player leaves an empty role; an eleven the server refuses is not saved.
  const stored=await savedLineup();
  const striker=page.locator('.player:has-text("ST ·") [data-action="toggle-starter"]:has-text("Remove XI")').first(),strikerId=await striker.getAttribute('data-player');
  await striker.click();await toast('10 / 11 selected');
  check(label+': a removed starter leaves one empty role in the list',(await page.locator('.roles .role.empty').count())===1&&(await page.locator('.roles .role').count())===11&&(await page.textContent('#lineup-problem')).includes('10 selected'));
  await page.waitForFunction(()=>!document.querySelector('.toast'));
  await page.locator('.player:has-text("GK ·") [data-action="toggle-starter"]:has-text("Add to XI")').first().click();await toast('Not saved');
  check(label+': a second goalkeeper is refused with a reason and nothing is saved',(await page.textContent('#lineup-problem')).includes('exactly one goalkeeper')&&(await page.textContent('#lineup-state')).includes('Not saved')&&(await page.locator('.roles .role.wrong').count())===1&&JSON.stringify(await savedLineup())===JSON.stringify(stored));
  const direct=await fetch(base+'/api/clubs/'+club.id+'/lineup',{method:'POST',headers:{'content-type':'application/json','x-dev-user-id':String(dev),'x-forwarded-for':'10.1.0.'+(dev%250)},body:JSON.stringify({formation:'4-4-2',starters:await page.evaluate(()=>[...document.querySelectorAll('[data-action="toggle-starter"]')].filter(b=>b.textContent==='Remove XI').map(b=>b.dataset.player))})});
  check(label+': the server refuses the same eleven when it is sent directly',direct.status===400);
  await page.waitForFunction(()=>!document.querySelector('.toast'));
  await page.locator('.player:has-text("GK ·") [data-action="toggle-starter"]:has-text("Remove XI")').last().click();await toast('10 / 11 selected');
  await page.locator('[data-action="toggle-starter"][data-player="'+strikerId+'"]').click();await toast('Starting XI saved');
  check(label+': manual XI toggle saves at 11 players',(await savedLineup()).starters.includes(strikerId));
  check(label+': squad with the lineup panel fits the viewport',await noOverflow());
  await shot('squad-formation');

  await tab('market');await page.waitForSelector('.player');
  check(label+': market lists free agents',(await page.locator('.player').count())>0);
  check(label+': youth intake lists at least 12 players rated 45-50',(await page.locator('#youth-list .player').count())>=12&&(await page.locator('#youth-list .rating').allTextContents()).every(x=>Number(x)>=45&&Number(x)<=50));
  await page.click('[data-action="toggle-affordable"]');await page.waitForSelector('text=AFFORDABLE PLAYERS');
  check(label+': affordable filter leaves only signable players',(await page.locator('#market-list [data-action="sign"][disabled]').count())===0&&(await page.locator('#market-list .player').count())>0);
  await page.click('[data-action="toggle-affordable"]');await page.waitForSelector('text=TOP AVAILABLE PLAYERS');
  const budgetBefore=BigInt((await api(dev,'GET','/api/clubs')).clubs[0].budget_uzs);
  await page.locator('#youth-list [data-action="sign"]').first().click();await toast('Player signed');
  const budgetAfter=BigInt((await api(dev,'GET','/api/clubs')).clubs[0].budget_uzs);
  check(label+': signing a youth player costs its listed price',budgetBefore-budgetAfter>=270000n&&budgetBefore-budgetAfter<=460000n);
  await tab('squad');await page.waitForSelector('.player');
  await page.locator('.player:has-text("STARTING XI") [data-action="sell"]').first().click();await toast('promoted to the XI');
  await page.waitForFunction(()=>document.querySelectorAll('.player').length===18,null,{timeout:8000});
  check(label+': selling a starter promotes a replacement and keeps 11/11',(await content()).includes('11/11 selected'));
  await tab('market');await page.waitForSelector('.player');
  check(label+': market fits the viewport',await noOverflow());
  await tab('missions');await page.waitForSelector('.mission');
  check(label+': 5 missions listed',(await page.locator('.mission').count())===5);
  check(label+': missions fit the viewport',await noOverflow());
  await tab('results');
  check(label+': results empty state before any match',(await content()).includes('has not played a match yet'));

  if(inLeague){
   await tab('fixtures');
   check(label+': fixtures empty state before 10 clubs',(await content()).includes('at least 10 clubs'));
   await tab('league');
   check(label+': league empty state before 10 clubs',(await content()).includes('No active league yet'));
   await tab('friendlies');
   check(label+': friendlies empty state without other clubs',(await content()).includes('No other clubs exist yet'));
   for(let i=1;i<=9;i++)fillers[i]=(await api(600+i,'POST','/api/clubs',{name:'Filler Club '+i,shortName:'FC'+i,primaryColour:'#225588',secondaryColour:'#ffffff'})).club;
   check(label+': a club that has never played opens on the normal dashboard',!(await open()));
   await tab('fixtures');await page.waitForSelector('.fixture');
   check(label+': 18 league fixtures listed',(await page.locator('.fixture').count())===18);
   check(label+': every fixture shows a 20:00 Tashkent kick-off',(await page.locator('.fixture .meta:has-text("20:00 · Tashkent time")').count())===18);
   check(label+': matchdays run 1-9 and 11-19',(await content()).includes('MATCHDAY 19')&&!(await content()).includes('MATCHDAY 10 '));
   check(label+': all fixtures are upcoming',(await page.locator('.fixture .pill:has-text("UPCOMING")').count())===18);
   check(label+': there is no control to play, start or settle a match',(await page.locator('[data-action="play"], button:has-text("Play")').count())===0);
   check(label+': fixtures fit the viewport',await noOverflow());
   await shot('1-fixtures');
  }else{
   await tab('fixtures');
   check(label+': an 11th club has no league fixtures',(await page.locator('.fixture').count())===0);
   await tab('league');
   check(label+': a waiting club is told about its matchday income',(await content()).includes('not in a league yet'));
  }

  // Friendlies: send a challenge through the form, then let a local filler club answer through the API.
  await tab('friendlies');await page.waitForSelector('#friendly-form');
  check(label+': friendly challenge form fits the viewport',await noOverflow());
  await page.selectOption('#friendly-form select[name=opponent]',fillers[1].id);
  await page.fill('#friendly-form input[name=kickoff]',tashkentInput(inLeague?12:13));
  await page.click('#friendly-form button[type=submit]');await toast('Challenge sent');
  await page.waitForSelector('[data-action="friendly-cancel"]');
  check(label+': sent challenge is pending at the entered Tashkent time',(await content()).includes((inLeague?'12':'13')+':00 · Tashkent time'));
  const sent=(await api(601,'GET','/api/clubs/'+fillers[1].id+'/friendlies')).requests.find(r=>r.from_club_id===club.id&&r.status==='pending');
  const friendly=(await api(601,'POST','/api/clubs/'+fillers[1].id+'/friendlies/'+sent.id+'/accept')).fixture;
  const later=new Date(Date.now()+(inLeague?3:4)*86400000).toISOString();
  await api(602,'POST','/api/clubs/'+fillers[2].id+'/friendlies',{opponentClubId:club.id,kickoffAt:later});
  await api(603,'POST','/api/clubs/'+fillers[3].id+'/friendlies',{opponentClubId:club.id,kickoffAt:later});
  await open();await tab('friendlies');await page.waitForSelector('[data-action="friendly-accept"]');
  check(label+': two incoming challenges offer accept and decline',(await page.locator('[data-action="friendly-accept"]').count())===2&&(await page.locator('[data-action="friendly-decline"]').count())===2);
  await page.locator('[data-action="friendly-decline"]').first().click();await toast('Request declined');
  await page.locator('[data-action="friendly-accept"]').first().click();await toast('Friendly scheduled');
  check(label+': accepted, declined and scheduled requests are listed',/ACCEPTED/.test(await content())&&/DECLINED/.test(await content()));
  check(label+': friendlies fit the viewport',await noOverflow());
  await shot('2-friendlies');
  await tab('fixtures');await page.waitForSelector('.fixture');
  check(label+': accepted friendlies appear among the fixtures',(await page.locator('.fixture .meta:has-text("FRIENDLY")').count())===2);

  // Let the server play matches: move kick-offs into the past in the local database and wait for the scheduler.
  let expected;
  if(inLeague){
   await db.query("UPDATE fixtures SET kickoff_at=NOW()-make_interval(hours=>(4-day_number)) WHERE kind='league' AND day_number IN (1,2,3)");
   check(label+': the server settles three matchdays on its own',await waitPlayed("kind='league'",15));expected=3;
  }else{
   await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '2 minutes' WHERE id=$1",[friendly.id]);
   check(label+': the server settles the friendly on its own',await waitPlayed("id='"+friendly.id+"'",1));expected=1;
  }
  check(label+': opening the game shows the result screen first',await open());
  const opening=async()=>page.textContent('.opening');
  check(label+': newest result is marked as new',(await opening()).includes('NEW RESULT'));
  if(expected>1)check(label+': accumulated results are announced',(await opening()).includes(expected+' results came in'));
  check(label+': both clubs and both crests are shown',(await page.locator('.result-card .result-side strong').count())===2&&(await page.locator('.result-card .crest').count())===2&&(await opening()).includes('Mobile Test '+dev));
  check(label+': final score is shown',/^\d+ — \d+$/.test((await page.textContent('.result-goals')).trim()));
  check(label+': win, draw or loss is shown',/^(WIN|DRAW|LOSS)$/.test((await page.textContent('.result-card .outcome')).trim()));
  check(label+': match date and time are shown in Tashkent time',/\d{2} \w{3} \d{4}, \d{2}:\d{2} · Tashkent time/.test(await page.textContent('.result-when')));
  check(label+': competition is labelled',(await page.textContent('.result-when')).includes(inLeague?'LEAGUE · SEASON 1 · MATCHDAY 3':'FRIENDLY'));
  check(label+': result counter shown',(await opening()).includes('Result 1 of '+expected));
  check(label+': opening result screen fits the viewport',await noOverflow());
  await shot('3-opening-result');
  await page.click('[data-action="open-report"]');await page.waitForSelector('.opening .event-list');
  check(label+': full match report opens from the result screen',(await page.locator('.opening .event-list div').count())>0);
  check(label+': match report fits the viewport',await noOverflow());
  await shot('4-opening-report');
  if(expected>1){
   await page.click('[data-action="result-older"]');
   check(label+': previous results can be reached',(await opening()).includes('Result 2 of '+expected)&&(await page.textContent('.result-when')).includes('MATCHDAY 2'));
   await page.click('[data-action="result-newer"]');
   check(label+': and the newer one again',(await opening()).includes('Result 1 of '+expected));
  }
  await page.click('[data-action="continue-dashboard"]');await page.waitForSelector('.club-card');
  check(label+': continue leads to the normal dashboard',true);
  check(label+': viewed state is stored on the server',(await api(dev,'GET','/api/clubs/'+club.id+'/results')).unviewedCount===0);
  check(label+': the next opening shows the latest result as already seen',(await open())&&(await opening()).includes('LATEST RESULT')&&!(await opening()).includes('NEW RESULT'));
  await page.click('[data-action="continue-dashboard"]');await page.waitForSelector('.club-card');
  check(label+': overview shows the latest match',(await content()).includes('LATEST MATCH'));

  await tab('results');await page.waitForSelector('.fixture');
  check(label+': results history lists every completed match',(await page.locator('.fixture').count())===expected);
  await page.locator('[data-action="open-report"]').first().click();await page.waitForSelector('#match-report .event-list');
  check(label+': a report opens from the results history',true);
  check(label+': results fit the viewport',await noOverflow());
  await shot('5-results');
  await page.click('[data-action="close-report"]');

  if(inLeague){
   await tab('fixtures');await page.waitForSelector('.fixture');
   check(label+': played fixtures show a score',(await page.locator('.fixture .score').count())===3);
   await db.query("UPDATE fixtures SET kickoff_at=NOW()-interval '20 seconds' WHERE kind='league' AND day_number=4");
   await page.click('[data-action="refresh"]');await toast('Updated');
   check(label+': a match inside its 60 seconds is shown as live, without a score',(await page.locator('.fixture .pill.live').count())===1&&(await page.locator('.fixture .score').count())===3);
   await shot('6-fixtures-live');
   await tab('league');await page.waitForSelector('table');
   check(label+': league table has 10 rows',(await page.locator('tbody tr').count())===10);
   check(label+': league page fits the viewport (table scrolls inside its panel)',await noOverflow());
   await tab('missions');
   check(label+': mission progress updated by the automatic matches',(await content()).includes('COMPLETED'));
   await tab('squad');await page.waitForSelector('.player');
   await page.locator('[data-action="upgrade"]').first().click();await toast('Player upgraded');
   check(label+': player upgrade with earned DP',true);
   const before=await page.locator('.player').count();
   await page.locator('.player:has-text("SQUAD ·") [data-action="sell"]').first().click();await toast('Player sold');
   check(label+': selling a squad player',await page.waitForFunction(n=>document.querySelectorAll('.player').length===n,before-1,{timeout:8000}).then(()=>true,()=>false));
   await tab('market');await page.waitForSelector('.player');
   const affordable=page.locator('[data-action="sign"]:not([disabled])');
   if(await affordable.count()){await affordable.first().click();await toast('Player signed');check(label+': signing an affordable player',true);}
   else check(label+': signing an affordable player',false,'no affordable free agent in the first 100 listed');
   await tab('overview');
   check(label+': finance and DP history shown',/player sale/.test(await content())&&/league match income/.test(await content())&&/match reward/.test(await content()));
   await tab('league');await page.waitForSelector('table');
   check(label+': league page names the season',(await content()).includes('Season 1'));
  }

  await tab('overview');
  await page.click('[data-action="edit-identity"]');await page.waitForSelector('#identity-form');
  await page.fill('#identity-form input[name=name]','Renamed '+dev);
  await page.click('#identity-form button[type=submit]');await toast('Club identity updated');
  check(label+': identity edit saved',(await page.textContent('.club-card')).includes('Renamed '+dev));
  check(label+': no uncaught page or console errors',errors.length===0,errors.join(' | '));
  await context.close();
 }
 await browser.close();await db.end();
 const failed=results.filter(r=>!r.pass);
 console.log('\n'+(results.length-failed.length)+' passed, '+failed.length+' failed');
 process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
