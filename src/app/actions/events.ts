"use server";

import { createClient } from "@/lib/supabase/server";

export async function addGameEvent(
  gameId: string,
  round: number,
  message: string,
  type: "system" | "skill" | "warning" | "movement" = "info" as any
) {
  const supabase = await createClient();
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
