import { useCallback } from "react";
import type { GameCard, Suit } from "@/types/game";

function randomInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `card_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const SUITS: Suit[] = ["S", "C", "D", "H"];

/**
 * 卡槽 1：答錯，1–4 點；卡槽 2：答對，6–8 點。隨機賦予 S, C, D, H 四種花色之一。
 */
export function useCardDraw() {
  const drawForSlot = useCallback((slot: 1 | 2, round: number): GameCard => {
    const randomSuit = SUITS[randomInt(0, 3)];
    if (slot === 1) {
      const points = randomInt(1, 4);
      return {
        id: newId(),
        name: `錯題卡 [${randomSuit}] · ${points} 步`,
        points,
        effect: "",
        slot: 1,
        round,
        suit: randomSuit,
        is_used: false
      };
    }
    const points = randomInt(6, 8);
    return {
      id: newId(),
      name: `正解卡 [${randomSuit}] · ${points} 步`,
      points,
      effect: "",
      slot: 2,
      round,
      suit: randomSuit,
      is_used: false
    };
  }, []);

  return { drawForSlot };
}
