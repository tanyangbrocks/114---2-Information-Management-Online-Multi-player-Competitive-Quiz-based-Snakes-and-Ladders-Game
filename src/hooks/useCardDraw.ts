import { useCallback } from "react";
import type { GameCard } from "@/types/game";

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

/**
 * 卡槽 1：答錯，1–4 點；卡槽 2：答對，6–8 點。效果欄位暫留空字串。
 */
export function useCardDraw() {
  const drawForSlot = useCallback((slot: 1 | 2, round: number): GameCard => {
    if (slot === 1) {
      const points = randomInt(1, 4);
      return {
        id: newId(),
        name: `錯題補強卡 · ${points} 點`,
        points,
        effect: "",
        slot: 1,
        round
      };
    }
    const points = randomInt(6, 8);
    return {
      id: newId(),
      name: `答對衝刺卡 · ${points} 點`,
      points,
      effect: "",
      slot: 2,
      round
    };
  }, []);

  return { drawForSlot };
}
