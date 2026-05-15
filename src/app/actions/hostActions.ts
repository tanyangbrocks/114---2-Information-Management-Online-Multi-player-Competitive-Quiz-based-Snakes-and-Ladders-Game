"use server";

import { createClient } from "@supabase/supabase-js";
import type { GameCard, Suit } from "@/types/game";


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function newId(): string {
  return `admin_card_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function giveCardsToPlayer(
  playerId: string,
  counts: Record<Suit, number>
) {
  try {
    // 1. 取得玩家現有卡片
    const { data: player, error: fetchErr } = await supabase
      .from("players")
      .select("cards, game_id")
      .eq("id", playerId)
      .single();

    if (fetchErr || !player) throw new Error("找不到玩家");

    const existingCards = (player.cards as GameCard[]) || [];
    const newBatch: GameCard[] = [];

    // 2. 根據數量產生新卡片
    (Object.entries(counts) as [Suit, number][]).forEach(([suit, count]) => {
      for (let i = 0; i < count; i++) {
        const points = randomInt(1, 8); // 管理員給予的卡片點數隨機 1-8
        newBatch.push({
          id: newId(),
          name: `管理員禮包 [${suit}] · ${points} 步`,
          points,
          effect: "Admin Gift",
          slot: 2,
          round: 0, // 0 表示非題目產生的卡片
          suit,
          is_used: false
        });
      }
    });

    const updatedCards = [...existingCards, ...newBatch];

    // 3. 更新資料庫
    const { error: updateErr } = await supabase
      .from("players")
      .update({ cards: updatedCards })
      .eq("id", playerId);

    if (updateErr) throw updateErr;

    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, error: e instanceof Error ? e.message : "給予卡片失敗" };
  }
}

const BOT_NAMES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", 
  "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", 
  "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", 
  "Yankee", "Zulu"
];

export async function addBotToGame(gameId: string) {
  try {
    const randomName = `${BOT_NAMES[randomInt(0, BOT_NAMES.length - 1)]}_Bot_${randomInt(100, 999)}`;
    const botName = `[Bot] ${randomName}`;

    const { error: insertErr } = await supabase
      .from("players")
      .insert({
        game_id: gameId,
        name: botName,
        position: 1,
        stars: 0,
        cards: [],
        answers: {},
        predicted_steps: 0,
        passive_modifiers: 0
      });

    if (insertErr) {
      console.error("Bot Insertion Error:", insertErr);
      throw new Error(`資料庫寫入失敗: ${insertErr.message}`);
    }

    return { success: true };
  } catch (e) {
    console.error("addBotToGame Catch:", e);
    return { success: false, error: e instanceof Error ? e.message : "新增機器人失敗" };
  }
}
