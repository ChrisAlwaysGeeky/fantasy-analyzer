import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1. Force Next.js to NEVER cache this route or intercept its requests
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("CRITICAL ERROR: Keys missing!");
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export async function GET() {
  try {
    console.log("1. Starting Sleeper fetch...");
    
    const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
      cache: 'no-store'
    });
    
    if (!res.ok) throw new Error(`Sleeper returned status: ${res.status}`);

    console.log("2. Download complete. Parsing data...");
    const sleeperData = await res.json();

    const validPositions = ['QB', 'RB', 'WR', 'TE'];
    const playersToInsert = Object.values(sleeperData)
      .filter((p: any) => p.active && validPositions.includes(p.position))
      .map((p: any) => ({
        player_id: p.player_id,
        first_name: p.first_name,
        last_name: p.last_name,
        position: p.position,
        team: p.team || 'FA',
      }));

    console.log(`3. Found ${playersToInsert.length} active offensive players.`);

    // 2. Lowered batch size to 100 to prevent local network socket hangups
    const batchSize = 100;
    for (let i = 0; i < playersToInsert.length; i += batchSize) {
      const batch = playersToInsert.slice(i, i + batchSize);
      console.log(`   -> Uploading players ${i} through ${i + batch.length - 1}...`);
      
      const { error } = await supabase.from('players').upsert(batch);
      
      if (error) {
        console.error("SUPABASE RETURNED AN ERROR:", error);
        throw new Error(`Supabase Error: ${error.message}`);
      }
    }

    console.log("4. SUCCESS! All players synced.");
    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${playersToInsert.length} players!` 
    });

  } catch (error: any) {
    console.error("Sync Error Detailed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}