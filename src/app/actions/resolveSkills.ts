"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GameCard, Suit, SkillActionType, PlayerRow, SkillAction } from "@/types/game";
import { countSuits } from "@/lib/game/skillEngine";
import { ESCALATORS, moveBySteps, bounceOverHundred } from "@/lib/game/boardEngine";
import { rankPlayers } from "@/lib/game/ranking";

export async function startSkillResolution(gameId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 將遊戲階段改為 skill
  await supabase.from("games").update({ phase: "skill" }).eq("id", gameId);
}

export async function resolveNextSkill(gameId: string, round: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // 1. 獲取所有玩家與待處理技能
    const { data: players } = await supabase.from("players").select("*").eq("game_id", gameId);
    const { data: actions } = await supabase.from("skill_actions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round", round)
      .eq("status", "pending");

    if (!players || !actions || actions.length === 0) return { done: true };

    // 2. 排序仲裁：依據當前排名 (排名越前 Rank 1，越早處理)
    // 這樣排名靠後的人發動技能，才能「蓋掉」前面人的效果 (如果有位置衝突)
    const rankedPlayers = [...players].sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return b.position - a.position;
    });

    const sortedActions = [...actions].sort((a, b) => {
      const rankA = rankedPlayers.findIndex(r => r.id === a.player_id);
      const rankB = rankedPlayers.findIndex(r => r.id === b.player_id);
      return rankA - rankB; 
    });

    const action = sortedActions[0];
    const caster = players.find(p => p.id === action.player_id);
    const targetPlayer = action.target_player_id ? players.find(p => p.id === action.target_player_id) : null;

    // 3. 檢查是否有菱形反制機會 (針對型技能且對象有2張菱形)
    if (targetPlayer && ["S-1", "D-1", "D-2", "C-2", "U-2"].includes(action.action_type)) {
      const diamonds = (targetPlayer.cards as GameCard[]).filter(c => !c.is_used && c.suit === "D");
      if (diamonds.length >= 2) {
        // 進入攔截階段，等待玩家回應
        await supabase.from("skill_actions").update({ status: "waiting_counter" }).eq("id", action.id);
        return { done: false, intercepting: true };
      }
    }

    // 4. 無反制或不符反制條件，直接執行
    await executeSkillEffect(supabase, action, players);
    await supabase.from("skill_actions").update({ status: "resolved" }).eq("id", action.id);

    return { done: false };
  } catch (e) {
    console.error(e);
    return { error: true };
  }
}

async function executeSkillEffect(supabase: SupabaseClient, action: SkillAction, players: PlayerRow[]) {
  const player = players.find(p => p.id === action.player_id);
  const target = players.find(p => p.id === action.target_player_id);
  if (!player) return;



  switch (action.action_type) {
    case "S-1": // 指定後退 3 步
      if (target) {
        const nextPos = Math.max(1, target.position - 3);
        await supabase.from("players").update({ position: nextPos }).eq("id", target.id);
      }
      break;
    case "S-2": // 抽 1 張牌
      // 這裡假設 S-2 已經在 PlayClient 抽過了，如果沒抽，這裡要補
      break;
    case "D-1": // 目標星星 -1
      if (target) {
        await supabase.from("players").update({ stars: Math.max(0, target.stars - 1) }).eq("id", target.id);
      }
      break;
    case "D-2": // 偷取目標星星
      if (target && target.stars > 0) {
        await supabase.from("players").update({ stars: target.stars - 1 }).eq("id", target.id);
        await supabase.from("players").update({ stars: player.stars + 1 }).eq("id", player.id);
      }
      break;
    case "C-1": // 獲得 1 顆星
      await supabase.from("players").update({ stars: player.stars + 1 }).eq("id", player.id);
      break;
    case "C-2": // 指定互換位置
      if (target) {
        await supabase.from("players").update({ position: target.position }).eq("id", player.id);
        await supabase.from("players").update({ position: player.position }).eq("id", target.id);
      }
      break;
  }
}

