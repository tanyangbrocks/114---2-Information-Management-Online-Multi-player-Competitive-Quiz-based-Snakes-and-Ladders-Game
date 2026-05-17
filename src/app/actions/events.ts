"use server";

import { createClient } from "@supabase/supabase-js";

export async function addGameEvent(
  gameId: string,
  round: number,
  message: string,
  type: "system" | "skill" | "warning" | "movement" = "info" as any
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from("game_events").insert({
    game_id: gameId,
    round,
    message,
    type,
  });
  if (error) {
    console.error("Failed to add game event:", error);
  }
}
