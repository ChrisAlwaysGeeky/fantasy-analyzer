import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const supabase = createClient(supabaseUrl!, supabaseKey!);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');

  if (!leagueId) {
    return NextResponse.json({ error: 'League ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch Current League Data
    const [leagueRes, rostersRes, usersRes, tradedPicksRes] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`)
    ]);

    const leagueInfo = await leagueRes.json();
    const rosters = await rostersRes.json();
    const users = await usersRes.json();
    const tradedPicks = await tradedPicksRes.json() || [];

    // 2. TIME MACHINE: Fetch past leagues for ALL-TIME history
    let currentPreviousId = leagueInfo.previous_league_id;
    const allTimeStats: Record<string, { wins: number, losses: number, fpts: number, years: number }> = {};

    // Initialize with the current year's stats
    rosters.forEach((r: any) => {
      if (r.owner_id) {
        allTimeStats[r.owner_id] = {
          wins: r.settings?.wins || 0,
          losses: r.settings?.losses || 0,
          fpts: r.settings?.fpts || 0,
          years: 1
        };
      }
    });

    let depth = 0;
    // Loop backward in time (up to 5 years to prevent server timeouts)
    while (currentPreviousId && depth < 5) {
      const pastLeagueRes = await fetch(`https://api.sleeper.app/v1/league/${currentPreviousId}`);
      if (!pastLeagueRes.ok) break;
      const pastLeague = await pastLeagueRes.json();

      const pastRostersRes = await fetch(`https://api.sleeper.app/v1/league/${currentPreviousId}/rosters`);
      if (pastRostersRes.ok) {
        const pastRosters = await pastRostersRes.json();
        pastRosters.forEach((r: any) => {
          if (r.owner_id && allTimeStats[r.owner_id]) {
            allTimeStats[r.owner_id].wins += r.settings?.wins || 0;
            allTimeStats[r.owner_id].losses += r.settings?.losses || 0;
            allTimeStats[r.owner_id].fpts += r.settings?.fpts || 0;
            allTimeStats[r.owner_id].years += 1; // Track how many years they've been in the league
          }
        });
      }
      currentPreviousId = pastLeague.previous_league_id;
      depth++;
    }

    // Attach the combined all-time stats to the current rosters
    rosters.forEach((roster: any) => {
        roster.all_time = allTimeStats[roster.owner_id] || { wins: 0, losses: 0, fpts: 0, years: 1 };
    });

    // 3. Draft Picks Math
    const baseYear = parseInt(leagueInfo.season) || 2026;
    const years = [baseYear, baseYear + 1, baseYear + 2];
    const numRounds = leagueInfo.settings?.draft_rounds || 4;

    const draftPicks: any[] = [];
    rosters.forEach((roster: any) => {
      years.forEach((year) => {
        for (let round = 1; round <= numRounds; round++) {
          draftPicks.push({
            id: `pick_${year}_${round}_${roster.roster_id}`,
            year,
            round,
            original_roster_id: roster.roster_id,
            current_owner_id: roster.roster_id,
          });
        }
      });
    });

    if (Array.isArray(tradedPicks)) {
      tradedPicks.forEach((trade: any) => {
        const pickIndex = draftPicks.findIndex(p =>
          p.year === parseInt(trade.season) &&
          p.round === trade.round &&
          p.original_roster_id === trade.roster_id
        );
        if (pickIndex !== -1) {
          draftPicks[pickIndex].current_owner_id = trade.owner_id;
        }
      });
    }

    rosters.forEach((roster: any) => {
        roster.draft_picks = draftPicks.filter(p => p.current_owner_id === roster.roster_id);
    });

    // 4. Supabase Player Lookup
    const allPlayerIds = new Set<string>();
    rosters.forEach((roster: any) => {
      if (roster.players) {
        roster.players.forEach((id: string) => allPlayerIds.add(id));
      }
    });

    const { data: playersData, error } = await supabase
      .from('players')
      .select('*')
      .in('player_id', Array.from(allPlayerIds));

    if (error) throw new Error(error.message);

    const playerMap: Record<string, any> = {};
    playersData?.forEach(p => {
      playerMap[p.player_id] = p;
    });

    return NextResponse.json({ leagueInfo, rosters, users, players: playerMap });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}