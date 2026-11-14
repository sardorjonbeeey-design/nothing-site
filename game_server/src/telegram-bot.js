import { setTimeout as delay } from 'node:timers/promises';

const API='https://api.telegram.org';
function botUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('WEB_APP_URL must be a valid HTTPS URL');}
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('WEB_APP_URL must be a public HTTPS URL');
 return url.toString();
}
async function telegramCall(token,method,payload,fetchImpl=fetch,signal){
 const response=await fetchImpl(`${API}/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),...(signal?{signal}:{})});
 const data=await response.json();
 if(!response.ok||data.ok!==true){const error=new Error(data.description||`Telegram API request failed (${response.status})`);error.telegramErrorCode=data.error_code||response.status;throw error;}
 return data.result;
}
export async function replyToTelegramUpdate(update,{token,webAppUrl,fetchImpl=fetch,setNotificationPreference,saveReferral}){
 const message=update?.message;
 if(!message?.chat?.id||typeof message.text!=='string'||message.from?.is_bot)return false;
 const parts=message.text.trim().split(/\s+/,2),command=parts[0].split('@',1)[0].toLowerCase(),privateChat=message.chat.type==='private';
 if(command==='/notifications'){
  if(!privateChat)return false;
  const enabled=(parts[1]||'on').toLowerCase()!=='off';
  await setNotificationPreference?.(String(message.from.id),enabled);
  await telegramCall(token,'sendMessage',{chat_id:message.chat.id,text:enabled?'Matchday notifications are ON. Send /notifications off to stop them.':'Matchday notifications are OFF. Send /notifications on to enable them.'},fetchImpl);
  return true;
 }
 if(!['/start','/game','/help'].includes(command))return false;
 if(privateChat){
  await setNotificationPreference?.(String(message.from.id),true);
  const payload=parts[1]||'';
  if(payload.startsWith('ref_'))await saveReferral?.(String(message.from.id),payload.slice(4));
 }
 const text=privateChat
  ? 'Welcome to ZAMIN FK Management Game!\n\nCreate your own club, build your squad, develop players and compete in the league.\n\nMatchday reminders and results are enabled. Use /notifications off to stop them.'
  : 'To open ZAMIN FK Management Game, start a private chat with @zamingame_bot.';
 const body={chat_id:message.chat.id,text};
 if(privateChat)body.reply_markup={inline_keyboard:[[{text:'⚽ Open ZAMIN FK Game',web_app:{url:botUrl(webAppUrl)}}]]};
 await telegramCall(token,'sendMessage',body,fetchImpl);
 return true;
}
export async function dispatchNotifications(db,token,{fetchImpl=fetch,logger=console}={}){
 if(!db||!token)return 0;
 const client=db();
 const deliver=async(row,type,text)=>{
  const marker=await client.query('INSERT INTO fixture_notification_deliveries(fixture_id,user_id,notification_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[row.fixture_id,row.user_id,type]);
  if(!marker.rowCount)return false;
  try{await telegramCall(token,'sendMessage',{chat_id:row.telegram_user_id,text},fetchImpl);return true;}
  catch(error){await client.query('DELETE FROM fixture_notification_deliveries WHERE id=$1',[marker.rows[0].id]);logger.error('Match notification failed:',error.message);return false;}
 };
 let sent=0;
 const upcoming=(await client.query(`SELECT f.id AS fixture_id,c.id AS club_id,u.id AS user_id,u.telegram_user_id,c.name AS club_name,
  CASE WHEN f.home_club_id=c.id THEN a.name ELSE h.name END AS opponent_name
  FROM fixtures f JOIN clubs h ON h.id=f.home_club_id JOIN clubs a ON a.id=f.away_club_id
  JOIN clubs c ON c.id IN (f.home_club_id,f.away_club_id) JOIN game_users u ON u.id=c.owner_user_id
  WHERE f.kind='league' AND f.status='scheduled' AND u.telegram_notifications_enabled=TRUE
   AND f.kickoff_at BETWEEN NOW()+interval '55 minutes' AND NOW()+interval '65 minutes'`)).rows;
 for(const row of upcoming)if(await deliver(row,'kickoff_1h',`⏰ ZAMIN FK: ${row.club_name} vs ${row.opponent_name} kicks off in about one hour at 20:00 Tashkent time. Check your Starting XI.`))sent++;
 const results=(await client.query(`SELECT f.id AS fixture_id,c.id AS club_id,u.id AS user_id,u.telegram_user_id,c.name AS club_name,
  CASE WHEN f.home_club_id=c.id THEN a.name ELSE h.name END AS opponent_name,
  CASE WHEN f.home_club_id=c.id THEN f.home_goals ELSE f.away_goals END AS goals_for,
  CASE WHEN f.home_club_id=c.id THEN f.away_goals ELSE f.home_goals END AS goals_against
  FROM fixtures f JOIN clubs h ON h.id=f.home_club_id JOIN clubs a ON a.id=f.away_club_id
  JOIN clubs c ON c.id IN (f.home_club_id,f.away_club_id) JOIN game_users u ON u.id=c.owner_user_id
  WHERE f.kind='league' AND f.status='played' AND u.telegram_notifications_enabled=TRUE
   AND NOT EXISTS(SELECT 1 FROM fixture_notification_deliveries d WHERE d.fixture_id=f.id AND d.user_id=u.id AND d.notification_type='match_result')
  ORDER BY f.played_at,f.id LIMIT 100`)).rows;
 for(const row of results)if(await deliver(row,'match_result',`⚽ Full time: ${row.club_name} ${row.goals_for}–${row.goals_against} ${row.opponent_name}. Open ZAMIN FK to view the match report.`))sent++;
 const warnings=(await client.query(`SELECT DISTINCT ON(c.id) f.id AS fixture_id,c.id AS club_id,u.id AS user_id,u.telegram_user_id,c.name AS club_name,
  EXTRACT(EPOCH FROM (NOW()-a.last_activity_at))::int AS idle_seconds,
  CASE WHEN EXTRACT(EPOCH FROM (NOW()-a.last_activity_at))>=46*3600 THEN 'forfeit_warning_2h' ELSE 'forfeit_warning_24h' END AS warning_type
  FROM fixtures f JOIN clubs c ON c.id IN (f.home_club_id,f.away_club_id)
  JOIN game_users u ON u.id=c.owner_user_id
  JOIN LATERAL(SELECT MAX(activity_at) AS last_activity_at FROM owner_activity_events WHERE user_id=c.owner_user_id) a ON TRUE
  WHERE f.kind='league' AND f.status='scheduled' AND f.kickoff_at>NOW()
   AND u.telegram_notifications_enabled=TRUE AND a.last_activity_at IS NOT NULL
   AND NOW()-a.last_activity_at>=interval '24 hours' AND NOW()-a.last_activity_at<interval '48 hours'
  ORDER BY c.id,f.kickoff_at`)).rows;
 for(const row of warnings){
  const twoHours=row.warning_type==='forfeit_warning_2h';
  const msg=twoHours
   ? `⚠️ ZAMIN FK: ${row.club_name} has been inactive for 46 hours. Open the game and perform an action before your next match to avoid an inactivity forfeit.`
   : `🔔 ZAMIN FK: ${row.club_name} has been inactive for 24 hours. Open the game before matchday; one inactivity miss per season is protected.`;
  if(await deliver(row,row.warning_type,msg))sent++;
 }
 return sent;
}
export function startTelegramBot({token,webAppUrl,db,fetchImpl=fetch,logger=console}){
 if(!token){logger.warn('Telegram bot is disabled: TELEGRAM_BOT_TOKEN is not configured');return{stop:async()=>{}};}
 if(!webAppUrl){logger.error('Telegram bot is disabled: WEB_APP_URL is not configured');return{stop:async()=>{}};}
 const appUrl=botUrl(webAppUrl);let stopped=false,pollingTask;
 const setNotificationPreference=async(telegramUserId,enabled)=>{
  if(!db)return;
  await db().query('INSERT INTO telegram_notification_preferences(telegram_user_id,enabled,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(telegram_user_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()',[telegramUserId,enabled]);
  await db().query('UPDATE game_users SET telegram_notifications_enabled=$2 WHERE telegram_user_id=$1',[telegramUserId,enabled]);
 };
 const saveReferral=async(telegramUserId,code)=>{
  if(!db||!/^[A-F0-9]{10}$/i.test(code))return;
  const referrer=(await db().query('SELECT id FROM game_users WHERE referral_code=$1',[code.toUpperCase()])).rows[0];
  if(!referrer)return;
  await db().query('INSERT INTO pending_referrals(referred_telegram_user_id,referrer_user_id) VALUES($1,$2) ON CONFLICT(referred_telegram_user_id) DO NOTHING',[telegramUserId,referrer.id]);
 };
 const poll=async()=>{
  let offset=0;
  logger.info('Starting Telegram bot connection');
  while(!stopped){
   try{
    await telegramCall(token,'deleteWebhook',{drop_pending_updates:false},fetchImpl,AbortSignal.timeout(15000));
    const me=await telegramCall(token,'getMe',{},fetchImpl,AbortSignal.timeout(15000));
    await telegramCall(token,'setMyCommands',{commands:[
     {command:'start',description:'Open ZAMIN FK Management Game'},
     {command:'game',description:'Open the game'},
     {command:'help',description:'Show game information'},
     {command:'notifications',description:'Turn matchday notifications on or off'}
    ]},fetchImpl,AbortSignal.timeout(15000));
    logger.info(`Telegram bot connected as @${me.username||'bot'}`);break;
   }catch(error){if(stopped)break;logger.error('Telegram bot setup failed:',error.message);await delay(5000);}
  }
  while(!stopped){
   try{
    const updates=await telegramCall(token,'getUpdates',{offset,timeout:25,allowed_updates:['message']},fetchImpl,AbortSignal.timeout(35000));
    if(db)await dispatchNotifications(db,token,{fetchImpl,logger});
    for(const update of updates){
     offset=Math.max(offset,Number(update.update_id)+1);
     try{await replyToTelegramUpdate(update,{token,webAppUrl:appUrl,fetchImpl,setNotificationPreference,saveReferral});}
     catch(error){logger.error('Telegram message reply failed:',error.message);}
    }
   }catch(error){
    if(stopped)break;
    if(error.name!=='AbortError'&&error.name!=='TimeoutError')logger.error('Telegram polling error:',error.message);
    await delay(2500);
   }
  }
 };
 pollingTask=poll();
 return{stop:async()=>{stopped=true;await pollingTask;}};
}
