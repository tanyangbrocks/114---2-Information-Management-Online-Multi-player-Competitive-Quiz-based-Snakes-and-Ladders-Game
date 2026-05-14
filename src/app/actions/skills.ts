"use server";

import { createClient } from "@supabase/supabase-js";
import type { SkillActionType, GameCard } from "@/types/game";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // 伺服器端建議用 Service Role Key，但暫時用 Anon 搭配 RLS
const supabase = createClient(supabaseUrl, supabaseKey);

export async function castSkill(
  gameId: string,
  round: number,
  playerId: string,
  actionType: SkillActionType,
  consumedCards: string[],
  targetPlayerId?: string
) {
  // 1. 基本驗證 (確認遊戲狀態是否為 skill 階段)
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("phase, current_round")
    .eq("id", gameId)
    .single();

  if (gameErr || !game) throw new Error("找不到遊戲");
  if (game.phase !== "skill" || game.current_round !== round) {
    throw new Error("目前不是技能發動階段，或回合不符");
  }

  // 2. 玩家卡牌驗證 (檢查是否真的有這些卡)
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("cards")
    .eq("id", playerId)
    .single();

  if (playerErr || !player) throw new Error("找不到玩家");

  const cards = player.cards as GameCard[];
  const validCards = cards.filter((c) => !c.is_used);
  const validCardIds = validCards.map((c) => c.id);

  for (const cid of consumedCards) {
    if (!validCardIds.includes(cid)) {
      throw new Error("欲消耗的卡牌無效或已使用");
    }
  }

  // 3. 標記卡牌為已消耗
  const updatedCards = cards.map((c) => {
    if (consumedCards.includes(c.id)) {
      return { ...c, is_used: true };
    }
    return c;
  });

  // 4. 寫入 skill_actions 佇列，並更新玩家卡牌
  // 為了確保一致性，最好能使用 transaction 或 RPC。這裡先分開寫入
  const { error: updateErr } = await supabase
    .from("players")
    .update({ cards: updatedCards })
    .eq("id", playerId);

  if (updateErr) throw updateErr;

  const { error: insertErr } = await supabase.from("skill_actions").insert({
    game_id: gameId,
    round,
    player_id: playerId,
    action_type: actionType,
    target_player_id: targetPlayerId,
    consumed_cards: consumedCards,
    status: "pending"
  });

  if (insertErr) {
    // 若寫入 action 失敗，嘗試把卡片還回去 (補償機制)
    await supabase.from("players").update({ cards }).eq("id", playerId);
    throw insertErr;
  }

  return { success: true };
}
