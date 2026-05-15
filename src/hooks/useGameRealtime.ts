"use client";

import { createClient } from "@/lib/supabase/browser";
import { mapGameRow, mapPlayerRow } from "@/lib/game/dbMappers";
import type { GameRow, PlayerRow, SkillAction } from "@/types/game";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Status = "idle" | "loading" | "ready" | "error";

type MoveDonePayload = { playerId: string; playerName: string; newPosition: number };

export function useGameRealtime(gameId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [skillActions, setSkillActions] = useState<SkillAction[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // 儲存外部訂閱的 onMoveDone 回調
  const moveDoneCallbackRef = useRef<((payload: MoveDonePayload) => void) | null>(null);

  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!gameId) return;

    const doFetch = async () => {
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

        const aRes = await supabase.from("skill_actions").select("*").eq("game_id", gameId).eq("round", gRes.data.current_round);
        if (aRes.error) throw aRes.error;

        setGame(mapGameRow(gRes.data as Record<string, unknown>));
        setPlayers((pRes.data ?? []).map((r) => mapPlayerRow(r as Record<string, unknown>)));
        setSkillActions(aRes.data ?? []);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
        setStatus("error");
      }
    };

    if (silent) {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      reloadTimeoutRef.current = setTimeout(() => {
        void doFetch();
      }, 200); // 200ms 防抖
    } else {
      void doFetch();
    }
  }, [gameId, supabase]);

  useEffect(() => {
    void reload();
    return () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
    };
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

  // 提供一個發送訊號的函式（觸發所有客戶端重新載入）
  const sendSignal = useCallback(async () => {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "refresh",
      payload: {}
    });
  }, [channel]);

  // 玩家移動完成後呼叫此函式，廣播移動確認給主辦方
  const sendMoveDone = useCallback(async (playerId: string, playerName: string, newPosition: number) => {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "move_done",
      payload: { playerId, playerName, newPosition } satisfies MoveDonePayload
    });
  }, [channel]);

  // 讓外部組件訂閱 move_done 事件
  const onMoveDone = useCallback((cb: (payload: MoveDonePayload) => void) => {
    moveDoneCallbackRef.current = cb;
  }, []);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "skill_actions", filter: `game_id=eq.${gameId}` },
        () => {
          void reload(true);
        }
      )
      .on("broadcast", { event: "refresh" }, () => {
        void reload(true);
      })
      .on("broadcast", { event: "move_done" }, ({ payload }) => {
        if (moveDoneCallbackRef.current) {
          moveDoneCallbackRef.current(payload as MoveDonePayload);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, channel, reload, supabase]);

  return { game, players, skillActions, status, error, reload, sendSignal, sendMoveDone, onMoveDone };
}
