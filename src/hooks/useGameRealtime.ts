"use client";

import { createClient } from "@/lib/supabase/browser";
import { mapGameRow, mapPlayerRow } from "@/lib/game/dbMappers";
import type { GameRow, PlayerRow } from "@/types/game";
import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "idle" | "loading" | "ready" | "error";

export function useGameRealtime(gameId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!gameId) return;
    setStatus("loading");
    setError(null);
    const gRes = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
    if (gRes.error) {
      setError(gRes.error.message);
      setStatus("error");
      return;
    }
    if (!gRes.data) {
      setGame(null);
      setPlayers([]);
      setStatus("error");
      setError("找不到場次");
      return;
    }
    const pRes = await supabase.from("players").select("*").eq("game_id", gameId).order("created_at");
    if (pRes.error) {
      setError(pRes.error.message);
      setStatus("error");
      return;
    }
    setGame(mapGameRow(gRes.data as Record<string, unknown>));
    setPlayers((pRes.data ?? []).map((r) => mapPlayerRow(r as Record<string, unknown>)));
    setStatus("ready");
  }, [gameId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`game-room:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => {
          void reload();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
        () => {
          void reload();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, reload, supabase]);

  return { game, players, status, error, reload };
}