export async function resolveSkillsAndStartSettle(gameId: string, round: number) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 取得所有待處理技能
    const { data: actions, error: actionsErr } = await supabase
      .from("skill_actions")
      .select("*")
      .eq("game_id", gameId)
      .eq("round", round)
      .in("status", ["pending", "ready"]);

    if (actionsErr) return { success: false, error: "讀取技能佇列失敗: " + actionsErr.message };

    // 2. 取得所有玩家狀態
    const { data: players, error: pErr } = await supabase
      .from("players")
      .select("*")
      .eq("game_id", gameId);

    if (pErr || !players) return { success: false, error: "讀取玩家資料失敗: " + pErr?.message };

    // 以分數排序
    players.sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return b.position - a.position;
    });

    // 建立 lookup map
    const playerMap = new Map(players.map(p => [p.id, p]));
    const rankMap = new Map(players.map((p, idx) => [p.id, idx + 1]));

    // 3. 技能仲裁排序 (排名越落後越晚執行，具備蓋台效果)
    const sortedActions = [...(actions || [])].sort((a, b) => {
      const rankA = rankMap.get(a.player_id) || 99;
      const rankB = rankMap.get(b.player_id) || 99;
      return rankB - rankA;
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

      // --- 技能反制偵測 (Diamond Counter) ---
      if (target && action.status === "pending") {
        const tCards = target.cards as GameCard[];
        const availableCards = tCards.filter(c => !c.is_used);
        const suits = countSuits(availableCards);
        if (suits.D >= 2) {
          await supabase
            .from("skill_actions")
            .update({ status: "waiting_counter" })
            .eq("id", action.id);
          return { success: true, waitingForCounter: true, actionId: action.id, targetName: target.name };
        }
      }

      // S-1: 指定目標，隨機丟棄手牌
      if (action.action_type === "S-1" && target) {
        const tCards = target.cards as GameCard[];
        const available = tCards.filter(c => !c.is_used);
        if (available.length > 0) {
          const dropIdx = Math.floor(Math.random() * available.length);
          const dropId = available[dropIdx].id;
          target.cards = tCards.map(c => c.id === dropId ? { ...c, is_used: true } : c);
        }
      }
      
      // C-1: 自身前進或後退
      if (action.action_type === "C-1") {
        const dir = action.metadata?.direction || 1;
        caster.position = Math.max(1, Math.min(100, caster.position + dir));
      }
      // C-2: 指定目標前進或後退
      if (action.action_type === "C-2" && target) {
        const dir = action.metadata?.direction || -1;
        target.position = Math.max(1, Math.min(100, target.position + dir));
      }
      // H-1: 自由前進
      if (action.action_type === "H-1") {
        const r = rankMap.get(caster.id) || 1;
        caster.position = Math.min(100, caster.position + r);
      }
      // S-2: 命運重啟
      if (action.action_type === "S-2") {
        const currentCards = caster.cards as GameCard[];
        const roundCardIdx = currentCards.findIndex(c => c.round === round);
        if (roundCardIdx !== -1) {
          const oldCard = currentCards[roundCardIdx];
          currentCards[roundCardIdx] = drawServerCard(oldCard.slot, round);
          caster.cards = currentCards;
        }
      }
      // U-1: 磁力傳送
      if (action.action_type === "U-1") {
        const nextLadder = findNearestEscalator(caster.position);
        if (nextLadder) caster.position = nextLadder[1];
      }
      // U-2: 位置調換
      if (action.action_type === "U-2" && target) {
        const temp = caster.position;
        caster.position = target.position;
        target.position = temp;
      }
      // U-3: 終極狂熱
      if (action.action_type === "U-3") {
        const effects: SkillActionType[] = ["S-1", "S-2", "C-1", "H-1", "U-1"];
        const randomEffect = effects[Math.floor(Math.random() * effects.length)];
        
        if (randomEffect === "S-1") {
          const actualTarget = target || players.filter(p => p.id !== caster.id)[Math.floor(Math.random() * (players.length - 1))];
          if (actualTarget) {
            const tCards = actualTarget.cards as GameCard[];
            const available = tCards.filter(c => !c.is_used);
            if (available.length > 0) {
              const dropId = available[Math.floor(Math.random() * available.length)].id;
              actualTarget.cards = tCards.map(c => c.id === dropId ? { ...c, is_used: true } : c);
            }
          }
        } else if (randomEffect === "S-2") {
          const currentCards = caster.cards as GameCard[];
          const roundCardIdx = currentCards.findIndex(c => c.round === round);
          if (roundCardIdx !== -1) {
            const oldCard = currentCards[roundCardIdx];
            currentCards[roundCardIdx] = drawServerCard(oldCard.slot, round);
            caster.cards = currentCards;
          }
        } else if (randomEffect === "C-1") {
          caster.position = Math.min(100, caster.position + 3);
        } else if (randomEffect === "H-1") {
          caster.position = Math.min(100, caster.position + 10);
        } else if (randomEffect === "U-1") {
          const nextLadder = findNearestEscalator(caster.position);
          if (nextLadder) caster.position = nextLadder[1];
        }
      }
      
      await supabase.from("skill_actions").update({ status: "resolved" }).eq("id", action.id);
    }

    // 5. 執行基礎移動結算 (根據預計步數)
    for (const p of Array.from(playerMap.values())) {
      const steps = p.predicted_steps || 0;
      if (steps !== 0 || p.position === 100) {
        // 檢查玩家是否有紅心牌 (保命牌)
        const heartCard = p.cards.find((c: GameCard) => !c.is_used && c.suit === "H");
        const hasHeart = !!heartCard;

        // 執行移動 (傳入 ignoreEel 為 hasHeart)
        const { position: nextPos, starsGained, usedIgnoreEel } = moveBySteps(p.position, steps, {
          ignoreEel: hasHeart
        });
        
        // 如果移動過程中真的觸發了保命 (遇到了電鰻但被忽略)，則消耗那張紅心牌
        if (usedIgnoreEel && heartCard) {
          heartCard.is_used = true;
        }

        p.position = nextPos;
        p.stars += starsGained;
      }
    }

    // 6. 批次更新玩家狀態
    for (const p of Array.from(playerMap.values())) {
      const originalPlayer = players.find(op => op.id === p.id);
      const cardsModified = JSON.stringify(p.cards) !== JSON.stringify(originalPlayer?.cards);
      
      const updatePayload: Partial<PlayerRow> = { 
        position: p.position,
        stars: p.stars,
        predicted_steps: 0 // 結算後重置
      };
      
      if (cardsModified) {
        updatePayload.cards = p.cards;
      }

      await supabase.from("players").update(updatePayload).eq("id", p.id);
    }

    // 6. 更新遊戲狀態到 settle
    const { error: gameErr } = await supabase.from("games").update({ phase: "settle" }).eq("id", gameId);
    if (gameErr) return { success: false, error: "進入結算階段失敗: " + gameErr.message };

    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "未知伺服器錯誤" };
  }
}

