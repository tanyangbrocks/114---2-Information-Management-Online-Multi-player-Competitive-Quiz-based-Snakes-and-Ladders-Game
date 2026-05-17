import type { GameCard, SkillActionType, Suit, PlayerRow } from "@/types/game";
import { ESCALATORS } from "./boardEngine";

export type AvailableSkill = {
  actionType: SkillActionType;
  requiresTarget: boolean;
  costDescription: string;
  name: string;
  description: string;
  fromU3?: boolean;
};

// 取得玩家目前尚未被消耗的卡牌
export function getAvailableCards(cards: GameCard[]): GameCard[] {
  return cards.filter((c) => !c.is_used);
}

// 計算每種花色的數量
export function countSuits(cards: GameCard[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { S: 0, C: 0, D: 0, H: 0 };
  for (const card of cards) {
    if (counts[card.suit] !== undefined) {
      counts[card.suit]++;
    }
  }
  return counts;
}

// 判斷是否滿足消耗條件 (包含菱形轉化：發動需消耗 2 張以上卡片時，可將 1 張菱形當作任一花色)
export function canAfford(
  counts: Record<Suit, number>,
  costS: number,
  costC: number,
  costH: number,
  costD: number
): boolean {
  const neededS = Math.max(0, costS - counts.S);
  const neededC = Math.max(0, costC - counts.C);
  const neededH = Math.max(0, costH - counts.H);
  const neededD = Math.max(0, costD - counts.D);

  const totalCost = costS + costC + costH + costD;
  const missingSuits = neededS + neededC + neededH;

  // 如果根本不需要替代，且菱形也夠，就直接 true
  if (missingSuits === 0 && neededD === 0) return true;

  // 如果需要的總卡數 >= 2，且有多餘的菱形，可以使用 1 張菱形代替 1 張其他花色
  if (totalCost >= 2) {
    const availableDForSub = Math.max(0, counts.D - costD);
    if (availableDForSub >= 1 && missingSuits === 1) {
      return true; // 用 1 張菱形補足了缺的那張
    }
  }

  return false;
}

// U-1 (消耗 3 同花色)： 傳送至最近梯子（可用菱形轉化）
export function canAffordU1(counts: Record<Suit, number>): boolean {
  // S, C, H 任一種達到 3 張，或者 2張 + 1張菱形
  // D 達到 3 張也可以
  if (counts.S >= 3 || counts.C >= 3 || counts.H >= 3 || counts.D >= 3) return true;
  if (counts.D >= 1) {
    if (counts.S >= 2 || counts.C >= 2 || counts.H >= 2) return true;
  }
  return false;
}

// U-2 (消耗 4 種各一)： 指定一隊伍與自身調換位置（可用 2 菱形 + 2 不同花色配對）
export function canAffordU2(counts: Record<Suit, number>): boolean {
  if (counts.S >= 1 && counts.C >= 1 && counts.H >= 1 && counts.D >= 1) return true;
  
  const missingS = counts.S === 0 ? 1 : 0;
  const missingC = counts.C === 0 ? 1 : 0;
  const missingH = counts.H === 0 ? 1 : 0;
  const totalMissing = missingS + missingC + missingH;

  if (totalMissing <= 1) {
    const requiredD = 1 + totalMissing; 
    if (counts.D >= requiredD) return true;
  }
  return false;
}

export function findNearestEscalator(currentPos: number) {
  const candidates = ESCALATORS.filter(([start]) => start > currentPos);
  if (candidates.length === 0) return null;
  return candidates.reduce((prev, curr) => (curr[0] - currentPos < prev[0] - currentPos ? curr : prev));
}

export function calculateAvailableSkills(cards: GameCard[], otherPlayers: PlayerRow[] = [], currentPosition: number = 1): AvailableSkill[] {
  const availableCards = getAvailableCards(cards);
  const counts = countSuits(availableCards);
  const skills: AvailableSkill[] = [];
  const totalCards = availableCards.length;

  const hasOtherPlayers = otherPlayers.length > 0;
  const anyOtherPlayerHasCards = otherPlayers.some(p => p.cards.filter(c => !c.is_used).length > 0);

  // S-1: 常數項微分 (1S)
  if (canAfford(counts, 1, 0, 0, 0) && hasOtherPlayers && anyOtherPlayerHasCards) {
    skills.push({ 
      actionType: "S-1", 
      requiresTarget: true, 
      costDescription: "1S",
      name: "常數項微分",
      description: "指定一名玩家，隨機捨棄其一張尚未使用的手牌。"
    });
  }
  // S-2: 重修舊好 (2S)
  if (canAfford(counts, 2, 0, 0, 0)) {
    skills.push({ 
      actionType: "S-2", 
      requiresTarget: false, 
      costDescription: "2S",
      name: "重修舊好",
      description: "自由選擇一張牌（任意花色，1到8點），立刻將其點數加入本回合預計步數，不結束技能回合。"
    });
  }
  // C-1: 自我催眠 (1C)
  if (canAfford(counts, 0, 1, 0, 0)) {
    skills.push({ 
      actionType: "C-1", 
      requiresTarget: false, 
      costDescription: "1C",
      name: "自我催眠",
      description: "讓自己向前或向後移動 1 格。"
    });
  }
  // C-2: 精神干擾 (2C)
  if (canAfford(counts, 0, 2, 0, 0) && hasOtherPlayers) {
    skills.push({ 
      actionType: "C-2", 
      requiresTarget: true, 
      costDescription: "2C",
      name: "精神干擾",
      description: "指定一名其他玩家，使其向前或向後移動 1 格。"
    });
  }
  // H-1: 按下空格鍵即可開始遊戲 (1H)
  if (canAfford(counts, 0, 0, 1, 0)) {
    skills.push({
      actionType: "H-1",
      requiresTarget: false,
      costDescription: "1H",
      name: "按下空格鍵即可開始遊戲",
      description: "根據當前排名，額外移動對應格數（第 1 名 +1，第 2 名 +2...）。"
    });
  }
  // U-1: 遲到前的幻想 (3 同色)
  const nextLadder = findNearestEscalator(currentPosition);
  if (canAffordU1(counts) && nextLadder) {
    skills.push({ 
      actionType: "U-1", 
      requiresTarget: false, 
      costDescription: "3 同色",
      name: "遲到前的幻想",
      description: "自動傳送至距離自己最近的下一個梯子（向上爬）。"
    });
  }
  // U-2: 天手力 (4 異色)
  if (canAffordU2(counts) && hasOtherPlayers) {
    skills.push({ 
      actionType: "U-2", 
      requiresTarget: true, 
      costDescription: "4 異色",
      name: "天手力",
      description: "與指定的一名玩家互換棋盤上的位置。"
    });
  }
  // U-3: 梭哈是一種智慧 (全手牌)
  if (totalCards >= 3) {
    skills.push({ 
      actionType: "U-3", 
      requiresTarget: false, 
      costDescription: "全手牌",
      name: "梭哈是一種智慧",
      description: "消耗所有剩餘手牌（至少 3 張），隨機觸發一種強力的效果。"
    });
  }

  return skills;
}
