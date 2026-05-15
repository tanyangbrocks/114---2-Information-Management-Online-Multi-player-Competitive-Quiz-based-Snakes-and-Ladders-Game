"use server";

import { createClient } from "@supabase/supabase-js";
import type { SkillActionType, GameCard, Suit } from "@/types/game";



export async function castSkill(
  gameId: string,
  round: number,
  playerId: string,
  actionType: SkillActionType,
  consumedCards: string[],
  targetPlayerId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: "伺服器環境變數未設定 (Supabase URL/Key)" };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 基本驗證
    const { data: game, error: gameErr } = await supabase
      .from("games")
      .select("phase, current_round")
      .eq("id", gameId)
      .single();

    if (gameErr || !game) return { success: false, error: "找不到遊戲或讀取失敗: " + gameErr?.message };
    if (game.phase !== "skill" || game.current_round !== round) {
      return { success: false, error: "目前不是技能發動階段，或回合不符" };
    }

    // 2. 玩家卡牌驗證
    const { data: player, error: playerErr } = await supabase
      .from("players")
      .select("cards")
      .eq("id", playerId)
      .single();

    if (playerErr || !player) return { success: false, error: "找不到玩家資料: " + playerErr?.message };

    const cards = player.cards as GameCard[];
    const validCardIds = cards.filter((c) => !c.is_used).map((c) => c.id);

    for (const cid of consumedCards) {
      if (!validCardIds.includes(cid)) {
        return { success: false, error: "欲消耗的卡牌無效或已使用" };
      }
    }

    // 3. 標記卡牌
    const updatedCards = cards.map((c) => {
      if (consumedCards.includes(c.id)) {
        return { ...c, is_used: true };
      }
      return c;
    });

    // 如果是 S-2，直接將玩家選擇的新牌加入手牌
    if (actionType === "S-2" && metadata?.s2_suit && metadata?.s2_points) {
      updatedCards.push({
        id: `S2-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        suit: metadata.s2_suit as Suit,
        points: Number(metadata.s2_points),
        name: `瞬發補給 [${metadata.s2_suit}] · ${metadata.s2_points} 步`,
        effect: "",
        round: round,
        slot: 2,
        is_used: false
      });
    }

    // 4. 更新
    if (consumedCards.length > 0) {
      const { error: updateErr } = await supabase
        .from("players")
        .update({ cards: updatedCards })
        .eq("id", playerId);

      if (updateErr) return { success: false, error: "更新卡牌狀態失敗: " + updateErr.message };
    }

    const { error: insertErr } = await supabase.from("skill_actions").insert({
      game_id: gameId,
      round,
      player_id: playerId,
      action_type: actionType,
      target_player_id: targetPlayerId || null,
      consumed_cards: consumedCards,
      metadata: metadata || {},
      status: actionType === "S-2" ? "resolved" : "pending"
    });

    if (insertErr) {
      // 如果是因為 metadata 欄位不存在 (schema cache 錯誤)，嘗試不帶 metadata 再次寫入
      if (insertErr.message.toLowerCase().includes("metadata")) {
        const { error: retryErr } = await supabase.from("skill_actions").insert({
          game_id: gameId,
          round,
          player_id: playerId,
          action_type: actionType,
          target_player_id: targetPlayerId || null,
          consumed_cards: consumedCards,
          status: actionType === "S-2" ? "resolved" : "pending"
        });
        if (!retryErr) return { success: true };
        await supabase.from("players").update({ cards }).eq("id", playerId);
        return { success: false, error: "寫入技能動作失敗: " + retryErr.message };
      }

      // 補償機制：嘗試還原卡片
      await supabase.from("players").update({ cards }).eq("id", playerId);
      return { success: false, error: "寫入技能動作失敗: " + insertErr.message };
    }

    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "未知伺服器錯誤" };
  }
}
