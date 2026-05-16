"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GameCard, Suit, SkillActionType, PlayerRow, SkillAction } from "@/types/game";
import { countSuits } from "@/lib/game/skillEngine";
import { ESCALATORS, moveBySteps } from "@/lib/game/boardEngine";

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
      .in("status", ["pending", "ready"]);

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
      return rankB - rankA; // 排名越靠後(索引越大)越先執行，排名越前(索引越小)越晚執行以產生蓋台效果
    });

    const action = sortedActions[0];
    const caster = players.find(p => p.id === action.player_id);
    const targetPlayer = action.target_player_id ? players.find(p => p.id === action.target_player_id) : null;

    // 3. 檢查是否有菱形反制機會 (針對型技能且對象有2張菱形)
    const attackSkills: SkillActionType[] = ["S-1", "D-1", "D-2", "C-2", "U-2", "U-3"];
    if (targetPlayer && attackSkills.includes(action.action_type)) {
      const diamonds = (targetPlayer.cards as GameCard[]).filter(c => !c.is_used && c.suit === "D");
      if (diamonds.length >= 2) {
        // 進入攔截階段，等待玩家回應
        await supabase.from("skill_actions").update({ status: "waiting_counter" }).eq("id", action.id);
        return { done: false, intercepting: true };
      }
    }

    // 4. 無反制或不符反制條件，直接執行
    await executeSkillEffect(supabase, action, players, round);
    await supabase.from("skill_actions").update({ status: "resolved" }).eq("id", action.id);

    // 5. 更新發動者的預計步數 (S/C 牌消耗後重算)
    if (caster) {
      const { data: updatedCaster } = await supabase.from("players").select("cards").eq("id", caster.id).single();
      if (updatedCaster) {
        const cards = updatedCaster.cards as GameCard[];
        const activeCards = cards.filter(c => !c.is_used);
        const suits = countSuits(activeCards);
        // 累加本回合所有未消耗的卡片 (支援 S-2 多牌疊加)
        const roundCards = cards.filter(c => c.round === round && !c.is_used);
        const basePoints = roundCards.reduce((acc, c) => acc + c.points, 0);
        const newPredicted = Math.max(0, basePoints + suits.S - suits.C);
        await supabase.from("players").update({ predicted_steps: newPredicted }).eq("id", caster.id);
      }
    }

    return { done: false };
  } catch (e) {
    console.error(e);
    return { error: true };
  }
}

