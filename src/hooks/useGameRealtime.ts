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

  const reload = useCallback(async (silent = false) => {
    if (!gameId) return;
    if (!silent) setStatus("loading");
    setError(null);

    try {
      const gRes = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
      if (gRes.error) throw gRes.error;
      
      if (!gRes.data) {
        setGame(null);
        setPlayers([]);
        setStatus("error");
        setError("找不到場次");
        return;
      }

      const pRes = await supabase.from("players").select("*").eq("game_id", gameId).order("created_at");
      if (pRes.error) throw pRes.error;

      setGame(mapGameRow(gRes.data as Record<string, unknown>));
      setPlayers((pRes.data ?? []).map((r) => mapPlayerRow(r as Record<string, unknown>)));
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
      setStatus("error");
    }
  }, [gameId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 定期輪詢 (Polling) 作為最終保險，解決 Realtime 可能失效的問題
  useEffect(() => {
    if (!gameId) return;
    const interval = setInterval(() => {
      void reload(true); // 使用 silent 模式在背景更新，避免畫面閃爍
    }, 3000);
    return () => clearInterval(interval);
  }, [gameId, reload]);

  // 建立並快取頻道實例
  const channel = useMemo(() => {
    if (!gameId) return null;
    return supabase.channel(`game-room:${gameId}`);
  }, [gameId, supabase]);

  // 提供一個發送訊號的函式
  const sendSignal = useCallback(async () => {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "refresh",
      payload: {}
    });
  }, [channel]);

  useEffect(() => {
    if (!channel || !gameId) return;

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => {
          void reload(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
        () => {
          void reload(true);
        }
      )
      .on("broadcast", { event: "refresh" }, () => {
        void reload(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, channel, reload, supabase]);

  return { game, players, status, error, reload, sendSignal };
}