// --- Helpers ---

function drawServerCard(slot: 1 | 2, round: number): GameCard {
  const suits: Suit[] = ["S", "C", "D", "H"];
  const suit = suits[Math.floor(Math.random() * 4)];
  const points = slot === 1 ? Math.floor(Math.random() * 4) + 1 : Math.floor(Math.random() * 3) + 6;
  return {
    id: `card_srv_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: `${slot === 2 ? "正解卡" : "錯題卡"} [${suit}] · ${points} 步`,
    points,
    effect: "",
    slot,
    round,
    suit,
    is_used: false
  };
}

function findNearestEscalator(currentPos: number) {
  const candidates = ESCALATORS.filter(([start]) => start > currentPos);
  if (candidates.length === 0) return null;
  return candidates.reduce((prev, curr) => (curr[0] - currentPos < prev[0] - currentPos ? curr : prev));
}

export async function respondToSkillCounter(actionId: string, useCounter: boolean) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: action, error: aErr } = await supabase
      .from("skill_actions")
      .select("*")
      .eq("id", actionId)
      .single();

    if (aErr || !action) return { success: false, error: "找不到行動" };

    const { data: target, error: pErr } = await supabase
      .from("players")
      .select("*")
      .eq("id", action.target_player_id)
      .single();

    if (pErr || !target) return { success: false, error: "找不到目標玩家" };

    if (useCounter) {
      const cards = target.cards as GameCard[];
      let consumedCount = 0;
      const updatedCards = cards.map(c => {
        if (!c.is_used && c.suit === 'D' && consumedCount < 2) {
          consumedCount++;
          return { ...c, is_used: true };
        }
        return c;
      });

      if (consumedCount < 2) return { success: false, error: "菱形不足" };

      await supabase.from("players").update({ cards: updatedCards }).eq("id", target.id);
      await supabase.from("skill_actions").update({ status: "cancelled" }).eq("id", actionId);
    } else {
      await supabase.from("skill_actions").update({ status: "ready" }).eq("id", actionId);
    }

    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "未知錯誤" };
  }
}
