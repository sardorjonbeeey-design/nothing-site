// Mobile browser smoke test for the game client, driven with Playwright (not a project dependency).
// Run only against a LOCAL development server started with NODE_ENV=development and ALLOW_DEV_AUTH=true
// on a throwaway local database. Usage: node scripts/mobile-smoke.cjs http://127.0.0.1:18181 [screenshot-dir]
// The Telegram script is blocked and dev authentication is injected, so nothing external is contacted.
const {chromium,devices}=require('playwright');
const base=process.argv[2],shots=process.argv[3]||'';
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)){console.error('Pass a local base URL, e.g. http://127.0.0.1:18181');process.exit(2);}
const results=[];
const check=(name,pass,detail='')=>{results.push({name,pass});console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
async function api(dev,method,route,body){
 const res=await fetch(base+route,{method,headers:{'content-type':'application/json','x-dev-user-id':String(dev),'x-forwarded-for':'10.1.0.'+dev},body:body?JSON.stringify(body):undefined});
 if(!res.ok)throw new Error(method+' '+route+' -> '+res.status);return res.json();
}
(async()=>{
 const browser=await chromium.launch();
 for(const [label,device] of [['Pixel 7',devices['Pixel 7']],['360px narrow',{viewport:{width:360,height:740},isMobile:true,hasTouch:true,userAgent:devices['Pixel 7'].userAgent}]]){
  const dev=label==='Pixel 7'?501:502;
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

  await page.goto(base+'/');
  await page.waitForSelector('#club-form');
  check(label+': create-club form loads',true);
  check(label+': create form fits the viewport',await noOverflow());
  await shot('1-create');
  await page.fill('input[name=name]','Mobile Test '+dev);
  await page.fill('input[name=shortName]','MT'+String(dev).slice(-1));
  await page.click('#club-form button[type=submit]');
  await page.waitForSelector('.club-card');
  check(label+': club created and overview shown',(await page.textContent('.club-card')).includes('Mobile Test '+dev));
  check(label+': budget shown in UZS',(await page.textContent('.stats')).includes('UZS'));
  check(label+': squad size 18 shown',(await page.textContent('.stats')).includes('18'));
  check(label+': overview fits the viewport',await noOverflow());
  await shot('2-overview');

  await tab('squad');await page.waitForSelector('.player');
  check(label+': squad lists 18 players',(await page.locator('.player').count())===18);
  check(label+': lineup shows 11/11',(await page.textContent('.content')).includes('11/11 selected'));
  check(label+': squad fits the viewport',await noOverflow());
  await page.selectOption('#formation-select','4-4-2');
  await page.click('[data-action="auto-lineup"]');await toast('Starting XI saved');
  check(label+': auto-pick XI saves the lineup',true);
  await page.locator('[data-action="toggle-starter"]:has-text("Remove XI")').first().click();await toast('10 / 11 selected');
  await page.locator('[data-action="toggle-starter"]:has-text("Add to XI")').first().click();await toast('Starting XI saved');
  check(label+': manual XI toggle saves at 11 players',true);
  await shot('3-squad');

  await tab('market');await page.waitForSelector('.player');
  check(label+': market lists free agents',(await page.locator('.player').count())>0);
  check(label+': sign buttons disabled at 0 UZS',(await page.locator('[data-action="sign"]:not([disabled])').count())===0);
  check(label+': market fits the viewport',await noOverflow());

  await tab('missions');await page.waitForSelector('.mission');
  check(label+': 5 missions listed',(await page.locator('.mission').count())===5);
  check(label+': missions fit the viewport',await noOverflow());

  // Fill the league through the API with other local dev users (only needed once).
  const existing=(await api(dev,'GET','/api/clubs')).clubs[0];
  let fixtures=(await api(dev,'GET','/api/clubs/'+existing.id+'/fixtures')).fixtures;
  await tab('fixtures');
  if(!fixtures.length){
   check(label+': fixtures empty state before 10 clubs',(await page.textContent('.content')).includes('at least 10 clubs'));
   await tab('league');
   check(label+': league empty state before 10 clubs',(await page.textContent('.content')).includes('No active league yet'));
   for(let i=1;i<=9;i++)await api(600+i,'POST','/api/clubs',{name:'Filler Club '+i,shortName:'FC'+i,primaryColour:'#225588',secondaryColour:'#ffffff'});
   await page.reload();await page.waitForSelector('.club-card');
   fixtures=(await api(dev,'GET','/api/clubs/'+existing.id+'/fixtures')).fixtures;
  }
  if(fixtures.length){
   await tab('fixtures');await page.waitForSelector('[data-action="play"]');
   check(label+': 9 fixtures listed',(await page.locator('.fixture').count())===9);
   await page.locator('[data-action="play"]').first().click();
   await page.waitForSelector('.pitch .dot');
   check(label+': pitch with 22 dots shown during simulation',(await page.locator('.pitch .dot').count())===22);
   await shot('4-match');
   await page.waitForSelector('text=MATCH REPORT',{timeout:10000});
   check(label+': match report with final score shown',/\d — \d/.test(await page.textContent('.content')));
   check(label+': played fixture shows a score',(await page.locator('.fixture .score').count())===1);
   check(label+': fixtures fit the viewport',await noOverflow());
   await shot('5-report');
   // Two more matches so the club has enough Development Points for an upgrade.
   for(let n=2;n<=3;n++){await page.locator('[data-action="play"]').first().click();await page.waitForFunction(k=>document.querySelectorAll('.fixture .score').length===k,n,{timeout:10000});}
   check(label+': further matches can be played in sequence',(await page.locator('.fixture .score').count())===3);
   await tab('league');await page.waitForSelector('table');
   check(label+': league table has 10 rows',(await page.locator('tbody tr').count())===10);
   check(label+': league page fits the viewport (table scrolls inside its panel)',await noOverflow());
   await shot('6-league');
   await tab('missions');
   check(label+': mission progress updated after the match',(await page.textContent('.content')).includes('COMPLETED'));
   await tab('squad');await page.waitForSelector('.player');
   await page.locator('[data-action="upgrade"]').first().click();await toast('Player upgraded');
   check(label+': player upgrade with earned DP',true);
   const before=await page.locator('.player').count();
   await page.locator('.player:has-text("SQUAD ·") [data-action="sell"]').first().click();await toast('Player sold');
   check(label+': selling a squad player',(await page.locator('.player').count())===before-1);
   await tab('market');await page.waitForSelector('.player');
   const affordable=page.locator('[data-action="sign"]:not([disabled])');
   if(await affordable.count()){await affordable.first().click();await toast('Player signed');check(label+': signing an affordable player',true);}
   else check(label+': signing an affordable player',false,'no affordable free agent in the first 100 listed');
   await tab('overview');
   check(label+': finance and DP history shown',/player sale/.test(await page.textContent('.content'))&&/match reward/.test(await page.textContent('.content')));
   await shot('7-overview-after');
  }else check(label+': this client\'s club is not in the league (11th+ club)',true);

  await page.click('[data-action="edit-identity"]');await page.waitForSelector('#identity-form');
  await page.fill('#identity-form input[name=name]','Renamed '+dev);
  await page.click('#identity-form button[type=submit]');await toast('Club identity updated');
  check(label+': identity edit saved',(await page.textContent('.club-card')).includes('Renamed '+dev));
  check(label+': no uncaught page or console errors',errors.length===0,errors.join(' | '));
  await context.close();
 }
 await browser.close();
 const failed=results.filter(r=>!r.pass);
 console.log('\n'+(results.length-failed.length)+' passed, '+failed.length+' failed');
 process.exit(failed.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
