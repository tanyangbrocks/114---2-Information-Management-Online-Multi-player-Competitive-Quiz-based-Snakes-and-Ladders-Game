"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

export async function resolveSkillsAndStartSettle(gameId: string, round: number) {
  // 1. 取得所有待處理技能
  const { data: actions, error: actionsErr } = await supabase
    .from("skill_actions")
    .select("*")
    .eq("game_id", gameId)
    .eq("round", round)
    .eq("status", "pending");

  if (actionsErr) throw new Error("讀取技能佇列失敗");

  // 2. 取得所有玩家狀態 (包含名次排序)
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("*")
    .eq("game_id", gameId);

  if (pErr || !players) throw new Error("讀取玩家資料失敗");

  // 以分數排序 (這裡採用簡化的排序邏輯)
  players.sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    return b.position - a.position;
  });

  // 建立 lookup map
  const playerMap = new Map(players.map(p => [p.id, p]));
  const rankMap = new Map(players.map((p, idx) => [p.id, idx + 1]));

  // 3. 技能仲裁排序 (同回合發動，排名落後者後發動，也就是蓋台)
  // 如果排名越低，應該越「晚」執行，所以 index 越大越晚執行。
  // 注意：如果是互相無關的技能，順序其實沒差。
  const sortedActions = [...(actions || [])].sort((a, b) => {
    const rankA = rankMap.get(a.player_id) || 99;
    const rankB = rankMap.get(b.player_id) || 99;
    return rankB - rankA; // rankB 越大(越落後)，在後面
  });

  // 4. 逐一處理技能
  for (const action of sortedActions) {
    if (action.action_type === "PASS") {
      await supabase.from("skill_actions").update({ status: "resolved" }).eq("id", action.id);
      continue;
    }

    const caster = playerMap.get(action.player_id);
    const target = action.target_player_id ? playerMap.get(action.target_player_id) : null;
    if (!caster) continue;

    // S-1: 指定目標，隨機丟棄其一張未使用的手牌
    if (action.action_type === "S-1" && target) {
      const tCards = target.cards as any[];
      const available = tCards.filter(c => !c.is_used);
      if (available.length > 0) {
        // 隨機選一張
        const dropIdx = Math.floor(Math.random() * available.length);
        const dropId = available[dropIdx].id;
        target.cards = tCards.map(c => c.id === dropId ? { ...c, is_used: true } : c);
      }
    }
    
    // C-1: 自身前進或後退一格 (這裡簡化為必定前進一格)
    if (action.action_type === "C-1") {
      caster.position = Math.min(100, caster.position + 1);
    }
    // C-2: 指定目標前進或後退一格 (這裡簡化為必定退後一格)
    if (action.action_type === "C-2" && target) {
      target.position = Math.max(1, target.position - 1);
    }
    // H-1: 自由前進不超過「當前名次」的任意步數 (這裡簡化為前進 = 名次步)
    if (action.action_type === "H-1") {
      const r = rankMap.get(caster.id) || 1;
      caster.position = Math.min(100, caster.position + r);
    }
    // U-2: 指定隊伍調換位置
    if (action.action_type === "U-2" && target) {
      const temp = caster.position;
      caster.position = target.position;
      target.position = temp;
    }
    // TODO: 其他技能 (S-2, U-1, U-3) 實作較複雜，先略過或留白
    
    // 標記完成
    await supabase.from("skill_actions").update({ status: "resolved" }).eq("id", action.id);
  }

  // 5. 批次更新玩家狀態
  for (const p of Array.from(playerMap.values())) {
    await supabase.from("players").update({ position: p.position, cards: p.cards }).eq("id", p.id);
  }

  // 6. 更新遊戲狀態到 settle
  const { error: gameErr } = await supabase.from("games").update({ phase: "settle" }).eq("id", gameId);
  if (gameErr) throw new Error("進入結算階段失敗");

  return { success: true };
}
