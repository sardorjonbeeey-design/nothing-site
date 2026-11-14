// Competition rules shared by fixture settlement, standings and season prize payouts.
export const OWNER_INACTIVITY_HOURS=48;
export const OWNER_WARNING_HOURS=[24,46]; // 24h idle, then 2h remaining before forfeiture.
export const OWNER_INACTIVITY_MS=OWNER_INACTIVITY_HOURS*60*60*1000;
export const SEASON_PRIZES_UZS=[10000000n,7000000n,5000000n];

export async function ownerActivity(client,clubId,atTime=null){
 const row=(await client.query(`SELECT a.last_activity_at,NOW() AS server_now,
  CASE WHEN a.last_activity_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (COALESCE($2::timestamptz,NOW())-a.last_activity_at)) END AS idle_seconds
  FROM clubs c JOIN LATERAL (SELECT MAX(activity_at) AS last_activity_at FROM owner_activity_events WHERE user_id=c.owner_user_id) a ON TRUE
  WHERE c.id=$1`,[clubId,atTime])).rows[0];
 if(!row)throw new Error('Club owner activity record is missing');
 const idleSeconds=row.idle_seconds===null?null:Number(row.idle_seconds);
 const inactive=idleSeconds===null||idleSeconds>=OWNER_INACTIVITY_HOURS*3600;
 const warningLevel=inactive?null:idleSeconds>=OWNER_WARNING_HOURS[1]*3600?2:idleSeconds>=OWNER_WARNING_HOURS[0]*3600?24:null;
 return {lastSeenAt:row.last_activity_at,idleSeconds,inactive,warningLevel,
  forfeitsAt:row.last_activity_at?new Date(new Date(row.last_activity_at).getTime()+OWNER_INACTIVITY_MS).toISOString():null};
}

// The first three conventional criteria form the head-to-head comparison group.
// Head-to-head points and goal difference are calculated only against clubs tied on those criteria.
export async function leagueStandings(client,leagueId){
 const rows=(await client.query(`
 WITH base AS (
  SELECT lm.club_id,c.name,c.short_name,c.primary_colour,c.crest_url,lm.played,lm.wins,lm.draws,lm.losses,
   lm.goals_for,lm.goals_against,lm.points,(lm.goals_for-lm.goals_against) AS goal_difference
  FROM league_members lm JOIN clubs c ON c.id=lm.club_id WHERE lm.league_id=$1
 ), groups AS (
  SELECT *,COUNT(*) OVER(PARTITION BY points,goal_difference,goals_for) AS tied_count
  FROM base
 ), head AS (
  SELECT a.club_id,
   COALESCE(SUM(CASE WHEN f.events->>'forfeit'='double' THEN 0
    WHEN (a.club_id=f.home_club_id AND f.home_goals>f.away_goals) OR (a.club_id=f.away_club_id AND f.away_goals>f.home_goals) THEN 3
    WHEN f.home_goals=f.away_goals THEN 1 ELSE 0 END),0)::int AS h2h_points,
   COALESCE(SUM(CASE WHEN a.club_id=f.home_club_id THEN f.home_goals-f.away_goals ELSE f.away_goals-f.home_goals END),0)::int AS h2h_goal_difference
  FROM groups a
  JOIN fixtures f ON f.league_id=$1 AND f.status='played'
   AND (f.home_club_id=a.club_id OR f.away_club_id=a.club_id)
  JOIN groups b ON b.club_id=CASE WHEN f.home_club_id=a.club_id THEN f.away_club_id ELSE f.home_club_id END
   AND b.points=a.points AND b.goal_difference=a.goal_difference AND b.goals_for=a.goals_for
  WHERE a.tied_count>1
  GROUP BY a.club_id
 )
 SELECT g.*,COALESCE(h.h2h_points,0)::int AS h2h_points,
  COALESCE(h.h2h_goal_difference,0)::int AS h2h_goal_difference
 FROM groups g LEFT JOIN head h ON h.club_id=g.club_id
 ORDER BY g.points DESC,g.goal_difference DESC,g.goals_for DESC,
  COALESCE(h.h2h_points,0) DESC,COALESCE(h.h2h_goal_difference,0) DESC,g.name,g.club_id
 `,[leagueId])).rows;
 return rows;
}

function tieKey(row){return [row.points,row.goal_difference,row.goals_for,row.h2h_points,row.h2h_goal_difference].join(':');}

// Call inside the caller's transaction. Unique (league,club) payment records prevent duplicate awards after restarts/races.
export async function payCompletedSeasonPrizes(client){
 const leagues=(await client.query("SELECT id FROM leagues WHERE status='completed' AND starts_on IS NOT NULL ORDER BY season_number")).rows;
 let paid=0;
 for(const league of leagues){
  const standings=await leagueStandings(client,league.id);
  let start=0;
  while(start<standings.length&&start<3){
   let end=start+1;while(end<standings.length&&tieKey(standings[end])===tieKey(standings[start]))end++;
   const prizeSlots=SEASON_PRIZES_UZS.slice(start,Math.min(end,3));
   if(prizeSlots.length){
    const pool=prizeSlots.reduce((sum,n)=>sum+n,0n),count=BigInt(end-start),base=pool/count,remainder=pool%count;
    for(let i=start;i<end;i++){
     const amount=base+(BigInt(i-start)<remainder?1n:0n);
     const inserted=await client.query('INSERT INTO season_prize_payments(league_id,club_id,place,amount_uzs) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING club_id',[league.id,standings[i].club_id,i+1,amount.toString()]);
     if(!inserted.rowCount)continue;
     const balance=(await client.query('UPDATE clubs SET budget_uzs=budget_uzs+$2 WHERE id=$1 RETURNING budget_uzs',[standings[i].club_id,amount.toString()])).rows[0].budget_uzs;
     await client.query("INSERT INTO money_ledger(club_id,amount_uzs,balance_after_uzs,reason,reference_id) VALUES($1,$2,$3,'season_prize',$4)",[standings[i].club_id,amount.toString(),balance,league.id]);
     paid++;
    }
   }
   start=end;
  }
 }
 return paid;
}