async function executeSkillEffect(supabase: SupabaseClient, action: SkillAction, players: PlayerRow[], round: number) {
  const player = players.find(p => p.id === action.player_id);
  const target = players.find(p => p.id === action.target_player_id);
  if (!player) return;

  const getRank = (pid: string) => {
    const sorted = [...players].sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return b.position - a.position;
    });
    return sorted.findIndex(p => p.id === pid) + 1;
  };

  if (action.action_type === "S-1" && target) {
    const tCards = target.cards as GameCard[];
    const available = tCards.filter(c => !c.is_used);
    if (available.length > 0) {
      const dropId = available[Math.floor(Math.random() * available.length)].id;
      const updatedCards = tCards.map(c => c.id === dropId ? { ...c, is_used: true } : c);
      await supabase.from("players").update({ cards: updatedCards }).eq("id", target.id);
    }
  }

  if (action.action_type === "S-2") {
    // S-2 現在是瞬發技能，由玩家在客戶端(skills.ts)發動時直接更新卡牌並設為 resolved
    // 伺服器仲裁階段不需要再重複執行抽牌邏輯
  }

  if (action.action_type === "C-1") {
    const dir = (action.metadata?.direction as number) || 1;
    const nextPos = Math.max(1, Math.min(100, player.position + dir));
    await supabase.from("players").update({ position: nextPos }).eq("id", player.id);
  }

  if (action.action_type === "C-2" && target) {
    const dir = (action.metadata?.direction as number) || -1;
    const nextPos = Math.max(1, Math.min(100, target.position + dir));
    await supabase.from("players").update({ position: nextPos }).eq("id", target.id);
  }

  if (action.action_type === "H-1") {
    const r = getRank(player.id) || 1;
    const nextPos = Math.min(100, player.position + r);
    await supabase.from("players").update({ position: nextPos }).eq("id", player.id);
  }

  if (action.action_type === "U-1") {
    const nextLadder = findNearestEscalator(player.position);
    if (nextLadder) {
      await supabase.from("players").update({ position: nextLadder[1] }).eq("id", player.id);
    }
  }

  if (action.action_type === "U-2" && target) {
    await supabase.from("players").update({ position: target.position }).eq("id", player.id);
    await supabase.from("players").update({ position: player.position }).eq("id", target.id);
  }

  if (action.action_type === "U-3") {
    const effects: SkillActionType[] = ["S-1", "S-2", "C-1", "H-1", "U-1"];
    const randomEffect = effects[Math.floor(Math.random() * effects.length)];

    if (randomEffect === "S-1") {
      const otherPlayers = players.filter(p => p.id !== player.id);
      const actualTarget = target || (otherPlayers.length > 0 ? otherPlayers[Math.floor(Math.random() * otherPlayers.length)] : null);
      if (actualTarget) {
        const tCards = actualTarget.cards as GameCard[];
        const available = tCards.filter(c => !c.is_used);
        if (available.length > 0) {
          const dropId = available[Math.floor(Math.random() * available.length)].id;
          const updatedCards = tCards.map(c => c.id === dropId ? { ...c, is_used: true } : c);
          await supabase.from("players").update({ cards: updatedCards }).eq("id", actualTarget.id);
        }
      }
    } else if (randomEffect === "S-2") {
      // U-3 抽到 S-2：設為 waiting_choice，讓玩家端彈出選牌視窗
      await supabase.from("skill_actions").update({
        status: "waiting_choice",
        metadata: { ...action.metadata, triggered_s2: true, random_effect: "S-2" }
      }).eq("id", action.id);
    } else if (randomEffect === "C-1") {
      const nextPos = Math.min(100, player.position + 3);
      await supabase.from("players").update({ position: nextPos }).eq("id", player.id);
    } else if (randomEffect === "H-1") {
      const nextPos = Math.min(100, player.position + 10);
      await supabase.from("players").update({ position: nextPos }).eq("id", player.id);
    } else if (randomEffect === "U-1") {
      const nextLadder = findNearestEscalator(player.position);
      if (nextLadder) {
        await supabase.from("players").update({ position: nextLadder[1] }).eq("id", player.id);
      }
    }
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
        const dir = Number(action.metadata?.direction ?? 1);
        caster.position = Math.max(1, Math.min(100, caster.position + dir));
      }
      // C-2: 指定目標前進或後退
      if (action.action_type === "C-2" && target) {
        const dir = Number(action.metadata?.direction ?? -1);
        target.position = Math.max(1, Math.min(100, target.position + dir));
      }
      // H-1: 自由前進
      if (action.action_type === "H-1") {
        const r = rankMap.get(caster.id) || 1;
        caster.position = Math.min(100, caster.position + r);
      }
      // S-2: 由玩家端瞬發，批次仲裁中如出現應已是 resolved，直接略過
      // (已消耗卡片在 castSkill 中處理，不在此重複執行)
      if (action.action_type === "S-2") {
        // no-op: resolved S-2 handled client-side
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
      // U-3: 梭哈是一種智慧
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
          // U-3 抽到 S-2：不直接執行，設為 waiting_choice 使玩家選牌
          await supabase.from("skill_actions").update({
            status: "waiting_choice",
            metadata: { ...action.metadata, triggered_s2: true, random_effect: "S-2" }
          }).eq("id", action.id);
          // 跳過此動作的 resolved 更新
          continue;
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

    // 5. 執行基礎移動結算 (根據本回合卡牌點數 + 被動修飾重新計算，避免 predicted_steps 不準)
    for (const p of Array.from(playerMap.values())) {
      // 重新從當前卡牌狀態計算，確保精確性
      const pCards = p.cards as GameCard[];
      const roundCards = pCards.filter((c: GameCard) => c.round === round && !c.is_used);
      const activeCards = pCards.filter((c: GameCard) => !c.is_used);
      const suits = countSuits(activeCards);
      const basePoints = roundCards.reduce((acc, c) => acc + c.points, 0);
      const steps = Math.max(0, basePoints + suits.S - suits.C);

      if (steps > 0 || p.position === 100) {
        // 檢查玩家是否有紅心牌 (保命牌)
        const heartCard = pCards.find((c: GameCard) => !c.is_used && c.suit === "H");
        const hasHeart = !!heartCard;

        // 執行移動 (傳入 ignoreEel 為 hasHeart)
        const { position: nextPos, starsGained, usedIgnoreEel } = moveBySteps(p.position, steps, {
          ignoreEel: hasHeart
        });

        // 如果移動過程中真的觸發了保命 (遇到了電鰻但被忽略)，則消耗那張紅心牌
        if (usedIgnoreEel && heartCard) {
          (heartCard as GameCard).is_used = true;
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

  const suitNames: Record<Suit, string> = {
    S: "何老師的貓",
    C: "邱老師的板書",
    D: "黃老師的水",
    H: "師大的網路結界"
  };
  const suitName = suitNames[suit];

  return {
    id: `card_srv_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: `${suitName} · ${points} 步`,
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
